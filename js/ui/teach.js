// Recursos didáticos da interface: narrador, dicas ao passar o mouse e tour guiado.

import { LOOPS, TRANSMITTERS } from '../config.js';
import { TIPS, TOUR_STEPS, narrate } from '../teaching.js';
import { el } from './panels.js';

// ---------- narrador ----------

export class Narrator {
  constructor(container, sim) {
    this.sim = sim;
    this.container = container;
    this.title = el('b');
    this.text = el('span', { class: 'nr-text' });
    this.hintKey = el('span', { class: 'kbd' });
    this.hintText = el('span');
    this.hint = el('span', { class: 'nr-hint' }, this.hintKey, this.hintText);
    container.append(el('span', { class: 'nr-label' }, 'O que está acontecendo?'), el('div', { class: 'nr-body' }, this.title, this.text), this.hint);
  }

  update(sim, { paused = false } = {}) {
    const n = narrate(sim, { paused });
    this.container.dataset.tone = n.tone;
    this.title.textContent = n.title;
    if (this.text.textContent !== n.text) this.text.textContent = n.text;
    this.hint.hidden = !n.hint;
    if (n.hint) {
      this.hintKey.textContent = n.hint[0];
      this.hintText.textContent = n.hint[1];
    }
  }
}

// ---------- dicas do sinótico ----------

export class Tooltips {
  constructor(svg, sim) {
    this.sim = sim;
    this.tip = el('div', { class: 'tip', role: 'tooltip', hidden: '' });
    document.body.append(this.tip);
    this.current = null;
    svg.addEventListener('pointermove', (ev) => this.move(ev));
    svg.addEventListener('pointerleave', () => this.hide());
  }

  move(ev) {
    let node = ev.target;
    while (node && node !== ev.currentTarget && !(node.id && TIPS[node.id])) node = node.parentNode;
    const id = node && node.id && TIPS[node.id] ? node.id : null;
    if (!id) return this.hide();
    this.current = id;
    this.render();
    const pad = 16;
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    const x = ev.clientX + pad + w > innerWidth ? ev.clientX - pad - w : ev.clientX + pad;
    const y = Math.min(innerHeight - h - 8, Math.max(8, ev.clientY + pad));
    this.tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
    this.tip.hidden = false;
  }

  hide() {
    this.current = null;
    this.tip.hidden = true;
  }

  live(t) {
    const { sim } = this;
    if (t.tag) {
      const tr = TRANSMITTERS.find((x) => x.tag === t.tag);
      return `Agora: ${sim.meas[tr.key].toFixed(tr.digits)} ${tr.unit}`;
    }
    if (t.loop) {
      const pid = sim.pids[t.loop];
      const loop = LOOPS[t.loop];
      const tr = TRANSMITTERS.find((x) => x.key === loop.pv);
      return `PV ${sim.meas[loop.pv].toFixed(tr.digits)} ${tr.unit} · SP ${pid.sp} ${loop.unit} · ${pid.mode}`;
    }
    if (t.valve) return `Abertura: ${sim.actuators[t.valve].toFixed(0)} %`;
    if (t.title in sim.causes) return sim.causes[t.title] ? 'Estado: ATUANDO' : 'Estado: normal';
    return null;
  }

  render() {
    if (!this.current) return;
    const t = TIPS[this.current];
    const live = this.live(t);
    this.tip.replaceChildren(
      el('small', {}, t.kind),
      el('b', {}, t.title),
      el('p', {}, t.what),
      el('p', { class: 'tip-why' }, t.why),
      t.limits ? el('p', { class: 'tip-lim' }, t.limits) : null,
      live ? el('p', { class: 'tip-live' }, live) : null,
    );
  }

  update() {
    if (this.current) this.render();
  }
}

// ---------- tour guiado ----------

export class Tour {
  constructor({ onStart } = {}) {
    this.onStart = onStart;
    this.index = -1;
    this.spot = el('div', { class: 'tour-spot', hidden: '' });
    this.title = el('h3');
    this.text = el('p');
    this.count = el('span', { class: 'tour-count' });
    this.prev = el('button', { onclick: () => this.go(this.index - 1) }, '← Anterior');
    this.next = el('button', { class: 'primary', onclick: () => this.go(this.index + 1) }, 'Próximo →');
    this.card = el('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite', hidden: '' },
      el('header', {}, this.count, el('button', { class: 'tour-close', 'aria-label': 'Fechar tour', onclick: () => this.end() }, '✕')),
      this.title,
      this.text,
      el('footer', {}, this.prev, this.next));
    document.body.append(this.spot, this.card);
    addEventListener('resize', () => this.active && this.place());
  }

  get active() {
    return this.index >= 0;
  }

  start() {
    this.onStart?.();
    this.go(0);
  }

  end() {
    this.index = -1;
    this.spot.hidden = true;
    this.card.hidden = true;
    document.body.classList.remove('touring');
  }

  go(i) {
    if (i < 0) return;
    if (i >= TOUR_STEPS.length) return this.end();
    this.index = i;
    const step = TOUR_STEPS[i];
    this.title.textContent = step.title;
    this.text.textContent = step.text;
    this.count.textContent = `${i + 1} / ${TOUR_STEPS.length}`;
    this.prev.disabled = i === 0;
    this.next.textContent = i === TOUR_STEPS.length - 1 ? 'Concluir ✓' : 'Próximo →';
    document.body.classList.add('touring');
    this.card.hidden = false;
    this.place();
    this.next.focus();
  }

  place() {
    const step = TOUR_STEPS[this.index];
    let target = step.target ? document.querySelector(step.target) : null;
    if (target && step.targetParent) target = target.parentElement;
    const card = this.card;
    if (!target) {
      this.spot.hidden = false;
      this.spot.removeAttribute('style');
      this.spot.classList.add('full');
      card.style.transform = `translate(${(innerWidth - card.offsetWidth) / 2}px, ${(innerHeight - card.offsetHeight) / 2}px)`;
      return;
    }
    target.scrollIntoView({ block: 'nearest' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    this.spot.classList.remove('full');
    this.spot.hidden = false;
    Object.assign(this.spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });

    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const gap = 14;
    let x;
    let y;
    if (r.bottom + gap + h < innerHeight) { y = r.bottom + gap; x = r.left; }
    else if (r.top - gap - h > 0) { y = r.top - gap - h; x = r.left; }
    else if (r.right + gap + w < innerWidth) { x = r.right + gap; y = r.top; }
    else { x = r.left - gap - w; y = r.top; }
    x = Math.min(innerWidth - w - 10, Math.max(10, x));
    y = Math.min(innerHeight - h - 10, Math.max(10, y));
    card.style.transform = `translate(${x}px, ${y}px)`;
  }

  // Devolve true quando a tecla foi usada pelo tour.
  handleKey(key) {
    if (!this.active) return false;
    if (key === 'escape') this.end();
    else if (key === 'arrowright') this.go(this.index + 1);
    else if (key === 'arrowleft') this.go(this.index - 1);
    else return false;
    return true;
  }
}
