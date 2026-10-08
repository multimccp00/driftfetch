/** Rows of a long list that need to exist: the ones in view plus a margin. */
export function windowRange(
  scrollTop: number,
  viewHeight: number,
  count: number,
  rowHeight: number,
  { overscan = 10, threshold = 80 } = {},
) {
  // A short list is rendered whole, so tabbing and finding text work as usual.
  if (count <= threshold) return { start: 0, end: count };
  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + viewHeight) / rowHeight);
  return {
    start: Math.max(0, Math.min(count, first - overscan)),
    end: Math.max(0, Math.min(count, last + overscan)),
  };
}
