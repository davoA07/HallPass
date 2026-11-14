"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatShortDate, formatTime } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import type { Tone, VideoCard } from "@/lib/types";
import { useAssistant } from "./AssistantProvider";
import { ChatPanel } from "./ChatPanel";
import { CapitolIcon } from "./icons";
import type { ChapterTextFn } from "./useChapterText";
import { VideoPlayer, type PlayerHandle } from "./VideoPlayer";

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  neutral: "bg-neutral-soft text-muted",
};

/** Player (with title and chapters) beside the conversation. On phones: player, chat, chapters. */
export function Stage({ cards, chapterText }: { cards: VideoCard[]; chapterText: ChapterTextFn }) {
  const { nowPlaying } = useAssistant();
  const card = cards.find((c) => c.id === nowPlaying?.meetingId) ?? null;

  // Playback time as reported by the player, tagged with the request it belongs to,
  // so a new request shows its own start time until the player catches up.
  const [time, setTime] = useState({ nonce: -1, t: 0 });
  const nonceRef = useRef(nowPlaying?.nonce ?? 0);
  useEffect(() => {
    nonceRef.current = nowPlaying?.nonce ?? 0;
  });
  const onTime = useCallback((t: number) => setTime({ nonce: nonceRef.current, t }), []);
  const now = nowPlaying ? (time.nonce === nowPlaying.nonce ? time.t : nowPlaying.seconds) : 0;

  return (
    <section className="grid gap-x-6 gap-y-5 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        {card && nowPlaying ? (
          <StagePlayer
            key={card.id}
            card={card}
            seconds={nowPlaying.seconds}
            nonce={nowPlaying.nonce}
            onTime={onTime}
          />
        ) : (
          <PlayerPlaceholder />
        )}
      </div>

      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <ChatPanel cards={cards} chapterText={chapterText} now={now} />
      </div>

      {card && (
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <MeetingInfo card={card} now={now} chapterText={chapterText} />
        </div>
      )}
    </section>
  );
}

function StagePlayer({
  card,
  seconds,
  nonce,
  onTime,
}: {
  card: VideoCard;
  seconds: number;
  nonce: number;
  onTime: (t: number) => void;
}) {
  const { tr } = useAssistant();
  const ref = useRef<PlayerHandle>(null);
  // The first request loads the player at its start time; later ones seek.
  const [start] = useState(seconds);
  const firstNonce = useRef(nonce);
  useEffect(() => {
    if (nonce !== firstNonce.current) ref.current?.seek(seconds);
  }, [nonce, seconds]);

  return (
    <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-line">
      <VideoPlayer
        ref={ref}
        video={card.video}
        initialTime={start}
        autoplay
        onTime={onTime}
        labels={{ noVideo: tr("noVideo"), openVideo: tr("openVideo"), videoTitle: tr("videoTitle") }}
      />
    </div>
  );
}

function PlayerPlaceholder() {
  const { tr, messages } = useAssistant();
  const searching = messages.some((m) => m.pending);
  return (
    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-dashed border-line bg-surface-2 p-6 text-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <span
          className={`grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent ${
            searching ? "animate-pulse" : ""
          }`}
        >
          <CapitolIcon width={26} height={26} />
        </span>
        <p className="max-w-xs text-balance text-sm">{searching ? tr("findingVideo") : tr("videoHere")}</p>
      </div>
    </div>
  );
}

function MeetingInfo({ card, now, chapterText }: { card: VideoCard; now: number; chapterText: ChapterTextFn }) {
  const { tr, lang, play } = useAssistant();
  const locale = getLanguage(lang).locale;
  const title = chapterText(card, card.mainChapterId)?.headline ?? card.title;
  const activeId = card.chapters.find((c) => now >= c.start && now < c.end)?.id ?? null;

  // Keep the current chapter in view inside the row, without scrolling the page.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const el = activeId ? row?.querySelector<HTMLElement>(`[data-ch="${activeId}"]`) : null;
    if (!row || !el) return;
    const r = row.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    <div>
      <h2 className="text-xl font-semibold leading-snug">{title}</h2>
      <p className="mt-1 text-sm text-muted">
        {card.body} · {formatShortDate(card.date, locale)}
        {card.sample && (
          <span className="ms-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
            {tr("sample")}
          </span>
        )}
      </p>

      {card.chapters.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-muted">{tr("inThisMeeting")}</h3>
          <div ref={rowRef} className="-mx-1 mt-2 flex snap-x gap-3 overflow-x-auto px-1 pb-3">
            {card.chapters.map((ch) => {
              const text = chapterText(card, ch.id);
              const active = ch.id === activeId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  data-ch={ch.id}
                  onClick={() => play(card.id, ch.start)}
                  aria-current={active || undefined}
                  title={text?.result ?? undefined}
                  className={`w-60 shrink-0 snap-start rounded-xl border p-3 text-start transition ${
                    active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-accent">{formatTime(ch.start)}</span>
                    {text?.result && text.result.length <= 24 && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${TONE[ch.tone]}`}>{text.result}</span>
                    )}
                  </span>
                  <span className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{text?.headline}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
