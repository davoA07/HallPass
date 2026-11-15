"use client";

import Image from "next/image";
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
    <>
      {/* Full width, outside the page column, so the City Hall photo runs edge to edge. */}
      {!active && <Hero />}

      <div className="mx-auto max-w-7xl px-4 pb-16">
        {initialMeetingId && (
          <Suspense fallback={null}>
            <PlayFromUrl meetingId={initialMeetingId} />
          </Suspense>
        )}

        {active && <Stage cards={cards} chapterText={chapterText} />}

        <VideoFeed
          cards={cards}
          chapterText={chapterText}
          title={active ? tr("moreMeetings") : tr("meetings")}
        />
      </div>
    </>
  );
}

function Hero() {
  const { tr } = useAssistant();
  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackdrop />
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 pb-10 pt-12 text-center sm:pt-16">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">{tr("heroTitle")}</h1>
        {/* Stronger than text-muted: it sits on the photo, over the white tower. */}
        <p className="mt-3 max-w-md text-balance text-lg text-ink/75">{tr("heroSub")}</p>
        <div className="mt-10">
          <MicButton size="lg" />
        </div>
        <div className="mt-8 w-full">
          <Composer big />
        </div>
        <Suggestions className="mt-4 justify-center" />
      </div>
    </section>
  );
}

/**
 * Glendale City Hall behind the hero: grey, washed toward the page colour so the
 * heading and buttons stay readable in light and dark mode, drifting slowly, and
 * fading into the page at the bottom. The fade-in is pure CSS, so the photo shows
 * even before (or without) JavaScript running.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden className="hero-fade pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Image
        src="/glendale-city-hall.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hero-drift object-cover object-[50%_65%] contrast-[.85] grayscale"
      />
      <div className="absolute inset-0 bg-bg/72" />
      <div className="absolute inset-0 bg-linear-to-b from-bg/40 via-transparent via-45% to-bg" />
    </div>
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
