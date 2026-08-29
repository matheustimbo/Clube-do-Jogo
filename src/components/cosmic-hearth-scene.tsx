const embers = [
  { x: '-34px', delay: '-1.8s', duration: '4.9s', drift: '-16px' },
  { x: '-24px', delay: '-3.7s', duration: '5.8s', drift: '12px' },
  { x: '-13px', delay: '-.5s', duration: '4.4s', drift: '-9px' },
  { x: '-3px', delay: '-4.2s', duration: '6.2s', drift: '18px' },
  { x: '8px', delay: '-2.6s', duration: '5.1s', drift: '-14px' },
  { x: '20px', delay: '-1.1s', duration: '4.7s', drift: '11px' },
  { x: '31px', delay: '-5.2s', duration: '6.5s', drift: '20px' },
] as const;

export function CosmicHearthScene() {
  return (
    <div className="hearth-scene pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="hearth-landscape" />
      <span className="hearth-passing-planet hearth-passing-planet-a" />
      <div className="hearth-fire-glow" />
      <div className="hearth-fire">
        <span className="hearth-log hearth-log-a" />
        <span className="hearth-log hearth-log-b" />
        <span className="hearth-flame hearth-flame-back" />
        <span className="hearth-flame hearth-flame-main" />
        <span className="hearth-flame hearth-flame-front" />
        <span className="hearth-smoke" />
        {embers.map((ember, index) => (
          <i
            key={index}
            className="hearth-ember"
            style={{
              '--ember-x': ember.x,
              '--ember-delay': ember.delay,
              '--ember-duration': ember.duration,
              '--ember-drift': ember.drift,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="hearth-vignette" />
    </div>
  );
}
