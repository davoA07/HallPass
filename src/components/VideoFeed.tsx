"use client";

import { formatShortDate, formatTime } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import type { VideoCard } from "@/lib/types";
import { useAssistant } from "./AssistantProvider";
import { CapitolIcon, PlayIcon } from "./icons";
import type { ChapterTextFn } from "./useChapterText";

/** Every meeting as a video thumbnail. Tapping one plays it at the top of the page. */
export function VideoFeed({
  cards,
  chapterText,
  title,
}: {
  cards: VideoCard[];
  chapterText: ChapterTextFn;
  title: string;
}) {
  const { tr, lang, play, nowPlaying } = useAssistant();
  const locale = getLanguage(lang).locale;

  return (
    <section aria-labelledby="feed-heading" className="mt-14">
      <h2 id="feed-heading" className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-muted">
          No meetings yet. Run the pipeline: <code>uv run pipeline/process_meeting.py --help</code>
        </p>
      ) : (
        <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((c) => {
            const playing = nowPlaying?.meetingId === c.id;
            const headline = chapterText(c, c.mainChapterId)?.headline ?? c.title;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!playing) play(c.id, 0);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  aria-current={playing || undefined}
                  className="group block w-full text-start"
                >
                  <span className="relative block aspect-video overflow-hidden rounded-xl bg-neutral-soft">
                    {c.thumbnail ? (
                      // Plain <img>: YouTube thumbnails need no resizing, and next/image would need remote config.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-accent-soft text-accent">
                        <CapitolIcon width={40} height={40} />
                      </span>
                    )}
                    {c.duration != null && !playing && (
                      <span className="absolute bottom-2 end-2 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-xs text-white">
                        {formatTime(c.duration)}
                      </span>
                    )}
                    {playing ? (
                      <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
                        <span className="flex items-center gap-1.5">
                          <PlayIcon width={14} height={14} />
                          {tr("nowPlaying")}
                        </span>
                      </span>
                    ) : (
                      <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white">
                          <PlayIcon width={20} height={20} />
                        </span>
                      </span>
                    )}
                    {c.sample && (
                      <span className="absolute start-2 top-2 rounded-md bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                        {tr("sample")}
                      </span>
                    )}
                  </span>
                  <span className="mt-3 flex gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                      <CapitolIcon width={16} height={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 font-medium leading-snug group-hover:text-accent">
                        {headline}
                      </span>
                      <span className="mt-1 block text-sm text-muted">{c.body}</span>
                      <span className="block text-sm text-muted">
                        {formatShortDate(c.date, locale)} · {c.chapters.length} {tr("topics")}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
