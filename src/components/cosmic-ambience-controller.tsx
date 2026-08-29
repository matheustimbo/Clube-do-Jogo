'use client';

import { useEffect } from 'react';
import { COSMIC_AMBIENCE_EVENT, isCosmicAmbienceEnabled, startCosmicAmbience, stopCosmicAmbience } from '@/lib/cosmic-ambience';
import { COSMIC_BACKDROP_EVENT, getCosmicBackdrop } from '@/lib/cosmic-backdrop';
import { useApp } from './app-provider';

export function CosmicAmbienceController() {
  const { theme } = useApp();

  useEffect(() => {
    const sync = () => {
      if (theme === 'cosmic-campfire' && isCosmicAmbienceEnabled()) startCosmicAmbience(getCosmicBackdrop());
      else stopCosmicAmbience();
    };
    sync();
    window.addEventListener(COSMIC_AMBIENCE_EVENT, sync);
    window.addEventListener(COSMIC_BACKDROP_EVENT, sync);
    window.addEventListener('pointerdown', sync, { passive: true });
    window.addEventListener('keydown', sync);
    return () => {
      window.removeEventListener(COSMIC_AMBIENCE_EVENT, sync);
      window.removeEventListener(COSMIC_BACKDROP_EVENT, sync);
      window.removeEventListener('pointerdown', sync);
      window.removeEventListener('keydown', sync);
      stopCosmicAmbience();
    };
  }, [theme]);

  return null;
}
