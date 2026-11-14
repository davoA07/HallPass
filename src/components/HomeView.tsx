"use client";

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import type { MeetingSummary } from "@/lib/types";
import { useAssistant } from "./AssistantProvider";
import { ChatIcon, MicIcon } from "./icons";

export function HomeView({ meetings }: { meetings: MeetingSummary[] }) {
  const { lang, tr, setOpen, setTab } = useAssistant();
  const locale = getLanguage(lang).locale;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24">
      <section className="py-10 sm:py-14">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">Glendale City Council</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {tr("tagline")}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{tr("intro")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setTab("ask");
              setOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 font-medium text-accent-ink"
          >
            <MicIcon width={18} height={18} />
            {tr("ask")}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("comment");
              setOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 font-medium"
          >
            <ChatIcon width={18} height={18} />
            {tr("speakUp")}
          </button>
        </div>
      </section>

      <section aria-labelledby="meetings-heading">
        <h2 id="meetings-heading" className="mb-4 text-lg font-semibold">
          {tr("meetings")}
        </h2>
        {meetings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-muted">
            No meetings yet. Run the pipeline: <code>uv run pipeline/process_meeting.py --help</code>
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {meetings.map((m) => {
              const loc = m.i18n[lang];
              const headlines = loc?.headlines ?? m.headlines;
              return (
                <li key={m.id}>
                  <Link
                    href={`/meetings/${m.id}`}
                    className="block h-full rounded-2xl border border-line bg-surface p-5 transition hover:border-accent hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{formatDate(m.date, locale)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {m.itemCount} {tr("items")}
                      </span>
                      {m.sample && (
                        <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">
                          {tr("sample")}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold">{m.title}</h3>
                    <p className="text-sm text-muted">{m.body}</p>
                    <ul className="mt-3 space-y-1.5">
                      {headlines.map((h) => (
                        <li key={h} className="flex gap-2 text-sm leading-snug">
                          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
