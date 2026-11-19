// Web Worker: renderar mastringen utan att gränssnittet hackar. Meddelanden:
//   in:  { id, channels: Float32Array[], fs, params, bypass }
//   ut:  { id, progress } … sedan { id, result } eller { id, error }
import { renderMaster } from './render.js';
import { profileFromChannels, stereoInfo } from '../analysis.js';

self.onmessage = (e) => {
  const { id, channels, fs, params, bypass } = e.data;
  try {
    let last = 0;
    const r = renderMaster({ channels, fs }, params, {
      bypass,
      onProgress: (x) => { if (x - last >= 0.02 || x === 1) { last = x; self.postMessage({ id, progress: x }); } },
    });
    const result = {
      ...r,
      profile: profileFromChannels(r.channels, fs),
      originalProfile: profileFromChannels(channels.length === 1 ? [channels[0], channels[0]] : channels, fs),
      stereo: stereoInfo(r.channels, fs),
      originalStereo: stereoInfo(channels.length === 1 ? [channels[0], channels[0]] : channels, fs),
    };
    self.postMessage({ id, result }, r.channels.map((c) => c.buffer));
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
