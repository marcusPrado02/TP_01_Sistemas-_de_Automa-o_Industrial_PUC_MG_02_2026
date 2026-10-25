import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../js/simulator.js';
import { TIPS, TOUR_STEPS, narrate } from '../js/teaching.js';
import { INTERLOCKS } from '../js/config.js';

const DT = 0.1;
const run = (sim, s) => { for (let i = 0; i < Math.round(s / DT); i++) sim.step(DT); };
const make = () => new Simulator({ noise: false, purgeSeconds: 30 });

test('narra operação normal e sugere provocar falha', () => {
  const sim = make();
  run(sim, 2);
  const n = narrate(sim);
  assert.equal(n.title, 'Operação normal');
  assert.equal(n.hint[0], '1–6');
});

test('narra a falha a caminho do limite antes do trip', () => {
  const sim = make();
  sim.applyScenario('1');
  run(sim, 2);
  const n = narrate(sim);
  assert.equal(n.tone, 'warn');
  assert.match(n.text, /P-201/);
  assert.match(n.text, /15 %/);
});

test('narra cada passo da sequência de trip', () => {
  const sim = make();
  sim.applyScenario('3');
  while (!sim.bms.tripped) sim.step(DT);   // BE-223 vê a chama apagar no passo seguinte
  assert.match(narrate(sim).title, /passo 1 de 5/);
  assert.match(narrate(sim).text, /BE-223/);
  run(sim, 0.9);
  assert.match(narrate(sim).text, /FV-206/);
  run(sim, 1);
  assert.match(narrate(sim).title, /Purga/);
});

test('após a purga explica o latch e o que falta para partir', () => {
  const sim = make();
  sim.applyScenario('E');
  run(sim, 35);
  let n = narrate(sim);
  assert.match(n.title, /MFT travado/);
  assert.equal(n.hint[0], '0');
  sim.applyScenario('0');
  run(sim, 1);
  n = narrate(sim);
  assert.equal(n.title, 'Pronto para partir');
  assert.equal(n.hint[0], 'R');
});

test('LSHH-227 é narrado como alarme sem trip', () => {
  const sim = make();
  sim.applyScenario('2');
  run(sim, 15);
  const n = narrate(sim);
  assert.match(n.title, /LSHH-227/);
});

test('pausa tem prioridade na narração', () => {
  assert.equal(narrate(make(), { paused: true }).title, 'Simulação pausada');
});

test('toda chave do SIS desenhada no sinótico tem dica', () => {
  for (const tag of ['LSLL-221', 'LSHH-227', 'BE-223']) assert.ok(TIPS[`sw-${tag}`]);
  assert.ok(INTERLOCKS.length === 7);
  assert.ok(TOUR_STEPS.length >= 8);
});
