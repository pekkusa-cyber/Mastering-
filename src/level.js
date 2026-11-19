// Konstant utnivå: uppskattar hur mycket live-kedjan ändrar ljudnivån (loudness) jämfört med originalet och
// kompenserar utgången direkt – så att en ändring av EQ, kompression eller ingång inte låter "bättre" bara för att
// den blev högre. Modell: typiskt musikspektrum (rosa-aktigt) genom EQ, multiband (statisk kurva) och limiter,
// K-vägt som LUFS. Ren JS (testas i tests/unit/level.test.js).
import { EQ_CUTOFFS, MBC_CUTOFFS, neutral, peqDb, sanitize } from './chain.js';
import { BAND_CENTERS } from './analysis.js';
import { kWeightCoeffs } from './dsp/loudness.js';
import { responseDb } from './dsp/biquad.js';
import { gainComputer } from './dsp/dynamics.js';

const K = kWeightCoeffs(48000);
const KW = BAND_CENTERS.map((f) => responseDb(K[0], 48000, f) + responseDb(K[1], 48000, f));
// Typisk musik: −3 dB/oktav (rosa) med lite extra bas; summan normeras till programnivån
const SHAPE = (() => {
  const raw = BAND_CENTERS.map((f) => -3 * Math.log2(f / 1000) * 0.8 + (f < 150 ? 3 : 0) - (f > 12000 ? 3 : 0));
  const tot = 10 * Math.log10(raw.reduce((a, d) => a + 10 ** (d / 10), 0));
  return raw.map((d) => d - tot);
})();
const CREST = 10; // typisk topp över RMS (dB) för limitermodellen

const regionGain = (cutoffs, bands, f) => {
  const i = cutoffs.findIndex((c) => f < c);
  return bands[i < 0 ? bands.length - 1 : i].gain;
};
const sumDb = (arr) => 10 * Math.log10(arr.reduce((a, d) => a + 10 ** (d / 10), 0));

/**
 * Uppskattad loudness (dB, relativ) för musik på programnivån `programDb` (RMS) genom kedjan.
 * Svarar { level, mbcGr: [dB per band], limGr } – minskningarna visas även i visualiseringen.
 */
export function estimate(params, { programDb = -12 } = {}) {
  const p = sanitize(params);
  // Ingång + pre-EQ
  const pre = BAND_CENTERS.map((f, i) => programDb + SHAPE[i] + p.inputGain + regionGain(EQ_CUTOFFS, p.preEq, f));
  // Multiband: nivån i varje kompressorband (summa av analysbanden i bandet), statisk kurva
  const mbcGain = MBC_CUTOFFS.map((hi, m) => {
    const lo = m === 0 ? 0 : MBC_CUTOFFS[m - 1];
    const idx = BAND_CENTERS.map((f, i) => [f, i]).filter(([f]) => f >= lo && f < hi).map(([, i]) => i);
    const b = p.mbc[m];
    const level = sumDb(idx.map((i) => pre[i])) + b.preGain;
    const gr = b.ratio > 1.0001 ? -gainComputer(level, b.threshold, b.ratio, b.knee) : 0;
    return { gain: b.preGain - gr + b.postGain, gr };
  });
  const mbcOf = (f) => { const m = MBC_CUTOFFS.findIndex((c) => f < c); return mbcGain[m < 0 ? 3 : m]; };
  const post = BAND_CENTERS.map((f, i) => pre[i] + mbcOf(f).gain + regionGain(EQ_CUTOFFS, p.postEq, f) + peqDb(p.peq, f));
  // Limiter: toppar ≈ RMS + crest; minskningen märks i loudness ungefär till hälften
  const rms = sumDb(post);
  const over = rms + CREST - p.limiter.threshold;
  const limGr = over > 0 ? over * (1 - 1 / p.limiter.ratio) * 0.5 : 0;
  const kw = sumDb(post.map((d, i) => d + KW[i]));
  return { level: kw - limGr + p.limiter.postGain + p.outputGain, mbcGr: mbcGain.map((x) => x.gr), limGr };
}

/** Hur mycket utgången ska ändras (dB) för att låta lika högt som originalet (neutral kedja). */
export function compensation(params, opts) {
  const d = estimate(neutral(), opts).level - estimate(params, opts).level;
  return Math.max(-18, Math.min(12, Math.round(d * 10) / 10));
}

/** Parametrarna med kompensationen inlagd i utgångsnivån (det som skickas till motorn). */
export function withCompensation(params, opts) {
  const p = sanitize(params);
  const c = compensation(p, opts);
  return { ...p, outputGain: Math.max(-24, Math.min(12, p.outputGain + c)) };
}
