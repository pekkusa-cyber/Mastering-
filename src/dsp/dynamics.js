// Dynamikprocessorer för filmastringen: kompressor (multiband/buss), transient shaper och soft clipper.
// Alla arbetar stereolänkat (samma förstärkning på båda kanalerna) så att stereobilden inte vandrar.

const dbToLin = (db) => 10 ** (db / 20);
const linToDb = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const coef = (ms, fs) => (ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * fs)));

/** Statisk kompressionskurva med mjukt knä. Svarar förstärkningsändring i dB (≤ 0). */
export function gainComputer(levelDb, threshold, ratio, knee) {
  const over = levelDb - threshold;
  const slope = 1 / ratio - 1;
  if (knee > 0 && 2 * Math.abs(over) <= knee) return (slope * (over + knee / 2) ** 2) / (2 * knee);
  return over > 0 ? slope * over : 0;
}

export class Compressor {
  constructor(fs) { this.fs = fs; this.env = 0; this.p = null; this.gainNow = 1; }
  set(p) { this.p = { threshold: 0, ratio: 1, attack: 10, release: 150, knee: 6, preGain: 0, postGain: 0, ...p }; }
  /** Bearbetar L/R på plats i [0, n). Svarar största förstärkningsminskning (dB, positiv). */
  run(L, R, n) {
    const { threshold, ratio, attack, release, knee, preGain, postGain } = this.p;
    const fs = this.fs;
    const aA = coef(attack, fs), aR = coef(release, fs);
    const pre = dbToLin(preGain), postTarget = dbToLin(postGain);
    const smooth = coef(20, fs); // mjuk övergång för för/efterförstärkning (inga klick)
    let env = this.env, g = this.gainNow, maxGr = 0;
    const active = ratio > 1.0001;
    for (let i = 0; i < n; i++) {
      const l = L[i] * pre, r = R[i] * pre;
      let gr = 0;
      if (active) {
        const lev = linToDb(Math.max(Math.abs(l), Math.abs(r)));
        const target = -gainComputer(lev, threshold, ratio, knee); // positiv dB
        env = target > env ? aA * env + (1 - aA) * target : aR * env + (1 - aR) * target;
        gr = env;
        if (gr > maxGr) maxGr = gr;
      }
      g = smooth * g + (1 - smooth) * postTarget;
      const k = dbToLin(-gr) * g;
      L[i] = l * k; R[i] = r * k;
    }
    this.env = env; this.gainNow = g;
    return maxGr;
  }
}

/**
 * Transient shaper: skillnaden mellan en snabb och en långsam envelope är "anslaget". amount −100…+100:
 * negativt mjukar upp anslaget (t.ex. en hård kick), positivt förstärker det. Max ±9 dB.
 */
export class TransientShaper {
  constructor(fs) { this.fs = fs; this.fast = 0; this.slow = 0; this.amount = 0; this.g = 0; }
  set(amount) { this.amount = Math.max(-100, Math.min(100, amount || 0)); }
  run(L, R, n) {
    const fs = this.fs;
    const fA = coef(0.5, fs), fR = coef(40, fs), sA = coef(25, fs), sR = coef(40, fs);
    const k = this.amount / 100, sm = coef(2, fs);
    let fast = this.fast, slow = this.slow, g = this.g;
    if (k === 0 && Math.abs(g) < 1e-6) {
      for (let i = 0; i < n; i++) { const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); fast = x > fast ? fA * fast + (1 - fA) * x : fR * fast + (1 - fR) * x; slow = x > slow ? sA * slow + (1 - sA) * x : sR * slow + (1 - sR) * x; }
    } else {
      for (let i = 0; i < n; i++) {
        const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        fast = x > fast ? fA * fast + (1 - fA) * x : fR * fast + (1 - fR) * x;
        slow = x > slow ? sA * slow + (1 - sA) * x : sR * slow + (1 - sR) * x;
        const diff = Math.max(0, linToDb(fast + 1e-9) - linToDb(slow + 1e-9));
        const target = Math.max(-9, Math.min(9, k * diff));
        g = sm * g + (1 - sm) * target;
        const m = dbToLin(g);
        L[i] *= m; R[i] *= m;
      }
    }
    this.fast = fast; this.slow = slow; this.g = g;
  }
}

/**
 * Soft clipper: rundar av toppar över ett knä (3 dB under taket) mjukt mot taket c. Utsignalen når aldrig över c.
 */
export function softClip(L, R, n, ceilingDb, kneeDb = 3) {
  const c = dbToLin(ceilingDb), a = c * dbToLin(-kneeDb), w = c - a;
  let clipped = 0;
  for (const X of [L, R]) {
    for (let i = 0; i < n; i++) {
      const x = X[i], ax = Math.abs(x);
      if (ax > a) { X[i] = Math.sign(x) * (a + w * Math.tanh((ax - a) / w)); clipped++; }
    }
  }
  return clipped;
}

export { dbToLin, linToDb, coef };
