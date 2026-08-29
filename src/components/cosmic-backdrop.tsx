'use client';

import { useEffect, useState } from 'react';
import { COSMIC_BACKDROP_EVENT, getCosmicBackdrop, type CosmicBackdropMode } from '@/lib/cosmic-backdrop';
import { CosmicHearthScene } from './cosmic-hearth-scene';
import { CosmicSpaceflight } from './cosmic-spaceflight';

export function CosmicBackdrop() {
  const [mode, setMode] = useState<CosmicBackdropMode>('hearth');

  useEffect(() => {
    const sync = () => setMode(getCosmicBackdrop());
    sync();
    window.addEventListener(COSMIC_BACKDROP_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COSMIC_BACKDROP_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.cosmicBackdrop = mode;
    return () => { delete document.documentElement.dataset.cosmicBackdrop; };
  }, [mode]);

  return mode === 'spaceflight' ? <CosmicSpaceflight /> : <CosmicHearthScene />;
}
