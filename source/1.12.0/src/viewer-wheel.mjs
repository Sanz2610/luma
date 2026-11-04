// Keep this gesture state in the window owner so navigation/remounting cannot
// turn one high-resolution wheel burst into a rapid sequence of image loads.
export function wheelStep(state, delta, deltaMode, now) {
  if (!Number.isFinite(delta) || !delta) return 0;
  const direction = Math.sign(delta);
  const changedDirection = state.direction !== direction;
  if (changedDirection || now - (state.lastEvent ?? -Infinity) > 250)
    state.sum = 0;
  state.direction = direction;
  state.lastEvent = now;
  if (!changedDirection && now - (state.lastStep ?? -Infinity) < 160) return 0;
  state.sum =
    (state.sum || 0) +
    delta * (deltaMode === 1 ? 40 : deltaMode === 2 ? 800 : 1);
  if (Math.abs(state.sum) < 40) return 0;
  state.sum = 0;
  state.lastStep = now;
  return direction;
}
