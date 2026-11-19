// WAV-export (PCM 16/24 bit) med TPDF-dither, och en enkel läsare (för tester och import av WAV utan Web Audio).

/** Enkel deterministisk slumpgenerator, så att exporten blir likadan varje gång (och testbar). */
function rng(seed = 0x2545f491) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/**
 * channels: array av Float32Array. bits: 16 eller 24. Dither: TPDF ±1 LSB.
 * Svarar en ArrayBuffer med en komplett WAV-fil.
 */
export function encodeWav(channels, fs, bits = 24, { dither = true } = {}) {
  const nch = channels.length, n = channels[0].length, bytes = bits / 8;
  const dataLen = n * nch * bytes;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * nch * bytes, true); v.setUint16(32, nch * bytes, true); v.setUint16(34, bits, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  const max = 2 ** (bits - 1) - 1, min = -(2 ** (bits - 1));
  const rand = rng();
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      let s = channels[c][i] * max;
      if (dither) s += rand() - rand(); // TPDF, ±1 LSB
      let q = Math.round(s);
      if (q > max) q = max; else if (q < min) q = min;
      if (bits === 16) { v.setInt16(o, q, true); o += 2; }
      else { v.setUint8(o, q & 0xff); v.setUint8(o + 1, (q >> 8) & 0xff); v.setUint8(o + 2, (q >> 16) & 0xff); o += 3; }
    }
  }
  return buf;
}

/** Läser PCM 16/24/32-bit och float32 WAV. Svarar { channels, fs, bits }. */
export function decodeWav(arrayBuffer) {
  const v = new DataView(arrayBuffer);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Inte en WAV-fil.');
  let o = 12, fmt = null;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), len = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), nch: v.getUint16(o + 10, true), fs: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') {
      if (!fmt) throw new Error('WAV-filen saknar formatdel.');
      const { nch, bits, format } = fmt;
      const bytes = bits / 8, n = Math.floor(len / (nch * bytes));
      const ch = Array.from({ length: nch }, () => new Float32Array(n));
      let p = o + 8;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < nch; c++) {
          let s;
          if (format === 3 && bits === 32) s = v.getFloat32(p, true);
          else if (bits === 16) s = v.getInt16(p, true) / 32768;
          else if (bits === 24) { const b = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16); s = b / 8388608; }
          else if (bits === 32) s = v.getInt32(p, true) / 2147483648;
          else throw new Error(`${bits}-bitars WAV stöds inte.`);
          ch[c][i] = s; p += bytes;
        }
      }
      return { channels: ch, fs: fmt.fs, bits };
    }
    o += 8 + len + (len & 1);
  }
  throw new Error('WAV-filen saknar ljuddata.');
}
