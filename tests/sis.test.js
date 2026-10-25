import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERLOCKS, NORMAL_VALUES } from '../js/config.js';
import { Bms, STATE, evaluateCauses, mftCauses, permissives } from '../js/sis.js';

const normal = { ...NORMAL_VALUES, be223: false, hs226: false };
const active = (inputs) => Object.entries(evaluateCauses({ ...normal, ...inputs })).filter(([, v]) => v).map(([k]) => k);

test('operação normal não tem causa ativa', () => {
  assert.deepEqual(active({}), []);
});

test('limites exatos do deck v3 (slide 12)', () => {
  assert.deepEqual(active({ level: 15 }), []);
  assert.deepEqual(active({ level: 14.9 }), ['LSLL-221']);
  assert.deepEqual(active({ level: 85 }), []);
  assert.deepEqual(active({ level: 85.1 }), ['LSHH-227']);
  assert.deepEqual(active({ pressure: 75 }), []);
  assert.deepEqual(active({ pressure: 75.1 }), ['PSHH-222']);
  assert.deepEqual(active({ gasP: 1.5 }), []);
  assert.deepEqual(active({ gasP: 1.49 }), ['PSLL-224']);
  assert.deepEqual(active({ gasP: 6.5 }), []);
  assert.deepEqual(active({ gasP: 6.51 }), ['PSHH-225']);
  assert.deepEqual(active({ be223: true }), ['BE-223']);
  assert.deepEqual(active({ hs226: true }), ['HS-226']);
});

test('LSHH-227 só alarma: não entra no MFT', () => {
  const causes = evaluateCauses({ ...normal, level: 90 });
  assert.deepEqual(mftCauses(causes), []);
  assert.equal(INTERLOCKS.find((il) => il.tag === 'LSHH-227').mft, false);
});

test('LSHH-227 tem histerese para não oscilar', () => {
  const on = evaluateCauses({ ...normal, level: 86 });
  assert.equal(evaluateCauses({ ...normal, level: 84 }, on)['LSHH-227'], true);
  assert.equal(evaluateCauses({ ...normal, level: 81 }, on)['LSHH-227'], false);
});

test('MFT = OR das seis causas de trip', () => {
  const tags = INTERLOCKS.filter((il) => il.mft).map((il) => il.tag);
  assert.deepEqual(tags, ['LSLL-221', 'PSHH-222', 'BE-223', 'PSLL-224', 'PSHH-225', 'HS-226']);
});

const run = (bms, causes, seconds, dt = 0.1) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) bms.update(dt, causes);
};
const clear = evaluateCauses(normal);
const tripBy = (tag) => ({ ...clear, [tag]: true });

test('sequência de trip segue a ordem do slide 13', () => {
  const bms = new Bms({ stepInterval: 0.4, purgeSeconds: 5 });
  bms.update(0.1, tripBy('BE-223'));
  assert.equal(bms.state, STATE.TRIP);
  assert.equal(bms.firstOut, 'BE-223');
  assert.equal(bms.step, 1);
  assert.equal(bms.outputs().fuelAllowed, true);   // 1 Detecta
  run(bms, clear, 0.5);
  assert.equal(bms.step, 2);                        // 2 MFT
  run(bms, clear, 0.4);
  assert.equal(bms.step, 3);
  assert.equal(bms.outputs().fuelAllowed, false);  // 3 Fecha FV-206
  assert.equal(bms.outputs().pilot, true);
  run(bms, clear, 0.4);
  assert.equal(bms.outputs().pilot, false);        // 4 Apaga piloto
  run(bms, clear, 0.4);
  assert.equal(bms.state, STATE.PURGE);             // 5 Purga
  assert.equal(bms.outputs().purge, true);
});

test('MFT fica travado mesmo depois que a causa some', () => {
  const bms = new Bms({ purgeSeconds: 5 });
  bms.update(0.1, tripBy('PSHH-222'));
  run(bms, clear, 3);
  assert.ok(bms.tripped);
  assert.equal(bms.outputs().fuelAllowed, false);
  run(bms, clear, 10);
  assert.equal(bms.state, STATE.READY);
  assert.equal(bms.outputs().fuelAllowed, false);
});

test('first-out guarda a primeira causa e acumula as seguintes', () => {
  const bms = new Bms();
  bms.update(0.1, tripBy('PSLL-224'));
  bms.update(0.1, { ...tripBy('PSLL-224'), 'BE-223': true });
  assert.equal(bms.firstOut, 'PSLL-224');
  assert.deepEqual(bms.tripCauses, ['PSLL-224', 'BE-223']);
});

test('RESET negado durante a purga e sem permissivos', () => {
  const bms = new Bms({ purgeSeconds: 5 });
  bms.update(0.1, tripBy('HS-226'));
  run(bms, tripBy('HS-226'), 2);
  assert.equal(bms.requestStart([]).ok, false);   // ainda em purga
  run(bms, tripBy('HS-226'), 5);
  assert.equal(bms.state, STATE.READY);
  const perms = permissives(bms, tripBy('HS-226'), NORMAL_VALUES);
  assert.equal(perms.find((p) => p.id === 'hs').ok, false);
  const res = bms.requestStart(perms);
  assert.equal(res.ok, false);
  assert.ok(res.reasons.includes('HS-226 liberado'));
});

test('permissivos de nível e gás bloqueiam a partida', () => {
  const bms = new Bms({ purgeSeconds: 1 });
  bms.update(0.1, tripBy('LSLL-221'));
  run(bms, clear, 3);
  assert.equal(bms.requestStart(permissives(bms, clear, { ...NORMAL_VALUES, level: 20 })).ok, false);
  assert.equal(bms.requestStart(permissives(bms, clear, { ...NORMAL_VALUES, gasP: 7 })).ok, false);
  assert.equal(bms.requestStart(permissives(bms, clear, NORMAL_VALUES)).ok, true);
  assert.equal(bms.state, STATE.START);
});

test('partida volta a operar após a rampa', () => {
  const bms = new Bms({ purgeSeconds: 1, startRamp: 4 });
  bms.update(0.1, tripBy('BE-223'));
  run(bms, clear, 3);
  bms.requestStart(permissives(bms, clear, NORMAL_VALUES));
  run(bms, clear, 2);
  assert.ok(bms.outputs().fuelLimit > 40 && bms.outputs().fuelLimit < 60);
  run(bms, clear, 2.5);
  assert.equal(bms.state, STATE.RUN);
  assert.equal(bms.firstOut, null);
});
