// Family 10 — silent-track.
// Append digital silence to the audio. The header is valid, the samples that were there are
// untouched, and the file now measures longer than what anyone hears.
import { parseWav, buildWav, trailingSilenceSeconds } from '../util.js';
import { ok, no } from './_shared.js';

export default {
  id: 'silent-track',
  title: 'Silent track',
  formats: ['wav'],
  summary: 'Pads the audio with digital silence: same sound, longer measured duration',

  applies(ctx) {
    const w = parseWav(ctx.bytes);
    if (!w.ok) return no(w.reason);
    if (w.fmt.audioFormat !== 1 || w.fmt.bitsPerSample !== 16) return no('only 16-bit PCM is supported');
    return w.frames > 0 ? ok() : no('no audio frames');
  },

  mutate(ctx) {
    const w = parseWav(ctx.bytes);
    const seconds = Math.max(1, w.seconds * 0.25);
    const frames = Math.round(seconds * w.fmt.sampleRate);
    const data = Buffer.concat([w.data, Buffer.alloc(frames * w.fmt.blockAlign)]);
    const chunks = w.chunks.map((c) => (c.id === 'data' ? { id: 'data', data } : c));
    const after = (w.frames + frames) / w.fmt.sampleRate;
    return {
      bytes: buildWav(chunks),
      added: frames / w.fmt.sampleRate,
      note: `+${(frames / w.fmt.sampleRate).toFixed(2)} s silence (${w.seconds.toFixed(2)} → ${after.toFixed(2)} s)`,
    };
  },

  verify(ctx, m) {
    const a = parseWav(ctx.bytes);
    const b = parseWav(m.bytes);
    if (!b.ok) return no(`mutant is not a valid WAV: ${b.reason}`);
    if (!b.data.subarray(0, a.data.length).equals(a.data)) return no('original samples changed');
    if (b.seconds - a.seconds < 0.5) return no('duration did not grow');
    const tail = trailingSilenceSeconds(b);
    if (tail + 1e-6 < m.added) return no('appended region is not silent');
    return ok(`duration ${a.seconds.toFixed(2)} → ${b.seconds.toFixed(2)} s, last ${tail.toFixed(2)} s is digital silence`);
  },
};
