// Lyssningshjälp för direktlyssningen i Fil (bara medan man lyssnar – aldrig i renderingen eller exporten):
// - AreaListen: hör bara ett frekvensområde (solo) eller allt utom det (mute), med Linkwitz-Riley-delning
//   (summerar platt i amplitud), som solo/mute på ett band i en riktig EQ eller multibandkompressor.
// - Monitor: mono, och "lyssna som" mobilhögtalare eller bil.
// - LevelMatch: K-vägd glidande nivå för automatisk "Lika nivå" mellan A och B.
import { Biquad, coeffs } from './biquad.js';
import { kWeightCoeffs } from './loudness.js';

const Q = Math.SQRT1_2;
/** Linkwitz-Riley 8:e ordningen (två Butterworth 4 i följd, 48 dB/oktav) – brant nog för solo/mute på ett band. */
const BW4 = [0.5411961, 1.3065630];
class LR4 {
  constructor(type, fs, f) { this.f = [...BW4, ...BW4].map((q) => new Biquad(coeffs(type, fs, f, q))); }
  run(x, ch, n) { for (const b of this.f) b.run(x, ch, 0, n); }
}

export class AreaListen {
  constructor(fs) { this.fs = fs; this.mode = null; this.buf = null; }
  /** lo/hi i Hz, mode 'solo' | 'mute' | null (av). */
  set(lo, hi, mode) {
    const fs = this.fs, nyq = fs * 0.45;
    if (!mode) { this.mode = null; return; }
    const a = Math.max(20, Math.min(nyq, lo)), b = Math.max(a * 1.05, Math.min(nyq, hi));
    if (this.mode === mode && this.lo === a && this.hi === b) return;
    Object.assign(this, { mode, lo: a, hi: b });
    this.lowA = a > 25 ? new LR4('lowpass', fs, a) : null; this.highA = a > 25 ? new LR4('highpass', fs, a) : null;
    this.lowB = b < nyq * 0.98 ? new LR4('lowpass', fs, b) : null; this.highB = b < nyq * 0.98 ? new LR4('highpass', fs, b) : null;
  }
  run(L, R, n) {
    if (!this.mode) return;
    if (!this.buf || this.buf[0].length < n) this.buf = [0, 1, 2, 3].map(() => new Float32Array(n));
    const [lowL, lowR, hiL, hiR] = this.buf;
    // låg del (under lo) och resten
    for (const [x, low, ch] of [[L, lowL, 0], [R, lowR, 1]]) {
      if (this.lowA) { low.set(x.subarray(0, n)); this.lowA.run(low, ch, n); this.highA.run(x, ch, n); } else low.fill(0);
    }
    // resten delas vid hi: mitten (området) och hög del
    for (const [x, hi, ch] of [[L, hiL, 0], [R, hiR, 1]]) {
      if (this.lowB) { hi.set(x.subarray(0, n)); this.highB.run(hi, ch, n); this.lowB.run(x, ch, n); } else hi.fill(0);
    }
    if (this.mode === 'mute') for (let i = 0; i < n; i++) { L[i] = lowL[i] + hiL[i]; R[i] = lowR[i] + hiR[i]; }
    // solo: L/R är redan bara mitten
  }
}

/** Mono och "lyssna som": 'normal' | 'mobil' (liten högtalare: inget under ~350 Hz, inget över ~7 kHz, mono) | 'bil'. */
export class Monitor {
  constructor(fs) {
    this.fs = fs; this.mono = false; this.sim = 'normal';
    this.mobil = [new Biquad(coeffs('highpass', fs, 350, Q)), new Biquad(coeffs('highpass', fs, 350, Q)),
      new Biquad(coeffs('peaking', fs, 2000, 1, 3)), new Biquad(coeffs('lowpass', fs, 7000, Q))];
    this.bil = [new Biquad(coeffs('lowshelf', fs, 90, Q, 5)), new Biquad(coeffs('peaking', fs, 250, 1, 2)),
      new Biquad(coeffs('highshelf', fs, 8000, Q, -3)), new Biquad(coeffs('highpass', fs, 35, Q))];
  }
  set({ mono = this.mono, sim = this.sim } = {}) { this.mono = !!mono; this.sim = sim; }
  run(L, R, n) {
    if (this.mono || this.sim === 'mobil') for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) * 0.5; L[i] = m; R[i] = m; }
    const chain = this.sim === 'mobil' ? this.mobil : this.sim === 'bil' ? this.bil : null;
    if (chain) for (const b of chain) { b.run(L, 0, 0, n); b.run(R, 1, 0, n); }
  }
}

/** Glidande K-vägd nivå (medelkvadrat, tidskonstant ~3 s) – samma vägning som LUFS. */
export class LevelMatch {
  constructor(fs, seconds = 3) {
    const [s, h] = kWeightCoeffs(fs);
    this.k = [new Biquad(s, 1), new Biquad(h, 1)];
    this.a = Math.exp(-1 / (seconds * fs));
    this.ms = 1e-9; this.buf = null;
  }
  run(L, R, n) {
    if (!this.buf || this.buf.length < n) this.buf = new Float32Array(n);
    const b = this.buf;
    for (let i = 0; i < n; i++) b[i] = (L[i] + R[i]) * 0.5;
    for (const f of this.k) f.run(b, 0, 0, n);
    let ms = this.ms; const a = this.a;
    for (let i = 0; i < n; i++) ms = a * ms + (1 - a) * b[i] * b[i];
    this.ms = ms;
    return ms;
  }
  get db() { return 10 * Math.log10(Math.max(this.ms, 1e-12)); }
}
