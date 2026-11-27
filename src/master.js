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
  monoBass: [0, 250, 10, 'Hz'],
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
  if (off('width')) { p.width = 100; p.monoBass = 0; }
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
    monoBass: 0,
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
    monoBass: c(s.monoBass, R.monoBass, n.monoBass),
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
    inLufs: Number.isFinite(s.inLufs) ? s.inLufs : null,
  };
}

/**
 * Nivåanpassning in (gain staging), som i en riktig mastring: låten läggs på samma nivå som Live-kedjan får från
 * en strömningstjänst (−14 LUFS) innan EQ och kompressor, så att en presets trösklar och In betyder samma sak i
 * Fil som i Live – oavsett om låten är tyst eller redan hög. Slutnivån sätts ändå av målet. Inte med målet Egen.
 */
export const STAGE_REF_LUFS = -14;
export function inputStage(p) {
  if (p.inLufs == null || !Number.isFinite(p.inLufs) || p.target === 'egen') return 0;
  return Math.max(-12, Math.min(12, STAGE_REF_LUFS - p.inLufs));
}

/**
 * En live-preset som filinställning: EQ och multiband följer med; nivån styrs av målet i stället för live-
 * kedjans ingångsförstärkning, och limitern blir en true-peak-limiter med tak −1 dBTP. Live (Androids DSP) och
 * fil (egen DSP) låter därför inte exakt lika.
 */
/**
 * Det som bara finns i Fil (Färg, Limiter, Kick-anslag) – eget för varje inbyggd preset, så att presetten märks i
 * alla block och inte bara i EQ och kompressor. [kick, S-ljud %, Mjuk topp %, bredd %, lim ratio, lim tröskel,
 * lim attack, lim release, soft clip dB, limiterns release ms, bas i mono Hz]. Okänd/egen preset får DEFAULT_CHARACTER.
 */
export const DEFAULT_CHARACTER = [0, 25, 20, 100, 1.5, -16, 30, 200, 1.5, 80, 0];
export const FILE_CHARACTER = {
  'suno-fix': [-15, 35, 40, 100, 1.5, -16, 30, 200, 1.5, 80, 90],
  'transparent': [0, 10, 5, 100, 1.2, -16, 30, 250, 0, 100, 0],
  'mjuk-kick': [-40, 20, 15, 100, 1.5, -15, 30, 200, 1, 80, 90],
  'radio-ljus': [10, 30, 15, 110, 2, -14.5, 10, 150, 2.5, 50, 100],
  'silkeslen-rost': [0, 50, 40, 100, 1.3, -14.5, 30, 250, 0.5, 100, 80],
  'varm-lim': [-10, 20, 25, 105, 2.5, -15.5, 30, 300, 1, 120, 90],
  'bas-varm': [10, 15, 20, 95, 1.8, -14.5, 30, 250, 1, 100, 100],
  'tat-pop': [15, 30, 20, 115, 2.5, -14.5, 10, 150, 2.5, 50, 100],
  'hiphop-punch': [40, 20, 10, 100, 2, -13.5, 30, 120, 2, 60, 100],
  'trap-808': [20, 25, 10, 115, 2, -13, 20, 150, 3, 50, 110],
  'edm-hogt': [30, 20, 15, 120, 3, -14, 10, 100, 3.5, 40, 120],
  'rnb-silke': [5, 40, 30, 110, 1.8, -14.5, 30, 250, 1, 100, 100],
  'reggae': [5, 30, 25, 110, 1.8, -14, 30, 250, 1, 100, 100],
  'reggaeton': [35, 25, 15, 105, 2, -15, 30, 120, 2, 60, 100],
  'rock': [20, 25, 15, 110, 2, -14, 10, 150, 2, 60, 90],
  'metal': [30, 25, 20, 105, 2, -14, 10, 120, 2.5, 50, 100],
  'country': [10, 30, 20, 110, 1.8, -14.5, 20, 200, 1.5, 70, 80],
  'schlager': [15, 30, 20, 100, 2, -15.5, 20, 150, 2, 60, 90],
  'indie': [0, 20, 15, 115, 1.3, -14.5, 30, 250, 0.5, 120, 80],
  'akustisk': [0, 20, 10, 110, 1.2, -15.5, 40, 300, 0, 150, 0],
  'ballad': [-10, 40, 25, 105, 1.5, -15, 30, 250, 0.5, 120, 80],
  'jazz': [0, 10, 5, 105, 1.1, -15, 40, 300, 0, 200, 0],
  'film': [0, 10, 10, 120, 1.2, -15.5, 50, 400, 0, 200, 0],
  'lofi': [-20, 15, 50, 85, 2, -17.5, 40, 400, 1.5, 150, 120],
  'natt': [-20, 30, 30, 90, 3, -17, 10, 200, 2, 80, 120],
  'horlurar': [-10, 40, 50, 90, 1.5, -16.5, 30, 200, 0.5, 100, 0],
  'bil': [10, 35, 30, 95, 2, -15.5, 20, 150, 2, 60, 100],
  'telefon': [20, 40, 30, 80, 2.5, -15.5, 10, 120, 2.5, 50, 150],
  'gym': [40, 25, 15, 115, 3, -13, 10, 100, 4, 40, 120],
  'demo-check': [0, 0, 0, 100, 1, -16, 30, 200, 0, 80, 0],
  test: [100, 80, 80, 180, 5, -24, 10, 100, 6, 40, 200],
};
/** Fil-delarna (Färg, Limiter, Kick) för en preset. */
export function fileCharacter(presetId) {
  const [kickPunch, deEss, glitter, width, ratio, threshold, attack, release, clip, limRelease, monoBass] = FILE_CHARACTER[presetId] || DEFAULT_CHARACTER;
  return { kickPunch, deEss, glitter, width, monoBass, glue: { threshold, ratio, attack, release, makeup: 0 }, clip, limRelease };
}

export function liveToFile(liveParams, extra = {}, presetId = null) {
  const l = sanitizeLive(liveParams);
  return sanitizeFile({ ...fileNeutral(), trim: l.inputGain, preEq: l.preEq, mbc: l.mbc, postEq: l.postEq, peq: l.peq, ...fileCharacter(presetId), ...extra });
}

/** Målet som LUFS-värde (null = ingen automatisk nivå). */
export function targetLufs(p) {
  const t = TARGETS.find((x) => x.id === p.target);
  return t?.id === 'egen' ? null : t?.lufs ?? p.targetLufs;
}

export { EQ_CUTOFFS, MBC_CUTOFFS };

/**
 * Det en mastringstekniker kontrollerar innan leverans (riktvärden från branschen, inte lagar):
 * nivå mot plattformarna, PLR (dynamik), limiterns och kompressorns arbete och true peak för höga masters.
 */
export function masterChecks(m, gr = {}) {
  const out = [], L = m.integrated, tp = m.truePeak;
  if (!Number.isFinite(L)) return out;
  const f1 = (x) => x.toFixed(1).replace('.', ',').replace('-', '−');
  // Vad plattformarna gör med nivån (de sänker höga låtar; Spotify/YouTube −14, Apple Music −16)
  const down = (ref) => Math.max(0, L - ref);
  if (L > -14.5) out.push(['ok', `Nivå ${f1(L)} LUFS: Spotify och YouTube sänker ca ${f1(down(-14))} dB, Apple Music ca ${f1(down(-16))} dB. Det gör inget – men högre än så här ger bara mindre dynamik, inte högre ljud.`]);
  else if (L >= -16.5) out.push(['ok', `Nivå ${f1(L)} LUFS – nära plattformarnas nivå (−14 till −16 LUFS).`]);
  else out.push(['warn', `Nivå ${f1(L)} LUFS är tystare än plattformarna (−14 LUFS). Spotify höjer bara upp så långt topparna tillåter – låten kan låta svagare än andra. Välj målet Streaming.`]);
  // PLR = true peak − loudness: hur mycket dynamik (transienter) som finns kvar
  const plr = tp - L;
  if (plr < 6) out.push(['warn', `PLR ${f1(plr)} dB: mycket hårt pressad. Under ca 6 dB låter det lätt platt och tröttande. Sänk målnivån eller Soft clip.`]);
  else if (plr < 8) out.push(['ok', `PLR ${f1(plr)} dB: tätt och högt, som modern pop/EDM.`]);
  else out.push(['ok', `PLR ${f1(plr)} dB: bra dynamik kvar (8–12 dB är vanligt för musik som ska andas).`]);
  if (L > -14 && tp > -2) out.push(['warn', `Mastern är högre än −14 LUFS: Spotify rekommenderar då true peak under −2 dBTP (nu ${f1(tp)}) för att undvika distorsion när filen kodas om. Sänk taket till −2 under Limiter.`]);
  // Nedtryckning: snittet medan det låter är det proffs menar ("2 dB kompression"); enstaka toppar får vara större
  const avg = gr.avg || {};
  if ((avg.limiter ?? 0) > 2 || (gr.limiter ?? 0) > 6) out.push(['warn', `Limitern trycker ned ${f1(avg.limiter ?? 0)} dB i snitt (upp till ${f1(gr.limiter ?? 0)} dB). Mer än ca 2 dB i snitt börjar höras (pumpande, tappade anslag). Sänk målnivån eller ta lite av det med Soft clip.`]);
  const mbcAvg = Math.max(0, ...(avg.mbc || []));
  if (mbcAvg > 5) out.push(['warn', `Kompressorn trycker ned ${f1(mbcAvg)} dB i snitt i ett band – mer än en mastring brukar (oftast 1–4 dB). Höj tröskeln eller sänk In.`]);
  if ((avg.glue ?? 0) > 3) out.push(['warn', `Limmet trycker ned ${f1(avg.glue)} dB i snitt – 1–2 dB brukar räcka för att hålla ihop mixen.`]);
  return out;
}
