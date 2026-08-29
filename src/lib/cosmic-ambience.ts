import type { CosmicBackdropMode } from './cosmic-backdrop';

export const COSMIC_AMBIENCE_STORAGE_KEY = 'clube-do-jogo:cosmic-ambience';
export const COSMIC_AMBIENCE_VOLUME_STORAGE_KEY = 'clube-do-jogo:cosmic-ambience-volume';
export const COSMIC_AMBIENCE_EVENT = 'clube-do-jogo:cosmic-ambience-change';
export const COSMIC_AMBIENCE_VOLUME_EVENT = 'clube-do-jogo:cosmic-ambience-volume-change';

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

const DEFAULT_AMBIENCE_VOLUME = 0.8;
const MODE_GAIN: Record<CosmicBackdropMode, number> = {
  hearth: 1.12,
  spaceflight: 1.04,
};

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

export function getCosmicAmbienceVolume() {
  try {
    const raw = window.localStorage.getItem(COSMIC_AMBIENCE_VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_AMBIENCE_VOLUME;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_AMBIENCE_VOLUME;
  } catch {
    return DEFAULT_AMBIENCE_VOLUME;
  }
}

export function setCosmicAmbienceVolume(volume: number) {
  const next = Math.min(1, Math.max(0, volume));
  window.localStorage.setItem(COSMIC_AMBIENCE_VOLUME_STORAGE_KEY, String(next));
  if (graph) {
    const now = graph.context.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(MODE_GAIN[graph.mode] * next, now, 0.045);
  }
  window.dispatchEvent(new CustomEvent(COSMIC_AMBIENCE_VOLUME_EVENT, { detail: next }));
}

function targetGain(mode: CosmicBackdropMode) {
  return Math.max(0.0001, MODE_GAIN[mode] * getCosmicAmbienceVolume());
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
  const bed = createNoiseSource(context, 13);
  const bedLowpass = context.createBiquadFilter();
  const bedHighpass = context.createBiquadFilter();
  const bedGain = context.createGain();
  const sway = context.createOscillator();
  const swayDepth = context.createGain();
  const texture = createNoiseSource(context, 19);
  const textureBandpass = context.createBiquadFilter();
  const textureGain = context.createGain();
  const textureSway = context.createOscillator();
  const textureSwayDepth = context.createGain();

  bedLowpass.type = 'lowpass';
  bedLowpass.frequency.value = 430;
  bedLowpass.Q.value = 0.42;
  bedHighpass.type = 'highpass';
  bedHighpass.frequency.value = 48;
  bedGain.gain.value = 0.027;
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
  texture.playbackRate.value = 0.73;
  textureBandpass.type = 'bandpass';
  textureBandpass.frequency.value = 760;
  textureBandpass.Q.value = 0.48;
  textureGain.gain.value = 0.007;
  textureSway.type = 'sine';
  textureSway.frequency.value = 0.067;
  textureSwayDepth.gain.value = 0.0025;
  texture.connect(textureBandpass);
  textureBandpass.connect(textureGain);
  textureGain.connect(master);
  textureSway.connect(textureSwayDepth);
  textureSwayDepth.connect(textureGain.gain);
  texture.start();
  textureSway.start();
  sources.push(bed, sway, texture, textureSway);

  const emitCrackle = (kind: 'snap' | 'wood') => {
    if (!graph || graph.context !== context || graph.mode !== 'hearth') return;
    const duration = kind === 'snap' ? 0.014 + Math.random() * 0.036 : 0.075 + Math.random() * 0.12;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const progress = index / data.length;
      const attack = Math.min(1, progress / 0.045);
      const decay = Math.pow(1 - progress, kind === 'snap' ? 3.8 : 2.1);
      const grain = kind === 'wood' ? 0.58 + 0.42 * Math.sin(index * 0.19) : 1;
      data[index] = (Math.random() * 2 - 1) * attack * decay * grain;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = kind === 'snap' ? 'bandpass' : 'lowpass';
    filter.frequency.value = kind === 'snap' ? 1100 + Math.random() * 2300 : 480 + Math.random() * 720;
    filter.Q.value = kind === 'snap' ? 0.85 + Math.random() * 0.8 : 0.35;
    gain.gain.value = kind === 'snap' ? 0.01 + Math.random() * 0.019 : 0.006 + Math.random() * 0.011;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration);
  };

  const scheduleCrackle = () => {
    if (!graph || graph.context !== context || graph.mode !== 'hearth') return;
    const chance = Math.random();
    const count = chance < 0.16 ? 3 : chance < 0.42 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      window.setTimeout(() => emitCrackle(index === 0 && Math.random() < 0.34 ? 'wood' : 'snap'), index * (55 + Math.random() * 150));
    }
    graph.crackleTimer = window.setTimeout(scheduleCrackle, 780 + Math.random() * 3900);
  };
  graph!.crackleTimer = window.setTimeout(scheduleCrackle, 620);
}

function buildSpace(context: AudioContext, master: GainNode, sources: AudioScheduledSourceNode[]) {
  const fundamentals = [43.65, 65.41, 98, 146.83, 174.61];
  fundamentals.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = [-3, 2, -5, 4, -2][index];
    gain.gain.value = [0.052, 0.024, 0.011, 0.006, 0.0035][index];
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    sources.push(oscillator);
  });

  const wash = createNoiseSource(context, 17);
  const lowpass = context.createBiquadFilter();
  const washGain = context.createGain();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 240;
  lowpass.Q.value = 0.28;
  washGain.gain.value = 0.019;
  wash.connect(lowpass);
  lowpass.connect(washGain);
  washGain.connect(master);
  wash.start();
  sources.push(wash);

  const air = createNoiseSource(context, 23);
  const airBandpass = context.createBiquadFilter();
  const airGain = context.createGain();
  air.playbackRate.value = 0.67;
  airBandpass.type = 'bandpass';
  airBandpass.frequency.value = 520;
  airBandpass.Q.value = 0.32;
  airGain.gain.value = 0.01;
  air.connect(airBandpass);
  airBandpass.connect(airGain);
  airGain.connect(master);
  air.start();
  sources.push(air);

  const pulse = context.createOscillator();
  const pulseDepth = context.createGain();
  pulse.type = 'sine';
  pulse.frequency.value = 0.035;
  pulseDepth.gain.value = 0.012;
  pulse.connect(pulseDepth);
  pulseDepth.connect(master.gain);
  pulse.start();
  sources.push(pulse);
}

export function startCosmicAmbience(mode: CosmicBackdropMode) {
  if (!isCosmicAmbienceEnabled()) return;
  if (graph?.mode === mode) {
    if (graph.context.state === 'suspended') void graph.context.resume();
    graph.master.gain.setTargetAtTime(targetGain(mode), graph.context.currentTime, 0.045);
    return;
  }
  stopCosmicAmbience();

  const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const master = context.createGain();
  const sources: AudioScheduledSourceNode[] = [];
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(targetGain(mode), context.currentTime + 0.8);
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
