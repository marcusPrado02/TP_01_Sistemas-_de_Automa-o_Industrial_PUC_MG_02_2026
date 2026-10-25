// Ponto de entrada: monta a IHM, roda a simulação em passo fixo e trata os atalhos.

import { Simulator } from './simulator.js';
import { STATE } from './sis.js';
import { Synoptic } from './ui/synoptic.js';
import { AlarmLog, Faceplates, MatrixPanel, ScenarioPanel, SisView, SliderPanel, TrendChart } from './ui/panels.js';
import { Narrator, Tooltips, Tour } from './ui/teach.js';

const STEP = 0.1;          // s de simulação por passo
const LAYOUTS = ['sala', 'matriz', 'palco'];
const $ = (id) => document.getElementById(id);

const sim = new Simulator();
const views = [
  new Synoptic($('synoptic')),
  new ScenarioPanel($('scenarios'), sim),
  new ScenarioPanel($('stageBar'), sim, { compact: true }),
  new Faceplates($('faceplates'), sim),
  new SliderPanel($('sliders'), sim),
  new SisView($('sisStrip'), sim),
  new SisView($('sisOverlay'), sim, { big: true }),
  new MatrixPanel($('matrix'), sim),
  new TrendChart($('trends'), sim),
  new AlarmLog($('alarmLog'), sim),
  new Tooltips($('synoptic'), sim),
];
const narrator = new Narrator($('narrator'), sim);

// ---------- preferências locais (só conveniência; a página funciona sem elas) ----------

const store = {
  get(key, fallback) {
    try { return localStorage.getItem(`caldeira:${key}`) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`caldeira:${key}`, value); } catch { /* sem armazenamento */ }
  },
};

function setLayout(layout) {
  document.body.classList.remove(...LAYOUTS.map((l) => `layout-${l}`));
  document.body.classList.add(`layout-${layout}`);
  for (const b of document.querySelectorAll('[data-layout]')) b.classList.toggle('active', b.dataset.layout === layout);
  store.set('layout', layout);
}

function setSource(source) {
  sim.setSource(source);
  document.body.classList.toggle('source-manual', source === 'manual');
  document.body.classList.toggle('source-dynamic', source === 'dynamic');
  for (const b of document.querySelectorAll('[data-source]')) b.classList.toggle('active', b.dataset.source === source);
}

const currentLayout = () => LAYOUTS.find((l) => document.body.classList.contains(`layout-${l}`));
const toggleDrawer = () => document.body.classList.toggle('drawer-open');

function setNarrator(on) {
  document.body.classList.toggle('narrator-off', !on);
  $('narratorBtn').classList.toggle('active', on);
  store.set('narrator', on ? '1' : '0');
}
const toggleNarrator = () => setNarrator(document.body.classList.contains('narrator-off'));

const tour = new Tour({
  onStart: () => {
    setLayout('sala');
    setNarrator(true);
    document.body.classList.remove('drawer-open');
  },
});

for (const b of document.querySelectorAll('[data-layout]')) b.addEventListener('click', () => setLayout(b.dataset.layout));
for (const b of document.querySelectorAll('[data-source]')) b.addEventListener('click', () => setSource(b.dataset.source));
$('drawerBtn').addEventListener('click', toggleDrawer);
$('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
$('ackBtn').addEventListener('click', () => sim.acknowledgeAll());
$('tourBtn').addEventListener('click', () => tour.start());
$('narratorBtn').addEventListener('click', toggleNarrator);

setLayout(LAYOUTS.includes(store.get('layout')) ? store.get('layout') : 'sala');
setSource('dynamic');
setNarrator(store.get('narrator', '1') === '1');

// ---------- teclado ----------

let paused = false;

document.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const target = ev.target;
  if (target instanceof HTMLInputElement && target.type === 'number') return;
  const k = ev.key.toLowerCase();
  if (tour.handleKey(k)) {
    ev.preventDefault();
    return;
  }
  if (/^[0-6]$/.test(k)) sim.applyScenario(k);
  else if (k === 'e') sim.applyScenario('E');
  else if (k === 'r') sim.requestStart();
  else if (k === 'a') sim.acknowledgeAll();
  else if (k === 'm') setLayout(LAYOUTS[(LAYOUTS.indexOf(currentLayout()) + 1) % LAYOUTS.length]);
  else if (k === 's') setSource(sim.source === 'dynamic' ? 'manual' : 'dynamic');
  else if (k === 't') toggleDrawer();
  else if (k === 'p') paused = !paused;
  else if (k === 'g') tour.start();
  else if (k === 'd') toggleNarrator();
  else if (k === '?') $('helpDialog').showModal();
  else return;
  ev.preventDefault();
});

// ---------- laço ----------

const badge = $('bmsBadge');
const clock = $('clock');

function render() {
  for (const v of views) v.update(sim);
  narrator.update(sim, { paused });
  const s = sim.bms.state;
  badge.textContent = paused ? 'PAUSADO' : s === STATE.READY ? 'AGUARDANDO RESET' : s;
  badge.dataset.state = paused ? 'PAUSE' : s;
  document.body.dataset.bms = s;
  document.body.classList.toggle('lshh', Boolean(sim.causes['LSHH-227']));
  clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.5, (now - last) / 1000);
  last = now;
  let stepped = false;
  while (acc >= STEP) {
    if (!paused) sim.step(STEP);
    acc -= STEP;
    stepped = true;
  }
  if (stepped) render();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
