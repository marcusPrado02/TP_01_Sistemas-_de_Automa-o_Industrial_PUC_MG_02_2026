import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../js/simulator.js';
import { STATE } from '../js/sis.js';

const DT = 0.1;
const make = () => new Simulator({ noise: false, purgeSeconds: 30 });
const run = (sim, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT);
};
const runUntilTrip = (sim, limit = 15) => {
  let t = 0;
  while (!sim.bms.tripped && t < limit) {
    sim.step(DT);
    t += DT;
  }
  return t;
};

test('planta fica estável em operação normal', () => {
  const sim = make();
  run(sim, 60);
  assert.equal(sim.bms.state, STATE.RUN);
  assert.ok(Math.abs(sim.meas.level - 50) < 2);
  assert.ok(Math.abs(sim.meas.pressure - 60) < 2);
  assert.ok(Math.abs(sim.meas.temp - 420) < 10);
});

const tripScenarios = [
  ['1', 'LSLL-221'],
  ['3', 'BE-223'],
  ['4', 'PSHH-222'],
  ['5', 'PSLL-224'],
  ['6', 'PSHH-225'],
  ['E', 'HS-226'],
];

for (const [id, tag] of tripScenarios) {
  test(`cenário ${id} derruba a caldeira por ${tag} em até 10 s e volta a operar`, () => {
    const sim = make();
    run(sim, 10);
    sim.applyScenario(id);
    const t = runUntilTrip(sim);
    assert.ok(sim.bms.tripped, `não tripou (${t.toFixed(1)} s)`);
    assert.ok(t <= 10, `demorou ${t.toFixed(1)} s`);
    assert.equal(sim.bms.firstOut, tag);
    assert.ok(sim.log.some((e) => e.tag === tag && e.firstOut));

    run(sim, 3);
    assert.equal(sim.actuators.fv, 0);
    assert.equal(sim.actuators.pilot, false);
    assert.equal(sim.plant.flame, false);

    run(sim, 30);
    assert.equal(sim.bms.state, STATE.READY);
    sim.applyScenario('0');
    run(sim, 6);
    const res = sim.requestStart();
    assert.ok(res.ok, res.reasons.join('; '));
    run(sim, 60);
    assert.equal(sim.bms.state, STATE.RUN, 'tripou de novo na partida');
    assert.ok(Math.abs(sim.meas.pressure - 60) < 4);
  });
}

test('cenário 2 (LSHH-227) alarma e fecha LV-201 sem MFT', () => {
  const sim = make();
  run(sim, 5);
  sim.applyScenario('2');
  let sawAlarm = false;
  for (let i = 0; i < 300; i++) {
    sim.step(DT);
    if (sim.causes['LSHH-227']) {
      sawAlarm = true;
      assert.equal(sim.actuators.lv, 0);
    }
  }
  assert.ok(sawAlarm);
  assert.equal(sim.bms.state, STATE.RUN);
});

test('MFT fecha FV-206 mesmo com PIC-204 em MAN a 100 %', () => {
  const sim = make();
  sim.setLoopMode('pic', 'MAN');
  sim.setManualOutput('pic', 100);
  run(sim, 1);
  assert.equal(sim.actuators.fv, 100);
  sim.applyScenario('E');
  run(sim, 2);
  assert.equal(sim.actuators.fv, 0);
});

test('RESET negado enquanto a causa persiste', () => {
  const sim = make();
  sim.applyScenario('5');
  run(sim, 40);
  assert.equal(sim.bms.state, STATE.READY);
  const res = sim.requestStart();
  assert.equal(res.ok, false);
  assert.ok(sim.log[0].text.startsWith('Partida negada'));
});

test('entrada manual: slider abaixo de 15 % dispara LSLL-221', () => {
  const sim = make();
  sim.setSource('manual');
  run(sim, 1);
  assert.equal(sim.bms.state, STATE.RUN);
  sim.setManualValue('level', 14);
  run(sim, 0.2);
  assert.ok(sim.bms.tripped);
  assert.equal(sim.bms.firstOut, 'LSLL-221');
});

test('entrada manual: cenário posiciona sliders e o SIS sobrevive à troca de fonte', () => {
  const sim = make();
  sim.setSource('manual');
  sim.applyScenario('3');
  assert.equal(sim.manual.be223, true);
  run(sim, 1);
  assert.equal(sim.bms.firstOut, 'BE-223');
  sim.setSource('dynamic');
  assert.ok(sim.bms.tripped);
  run(sim, 1);
  assert.ok(sim.bms.tripped);
});
