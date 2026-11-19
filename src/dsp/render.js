// Renderar en hel låt genom filmastringskedjan. Används av Web Workern (src/dsp/worker.js) och av testerna.
import { PreChain, PostChain, BLOCK } from './chain.js';
import { measure } from './loudness.js';
import { truePeak, toDb } from './truepeak.js';
import { sanitizeFile, targetLufs } from '../master.js';

const stereo = (channels) => (channels.length === 1 ? [channels[0], channels[0]] : channels.slice(0, 2));
const copy = (channels) => channels.map((c) => new Float32Array(c));

function runBlocks(L, R, proc, onBlock) {
  const n = L.length;
  for (let s = 0; s < n; s += BLOCK) {
    const e = Math.min(n, s + BLOCK);
    proc.run(L.subarray(s, e), R.subarray(s, e), e - s);
    onBlock?.(e / n);
  }
}

/** Kör PostChain och kompenserar limiterns fördröjning så att utsignalen ligger i fas med insignalen. */
function runPost(pre, fs, p, drive) {
  const post = new PostChain(fs, p, drive);
  const lat = post.latency, n = pre[0].length;
  const L = new Float32Array(n + lat), R = new Float32Array(n + lat);
  L.set(pre[0]); R.set(pre[1]);
  runBlocks(L, R, post);
  return { channels: [L.slice(lat), R.slice(lat)], limiter: post.limiter, clipped: post.clipped };
}

/**
 * input: { channels: Float32Array[], fs }. Svarar { channels, fs, drive, metrics, original, gr, bypass }.
 * Med ett mål (LUFS) räknas drive ut automatiskt: först mäts nivån efter första delen av kedjan, sedan
 * justeras drive i högst fyra varv tills slutresultatet ligger inom 0,2 LU från målet.
 */
export function renderMaster(input, params, { onProgress, bypass = false } = {}) {
  const fs = input.fs;
  const src = stereo(input.channels);
  const p = sanitizeFile(params);
  const progress = (x) => onProgress?.(Math.min(1, x));
  const original = measure(src, fs);
  if (bypass) {
    progress(1);
    return { channels: copy(src), fs, drive: 0, metrics: original, original, gr: { limiter: 0, mbc: [0, 0, 0, 0], glue: 0 }, bypass: true };
  }

  const pre = copy(src);
  const chain = new PreChain(fs, p);
  runBlocks(pre[0], pre[1], chain, (x) => progress(x * 0.45));

  const target = targetLufs(p);
  let drive = p.drive;
  let result;
  if (target != null) {
    const lPre = measure(pre, fs, { withTruePeak: false }).integrated;
    drive = Number.isFinite(lPre) ? Math.max(-24, Math.min(24, target - lPre)) : 0;
    for (let iter = 0; iter < 4; iter++) {
      result = runPost(pre, fs, p, drive);
      progress(0.45 + 0.13 * (iter + 1));
      const l = measure(result.channels, fs, { withTruePeak: false }).integrated;
      const err = target - l;
      if (!Number.isFinite(err) || Math.abs(err) <= 0.2 || drive >= 24) break;
      drive = Math.max(-24, Math.min(24, drive + err * (err > 0 ? 1.15 : 1)));
    }
  } else {
    result = runPost(pre, fs, p, drive);
  }

  // Sista skydd: true peak får aldrig gå över taket (limitern ska redan ha klarat det)
  const tp = truePeak(result.channels);
  const ceil = 10 ** (p.ceiling / 20);
  if (tp > ceil) {
    const k = ceil / tp;
    for (const c of result.channels) for (let i = 0; i < c.length; i++) c[i] *= k;
  }
  progress(1);
  const metrics = measure(result.channels, fs);
  return {
    channels: result.channels, fs, drive, metrics, original,
    gr: { limiter: -toDb(result.limiter.minGain), mbc: chain.gr.mbc, glue: chain.gr.glue, deEss: chain.deEss.maxSeen, glitter: chain.glitter.maxSeen },
    clippedSamples: result.clipped, bypass: false,
  };
}
