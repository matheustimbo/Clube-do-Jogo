'use client';

import { useEffect, useRef } from 'react';
import { setSpaceflightGiantPresence } from '@/lib/cosmic-ambience';

export function CosmicSpaceflight() {
  const giantRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sample = () => {
      const rect = giantRef.current?.getBoundingClientRect();
      if (rect) {
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const coverage = (visibleWidth * visibleHeight) / (window.innerWidth * window.innerHeight);
        const inViewport = visibleWidth > 2 && visibleHeight > 2;
        setSpaceflightGiantPresence(inViewport ? Math.max(0.18, Math.min(1, coverage / 0.48)) : 0);
      }
    };
    sample();
    const timer = window.setInterval(sample, 160);
    return () => {
      window.clearInterval(timer);
      setSpaceflightGiantPresence(0);
    };
  }, []);

  return (
    <div className="spaceflight-scene pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="spaceflight-stars spaceflight-stars-far" />
      <div className="spaceflight-stars spaceflight-stars-near" />
      <span className="spaceflight-planet spaceflight-dark-bramble" />
      <span className="spaceflight-planet spaceflight-brittle-hollow" />
      <span ref={giantRef} className="spaceflight-planet spaceflight-giants-deep" />
      <span className="spaceflight-planet spaceflight-hourglass-twins" />
      <span className="spaceflight-quantum-moon" />
      <span className="spaceflight-streak spaceflight-streak-a" />
      <span className="spaceflight-streak spaceflight-streak-b" />
      <span className="spaceflight-streak spaceflight-streak-c" />
      <div className="spaceflight-vignette" />
    </div>
  );
}
