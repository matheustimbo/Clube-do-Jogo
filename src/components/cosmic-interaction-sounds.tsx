'use client';

import { useEffect } from 'react';
import { playCosmicSignal, type CosmicSignalKind } from '@/lib/cosmic-sound';
import { useApp } from './app-provider';

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="option"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  'label[for]',
].join(',');

function visibleLayerCount() {
  return document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]').length;
}

function isDisabled(element: HTMLElement) {
  return element.matches(':disabled, [aria-disabled="true"], [data-disabled]');
}

function classify(element: HTMLElement): CosmicSignalKind {
  if (element.matches('input, textarea, select, [role="radio"], [role="switch"], [role="checkbox"], [role="option"], [role="tab"]')) return 'select';
  if (element.getAttribute('aria-haspopup') || element.getAttribute('aria-expanded') === 'false') return 'open';
  if (element.getAttribute('aria-expanded') === 'true') return 'close';
  return 'press';
}

export function CosmicInteractionSounds() {
  const { theme } = useApp();

  useEffect(() => {
    if (theme !== 'cosmic-campfire') return;
    let pending = 0;

    const activate = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const interactive = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (!interactive || isDisabled(interactive)) return;
      const before = visibleLayerCount();
      const fallback = classify(interactive);
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        const after = visibleLayerCount();
        playCosmicSignal(after > before ? 'open' : after < before ? 'close' : fallback);
      }, 24);
    };

    const onPointerDown = (event: PointerEvent) => activate(event);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
      activate(event);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(pending);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [theme]);

  return null;
}
