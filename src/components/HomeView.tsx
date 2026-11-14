"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import type { VideoCard } from "@/lib/types";
import { useAssistant } from "./AssistantProvider";
import { Composer, Suggestions } from "./ChatPanel";
import { Stage } from "./Stage";
import { useChapterText } from "./useChapterText";
import { VideoFeed } from "./VideoFeed";
import { MicButton } from "./VoiceProvider";

/**
 * The whole app on one screen:
 *   start  → a big "talk" button, a question box, and the meeting videos below.
 *   active → the best matching video plays beside the conversation.
 * /meetings/[id] renders this same view with that meeting already playing.
 */
export function HomeView({ cards, initialMeetingId }: { cards: VideoCard[]; initialMeetingId?: string }) {
  const { tr, lang, messages, nowPlaying, tab } = useAssistant();
  const chapterText = useChapterText(cards, lang);
  const active = Boolean(initialMeetingId) || nowPlaying != null || messages.length > 0 || tab === "comment";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      {initialMeetingId && (
        <Suspense fallback={null}>
          <PlayFromUrl meetingId={initialMeetingId} />
        </Suspense>
      )}

      {active ? <Stage cards={cards} chapterText={chapterText} /> : <Hero />}

      <VideoFeed
        cards={cards}
        chapterText={chapterText}
        title={active ? tr("moreMeetings") : tr("meetings")}
      />
    </div>
  );
}

function Hero() {
  const { tr } = useAssistant();
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center pb-4 pt-12 text-center sm:pt-16">
      <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{tr("heroTitle")}</h1>
      <p className="mt-3 max-w-md text-balance text-lg text-muted">{tr("heroSub")}</p>
      <div className="mt-10">
        <MicButton size="lg" />
      </div>
      <div className="mt-8 w-full">
        <Composer big />
      </div>
      <Suggestions className="mt-4 justify-center" />
    </section>
  );
}

/** /meetings/[id]?t=SECONDS starts that meeting at that moment. */
function PlayFromUrl({ meetingId }: { meetingId: string }) {
  const params = useSearchParams();
  const { play } = useAssistant();
  const t = Number(params.get("t") ?? 0);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    play(meetingId, Number.isFinite(t) ? t : 0);
  }, [meetingId, t, play]);
  return null;
}
