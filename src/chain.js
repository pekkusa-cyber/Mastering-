// Live-kedjans parametrar: samma modell i webbgränssnittet och i Kotlin (LiveParams.kt).
// Kedjan: ingångsförstärkning → pre-EQ (8 band) → multiband-kompressor (4 band) → post-EQ (8 band) → limiter → utgång.
// Ren JavaScript utan DOM, så att den kan enhetstestas i Node (tests/unit).

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
};

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
  return {
    ...s,
    preEq: s.preEq.map((b, i) => ({ ...b, cutoff: EQ_CUTOFFS[i] })),
    mbc: s.mbc.map((b, i) => ({ ...b, cutoff: MBC_CUTOFFS[i] })),
    postEq: s.postEq.map((b, i) => ({ ...b, cutoff: EQ_CUTOFFS[i] })),
  };
}

function build(fn) {
  const p = neutral();
  fn(p);
  return sanitize(p);
}

// Startvärden att justera med örat – inte facit.
export const BUILTIN_PRESETS = [
  {
    id: 'mjuk-kick', name: 'Mjuk kick', builtin: true,
    params: build((p) => {
      p.inputGain = 3;
      Object.assign(p.mbc[0], { threshold: -24, ratio: 4, attack: 1, release: 80, knee: 6, postGain: 2 });
      Object.assign(p.mbc[1], { threshold: -18, ratio: 1.5, attack: 10, release: 150 });
      p.limiter = { attack: 0.5, release: 50, ratio: 12, threshold: -1, postGain: 0 };
    }),
  },
  {
    id: 'radio-ljus', name: 'Radio ljus', builtin: true,
    params: build((p) => {
      p.inputGain = 5;
      p.mbc.forEach((b) => Object.assign(b, { threshold: -18, ratio: 2, attack: 5, release: 120 }));
      p.postEq[6].gain = 1;
      p.postEq[7].gain = 3;
      p.limiter = { attack: 0.5, release: 40, ratio: 20, threshold: -1, postGain: 0 };
    }),
  },
  {
    id: 'silkeslen-rost', name: 'Silkeslen röst', builtin: true,
    params: build((p) => {
      p.inputGain = 2;
      Object.assign(p.mbc[1], { threshold: -20, ratio: 1.8, attack: 8, release: 150 });
      Object.assign(p.mbc[2], { threshold: -22, ratio: 3, attack: 3, release: 120, knee: 8 });
      p.postEq[6].gain = -2.5;
      p.postEq[7].gain = 1;
      p.limiter = { attack: 1, release: 60, ratio: 10, threshold: -1, postGain: 0 };
    }),
  },
  {
    id: 'varm-lim', name: 'Varm lim', builtin: true,
    params: build((p) => {
      p.inputGain = 2;
      p.mbc.forEach((b) => Object.assign(b, { threshold: -20, ratio: 2, attack: 20, release: 200, knee: 10 }));
      p.preEq[2].gain = 1;
      p.preEq[7].gain = -0.5;
      p.limiter = { attack: 1, release: 80, ratio: 10, threshold: -1, postGain: 0 };
    }),
  },
  {
    // Fas 1:s testläge – överdrivet med flit, för att höra att effekten sitter på
    id: 'test', name: 'Test (överdrivet)', builtin: true,
    params: build((p) => {
      p.inputGain = 6;
      p.limiter = { attack: 1, release: 60, ratio: 10, threshold: -20, postGain: 0 };
    }),
  },
];

export const MACROS = [
  { key: 'kick', label: 'Kick mjukare', help: 'Komprimerar kick-bandet (0–120 Hz) hårdare och snabbare. Vänster = hårdare kick.' },
  { key: 'bright', label: 'Ljusare', help: 'Höjer diskanten över 8 kHz (och lite 3–8 kHz). Vänster = mörkare.' },
  { key: 'punch', label: 'Tryck / limiter', help: 'Mer ingångsförstärkning in i limitern = högre och tätare. Vänster = mer dynamik.' },
  { key: 'vocal', label: 'Röst silkeslen', help: 'Mjukare 3–8 kHz och mild kompression av närvarobandet. Vänster = mer framträdande röst.' },
];
export const noMacros = () => ({ kick: 0, bright: 0, punch: 0, vocal: 0 });

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
