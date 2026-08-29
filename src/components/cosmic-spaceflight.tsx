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
        setSpaceflightGiantPresence(Math.min(1, Math.max(0, (coverage - 0.04) / 0.54)));
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
      <span className="spaceflight-planet spaceflight-planet-far" />
      <span className="spaceflight-planet spaceflight-planet-ringed">
        <i className="spaceflight-ring-back" />
        <i className="spaceflight-ring-body" />
        <i className="spaceflight-ring-front" />
      </span>
      <span ref={giantRef} className="spaceflight-planet spaceflight-planet-giant" />
      <span className="spaceflight-planet spaceflight-planet-cinder" />
      <span className="spaceflight-moon" />
      <span className="spaceflight-streak spaceflight-streak-a" />
      <span className="spaceflight-streak spaceflight-streak-b" />
      <span className="spaceflight-streak spaceflight-streak-c" />
      <div className="spaceflight-vignette" />
    </div>
  );
}
