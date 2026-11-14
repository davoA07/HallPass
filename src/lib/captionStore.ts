import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { CaptionLine } from "./captions";

/**
 * Pre-translated captions, written by scripts/preload-captions.mjs to
 * data/captions/<meetingId>/<lang>.json. Checked before translating live, so
 * the moments the demo plays show captions instantly, even after a restart.
 * A file only counts for the meeting version it was made from (generatedAt).
 */
export interface StoredCaptions {
  meetingId: string;
  lang: string;
  generatedAt: string;
  chunks: Record<string, CaptionLine[]>;
}

const CAPTIONS_DIR = path.join(process.cwd(), "data", "captions");

export function storedCaptions(meetingId: string, lang: string, generatedAt: string, chunk: number): CaptionLine[] | null {
  const file = path.join(CAPTIONS_DIR, path.basename(meetingId), `${path.basename(lang)}.json`);
  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf8")) as StoredCaptions;
    if (stored.generatedAt !== generatedAt) return null; // made from an older version of the meeting
    return stored.chunks[String(chunk)] ?? null;
  } catch {
    return null; // no file for this meeting and language
  }
}
