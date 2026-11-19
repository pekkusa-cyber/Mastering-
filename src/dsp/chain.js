// Filmastringens signalkedja (se src/master.js för ordningen). Blockvis bearbetning av stereo-Float32Array.
// Alla förstärkningar och EQ-ändringar glider mjukt (inga klick om parametrar ändras under uppspelning).
import { Biquad, coeffs } from './biquad.js';
import { Crossover4 } from './crossover.js';
import { Compressor, TransientShaper, softClip, coef } from './dynamics.js';
import { TruePeakLimiter } from './limiter.js';
import { deEsser, glitterFilter } from './splitdyn.js';
import { EQ_CUTOFFS, MBC_CUTOFFS, MATCH_FREQS } from '../master.js';
import { PEQ_BANDS } from '../chain.js';

export const BLOCK = 1024;
const SUB = 64; // EQ-ändringar sker i små steg var 64:e sampel

/** EQ-band för DynamicsProcessing-modellen (bandet gäller mellan föregående och egen gräns) som filter. */
export function graphicBands(cutoffs) {
  return cutoffs.map((hi, i) => {
    const lo = i === 0 ? 20 : cutoffs[i - 1];
    if (i === 0) return { type: 'lowshelf', f: hi, q: Math.SQRT1_2 };
    if (i === cutoffs.length - 1) return { type: 'highshelf', f: lo, q: Math.SQRT1_2 };
    const r = hi / lo;
    return { type: 'peaking', f: Math.sqrt(lo * hi), q: Math.sqrt(r) / (r - 1) };
  });
}

class EqBank {
  constructor(fs, defs) {
    this.fs = fs;
    this.bands = defs.map((d) => ({ ...d, gain: 0, target: 0, filt: new Biquad(coeffs(d.type, fs, d.f, d.q, 0)) }));
  }
  setGains(gains) { this.bands.forEach((b, i) => { b.target = gains[i] ?? 0; }); }
  /** Parametrisk: frekvens, Q och gain per band (ny frekvens/Q räknas in vid nästa delblock). */
  setBands(list) {
    this.bands.forEach((b, i) => {
      const x = list[i] || {};
      if (x.freq && (x.freq !== b.f || x.q !== b.q)) { b.f = x.freq; b.q = x.q; b.dirty = true; }
      b.target = x.gain ?? 0;
    });
  }
  get idle() { return this.bands.every((b) => b.gain === 0 && b.target === 0); }
  run(L, R, n) {
    if (this.idle) return;
    for (let s = 0; s < n; s += SUB) {
      const e = Math.min(n, s + SUB);
      for (const b of this.bands) {
        if (b.gain !== b.target || b.dirty) {
          const d = b.target - b.gain;
          b.gain = Math.abs(d) <= 0.25 ? b.target : b.gain + Math.sign(d) * 0.25;
          b.filt.set(coeffs(b.type, this.fs, b.f, b.q, b.gain));
          b.dirty = false;
        }
        if (b.gain !== 0 || b.target !== 0) { b.filt.run(L, 0, s, e); b.filt.run(R, 1, s, e); }
      }
    }
  }
}

/** Mjuk förstärkning (dB) som glider mot målet. */
class SmoothGain {
  constructor(fs, db = 0) { this.k = coef(15, fs); this.g = 10 ** (db / 20); this.t = this.g; }
  set(db) { this.t = 10 ** (db / 20); }
  run(L, R, n) {
    if (this.g === this.t && this.g === 1) return;
    let g = this.g; const t = this.t, k = this.k;
    for (let i = 0; i < n; i++) { g = k * g + (1 - k) * t; L[i] *= g; R[i] *= g; }
    this.g = Math.abs(g - t) < 1e-7 ? t : g;
  }
}

/**
 * Första delen av kedjan: allt fram till och med buss-kompressorn. Nivån efter den här delen mäts för att räkna
 * ut drive mot mål-LUFS.
 */
export class PreChain {
  constructor(fs, p) {
    this.fs = fs;
    this.trim = new SmoothGain(fs);
    this.pre = new EqBank(fs, graphicBands(EQ_CUTOFFS));
    this.match = new EqBank(fs, MATCH_FREQS.map((f, i) => (i === 0 ? { type: 'lowshelf', f: 45, q: Math.SQRT1_2 } : i === MATCH_FREQS.length - 1 ? { type: 'highshelf', f: 11300, q: Math.SQRT1_2 } : { type: 'peaking', f, q: 1.0 })));
    this.xo = new Crossover4(fs, MBC_CUTOFFS.slice(0, 3));
    this.comps = MBC_CUTOFFS.map(() => new Compressor(fs));
    this.kick = new TransientShaper(fs);
    this.post = new EqBank(fs, graphicBands(EQ_CUTOFFS));
    this.peq = new EqBank(fs, PEQ_BANDS.map((b) => ({ type: b.type, f: b.freq, q: b.q })));
    this.deEss = deEsser(fs);
    this.glitter = glitterFilter(fs);
    this.glue = new Compressor(fs);
    this.width = 1; this.widthNow = 1; this.wk = coef(15, fs);
    this.bands = MBC_CUTOFFS.map(() => [new Float32Array(BLOCK), new Float32Array(BLOCK)]);
    this.gr = { mbc: [0, 0, 0, 0], glue: 0, deEss: 0, glitter: 0 };
    this.set(p, true);
  }

  set(p, immediate = false) {
    this.p = p;
    this.trim.set(p.trim);
    this.pre.setGains(p.preEq.map((b) => b.gain));
    this.match.setGains(p.matchEq.map((b) => b.gain));
    this.post.setGains(p.postEq.map((b) => b.gain));
    this.peq.setBands(p.peq || []);
    p.mbc.forEach((b, i) => this.comps[i].set(b));
    this.mbcActive = p.mbc.some((b) => b.ratio > 1.0001 || b.preGain !== 0 || b.postGain !== 0) || p.kickPunch !== 0;
    this.kick.set(p.kickPunch);
    this.deEss.set(p.deEss);
    this.glitter.set(p.glitter);
    this.glue.set({ threshold: p.glue.threshold, ratio: p.glue.ratio, attack: p.glue.attack, release: p.glue.release, knee: 6, preGain: 0, postGain: p.glue.makeup });
    this.width = p.width / 100;
    if (immediate) { this.trim.g = this.trim.t; this.widthNow = this.width; }
  }

  run(L, R, n) {
    this.trim.run(L, R, n);
    this.pre.run(L, R, n);
    this.match.run(L, R, n);
    if (this.mbcActive || this.xoWasActive) {
      // Multibandet delar alltid när det används; Linkwitz-Riley summerar platt i amplitud
      this.xoWasActive = true;
      this.xo.split([L, R], this.bands, n);
      for (let b = 0; b < 4; b++) {
        const [bl, br] = this.bands[b];
        const gr = this.comps[b].run(bl, br, n);
        if (gr > this.gr.mbc[b]) this.gr.mbc[b] = gr;
        if (b === 0) this.kick.run(bl, br, n);
      }
      for (let i = 0; i < n; i++) {
        L[i] = this.bands[0][0][i] + this.bands[1][0][i] + this.bands[2][0][i] + this.bands[3][0][i];
        R[i] = this.bands[0][1][i] + this.bands[1][1][i] + this.bands[2][1][i] + this.bands[3][1][i];
      }
    }
    this.post.run(L, R, n);
    this.peq.run(L, R, n);
    this.deEss.run(L, R, n);
    this.glitter.run(L, R, n);
    if (this.width !== 1 || this.widthNow !== 1) {
      let w = this.widthNow; const t = this.width, k = this.wk;
      for (let i = 0; i < n; i++) {
        w = k * w + (1 - k) * t;
        const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * w;
        L[i] = m + s; R[i] = m - s;
      }
      this.widthNow = Math.abs(w - t) < 1e-7 ? t : w;
    }
    if (this.p.glue.ratio > 1.0001 || this.p.glue.makeup !== 0) {
      const gr = this.glue.run(L, R, n);
      if (gr > this.gr.glue) this.gr.glue = gr;
    }
  }
}

/** Andra delen: drive → soft clipper → true-peak-limiter → utgång. */
export class PostChain {
  constructor(fs, p, drive) {
    this.drive = new SmoothGain(fs, drive);
    this.limiter = new TruePeakLimiter(fs, { ceilingDb: p.ceiling, releaseMs: p.limRelease });
    this.out = new SmoothGain(fs, p.output);
    this.p = p;
    this.clipped = 0;
  }
  get latency() { return this.limiter.latency; }
  run(L, R, n) {
    this.drive.run(L, R, n);
    if (this.p.clip > 0) this.clipped += softClip(L, R, n, this.p.ceiling + 3 - this.p.clip);
    this.limiter.run(L, R, n);
    this.out.run(L, R, n);
  }
}
