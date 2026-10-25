// Dados da planta — fonte da verdade: P&ID série 2xx e deck v3 (slides 6, 10, 12 e 13).

export const PROJECT_TITLE = 'Sistema de Geração de Vapor com Caldeira Aquatubular';

// Os 10 transmissores do slide 6. `key` é o nome da variável no estado da planta.
export const TRANSMITTERS = [
  { tag: 'LT-201', key: 'level',    label: 'Nível do tambor',                unit: '%',    min: 0,   max: 100, step: 1,   digits: 1 },
  { tag: 'FT-202', key: 'feed',     label: 'Vazão de água de alimentação',   unit: '%',    min: 0,   max: 100, step: 1,   digits: 1 },
  { tag: 'FT-203', key: 'steam',    label: 'Vazão de vapor',                 unit: '%',    min: 0,   max: 100, step: 1,   digits: 1 },
  { tag: 'PT-204', key: 'pressure', label: 'Pressão do coletor de vapor',    unit: 'bar',  min: 0,   max: 100, step: 0.5, digits: 1 },
  { tag: 'TT-205', key: 'temp',     label: 'Temperatura do vapor',           unit: '°C',   min: 100, max: 600, step: 1,   digits: 0 },
  { tag: 'FT-206', key: 'gas',      label: 'Vazão de gás natural',           unit: '%',    min: 0,   max: 100, step: 1,   digits: 1 },
  { tag: 'FT-207', key: 'air',      label: 'Vazão de ar de combustão',       unit: '%',    min: 0,   max: 100, step: 1,   digits: 1 },
  { tag: 'AT-208', key: 'o2',       label: 'O₂ nos gases de exaustão',       unit: '%',    min: 0,   max: 21,  step: 0.1, digits: 1 },
  { tag: 'PT-210', key: 'furnaceP', label: 'Pressão da fornalha (tiragem)',  unit: 'mbar', min: -20, max: 20,  step: 0.1, digits: 1 },
  { tag: 'PT-211', key: 'gasP',     label: 'Pressão de suprimento de gás',   unit: 'bar',  min: 0,   max: 10,  step: 0.1, digits: 2 },
];

export const NORMAL_VALUES = {
  level: 50, feed: 60, steam: 60, pressure: 60, temp: 420,
  gas: 60, air: 72, o2: 3, furnaceP: -2.3, gasP: 4,
};

// Malhas do slide 10. `action`: reverse = PV abaixo do SP abre a válvula; direct = PV acima do SP abre.
export const LOOPS = {
  lic: { tag: 'LIC-201', pv: 'level',    valve: 'LV-201', sp: 50,  unit: '%',   action: 'reverse', kc: 3,   ti: 10, bias: 60, title: 'Nível do tambor' },
  pic: { tag: 'PIC-204', pv: 'pressure', valve: 'FV-206', sp: 60,  unit: 'bar', action: 'reverse', kc: 2,   ti: 8,  bias: 60, title: 'Pressão do vapor' },
  tic: { tag: 'TIC-205', pv: 'temp',     valve: 'TV-205', sp: 420, unit: '°C',  action: 'direct',  kc: 0.8, ti: 6,  bias: 18, title: 'Temperatura do vapor' },
};

// Colunas de efeito da matriz causa × efeito.
export const EFFECTS = [
  { id: 'mft',   label: 'Trip (MFT)' },
  { id: 'fv',    label: 'Fecha FV-206' },
  { id: 'pilot', label: 'Apaga piloto' },
  { id: 'purge', label: 'Purga' },
  { id: 'alarm', label: 'Alarme geral' },
  { id: 'block', label: 'Bloqueia partida' },
  { id: 'lv',    label: 'Fecha/reduz LV-201' },
];

const MFT_EFFECTS = ['mft', 'fv', 'pilot', 'purge', 'alarm'];

// Matriz de causa e efeito do slide 12 (limites do deck v3).
// kind: 'lt' dispara abaixo de `value`, 'gt' acima, 'digital' pelo sinal booleano `key`.
export const INTERLOCKS = [
  { tag: 'LSLL-221', event: 'Nível muito baixo',           limit: 'LT-201 < 15 %',    kind: 'lt', key: 'level',    value: 15,  source: 'LT-201', mft: true,  effects: MFT_EFFECTS },
  { tag: 'LSHH-227', event: 'Nível muito alto',            limit: 'LT-201 > 85 %',    kind: 'gt', key: 'level',    value: 85,  source: 'LT-201', mft: false, effects: ['alarm', 'lv'], hysteresis: 3 },
  { tag: 'PSHH-222', event: 'Pressão de vapor muito alta', limit: 'PT-204 > 75 bar',  kind: 'gt', key: 'pressure', value: 75,  source: 'PT-204', mft: true,  effects: MFT_EFFECTS },
  { tag: 'BE-223',   event: 'Perda de chama',              limit: 'Sinal digital',    kind: 'digital', key: 'be223',             source: 'BE-223', mft: true,  effects: MFT_EFFECTS },
  { tag: 'PSLL-224', event: 'Gás com pressão muito baixa', limit: 'PT-211 < 1,5 bar', kind: 'lt', key: 'gasP',     value: 1.5, source: 'PT-211', mft: true,  effects: MFT_EFFECTS },
  { tag: 'PSHH-225', event: 'Gás com pressão muito alta',  limit: 'PT-211 > 6,5 bar', kind: 'gt', key: 'gasP',     value: 6.5, source: 'PT-211', mft: true,  effects: MFT_EFFECTS },
  { tag: 'HS-226',   event: 'Botão de emergência',         limit: 'Sinal digital',    kind: 'digital', key: 'hs226',             source: 'HS-226', mft: true,  effects: [...MFT_EFFECTS, 'block'] },
];

// Permissivos de partida (seção 7.5 do design).
export const PERMISSIVE_RANGES = {
  level: [30, 70],
  gasP: [1.5, 6.5],
};

export const TIMING = {
  stepInterval: 0.4,   // s entre os passos visíveis da sequência de trip (tempo de curso das válvulas)
  purgeSeconds: 30,    // purga encurtada para a demonstração
  startRamp: 4,        // s de rampa da FV-206 na partida
};

// Cenários (slide 14 + operação normal + gás alto). `faults` vale na simulação dinâmica,
// `manual` posiciona os sliders na entrada manual.
export const SCENARIOS = [
  { id: '0', key: '0', name: 'Operação normal',       hint: 'Remove a falha injetada e libera HS-226',             faults: {},                                  manual: {} },
  { id: '1', key: '1', name: 'Nível muito baixo',     hint: 'Bomba P-201 para → LSLL-221',                         faults: { pumpFail: true },                  manual: { level: 10 } },
  { id: '2', key: '2', name: 'Nível muito alto',      hint: 'LV-201 trava aberta → LSHH-227 (só alarme)',          faults: { lvStuck: true },                   manual: { level: 92 } },
  { id: '3', key: '3', name: 'Falha de chama',        hint: 'Chama apaga no queimador → BE-223',                   faults: { flameLoss: true },                 manual: { be223: true } },
  { id: '4', key: '4', name: 'Vapor em sobrepressão', hint: 'Turbina rejeita carga e PIC-204 trava → PSHH-222',    faults: { loadDrop: true, picStuck: true },  manual: { pressure: 82 } },
  { id: '5', key: '5', name: 'Gás com pressão baixa', hint: 'Queda na rede de gás → PSLL-224',                     faults: { gasSupply: 'low' },                manual: { gasP: 1 } },
  { id: '6', key: '6', name: 'Gás com pressão alta',  hint: 'Regulador de gás falha → PSHH-225',                   faults: { gasSupply: 'high' },               manual: { gasP: 7.5 } },
  { id: 'E', key: 'e', name: 'Emergência',            hint: 'HS-226 pressionado (E alterna)',                       faults: null,                                manual: null },
];
