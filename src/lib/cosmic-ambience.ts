import type { CosmicBackdropMode } from './cosmic-backdrop';

export const COSMIC_AMBIENCE_STORAGE_KEY = 'clube-do-jogo:cosmic-ambience';
export const COSMIC_AMBIENCE_EVENT = 'clube-do-jogo:cosmic-ambience-change';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type AmbienceGraph = {
  context: AudioContext;
  master: GainNode;
  sources: AudioScheduledSourceNode[];
  crackleTimer: number | null;
  mode: CosmicBackdropMode;
};

let graph: AmbienceGraph | null = null;

export function isCosmicAmbienceEnabled() {
  try {
    return window.localStorage.getItem(COSMIC_AMBIENCE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCosmicAmbienceEnabled(enabled: boolean) {
  window.localStorage.setItem(COSMIC_AMBIENCE_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(COSMIC_AMBIENCE_EVENT, { detail: enabled }));
}

function createBrownNoise(context: AudioContext, seconds = 5) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.018 * white) / 1.018;
    data[index] = Math.max(-1, Math.min(1, brown * 3.3));
  }
  return buffer;
}

function createNoiseSource(context: AudioContext, seconds = 5) {
  const source = context.createBufferSource();
  source.buffer = createBrownNoise(context, seconds);
  source.loop = true;
  return source;
}

function buildHearth(context: AudioContext, master: GainNode, sources: AudioScheduledSourceNode[]) {
  const bed = createNoiseSource(context, 7);
  const bedLowpass = context.createBiquadFilter();
  const bedHighpass = context.createBiquadFilter();
  const bedGain = context.createGain();
  const sway = context.createOscillator();
  const swayDepth = context.createGain();

  bedLowpass.type = 'lowpass';
  bedLowpass.frequency.value = 430;
  bedLowpass.Q.value = 0.42;
  bedHighpass.type = 'highpass';
  bedHighpass.frequency.value = 48;
  bedGain.gain.value = 0.024;
  sway.type = 'sine';
  sway.frequency.value = 0.11;
  swayDepth.gain.value = 0.006;
  sway.connect(swayDepth);
  swayDepth.connect(bedGain.gain);
  bed.connect(bedLowpass);
  bedLowpass.connect(bedHighpass);
  bedHighpass.connect(bedGain);
  bedGain.connect(master);
  bed.start();
  sway.start();
  sources.push(bed, sway);

  const scheduleCrackle = () => {
    if (!graph || graph.context !== context || graph.mode !== 'hearth') return;
    const duration = 0.022 + Math.random() * 0.055;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const envelope = Math.pow(1 - index / data.length, 3);
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = context.createBufferSource();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 680 + Math.random() * 920;
    bandpass.Q.value = 0.72;
    gain.gain.value = 0.006 + Math.random() * 0.013;
    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration);
    graph.crackleTimer = window.setTimeout(scheduleCrackle, 520 + Math.random() * 1700);
  };
  graph!.crackleTimer = window.setTimeout(scheduleCrackle, 380);
}

function buildSpace(context: AudioContext, master: GainNode, sources: AudioScheduledSourceNode[]) {
  const fundamentals = [43.65, 65.41, 98];
  fundamentals.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = [0.018, 0.008, 0.0025][index];
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    sources.push(oscillator);
  });

  const wash = createNoiseSource(context, 9);
  const lowpass = context.createBiquadFilter();
  const washGain = context.createGain();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 170;
  lowpass.Q.value = 0.28;
  washGain.gain.value = 0.007;
  wash.connect(lowpass);
  lowpass.connect(washGain);
  washGain.connect(master);
  wash.start();
  sources.push(wash);

  const pulse = context.createOscillator();
  const pulseDepth = context.createGain();
  pulse.type = 'sine';
  pulse.frequency.value = 0.035;
  pulseDepth.gain.value = 0.005;
  pulse.connect(pulseDepth);
  pulseDepth.connect(master.gain);
  pulse.start();
  sources.push(pulse);
}

export function startCosmicAmbience(mode: CosmicBackdropMode) {
  if (!isCosmicAmbienceEnabled()) return;
  if (graph?.mode === mode) {
    if (graph.context.state === 'suspended') void graph.context.resume();
    return;
  }
  stopCosmicAmbience();

  const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const master = context.createGain();
  const sources: AudioScheduledSourceNode[] = [];
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(mode === 'hearth' ? 0.52 : 0.38, context.currentTime + 0.8);
  master.connect(context.destination);
  graph = { context, master, sources, crackleTimer: null, mode };
  if (mode === 'hearth') buildHearth(context, master, sources);
  else buildSpace(context, master, sources);
  if (context.state === 'suspended') void context.resume();
}

export function stopCosmicAmbience() {
  const active = graph;
  graph = null;
  if (!active) return;
  if (active.crackleTimer !== null) window.clearTimeout(active.crackleTimer);
  const now = active.context.currentTime;
  active.master.gain.cancelScheduledValues(now);
  active.master.gain.setValueAtTime(Math.max(active.master.gain.value, 0.0001), now);
  active.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  window.setTimeout(() => {
    active.sources.forEach(source => { try { source.stop(); } catch { /* already stopped */ } });
    void active.context.close();
  }, 340);
}
