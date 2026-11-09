/**
 * The reveal sound: a small kitchen-timer dial clicking down, then a tiny "tink" as the
 * inspiration settles. Synthesised with Web Audio (no files to download or license), and
 * timed to the label animation (TIMING.revealMs).
 *
 * Browsers only allow audio after a tap, so unlockAudio() is called from the taps that
 * lead to a reveal (Start cooking, Serve); the reveal itself plays a moment later.
 * Everything fails silently: no audio support never affects the game.
 */
import { TIMING } from './config';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Master level for the whole effect (it plays every turn, so it stays modest). */
const LEVEL = 0.6;

function context(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      // iOS/Safari: behave like a game sound, i.e. respect the silent switch and mix with music.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a user tap. Creates/resumes the audio context so later sounds may play. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

function click(c: AudioContext, out: AudioNode, t: number, freq: number, gain: number, len: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + len + 0.02);
}

function tick(c: AudioContext, out: AudioNode, t: number, freq: number, gain: number, len: number) {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  s.connect(f);
  f.connect(g);
  g.connect(out);
  s.start(t);
  s.stop(t + len + 0.02);
}

/** Six dial clicks that slow down like the rolling labels (ease-out), then the tink. */
export function playRevealSound(): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  try {
    const out = c.createGain();
    out.gain.value = LEVEL;
    out.connect(c.destination);
    const t0 = c.currentTime + 0.02;
    const span = (TIMING.revealMs / 1000) * 0.91; // last click just before the labels settle
    const n = 6;
    for (let k = 1; k <= n; k++) {
      const t = t0 + span * (1 - Math.pow(1 - k / n, 1 / 3));
      click(c, out, t, 1700, 0.18, 0.018);
      tick(c, out, t, 2500, 0.08, 0.012);
    }
    click(c, out, t0 + (TIMING.revealMs / 1000) * 1.02, 2600, 0.12, 0.35);
  } catch {
    /* sound is decoration; never let it break a turn */
  }
}
