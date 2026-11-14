"use client";

import { useEffect, useRef, useState } from "react";
import { CAPTION_CHUNK_SECONDS, captionAt, type CaptionLine } from "@/lib/captions";
import { postJSON } from "./AssistantProvider";

type Chunk = CaptionLine[] | "error";

/**
 * The caption for the current moment of a meeting video, in `lang`. Fetches the
 * two-minute chunks around `now` (the one before, for lines that started
 * earlier, and the next one ahead of time) and keeps them for the session.
 */
export function useCaptions(meetingId: string, lang: string, now: number, enabled: boolean) {
  const [chunks, setChunks] = useState<Record<string, Chunk>>({});
  const requested = useRef(new Set<string>());

  const current = Math.max(0, Math.floor(now / CAPTION_CHUNK_SECONDS));
  useEffect(() => {
    if (!enabled) return;
    for (const chunk of [current, current - 1, current + 1]) {
      if (chunk < 0) continue;
      const key = `${meetingId}:${lang}:${chunk}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      postJSON<{ lines: CaptionLine[] }>("/api/captions", { meetingId, lang, chunk })
        .then((r) => setChunks((c) => ({ ...c, [key]: r.lines })))
        .catch(() => {
          requested.current.delete(key); // let a later moment retry
          setChunks((c) => ({ ...c, [key]: "error" }));
        });
    }
  }, [enabled, meetingId, lang, current]);

  if (!enabled) return { text: null, loading: false };
  const at = (chunk: number) => chunks[`${meetingId}:${lang}:${chunk}`];
  const here = at(current);
  const lines = [at(current - 1), here].flatMap((c) => (Array.isArray(c) ? c : []));
  return { text: captionAt(lines, now), loading: here === undefined };
}
