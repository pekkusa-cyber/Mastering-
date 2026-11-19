// AudioWorklet för direktlyssning i Fil: samma kedja som renderingen (PreChain + PostChain) körs i realtid, så att
// varje ändring hörs direkt. A/B växlar mellan mastrat och original (fördröjt lika mycket som limitern) med en
// mjuk övertoning. Drive kommer från senaste renderingen (målnivån) så att nivån stämmer.
import { PreChain, PostChain } from './chain.js';
import { sanitizeFile } from '../master.js';

class MasterlabProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pre = null; this.post = null;
    this.which = 'master'; this.matchGain = 1;
    this.gM = 1; this.gO = 0;
    this.L = new Float32Array(128); this.R = new Float32Array(128);
    this.dl = null; this.dlPos = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (m.type === 'params') {
      const p = sanitizeFile(m.params);
      if (!this.pre) this.pre = new PreChain(sampleRate, p); else this.pre.set(p);
      if (!this.post || this.post.p.ceiling !== p.ceiling || this.post.p.limRelease !== p.limRelease) {
        this.post = new PostChain(sampleRate, p, m.drive ?? 0);
        const lat = this.post.latency + 1;
        this.dl = [new Float32Array(lat), new Float32Array(lat)]; this.dlPos = 0;
      } else {
        this.post.p = p;
        this.post.drive.set(m.drive ?? 0);
        this.post.out.set(p.output);
      }
    }
    if (m.type === 'ab') { this.which = m.which; this.matchGain = m.matchGain ?? 1; }
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length || !out.length) return true;
    const n = inp[0].length;
    const iL = inp[0], iR = inp[1] || inp[0];
    const L = this.L, R = this.R;
    L.set(iL); R.set(iR);
    if (this.pre) { this.pre.run(L, R, n); this.post.run(L, R, n); }
    const tM = this.which === 'master' ? 1 : 0, tO = this.which === 'orig' ? this.matchGain : 0, k = 0.995;
    const [dL, dR] = this.dl || [null, null], len = dL ? dL.length : 0;
    for (let i = 0; i < n; i++) {
      // Originalet fördröjs lika mycket som limitern så att A/B ligger i fas
      let oL = iL[i], oR = iR[i];
      if (dL) { dL[this.dlPos] = oL; dR[this.dlPos] = oR; const rp = (this.dlPos + 1) % len; oL = dL[rp]; oR = dR[rp]; this.dlPos = rp; }
      this.gM = k * this.gM + (1 - k) * tM; this.gO = k * this.gO + (1 - k) * tO;
      out[0][i] = L[i] * this.gM + oL * this.gO;
      if (out[1]) out[1][i] = R[i] * this.gM + oR * this.gO;
    }
    return true;
  }
}

registerProcessor('masterlab-master', MasterlabProcessor);
