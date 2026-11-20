// Gemensamt tillstånd för alla vyer. main.js sätter app.render/app.renderPart.
import { BUILTIN_PRESETS, noMacros } from './chain.js';

export const ui = {
  view: 'live',          // 'live' | 'analys' | 'fil' | 'mer'
  mode: 'mixer',         // Live: 'mixer' | 'curve' | 'advanced'
  liveBlock: 'quick',    // Live: valt block (quick, eq, comp, limiter, out)
  blocks: {},            // valt block per vy (analys, fil, mer)
  amounts: { preEq: 100, comp: 100, postEq: 100, peq: 100 }, // Mixerns mängd per del (%)
  curveSel: 2,           // Kurva: valt PEQ-band
  presetId: 'mjuk-kick',
  base: structuredClone(BUILTIN_PRESETS.find((p) => p.id === 'mjuk-kick').params),
  macros: noMacros(),
  userPresets: [],
  status: null,
  perms: null,
  msg: '',
  levelMsg: '',
  busy: false,
  update: null,
  updateMsg: '',
  version: '',
  canInstall: false,
  refs: [],              // sparade referenser { id, name, profile, created }
  refId: '',             // vald referens (Analys och Fil)
  spectrum: null,        // senaste live-spektrum { bands, rms, peak, agcGain, analysisSeconds }
  analysis: null,        // { profile } efter Stoppa
  analysisMsg: '',
  enabled: {},           // på/av per del av kedjan och per enkelt reglage (chain.js STAGES)
  constant: true,        // Konstant utnivå
  corr: { on: false, id: 'liberty4pro' },
  customHeadphones: [],
  profiles: {},          // per ljudutgång
  report: null,          // senaste bekräftelsen från motorn
  fix: null,             // Åtgärda – 3 förslag { variants, active, backup }
  mods: {},              // modulpresets: { eq, comp, limiter } = namnet på presetten delen kom från
  solo: null,            // solad del (chain.js soloEnables) – sparas aldrig
};

/** Fylls i av main.js. */
export const app = {
  render() {},
  /** Ritar om bara en del (id) – annars tappar ett reglage som dras greppet. */
  renderPart() {},
  toast() {},
};
