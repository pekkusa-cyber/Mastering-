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
/**
 * Det som bara finns i Fil (Färg, Limiter, Kick-anslag) – eget för varje inbyggd preset, så att presetten märks i
 * alla block och inte bara i EQ och kompressor. [kick, S-ljud %, Mjuk topp %, bredd %, lim ratio, lim tröskel,
 * lim attack, lim release, soft clip dB, limiterns release ms]. Okänd/egen preset får DEFAULT_CHARACTER.
 */
export const DEFAULT_CHARACTER = [0, 25, 20, 100, 1.5, -16, 30, 200, 1.5, 80];
export const FILE_CHARACTER = {
  'mjuk-kick': [-30, 20, 15, 100, 1.5, -16, 30, 200, 1, 80],
  'radio-ljus': [10, 30, 25, 110, 2, -18, 10, 150, 2.5, 50],
  'silkeslen-rost': [0, 45, 35, 100, 1.3, -16, 30, 250, 0.5, 100],
  'varm-lim': [-10, 20, 25, 105, 2.5, -20, 30, 300, 1, 120],
  transparent: [0, 10, 5, 100, 1.2, -14, 30, 200, 0, 100],
  'suno-fix': [-15, 30, 30, 100, 1.5, -16, 30, 200, 1.5, 80],
  'bas-varm': [10, 15, 20, 95, 1.8, -18, 30, 250, 1, 100],
  'tat-pop': [15, 30, 20, 115, 2.5, -20, 10, 150, 2.5, 50],
  'hiphop-punch': [40, 20, 10, 100, 2, -18, 30, 120, 2, 60],
  'edm-hogt': [30, 20, 15, 120, 3, -20, 10, 100, 3.5, 40],
  akustisk: [0, 20, 10, 110, 1.2, -14, 40, 300, 0, 150],
  ballad: [-10, 35, 25, 105, 1.5, -16, 30, 250, 0.5, 120],
  rock: [20, 25, 15, 110, 2, -18, 20, 150, 2, 60],
  lofi: [-20, 15, 40, 90, 2, -20, 40, 400, 1.5, 150],
  natt: [-20, 30, 30, 90, 3, -24, 10, 200, 2, 80],
  horlurar: [-10, 35, 40, 90, 1.5, -16, 30, 200, 0.5, 100],
  'rnb-silke': [5, 35, 30, 110, 1.8, -18, 30, 250, 1, 100],
  'trap-808': [20, 25, 10, 115, 2, -18, 20, 150, 3, 50],
  schlager: [15, 30, 20, 100, 2, -18, 20, 150, 2, 60],
  indie: [0, 20, 15, 115, 1.3, -14, 30, 250, 0.5, 120],
  metal: [30, 25, 20, 105, 2, -18, 10, 120, 2.5, 50],
  jazz: [0, 10, 5, 105, 1.1, -12, 40, 300, 0, 200],
  film: [0, 10, 10, 120, 1.2, -14, 50, 400, 0, 200],
  reggaeton: [35, 25, 15, 105, 2, -18, 30, 120, 2, 60],
  bil: [10, 35, 30, 95, 2, -18, 20, 150, 2, 60],
  telefon: [20, 40, 30, 80, 2.5, -20, 10, 120, 2.5, 50],
  gym: [40, 25, 15, 115, 3, -20, 10, 100, 4, 40],
  'demo-check': [0, 0, 0, 100, 1, -16, 30, 200, 0, 80],
  test: [100, 80, 80, 180, 5, -24, 10, 100, 6, 40],
};
/** Fil-delarna (Färg, Limiter, Kick) för en preset. */
export function fileCharacter(presetId) {
  const [kickPunch, deEss, glitter, width, ratio, threshold, attack, release, clip, limRelease] = FILE_CHARACTER[presetId] || DEFAULT_CHARACTER;
  return { kickPunch, deEss, glitter, width, glue: { threshold, ratio, attack, release, makeup: 0 }, clip, limRelease };
}

export function liveToFile(liveParams, extra = {}, presetId = null) {
  const l = sanitizeLive(liveParams);
  return sanitizeFile({ ...fileNeutral(), preEq: l.preEq, mbc: l.mbc, postEq: l.postEq, peq: l.peq, ...fileCharacter(presetId), ...extra });
}

/** Målet som LUFS-värde (null = ingen automatisk nivå). */
export function targetLufs(p) {
  const t = TARGETS.find((x) => x.id === p.target);
  return t?.id === 'egen' ? null : t?.lufs ?? p.targetLufs;
}

export { EQ_CUTOFFS, MBC_CUTOFFS };
