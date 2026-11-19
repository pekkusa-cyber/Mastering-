// Lookahead-limiter med true-peak-detektering (4x översampling).
//
// För varje tidpunkt t räknas den förstärkning som krävs för att true peak ska hålla sig under taket:
//   r[t] = min(1, tak / truePeak[t]).
// Den utvidgas över interpolationsfiltrets räckvidd (±S sampel), tas minimum av över attackfönstret (A sampel),
// släpps långsamt (release) och jämnas till sist med ett glidande medel över A sampel. Ett medelvärde av
// minimum över samma fönster blir aldrig större än det minsta kravet i fönstret – därför kan förstärkningen
// aldrig vara för hög vid en topp. Utsignalen fördröjs med DELAY + S + A − 1 sampel (lookahead).
import { TruePeakDetector, DELAY } from './truepeak.js';
import { coef } from './dynamics.js';

/** Glidande minimum över de senaste `len` värdena (monoton kö). */
class SlidingMin {
  constructor(len) { this.len = len; this.vals = new Float64Array(len + 1); this.idx = new Float64Array(len + 1); this.head = 0; this.tail = 0; this.cap = len + 1; this.t = 0; }
  push(v) {
    const { vals, idx, cap } = this;
    while (this.tail !== this.head) {
      const last = (this.tail - 1 + cap) % cap;
      if (vals[last] >= v) this.tail = last; else break;
    }
    vals[this.tail] = v; idx[this.tail] = this.t; this.tail = (this.tail + 1) % cap;
    while (idx[this.head] <= this.t - this.len) this.head = (this.head + 1) % cap;
    this.t++;
    return vals[this.head];
  }
}

export class TruePeakLimiter {
  /**
   * @param fs samplingsfrekvens
   * @param opts { ceilingDb, releaseMs, attackMs }
   */
  constructor(fs, { ceilingDb = -1, releaseMs = 80, attackMs = 3 } = {}) {
    this.fs = fs;
    this.S = 7; // interpolationsfiltrets räckvidd i originalsampel (±)
    this.A = Math.max(1, Math.round((attackMs / 1000) * fs));
    this.latency = DELAY + this.S + this.A - 1;
    this.det = [new TruePeakDetector(), new TruePeakDetector()];
    this.expand = new SlidingMin(2 * this.S + 1);
    this.window = new SlidingMin(this.A);
    this.avg = new Float64Array(this.A); this.avgPos = 0; this.avgSum = this.A; this.avg.fill(1);
    this.env = 1;
    this.delayLen = this.latency + 1;
    this.dl = [new Float64Array(this.delayLen), new Float64Array(this.delayLen)]; this.dlPos = 0;
    this.setCeiling(ceilingDb);
    this.setRelease(releaseMs);
    this.minGain = 1;
  }
  setCeiling(db) { this.ceiling = 10 ** ((db - 0.05) / 20); } // 0,05 dB marginal för interpolationsfel
  setRelease(ms) { this.rel = coef(ms, this.fs); }

  /** Bearbetar L/R på plats. Utsignalen är fördröjd med `latency` sampel. */
  run(L, R, n) {
    const [dL, dR] = this.det, [bL, bR] = this.dl, c = this.ceiling, A = this.A, len = this.delayLen;
    let env = this.env, sum = this.avgSum, pos = this.avgPos, dp = this.dlPos, minG = this.minGain;
    const avg = this.avg, rel = this.rel;
    for (let i = 0; i < n; i++) {
      const xl = L[i], xr = R[i];
      const tp = Math.max(dL.push(xl), dR.push(xr));
      const r = tp > c ? c / tp : 1;
      const m = this.window.push(this.expand.push(r));
      env = Math.min(m, 1 - (1 - env) * rel);
      sum += env - avg[pos]; avg[pos] = env; pos = pos + 1 === A ? 0 : pos + 1;
      const g = Math.min(1, sum / A);
      if (g < minG) minG = g;
      // fördröjningslinjen: skriv in nytt, läs ut det som är `latency` sampel gammalt
      bL[dp] = xl; bR[dp] = xr;
      const rp = (dp + 1) % len;
      L[i] = bL[rp] * g; R[i] = bR[rp] * g;
      dp = rp;
    }
    this.env = env; this.avgSum = sum; this.avgPos = pos; this.dlPos = dp; this.minGain = minG;
  }
}
