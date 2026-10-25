// Modelo didático da caldeira: dinâmicas de primeira ordem ajustadas para reagir em segundos.
// Função pura: recebe estado, atuadores e falhas e devolve o novo estado.

import { NORMAL_VALUES } from './config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lag = (current, target, tau, dt) => current + (target - current) * Math.min(1, dt / tau);

const GAS_SUPPLY = { normal: 4, low: 0.8, high: 8 };
const LEVEL_GAIN = 0.09;      // %/s por % de desbalanço água × vapor
const PRESSURE_GAIN = 0.06;   // bar/s por % de desbalanço calor × vapor
const PSV_SET = 85;           // bar — PSV-230 abre acima disso

export function createPlant(values = NORMAL_VALUES) {
  return { ...NORMAL_VALUES, ...values, heat: values.gas ?? NORMAL_VALUES.gas, flame: true, turbine: 100, psvOpen: false };
}

export function stepPlant(s, act, faults, dt) {
  const n = { ...s };

  const pumpRunning = act.pumpOn && !faults.pumpFail;
  n.feed = lag(s.feed, pumpRunning ? act.lv : 0, 0.8, dt);

  n.psvOpen = s.pressure > PSV_SET;
  const demand = faults.loadDrop ? 15 : act.load ?? 60;
  const steamTarget = demand * clamp(s.pressure / 40, 0, 1) + (n.psvOpen ? (s.pressure - PSV_SET) * 4 : 0);
  n.steam = lag(s.steam, clamp(steamTarget, 0, 100), 0.6, dt);

  n.level = clamp(s.level + LEVEL_GAIN * (n.feed - n.steam) * dt, 0, 100);

  n.gasP = lag(s.gasP, GAS_SUPPLY[faults.gasSupply ?? 'normal'], 1.2, dt);
  const gasTarget = act.fv * clamp(Math.sqrt(Math.max(n.gasP, 0) / 4), 0, 1.4);
  n.gas = lag(s.gas, clamp(gasTarget, 0, 100), 0.5, dt);

  n.flame = Boolean(act.pilot) && !faults.flameLoss && n.gasP > 0.3;
  n.heat = lag(s.heat, n.flame ? n.gas : 0, 1.5, dt);

  n.pressure = clamp(s.pressure + PRESSURE_GAIN * (n.heat - n.steam) * dt, 0, 110);

  const tempTarget = clamp(270 + 2.8 * n.heat - 1.0 * act.tv, 120, 600);
  n.temp = lag(s.temp, tempTarget, 3, dt);

  n.air = lag(s.air, act.damper, 0.8, dt);

  // O₂ residual pelo excesso de ar λ: O₂ ≈ 20,9·(λ−1)/λ. Sem gás, a fornalha só tem ar.
  const o2Target = n.gas < 2 ? 20.9 : clamp((20.9 * (n.air / n.gas - 1)) / (n.air / n.gas), 0, 20.9);
  n.o2 = lag(s.o2, o2Target, 1, dt);

  n.furnaceP = lag(s.furnaceP, -1 - 0.03 * n.air + 0.01 * n.heat, 0.7, dt);
  n.turbine = lag(s.turbine, clamp((n.steam / 60) * 100, 0, 120), 2, dt);

  return n;
}
