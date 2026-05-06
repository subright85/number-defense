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
  offset?: number;
}) {
  if (isMuted()) return;
  const c = ctx();
  if (!c) return;
  const { startHz, endHz, duration, type = 'sine', gain = 0.18, offset = 0 } = opts;
  const t = c.currentTime + offset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(startHz, t);
  osc.frequency.exponentialRampToValueAtTime(endHz, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.02);
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

// ── UI sounds (subtle, vol 0.10-0.14) ─────────────────────────────────

export function playUiTap() {
  tone({ startHz: 880, endHz: 660, duration: 0.05, type: 'triangle', gain: 0.11 });
}

export function playModalOpen() {
  tone({ startHz: 280, endHz: 560, duration: 0.16, type: 'sine', gain: 0.09 });
  tone({ startHz: 420, endHz: 840, duration: 0.16, type: 'sine', gain: 0.06, offset: 0.04 });
}

export function playModalClose() {
  tone({ startHz: 560, endHz: 280, duration: 0.13, type: 'sine', gain: 0.07 });
}

// ── Combo sounds ───────────────────────────────────────────────────────

export function playComboBuild() {
  // C5→G5 then G5→C6 — rising musical arpeggio
  tone({ startHz: 523, endHz: 784, duration: 0.11, type: 'triangle', gain: 0.13 });
  tone({ startHz: 784, endHz: 1047, duration: 0.11, type: 'triangle', gain: 0.11, offset: 0.10 });
}

export function playComboBreak() {
  tone({ startHz: 440, endHz: 180, duration: 0.22, type: 'sawtooth', gain: 0.10 });
}

// ── Game event sounds ──────────────────────────────────────────────────

export function playTierUp() {
  tone({ startHz: 523, endHz: 659, duration: 0.09, type: 'square', gain: 0.12 });
  tone({ startHz: 659, endHz: 784, duration: 0.09, type: 'square', gain: 0.12, offset: 0.08 });
  tone({ startHz: 784, endHz: 1047, duration: 0.14, type: 'square', gain: 0.14, offset: 0.16 });
}

export function playGameoverSting() {
  tone({ startHz: 880, endHz: 880, duration: 0.07, type: 'square', gain: 0.17 });
  tone({ startHz: 440, endHz: 110, duration: 0.42, type: 'sawtooth', gain: 0.14, offset: 0.09 });
}
