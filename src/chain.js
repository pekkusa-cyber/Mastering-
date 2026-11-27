// Live-kedjans parametrar: samma modell i webbgränssnittet och i Kotlin (LiveParams.kt).
// Kedjan: ingångsförstärkning → pre-EQ (8 band) → multiband-kompressor (4 band) → post-EQ (8 band) → limiter → utgång.
// Plus parametrisk EQ (5 band med frekvens, gain och Q) som läggs i post-EQ:ns 31 tersband (post31).
// Ren JavaScript utan DOM, så att den kan enhetstestas i Node (tests/unit).
import { coeffs, responseDb } from './dsp/biquad.js';

/** Övre gräns för varje EQ-band (Hz). Bandet går från föregående gräns till sin egen (DynamicsProcessing-modellen). */
export const EQ_CUTOFFS = [60, 120, 250, 500, 1000, 3000, 8000, 20000];
/** Multibandets gränser: kick 0–120 Hz, 120 Hz–2 kHz, 2–8 kHz, 8 kHz+. */
export const MBC_CUTOFFS = [120, 2000, 8000, 20000];
export const MBC_NAMES = ['Kick 0–120 Hz', 'Mellan 120 Hz–2 kHz', 'Närvaro 2–8 kHz', 'Luft 8 kHz+'];

export const RANGES = {
  inputGain: [-12, 12, 0.5, 'dB'],
  eqGain: [-12, 12, 0.5, 'dB'],
  threshold: [-60, 0, 1, 'dB'],
  ratio: [1, 20, 0.1, ':1'],
  attack: [0.1, 200, 0.1, 'ms'],
  release: [10, 2000, 5, 'ms'],
  knee: [0, 24, 0.5, 'dB'],
  preGain: [-12, 12, 0.5, 'dB'],
  postGain: [-12, 12, 0.5, 'dB'],
  limAttack: [0.1, 50, 0.1, 'ms'],
  limRelease: [10, 1000, 5, 'ms'],
  limRatio: [1, 50, 0.5, ':1'],
  limThreshold: [-30, 0, 0.5, 'dB'],
  limPostGain: [-12, 12, 0.5, 'dB'],
  outputGain: [-24, 12, 0.5, 'dB'],
  peqGain: [-12, 12, 0.5, 'dB'],
  peqQ: [0.3, 8, 0.1, ''],
};

/** Parametrisk EQ: 5 band. Typ och frekvensområde är fasta per band; frekvens, gain och Q ställs fritt. */
export const PEQ_BANDS = [
  { type: 'lowshelf', name: 'Bas (hylla)', freq: 80, q: 0.7, range: [20, 400, 5, 'Hz'] },
  { type: 'peaking', name: 'Lågmitt', freq: 250, q: 1, range: [60, 1000, 5, 'Hz'] },
  { type: 'peaking', name: 'Mitt', freq: 1000, q: 1, range: [300, 5000, 10, 'Hz'] },
  { type: 'peaking', name: 'Närvaro', freq: 3500, q: 1, range: [1000, 12000, 50, 'Hz'] },
  { type: 'highshelf', name: 'Topp (hylla)', freq: 10000, q: 0.7, range: [2000, 20000, 100, 'Hz'] },
];
/** Tersbandens mitter i motorns post-EQ (samma som PostEq.kt och headphones.js). */
export const THIRD_OCTAVE_CENTERS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

/** Den parametriska EQ:ns förstärkning (dB) vid frekvensen f. */
export function peqDb(peq, f) {
  return (peq || []).reduce((a, b, i) => (b && Math.abs(b.gain) > 1e-6
    ? a + responseDb(coeffs(PEQ_BANDS[i]?.type || 'peaking', 48000, b.freq, b.q, b.gain), 48000, f) : a), 0);
}
/** Den parametriska EQ:n som 31 tersband – det som motorn lägger i post-EQ:n. */
export const peqCurve = (peq) => THIRD_OCTAVE_CENTERS.map((f) => Math.round(Math.max(-24, Math.min(24, peqDb(peq, f))) * 100) / 100);

const clamp = (v, [lo, hi], dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

export function bandLabel(cutoffs, i) {
  const f = (hz) => (hz >= 1000 ? `${+(hz / 1000).toFixed(1)} k` : `${hz}`);
  const lo = i === 0 ? 0 : cutoffs[i - 1];
  return i === cutoffs.length - 1 ? `${f(lo)}+ Hz` : `${f(lo)}–${f(cutoffs[i])} Hz`;
}

const neutralMbc = () => ({ threshold: 0, ratio: 1, attack: 10, release: 150, knee: 6, preGain: 0, postGain: 0 });

/** Neutral kedja: allt platt, limitern bara som skydd vid −1 dB. */
export function neutral() {
  return {
    inputGain: 0,
    preEq: EQ_CUTOFFS.map(() => ({ gain: 0 })),
    mbc: MBC_CUTOFFS.map(() => neutralMbc()),
    postEq: EQ_CUTOFFS.map(() => ({ gain: 0 })),
    peq: PEQ_BANDS.map((b) => ({ freq: b.freq, gain: 0, q: b.q })),
    limiter: { attack: 1, release: 60, ratio: 10, threshold: -1, postGain: 0 },
    outputGain: 0,
  };
}

/** Fyller i saknade värden och håller allt inom tillåtna gränser (även för importerade presets). */
export function sanitize(p) {
  const n = neutral();
  const src = p && typeof p === 'object' ? p : {};
  const eq = (arr) => n.preEq.map((d, i) => ({ gain: clamp(arr?.[i]?.gain, RANGES.eqGain, d.gain) }));
  return {
    inputGain: clamp(src.inputGain, RANGES.inputGain, n.inputGain),
    preEq: eq(src.preEq),
    mbc: n.mbc.map((d, i) => {
      const b = src.mbc?.[i] || {};
      return {
        threshold: clamp(b.threshold, RANGES.threshold, d.threshold),
        ratio: clamp(b.ratio, RANGES.ratio, d.ratio),
        attack: clamp(b.attack, RANGES.attack, d.attack),
        release: clamp(b.release, RANGES.release, d.release),
        knee: clamp(b.knee, RANGES.knee, d.knee),
        preGain: clamp(b.preGain, RANGES.preGain, d.preGain),
        postGain: clamp(b.postGain, RANGES.postGain, d.postGain),
      };
    }),
    postEq: eq(src.postEq),
    peq: n.peq.map((d, i) => {
      const b = src.peq?.[i] || {};
      return { freq: clamp(b.freq, PEQ_BANDS[i].range, d.freq), gain: clamp(b.gain, RANGES.peqGain, d.gain), q: clamp(b.q, RANGES.peqQ, d.q) };
    }),
    limiter: {
      attack: clamp(src.limiter?.attack, RANGES.limAttack, n.limiter.attack),
      release: clamp(src.limiter?.release, RANGES.limRelease, n.limiter.release),
      ratio: clamp(src.limiter?.ratio, RANGES.limRatio, n.limiter.ratio),
      threshold: clamp(src.limiter?.threshold, RANGES.limThreshold, n.limiter.threshold),
      postGain: clamp(src.limiter?.postGain, RANGES.limPostGain, n.limiter.postGain),
    },
    outputGain: clamp(src.outputGain, RANGES.outputGain, n.outputGain),
  };
}

/** Det som skickas till Kotlin: parametrarna plus bandgränserna. */
export function toNative(p) {
  const s = sanitize(p);
  // Androids limiter lägger Ut och limiterns Lyft EFTER begränsningen. Plusnivåer där skulle skjuta topparna över taket –
  // därför sänks tröskeln lika mycket, så att det verkliga taket (tröskel + efterförstärkning) alltid hålls.
  const post = s.limiter.postGain + s.outputGain;
  const limiter = post > 0 && s.limiter.ratio > 1 ? { ...s.limiter, threshold: Math.max(RANGES.limThreshold[0], s.limiter.threshold - post) } : s.limiter;
  return {
    ...s,
    limiter,
    preEq: s.preEq.map((b, i) => ({ ...b, cutoff: EQ_CUTOFFS[i] })),
    mbc: s.mbc.map((b, i) => ({ ...b, cutoff: MBC_CUTOFFS[i] })),
    postEq: s.postEq.map((b, i) => ({ ...b, cutoff: EQ_CUTOFFS[i] })),
    post31: peqCurve(s.peq),
  };
}

function build(fn) {
  const p = neutral();
  fn(p);
  return sanitize(p);
}

/**
 * En preset uttryckt som avsikt: In, EQ 1 (pre), EQ 2 (post), kompressorns fyra band [tröskel, ratio, attack, release,
 * efterförstärkning] och limitern [attack, release, ratio] (taket −1 dB). Trösklarna är kalibrerade mot riktiga
 * Suno-låtar (nivåanpassade till −14 LUFS + In) så att varje band trycker ned så mycket som presetten avser:
 * 0,3 dB (Jazz) … 6 dB (Nattlyssning). Riktvärden från mastringspraxis: lim 1–3 dB, attack 10–30 ms för punch,
 * breda EQ-drag på 0,5–3 dB.
 */
function spec({ in: inputGain, pre, post, mbc, lim }) {
  return build((p) => {
    p.inputGain = inputGain;
    pre.forEach((g, i) => { p.preEq[i].gain = g; });
    post.forEach((g, i) => { p.postEq[i].gain = g; });
    mbc.forEach(([threshold, ratio, attack, release, postGain = 0], i) => Object.assign(p.mbc[i], { threshold, ratio, attack, release, knee: 6, postGain }));
    p.limiter = { attack: lim[0], release: lim[1], ratio: lim[2], threshold: -1, postGain: 0 };
  });
}

// Startvärden att justera med örat – inte facit.
export const BUILTIN_PRESETS = [
  {
    id: 'flat', name: 'Orörd', builtin: true, desc: 'Ingen bearbetning alls – inte ens limitern. Låten som den är: en ren grund att bygga från.',
    params: build((p) => { p.limiter = { attack: 1, release: 60, ratio: 1, threshold: 0, postGain: 0 }; }),
  },
  { id: 'suno-fix', name: 'Suno-fix', builtin: true, desc: 'För typiska Suno-låtar: mindre grumligt (200–400 Hz) före kompressorn, tämjer hårdhet 3–8 kHz och skimmer i toppen, mjukare kick.',
    params: spec({ in: 2, pre: [0, 0, -1, -1, 0, 0, 0, 0], post: [0, 0.5, 0, 0, 0, 0, -2, -1.5],
      mbc: [[-21, 2, 20, 120], [-18, 1.5, 30, 200], [-25.5, 2.5, 5, 100], [-31, 2, 3, 80]], lim: [0.5, 50, 12] }) },
  { id: 'transparent', name: 'Transparent', builtin: true, desc: 'Nästan ingen färgning: 0,5 dB kompression i alla band, ett nyp luft och en limiter som skydd. För låtar som redan låter bra.',
    params: spec({ in: 0, pre: [-0.5, 0, 0, 0, 0, 0, 0, 0], post: [0, 0, 0, 0, 0, 0, 0, 0.5],
      mbc: [[-20, 1.3, 30, 250], [-17.5, 1.3, 30, 250], [-25.5, 1.3, 30, 250], [-30.5, 1.3, 30, 250]], lim: [1, 100, 6] }) },
  { id: 'mjuk-kick', name: 'Mjuk kick', builtin: true, desc: 'Tämjer en hård kick: kick-bandet komprimeras snabbt (4:1), limitern tar topparna. Ingen EQ.',
    params: spec({ in: 3, pre: [0, 0, 0, 0, 0, 0, 0, 0], post: [0, 0, 0, 0, 0, 0, 0, 0],
      mbc: [[-19.5, 4, 1, 80, 2], [-15, 1.5, 10, 150], [0, 1, 10, 150], [0, 1, 10, 150]], lim: [0.5, 50, 12] }) },
  { id: 'radio-ljus', name: 'Radio ljus', builtin: true, desc: 'Ljust, tätt och högt som radio: 2 dB kompression i alla band, glans över 8 kHz och hård limiter.',
    params: spec({ in: 4, pre: [0, 0, -0.5, 0, 0, 0, 0, 0], post: [0, 0, 0, -0.5, 0, 0.5, 1, 3],
      mbc: [[-17.5, 2.5, 5, 120], [-14, 2.5, 5, 120], [-22, 2.5, 5, 120], [-28, 2.5, 5, 120]], lim: [0.5, 40, 20] }) },
  { id: 'silkeslen-rost', name: 'Silkeslen röst', builtin: true, desc: 'Mjukar upp hårda 3–8 kHz så att rösten blir len: snabb kompression i närvaroband, sänkt 5 kHz och mer de-esser.',
    params: spec({ in: 2, pre: [0, 0, 0, 0, 0, 0, -1, -0.5], post: [0, 0, 0.5, 0, 0, 0.5, -2.5, -1],
      mbc: [[-16.5, 1.5, 20, 150], [-15.5, 1.8, 15, 150], [-25, 3, 2, 120], [-29, 2, 3, 100]], lim: [1, 80, 8] }) },
  { id: 'varm-lim', name: 'Varm lim', builtin: true, desc: 'Varm botten, mjuk topp och långsam, jämn kompression (2 dB, 30 ms attack) som håller ihop mixen.',
    params: spec({ in: 2, pre: [0, 0, 1, 0, 0, 0, 0, -0.5], post: [1.5, 1, 0.5, 0, 0, 0, -1, -1.5],
      mbc: [[-21, 2, 30, 300], [-18, 2, 30, 300], [-26.5, 2, 30, 300], [-33, 2, 30, 300]], lim: [1, 80, 10] }) },
  { id: 'bas-varm', name: 'Bas varm', builtin: true, desc: 'Fylligare och varmare botten (+2,5 dB under 120 Hz) med en basbandskompressor som håller den på plats.',
    params: spec({ in: 2, pre: [0, 0, 0, -0.5, 0, 0, 0, 0], post: [2.5, 2, 0.5, -0.5, 0, 0, 0, -0.5],
      mbc: [[-21.5, 2.5, 15, 150], [-16, 1.3, 20, 200], [0, 1, 10, 150], [0, 1, 10, 150]], lim: [1, 100, 10] }) },
  { id: 'tat-pop', name: 'Tät pop', builtin: true, desc: 'Modern, tät och glansig pop: 3 dB kompression i alla band, lite luft och bredd.',
    params: spec({ in: 5, pre: [0, 0, -1, 0, 0, 0, 0, 0], post: [0.5, 0, 0, -1, 0, 0.5, 1, 2],
      mbc: [[-20, 2.5, 5, 100], [-16, 2.5, 5, 100], [-24, 2.5, 5, 100], [-30, 2.5, 5, 100]], lim: [0.5, 40, 20] }) },
  { id: 'hiphop-punch', name: 'Hiphop punch', builtin: true, desc: 'Kicken slår igenom (30 ms attack) men hålls på plats; mer kropp i 60–120 Hz och starkt anslag.',
    params: spec({ in: 4, pre: [0, 0, -1, 0, 0, 0, 0, 0], post: [1.5, 2, 0, -1, 0, 0.5, 0, 0.5],
      mbc: [[-22, 2, 30, 100], [-16.5, 1.6, 15, 150], [-20.5, 1.3, 10, 150], [0, 1, 10, 150]], lim: [2, 50, 12] }) },
  { id: 'trap-808', name: 'Trap 808', builtin: true, desc: 'Djup 808 under kontroll (+3 dB sub), krispig hi-hat och tät limiter.',
    params: spec({ in: 5, pre: [0, 0, -1, 0, 0, 0, 0, 0], post: [3, 1, -0.5, -1, 0, 0, 0.5, 2],
      mbc: [[-19.5, 3, 10, 120, 1.5], [-13.5, 1.5, 10, 150], [-19.5, 1.3, 10, 150], [-28, 2, 3, 80]], lim: [0.5, 40, 20] }) },
  { id: 'edm-hogt', name: 'EDM högt', builtin: true, desc: 'Högt och tätt för elektroniskt: 3–4 dB kompression, mycket sub och luft, bred stereo, snabb limiter.',
    params: spec({ in: 7, pre: [0, 0, -1, -0.5, 0, 0, 0, 0], post: [2, 0.5, 0, -1.5, 0, 0, 1, 2.5],
      mbc: [[-20, 3, 3, 60], [-15, 3, 5, 60], [-21, 3, 3, 60], [-27.5, 3, 3, 60]], lim: [0.5, 30, 25] }) },
  { id: 'rnb-silke', name: 'R&B silke', builtin: true, desc: 'Len topp, varm botten och jämn kompression – rösten i fokus utan vassa s-ljud.',
    params: spec({ in: 3, pre: [0, 0, -0.5, 0, 0, 0, 0, 0], post: [1, 2, 0.5, -0.5, 0, 0, -1.5, 1],
      mbc: [[-18, 2, 15, 200], [-15.5, 2, 15, 200], [-24, 2.5, 4, 120], [-29, 2, 15, 200]], lim: [2, 100, 10] }) },
  { id: 'reggae', name: 'Reggae/dub', builtin: true, desc: 'Rund, djup bas och one-drop i fokus: varm botten, mjuk topp och luftig bredd – utan att basen tar över.',
    params: spec({ in: 3, pre: [-0.5, 0, 0, -0.5, 0, 0, 0, 0], post: [1.5, 2.5, 0, -1, -0.5, 0, -1, 0.5],
      mbc: [[-21.5, 2, 20, 150], [-15.5, 1.5, 15, 180], [-22.5, 2, 5, 120], [-26.5, 1.3, 10, 150]], lim: [1, 80, 10] }) },
  { id: 'reggaeton', name: 'Reggaeton/afro', builtin: true, desc: 'Studsig kick och bas, tydlig rytm och sång fram.',
    params: spec({ in: 4, pre: [0, 0, -0.5, 0, 0, 0, 0, 0], post: [1.5, 2, 0, -1, 0, 1, 0, 1],
      mbc: [[-21, 2, 15, 90], [-14, 1.5, 10, 150], [-23, 2, 5, 110], [-25.5, 1.3, 10, 150]], lim: [1, 50, 12] }) },
  { id: 'rock', name: 'Rock', builtin: true, desc: 'Gitarrer och trummor fram, mindre lådigt (250–500 Hz), mer attack och närvaro.',
    params: spec({ in: 4, pre: [0, 0, -1, -0.5, 0, 0, 0, 0], post: [0.5, 1, 0, -2, 0, 1.5, 1.5, 0.5],
      mbc: [[-20.5, 2, 15, 120], [-16.5, 2.5, 10, 120], [-22, 1.5, 10, 150], [-25.5, 1.3, 10, 150]], lim: [1, 70, 12] }) },
  { id: 'metal', name: 'Metal tight', builtin: true, desc: 'Tight bas, mindre lådigt och kontrollerad mitt, tydliga gitarrer utan fräs.',
    params: spec({ in: 5, pre: [-0.5, 0, 0, -1, 0, 0, 0, 0], post: [-0.5, 1.5, 0, -2.5, 0, 1.5, 0, -1.5],
      mbc: [[-19, 3, 3, 80], [-14.5, 2.5, 5, 100], [-21.5, 2, 3, 90], [-24.5, 1.3, 10, 150]], lim: [0.5, 40, 15] }) },
  { id: 'country', name: 'Country/americana', builtin: true, desc: 'Sång och gitarrer fram (1–3 kHz), ren botten utan lådighet, naturlig dynamik med lite lim.',
    params: spec({ in: 3, pre: [-0.5, 0, -0.5, -0.5, 0, 0, 0, 0], post: [0, 0.5, 0, -1, 0, 1.5, 1, 1],
      mbc: [[-19.5, 2, 15, 120], [-17, 2, 10, 150], [-23, 1.8, 5, 120], [-28.5, 1.5, 10, 150]], lim: [1, 70, 10] }) },
  { id: 'schlager', name: 'Schlager/dansband', builtin: true, desc: 'Rak, tydlig och glad: rösten fram, tät mitt, glans i toppen.',
    params: spec({ in: 4, pre: [0, 0, -0.5, 0, 0, 0, 0, 0], post: [0, 0.5, 0, -1, 0.5, 2, 0.5, 1.5],
      mbc: [[-20, 2.2, 6, 120], [-16, 2.2, 6, 120], [-24, 2.2, 6, 120], [-30.5, 2.2, 6, 120]], lim: [0.5, 60, 15] }) },
  { id: 'indie', name: 'Indie luftig', builtin: true, desc: 'Öppen och luftig med naturlig dynamik, lite värme och bred stereo.',
    params: spec({ in: 2, pre: [0, 0, 0, -0.5, 0, 0, 0, 0], post: [0, 0.5, 1, -1, 0, 0, 0.5, 2],
      mbc: [[-19, 1.5, 20, 220], [-16.5, 1.5, 20, 220], [-24.5, 1.5, 20, 220], [-30, 1.5, 20, 220]], lim: [2, 120, 8] }) },
  { id: 'akustisk', name: 'Akustisk luftig', builtin: true, desc: 'Varsam för akustiskt: knappt någon kompression, muller bort under 60 Hz och luft i toppen. Behåller dynamiken.',
    params: spec({ in: 1, pre: [-1.5, 0, 0, 0, 0, 0, 0, 0], post: [-1, 0, 0, -1, 0, 0.5, 0.5, 2.5],
      mbc: [[-20.5, 1.3, 30, 300], [-18, 1.3, 30, 300], [-26, 1.3, 30, 300], [-31.5, 1.3, 30, 300]], lim: [3, 150, 6] }) },
  { id: 'ballad', name: 'Ballad – rösten fram', builtin: true, desc: 'Lyfter rösten (1–3 kHz) utan att den blir vass; mellanregistret jämnas ut, dynamiken får vara kvar.',
    params: spec({ in: 2, pre: [-0.5, 0, -0.5, 0, 0, 0, 0, 0], post: [0, 0, 0, -0.5, 0.5, 2, -1, 0.5],
      mbc: [[-18, 1.3, 20, 200], [-16, 2, 10, 160], [-23, 2, 5, 120], [-27.5, 1.3, 10, 150]], lim: [2, 120, 8] }) },
  { id: 'jazz', name: 'Jazz naturlig', builtin: true, desc: 'Nästan orörd dynamik (0,3 dB kompression), bara lite värme och luft.',
    params: spec({ in: 1, pre: [0, 0, 0, 0, 0, 0, 0, 0], post: [0, 0, 0.5, 0, 0, 0, 0, 1.5],
      mbc: [[-17.5, 1.2, 30, 300], [-15.5, 1.2, 30, 300], [-23, 1.2, 30, 300], [-27.5, 1.2, 30, 300]], lim: [3, 200, 4] }) },
  { id: 'film', name: 'Film/orkester', builtin: true, desc: 'Varsam för stort och dynamiskt: bara toppskydd, lite lim och bred stereo.',
    params: spec({ in: 0, pre: [-0.5, 0, 0, 0, 0, 0, 0, 0], post: [0.5, 0, 0, 0, 0, 0, 0, 1],
      mbc: [[-18.5, 1.3, 30, 400], [-17, 1.3, 30, 400], [-24.5, 1.3, 30, 400], [-29.5, 1.3, 30, 400]], lim: [1, 120, 10] }) },
  { id: 'lofi', name: 'Lo-fi mjuk', builtin: true, desc: 'Mörkt, mjukt och varmt: diskanten rullas av kraftigt, långsam kompression och smalare stereo.',
    params: spec({ in: 2, pre: [0, 0, 0, 0, 0, 0, -1, -1], post: [1, 2, 1, 0, 0, -1, -3, -6],
      mbc: [[-22, 2, 30, 400], [-19, 2, 30, 400], [-28, 2, 30, 400], [-34.5, 2, 30, 400]], lim: [5, 200, 6] }) },
  { id: 'natt', name: 'Nattlyssning', builtin: true, desc: 'Kraftigt utjämnad dynamik (6 dB) så att allt hörs på låg volym. För lyssning, inte för släpp.',
    params: spec({ in: 6, pre: [-1, 0, 0, 0, 0, 0, 0, 0], post: [-1, 0, 0, 0, 0.5, 1, 0, 0],
      mbc: [[-22.5, 4, 5, 200], [-17, 4, 5, 200], [-25.5, 4, 5, 200], [-31.5, 4, 5, 200]], lim: [0.5, 60, 20] }) },
  { id: 'horlurar', name: 'Hörlurar – len topp', builtin: true, desc: 'Mjukare diskant för långa lyssningspass i hörlurar. För lyssning.',
    params: spec({ in: 1, pre: [0, 0, 0, 0, 0, 0, -0.5, 0], post: [0, 0, 0, 0, 0, 0, -2, -2.5],
      mbc: [[-22.5, 1.3, 15, 200], [-19, 1.3, 15, 200], [-28, 1.3, 15, 200], [-33.5, 1.3, 15, 200]], lim: [2, 120, 8] }) },
  { id: 'bil', name: 'Bilstereo', builtin: true, desc: 'För bilen: mer bas (vägbruset äter den), mindre vass topp, jämnare nivå. För lyssning.',
    params: spec({ in: 4, pre: [0, 0, -0.5, 0, 0, 0, 0, 0], post: [2.5, 1.5, 0, 0, 0, 0, -1.5, -0.5],
      mbc: [[-19, 2.5, 8, 150], [-15.5, 2.5, 8, 150], [-23.5, 2.5, 8, 150], [-29.5, 2.5, 8, 150]], lim: [0.5, 60, 15] }) },
  { id: 'telefon', name: 'Telefonhögtalare', builtin: true, desc: 'För telefonens högtalare: ingen djupbas (den hörs ändå inte), mer mitt och närvaro. För lyssning.',
    params: spec({ in: 5, pre: [-2, -1, 0, 0, 0, 0, 0, 0], post: [-8, -3, 0, 0, 1.5, 2.5, 0.5, 0],
      mbc: [[-21, 2.5, 5, 120], [-15.5, 2.5, 5, 120], [-23.5, 2.5, 5, 120], [-29.5, 2.5, 5, 120]], lim: [0.5, 40, 20] }) },
  { id: 'gym', name: 'Gym/energi', builtin: true, desc: 'Maximalt tryck: 4 dB kompression, mycket bas, glans och hård limiter.',
    params: spec({ in: 8, pre: [0, 0, -1, 0, 0, 0, 0, 0], post: [1.5, 2.5, 0, -1, 0, 0, 0.5, 2.5],
      mbc: [[-19, 3, 3, 70], [-14, 3, 3, 70], [-22, 3, 3, 70], [-28.5, 3, 3, 70]], lim: [0.5, 35, 25] }) },
  { id: 'demo-check', name: 'Demo-kontroll', builtin: true, desc: 'Avslöjar problem: höjer lågmellan och skärpa 3 dB så att grumlighet och hårdhet hörs tydligt. Inte för släpp.',
    params: spec({ in: 0, pre: [0, 0, 0, 0, 0, 0, 0, 0], post: [0, 0, 0, 3, 0, 0, 3, 0],
      mbc: [[0, 1, 10, 150], [0, 1, 10, 150], [0, 1, 10, 150], [0, 1, 10, 150]], lim: [1, 60, 10] }) },
  {
    // Fas 1:s testläge – överdrivet med flit, för att höra att effekten sitter på
    id: 'test', name: 'Test (överdrivet)', builtin: true, desc: 'Överdrivet med flit – bara för att höra att effekten sitter på.',
    params: build((p) => {
      p.inputGain = 6;
      p.limiter = { attack: 1, release: 60, ratio: 10, threshold: -20, postGain: 0 };
    }),
  },
];

/**
 * Skydd mot skärpa och distorsion i de inbyggda presetsen: ingen kompressor snabbare än 3 ms attack / 100 ms
 * release (snabbare skapar övertoner i basen som låter vasst), och limitern släpper aldrig snabbare än 60 ms.
 * Gäller inte Test och Orörd.
 */
for (const p of BUILTIN_PRESETS) {
  if (p.id === 'test' || p.id === 'flat') continue;
  p.params.mbc.forEach((b) => { if (b.ratio > 1) { b.attack = Math.max(3, b.attack); b.release = Math.max(100, b.release); } });
  p.params.limiter.release = Math.max(60, p.params.limiter.release);
  p.params.limiter.attack = Math.max(0.5, p.params.limiter.attack);
}

export const MACROS = [
  { key: 'kick', label: 'Kick mjukare', group: 'bas', affects: 'Multiband: kickbandet (0–120 Hz) + EQ 60–120 Hz', help: 'Komprimerar kick-bandet (0–120 Hz) hårdare och snabbare. Vänster = hårdare kick.' },
  { key: 'bright', label: 'Ljusare', group: 'ton', affects: 'Post-EQ: 3–8 kHz och 8 kHz+', help: 'Höjer diskanten över 8 kHz (och lite 3–8 kHz). Vänster = mörkare.' },
  { key: 'punch', label: 'Tryck / limiter', group: 'dynamik', affects: 'Ingång → hårdare in i limitern', help: 'Mer ingångsförstärkning in i limitern = högre och tätare. Vänster = mer dynamik.' },
  { key: 'vocal', label: 'Röst silkeslen', group: 'vokal', affects: 'Post-EQ 3–8 kHz + multiband: närvarobandet', help: 'Mjukare 3–8 kHz och mild kompression av närvarobandet. Vänster = mer framträdande röst.' },
];
MACROS.push(
  { key: 'sibilance', label: 'S-ljud', group: 'vokal', affects: 'Multiband: närvaro- och luftbandet (snabb)', help: 'Tämjer vassa s- och t-ljud (5–10 kHz) med snabb kompression. Vänster = mer s-ljud.' },
  { key: 'glitter', label: 'Mjuk topp', group: 'ton', affects: 'Post-EQ 8 kHz+ + multiband: luftbandet', help: 'Tar bort "glitter" och fräs i toppen (vanligt i Suno-låtar). Vänster = mer glans.' },
);
export const noMacros = () => ({ kick: 0, bright: 0, punch: 0, vocal: 0, sibilance: 0, glitter: 0 });

/** Delar av kedjan som kan slås av var för sig. Av = neutral (påverkar inte ljudet). */
export const STAGES = ['input', 'preEq', 'mbc0', 'mbc1', 'mbc2', 'mbc3', 'postEq', 'peq', 'limiter', 'output'];
export const allEnabled = () => Object.fromEntries([...STAGES, ...PEQ_BANDS.map((_, i) => `peq${i}`), ...MACROS.map((m) => `m_${m.key}`)].map((k) => [k, true]));

/** Makron som är avslagna räknas som 0. */
export function activeMacros(macros, enabled = {}) {
  return Object.fromEntries(Object.entries({ ...noMacros(), ...macros }).map(([k, v]) => [k, enabled[`m_${k}`] === false ? 0 : v]));
}

/** Neutraliserar avslagna delar av kedjan. */
export function applyEnables(params, enabled = {}) {
  const p = structuredClone(sanitize(params));
  const off = (k) => enabled[k] === false;
  if (off('input')) p.inputGain = 0;
  if (off('preEq')) p.preEq.forEach((b) => { b.gain = 0; });
  p.mbc.forEach((b, i) => { if (off(`mbc${i}`)) Object.assign(b, { ratio: 1, preGain: 0, postGain: 0 }); });
  if (off('postEq')) p.postEq.forEach((b) => { b.gain = 0; });
  p.peq.forEach((b, i) => { if (off('peq') || off(`peq${i}`)) b.gain = 0; });
  if (off('limiter')) Object.assign(p.limiter, { threshold: 0, ratio: 1, postGain: 0 });
  if (off('output')) p.outputGain = 0;
  return p;
}

/**
 * Solo: bara en del hörs, allt annat i kedjan blir neutralt (utgångsnivån behålls). Gäller sektioner (t.ex. 'mbc0',
 * 'limiter', 'peq'), enskilda PEQ-band ('peq2') och enkla reglage ('m_kick'). Ändrar inga inställningar.
 */
export function soloEnables(enabled = {}, solo = null) {
  if (!solo) return enabled;
  const e = Object.fromEntries(Object.keys(allEnabled()).map((k) => [k, false]));
  e.output = enabled.output !== false;
  if (solo === 'eq2') { e.postEq = enabled.postEq !== false; e.peq = enabled.peq !== false;
    PEQ_BANDS.forEach((_, i) => { e[`peq${i}`] = enabled[`peq${i}`] !== false; }); return e; }
  if (solo === 'eq') { e.preEq = enabled.preEq !== false; e.postEq = enabled.postEq !== false; e.peq = enabled.peq !== false;
    PEQ_BANDS.forEach((_, i) => { e[`peq${i}`] = enabled[`peq${i}`] !== false; }); return e; }
  if (solo === 'mbc') { [0, 1, 2, 3].forEach((i) => { e[`mbc${i}`] = enabled[`mbc${i}`] !== false; }); return e; }
  if (/^peq\d$/.test(solo)) { PEQ_BANDS.forEach((_, i) => { e[`peq${i}`] = false; }); e.peq = true; e[solo] = true; } else {
    PEQ_BANDS.forEach((_, i) => { e[`peq${i}`] = enabled[`peq${i}`] !== false; });
    e[solo] = true;
  }
  return e;
}

/** Kedjan med solo: ett solat enkelt reglage hörs ensamt ovanpå en platt kedja. */
export function soloParams(base, macros, enabled, solo) {
  if (solo?.startsWith('m_')) {
    const k = solo.slice(2);
    const p = applyMacros(neutral(), { ...noMacros(), [k]: macros?.[k] ?? 0 });
    p.outputGain = enabled.output === false ? 0 : sanitize(base).outputGain;
    return sanitize(p);
  }
  const p = applyEnables(applyMacros(base, activeMacros(macros, enabled)), soloEnables(enabled, solo));
  if (solo && solo !== 'limiter') p.limiter = neutral().limiter; // skyddslimitern ligger kvar så att inget klipper
  return p;
}

/**
 * Mixerns "mängd" per del (0–200 %, 100 = presetten som den är): skalar EQ-förstärkningarna och kompressionen
 * (ratio). Läggs ovanpå grunden innan enkla reglage och på/av.
 */
export const AMOUNT_KEYS = ['preEq', 'comp', 'postEq', 'peq'];
export const noAmounts = () => Object.fromEntries(AMOUNT_KEYS.map((k) => [k, 100]));
export function applyAmounts(base, amounts = {}) {
  const p = structuredClone(sanitize(base));
  const a = (k) => Math.max(0, Math.min(200, Number(amounts?.[k] ?? 100))) / 100;
  p.preEq.forEach((b) => { b.gain *= a('preEq'); });
  p.postEq.forEach((b) => { b.gain *= a('postEq'); });
  p.peq.forEach((b) => { b.gain *= a('peq'); });
  p.mbc.forEach((b) => { if (b.ratio > 1) b.ratio = 1 + (b.ratio - 1) * a('comp'); });
  return sanitize(p);
}

/** Delar som kan bytas var för sig med en modulpreset (EQ från en preset, limiter från en annan …). */
export const MODULES = {
  eq: { name: 'EQ', keys: ['preEq', 'postEq', 'peq'] },
  comp: { name: 'Kompressor', keys: ['mbc'] },
  limiter: { name: 'Limiter', keys: ['limiter'] },
};
/** Lägger in en del (EQ, kompressor eller limiter) från en annan preset; resten behålls. */
export function applyModule(base, fromParams, mod) {
  const p = structuredClone(sanitize(base));
  const src = sanitize(fromParams);
  for (const k of MODULES[mod].keys) p[k] = structuredClone(src[k]);
  return p;
}
/** Har presetten något i den här delen (annars är den inte meningsfull som modulpreset)? */
export function moduleActive(params, mod) {
  const p = sanitize(params), n = neutral();
  if (mod === 'limiter') return true;
  return MODULES[mod].keys.some((k) => JSON.stringify(p[k]) !== JSON.stringify(n[k]));
}

/**
 * De enkla reglagen (−100…+100, 0 = presetens egna värden) räknas om till kedjans parametrar.
 * Allt läggs ovanpå grunden och hålls sedan inom gränserna.
 */
export function applyMacros(base, macros) {
  const p = structuredClone(sanitize(base));
  const a = (k) => Math.max(-1, Math.min(1, (Number(macros?.[k]) || 0) / 100));
  const k = a('kick'), b = a('bright'), u = a('punch'), v = a('vocal');
  if (k) {
    const m = p.mbc[0];
    m.threshold += -12 * k;
    m.ratio = Math.max(1, m.ratio * (1 + 1.5 * k));
    if (k > 0) m.attack = m.attack * (1 - 0.7 * k);
    p.postEq[1].gain += -1.5 * k;
  }
  if (b) {
    p.postEq[7].gain += 4 * b;
    p.postEq[6].gain += 1 * b;
  }
  if (u) p.inputGain += 6 * u;
  const si = a('sibilance'), gl = a('glitter');
  if (si) {
    for (const m of [p.mbc[2], p.mbc[3]]) {
      m.threshold += -8 * si;
      m.ratio = Math.max(1, m.ratio * (1 + 1.2 * si));
      if (si > 0) { m.attack *= 1 - 0.8 * si; m.release *= 1 - 0.5 * si; } // snabbare – men relativt, så att bandets egna fadrar fortfarande verkar
    }
  }
  if (gl) {
    p.postEq[7].gain += -4 * gl;
    p.mbc[3].threshold += -6 * gl;
    if (gl > 0) p.mbc[3].attack *= 1 - 0.8 * gl;
  }
  if (v) {
    p.postEq[6].gain += -3 * v;
    p.mbc[2].threshold += -10 * v;
    p.mbc[2].ratio = Math.max(1, p.mbc[2].ratio * (1 + v));
  }
  return sanitize(p);
}

// ---- Presets: spara, döp om, ta bort, export/import som JSON ----

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'preset';

export function uniqueName(name, presets) {
  const names = new Set(presets.map((p) => p.name));
  const n = String(name || '').trim() || 'Min preset';
  if (!names.has(n)) return n;
  for (let i = 2; ; i++) if (!names.has(`${n} (${i})`)) return `${n} (${i})`;
}

export function savePreset(userPresets, name, params, all = [...BUILTIN_PRESETS, ...userPresets]) {
  const n = uniqueName(name, all);
  const preset = { id: `u-${slug(n)}-${Date.now().toString(36)}`, name: n, params: sanitize(params) };
  return { presets: [...userPresets, preset], preset };
}

export function renamePreset(userPresets, id, name) {
  const others = [...BUILTIN_PRESETS, ...userPresets.filter((p) => p.id !== id)];
  return userPresets.map((p) => (p.id === id ? { ...p, name: uniqueName(name, others) } : p));
}

export function deletePreset(userPresets, id) {
  return userPresets.filter((p) => p.id !== id);
}

export function exportPresets(userPresets) {
  return JSON.stringify({ app: 'masterlab', version: 1, presets: userPresets.map(({ name, params }) => ({ name, params })) }, null, 2);
}

/** Läser en exporterad fil (eller en enda preset). Kastar ett fel med svensk text om filen inte går att använda. */
export function importPresets(userPresets, text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Filen är inte giltig JSON.'); }
  const list = Array.isArray(data?.presets) ? data.presets : Array.isArray(data) ? data : data?.params ? [data] : null;
  if (!list || !list.length) throw new Error('Hittade inga presets i filen.');
  let out = [...userPresets];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !item.params) continue;
    out = savePreset(out, item.name, item.params).presets;
  }
  if (out.length === userPresets.length) throw new Error('Hittade inga presets i filen.');
  return out;
}

/** Grupperna i Enkelt läge (som design A). */
export const MACRO_GROUPS = [
  { id: 'ton', name: 'Ton' },
  { id: 'vokal', name: 'Vokal' },
  { id: 'bas', name: 'Bas' },
  { id: 'dynamik', name: 'Dynamik' },
];

const SHORT = ['Kick', 'Mellan', 'Närvaro', 'Luft'];
const fmtG = (g) => `${g > 0 ? '+' : ''}${+g.toFixed(1)}`;

/**
 * Vad en inställning faktiskt gör, jämfört med neutral – för "Påverkar"-raden på presets.
 * Svarar en lista med korta texter, t.ex. ["Ingång +3 dB", "Kick 4:1 (snabb)", "Limiter 12:1"].
 */
export function presetEffects(params) {
  const p = sanitize(params), n = neutral(), out = [];
  if (p.inputGain !== 0) out.push(`Ingång ${fmtG(p.inputGain)} dB`);
  const eq = (name, bands) => {
    const changed = bands.map((b, i) => [i, b.gain]).filter(([, g]) => g !== 0);
    if (changed.length) out.push(`${name} ${changed.map(([i, g]) => `${bandLabel(EQ_CUTOFFS, i).replace(' Hz', '')} ${fmtG(g)}`).join(', ')}`);
  };
  eq('Pre-EQ', p.preEq);
  p.mbc.forEach((b, i) => {
    if (b.ratio > 1.0001) out.push(`${SHORT[i]} ${+b.ratio.toFixed(1)}:1${b.attack <= 3 ? ' (snabb)' : ''}`);
  });
  eq('Post-EQ', p.postEq);
  const pq = p.peq.map((b, i) => [b, i]).filter(([b]) => b.gain !== 0);
  if (pq.length) out.push(`PEQ ${pq.map(([b]) => `${b.freq >= 1000 ? `${+(b.freq / 1000).toFixed(1)}k` : b.freq} ${fmtG(b.gain)} Q${+b.q.toFixed(1)}`).join(', ')}`);
  const l = p.limiter;
  if (l.ratio <= 1.0001) { if (out.length) out.push('Limiter av'); }
  else if (l.threshold !== n.limiter.threshold || l.ratio !== n.limiter.ratio || l.attack !== n.limiter.attack || l.release !== n.limiter.release) {
    out.push(`Limiter ${+l.ratio.toFixed(1)}:1 vid ${fmtG(l.threshold)} dB`);
  }
  if (!out.length) return [l.ratio <= 1.0001 ? 'Ingen bearbetning alls – låten är orörd' : 'Ingen bearbetning (bara skyddslimiter)'];
  return out;
}

// ---- Lyssna på ett frekvensområde (solo/mute per band, som på en riktig EQ eller multibandkompressor) ----
// Område = de frekvenser ett band arbetar med. Solo: bara området hörs (resten sänks kraftigt). Mute: området tas bort.
// Läggs som en extra kurva i post-EQ:ns 31 tersband (precis före limitern). Sparas aldrig i en preset.

const AREA_DB = -24; // så mycket allt utanför (solo) eller innanför (mute) sänks – motorns största steg per tersband

/** Frekvensområdet [lo, hi] (Hz) för ett band: 'preEq:3', 'postEq:3', 'mbc:1' eller 'peq:2' (då med parametrarna p). */
export function areaRange(area, p = null) {
  const [kind, si] = String(area).split(':');
  const i = Number(si);
  const edge = (cut) => [i === 0 ? 20 : cut[i - 1], Math.min(20000, cut[i])];
  if (kind === 'preEq' || kind === 'postEq') return edge(EQ_CUTOFFS);
  if (kind === 'mbc') return edge(MBC_CUTOFFS);
  if (kind === 'peq') {
    const b = sanitize(p).peq[i], type = PEQ_BANDS[i].type;
    if (type === 'lowshelf') return [20, b.freq];
    if (type === 'highshelf') return [b.freq, 20000];
    // klockans bandbredd (oktaver) ur Q, minst en tredjedels oktav
    const n = Math.max(1 / 3, (2 * Math.asinh(1 / (2 * b.q))) / Math.LN2);
    return [b.freq * 2 ** (-n / 2), b.freq * 2 ** (n / 2)];
  }
  return [20, 20000];
}

/** 31 tersband (dB) som gör att bara området hörs (mode 'solo') eller att området tas bort ('mute'). */
export function listenCurve(area, mode, p = null) {
  if (!area || !mode) return null;
  const [lo, hi] = areaRange(area, p);
  let inside = THIRD_OCTAVE_CENTERS.map((c) => c >= lo / 2 ** (1 / 6) && c <= hi * 2 ** (1 / 6));
  if (!inside.some(Boolean)) { // smalt område mellan två mitter: ta närmaste
    const mid = Math.sqrt(lo * hi);
    const k = THIRD_OCTAVE_CENTERS.reduce((best, c, j) => (Math.abs(Math.log(c / mid)) < Math.abs(Math.log(THIRD_OCTAVE_CENTERS[best] / mid)) ? j : best), 0);
    inside = THIRD_OCTAVE_CENTERS.map((_, j) => j === k);
  }
  return inside.map((x) => ((mode === 'solo') === x ? 0 : AREA_DB));
}

/** Lägger lyssningskurvan på det som skickas till motorn. */
export function withListen(native, curve) {
  if (!curve) return native;
  return { ...native, post31: native.post31.map((g, i) => Math.max(-24, Math.min(24, Math.round((g + curve[i]) * 100) / 100))) };
}

/** Kompressorn "Hela låten": samma inställning på alla fyra band (sätts relativt, så banden följer med likadant). */
export const MBC_PARAMS = ['ratio', 'threshold', 'attack', 'release', 'knee', 'postGain'];
export function setAllBands(base, param, value) {
  const p = structuredClone(sanitize(base));
  p.mbc.forEach((b) => { b[param] = value; });
  return sanitize(p);
}
