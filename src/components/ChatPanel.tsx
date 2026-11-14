"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatShortDate, formatTime } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import type { VideoCard } from "@/lib/types";
import { useAssistant, type ChatMessage } from "./AssistantProvider";
import { CommentDrafter } from "./CommentDrafter";
import { BackIcon, CapitolIcon, PenIcon, PlayIcon, RestartIcon, SendIcon } from "./icons";
import type { ChapterTextFn } from "./useChapterText";
import { MicButton, useVoice } from "./VoiceProvider";

export function ChatPanel({
  cards,
  chapterText,
  now,
}: {
  cards: VideoCard[];
  chapterText: ChapterTextFn;
  now: number;
}) {
  const { tr, tab, setTab, nowPlaying, startComment, reset } = useAssistant();
  const voice = useVoice();
  const router = useRouter();
  const pathname = usePathname();
  const card = cards.find((c) => c.id === nowPlaying?.meetingId) ?? null;

  function writeToCouncil() {
    // Comment on whatever is on screen right now: this meeting, this chapter.
    const chapter = card?.chapters.find((c) => now >= c.start && now < c.end) ?? null;
    startComment({
      meetingId: card?.id ?? null,
      meetingTitle: card ? `${card.title}, ${card.date}` : null,
      itemId: chapter?.id ?? null,
      itemTitle: card && chapter ? (chapterText(card, chapter.id)?.headline ?? null) : null,
    });
  }

  function startOver() {
    if (voice.connected) voice.stop();
    reset();
    if (pathname !== "/") router.push("/");
  }

  return (
    <aside
      aria-label="Ask City Hall"
      className="flex h-[62vh] min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:max-h-[46rem]"
    >
      <header className="flex items-center gap-1 border-b border-line px-3 py-2">
        {tab === "comment" ? (
          <button
            type="button"
            onClick={() => setTab("ask")}
            className="inline-flex items-center gap-1 rounded-lg py-1.5 pe-2.5 ps-1.5 text-sm font-medium hover:bg-neutral-soft"
          >
            <BackIcon width={16} height={16} className="rtl:rotate-180" />
            {tr("back")}
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-2 px-1 text-sm font-semibold">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
              <CapitolIcon width={14} height={14} />
            </span>
            <span className="hidden truncate min-[420px]:inline lg:hidden xl:inline">Ask City Hall</span>
          </span>
        )}
        <div className="ms-auto flex shrink-0 items-center gap-1">
          {tab === "ask" && (
            <button
              type="button"
              onClick={writeToCouncil}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
            >
              <PenIcon width={15} height={15} />
              {tr("writeToCouncil")}
            </button>
          )}
          <button
            type="button"
            onClick={startOver}
            aria-label={tr("startOver")}
            title={tr("startOver")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-neutral-soft hover:text-ink"
          >
            <RestartIcon width={16} height={16} />
          </button>
        </div>
      </header>

      {tab === "comment" ? (
        <CommentDrafter />
      ) : (
        <>
          <Thread hasVideo={card != null} />
          <div className="border-t border-line p-3">
            {voice.error && <p className="mb-2 text-xs text-bad">{voice.error}</p>}
            <div className="flex items-center gap-2">
              <MicButton />
              <Composer />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function Thread({ hasVideo }: { hasVideo: boolean }) {
  const { messages, tr } = useAssistant();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-5 py-6 text-center">
        <p className="text-balance text-muted">{hasVideo ? tr("askAboutThis") : tr("emptyChat")}</p>
        <Suggestions className="justify-center" />
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
      {messages.map((m) => (
        <Message key={m.id} m={m} />
      ))}
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const { tr } = useAssistant();

  if (m.via === "receipt") {
    // A question the voice agent looked up: show what it searched and the moments it found.
    return (
      <div className="rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-line">
        <p className="text-muted">🔎 {m.text}</p>
        {m.pending && <Dots label={tr("thinking")} />}
        <Moments m={m} />
      </div>
    );
  }

  const mine = m.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine
            ? "rounded-ee-md bg-accent text-accent-ink"
            : m.error
              ? "rounded-es-md bg-bad-soft text-bad"
              : "rounded-es-md bg-surface-2 ring-1 ring-line"
        }`}
      >
        {m.via === "voice" && (
          <span className="me-1 opacity-70" aria-hidden>
            🎙
          </span>
        )}
        {m.pending ? <Dots label={tr("thinking")} /> : m.text}
        {!mine && <Moments m={m} />}
      </div>
    </div>
  );
}

function Dots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted">
      <span className="inline-flex gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </span>
      {label}
    </span>
  );
}

/** The video moments behind an answer. Tapping one plays it. */
function Moments({ m }: { m: ChatMessage }) {
  const { play, nowPlaying, tr, lang } = useAssistant();
  if (!m.citations?.length) return null;
  const meetings = new Set(m.citations.map((c) => c.meetingId));
  return (
    <ul className="mt-2.5 space-y-1.5">
      {m.citations.map((c) => {
        const playing = nowPlaying?.meetingId === c.meetingId && Math.floor(nowPlaying.seconds) === c.seconds;
        return (
          <li key={`${c.meetingId}-${c.seconds}`}>
            <a
              href={c.href}
              onClick={(e) => {
                e.preventDefault();
                play(c.meetingId, c.seconds);
              }}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs text-ink transition ${
                playing ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
              }`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                <PlayIcon width={10} height={10} />
              </span>
              <span className="font-mono text-accent">{formatTime(c.seconds)}</span>
              <span className="min-w-0 flex-1 truncate">
                {c.label}
                {meetings.size > 1 && <span className="text-muted"> · {formatShortDate(c.meetingDate, getLanguage(lang).locale)}</span>}
              </span>
              {playing && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  {tr("nowPlaying")}
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** One-line question box. `big` is the start-screen version. */
export function Composer({ big = false }: { big?: boolean }) {
  const { ask, tr, messages } = useAssistant();
  const [text, setText] = useState("");
  const busy = messages.some((m) => m.pending && m.via === "text");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    ask(q).catch(() => {});
  }

  return (
    <form
      onSubmit={submit}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
        big ? "h-14 pe-2 ps-5 shadow-sm" : "h-11 pe-1 ps-4"
      }`}
    >
      <label htmlFor={big ? "ask-big" : "ask-input"} className="sr-only">
        {tr("typeQuestion")}
      </label>
      <input
        id={big ? "ask-big" : "ask-input"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={tr("typeQuestion")}
        autoComplete="off"
        className={`min-w-0 flex-1 bg-transparent placeholder:text-muted focus-visible:outline-none ${
          big ? "text-lg" : "text-sm"
        }`}
      />
      <button
        type="submit"
        disabled={busy || !text.trim()}
        aria-label={tr("send")}
        className={`grid shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:opacity-30 ${
          big ? "h-10 w-10" : "h-9 w-9"
        }`}
      >
        <SendIcon width={big ? 18 : 16} height={big ? 18 : 16} className="rtl:-scale-x-100" />
      </button>
    </form>
  );
}

/** Three example questions, so nobody has to think of the first one. */
export function Suggestions({ className = "" }: { className?: string }) {
  const { ask, tr, messages } = useAssistant();
  const busy = messages.some((m) => m.pending);
  const questions = [tr("suggest1"), tr("suggest2"), tr("suggest3")];
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          disabled={busy}
          onClick={() => ask(q).catch(() => {})}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
