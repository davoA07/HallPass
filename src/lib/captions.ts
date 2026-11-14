/** Captions are fetched and translated in windows of this many seconds of video. */
export const CAPTION_CHUNK_SECONDS = 120;

export interface CaptionLine {
  start: number;
  end: number;
  text: string;
}

/**
 * The caption to show at `t`. A transcript line can run for half a minute, so
 * long lines are split into sentences, each shown for a share of the line's
 * time proportional to its length.
 */
export function captionAt(lines: CaptionLine[], t: number): string | null {
  const line = lines.find((l) => t >= l.start && t < l.end + 0.5);
  if (!line) return null;
  const parts = splitSentences(line.text);
  if (parts.length <= 1) return line.text;
  const total = parts.reduce((n, p) => n + p.length, 0);
  const progress = Math.min(1, Math.max(0, (t - line.start) / Math.max(1, line.end - line.start)));
  let seen = 0;
  for (const p of parts) {
    seen += p.length;
    if (seen / total >= progress) return p;
  }
  return parts[parts.length - 1];
}

/**
 * Splits on sentence ends in Latin, Armenian (։), Persian (؟) and CJK punctuation.
 * Armenian ՞ marks a question on a word, not the end of a sentence, so it isn't a split point.
 */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?։؟。！？]+[.!?։؟。！？]*\s*/g) ?? [text];
  // Merge fragments too short to read on their own into the previous one.
  const merged: string[] = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    if (merged.length && (p.length < 25 || merged[merged.length - 1].length < 25)) merged[merged.length - 1] += " " + p;
    else merged.push(p);
  }
  return merged.length ? merged : [text];
}
