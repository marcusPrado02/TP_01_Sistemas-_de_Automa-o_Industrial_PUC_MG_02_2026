// Controlador PI posicional com anti-windup e transferência sem solavanco (AUTO ↔ MAN).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class Pid {
  constructor({ sp, kc, ti, action = 'reverse', bias = 50, min = 0, max = 100 }) {
    Object.assign(this, { sp, kc, ti, action, bias, min, max });
    this.mode = 'AUTO';
    this.integral = 0;
    this.out = bias;
  }

  error(pv) {
    return this.action === 'reverse' ? this.sp - pv : pv - this.sp;
  }

  // integrate=false congela a parcela integral (usado na entrada manual por sliders,
  // onde a PV não reage à saída e o integral só faria a válvula saturar).
  update(pv, dt, { integrate = true } = {}) {
    const e = this.error(pv);
    const p = this.kc * e;
    if (this.mode === 'MAN') {
      this.integral = this.out - this.bias - p;
      return this.out;
    }
    let integral = this.integral;
    if (integrate && this.ti > 0) integral += (this.kc * e * dt) / this.ti;
    const raw = this.bias + p + integral;
    const out = clamp(raw, this.min, this.max);
    // Anti-windup: só aceita o novo integral se a saída não saturou.
    if (raw === out) this.integral = integral;
    this.out = out;
    return out;
  }

  // Força a saída (ex.: válvula fechada pelo SIS) mantendo o controlador pronto para retomar sem solavanco.
  track(value, pv) {
    this.out = clamp(value, this.min, this.max);
    this.integral = this.out - this.bias - this.kc * this.error(pv);
  }

  setMode(mode) {
    this.mode = mode;
  }
}
