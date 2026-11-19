// Gemensamt tillstånd för alla vyer. main.js sätter app.render/app.renderPart.
import { BUILTIN_PRESETS, noMacros } from './chain.js';

export const ui = {
  view: 'live',          // 'live' | 'analys' | 'fil' | 'mer'
  mode: 'simple',        // Live: 'simple' | 'advanced'
  presetId: 'mjuk-kick',
  base: structuredClone(BUILTIN_PRESETS[0].params),
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
};

/** Fylls i av main.js. */
export const app = {
  render() {},
  /** Ritar om bara en del (id) – annars tappar ett reglage som dras greppet. */
  renderPart() {},
  toast() {},
};
