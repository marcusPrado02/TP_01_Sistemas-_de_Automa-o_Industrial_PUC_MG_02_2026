// Junta planta, malhas e SIS. Não conhece o DOM — a interface só lê `snapshot()` e chama os comandos.

import { INTERLOCKS, LOOPS, NORMAL_VALUES, SCENARIOS, TRANSMITTERS } from './config.js';
import { Pid } from './pid.js';
import { createPlant, stepPlant } from './plant.js';
import { Bms, STATE, evaluateCauses, permissives } from './sis.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const NOISE = { level: 0.25, feed: 0.4, steam: 0.4, pressure: 0.15, temp: 0.6, gas: 0.3, air: 0.4, o2: 0.05, furnaceP: 0.08, gasP: 0.02 };
const TREND_KEYS = ['level', 'pressure', 'temp'];
const TREND_PERIOD = 0.5;   // s entre amostras
const TREND_SPAN = 120;     // s exibidos

export class Simulator {
  constructor({ noise = true, purgeSeconds, random = Math.random, clock = () => new Date() } = {}) {
    this.noise = noise;
    this.random = random;
    this.clock = clock;
    this.source = 'dynamic';
    this.plant = createPlant();
    this.manual = { ...NORMAL_VALUES, be223: false };
    this.faults = {};
    this.hs226 = false;
    this.scenario = '0';
    this.pids = Object.fromEntries(Object.entries(LOOPS).map(([id, l]) => [id, new Pid(l)]));
    this.bms = new Bms(purgeSeconds ? { purgeSeconds } : {});
    this.causes = Object.fromEntries(INTERLOCKS.map((il) => [il.tag, false]));
    this.actuators = { lv: 60, fv: 60, tv: 18, damper: 72, pilot: true, pumpOn: true, load: 60 };
    this.meas = { ...NORMAL_VALUES };
    this.time = 0;
    this.log = [];
    this.trend = { t: [], ...Object.fromEntries(TREND_KEYS.map((k) => [k, []])) };
    this.nextTrend = 0;
    this.listeners = new Set();
    this.addEvent('info', 'SIM', 'Simulador iniciado — caldeira em operação normal');
  }

  // ---------- laço principal ----------

  step(dt) {
    this.time += dt;
    const manual = this.source === 'manual';
    this.meas = manual ? this.sliderMeasurements() : this.noisyMeasurements();

    const flameExpected = this.bms.state === STATE.RUN || (this.bms.state === STATE.START && this.bms.elapsed > 1);
    const be223 = manual ? this.manual.be223 : flameExpected && !this.plant.flame;
    const previous = this.causes;
    this.causes = evaluateCauses({ ...this.meas, be223, hs226: this.hs226 }, previous);
    for (const il of INTERLOCKS) {
      if (this.causes[il.tag] && !previous[il.tag]) this.addEvent(il.mft ? 'trip' : 'alarm', il.tag, `${il.event} (${il.limit})`);
      if (!this.causes[il.tag] && previous[il.tag]) this.addEvent('ok', il.tag, `${il.event} — normalizado`);
    }

    for (const ev of this.bms.update(dt, this.causes)) {
      this.addEvent(ev.level, ev.tag, ev.text);
      if (ev.level === 'trip') this.markFirstOut(this.bms.firstOut);
    }
    this.runControl(dt, manual);

    if (!manual) this.plant = stepPlant(this.plant, this.actuators, this.faults, dt);
    this.sampleTrend();
  }

  runControl(dt, manual) {
    const { lic, pic, tic } = this.pids;
    const out = this.bms.outputs();
    const integrate = !manual;

    const licOut = lic.update(this.meas.level, dt, { integrate });
    const lshh = this.causes['LSHH-227'];
    const lv = lshh ? 0 : this.faults.lvStuck ? 100 : licOut;

    let fv = 0;
    if (out.fuelAllowed) {
      const picOut = this.faults.picStuck ? 100 : pic.update(this.meas.pressure, dt, { integrate });
      fv = Math.min(picOut, out.fuelLimit);
    } else if (pic.mode === 'AUTO') {
      pic.track(0, this.meas.pressure);   // SIS manda: FV-206 fechada, PIC acompanha sem windup
    }

    const tv = tic.update(this.meas.temp, dt, { integrate });

    // Relação ar/gás: damper segue o gás com ~17 % de excesso de ar; purga abre tudo.
    let damper;
    if (out.purge) damper = 100;
    else if (this.bms.state === STATE.RUN || this.bms.state === STATE.START) damper = clamp(this.meas.gas * 1.17 + 2, 20, 100);
    else damper = 30;

    // Turbina acompanha a caldeira: sem queima, a válvula de admissão fecha e a demanda de vapor cai.
    // Na volta à operação a carga sobe em rampa (~4 %/s) para não afundar a pressão.
    const loadTarget = this.bms.state === STATE.RUN ? 60 : this.bms.state === STATE.START ? 30 : 8;
    const prevLoad = this.actuators.load;
    const load = loadTarget < prevLoad ? loadTarget : Math.min(loadTarget, prevLoad + 4 * dt);

    this.actuators = { lv, fv, tv, damper, pilot: out.pilot, pumpOn: true, load };
  }

  noisyMeasurements() {
    const m = {};
    for (const t of TRANSMITTERS) {
      const n = this.noise ? (this.random() * 2 - 1) * NOISE[t.key] : 0;
      m[t.key] = clamp(this.plant[t.key] + n, t.min, t.max);
    }
    return m;
  }

  sliderMeasurements() {
    return Object.fromEntries(TRANSMITTERS.map((t) => [t.key, this.manual[t.key]]));
  }

  sampleTrend() {
    if (this.time < this.nextTrend) return;
    this.nextTrend = this.time + TREND_PERIOD;
    this.trend.t.push(this.time);
    for (const k of TREND_KEYS) this.trend[k].push(this.meas[k]);
    const max = TREND_SPAN / TREND_PERIOD;
    if (this.trend.t.length > max) for (const k of ['t', ...TREND_KEYS]) this.trend[k].shift();
  }

  // ---------- comandos do operador ----------

  applyScenario(id) {
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!sc) return;
    if (id === 'E') return this.toggleEmergency();
    this.scenario = id;
    this.faults = { ...sc.faults };
    if (id === '0') this.hs226 = false;
    if (this.source === 'manual') {
      this.manual = { ...NORMAL_VALUES, be223: false, ...sc.manual };
      if (id === '0') this.manual.be223 = false;
    }
    this.addEvent('info', 'CENÁRIO', `${sc.name} — ${sc.hint}`);
    this.emit();
  }

  toggleEmergency() {
    this.hs226 = !this.hs226;
    this.addEvent('info', 'HS-226', this.hs226 ? 'Botão de emergência pressionado' : 'Botão de emergência liberado');
    this.emit();
  }

  requestStart() {
    const res = this.bms.requestStart(this.permissives());
    if (res.ok) {
      for (const p of Object.values(this.pids)) p.setMode('AUTO');
      this.pids.pic.integral = 0;   // descarta o rastreio de FV-206 fechada; a rampa da partida limita a abertura
      this.addEvent('ok', 'BMS', 'RESET aceito — partida: piloto aceso, FV-206 em rampa');
    } else {
      this.addEvent('alarm', 'BMS', `Partida negada: ${res.reasons.join('; ')}`);
    }
    this.emit();
    return res;
  }

  permissives() {
    return permissives(this.bms, this.causes, this.meas);
  }

  setSource(source) {
    if (source === this.source) return;
    if (source === 'manual') {
      this.manual = { ...this.sliderFrom(this.plant), be223: false };
    } else {
      this.plant = createPlant(this.manual);
      this.plant.flame = this.bms.outputs().pilot && !this.manual.be223;
      this.plant.heat = this.plant.flame ? this.manual.gas : 0;
    }
    this.source = source;
    this.addEvent('info', 'SIM', source === 'manual' ? 'Entrada manual por sliders' : 'Simulação dinâmica');
    this.emit();
  }

  sliderFrom(values) {
    return Object.fromEntries(TRANSMITTERS.map((t) => [t.key, Math.round(values[t.key] / t.step) * t.step]));
  }

  setManualValue(key, value) {
    this.manual[key] = value;
  }

  setLoopMode(id, mode) {
    this.pids[id].setMode(mode);
    this.addEvent('info', LOOPS[id].tag, `Modo ${mode}`);
  }

  setSetpoint(id, sp) {
    this.pids[id].sp = sp;
  }

  setManualOutput(id, out) {
    this.pids[id].out = clamp(out, 0, 100);
  }

  acknowledgeAll() {
    for (const e of this.log) e.acked = true;
    this.emit();
  }

  // ---------- registro ----------

  addEvent(level, tag, text) {
    this.eventSeq = (this.eventSeq ?? 0) + 1;
    this.log.unshift({ id: this.eventSeq, time: this.clock(), level, tag, text, acked: level === 'info' || level === 'ok', firstOut: false });
    if (this.log.length > 200) this.log.pop();
  }

  markFirstOut(tag) {
    const entry = this.log.find((e) => e.tag === tag && e.level === 'trip');
    if (entry) entry.firstOut = true;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }
}
