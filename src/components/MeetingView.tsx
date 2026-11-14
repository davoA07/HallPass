"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatTime } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import type { StringKey } from "@/lib/i18n";
import type { AgendaItem, Meeting, MeetingTranslation, Outcome } from "@/lib/types";
import { postJSON, useAssistant } from "./AssistantProvider";
import { PenIcon, PlayIcon } from "./icons";
import { VideoPlayer, type PlayerHandle } from "./VideoPlayer";

type TrState = MeetingTranslation | "loading" | "error";

export function MeetingView({ meeting }: { meeting: Meeting }) {
  const { lang, tr, setCurrentMeetingId, startComment } = useAssistant();
  const playerRef = useRef<PlayerHandle>(null);
  const transcriptBox = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(meeting.clip.start ?? 0);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Record<string, TrState>>({});

  useEffect(() => {
    setCurrentMeetingId(meeting.id);
    return () => setCurrentMeetingId(null);
  }, [meeting.id, setCurrentMeetingId]);

  // --- translation -------------------------------------------------------
  const needsTranslation = lang !== meeting.language;
  const stored: MeetingTranslation | undefined = meeting.translations?.[lang];
  const trState = (needsTranslation ? (stored ?? fetched[lang] ?? null) : null) as TrState | null;

  useEffect(() => {
    if (!needsTranslation || stored || fetched[lang]) return;
    // Marking the request as in flight before it starts is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetched((f) => ({ ...f, [lang]: "loading" }));
    postJSON<MeetingTranslation>("/api/translate-meeting", { meetingId: meeting.id, lang })
      .then((res) => setFetched((f) => ({ ...f, [lang]: res })))
      .catch(() => setFetched((f) => ({ ...f, [lang]: "error" })));
  }, [lang, needsTranslation, stored, fetched, meeting.id]);

  const translation = trState && typeof trState === "object" ? trState : null;
  const locale = getLanguage(lang).locale;

  // --- seeking -----------------------------------------------------------
  const activeSegment = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < meeting.transcript.length; i++) {
      if (meeting.transcript[i].start <= now + 0.5) idx = i;
      else break;
    }
    return idx;
  }, [meeting.transcript, now]);

  const activeItem = useMemo(
    () => meeting.items.find((i) => now >= i.start && now < i.end)?.id ?? null,
    [meeting.items, now],
  );

  const seek = useCallback(
    (seconds: number) => {
      playerRef.current?.seek(seconds);
      setNow(seconds);
      // Bring the matching transcript line into view inside its own scroll box.
      const idx = meeting.transcript.findLastIndex((s) => s.start <= seconds + 0.5);
      const box = transcriptBox.current;
      const row = idx >= 0 ? box?.querySelector<HTMLElement>(`[data-seg="${idx}"]`) : null;
      if (box && row) box.scrollTo({ top: row.offsetTop - box.offsetTop - 16, behavior: "smooth" });
      setFlashKey(`${idx}:${Date.now()}`);
    },
    [meeting.transcript],
  );

  const speakerName = (id: string) => {
    const s = meeting.speakers.find((x) => x.id === id);
    if (!s) return id.replace("speaker_", "Speaker ");
    return [s.role, s.name].filter(Boolean).join(" · ") || id.replace("speaker_", "Speaker ");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6">
      <Suspense fallback={null}>
        <SeekFromUrl onSeek={seek} />
      </Suspense>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{formatDate(meeting.date, locale)}</span>
        <span aria-hidden>·</span>
        <span>{meeting.body}</span>
        {meeting.sample && (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
            {tr("sample")}
          </span>
        )}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{meeting.title}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Left: video */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <VideoPlayer
            ref={playerRef}
            video={meeting.video}
            initialTime={meeting.clip.start ?? 0}
            onTime={setNow}
            labels={{ noVideo: tr("noVideo"), openVideo: tr("openVideo") }}
          />
          <p className="mt-2 font-mono text-xs text-muted">⏱ {formatTime(now)}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {meeting.source.agendaUrl && (
              <a className="text-accent underline" href={meeting.source.agendaUrl} target="_blank" rel="noreferrer">
                {tr("agenda")}
              </a>
            )}
            {meeting.source.minutesUrl && (
              <a className="text-accent underline" href={meeting.source.minutesUrl} target="_blank" rel="noreferrer">
                {tr("minutes")}
              </a>
            )}
            {meeting.source.videoUrl && (
              <a className="text-accent underline" href={meeting.source.videoUrl} target="_blank" rel="noreferrer">
                {tr("originalVideo")}
              </a>
            )}
          </div>

          <details className="mt-6 rounded-xl border border-line bg-surface" open>
            <summary className="cursor-pointer px-4 py-3 font-medium">{tr("transcript")}</summary>
            <div ref={transcriptBox} className="max-h-[22rem] overflow-y-auto border-t border-line px-2 py-2">
              <ol>
                {meeting.transcript.map((seg, i) => (
                  <li
                    key={`${seg.start}-${i}`}
                    data-seg={i}
                    lang={meeting.language}
                    dir="ltr"
                    className={`rounded-lg px-2 py-1.5 text-sm leading-relaxed ${
                      i === activeSegment ? "bg-accent-soft" : ""
                    } ${flashKey?.startsWith(`${i}:`) ? "flash" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => seek(seg.start)}
                      className="me-2 font-mono text-xs text-accent hover:underline"
                    >
                      {formatTime(seg.start)}
                    </button>
                    <span className="font-medium">{speakerName(seg.speaker)}:</span> {seg.text}
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </div>

        {/* Right: news */}
        <div>
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              meeting.reviewed ? "bg-good-soft text-good" : "bg-warn-soft text-warn"
            }`}
          >
            {meeting.reviewed ? tr("reviewedNotice") : tr("aiNotice")}
          </p>
          {trState === "loading" && <p className="mt-3 text-sm text-muted">{tr("translating")}</p>}
          {trState === "error" && <p className="mt-3 text-sm text-muted">{tr("translateFailed")}</p>}

          <p className="mt-4 text-lg leading-relaxed">{translation?.overview ?? meeting.overview}</p>

          <ol className="mt-6 space-y-4">
            {meeting.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                tr={tr}
                translated={translation?.items[item.id] ?? null}
                active={item.id === activeItem}
                onSeek={seek}
                onComment={() =>
                  startComment({
                    meetingId: meeting.id,
                    meetingTitle: meeting.title,
                    itemId: item.id,
                    itemTitle: translation?.items[item.id]?.headline ?? item.headline,
                  })
                }
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function SeekFromUrl({ onSeek }: { onSeek: (s: number) => void }) {
  const params = useSearchParams();
  const t = params.get("t");
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    onSeekRef.current = onSeek;
  });
  useEffect(() => {
    if (t == null) return;
    const seconds = Number(t);
    if (!Number.isFinite(seconds)) return;
    // Give an embedded player a moment to load before the first seek.
    const id = setTimeout(() => onSeekRef.current(seconds), 600);
    return () => clearTimeout(id);
  }, [t]);
  return null;
}

function outcomeTone(o: Outcome): string {
  if (o.kind === "vote") {
    if (o.yes != null && o.no != null) return o.yes > o.no ? "bg-good-soft text-good" : "bg-bad-soft text-bad";
    return "bg-accent-soft text-accent";
  }
  if (o.kind === "direction") return "bg-warn-soft text-warn";
  return "bg-neutral-soft text-muted";
}

const VOTE_MARK: Record<string, string> = { yes: "✓", no: "✗", abstain: "–", absent: "○", unknown: "?" };

function ItemCard({
  item,
  tr,
  translated,
  active,
  onSeek,
  onComment,
}: {
  item: AgendaItem;
  tr: (k: StringKey) => string;
  translated: MeetingTranslation["items"][string] | null;
  active: boolean;
  onSeek: (s: number) => void;
  onComment: () => void;
}) {
  const result = translated?.result ?? item.outcome.result;
  return (
    <li
      className={`rounded-2xl border bg-surface p-5 transition ${
        active ? "border-accent shadow-sm" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {item.agendaNumber && (
          <span className="rounded-md bg-neutral-soft px-2 py-0.5 font-mono text-muted">#{item.agendaNumber}</span>
        )}
        {result && (
          <span className={`rounded-full px-2 py-0.5 font-medium ${outcomeTone(item.outcome)}`}>{result}</span>
        )}
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug">{translated?.headline ?? item.headline}</h2>
      <p className="mt-1 text-xs text-muted" lang="en" dir="ltr">
        {item.title}
      </p>
      <p className="mt-3 leading-relaxed">{translated?.summary ?? item.summary}</p>
      <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <span className="font-medium">{tr("whyItMatters")}: </span>
        {translated?.whyItMatters ?? item.whyItMatters}
      </p>

      {item.outcome.votes.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">{tr("votes")}</summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {item.outcome.votes.map((v) => (
              <li key={v.name} className="rounded-md bg-neutral-soft px-2 py-1" dir="ltr">
                <span aria-label={v.vote}>{VOTE_MARK[v.vote] ?? "?"}</span> {v.name}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSeek(item.start)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
        >
          <PlayIcon width={14} height={14} />
          {tr("watchFrom")} {formatTime(item.start)}
        </button>
        {item.keyMoments.map((k) => (
          <button
            key={`${k.t}-${k.label}`}
            type="button"
            onClick={() => onSeek(k.t)}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm hover:border-accent"
            title={k.label}
          >
            <span className="font-mono text-xs text-accent">{formatTime(k.t)}</span>{" "}
            <span lang="en" dir="ltr">
              {k.label}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onComment}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-accent hover:bg-accent-soft"
        >
          <PenIcon width={14} height={14} />
          {tr("commentOnItem")}
        </button>
      </div>
    </li>
  );
}
