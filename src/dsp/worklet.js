// AudioWorklet för direktlyssning i Fil: samma kedja som renderingen (PreChain + PostChain) körs i realtid, så att
// varje ändring hörs direkt. A/B växlar mellan mastrat och original (fördröjt lika mycket som limitern) med en
// mjuk övertoning. Drive kommer från senaste renderingen (målnivån) så att nivån stämmer.
// Lyssningshjälp (påverkar aldrig renderingen/exporten): automatisk Lika nivå, solo/mute på ett frekvensområde,
// Δ på de-essern, mono och "lyssna som" mobil/bil. Mätarna skickas tillbaka ungefär tio gånger per sekund.
import { PreChain, PostChain } from './chain.js';
import { sanitizeFile } from '../master.js';
import { AreaListen, Monitor, LevelMatch } from './monitor.js';

class MasterlabProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pre = null; this.post = null;
    this.which = 'master'; this.matchGain = 1; this.autoMatch = false;
    this.gM = 1; this.gO = 0;
    this.L = new Float32Array(128); this.R = new Float32Array(128);
    this.oL = new Float32Array(128); this.oR = new Float32Array(128);
    this.dl = null; this.dlPos = 0;
    this.area = new AreaListen(sampleRate);
    this.mon = new Monitor(sampleRate);
    this.lvlM = new LevelMatch(sampleRate); this.lvlO = new LevelMatch(sampleRate);
    this.delta = null;
    this.meterEvery = Math.round(sampleRate / 128 / 10); this.blocks = 0; this.peak = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (m.type === 'params') {
      const p = sanitizeFile(m.params);
      if (!this.pre) this.pre = new PreChain(sampleRate, p); else this.pre.set(p);
      this.pre.delta = this.delta;
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
    if (m.type === 'ab') { this.which = m.which; this.matchGain = m.matchGain ?? 1; this.autoMatch = !!m.auto; }
    if (m.type === 'monitor') {
      this.area.set(m.listen?.lo, m.listen?.hi, m.listen?.mode || null);
      this.mon.set({ mono: m.mono, sim: m.sim || 'normal' });
      this.delta = m.delta || null;
      if (this.pre) this.pre.delta = this.delta;
    }
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length || !out.length) return true;
    const n = inp[0].length;
    const iL = inp[0], iR = inp[1] || inp[0];
    const L = this.L, R = this.R, oL = this.oL, oR = this.oR;
    L.set(iL); R.set(iR);
    if (this.pre) {
      this.pre.run(L, R, n);
      if (this.delta) { /* Δ: bara det som tas bort – ingen drive/limiter (annars pumpas det upp) */ } else this.post.run(L, R, n);
    }
    // Originalet fördröjs lika mycket som limitern så att A/B ligger i fas
    const [dL, dR] = this.dl || [null, null], len = dL ? dL.length : 0;
    for (let i = 0; i < n; i++) {
      let a = iL[i], b = iR[i];
      if (dL) { dL[this.dlPos] = a; dR[this.dlPos] = b; const rp = (this.dlPos + 1) % len; a = dL[rp]; b = dR[rp]; this.dlPos = rp; }
      oL[i] = a; oR[i] = b;
    }
    // Lika nivå: automatiskt (glidande K-vägd nivå på A och B) eller från senaste renderingen
    const msM = this.lvlM.run(L, R, n), msO = this.lvlO.run(oL, oR, n);
    let mg = this.matchGain;
    if (this.autoMatch && msO > 1e-9 && msM > 1e-9) mg = Math.min(10, Math.max(0.1, Math.sqrt(msM / msO)));
    const tM = this.which === 'master' ? 1 : 0, tO = this.which === 'orig' ? mg : 0, k = 0.995;
    for (let i = 0; i < n; i++) {
      this.gM = k * this.gM + (1 - k) * tM; this.gO = k * this.gO + (1 - k) * tO;
      L[i] = L[i] * this.gM + oL[i] * this.gO;
      R[i] = R[i] * this.gM + oR[i] * this.gO;
    }
    this.area.run(L, R, n);
    this.mon.run(L, R, n);
    let pk = this.peak;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(L[i]), b = Math.abs(R[i]);
      if (a > pk) pk = a; if (b > pk) pk = b;
      out[0][i] = L[i];
      if (out[1]) out[1][i] = R[i];
    }
    this.peak = pk;
    if (++this.blocks >= this.meterEvery) {
      const now = this.pre?.now || { mbc: [0, 0, 0, 0], glue: 0 };
      const env = this.post?.limiter?.env ?? 1;
      this.port.postMessage({
        type: 'meter', level: this.lvlM.db - 0.691, levelOrig: this.lvlO.db - 0.691, peak: 20 * Math.log10(Math.max(pk, 1e-9)), matchGain: mg,
        gr: { mbc: now.mbc.slice(), deEss: this.pre?.deEss?.gr || 0, glitter: this.pre?.glitter?.gr || 0, glue: now.glue || 0, limiter: -20 * Math.log10(Math.max(env, 1e-9)) },
      });
      this.blocks = 0; this.peak = 0;
    }
    return true;
  }
}

registerProcessor('masterlab-master', MasterlabProcessor);
