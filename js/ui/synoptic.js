// Sinótico P&ID desenhado em SVG seguindo docs/referencia/pid-planta.png (viewBox 1600 × 780).

import { INTERLOCKS, TRANSMITTERS } from '../config.js';
import { STATE } from '../sis.js';

// Transmissores de campo: posição do balão, para onde vai a haste e onde fica a leitura ao vivo.
const FIELD = {
  'LT-201': { x: 648,  y: 108, stem: [648, 144, 648, 178],  readout: [648, 22] },
  'PT-210': { x: 734,  y: 108, stem: [734, 144, 734, 178],  readout: [734, 22] },
  'FT-202': { x: 383,  y: 155, stem: [383, 191, 383, 240],  readout: [383, 100] },
  'TT-205': { x: 1138, y: 155, stem: [1138, 191, 1138, 240], readout: [1056, 150] },
  'FT-203': { x: 1357, y: 155, stem: [1357, 191, 1357, 240], readout: [1442, 150] },
  'PT-204': { x: 1357, y: 332, stem: [1357, 296, 1357, 240], readout: [1442, 332] },
  'PT-211': { x: 270,  y: 347, stem: [270, 383, 270, 432],  readout: [186, 347] },
  'FT-206': { x: 376,  y: 347, stem: [376, 383, 376, 432],  readout: [376, 292] },
  'FT-207': { x: 290,  y: 505, stem: [290, 541, 290, 590],  readout: [196, 505] },
  'AT-208': { x: 1152, y: 558, stem: [1152, 522, 1152, 488], readout: [1240, 558] },
};

const SIS_SWITCH = {
  'LSLL-221': { x: 648, y: 545 },
  'LSHH-227': { x: 734, y: 545 },
  'BE-223':   { x: 820, y: 545 },
};

const CONTROLLERS = {
  'LIC-201': { x: 495,  y: 55 },
  'TIC-205': { x: 1250, y: 55 },
  'PIC-204': { x: 945,  y: 352 },
};

const splitTag = (tag) => tag.split('-');

function balloon({ id, tag, x, y, cls = '' }) {
  const [letters, num] = splitTag(tag);
  return `<g class="instrument ${cls}" id="${id}">
    <circle cx="${x}" cy="${y}" r="36"/>
    <line x1="${x - 36}" y1="${y}" x2="${x + 36}" y2="${y}"/>
    <text class="tag-letters" x="${x}" y="${y - 9}">${letters}</text>
    <text class="tag-num" x="${x}" y="${y + 22}">${num}</text>
  </g>`;
}

function controller(tag, { x, y }) {
  const [letters, num] = splitTag(tag);
  return `<g class="controller" id="ctl-${tag}">
    <rect x="${x - 39}" y="${y - 39}" width="78" height="78"/>
    <circle cx="${x}" cy="${y}" r="36"/>
    <line x1="${x - 36}" y1="${y}" x2="${x + 36}" y2="${y}"/>
    <text class="tag-letters" x="${x}" y="${y - 9}">${letters}</text>
    <text class="tag-num" x="${x}" y="${y + 22}">${num}</text>
  </g>`;
}

function valve(tag, x, y) {
  return `<g class="valve" id="valve-${tag}">
    <path class="body" d="M${x - 30},${y - 22} L${x},${y} L${x - 30},${y + 22} Z M${x + 30},${y - 22} L${x},${y} L${x + 30},${y + 22} Z"/>
    <line class="stem" x1="${x}" y1="${y}" x2="${x}" y2="${y - 26}"/>
    <path class="dome" d="M${x - 25},${y - 26} A25,18 0 0 1 ${x + 25},${y - 26} Z"/>
    <text class="eq-label" x="${x}" y="${y + 44}">${tag}</text>
    <text class="valve-open" id="open-${tag}" x="${x}" y="${y + 64}">--</text>
  </g>`;
}

function readout(tag, [x, y]) {
  return `<g class="readout" id="ro-${tag}">
    <rect x="${x - 39}" y="${y - 13}" width="78" height="26" rx="4"/>
    <text x="${x}" y="${y + 6}" id="rv-${tag}">--</text>
  </g>`;
}

function pipe(id, d, arrow = true) {
  return `<path class="pipe" d="${d}" ${arrow ? 'marker-end="url(#arrow-proc)"' : ''}/>
    <path class="pipe-flow" data-flow="${id}" d="${d}"/>`;
}

function box(x, y, w, h, lines, id = '') {
  const tspans = lines.map((l, i) => `<tspan x="${x + w / 2}" dy="${i === 0 ? 0 : 26}">${l}</tspan>`).join('');
  const ty = y + h / 2 - ((lines.length - 1) * 26) / 2 + 8;
  return `<g class="equipment" ${id ? `id="${id}"` : ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
    <text class="eq-title" x="${x + w / 2}" y="${ty}">${tspans}</text></g>`;
}

function markup() {
  const field = Object.entries(FIELD).map(([tag, f]) => `
    <line class="stem-line" x1="${f.stem[0]}" y1="${f.stem[1]}" x2="${f.stem[2]}" y2="${f.stem[3]}"/>
    ${balloon({ id: `tx-${tag}`, tag, x: f.x, y: f.y })}
    ${readout(tag, f.readout)}`).join('');

  const sisSwitches = Object.entries(SIS_SWITCH).map(([tag, s]) => `
    <line class="stem-line" x1="${s.x}" y1="474" x2="${s.x}" y2="${s.y - 36}"/>
    <path class="sis-line" id="sisline-${tag}" d="M${s.x},${s.y + 36} V656" marker-end="url(#arrow-sis)"/>
    ${balloon({ id: `sw-${tag}`, tag, x: s.x, y: s.y, cls: 'sis-switch' })}`).join('');

  const sisItems = INTERLOCKS.map((il, i) => `<tspan id="sis-item-${il.tag}" class="sis-item">${il.tag}${i < INTERLOCKS.length - 1 ? ', ' : ''}</tspan>`).join('');

  return `
  <defs>
    <marker id="arrow-proc" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" class="mk-proc"/></marker>
    <marker id="arrow-ctl" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" class="mk-ctl"/></marker>
    <marker id="arrow-sis" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" class="mk-sis"/></marker>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="water-top"/><stop offset="1" class="water-bottom"/></linearGradient>
    <clipPath id="drum-clip"><rect x="630" y="186" width="210" height="96" rx="6"/></clipPath>
  </defs>

  <!-- linhas de processo -->
  ${pipe('water', 'M205,240 H246', true)}
  ${pipe('water', 'M306,240 H463', true)}
  ${pipe('water', 'M527,240 H618', true)}
  ${pipe('steam', 'M850,240 H901', true)}
  ${pipe('steam', 'M1110,240 H1218', true)}
  ${pipe('steam', 'M1282,240 H1421', true)}
  ${pipe('gas', 'M207,432 H463', true)}
  ${pipe('gas', 'M527,432 H618', true)}
  ${pipe('air', 'M221,590 H408', true)}
  ${pipe('air', 'M504,590 H575 V458 H618', true)}
  ${pipe('flue', 'M850,452 H1070', true)}
  <line class="pipe" x1="1490" y1="240" x2="1512" y2="240"/>

  <!-- equipamentos -->
  ${box(42, 204, 165, 72, ['Tanque de', 'Alimentação'])}
  ${box(42, 396, 165, 72, ['Rede de', 'Gás Natural'], 'eq-gasnet')}
  ${box(29, 554, 192, 72, ['Ventilador /', 'Ar Combustão'])}
  ${box(903, 204, 205, 72, ['Superaquecedor'])}
  ${box(1072, 416, 160, 72, ['Chaminé e', 'Exaustão'])}

  <g class="pump" id="pump-P-201">
    <circle cx="277" cy="240" r="28"/>
    <line x1="277" y1="212" x2="314" y2="212" class="pump-out"/>
    <path d="M262,266 L292,266 L286,276 L268,276 Z" class="pump-foot"/>
    <g class="rotor" id="pump-rotor"><line x1="277" y1="226" x2="277" y2="254"/><line x1="263" y1="240" x2="291" y2="240"/></g>
    <text class="eq-label" x="277" y="302">P-201</text>
  </g>

  <g class="drum" id="drum">
    <rect class="drum-shell" x="622" y="178" width="226" height="296" rx="16"/>
    <g clip-path="url(#drum-clip)">
      <rect class="drum-water" id="drum-water" x="630" y="234" width="210" height="48" fill="url(#water)"/>
    </g>
    <line class="sp-mark" x1="630" y1="234" x2="840" y2="234"/>
    <text class="eq-title" x="735" y="222">Tambor / Caldeira</text>
    <text class="eq-title" x="735" y="250">Aquatubular</text>
    <line class="drum-split" x1="622" y1="287" x2="848" y2="287"/>
    <g class="tubes">
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="${650 + i * 24}" y1="300" x2="${650 + i * 24}" y2="372"/>`).join('')}
    </g>
    <text class="eq-sub" x="735" y="322">Feixe Tubular e</text>
    <text class="eq-sub" x="735" y="344">Fornalha</text>
    <g class="flame" id="flame">
      <path class="flame-outer" d="M735,452 C708,452 700,430 712,412 C718,402 724,398 722,384 C734,394 738,404 736,414 C744,404 748,396 746,384 C762,400 768,424 758,440 C752,450 746,452 735,452 Z"/>
      <path class="flame-inner" d="M735,452 C722,452 718,440 724,430 C728,424 732,420 731,410 C740,418 744,428 742,436 C746,432 748,428 748,422 C754,432 752,446 746,450 C742,452 739,452 735,452 Z"/>
    </g>
    <text class="burner-label" id="burner-label" x="735" y="466">[Queimador]</text>
  </g>

  <g class="turbine" id="turbine">
    <path d="M1423,212 L1490,195 L1490,285 L1423,268 Z"/>
    <text class="eq-label" x="1456" y="246">Turbina</text>
  </g>
  <g class="generator" id="generator">
    <circle cx="1538" cy="240" r="26"/>
    <g class="gen-ring" id="gen-ring"><circle cx="1538" cy="240" r="20"/></g>
    <text class="eq-title" x="1538" y="248">G</text>
    <text class="valve-open" id="gen-mw" x="1538" y="292">--</text>
  </g>

  ${valve('LV-201', 495, 240)}
  ${valve('TV-205', 1250, 240)}
  ${valve('FV-206', 495, 432)}

  <g class="damper" id="damper">
    <rect x="410" y="563" width="92" height="55"/>
    <line x1="410" y1="563" x2="502" y2="618"/><line x1="410" y1="618" x2="502" y2="563"/>
    <text class="eq-label" x="512" y="616" text-anchor="start" style="text-anchor:start">Damper</text>
    <text class="valve-open" id="open-damper" x="512" y="636" style="text-anchor:start">--</text>
  </g>

  <!-- sinais de controle (tracejado azul) -->
  <path class="ctl-line" d="M648,72 V40 H536" marker-end="url(#arrow-ctl)"/>
  <path class="ctl-line" d="M495,94 V186" marker-end="url(#arrow-ctl)"/>
  <path class="ctl-line" d="M1138,119 V40 H1209" marker-end="url(#arrow-ctl)"/>
  <path class="ctl-line" d="M1250,94 V186" marker-end="url(#arrow-ctl)"/>
  <path class="ctl-line" d="M1321,332 H986" marker-end="url(#arrow-ctl)"/>
  <path class="ctl-line" d="M945,391 V646 H442 V386 H468" marker-end="url(#arrow-ctl)"/>

  ${field}
  ${Object.entries(CONTROLLERS).map(([tag, c]) => controller(tag, c)).join('')}
  <line class="stem-line" x1="820" y1="144" x2="820" y2="178"/>
  ${balloon({ id: 'psv-PSV-230', tag: 'PSV-230', x: 820, y: 108, cls: 'psv' })}
  <g class="readout" id="ro-PSV-230"><rect x="781" y="9" width="78" height="26" rx="4"/><text x="820" y="28" id="rv-PSV-230">FECHADA</text></g>

  <!-- SIS / BMS (pontilhado vermelho) -->
  ${sisSwitches}
  <path class="sis-line" id="sisline-FV" d="M347,716 H424 V432 H461" marker-end="url(#arrow-sis)"/>
  <g class="sis-block" id="sis-block">
    <rect x="347" y="660" width="774" height="96" rx="4"/>
    <text class="sis-title" x="734" y="694">SIS / BMS – Intertravamentos e MFT (CLP de Segurança)</text>
    <text class="sis-list" x="734" y="730">(${sisItems})</text>
  </g>`;
}

export class Synoptic {
  constructor(svg) {
    this.svg = svg;
    svg.innerHTML = markup();
    this.q = (sel) => svg.querySelector(sel);
    this.readouts = Object.fromEntries(TRANSMITTERS.map((t) => [t.tag, svg.querySelector(`#rv-${t.tag}`)]));
    this.flows = [...svg.querySelectorAll('.pipe-flow')];
  }

  update(sim) {
    const m = sim.meas;
    const a = sim.actuators;
    const bms = sim.bms;

    for (const t of TRANSMITTERS) this.readouts[t.tag].textContent = `${m[t.key].toFixed(t.digits)} ${t.unit}`;

    const flowOn = { water: m.feed > 3, steam: m.steam > 3, gas: m.gas > 3, air: m.air > 3, flue: m.air > 3 };
    for (const p of this.flows) p.classList.toggle('on', flowOn[p.dataset.flow]);

    this.setValve('LV-201', a.lv);
    this.setValve('TV-205', a.tv);
    this.setValve('FV-206', a.fv);
    this.q('#open-damper').textContent = `${a.damper.toFixed(0)} %`;
    this.q('#damper').classList.toggle('purging', bms.state === STATE.PURGE);

    const pumpOn = !sim.faults.pumpFail || sim.source === 'manual';
    this.q('#pump-P-201').classList.toggle('running', pumpOn);
    this.q('#pump-P-201').classList.toggle('failed', !pumpOn);

    // Nível no tambor: faixa visível 0–100 % ocupa a metade superior do tambor.
    const h = (Math.max(0, Math.min(100, m.level)) / 100) * 96;
    const water = this.q('#drum-water');
    water.setAttribute('y', 282 - h);
    water.setAttribute('height', h);

    const flame = sim.source === 'manual' ? a.pilot && !sim.manual.be223 && m.gas > 2 : sim.plant.flame;
    this.q('#flame').classList.toggle('lit', flame);
    this.q('#burner-label').classList.toggle('off', !flame);

    const spinning = m.steam > 8;
    this.q('#turbine').classList.toggle('spinning', spinning);
    this.q('#gen-ring').classList.toggle('spinning', spinning);
    this.q('#gen-mw').textContent = `${((m.steam / 60) * 50).toFixed(0)} MW`;

    const psvOpen = m.pressure > 85;
    this.q('#psv-PSV-230').classList.toggle('open', psvOpen);
    this.q('#rv-PSV-230').textContent = psvOpen ? 'ALIVIANDO' : 'FECHADA';

    // SIS: chaves, linhas, origem analógica e itens do bloco.
    for (const il of INTERLOCKS) {
      const on = sim.causes[il.tag];
      const isFirst = bms.firstOut === il.tag;
      this.q(`#sis-item-${il.tag}`).classList.toggle('active', on || isFirst);
      const sw = this.q(`#sw-${il.tag}`);
      if (sw) {
        sw.classList.toggle('active', on);
        sw.classList.toggle('first-out', isFirst);
        this.q(`#sisline-${il.tag}`).classList.toggle('active', on || isFirst);
      }
    }
    // Chaves sem balão próprio no P&ID: o transmissor de origem ganha contorno vermelho.
    const tripSources = new Set(
      [['PSHH-222', 'PT-204'], ['PSLL-224', 'PT-211'], ['PSHH-225', 'PT-211']]
        .filter(([tag]) => sim.causes[tag] || bms.firstOut === tag)
        .map(([, src]) => src),
    );
    for (const src of ['PT-204', 'PT-211']) this.q(`#tx-${src}`).classList.toggle('trip-source', tripSources.has(src));
    this.q('#sis-block').classList.toggle('active', bms.tripped);
    this.q('#sisline-FV').classList.toggle('active', bms.tripped);
    this.q('#valve-LV-201').classList.toggle('sis-override', sim.causes['LSHH-227']);
  }

  setValve(tag, open) {
    this.q(`#open-${tag}`).textContent = `${open.toFixed(0)} %`;
    const g = this.q(`#valve-${tag}`);
    g.classList.toggle('closed', open < 1);
    g.style.setProperty('--open', (open / 100).toFixed(2));
  }
}
