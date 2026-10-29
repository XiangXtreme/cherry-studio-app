/** The pane never covers the whole conversation: a strip stays visible. */
export const REFERENCE_PANE_MAX_WIDTH = 560;
export const REFERENCE_PANE_MIN_VISIBLE = 48;

/** Wide enough to browse a two-column grid, never wider than the conversation allows. */
export function resolveReferencePaneWidth(columnWidth: number): number {
  if (!Number.isFinite(columnWidth) || columnWidth <= 0) return 0;
  const available = Math.max(0, columnWidth - REFERENCE_PANE_MIN_VISIBLE);
  return Math.min(Math.round(columnWidth * 0.86), REFERENCE_PANE_MAX_WIDTH, available);
}

/** A quarter of the pane, or a decisive flick, closes it. */
export function shouldDismissReferencePane(input: {
  distance: number;
  velocity: number;
  width: number;
}): boolean {
  if (input.width <= 0) return true;
  return input.distance > input.width * 0.25 || input.velocity > 600;
}
