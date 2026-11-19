// Filmastringens parametrar (fas 3). Ren JS – samma modell i gränssnittet, i renderingen (Web Worker) och i testerna.
// Kedjan: trim → pre-EQ → match-EQ → multiband (Linkwitz-Riley, 4 band, transient shaper på kickbandet)
//         → post-EQ → stereobredd → buss-kompressor (lim) → drive (auto mot mål-LUFS) → soft clipper
//         → true-peak-limiter (lookahead, 4x) → utgång.
import { EQ_CUTOFFS, MBC_CUTOFFS, RANGES, sanitize as sanitizeLive } from './chain.js';

export const MATCH_FREQS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const TARGETS = [
  { id: 'streaming', name: 'Streaming', lufs: -14, ceiling: -1, help: 'Spotify, YouTube, Apple Music m.fl. sänker högre låtar till ungefär −14 LUFS. Bäst dynamik.' },
  { id: 'hog', name: 'Hög', lufs: -10, ceiling: -1, help: 'Tätare och högre, som mycket modern pop/EDM. Kostar dynamik – lyssna efter pumpning.' },
  { id: 'egen', name: 'Eget', lufs: null, ceiling: -1, help: 'Ingen automatisk nivå – du ställer Drive själv.' },
];

export const FILE_RANGES = {
  ...RANGES,
  trim: [-12, 12, 0.5, 'dB'],
  kickPunch: [-100, 100, 1, ''],
  width: [0, 200, 5, '%'],
  glueThreshold: [-40, 0, 1, 'dB'],
  glueRatio: [1, 10, 0.1, ':1'],
  glueAttack: [1, 100, 1, 'ms'],
  glueRelease: [20, 1000, 10, 'ms'],
  glueMakeup: [-6, 12, 0.5, 'dB'],
  clip: [0, 6, 0.5, 'dB'],
  ceiling: [-3, 0, 0.1, 'dBTP'],
  limRelease: [10, 1000, 5, 'ms'],
  drive: [-24, 24, 0.5, 'dB'],
  output: [-24, 0, 0.5, 'dB'],
  targetLufs: [-20, -6, 0.5, 'LUFS'],
  matchGain: [-8, 8, 0.5, 'dB'],
  deEss: [0, 100, 1, '%'],
  glitter: [0, 100, 1, '%'],
};

/** Delar av filkedjan som kan slås av var för sig (av = neutral). Limitern är alltid på (taket ska hållas). */
export const FILE_STAGES = ['trim', 'preEq', 'match', 'mbc0', 'mbc1', 'mbc2', 'mbc3', 'kick', 'postEq', 'deEss', 'glitter', 'width', 'glue', 'clip', 'output'];

export function applyFileEnables(params, enabled = {}) {
  const p = structuredClone(sanitizeFile(params));
  const off = (k) => enabled[k] === false;
  if (off('trim')) p.trim = 0;
  if (off('preEq')) p.preEq.forEach((b) => { b.gain = 0; });
  if (off('match')) p.matchEq.forEach((b) => { b.gain = 0; });
  p.mbc.forEach((b, i) => { if (off(`mbc${i}`)) Object.assign(b, { ratio: 1, preGain: 0, postGain: 0 }); });
  if (off('kick')) p.kickPunch = 0;
  if (off('postEq')) { p.postEq.forEach((b) => { b.gain = 0; }); p.peq.forEach((b) => { b.gain = 0; }); }
  if (off('deEss')) p.deEss = 0;
  if (off('glitter')) p.glitter = 0;
  if (off('width')) p.width = 100;
  if (off('glue')) Object.assign(p.glue, { ratio: 1, makeup: 0 });
  if (off('clip')) p.clip = 0;
  if (off('output')) p.output = 0;
  return p;
}

const c = (v, [lo, hi], d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function fileNeutral() {
  const live = sanitizeLive({});
  return {
    trim: 0,
    preEq: live.preEq,
    matchEq: MATCH_FREQS.map(() => ({ gain: 0 })),
    mbc: live.mbc,
    postEq: live.postEq,
    peq: live.peq,
    kickPunch: 0,
    deEss: 0,
    glitter: 0,
    width: 100,
    glue: { threshold: -18, ratio: 1, attack: 30, release: 200, makeup: 0 },
    clip: 0,
    ceiling: -1,
    limRelease: 80,
    target: 'streaming',
    targetLufs: -14,
    drive: 0,
    output: 0,
  };
}

export function sanitizeFile(p) {
  const n = fileNeutral();
  const s = p && typeof p === 'object' ? p : {};
  const live = sanitizeLive({ preEq: s.preEq, mbc: s.mbc, postEq: s.postEq, peq: s.peq });
  const R = FILE_RANGES;
  return {
    trim: c(s.trim, R.trim, n.trim),
    preEq: live.preEq,
    matchEq: MATCH_FREQS.map((_, i) => ({ gain: c(s.matchEq?.[i]?.gain, R.matchGain, 0) })),
    mbc: live.mbc,
    postEq: live.postEq,
    peq: live.peq,
    kickPunch: c(s.kickPunch, R.kickPunch, n.kickPunch),
    deEss: c(s.deEss, R.deEss, n.deEss),
    glitter: c(s.glitter, R.glitter, n.glitter),
    width: c(s.width, R.width, n.width),
    glue: {
      threshold: c(s.glue?.threshold, R.glueThreshold, n.glue.threshold),
      ratio: c(s.glue?.ratio, R.glueRatio, n.glue.ratio),
      attack: c(s.glue?.attack, R.glueAttack, n.glue.attack),
      release: c(s.glue?.release, R.glueRelease, n.glue.release),
      makeup: c(s.glue?.makeup, R.glueMakeup, n.glue.makeup),
    },
    clip: c(s.clip, R.clip, n.clip),
    ceiling: c(s.ceiling, R.ceiling, n.ceiling),
    limRelease: c(s.limRelease, R.limRelease, n.limRelease),
    target: TARGETS.some((t) => t.id === s.target) ? s.target : n.target,
    targetLufs: c(s.targetLufs, R.targetLufs, n.targetLufs),
    drive: c(s.drive, R.drive, n.drive),
    output: c(s.output, R.output, n.output),
  };
}

/**
 * En live-preset som filinställning: EQ och multiband följer med; nivån styrs av målet i stället för live-
 * kedjans ingångsförstärkning, och limitern blir en true-peak-limiter med tak −1 dBTP. Live (Androids DSP) och
 * fil (egen DSP) låter därför inte exakt lika.
 */
export function liveToFile(liveParams, extra = {}) {
  const l = sanitizeLive(liveParams);
  return sanitizeFile({ ...fileNeutral(), preEq: l.preEq, mbc: l.mbc, postEq: l.postEq, peq: l.peq, glue: { threshold: -16, ratio: 1.5, attack: 30, release: 200, makeup: 0 }, clip: 1.5, deEss: 25, glitter: 20, ...extra });
}

/** Målet som LUFS-värde (null = ingen automatisk nivå). */
export function targetLufs(p) {
  const t = TARGETS.find((x) => x.id === p.target);
  return t?.id === 'egen' ? null : t?.lufs ?? p.targetLufs;
}

export { EQ_CUTOFFS, MBC_CUTOFFS };
