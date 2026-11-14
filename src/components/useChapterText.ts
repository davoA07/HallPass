"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeetingTranslation, VideoCard } from "@/lib/types";
import { postJSON } from "./AssistantProvider";

type ChapterText = { headline: string; result: string | null };
export type ChapterTextFn = (card: VideoCard, chapterId: string | null) => ChapterText | null;

type Fetched = Record<string, VideoCard["i18n"][string] | "loading" | "error">;

/**
 * Chapter headlines in the resident's language: stored translations first,
 * then a live translation (fetched once per meeting and language), else the original.
 */
export function useChapterText(cards: VideoCard[], lang: string): ChapterTextFn {
  const [fetched, setFetched] = useState<Fetched>({});

  useEffect(() => {
    for (const card of cards) {
      const key = `${card.id}:${lang}`;
      if (lang === card.language || card.i18n[lang] || fetched[key]) continue;
      // Marking the request as in flight before it starts is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFetched((f) => ({ ...f, [key]: "loading" }));
      postJSON<MeetingTranslation>("/api/translate-meeting", { meetingId: card.id, lang })
        .then((res) => {
          const map: VideoCard["i18n"][string] = {};
          for (const ch of card.chapters) {
            const t = res.items[ch.id];
            map[ch.id] = { headline: t?.headline ?? ch.headline, result: ch.result ? (t?.result ?? ch.result) : null };
          }
          setFetched((f) => ({ ...f, [key]: map }));
        })
        .catch(() => setFetched((f) => ({ ...f, [key]: "error" })));
    }
  }, [cards, lang, fetched]);

  return useCallback(
    (card, chapterId) => {
      const ch = card.chapters.find((c) => c.id === chapterId);
      if (!ch) return null;
      const live = fetched[`${card.id}:${lang}`];
      const t = card.i18n[lang]?.[ch.id] ?? (typeof live === "object" ? live[ch.id] : undefined);
      return { headline: t?.headline ?? ch.headline, result: t ? t.result : ch.result };
    },
    [fetched, lang],
  );
}
