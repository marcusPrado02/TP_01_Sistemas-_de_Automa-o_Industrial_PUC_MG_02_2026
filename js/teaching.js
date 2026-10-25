// Conteúdo didático: narração do estado atual, dicas dos elementos do sinótico e passos do tour.
// Sem DOM — a narração é testada em tests/teaching.test.js.

import { INTERLOCKS, LOOPS } from './config.js';
import { STATE } from './sis.js';

const n1 = (v) => v.toFixed(1).replace('.', ',');
const n2 = (v) => v.toFixed(2).replace('.', ',');
const interlock = (tag) => INTERLOCKS.find((il) => il.tag === tag);

// ---------- narrador ----------

// Explica o que a planta está fazendo agora. tone: normal | warn | trip | ok.
export function narrate(sim, { paused = false } = {}) {
  const { bms, meas: m, causes } = sim;
  const missing = sim.permissives().filter((p) => !p.ok);

  if (paused) return { tone: 'warn', title: 'Simulação pausada', text: 'O tempo está congelado: aproveite para explicar a tela.', hint: ['P', 'continuar'] };

  if (bms.state === STATE.TRIP) {
    const il = interlock(bms.firstOut);
    const steps = [
      `Detecta: ${il.tag} sinalizou "${il.event.toLowerCase()}" (${il.limit}). O sinal vai direto ao CLP de segurança, sem passar pelas malhas de controle.`,
      'Dispara o MFT (Master Fuel Trip): a partir daqui o SIS manda, não importa o que os controladores peçam.',
      'Fecha a FV-206: o gás é bloqueado. Sem combustível, não há como a falha virar acidente.',
      'Apaga o piloto: nenhuma fonte de ignição fica ativa dentro da fornalha.',
    ];
    return { tone: 'trip', title: `Trip — passo ${bms.step} de 5`, text: steps[bms.step - 1] };
  }

  if (bms.state === STATE.PURGE) {
    return {
      tone: 'trip',
      title: `Purga — faltam ${Math.ceil(bms.purgeLeft)} s`,
      text: 'O damper abriu 100 % e o ventilador varre a fornalha (FT-207 alto, O₂ subindo para 21 %). Gás acumulado + faísca na religação = explosão; por isso a purga é obrigatória antes de uma nova partida.',
      hint: causes[bms.firstOut] || sim.hs226 ? ['0', 'corrigir a falha enquanto a purga corre'] : null,
    };
  }

  if (bms.state === STATE.READY) {
    if (!missing.length) {
      return { tone: 'ok', title: 'Pronto para partir', text: `Purga concluída e todos os permissivos atendidos. Repare: a falha (${bms.firstOut}) já sumiu, mas a caldeira continua desligada — o MFT é travado e só o operador libera.`, hint: ['R', 'RESET / partida'] };
    }
    const first = missing[0];
    const reasons = {
      causes: { text: `A causa ainda está presente (${INTERLOCKS.filter((il) => il.mft && causes[il.tag]).map((il) => il.tag).join(', ')}). Enquanto ela existir, a partida é bloqueada.`, hint: ['0', 'remover a falha'] },
      hs: { text: 'O botão de emergência HS-226 continua pressionado. Ele bloqueia qualquer nova partida até ser liberado.', hint: ['E', 'soltar HS-226'] },
      level: { text: `Nível do tambor fora da faixa de partida (LT-201 = ${n1(m.level)} %, precisa de 30–70 %). Partir com tambor seco danifica os tubos.`, hint: sim.faults.pumpFail ? ['0', 'religar a bomba P-201'] : null },
      gas: { text: `Pressão de gás fora da faixa (PT-211 = ${n2(m.gasP)} bar, precisa de 1,5–6,5 bar).`, hint: sim.faults.gasSupply ? ['0', 'normalizar a rede de gás'] : null },
      purge: { text: 'Aguardando a purga terminar.' },
    };
    const r = reasons[first.id];
    return { tone: 'trip', title: 'MFT travado — aguardando permissivos', text: r.text, hint: r.hint ?? ['…', 'aguarde'] };
  }

  if (bms.state === STATE.START) {
    return { tone: 'ok', title: 'Partida', text: `Piloto aceso e FV-206 abrindo em rampa (${Math.round(bms.outputs().fuelLimit)} % liberado). As malhas voltaram para AUTO e vão trazer a pressão de volta a ${LOOPS.pic.sp} bar.` };
  }

  // Operando: alarmes, falhas a caminho do limite, malhas em manual.
  if (causes['LSHH-227']) {
    return { tone: 'warn', title: 'Alarme LSHH-227 — sem trip', text: `Nível acima de 85 % (LT-201 = ${n1(m.level)} %). O SIS fecha a LV-201, mas não derruba a caldeira: nem todo intertravamento é trip.`, hint: ['0', 'destravar a LV-201'] };
  }

  const approaching = {
    pumpFail: () => `A bomba P-201 parou: a água não entra (FT-202 = ${n1(m.feed)} %) mas o vapor continua saindo. O nível cai — LT-201 = ${n1(m.level)} %; o LSLL-221 atua em 15 %.`,
    lvStuck: () => `A LV-201 travou aberta: entra mais água do que sai vapor. O nível sobe — LT-201 = ${n1(m.level)} %; o LSHH-227 atua em 85 %.`,
    loadDrop: () => `A turbina rejeitou carga (FT-203 = ${n1(m.steam)} %) e o PIC-204 travou abrindo o gás. A pressão sobe — PT-204 = ${n1(m.pressure)} bar; o PSHH-222 atua em 75 bar.`,
    gasLow: () => `Queda na rede de gás: PT-211 = ${n2(m.gasP)} bar e caindo; o PSLL-224 atua abaixo de 1,5 bar.`,
    gasHigh: () => `O regulador de gás falhou: PT-211 = ${n2(m.gasP)} bar e subindo; o PSHH-225 atua acima de 6,5 bar.`,
  };
  const f = sim.faults;
  const fault = f.pumpFail ? 'pumpFail' : f.lvStuck ? 'lvStuck' : f.loadDrop ? 'loadDrop' : f.gasSupply === 'low' ? 'gasLow' : f.gasSupply === 'high' ? 'gasHigh' : null;
  if (fault && sim.source === 'dynamic') return { tone: 'warn', title: 'Falha em andamento', text: approaching[fault](), hint: ['Tendências', 'veja a variável caminhando até o limite (T)'] };

  const manualLoop = Object.entries(sim.pids).find(([, p]) => p.mode === 'MAN');
  if (manualLoop) {
    const loop = LOOPS[manualLoop[0]];
    return { tone: 'warn', title: `${loop.tag} em MANUAL`, text: `O operador comanda a ${loop.valve} diretamente (${Math.round(manualLoop[1].out)} %); o controlador não corrige desvios. Mesmo assim, se houver trip, o SIS tem prioridade sobre essa saída.` };
  }

  if (sim.source === 'manual') {
    return { tone: 'normal', title: 'Entrada manual por sliders', text: 'A dinâmica está pausada: cada slider é a leitura de um transmissor. Arraste um deles além do limite (ex.: LT-201 abaixo de 15 %) e veja o SIS atuar na hora.', hint: ['S', 'voltar à simulação dinâmica'] };
  }

  return {
    tone: 'normal',
    title: 'Operação normal',
    text: `Três malhas PI seguram o processo: nível ${n1(m.level)} % (SP ${sim.pids.lic.sp}), pressão ${n1(m.pressure)} bar (SP ${sim.pids.pic.sp}), temperatura ${Math.round(m.temp)} °C (SP ${sim.pids.tic.sp}). O SIS só observa — até algo sair do limite.`,
    hint: ['1–6', 'provocar uma falha'],
  };
}

// ---------- dicas do sinótico ----------

const tx = (tag, what, why, limits = '') => ({ title: tag, kind: 'Transmissor', what, why, limits, tag });

export const TIPS = {
  'tx-LT-201': tx('LT-201', 'Nível do tambor, medido por pressão diferencial entre as fases líquida e vapor.', 'Alimenta o LIC-201 e as chaves LSLL-221 / LSHH-227.', 'Trip < 15 % · alarme > 85 %'),
  'tx-FT-202': tx('FT-202', 'Vazão de água de alimentação que entra no tambor.', 'Mostra o efeito da LV-201 e da bomba P-201.'),
  'tx-FT-203': tx('FT-203', 'Vazão de vapor que vai para a turbina.', 'É a "demanda": se sai mais vapor do que entra água, o nível cai.'),
  'tx-PT-204': tx('PT-204', 'Pressão do vapor no coletor (0–100 bar, nominal 60).', 'Alimenta o PIC-204, que ajusta o gás. Origem do PSHH-222.', 'Trip > 75 bar'),
  'tx-TT-205': tx('TT-205', 'Temperatura do vapor superaquecido.', 'Alimenta o TIC-205, que dosa o spray da TV-205.'),
  'tx-FT-206': tx('FT-206', 'Vazão de gás natural para o queimador.', 'Com o FT-207 e o AT-208, mostra se a relação ar/gás está certa.'),
  'tx-FT-207': tx('FT-207', 'Vazão de ar de combustão.', 'O damper segue o gás com ~17 % de excesso de ar; na purga vai a 100 %.'),
  'tx-AT-208': tx('AT-208', 'Analisador de O₂ nos gases de exaustão.', 'O₂ baixo = combustão incompleta (fuligem, CO); alto = ar demais (desperdício). Ideal ≈ 3 %.'),
  'tx-PT-210': tx('PT-210', 'Pressão da fornalha (tiragem), em mbar.', 'Levemente negativa: os gases são puxados para a chaminé, sem vazar para fora.'),
  'tx-PT-211': tx('PT-211', 'Pressão de suprimento de gás.', 'Origem das chaves PSLL-224 e PSHH-225.', 'Trip < 1,5 bar ou > 6,5 bar'),
  'sw-LSLL-221': { title: 'LSLL-221', kind: 'Chave de nível muito baixo (SIS)', what: 'Atua quando LT-201 < 15 %.', why: 'Tambor seco superaquece os tubos e pode rompê-los. Efeito: MFT.' },
  'sw-LSHH-227': { title: 'LSHH-227', kind: 'Chave de nível muito alto (SIS)', what: 'Atua quando LT-201 > 85 %.', why: 'Água arrastada para a turbina danifica as palhetas. Efeito: alarme e fecha a LV-201 — sem trip.' },
  'sw-BE-223': { title: 'BE-223', kind: 'Detector de chama (SIS)', what: 'Sensor que "vê" a chama do queimador.', why: 'Sem chama, o gás continuaria entrando e acumulando na fornalha. Efeito: MFT.' },
  'ctl-LIC-201': { title: 'LIC-201', kind: 'Controlador de nível', what: 'Compara LT-201 com o setpoint e abre/fecha a LV-201.', why: 'Nem tambor seco, nem tambor afogado.', loop: 'lic' },
  'ctl-PIC-204': { title: 'PIC-204', kind: 'Controlador de pressão', what: 'Compara PT-204 com o setpoint e ajusta a FV-206 (gás).', why: 'O gás queimado acompanha a demanda de vapor.', loop: 'pic' },
  'ctl-TIC-205': { title: 'TIC-205', kind: 'Controlador de temperatura', what: 'Compara TT-205 com o setpoint e dosa o spray da TV-205.', why: 'Limita o superaquecimento para proteger a turbina.', loop: 'tic' },
  'valve-LV-201': { title: 'LV-201', kind: 'Válvula de água de alimentação', what: 'Comandada pelo LIC-201.', why: 'O LSHH-227 a fecha por cima do controle.', valve: 'lv' },
  'valve-FV-206': { title: 'FV-206', kind: 'Válvula de gás natural', what: 'Comandada pelo PIC-204.', why: 'É a ação comum de todo MFT: o SIS a fecha, mesmo com o PIC em manual.', valve: 'fv' },
  'valve-TV-205': { title: 'TV-205', kind: 'Válvula de spray (atemperação)', what: 'Comandada pelo TIC-205.', why: 'Injeta água no vapor para baixar a temperatura.', valve: 'tv' },
  'pump-P-201': { title: 'P-201', kind: 'Bomba de água de alimentação', what: 'Leva a água do tanque até o tambor.', why: 'Se ela para (cenário 1), o nível cai até o LSLL-221.' },
  'damper': { title: 'Damper', kind: 'Registro de ar de combustão', what: 'Regula o ar do ventilador para a fornalha.', why: 'Na purga abre 100 % para varrer os gases antes de religar.', valve: 'damper' },
  'drum': { title: 'Tambor / Caldeira aquatubular', kind: 'Equipamento', what: 'Água circula por dentro dos tubos, aquecidos pela chama; no tambor superior a água e o vapor se separam.', why: 'A faixa azul mostra o nível (LT-201); a linha tracejada é o setpoint.' },
  'psv-PSV-230': { title: 'PSV-230', kind: 'Válvula de segurança (mecânica)', what: 'Abre sozinha por mola se a pressão passar de 85 bar.', why: 'Última barreira: independe de energia e de CLP. O SIS deve atuar antes (75 bar).' },
  'turbine': { title: 'Turbina + gerador', kind: 'Equipamento', what: 'O vapor gira a turbina, que move o gerador.', why: 'Sem queima, a turbina perde vapor e a potência (MW) cai.' },
  'sis-block': { title: 'SIS / BMS', kind: 'CLP de segurança', what: 'Recebe os sinais das chaves direto do campo, separado do controle.', why: 'Executa o MFT, a purga e os permissivos de partida. As TAGs acendem quando atuam.' },
};

// ---------- tour ----------

// target: seletor CSS do elemento destacado. layout: força um layout antes do passo.
export const TOUR_STEPS = [
  { target: null, title: 'Bem-vindo ao mini-SCADA', text: 'Este simulador mostra uma caldeira aquatubular a gás com suas malhas de controle e o SIS que a protege. Use as setas ← → ou os botões para navegar; Esc sai.' },
  { target: '.synoptic-wrap', title: 'O sinótico', text: 'É o P&ID da planta, ao vivo. Linha cinza = processo, tracejado azul = controle, pontilhado vermelho = SIS. Tudo fica cinza enquanto está normal: a cor aparece só quando algo precisa de atenção.' },
  { target: '#tx-LT-201', title: 'Instrumentos', text: 'Cada balão é um instrumento: letras = função (L = nível, T = transmissor), número = malha. A caixa preta ao lado mostra o valor medido. Passe o mouse em qualquer instrumento ou equipamento para ver a explicação.' },
  { target: '#faceplates .faceplate', title: 'Malhas de controle', text: 'Este é o faceplate do LIC-201 (há também PIC-204 e TIC-205 logo abaixo). Cada um compara a medição (PV) com o setpoint (SP) e move a válvula (MV). Você pode mudar o SP ou passar para MAN e comandar a válvula direto.' },
  { target: '#sisStrip', title: 'A faixa do SIS', text: 'Aqui você acompanha o Master Fuel Trip: os 5 passos da sequência, a primeira causa, a purga e os permissivos. O botão RESET só libera com tudo verde.' },
  { target: '#scenarios', title: 'Cenários', text: 'Cada botão injeta uma falha real. A planta caminha até o limite e o SIS atua. Teclas 1–6, E para emergência, 0 para corrigir e R para religar.' },
  { target: '#narrator', title: 'O que está acontecendo?', text: 'Esta faixa explica em tempo real o que a planta e o SIS estão fazendo e qual é o próximo passo. Tecle D para mostrar ou esconder.' },
  { target: '[data-layout="sala"]', targetParent: true, title: 'Layouts', text: 'Sala (operar), Matriz (a matriz de causa e efeito acendendo ao vivo) e Palco (planta em tela cheia para o projetor). Tecla M alterna.' },
  { target: '[data-source="dynamic"]', targetParent: true, title: 'Fonte de dados', text: 'Dinâmica: a planta evolui sozinha. Sliders: você arrasta o valor de cada transmissor e o SIS avalia na hora. Tecla S alterna.' },
  { target: '#drawerBtn', title: 'Tendências e alarmes', text: 'Gráficos dos últimos 2 minutos com setpoints e limites de trip, mais o registro de eventos estilo SCADA. Tecla T.' },
  { target: null, title: 'Experimente', text: 'Feche o tour e tecle 3 (falha de chama). Observe a sequência no rodapé, espere a purga, tecle 0 e depois R. O tutorial completo está no botão "?".' },
];
