export type CosmicBackdropMode = 'hearth' | 'spaceflight';

export const COSMIC_BACKDROP_STORAGE_KEY = 'clube-do-jogo:cosmic-backdrop';
export const COSMIC_BACKDROP_EVENT = 'clube-do-jogo:cosmic-backdrop-change';

export function getCosmicBackdrop(): CosmicBackdropMode {
  if (typeof window === 'undefined') return 'hearth';
  try {
    return window.localStorage.getItem(COSMIC_BACKDROP_STORAGE_KEY) === 'spaceflight' ? 'spaceflight' : 'hearth';
  } catch {
    return 'hearth';
  }
}

export function setCosmicBackdrop(mode: CosmicBackdropMode) {
  window.localStorage.setItem(COSMIC_BACKDROP_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent<CosmicBackdropMode>(COSMIC_BACKDROP_EVENT, { detail: mode }));
}
