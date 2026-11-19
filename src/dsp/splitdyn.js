// Dynamisk bandsänkning för de-esser och "glitter"-filter.
// Signalen delas med Linkwitz-Riley (summerar platt) vid en gränsfrekvens. En detektor jämför energin i
// problemområdet med hela signalens: när s-ljud (eller fräs i toppen) sticker ut relativt resten sänks det övre
// bandet en stund – annars rörs ingenting. amount 0 = helt av (bit-transparent).
import { Biquad, coeffs } from './biquad.js';
import { coef } from './dynamics.js';

const Q = Math.SQRT1_2;
const lr = (type, fs, f) => [new Biquad(coeffs(type, fs, f, Q)), new Biquad(coeffs(type, fs, f, Q))];
const db = (x) => 10 * Math.log10(Math.max(x, 1e-20));

export class SplitDynamics {
  /**
   * @param split gränsfrekvens (Hz) – det övre bandet sänks
   * @param detect { f, q } bandpass för detektorn, eller null = det övre bandet självt
   * @param rel tröskel: hur många dB detektorn får ligga under hela signalen innan den börjar sänka
   * @param maxGr största sänkning (dB) vid amount 100; staticDb = fast sänkning av övre bandet vid amount 100
   */
  constructor(fs, { split, detect = null, rel = -10, maxGr = 10, staticDb = 0, attack = 0.5, release = 60 }) {
    Object.assign(this, { fs, rel, maxGr, staticDb });
    this.lp = lr('lowpass', fs, split); this.hp = lr('highpass', fs, split);
    this.det = detect ? new Biquad(coeffs('peaking', fs, detect.f, detect.q, 0)) : null;
    if (detect) { // bandpass (konstant toppförstärkning 0 dB) via RBJ
      const w = (2 * Math.PI * detect.f) / fs, alpha = Math.sin(w) / (2 * detect.q), a0 = 1 + alpha;
      this.det = new Biquad({ b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - alpha) / a0 }, 1);
    }
    this.aA = coef(attack, fs); this.aR = coef(release, fs);
    this.envD = 0; this.envF = 0; this.gr = 0; this.amount = 0; this.maxSeen = 0;
    this.lo = [null, null]; this.hi = [null, null];
  }
  set(amount) { this.amount = Math.max(0, Math.min(100, amount || 0)); }

  run(L, R, n) {
    if (this.amount === 0 && this.gr < 1e-4) return;
    if (!this.lo[0] || this.lo[0].length < n) { this.lo = [new Float32Array(n), new Float32Array(n)]; this.hi = [new Float32Array(n), new Float32Array(n)]; this.d = new Float32Array(n); }
    const [lL, lR] = this.lo, [hL, hR] = this.hi, d = this.d;
    lL.set(L.subarray(0, n)); lR.set(R.subarray(0, n)); hL.set(L.subarray(0, n)); hR.set(R.subarray(0, n));
    for (const f of this.lp) { f.run(lL, 0, 0, n); f.run(lR, 1, 0, n); }
    for (const f of this.hp) { f.run(hL, 0, 0, n); f.run(hR, 1, 0, n); }
    for (let i = 0; i < n; i++) d[i] = this.det ? (L[i] + R[i]) * 0.5 : (hL[i] + hR[i]) * 0.5;
    if (this.det) this.det.run(d, 0, 0, n);
    const k = this.amount / 100, maxGr = this.maxGr * k, stat = 10 ** ((this.staticDb * k) / 20);
    const aA = this.aA, aR = this.aR, slow = coef(30, this.fs);
    let envD = this.envD, envF = this.envF, gr = this.gr;
    for (let i = 0; i < n; i++) {
      const x = d[i] * d[i], m = ((L[i] + R[i]) * 0.5) ** 2;
      envD = x > envD ? aA * envD + (1 - aA) * x : aR * envD + (1 - aR) * x;
      envF = slow * envF + (1 - slow) * m;
      const over = db(envD) - db(envF) - this.rel;
      const target = over > 0 ? Math.min(maxGr, over * 0.8 * k) : 0;
      gr = target > gr ? aA * gr + (1 - aA) * target : aR * gr + (1 - aR) * target;
      if (gr > this.maxSeen) this.maxSeen = gr;
      const g = stat * 10 ** (-gr / 20);
      L[i] = lL[i] + hL[i] * g; R[i] = lR[i] + hR[i] * g;
    }
    this.envD = envD; this.envF = envF; this.gr = gr;
  }
}

/** De-esser: s-ljud 5–10 kHz. */
export const deEsser = (fs) => new SplitDynamics(fs, { split: 4500, detect: { f: 7000, q: 1.2 }, rel: -8, maxGr: 10, attack: 0.5, release: 60 });
/** Mjuk topp: fräs/glitter över 11 kHz, plus en fast sänkning på upp till 3 dB. */
export const glitterFilter = (fs) => new SplitDynamics(fs, { split: 11000, rel: -26, maxGr: 8, staticDb: -3, attack: 1, release: 80 });
