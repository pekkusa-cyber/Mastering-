// Analys: spektrumprofil för en låt (medelspektrum i 24 band + nivå, toppighet och dynamik),
// jämförelse mot en referens med omdöme per frekvensområde, och match-EQ (hur EQ:n ska ändras för att likna
// referensen). Samma bandindelning som live-analysen i Kotlin (Analyzer.kt: BAND_EDGES) – ändra båda samtidigt.
import { EQ_CUTOFFS } from './chain.js';
import { MATCH_FREQS } from './master.js';

export const BAND_EDGES = [20, 60, 100, 150, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
export const BAND_CENTERS = BAND_EDGES.slice(0, -1).map((lo, i) => Math.sqrt(lo * BAND_EDGES[i + 1]));
export const NBANDS = BAND_CENTERS.length; // 24

export const REGIONS = [
  { id: 'sub', name: 'Sub', lo: 20, hi: 60, more: 'mer subbas', less: 'mindre subbas' },
  { id: 'bas', name: 'Bas', lo: 60, hi: 250, more: 'för mycket bas', less: 'för lite bas' },
  { id: 'lagmellan', name: 'Lågmellan', lo: 250, hi: 800, more: 'grumligt (för mycket lågmellan)', less: 'tunt (för lite lågmellan)' },
  { id: 'mellan', name: 'Mellan', lo: 800, hi: 2500, more: 'framträdande mellanregister', less: 'urgröpt mellanregister' },
  { id: 'narvaro', name: 'Närvaro', lo: 2500, hi: 6300, more: 'skarpt/hårt (röst och kanter)', less: 'dovt – rösten kommer inte fram' },
  { id: 'diskant', name: 'Diskant', lo: 6300, hi: 12500, more: 'vasst/sibilant', less: 'mörkt' },
  { id: 'luft', name: 'Luft', lo: 12500, hi: 20000, more: 'mycket luft/brus', less: 'lite luft' },
];

// ---- FFT ----
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const hannCache = new Map();
const hann = (n) => {
  if (!hannCache.has(n)) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); hannCache.set(n, w); }
  return hannCache.get(n);
};

/** Effekt per band för en ram (Hann-fönster). Lägger till i `acc` om den ges. */
export function frameBandPowers(frame, fs, acc = new Float64Array(NBANDS)) {
  const n = frame.length, w = hann(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = frame[i] * w[i];
  fft(re, im);
  const binHz = fs / n;
  let b = 0;
  for (let k = 1; k < n / 2; k++) {
    const f = k * binHz;
    if (f < BAND_EDGES[0]) continue;
    while (b < NBANDS && f >= BAND_EDGES[b + 1]) b++;
    if (b >= NBANDS) break;
    acc[b] += (re[k] * re[k] + im[k] * im[k]) / (n * n);
  }
  return acc;
}

const dB = (p) => 10 * Math.log10(Math.max(p, 1e-20));

/**
 * Profil för en hel fil: medelspektrum (band i dB), nivå (RMS, dB), toppighet (crest: topp − RMS per 1024-
 * samples ram, dB) och dynamik (P95 − P10 av 3-sekunders RMS, dB). Tysta delar räknas inte.
 */
export function profileFromChannels(channels, fs) {
  const L = channels[0], R = channels[1] || channels[0], n = L.length;
  const N = 4096;
  const acc = new Float64Array(NBANDS);
  const frame = new Float64Array(N);
  let frames = 0;
  for (let s = 0; s + N <= n; s += N) {
    let e = 0;
    for (let i = 0; i < N; i++) { const v = (L[s + i] + R[s + i]) * 0.5; frame[i] = v; e += v * v; }
    if (e / N < 1e-7) continue; // tystnad (< −70 dB)
    frameBandPowers(frame, fs, acc);
    frames++;
  }
  const crest = [], rmsFrames = [];
  const M = 1024;
  for (let s = 0; s + M <= n; s += M) {
    let e = 0, pk = 0;
    for (let i = s; i < s + M; i++) { const v = (L[i] + R[i]) * 0.5; e += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
    const rms = Math.sqrt(e / M);
    if (rms < 3.16e-4) continue; // −70 dB
    rmsFrames.push(e / M);
    crest.push(20 * Math.log10(pk / rms));
  }
  return finishProfile({ bandPow: Array.from(acc, (p) => (frames ? p / frames : 0)), rmsPow: rmsFrames, crest, framesPerSecond: fs / M, seconds: n / fs, source: 'fil' });
}

/** Gemensam avslutning för fil- och live-profiler (live skickar samma fält från Kotlin). */
export function finishProfile({ bandPow, rmsPow, crest, framesPerSecond, seconds, source }) {
  const level = rmsPow.length ? dB(rmsPow.reduce((a, b) => a + b, 0) / rmsPow.length) : -Infinity;
  const crestDb = crest.length ? crest.reduce((a, b) => a + b, 0) / crest.length : 0;
  // 3-sekunders RMS för dynamiken
  const per = Math.max(1, Math.round(framesPerSecond * 3));
  const st = [];
  for (let i = 0; i + per <= rmsPow.length; i += Math.max(1, Math.round(per / 3))) {
    let s = 0; for (let k = i; k < i + per; k++) s += rmsPow[k];
    st.push(dB(s / per));
  }
  st.sort((a, b) => a - b);
  const pct = (p) => st[Math.round((st.length - 1) * p)];
  return {
    version: 1,
    source,
    bands: bandPow.map((p) => +dB(p).toFixed(2)),
    level: +level.toFixed(2),
    crest: +crestDb.toFixed(2),
    dynamics: st.length > 1 ? +(pct(0.95) - pct(0.1)).toFixed(2) : 0,
    seconds: +seconds.toFixed(1),
  };
}

/** Bandens skillnad (dB) efter att den totala nivån tagits bort (jämförs 200 Hz–5 kHz). */
export function shapeDiff(own, ref) {
  const idx = BAND_CENTERS.map((f, i) => i).filter((i) => BAND_CENTERS[i] >= 200 && BAND_CENTERS[i] <= 5000);
  const offset = idx.reduce((a, i) => a + (own.bands[i] - ref.bands[i]), 0) / idx.length;
  return own.bands.map((v, i) => v - ref.bands[i] - offset);
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Jämför en låt med en referens. Svarar { regions: [{ id, name, diff, status, text }], crestDiff, dynDiff,
 * verdict: 'redo' | 'nastan' | 'atgarda', summary, tips: [] }.
 */
export function compareProfiles(own, ref) {
  const d = shapeDiff(own, ref);
  const regions = REGIONS.map((r) => {
    const v = mean(BAND_CENTERS.map((f, i) => [f, i]).filter(([f]) => f >= r.lo && f < r.hi).map(([, i]) => d[i]));
    const a = Math.abs(v);
    const status = a <= 1.5 ? 'ok' : a <= 3.5 ? 'lite' : 'mycket';
    const sign = v > 0 ? '+' : '−';
    const text = status === 'ok' ? 'som referensen' : `${v > 0 ? r.more : r.less} (${sign}${a.toFixed(1)} dB)`;
    return { id: r.id, name: r.name, diff: +v.toFixed(2), status, text };
  });
  const crestDiff = +(own.crest - ref.crest).toFixed(2);
  const dynDiff = +(own.dynamics - ref.dynamics).toFixed(2);
  const tips = [];
  for (const r of regions) {
    if (r.status === 'ok') continue;
    if (r.id === 'bas' && r.diff > 0) tips.push('Bas: prova "Mjuk kick" eller sänk Pre-EQ 60–250 Hz.');
    if (r.id === 'narvaro' && r.diff > 0) tips.push('Skarpt: "Röst silkeslen" åt höger mjukar upp 3–8 kHz.');
    if (r.id === 'narvaro' && r.diff < 0) tips.push('Dovt: "Ljusare" åt höger eller höj Post-EQ 3–8 kHz.');
    if ((r.id === 'diskant' || r.id === 'luft') && r.diff < 0) tips.push('Mörkt: "Ljusare" åt höger.');
    if (r.id === 'lagmellan' && r.diff > 0) tips.push('Grumligt: sänk Pre-EQ 250–500 Hz någon dB.');
  }
  if (crestDiff > 3) tips.push(`Topparna sticker ut ${crestDiff.toFixed(1)} dB mer än i referensen – kick/transienter är hårdare. "Kick mjukare" och soft clip hjälper.`);
  if (crestDiff < -3) tips.push(`Låten är redan ${Math.abs(crestDiff).toFixed(1)} dB tätare än referensen – mastra försiktigt (Streaming-mål).`);
  const worst = Math.max(...regions.filter((r) => r.id !== 'sub').map((r) => Math.abs(r.diff)));
  const verdict = worst <= 3.5 && Math.abs(crestDiff) <= 4 ? 'redo' : worst <= 6 && Math.abs(crestDiff) <= 6 ? 'nastan' : 'atgarda';
  const summary = {
    redo: 'Redo för mastring – klangen ligger nära referensen.',
    nastan: 'Nästan – mastringen (Matcha EQ) kan rätta det här, men lyssna på det som är markerat.',
    atgarda: 'Åtgärda i mixen/Suno först – skillnaden är större än mastring rimligen kan rätta.',
  }[verdict];
  return { regions, crestDiff, dynDiff, verdict, summary, tips: [...new Set(tips)], diff: d.map((v) => +v.toFixed(2)) };
}

/**
 * Match-EQ: hur mycket varje band ska ändras för att likna referensen. Utjämnas över grannband, tas med
 * `amount` (0–1) och begränsas till ±maxDb. Ytterbanden (under 40 Hz och över 16 kHz) tas till hälften.
 */
export function matchEqCurve(own, ref, { amount = 0.7, maxDb = 6 } = {}) {
  const d = shapeDiff(own, ref).map((v) => -v);
  const smooth = d.map((v, i) => mean([d[i - 1], v, v, d[i + 1]].filter((x) => x !== undefined)));
  return smooth.map((v, i) => {
    const edge = BAND_CENTERS[i] < 40 || BAND_CENTERS[i] > 16000 ? 0.5 : 1;
    return +Math.max(-maxDb, Math.min(maxDb, v * amount * edge)).toFixed(2);
  });
}

/** Kurvan som live-kedjans 8 EQ-band (medel av analysbanden inom varje EQ-band). */
export function toLiveEq(curve) {
  return EQ_CUTOFFS.map((hi, i) => {
    const lo = i === 0 ? 0 : EQ_CUTOFFS[i - 1];
    const vals = curve.filter((_, k) => BAND_CENTERS[k] >= lo && BAND_CENTERS[k] < hi);
    return +mean(vals).toFixed(1);
  });
}

/** Kurvan som filmastringens 10 match-EQ-band (oktaver). */
export function toFileMatchEq(curve) {
  return MATCH_FREQS.map((f) => {
    const vals = curve.filter((_, k) => BAND_CENTERS[k] >= f / Math.SQRT2 && BAND_CENTERS[k] < f * Math.SQRT2);
    return +mean(vals).toFixed(1);
  });
}

/** Lägger match-EQ:n ovanpå live-parametrarnas post-EQ (inom ±12 dB). */
export function applyLiveMatch(params, curve) {
  const add = toLiveEq(curve);
  return { ...params, postEq: params.postEq.map((b, i) => ({ gain: Math.max(-12, Math.min(12, +(b.gain + add[i]).toFixed(1))) })) };
}
