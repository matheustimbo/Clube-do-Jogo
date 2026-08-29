export function CosmicSpaceflight() {
  return (
    <div className="spaceflight-scene pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="spaceflight-stars spaceflight-stars-far" />
      <div className="spaceflight-stars spaceflight-stars-near" />
      <span className="spaceflight-planet spaceflight-planet-giant"><i /></span>
      <span className="spaceflight-planet spaceflight-planet-ringed"><i /></span>
      <span className="spaceflight-moon" />
      <span className="spaceflight-streak spaceflight-streak-a" />
      <span className="spaceflight-streak spaceflight-streak-b" />
      <span className="spaceflight-streak spaceflight-streak-c" />
      <div className="spaceflight-vignette" />
    </div>
  );
}
