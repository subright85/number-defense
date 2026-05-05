// Tiny synthesised sound effects via Web Audio API.
// AudioContext is created lazily on first call so it inherits the user-gesture
// activation rule on iOS / Safari.

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

let _muted = false;

export function setMuted(value: boolean) {
  _muted = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('nd_muted', value ? '1' : '0');
  }
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return _muted;
  const stored = window.localStorage.getItem('nd_muted');
  if (stored !== null) _muted = stored === '1';
  return _muted;
}

export function unlockAudio() {
  const c = ctx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
}

function tone(opts: {
  startHz: number;
  endHz: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}) {
  if (isMuted()) return;
  const c = ctx();
  if (!c) return;
  const { startHz, endHz, duration, type = 'sine', gain = 0.18 } = opts;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(startHz, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endHz, c.currentTime + duration);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

export function playPop() {
  // Quick high → low blip
  tone({ startHz: 700, endHz: 220, duration: 0.13, type: 'triangle', gain: 0.22 });
}

export function playMiss() {
  tone({ startHz: 240, endHz: 180, duration: 0.14, type: 'sawtooth', gain: 0.10 });
}

export function playLifeLost() {
  tone({ startHz: 380, endHz: 90, duration: 0.30, type: 'sawtooth', gain: 0.25 });
}

export function playStart() {
  tone({ startHz: 320, endHz: 660, duration: 0.18, type: 'square', gain: 0.16 });
}
