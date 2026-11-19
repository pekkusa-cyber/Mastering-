// True peak (ITU-R BS.1770-4, bilaga 2): 4x översampling med ett polyfasigt interpolationsfilter.
// 49 tappar (Kaiser-fönstrad sinc) – mittappen hamnar på en hel originalsampel, så fas 0 ger tillbaka
// originalet och faserna 1–3 ligger på 1/4, 1/2 och 3/4 mellan samplen. Fördröjning: 6 sampel.

export const OS = 4;
const N = 49;
const PHASE_TAPS = Math.ceil(N / OS); // 13
export const DELAY = (N - 1) / 2 / OS; // 6 sampel

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) { term *= (x / (2 * k)) ** 2; sum += term; if (term < 1e-12 * sum) break; }
  return sum;
}

function design() {
  const beta = 8;
  const h = new Float64Array(N);
  const mid = (N - 1) / 2;
  for (let i = 0; i < N; i++) {
    const t = (i - mid) / OS;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = (i - mid) / mid;
    h[i] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / besselI0(beta);
  }
  // Fas p använder tapparna p, p+4, p+8 … på x[n], x[n-1], x[n-2] …; varje fas normaliseras till DC-förstärkning 1
  const phases = [];
  for (let p = 0; p < OS; p++) {
    const taps = new Float64Array(PHASE_TAPS);
    let s = 0;
    for (let j = 0; j < PHASE_TAPS; j++) { const k = p + OS * j; taps[j] = k < N ? h[k] : 0; s += taps[j]; }
    for (let j = 0; j < PHASE_TAPS; j++) taps[j] /= s;
    phases.push(taps);
  }
  return phases;
}
export const PHASES = design();

/**
 * Strömmande true-peak-detektor för en kanal. push(x[n]) returnerar högsta absolutvärdet av de översamplade
 * punkterna vid t, t+¼, t+½ och t+¾ där t = n − DELAY.
 */
export class TruePeakDetector {
  constructor() { this.hist = new Float64Array(PHASE_TAPS); this.pos = 0; }
  push(x) {
    const H = this.hist;
    this.pos = (this.pos + 1) % PHASE_TAPS;
    H[this.pos] = x;
    let peak = 0;
    for (let p = 0; p < OS; p++) {
      const taps = PHASES[p];
      let acc = 0, idx = this.pos;
      for (let j = 0; j < PHASE_TAPS; j++) {
        acc += taps[j] * H[idx];
        idx = idx === 0 ? PHASE_TAPS - 1 : idx - 1;
      }
      const a = Math.abs(acc);
      if (a > peak) peak = a;
    }
    return peak;
  }
}

/** Högsta true peak (linjärt) i en buffert av kanaler. */
export function truePeak(channels) {
  let peak = 0;
  for (const x of channels) {
    const d = new TruePeakDetector();
    for (let i = 0; i < x.length; i++) { const p = d.push(x[i]); if (p > peak) peak = p; }
    for (let i = 0; i < PHASE_TAPS; i++) { const p = d.push(0); if (p > peak) peak = p; } // svansen
  }
  return peak;
}

export const toDb = (lin) => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);
export const fromDb = (db) => 10 ** (db / 20);
