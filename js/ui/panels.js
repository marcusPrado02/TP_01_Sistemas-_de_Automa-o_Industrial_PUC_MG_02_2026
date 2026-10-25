// Painéis da IHM. Cada painel monta o DOM uma vez e depois só atualiza texto e classes,
// para que cliques não se percam entre um quadro e outro.

import { EFFECTS, INTERLOCKS, LOOPS, SCENARIOS, TRANSMITTERS } from '../config.js';
import { STATE, TRIP_STEPS } from '../sis.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

const fmtTime = (d) => d.toLocaleTimeString('pt-BR', { hour12: false });

// ---------- cenários ----------

export class ScenarioPanel {
  constructor(container, sim, { compact = false } = {}) {
    this.sim = sim;
    this.buttons = SCENARIOS.map((sc) => {
      const btn = el('button', { class: `scenario ${sc.id === 'E' ? 'emergency' : ''} ${sc.id === '0' ? 'normal' : ''}`, title: sc.hint, onclick: () => sim.applyScenario(sc.id) },
        el('span', { class: 'kbd' }, sc.key.toUpperCase()),
        el('span', { class: 'sc-name' }, sc.name),
        compact ? null : el('span', { class: 'sc-hint' }, sc.hint));
      container.append(btn);
      return [sc.id, btn];
    });
    if (compact) {
      this.reset = el('button', { class: 'scenario reset', onclick: () => sim.requestStart() }, el('span', { class: 'kbd' }, 'R'), el('span', { class: 'sc-name' }, 'RESET / partida'));
      container.append(this.reset);
    }
  }

  update() {
    for (const [id, btn] of this.buttons) {
      btn.classList.toggle('active', id === 'E' ? this.sim.hs226 : id === this.sim.scenario && id !== '0');
    }
  }
}

// ---------- faceplates ----------

export class Faceplates {
  constructor(container, sim) {
    this.sim = sim;
    this.items = Object.entries(LOOPS).map(([id, loop]) => {
      const pid = sim.pids[id];
      const t = TRANSMITTERS.find((x) => x.key === loop.pv);
      const modeBtn = el('button', { class: 'mode', onclick: () => sim.setLoopMode(id, pid.mode === 'AUTO' ? 'MAN' : 'AUTO') }, 'AUTO');
      const pv = el('b', { class: 'fp-pv' }, '--');
      const spInput = el('input', { type: 'number', step: t.step, min: t.min, max: t.max, value: loop.sp, 'aria-label': `Setpoint ${loop.tag}` });
      spInput.addEventListener('change', () => sim.setSetpoint(id, Number(spInput.value)));
      const mv = el('input', { type: 'range', min: 0, max: 100, step: 1, value: pid.out, 'aria-label': `Saída ${loop.tag}` });
      mv.addEventListener('input', () => sim.setManualOutput(id, Number(mv.value)));
      const mvText = el('span', { class: 'fp-mv' }, '--');
      const bar = el('div', { class: 'fp-bar' }, el('i', { class: 'fp-fill' }), el('i', { class: 'fp-sp' }));
      const node = el('div', { class: 'faceplate' },
        el('header', {}, el('strong', {}, loop.tag), el('span', {}, loop.title), modeBtn),
        el('div', { class: 'fp-row' }, el('label', {}, 'PV'), pv, el('small', {}, `${t.tag}`)),
        bar,
        el('div', { class: 'fp-row' }, el('label', {}, 'SP'), spInput, el('small', {}, loop.unit)),
        el('div', { class: 'fp-row' }, el('label', {}, 'MV'), mv, mvText),
        el('small', { class: 'fp-valve' }, `→ ${loop.valve}${id === 'tic' ? ' (spray / atemperação)' : ''}`));
      container.append(node);
      return { id, loop, t, pid, node, modeBtn, pv, spInput, mv, mvText, bar };
    });
  }

  update() {
    const valveOut = { lic: this.sim.actuators.lv, pic: this.sim.actuators.fv, tic: this.sim.actuators.tv };
    for (const it of this.items) {
      const v = this.sim.meas[it.loop.pv];
      it.pv.textContent = `${v.toFixed(it.t.digits)} ${it.t.unit}`;
      it.modeBtn.textContent = it.pid.mode;
      it.modeBtn.classList.toggle('man', it.pid.mode === 'MAN');
      it.node.classList.toggle('man', it.pid.mode === 'MAN');
      const span = it.t.max - it.t.min;
      it.bar.style.setProperty('--pv', ((v - it.t.min) / span).toFixed(3));
      it.bar.style.setProperty('--sp', ((it.pid.sp - it.t.min) / span).toFixed(3));
      if (document.activeElement !== it.spInput) it.spInput.value = it.pid.sp;
      const out = valveOut[it.id];
      it.mvText.textContent = `${out.toFixed(0)} %`;
      it.mv.disabled = it.pid.mode !== 'MAN';
      if (document.activeElement !== it.mv) it.mv.value = it.pid.mode === 'MAN' ? it.pid.out : out;
      // Quando o SIS manda na válvula, o faceplate mostra a prioridade da segurança.
      const forced = (it.id === 'pic' && !this.sim.bms.outputs().fuelAllowed) || (it.id === 'lic' && this.sim.causes['LSHH-227']);
      it.node.classList.toggle('forced', forced);
    }
  }
}

// ---------- entrada manual ----------

export class SliderPanel {
  constructor(container, sim) {
    this.sim = sim;
    this.rows = TRANSMITTERS.map((t) => {
      const input = el('input', { type: 'range', min: t.min, max: t.max, step: t.step, value: sim.manual[t.key], 'aria-label': t.label });
      const out = el('output', {}, '--');
      input.addEventListener('input', () => sim.setManualValue(t.key, Number(input.value)));
      container.append(el('label', { class: 'slider-row', title: t.label }, el('span', { class: 'tag' }, t.tag), el('span', { class: 'sl-label' }, t.label), out, input));
      return { t, input, out };
    });
    this.be = el('input', { type: 'checkbox' });
    this.be.addEventListener('change', () => { sim.manual.be223 = this.be.checked; });
    this.hs = el('input', { type: 'checkbox' });
    this.hs.addEventListener('change', () => { if (this.hs.checked !== sim.hs226) sim.toggleEmergency(); });
    container.append(
      el('label', { class: 'check-row' }, this.be, el('span', { class: 'tag' }, 'BE-223'), ' Falha de chama'),
      el('label', { class: 'check-row' }, this.hs, el('span', { class: 'tag' }, 'HS-226'), ' Botão de emergência'),
    );
  }

  update() {
    if (this.sim.source !== 'manual') return;
    for (const r of this.rows) {
      const v = this.sim.manual[r.t.key];
      if (document.activeElement !== r.input) r.input.value = v;
      r.out.textContent = `${Number(v).toFixed(r.t.digits)} ${r.t.unit}`;
    }
    this.be.checked = this.sim.manual.be223;
    this.hs.checked = this.sim.hs226;
  }
}

// ---------- faixa / painel do SIS ----------

const STATE_TEXT = {
  [STATE.RUN]: 'OPERANDO',
  [STATE.TRIP]: 'TRIP — MFT',
  [STATE.PURGE]: 'PURGA',
  [STATE.READY]: 'AGUARDANDO RESET',
  [STATE.START]: 'PARTIDA',
};

export class SisView {
  constructor(container, sim, { big = false } = {}) {
    this.sim = sim;
    this.container = container;
    container.classList.add('sis-view');
    if (big) container.classList.add('big');
    this.state = el('div', { class: 'sis-state' }, el('small', {}, 'SIS / BMS'), el('b', {}, 'OPERANDO'));
    this.steps = TRIP_STEPS.map((name, i) => el('li', {}, el('span', { class: 'n' }, String(i + 1)), el('span', {}, name)));
    this.cause = el('div', { class: 'sis-cause' }, el('small', {}, 'Primeira causa (first-out)'), el('b', {}, '—'), el('span', {}, ''));
    this.purgeBar = el('i');
    this.purgeText = el('b', {}, '--');
    this.purge = el('div', { class: 'sis-purge' }, el('small', {}, 'Purga'), this.purgeText, el('div', { class: 'purge-track' }, this.purgeBar));
    this.perms = el('ul', { class: 'perms' });
    this.resetBtn = el('button', { class: 'reset-btn', onclick: () => sim.requestStart() }, 'RESET / PARTIDA ', el('span', { class: 'kbd' }, 'R'));
    container.append(
      this.state,
      el('ol', { class: 'trip-steps' }, this.steps),
      this.cause,
      this.purge,
      el('div', { class: 'sis-perms' }, el('small', {}, 'Permissivos de partida'), this.perms),
      this.resetBtn,
    );
  }

  update() {
    const { bms } = this.sim;
    const s = bms.state;
    this.container.dataset.state = s;
    this.state.querySelector('b').textContent = STATE_TEXT[s];
    this.steps.forEach((li, i) => {
      li.classList.toggle('done', bms.step > i);
      li.classList.toggle('current', bms.step === i + 1 && s === STATE.TRIP);
    });

    const [, title, detail] = this.cause.children;
    const fo = INTERLOCKS.find((il) => il.tag === bms.firstOut);
    title.textContent = fo ? fo.tag : this.sim.causes['LSHH-227'] ? 'LSHH-227 (alarme)' : '—';
    detail.textContent = fo ? `${fo.event} · ${fo.limit}` : this.sim.causes['LSHH-227'] ? 'Nível muito alto — LV-201 fechada' : 'Nenhuma causa ativa';
    this.cause.classList.toggle('alarm-only', !fo && this.sim.causes['LSHH-227']);

    const left = bms.purgeLeft;
    this.purgeText.textContent = s === STATE.PURGE ? `${left.toFixed(0)} s` : s === STATE.READY ? 'concluída' : s === STATE.TRIP ? 'em espera' : '—';
    this.purgeBar.style.width = `${s === STATE.PURGE ? (1 - left / bms.purgeSeconds) * 100 : s === STATE.READY ? 100 : 0}%`;

    const perms = this.sim.permissives();
    if (this.perms.children.length !== perms.length) this.perms.replaceChildren(...perms.map(() => el('li')));
    perms.forEach((p, i) => {
      const li = this.perms.children[i];
      li.textContent = p.label;
      li.classList.toggle('ok', p.ok);
    });
    const ready = s === STATE.READY && perms.every((p) => p.ok);
    this.resetBtn.disabled = s !== STATE.READY;
    this.resetBtn.classList.toggle('ready', ready);
  }
}

// ---------- matriz causa × efeito ----------

export class MatrixPanel {
  constructor(container, sim) {
    this.sim = sim;
    const head = el('tr', {}, el('th', {}, 'Tag'), el('th', {}, 'Evento'), el('th', {}, 'Limite'), EFFECTS.map((e) => el('th', { class: 'eff' }, el('span', {}, e.label))));
    this.rows = INTERLOCKS.map((il) => {
      const cells = EFFECTS.map((e) => el('td', { class: `eff ${il.effects.includes(e.id) ? 'x' : ''}` }, il.effects.includes(e.id) ? '●' : ''));
      const tr = el('tr', {}, el('th', { scope: 'row' }, il.tag), el('td', {}, il.event), el('td', { class: 'lim' }, il.limit), cells);
      return { il, tr, cells };
    });
    this.effectHead = [...head.querySelectorAll('th.eff')];
    container.append(
      el('h2', {}, 'Matriz de causa e efeito ', el('small', {}, 'ao vivo')),
      el('table', { class: 'matrix' }, el('thead', {}, head), el('tbody', {}, this.rows.map((r) => r.tr))),
      el('p', { class: 'legend' }, el('span', { class: 'dot live' }), ' causa ativa  ', el('span', { class: 'dot latched' }), ' causa que derrubou (travada no MFT)'),
    );
  }

  update() {
    const { causes, bms } = this.sim;
    const liveEffects = new Set();
    for (const r of this.rows) {
      const live = causes[r.il.tag];
      const latched = bms.tripped && bms.tripCauses.includes(r.il.tag);
      r.tr.classList.toggle('live', live);
      r.tr.classList.toggle('latched', latched && !live);
      r.tr.classList.toggle('first-out', bms.firstOut === r.il.tag);
      if (live || latched) for (const e of r.il.effects) liveEffects.add(e);
    }
    EFFECTS.forEach((e, i) => this.effectHead[i].classList.toggle('on', liveEffects.has(e.id)));
  }
}

// ---------- tendências ----------

const TRENDS = [
  { key: 'level',    label: 'LT-201 nível (%)',     min: 0,   max: 100, loop: 'lic', limits: [15, 85] },
  { key: 'pressure', label: 'PT-204 pressão (bar)', min: 0,   max: 100, loop: 'pic', limits: [75] },
  { key: 'temp',     label: 'TT-205 temp. (°C)',    min: 100, max: 600, loop: 'tic', limits: [] },
];

export class TrendChart {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.sim = sim;
    this.ctx = canvas.getContext('2d');
  }

  update() {
    const { canvas, ctx, sim } = this;
    const css = getComputedStyle(document.body);
    const color = (name) => css.getPropertyValue(name).trim();
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const lane = H / TRENDS.length;
    const ts = sim.trend.t;
    const tEnd = sim.time;
    const tStart = tEnd - 120;
    TRENDS.forEach((tr, i) => {
      const top = i * lane + 22;
      const h = lane - 34;
      const y = (v) => top + h - ((v - tr.min) / (tr.max - tr.min)) * h;
      const x = (t) => 40 + ((t - tStart) / 120) * (W - 50);
      ctx.fillStyle = color('--muted');
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(tr.label, 40, top - 6);
      ctx.strokeStyle = color('--line');
      ctx.lineWidth = 1;
      ctx.strokeRect(40, top, W - 50, h);
      ctx.fillText(String(tr.max), 4, top + 10);
      ctx.fillText(String(tr.min), 4, top + h);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color('--ctl');
      const pid = sim.pids[tr.loop];
      ctx.beginPath(); ctx.moveTo(40, y(pid.sp)); ctx.lineTo(W - 10, y(pid.sp)); ctx.stroke();
      ctx.strokeStyle = color('--trip');
      for (const lim of tr.limits) { ctx.beginPath(); ctx.moveTo(40, y(lim)); ctx.lineTo(W - 10, y(lim)); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.strokeStyle = color('--text');
      ctx.lineWidth = 2;
      ctx.beginPath();
      const vals = sim.trend[tr.key];
      vals.forEach((v, j) => {
        const px = x(ts[j]);
        const py = y(Math.max(tr.min, Math.min(tr.max, v)));
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
  }
}

// ---------- alarmes ----------

const LEVEL_TEXT = { trip: 'TRIP', alarm: 'ALARME', info: 'INFO', ok: 'NORMAL' };

export class AlarmLog {
  constructor(list, sim) {
    this.list = list;
    this.sim = sim;
    this.rendered = 0;
  }

  update() {
    const log = this.sim.log;
    const signature = `${log.length}:${log[0]?.id}:${log.filter((e) => !e.acked).length}:${log.filter((e) => e.firstOut).length}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.list.replaceChildren(...log.slice(0, 60).map((e) => el('li', { class: `ev ${e.level} ${e.acked ? 'acked' : 'unacked'} ${e.firstOut ? 'first-out' : ''}` },
      el('time', {}, fmtTime(e.time)),
      el('span', { class: 'lvl' }, LEVEL_TEXT[e.level]),
      el('b', {}, e.tag),
      el('span', { class: 'txt' }, e.text, e.firstOut ? el('em', {}, ' 1ª causa') : null))));
  }
}
