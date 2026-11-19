import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure } from '../../src/dsp/loudness.js';
import { truePeak, toDb } from '../../src/dsp/truepeak.js';
import { TruePeakLimiter } from '../../src/dsp/limiter.js';
import { Crossover4 } from '../../src/dsp/crossover.js';
import { PreChain, BLOCK } from '../../src/dsp/chain.js';
import { renderMaster } from '../../src/dsp/render.js';
import { encodeWav, decodeWav } from '../../src/dsp/wav.js';
import { fileNeutral, sanitizeFile, liveToFile } from '../../src/master.js';
import { BUILTIN_PRESETS } from '../../src/chain.js';

const FS = 48000;

/** Stereosinus: segment = [[dBFS, sekunder], …] (EBU anger nivån som toppvärde). */
function tones(segments, f = 1000, fs = FS) {
  const total = segments.reduce((a, [, s]) => a + Math.round(s * fs), 0);
  const L = new Float32Array(total);
  let i = 0;
  for (const [db, s] of segments) {
    const a = 10 ** (db / 20), n = Math.round(s * fs);
    for (let k = 0; k < n; k++, i++) L[i] = a * Math.sin((2 * Math.PI * f * i) / fs);
  }
  return [L, new Float32Array(L)];
}

/** Brus med kickar och en ton – en grov "låt" för kedjetester. Deterministisk. */
function song(seconds = 12, fs = FS) {
  const n = seconds * fs, L = new Float32Array(n), R = new Float32Array(n);
  let s = 12345, b0 = 0, b1 = 0, b2 = 0;
  const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 31 - 1; };
  for (let i = 0; i < n; i++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; // ungefär rosa brus
    const pink = (b0 + b1 + b2 + w * 0.1848) * 0.05;
    const t = (i % (fs / 2)) / fs; // kick två gånger per sekund
    const kick = Math.exp(-t * 25) * Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-t * 40)) * t) * 0.9;
    const tone = 0.08 * Math.sin((2 * Math.PI * 440 * i) / fs);
    L[i] = pink + kick + tone; R[i] = pink * 0.9 + kick + tone * 0.8;
  }
  return [L, R];
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(3)} ≠ ${b} ±${tol}`);

// ---- EBU Tech 3341 (loudness) ----
test('EBU 3341 fall 1–2: sinus −23 och −33 dBFS ger −23 och −33 LUFS', () => {
  near(measure(tones([[-23, 20]]), FS).integrated, -23, 0.1, 'fall 1');
  near(measure(tones([[-33, 20]]), FS).integrated, -33, 0.1, 'fall 2');
  const m = measure(tones([[-23, 20]]), FS);
  near(m.momentaryMax, -23, 0.1, 'momentary');
  near(m.shortTermMax, -23, 0.1, 'short-term');
});

test('EBU 3341 fall 3–5: gating ger −23 LUFS', () => {
  near(measure(tones([[-36, 10], [-23, 60], [-36, 10]]), FS).integrated, -23, 0.1, 'fall 3');
  near(measure(tones([[-72, 10], [-36, 10], [-23, 60], [-36, 10], [-72, 10]]), FS).integrated, -23, 0.1, 'fall 4');
  near(measure(tones([[-26, 20], [-20, 20.1], [-26, 20]]), FS).integrated, -23, 0.1, 'fall 5');
});

test('K-vägningen fungerar även vid 44,1 kHz', () => {
  near(measure(tones([[-23, 20]], 1000, 44100), 44100).integrated, -23, 0.1, '44,1 kHz');
});

// ---- EBU Tech 3342 (loudness range) ----
test('EBU 3342 fall 1–4: loudness range', () => {
  near(measure(tones([[-20, 20], [-30, 20]]), FS).lra, 10, 1, 'fall 1');
  near(measure(tones([[-20, 20], [-15, 20]]), FS).lra, 5, 1, 'fall 2');
  near(measure(tones([[-40, 20], [-20, 20]]), FS).lra, 20, 1, 'fall 3');
  near(measure(tones([[-50, 20], [-35, 20], [-20, 20], [-35, 20], [-50, 20]]), FS).lra, 15, 1, 'fall 4');
});

// ---- True peak ----
test('true peak hittar toppen mellan samplen (sinus vid fs/4 med 45° fas)', () => {
  const n = FS, L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.5 * Math.sin((Math.PI / 2) * i + Math.PI / 4);
  const m = measure([L, L], FS);
  near(m.samplePeak, -9.03, 0.05, 'samplepeak');
  assert.ok(m.truePeak > -6.02 - 0.4 && m.truePeak < -6.02 + 0.2, `true peak ${m.truePeak}`);
});

// ---- Limiter ----
test('limitern går aldrig över taket – inte heller mellan samplen', () => {
  for (const ceiling of [-1, -0.3, -2]) {
    const [L, R] = song(8);
    for (let i = 0; i < L.length; i++) { L[i] *= 6; R[i] *= 6; } // +15 dB, kraftigt överstyrt
    // Elaka testfall: fs/4-sinus med 45° fas och enstaka klick
    for (let i = 100000; i < 110000; i++) { L[i] = 3 * Math.sin((Math.PI / 2) * i + Math.PI / 4); R[i] = -L[i]; }
    L[200000] = 8; R[200001] = -8;
    const lim = new TruePeakLimiter(FS, { ceilingDb: ceiling, releaseMs: 60 });
    const lat = lim.latency;
    const xL = new Float32Array(L.length + lat), xR = new Float32Array(R.length + lat);
    xL.set(L); xR.set(R);
    for (let s = 0; s < xL.length; s += BLOCK) lim.run(xL.subarray(s, s + BLOCK), xR.subarray(s, s + BLOCK), Math.min(BLOCK, xL.length - s));
    const tp = toDb(truePeak([xL, xR]));
    assert.ok(tp <= ceiling, `true peak ${tp.toFixed(3)} dBTP över taket ${ceiling}`);
  }
});

test('hela renderingen håller taket och träffar målnivån (streaming och hög)', () => {
  const src = song(12);
  for (const [target, lufs] of [['streaming', -14], ['hog', -10]]) {
    const p = liveToFile(BUILTIN_PRESETS[0].params, { target });
    const r = renderMaster({ channels: src, fs: FS }, p);
    assert.ok(r.metrics.truePeak <= -1, `${target}: true peak ${r.metrics.truePeak}`);
    near(r.metrics.integrated, lufs, 0.5, `${target}: integrerad loudness`);
    assert.equal(r.channels[0].length, src[0].length, 'samma längd (limiterns fördröjning kompenserad)');
  }
});

// ---- Bypass och transparens ----
test('bypass är bit-transparent', () => {
  const src = song(3);
  const r = renderMaster({ channels: src, fs: FS }, liveToFile(BUILTIN_PRESETS[1].params), { bypass: true });
  assert.ok(r.bypass);
  assert.deepEqual(r.channels[0], src[0]);
  assert.deepEqual(r.channels[1], src[1]);
});

test('neutral första del av kedjan ändrar inte ett enda sampel', () => {
  const [L, R] = song(2);
  const oL = new Float32Array(L), oR = new Float32Array(R);
  const c = new PreChain(FS, sanitizeFile(fileNeutral()));
  for (let s = 0; s < L.length; s += BLOCK) c.run(L.subarray(s, s + BLOCK), R.subarray(s, s + BLOCK), Math.min(BLOCK, L.length - s));
  assert.deepEqual(L, oL);
  assert.deepEqual(R, oR);
});

test('Linkwitz-Riley-banden summerar platt (±0,05 dB, 20 Hz–20 kHz)', () => {
  const n = 1 << 15, imp = new Float32Array(n); imp[0] = 1;
  const bands = Array.from({ length: 4 }, () => [new Float32Array(n), new Float32Array(n)]);
  new Crossover4(FS, [120, 2000, 8000]).split([imp, new Float32Array(imp)], bands, n);
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = bands[0][0][i] + bands[1][0][i] + bands[2][0][i] + bands[3][0][i];
  for (const f of [20, 50, 120, 300, 1000, 2000, 5000, 8000, 12000, 20000]) {
    let re = 0, im = 0;
    const w = (2 * Math.PI * f) / FS;
    for (let i = 0; i < 4000; i++) { re += h[i] * Math.cos(w * i); im -= h[i] * Math.sin(w * i); }
    near(10 * Math.log10(re * re + im * im), 0, 0.05, `${f} Hz`);
  }
});

// ---- Klick ----
test('inga klick när parametrar ändras mitt i uppspelningen', () => {
  const n = FS * 2, f = 1000, A = 0.5;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = A * Math.sin((2 * Math.PI * f * i) / FS);
  const R = new Float32Array(L);
  const c = new PreChain(FS, sanitizeFile(fileNeutral()));
  const changed = sanitizeFile({ ...fileNeutral(), trim: -6, width: 150, postEq: fileNeutral().postEq.map((b, i) => ({ gain: i === 4 ? 6 : 0 })), preEq: fileNeutral().preEq.map((b, i) => ({ gain: i === 5 ? -6 : 0 })) });
  for (let s = 0, k = 0; s < n; s += BLOCK, k++) {
    if (k === 30) c.set(changed);
    c.run(L.subarray(s, s + BLOCK), R.subarray(s, s + BLOCK), Math.min(BLOCK, n - s));
  }
  // En ren sinus har andraderivata högst A·ω². Ett klick syns som en topp långt över det.
  const w = (2 * Math.PI * f) / FS, limit = A * w * w * 2.5;
  let worst = 0;
  for (let i = 2; i < n; i++) worst = Math.max(worst, Math.abs(L[i] - 2 * L[i - 1] + L[i - 2]));
  assert.ok(worst < limit, `andraderivata ${worst.toExponential(2)} ≥ ${limit.toExponential(2)} (klick)`);
  // Sanity: ett tvärt hopp i förstärkning hade upptäckts
  const J = new Float32Array(4000);
  for (let i = 0; i < 4000; i++) J[i] = A * Math.sin(w * i) * (i < 2000 ? 1 : 0.5);
  let jump = 0;
  for (let i = 2; i < 4000; i++) jump = Math.max(jump, Math.abs(J[i] - 2 * J[i - 1] + J[i - 2]));
  assert.ok(jump > limit, 'testet känner igen ett riktigt klick');
});

// ---- WAV ----
test('WAV 24 och 16 bit tur och retur (med dither)', () => {
  const [L, R] = tones([[-6, 0.5]]);
  for (const bits of [24, 16]) {
    const back = decodeWav(encodeWav([L, R], FS, bits));
    assert.equal(back.fs, FS);
    assert.equal(back.bits, bits);
    assert.equal(back.channels[0].length, L.length);
    const lsb = 2 / 2 ** bits;
    let err = 0;
    for (let i = 0; i < L.length; i++) err = Math.max(err, Math.abs(back.channels[0][i] - L[i]));
    assert.ok(err <= 2.5 * lsb, `${bits} bit: fel ${err}`);
  }
  // Dither gör att tystnad inte blir helt noll i 16 bit, men aldrig större än ±1 LSB
  const silent = decodeWav(encodeWav([new Float32Array(1000), new Float32Array(1000)], FS, 16)).channels[0];
  assert.ok(silent.every((v) => Math.abs(v) <= 1 / 32768 + 1e-9));
});

// ---- De-esser och glitterfilter ----
import { deEsser, glitterFilter } from '../../src/dsp/splitdyn.js';
import { Biquad, coeffs } from '../../src/dsp/biquad.js';

/** Energi (dB) i ett frekvensområde (filtrerat med två biquads). */
function bandDb(x, lo, hi) {
  const y = new Float32Array(x);
  const f = [new Biquad(coeffs('highpass', FS, lo), 1), new Biquad(coeffs('highpass', FS, lo), 1), new Biquad(coeffs('lowpass', FS, hi), 1), new Biquad(coeffs('lowpass', FS, hi), 1)];
  for (const b of f) b.run(y, 0);
  let e = 0; for (let i = 0; i < y.length; i++) e += y[i] * y[i];
  return 10 * Math.log10(e / y.length + 1e-20);
}

function vocalWithEss() {
  const n = FS * 3, L = new Float32Array(n);
  let s = 3;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0; const w = s / 2 ** 31 - 1;
    const sib = (i % FS) < FS * 0.15 ? 1 : 0; // ett "s" varje sekund
    L[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / FS) + 0.15 * Math.sin((2 * Math.PI * 660 * i) / FS) + sib * w * 0.4;
  }
  return L;
}

test('de-essern sänker s-ljuden men inte rösten', () => {
  const src = vocalWithEss();
  const run = (amount) => {
    const L = new Float32Array(src), R = new Float32Array(src), d = deEsser(FS);
    d.set(amount);
    for (let s = 0; s < L.length; s += BLOCK) d.run(L.subarray(s, s + BLOCK), R.subarray(s, s + BLOCK), Math.min(BLOCK, L.length - s));
    return L;
  };
  const off = run(0), on = run(100);
  assert.deepEqual(off, src, 'av = bit-transparent');
  assert.ok(bandDb(src, 5000, 10000) - bandDb(on, 5000, 10000) > 3, 's-ljuden sänks minst 3 dB');
  assert.ok(Math.abs(bandDb(src, 100, 1000) - bandDb(on, 100, 1000)) < 0.5, 'rösten orörd');
});

test('glitterfiltret sänker fräs över 11 kHz', () => {
  const n = FS * 2, L = new Float32Array(n);
  let s = 5;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; L[i] = (s / 2 ** 31 - 1) * 0.3 + 0.3 * Math.sin((2 * Math.PI * 440 * i) / FS); }
  const src = new Float32Array(L), R = new Float32Array(L), g = glitterFilter(FS);
  g.set(100);
  for (let k = 0; k < n; k += BLOCK) g.run(L.subarray(k, k + BLOCK), R.subarray(k, k + BLOCK), Math.min(BLOCK, n - k));
  assert.ok(bandDb(src, 12000, 20000) - bandDb(L, 12000, 20000) > 2.5);
  assert.ok(Math.abs(bandDb(src, 200, 2000) - bandDb(L, 200, 2000)) < 0.5);
});
