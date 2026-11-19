// Hörlurskorrigering (som AutoEq i Wavelet): parametriska filter → 31 tersband som skickas till live-motorn
// (PostEq.kt lägger dem ovanpå din post-EQ). Samma tersbandsmitter som PostEq.kt – ändra båda samtidigt.
//
// Inbyggd profil: Anker Soundcore Liberty 4 Pro, uppmätt av DHRME, korrektion från AutoEq
// (github.com/jaakkopasanen/AutoEq, MIT-licens, © Jaakko Pasanen). Mål: Harman in-ear.
// Förutsätter att Soundcore-appens EQ är platt/av.
import { coeffs, responseDb } from './dsp/biquad.js';

export const THIRD_OCTAVE = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

export const BUILTIN_HEADPHONES = [
  {
    id: 'liberty4pro',
    name: 'Soundcore Liberty 4 Pro',
    source: 'AutoEq · DHRME-mätning · Harman in-ear',
    text: `Preamp: -5.8 dB
Filter 1: ON LSC Fc 105 Hz Gain -2.7 dB Q 0.70
Filter 2: ON PK Fc 5158 Hz Gain 6.0 dB Q 1.68
Filter 3: ON PK Fc 141 Hz Gain -2.5 dB Q 0.75
Filter 4: ON PK Fc 9524 Hz Gain -1.9 dB Q 1.44
Filter 5: ON PK Fc 1001 Hz Gain 0.9 dB Q 2.16
Filter 6: ON HSC Fc 10000 Hz Gain 0.7 dB Q 0.70
Filter 7: ON PK Fc 2466 Hz Gain -1.3 dB Q 2.08
Filter 8: ON PK Fc 40 Hz Gain -0.6 dB Q 2.19
Filter 9: ON PK Fc 3655 Hz Gain 1.4 dB Q 4.05
Filter 10: ON PK Fc 536 Hz Gain -0.3 dB Q 2.55`,
  },
];

/** Läser AutoEq:s ParametricEQ.txt (eller samma format från Equalizer APO). */
export function parseParametric(text) {
  const lines = String(text || '').split(/\r?\n/);
  let preamp = 0;
  const filters = [];
  for (const l of lines) {
    const p = l.match(/Preamp:\s*(-?[\d.]+)\s*dB/i);
    if (p) { preamp = Number(p[1]); continue; }
    const m = l.match(/Filter\s*\d*:\s*ON\s+(PK|LSC|HSC|LS|HS|PEQ)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s+(-?[\d.]+)\s*dB(?:\s+Q\s+([\d.]+))?/i);
    if (m) {
      const t = m[1].toUpperCase();
      filters.push({ type: t === 'LSC' || t === 'LS' ? 'lowshelf' : t === 'HSC' || t === 'HS' ? 'highshelf' : 'peaking', f: Number(m[2]), gain: Number(m[3]), q: Number(m[4] || 0.707) });
    }
  }
  if (!filters.length) throw new Error('Hittade inga filter. Använd AutoEq:s "ParametricEQ.txt".');
  return { preamp, filters };
}

/** Korrigeringen som 31 tersband (dB) + preamp. */
export function toThirdOctave({ preamp, filters }) {
  const gains = THIRD_OCTAVE.map((f) => filters.reduce((a, fl) => a + responseDb(coeffs(fl.type, 48000, fl.f, fl.q, fl.gain), 48000, f), 0));
  return { gains: gains.map((g) => Math.round(g * 100) / 100), preamp: Math.max(-20, Math.min(6, preamp)) };
}

export function correctionFor(profile) {
  return { ...toThirdOctave(parseParametric(profile.text)), name: profile.name };
}
