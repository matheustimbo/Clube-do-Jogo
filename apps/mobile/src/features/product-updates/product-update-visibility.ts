export interface ProductUpdateVisibilityState {
  /** True while the "seen" flag is still hydrating from storage. */
  loading: boolean;
  /** Persisted flag: the member reached the final step and finished the update once. */
  seen: boolean;
  /** Monotonically increasing counter, bumped once per explicit "ver novamente" request. */
  reopenSignal: number;
  /** The reopenSignal value in effect the last time the sheet was closed or finished, or -1 if never closed. */
  closedSignal: number;
}

/**
 * Decides whether the product-update sheet should be visible.
 *
 * The sheet auto-shows exactly once per member, before it has ever been closed and before
 * `seen` is persisted. After that, it only shows again in response to an explicit reopen
 * request (bumping reopenSignal past the signal value recorded at the last close).
 */
export function shouldShowProductUpdate(state: ProductUpdateVisibilityState): boolean {
  const autoShowPending = !state.loading && !state.seen && state.closedSignal < 0;
  const manualShowPending = state.reopenSignal > Math.max(state.closedSignal, 0);
  return autoShowPending || manualShowPending;
}
