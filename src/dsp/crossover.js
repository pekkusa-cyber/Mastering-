// Linkwitz-Riley-delning (24 dB/oktav) i fyra band: 0–f1, f1–f2, f2–f3, f3+.
// Trädet delar först vid f2 och sedan varje halva. För att banden ska summera platt får varje halva samma
// allpassfas som den andra halvans delning (LP4 + HP4 = allpass av andra ordningen, Q = 1/√2).
import { Biquad, coeffs } from './biquad.js';

const Q = Math.SQRT1_2;
const lr = (type, fs, f, ch) => [new Biquad(coeffs(type, fs, f, Q), ch), new Biquad(coeffs(type, fs, f, Q), ch)];

export class Crossover4 {
  constructor(fs, [f1, f2, f3], channels = 2) {
    this.ch = channels;
    this.lp2 = lr('lowpass', fs, f2, channels); this.hp2 = lr('highpass', fs, f2, channels);
    this.apLow = new Biquad(coeffs('allpass', fs, f3, Q), channels);  // låga halvan får f3:s fas
    this.apHigh = new Biquad(coeffs('allpass', fs, f1, Q), channels); // höga halvan får f1:s fas
    this.lp1 = lr('lowpass', fs, f1, channels); this.hp1 = lr('highpass', fs, f1, channels);
    this.lp3 = lr('lowpass', fs, f3, channels); this.hp3 = lr('highpass', fs, f3, channels);
  }

  /** Delar in[ch] (längd n) till bands[b][ch]. Alla arrayer allokeras av anroparen. */
  split(input, bands, n) {
    for (let c = 0; c < this.ch; c++) {
      const x = input[c];
      const low = bands[0][c], b1 = bands[1][c], high = bands[2][c], b3 = bands[3][c];
      low.set(x.subarray(0, n)); high.set(x.subarray(0, n));
      for (const f of this.lp2) f.run(low, c, 0, n);
      for (const f of this.hp2) f.run(high, c, 0, n);
      this.apLow.run(low, c, 0, n);
      this.apHigh.run(high, c, 0, n);
      b1.set(low.subarray(0, n)); b3.set(high.subarray(0, n));
      for (const f of this.lp1) f.run(low, c, 0, n);   // band 0
      for (const f of this.hp1) f.run(b1, c, 0, n);    // band 1
      for (const f of this.lp3) f.run(high, c, 0, n);  // band 2
      for (const f of this.hp3) f.run(b3, c, 0, n);    // band 3
    }
  }
}
