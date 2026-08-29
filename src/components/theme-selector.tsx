'use client';

import { useEffect, useState } from 'react';
import { Check, Flame, Orbit, Palette, Radio, Volume2, VolumeX, Waves } from 'lucide-react';
import { motion } from 'motion/react';
import { getSelectableThemes } from '@/lib/themes';
import { COSMIC_AMBIENCE_EVENT, isCosmicAmbienceEnabled, setCosmicAmbienceEnabled } from '@/lib/cosmic-ambience';
import { COSMIC_BACKDROP_EVENT, getCosmicBackdrop, setCosmicBackdrop, type CosmicBackdropMode } from '@/lib/cosmic-backdrop';
import { COSMIC_SOUND_EVENT, isCosmicSoundEnabled, playCosmicSignal, setCosmicSoundEnabled } from '@/lib/cosmic-sound';
import { useApp } from './app-provider';

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, unlockedThemeIds } = useApp();
  const selectableThemes = getSelectableThemes(unlockedThemeIds);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ambienceEnabled, setAmbienceEnabled] = useState(false);
  const [backdrop, setBackdropState] = useState<CosmicBackdropMode>('hearth');

  useEffect(() => {
    const syncSound = () => setSoundEnabled(isCosmicSoundEnabled());
    syncSound();
    window.addEventListener(COSMIC_SOUND_EVENT, syncSound);
    window.addEventListener('storage', syncSound);
    return () => {
      window.removeEventListener(COSMIC_SOUND_EVENT, syncSound);
      window.removeEventListener('storage', syncSound);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setAmbienceEnabled(isCosmicAmbienceEnabled());
      setBackdropState(getCosmicBackdrop());
    };
    sync();
    window.addEventListener(COSMIC_AMBIENCE_EVENT, sync);
    window.addEventListener(COSMIC_BACKDROP_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COSMIC_AMBIENCE_EVENT, sync);
      window.removeEventListener(COSMIC_BACKDROP_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setCosmicSoundEnabled(next);
    setSoundEnabled(next);
    if (next) playCosmicSignal('enable');
  };

  const selectBackdrop = (mode: CosmicBackdropMode) => {
    setCosmicBackdrop(mode);
    setBackdropState(mode);
  };

  const toggleAmbience = () => {
    const next = !ambienceEnabled;
    setCosmicAmbienceEnabled(next);
    setAmbienceEnabled(next);
  };

  return (
    <section className={compact ? 'theme-settings-compact' : 'theme-settings mt-8 border-t border-white/8 pt-5'} aria-labelledby={compact ? undefined : 'theme-title'}>
      {!compact && <div className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><Palette className="size-4" /></span>
        <div><h2 id="theme-title" className="text-sm font-extrabold">Tema visual</h2><p className="mt-0.5 text-[11px] text-zinc-500">Salvo somente neste dispositivo.</p></div>
      </div>}
      <div role="radiogroup" aria-label="Tema visual" className="grid gap-2 sm:grid-cols-2">
        {selectableThemes.map(option => {
          const selected = option.id === theme;
          return (
            <button key={option.id} role="radio" aria-checked={selected} onClick={() => setTheme(option.id)} className={`theme-option relative min-w-0 overflow-hidden rounded-2xl border p-3 text-left transition ${selected ? 'border-violet-400/35 bg-violet-500/10' : 'border-white/8 bg-white/[0.025] hover:bg-white/5'}`}>
              {selected && <motion.span layoutId="selected-theme" className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-violet-500 text-white shadow-lg" transition={{ type: 'spring', stiffness: 500, damping: 34 }}><Check className="size-3.5" /></motion.span>}
              <span className="mb-2 flex gap-1.5" aria-hidden="true">{option.colors.map(color => <span key={color} className="size-5 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: color }} />)}</span>
              <strong className="block truncate pr-7 text-xs text-zinc-200">{option.name}</strong>
            </button>
          );
        })}
      </div>
      {theme === 'cosmic-campfire' && (
        <div className="mt-3 grid gap-2">
          <div className="cosmic-backdrop-setting rounded-2xl border border-white/8 p-3">
            <div className="mb-2 flex items-center gap-2"><Orbit className="size-3.5 text-cyan-200/70" /><strong className="text-xs text-zinc-200">Plano de fundo</strong></div>
            <div role="radiogroup" aria-label="Plano de fundo da Fogueira Cósmica" className="grid grid-cols-2 gap-1.5">
              <button type="button" role="radio" aria-checked={backdrop === 'hearth'} onClick={() => selectBackdrop('hearth')} className="cosmic-backdrop-choice flex min-h-11 items-center justify-center gap-2 border px-3 text-[11px] font-bold"><Flame className="size-3.5" />Recanto</button>
              <button type="button" role="radio" aria-checked={backdrop === 'spaceflight'} onClick={() => selectBackdrop('spaceflight')} className="cosmic-backdrop-choice flex min-h-11 items-center justify-center gap-2 border px-3 text-[11px] font-bold"><Orbit className="size-3.5" />Travessia</button>
            </div>
          </div>

          <div className="cosmic-sound-setting flex items-center justify-between gap-4 rounded-2xl border border-white/8 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="cosmic-sound-icon grid size-9 shrink-0 place-items-center rounded-full" aria-hidden="true"><Waves className="size-4" /></span>
              <span className="min-w-0"><strong className="block text-xs text-zinc-200">{backdrop === 'hearth' ? 'Fogueira ambiente' : 'Ambiente espacial'}</strong><span className="block text-[10px] text-zinc-500">{backdrop === 'hearth' ? 'Crepitar baixo e orgânico.' : 'Um vazio calmo e inquietante.'}</span></span>
            </div>
            <button type="button" role="switch" aria-checked={ambienceEnabled} aria-label={backdrop === 'hearth' ? 'Fogueira ambiente' : 'Ambiente espacial'} onClick={toggleAmbience} className="cosmic-sound-toggle grid size-10 shrink-0 place-items-center rounded-full border transition">
              {ambienceEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>

          <div className="cosmic-sound-setting flex items-center justify-between gap-4 rounded-2xl border border-white/8 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="cosmic-sound-icon grid size-9 shrink-0 place-items-center rounded-full" aria-hidden="true"><Radio className="size-4" /></span>
              <span className="min-w-0"><strong className="block text-xs text-zinc-200">Sons do comunicador</strong><span className="block text-[10px] text-zinc-500">Sinais em todos os controles interativos.</span></span>
            </div>
            <button type="button" role="switch" aria-checked={soundEnabled} aria-label="Sons do comunicador" onClick={toggleSound} className="cosmic-sound-toggle grid size-10 shrink-0 place-items-center rounded-full border transition">
              {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
