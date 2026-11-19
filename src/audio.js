// Avkodning av ljudfiler (MP3/WAV m.fl.) med OfflineAudioContext – resultatet kommer i 48 kHz.
export const WORK_RATE = 48000;

export async function decodeFile(file) {
  const data = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, WORK_RATE);
  let buf;
  try { buf = await ctx.decodeAudioData(data); } catch { throw new Error('Filen gick inte att läsa. Välj en MP3- eller WAV-fil.'); }
  const channels = [buf.getChannelData(0).slice(), (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice()];
  return { channels, fs: buf.sampleRate, duration: buf.duration, name: file.name };
}

/** Byter samplingsfrekvens med OfflineAudioContext (för export i 44,1 kHz). */
export async function resample(channels, fromFs, toFs) {
  if (fromFs === toFs) return channels;
  const len = Math.ceil((channels[0].length * toFs) / fromFs);
  const ctx = new OfflineAudioContext(channels.length, len, toFs);
  const b = ctx.createBuffer(channels.length, channels[0].length, fromFs);
  channels.forEach((c, i) => b.copyToChannel(c, i));
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return Array.from({ length: channels.length }, (_, i) => out.getChannelData(i).slice());
}

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
