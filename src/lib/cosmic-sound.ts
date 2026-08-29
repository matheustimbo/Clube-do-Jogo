export const COSMIC_SOUND_STORAGE_KEY = 'clube-do-jogo:cosmic-sound';
export const COSMIC_SOUND_EVENT = 'clube-do-jogo:cosmic-sound-change';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

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

export function playCosmicSignal(kind: 'enable' | 'navigate' = 'navigate') {
  if (kind === 'navigate' && !isCosmicSoundEnabled()) return;

  const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const start = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(kind === 'enable' ? 0.075 : 0.045, start + 0.018);
  master.gain.exponentialRampToValueAtTime(0.0001, start + (kind === 'enable' ? 0.42 : 0.24));
  master.connect(context.destination);

  const notes = kind === 'enable' ? [392, 587] : [440, 523];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start + index * 0.045);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.035, start + 0.2 + index * 0.045);
    gain.gain.value = index === 0 ? 0.9 : 0.3;
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start + index * 0.045);
    oscillator.stop(start + (kind === 'enable' ? 0.42 : 0.24));
  });

  window.setTimeout(() => void context.close(), 650);
}
