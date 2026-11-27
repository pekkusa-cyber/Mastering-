// Automastring: ett tryck. Analyserar låten och sätter upp hela kedjan som en mastringstekniker skulle börja:
// preset efter stil, klangen utjämnad (mot en referens om du har valt en, annars mot låtens egen klangkurva),
// riktade åtgärder för typiska problem (hårt 3–6 kHz, skimmer, bred bas, redan hårt pressad låt, tvärt slut) och
// styrkan skalad. Svarar inställningen och en lista med vad som gjordes, på svenska. Ren JS – testas i Node.
import { BAND_CENTERS, REGIONS, matchEqCurve, toFileMatchEq } from './analysis.js';
import { liveToFile, sanitizeFile } from './master.js';
import { BUILTIN_PRESETS } from './chain.js';

/** Stilar att välja mellan (preset bakom). 'auto' = Suno-fix, som rättar typiska Suno-problem. */
export const AUTO_STYLES = [
  ['auto', 'Auto'], ['tat-pop', 'Pop'], ['hiphop-punch', 'Hiphop'], ['trap-808', 'Trap'], ['edm-hogt', 'EDM'], ['rock', 'Rock'],
  ['metal', 'Metal'], ['reggae', 'Reggae'], ['rnb-silke', 'R&B'], ['country', 'Country'], ['ballad', 'Ballad'], ['akustisk', 'Akustisk'],
  ['jazz', 'Jazz'], ['lofi', 'Lo-fi'],
];
export const AUTO_STRENGTHS = [['varsam', 'Varsam'], ['balans', 'Balanserad'], ['kraftig', 'Kraftig']];
const K = { varsam: 0.6, balans: 1, kraftig: 1.4 };

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',').replace('-', '−');
const hz = (f) => (f >= 1000 ? `${f1(f / 1000).replace(',0', '')} kHz` : `${Math.round(f)} Hz`);

/**
 * Låtens avvikelse (dB per analysband) från sin egen utjämnade klangkurva (glidande medel över ca två oktaver).
 * Positivt = bandet sticker upp lokalt (en resonans, grumlighet eller hårdhet), negativt = en dal.
 */
export function selfDeviation(bands, w = 3) {
  const ok = (y) => Number.isFinite(y) && y > -90;
  return bands.map((y, i) => {
    if (!ok(y)) return 0;
    const nb = [];
    for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < bands.length && j !== i && ok(bands[j])) nb.push(bands[j]);
    return nb.length ? y - mean(nb) : 0;
  });
}

/**
 * Utjämning utan referens, som en mastringstekniker: bara SÄNKNINGAR av det som sticker upp (sänk hellre än höj),
 * i 120 Hz–10 kHz, bara där bumpen är tydlig (> 1 dB). Basens och toppens karaktär lämnas åt presetten.
 */
export function selfBalanceCurve(bands, { amount = 0.5, maxDb = 3 } = {}) {
  const d = selfDeviation(bands);
  const raw = d.map((v, i) => (BAND_CENTERS[i] >= 120 && BAND_CENTERS[i] <= 10000 && v > 1 ? -v * amount : 0));
  return raw.map((v, i) => {
    const nb = [raw[i - 1], v, v, raw[i + 1]].filter((x) => x !== undefined);
    return +Math.max(-maxDb, Math.min(0, mean(nb))).toFixed(2);
  });
}

const region = (lo, hi, dev) => mean(BAND_CENTERS.map((f, i) => (f >= lo && f < hi ? dev[i] : null)).filter((x) => x !== null));

/**
 * profile: låtens profil (analysis.profileFromChannels). stereo: originalets stereoInfo. ref: referensprofil eller null.
 * edges: { endDb } = nivån sista 0,4 s relativt låtens medelnivå (dB). Svarar { presetId, params, actions }.
 */
export function autoMaster({ profile, stereo = null, ref = null, style = 'auto', strength = 'balans', target = 'streaming', edges = null }) {
  const k = K[strength] ?? 1;
  const presetId = style === 'auto' ? 'suno-fix' : style;
  const preset = BUILTIN_PRESETS.find((p) => p.id === presetId) || BUILTIN_PRESETS.find((p) => p.id === 'suno-fix');
  const p = liveToFile(preset.params, { target }, preset.id);
  const actions = [`Grund: ${preset.name}${style === 'auto' ? ' (rättar typiska Suno-problem)' : ''}, styrka ${AUTO_STRENGTHS.find((s) => s[0] === strength)?.[1] || 'Balanserad'}.`];

  // Styrkan: Färg, lim, soft clip och In skalas runt presetten
  p.deEss *= k; p.glitter *= k;
  p.clip = k > 1 ? p.clip + 1.5 : p.clip * k;
  p.glue = { ...p.glue, ratio: 1 + (p.glue.ratio - 1) * k };
  p.trim += (k - 1) * 3;

  // Klangen: mot referensen, annars utjämning mot låtens egen kurva
  const curve = ref
    ? matchEqCurve(profile, ref, { amount: { varsam: 0.4, balans: 0.7, kraftig: 1 }[strength] ?? 0.7, maxDb: 6 })
    : selfBalanceCurve(profile.bands, { amount: { varsam: 0.5, balans: 0.7, kraftig: 0.9 }[strength] ?? 0.7, maxDb: { varsam: 2, balans: 3, kraftig: 4 }[strength] ?? 3 });
  const meq = toFileMatchEq(curve);
  p.matchEq = meq.map((g) => ({ gain: g }));
  const moves = meq.map((g, i) => [g, [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000][i]]).filter(([g]) => Math.abs(g) >= 0.5)
    .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 4);
  if (moves.length) {
    const why = (f) => REGIONS.find((r) => f >= r.lo && f < r.hi);
    actions.push(`${ref ? 'Klangen närmare referensen' : 'Tämjde det som sticker ut'}: ${moves.map(([g, f]) => `${g > 0 ? 'höjde' : 'sänkte'} ${hz(f)} ${f1(Math.abs(g))} dB${g < 0 && why(f) ? ` (${why(f).more.split(' (')[0]})` : ''}`).join(', ')}.`);
  } else actions.push(ref ? 'Klangen ligger redan nära referensen – ingen extra EQ.' : 'Inga tydliga resonanser – ingen extra EQ utöver presetten.');

  // Riktade åtgärder för typiska problem
  const dev = selfDeviation(profile.bands, 6); // bredare jämförelse (ca fyra oktaver) för hela områden
  const harsh = region(2500, 5000, dev), fizz = region(9000, 16000, dev);
  if (harsh > 1) { p.deEss += 15 * k; actions.push(`Hårt 2,5–5 kHz (+${f1(harsh)} dB över kurvan): mer de-esser.`); }
  if (fizz > 1.5) { p.glitter += 15 * k; actions.push(`Skimmer över 9 kHz (+${f1(fizz)} dB): mer Mjuk topp.`); }
  const bass = stereo?.bands?.find((b) => b.id === 'bas');
  if (bass && (bass.corr < 0.8 || bass.monoLoss < -1)) { p.monoBass = Math.max(p.monoBass, 120); actions.push(`Basen är stereobred (korrelation ${bass.corr.toFixed(2).replace('.', ',')}): bas i mono under 120 Hz.`); }
  if (profile.crest < 7.5) { p.trim -= 2; p.clip = Math.min(p.clip, 0.5); actions.push(`Låten är redan hårt komprimerad (toppighet ${f1(profile.crest)} dB): mindre tryck och nästan ingen soft clip.`); }
  else if (profile.crest > 11) actions.push(`Dynamisk låt (toppighet ${f1(profile.crest)} dB): kompressorn får jämna ut lite mer.`);
  if (edges && edges.endDb > -15) { p.fadeOut = Math.max(p.fadeOut, 2); actions.push('Låten slutar tvärt: fade ut 2 s.'); }
  if (edges && edges.startDb > -15) { p.fadeIn = Math.max(p.fadeIn, 50); actions.push('Låten börjar tvärt: kort fade in (50 ms) mot klick.'); }
  actions.push(target === 'hog' ? 'Nivå: hög (−10 LUFS).' : 'Nivå: streaming (−14 LUFS, true peak −1 dBTP).');
  return { presetId: preset.id, params: sanitizeFile(p), actions };
}

/** Nivån (dB, relativt låtens medel) i början och slutet – för att se om låten börjar eller slutar tvärt. */
export function edgeLevels(channels, fs) {
  const L = channels[0], R = channels[1] || L, n = L.length, w = Math.min(n, Math.round(fs * 0.4));
  const rms = (a, b) => { let e = 0; for (let i = a; i < b; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2; return 10 * Math.log10(e / Math.max(1, b - a) + 1e-12); };
  const all = rms(0, n);
  return { startDb: rms(0, Math.min(n, Math.round(fs * 0.05))) - all, endDb: rms(n - w, n) - all };
}
