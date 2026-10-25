import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pid } from '../js/pid.js';

test('ação reversa abre quando a PV está abaixo do SP', () => {
  const pid = new Pid({ sp: 50, kc: 2, ti: 10, action: 'reverse', bias: 50 });
  assert.ok(pid.update(40, 0.1) > 50);
  assert.ok(new Pid({ sp: 50, kc: 2, ti: 10, bias: 50 }).update(60, 0.1) < 50);
});

test('ação direta abre quando a PV está acima do SP', () => {
  const pid = new Pid({ sp: 420, kc: 1, ti: 6, action: 'direct', bias: 18 });
  assert.ok(pid.update(440, 0.1) > 18);
});

test('saída limitada a 0–100 % e sem windup', () => {
  const pid = new Pid({ sp: 50, kc: 5, ti: 2, bias: 50 });
  for (let i = 0; i < 1000; i++) pid.update(0, 0.1);
  assert.equal(pid.out, 100);
  // Ao voltar ao SP, sai da saturação imediatamente (integral não acumulou).
  assert.ok(pid.update(50, 0.1) < 100);
});

test('modo MAN mantém a saída do operador e a volta para AUTO não dá solavanco', () => {
  const pid = new Pid({ sp: 50, kc: 2, ti: 10, bias: 50 });
  pid.setMode('MAN');
  pid.out = 30;
  assert.equal(pid.update(45, 0.1), 30);
  pid.setMode('AUTO');
  assert.ok(Math.abs(pid.update(45, 0.1) - 30) < 0.5);
});

test('integrate=false congela o integral', () => {
  const pid = new Pid({ sp: 50, kc: 1, ti: 1, bias: 50 });
  const first = pid.update(40, 0.1, { integrate: false });
  for (let i = 0; i < 100; i++) pid.update(40, 0.1, { integrate: false });
  assert.equal(pid.out, first);
});
