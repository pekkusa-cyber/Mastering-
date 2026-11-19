// Loudness enligt ITU-R BS.1770-4 / EBU R128: K-vägning, integrerad loudness med gating (−70 LUFS absolut,
// −10 LU relativt), momentary (400 ms), short-term (3 s), loudness range (EBU Tech 3342) och true peak.
import { truePeak, toDb } from './truepeak.js';

/** K-vägningens två steg för valfri samplingsfrekvens (samma formler som libebur128). */
export function kWeightCoeffs(fs) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, hp];
}

/** K-vägd kvadratsumma per 100 ms-del (alla kanaler, vikt 1 för L/R). */
function subBlockPowers(channels, fs) {
  const step = Math.round(fs / 10);
  const n = channels[0].length;
  const blocks = Math.floor(n / step);
  const sums = new Float64Array(blocks);
  const [s, h] = kWeightCoeffs(fs);
  for (const x of channels) {
    let z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    for (let b = 0; b < blocks; b++) {
      let acc = 0;
      const end = (b + 1) * step;
      for (let i = b * step; i < end; i++) {
        const v = x[i];
        const y = s.b0 * v + z1; z1 = s.b1 * v - s.a1 * y + z2; z2 = s.b2 * v - s.a2 * y;
        const u = h.b0 * y + w1; w1 = h.b1 * y - h.a1 * u + w2; w2 = h.b2 * y - h.a2 * u;
        acc += u * u;
      }
      sums[b] += acc / step;
    }
  }
  return sums; // medelkvadrat per 100 ms-del, summerad över kanaler
}

const lufs = (z) => (z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity);

/** Glidande medel av `len` 100 ms-delar med steg 1 (= 100 ms hopp). */
function windows(sub, len) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < sub.length; i++) {
    acc += sub[i];
    if (i >= len) acc -= sub[i - len];
    if (i >= len - 1) out.push(acc / len);
  }
  return out;
}

export function integrated(blockPowers) {
  const abs = blockPowers.filter((z) => lufs(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((z) => lufs(z) > rel);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

export function loudnessRange(shortPowers) {
  const abs = shortPowers.filter((z) => lufs(z) > -70);
  if (abs.length < 2) return 0;
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 20;
  const vals = abs.map(lufs).filter((l) => l > rel).sort((a, b) => a - b);
  if (vals.length < 2) return 0;
  const pct = (p) => vals[Math.round((vals.length - 1) * p)];
  return pct(0.95) - pct(0.10);
}

/**
 * Mäter en hel buffert (array av Float32Array, en per kanal).
 * Svarar { integrated, momentaryMax, shortTermMax, shortTerm: [LUFS per 100 ms], lra, truePeak, samplePeak } (dB).
 */
export function measure(channels, fs, { withTruePeak = true } = {}) {
  const sub = subBlockPowers(channels, fs);
  const mom = windows(sub, 4);
  const short = windows(sub, 30);
  let sp = 0;
  for (const x of channels) for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > sp) sp = a; }
  return {
    integrated: integrated(mom),
    momentaryMax: mom.length ? Math.max(...mom.map(lufs)) : -Infinity,
    shortTermMax: short.length ? Math.max(...short.map(lufs)) : -Infinity,
    shortTerm: short.map(lufs),
    lra: loudnessRange(short),
    truePeak: withTruePeak ? toDb(truePeak(channels)) : NaN,
    samplePeak: toDb(sp),
  };
}
