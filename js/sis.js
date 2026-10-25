// SIS / BMS: avaliação dos intertravamentos e máquina de estados do Master Fuel Trip.

import { INTERLOCKS, PERMISSIVE_RANGES, TIMING } from './config.js';

export const STATE = {
  RUN: 'OPERANDO',
  TRIP: 'TRIP',
  PURGE: 'PURGA',
  READY: 'PRONTO',
  START: 'PARTIDA',
};

// Passos do slide 13, na ordem em que acendem.
export const TRIP_STEPS = ['Detecta', 'Dispara o MFT', 'Fecha a FV-206', 'Apaga o piloto', 'Purga'];

export function evaluateSwitch(il, inputs, wasActive = false) {
  if (il.kind === 'digital') return Boolean(inputs[il.key]);
  const v = inputs[il.key];
  const band = wasActive ? il.hysteresis ?? 0 : 0;
  return il.kind === 'lt' ? v < il.value + band : v > il.value - band;
}

export function evaluateCauses(inputs, previous = {}) {
  const causes = {};
  for (const il of INTERLOCKS) causes[il.tag] = evaluateSwitch(il, inputs, previous[il.tag]);
  return causes;
}

export const mftCauses = (causes) => INTERLOCKS.filter((il) => il.mft && causes[il.tag]).map((il) => il.tag);

export function permissives(bms, causes, meas) {
  const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
  return [
    { id: 'causes', label: 'Sem causa de trip ativa', ok: mftCauses(causes).length === 0 },
    { id: 'purge',  label: 'Purga concluída',         ok: bms.state === STATE.READY || bms.state === STATE.RUN },
    { id: 'hs',     label: 'HS-226 liberado',          ok: !causes['HS-226'] },
    { id: 'level',  label: 'Nível 30–70 %',            ok: inRange(meas.level, PERMISSIVE_RANGES.level) },
    { id: 'gas',    label: 'PT-211 1,5–6,5 bar',       ok: inRange(meas.gasP, PERMISSIVE_RANGES.gasP) },
  ];
}

export class Bms {
  constructor({ stepInterval = TIMING.stepInterval, purgeSeconds = TIMING.purgeSeconds, startRamp = TIMING.startRamp } = {}) {
    Object.assign(this, { stepInterval, purgeSeconds, startRamp });
    this.state = STATE.RUN;
    this.elapsed = 0;          // tempo no estado atual
    this.firstOut = null;      // primeira causa que derrubou a caldeira
    this.tripCauses = [];      // todas as causas vistas desde o trip
  }

  // Passo da sequência de trip já executado (1..5); 0 em operação.
  get step() {
    if (this.state === STATE.TRIP) return Math.min(4, 1 + Math.floor(this.elapsed / this.stepInterval));
    if (this.state === STATE.PURGE || this.state === STATE.READY) return 5;
    return 0;
  }

  get purgeLeft() {
    if (this.state === STATE.PURGE) return Math.max(0, this.purgeSeconds - this.elapsed);
    return this.state === STATE.READY ? 0 : this.purgeSeconds;
  }

  get tripped() {
    return this.state === STATE.TRIP || this.state === STATE.PURGE || this.state === STATE.READY;
  }

  // Saídas para os atuadores. Os efeitos seguem os passos para a turma ver a ordem do slide 13.
  outputs() {
    const s = this.state;
    const step = this.step;
    return {
      fuelAllowed: s === STATE.RUN || s === STATE.START || (s === STATE.TRIP && step < 3),
      fuelLimit: s === STATE.START ? Math.min(100, (this.elapsed / this.startRamp) * 100) : 100,
      pilot: s === STATE.RUN || s === STATE.START || (s === STATE.TRIP && step < 4),
      purge: s === STATE.PURGE,
      alarm: this.tripped,
    };
  }

  // Avança a máquina de estados; devolve eventos para o registro.
  update(dt, causes) {
    const events = [];
    const active = mftCauses(causes);
    this.elapsed += dt;

    if ((this.state === STATE.RUN || this.state === STATE.START) && active.length) {
      this.enter(STATE.TRIP);
      this.firstOut = active[0];
      this.tripCauses = [...active];
      events.push({ level: 'trip', tag: 'MFT', text: `Master Fuel Trip — primeira causa ${this.firstOut}` });
      return events;
    }

    if (this.tripped) {
      for (const tag of active) if (!this.tripCauses.includes(tag)) this.tripCauses.push(tag);
    }

    if (this.state === STATE.TRIP && this.elapsed >= this.stepInterval * 4) {
      this.enter(STATE.PURGE);
      events.push({ level: 'info', tag: 'BMS', text: `Purga iniciada (${this.purgeSeconds} s, damper 100 %)` });
    } else if (this.state === STATE.PURGE && this.elapsed >= this.purgeSeconds) {
      this.enter(STATE.READY);
      events.push({ level: 'ok', tag: 'BMS', text: 'Purga concluída — aguardando permissivos e RESET' });
    } else if (this.state === STATE.START && this.elapsed >= this.startRamp) {
      this.enter(STATE.RUN);
      events.push({ level: 'ok', tag: 'BMS', text: 'Caldeira em operação' });
    }
    return events;
  }

  // RESET / partida: só sai de PRONTO com todos os permissivos atendidos.
  requestStart(perms) {
    if (this.state !== STATE.READY) {
      const why = this.state === STATE.PURGE ? 'purga em andamento' : this.state === STATE.TRIP ? 'trip em andamento' : 'caldeira já em operação';
      return { ok: false, reasons: [why] };
    }
    const missing = perms.filter((p) => !p.ok).map((p) => p.label);
    if (missing.length) return { ok: false, reasons: missing };
    this.enter(STATE.START);
    this.firstOut = null;
    this.tripCauses = [];
    return { ok: true, reasons: [] };
  }

  enter(state) {
    this.state = state;
    this.elapsed = 0;
  }
}
