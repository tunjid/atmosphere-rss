export function truncateGraphemes(str: string, maxGraphemes: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(str));
  if (segments.length <= maxGraphemes) return str;
  return segments
    .slice(0, maxGraphemes)
    .map((s) => s.segment)
    .join("");
}
