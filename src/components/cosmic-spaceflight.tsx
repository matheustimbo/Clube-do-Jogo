export function CosmicSpaceflight() {
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
      <span className="spaceflight-planet spaceflight-planet-giant" />
      <span className="spaceflight-planet spaceflight-planet-cinder" />
      <span className="spaceflight-moon" />
      <span className="spaceflight-streak spaceflight-streak-a" />
      <span className="spaceflight-streak spaceflight-streak-b" />
      <span className="spaceflight-streak spaceflight-streak-c" />
      <div className="spaceflight-vignette" />
    </div>
  );
}
