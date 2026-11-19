// Biquad-filter (RBJ Audio EQ Cookbook) – grunden för EQ, crossover och K-vägning.
// Koefficienter normaliseras så att a0 = 1. Bearbetning i transponerad direktform II.

export function coeffs(type, fs, f, q = Math.SQRT1_2, gainDb = 0) {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * Math.min(f, fs * 0.499)) / fs;
  const cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'allpass': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(`okänd filtertyp ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Ett filter med eget tillstånd per kanal. */
export class Biquad {
  constructor(c, channels = 2) {
    this.c = c;
    this.z1 = new Float64Array(channels);
    this.z2 = new Float64Array(channels);
  }
  set(c) { this.c = c; }
  /** Bearbetar buf[from..to) för kanal ch, på plats. */
  run(buf, ch, from = 0, to = buf.length) {
    const { b0, b1, b2, a1, a2 } = this.c;
    let z1 = this.z1[ch], z2 = this.z2[ch];
    for (let i = from; i < to; i++) {
      const x = buf[i];
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      buf[i] = y;
    }
    this.z1[ch] = z1; this.z2[ch] = z2;
  }
}

/** Amplitudsvar (dB) vid frekvensen f – används i tester och för att rita EQ-kurvor. */
export function responseDb(c, fs, f) {
  const w = (2 * Math.PI * f) / fs;
  const cr = (k) => Math.cos(k * w), ci = (k) => -Math.sin(k * w);
  const nr = c.b0 + c.b1 * cr(1) + c.b2 * cr(2), ni = c.b1 * ci(1) + c.b2 * ci(2);
  const dr = 1 + c.a1 * cr(1) + c.a2 * cr(2), di = c.a1 * ci(1) + c.a2 * ci(2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}
