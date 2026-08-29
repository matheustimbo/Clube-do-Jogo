export const COSMIC_SOUND_STORAGE_KEY = 'clube-do-jogo:cosmic-sound';
export const COSMIC_SOUND_EVENT = 'clube-do-jogo:cosmic-sound-change';

export type CosmicSignalKind = 'enable' | 'press' | 'select' | 'open' | 'close' | 'navigate';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let signalContext: AudioContext | null = null;

export function isCosmicSoundEnabled() {
  try {
    return window.localStorage.getItem(COSMIC_SOUND_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCosmicSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(COSMIC_SOUND_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(COSMIC_SOUND_EVENT, { detail: enabled }));
}

function getSignalContext() {
  if (signalContext && signalContext.state !== 'closed') return signalContext;
  const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  signalContext = AudioContextClass ? new AudioContextClass() : null;
  return signalContext;
}

const signalPresets: Record<CosmicSignalKind, { notes: number[]; duration: number; gain: number; step: number }> = {
  enable: { notes: [392, 523.25, 659.25], duration: 0.38, gain: 0.062, step: 0.045 },
  press: { notes: [392, 440], duration: 0.15, gain: 0.032, step: 0.018 },
  select: { notes: [440, 587.33], duration: 0.22, gain: 0.041, step: 0.034 },
  open: { notes: [349.23, 466.16, 587.33], duration: 0.3, gain: 0.047, step: 0.04 },
  close: { notes: [587.33, 440, 349.23], duration: 0.25, gain: 0.039, step: 0.032 },
  navigate: { notes: [392, 523.25], duration: 0.22, gain: 0.04, step: 0.04 },
};

export function playCosmicSignal(kind: CosmicSignalKind = 'press') {
  if (kind !== 'enable' && !isCosmicSoundEnabled()) return;
  const context = getSignalContext();
  if (!context) return;
  if (context.state === 'suspended') void context.resume();

  const preset = signalPresets[kind];
  const start = context.currentTime + 0.006;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(preset.gain, start + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, start + preset.duration);
  master.connect(context.destination);

  preset.notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const partial = context.createGain();
    const noteStart = start + index * preset.step;
    oscillator.type = index === 0 ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (kind === 'close' ? 0.985 : 1.018), noteStart + preset.duration * 0.72);
    partial.gain.value = index === 0 ? 0.82 : 0.26 / index;
    oscillator.connect(partial);
    partial.connect(master);
    oscillator.start(noteStart);
    oscillator.stop(start + preset.duration + 0.02);
  });
}
