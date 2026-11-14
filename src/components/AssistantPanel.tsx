"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import { useAssistant, type ChatMessage } from "./AssistantProvider";
import { CommentDrafter } from "./CommentDrafter";
import { ChatIcon, CloseIcon, PlayIcon, SendIcon } from "./icons";
import { VoiceControl } from "./VoiceControl";

export function AssistantPanel() {
  const { open, setOpen, tab, setTab, tr, dir } = useAssistant();

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 end-5 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-5 font-medium text-accent-ink shadow-lg"
        >
          <ChatIcon />
          {tr("ask")}
        </button>
      )}

      {/* Kept mounted while closed so a voice call survives tab switches. */}
      <aside
        aria-label={tr("ask")}
        inert={!open}
        className={`fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-line bg-surface shadow-2xl transition-transform duration-200 sm:w-[440px] ${
          open ? "translate-x-0" : dir === "rtl" ? "-translate-x-full" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div role="tablist" className="flex gap-1 rounded-lg bg-neutral-soft p-1">
            {(["ask", "comment"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === k ? "bg-surface text-ink shadow-sm" : "text-muted"
                }`}
              >
                {k === "ask" ? tr("askTab") : tr("speakUp")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ms-auto grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-soft"
            aria-label={tr("close")}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <VoiceControl />
        </div>

        {tab === "ask" ? <AskTab /> : <CommentDrafter />}
      </aside>
    </>
  );
}

function AskTab() {
  const { messages, ask, tr, setOpen } = useAssistant();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const busy = messages.some((m) => m.pending && m.via === "text");

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    await ask(q).catch(() => {});
  }

  return (
    <>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && <p className="text-sm leading-relaxed text-muted">{tr("emptyAsk")}</p>}
        {messages.map((m) => (
          <Message key={m.id} m={m} onNavigate={() => window.innerWidth < 640 && setOpen(false)} />
        ))}
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
        <label htmlFor="ask-input" className="sr-only">
          {tr("ask")}
        </label>
        <textarea
          id="ask-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          placeholder={tr("askPlaceholder")}
          className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-ink disabled:opacity-50"
          aria-label={tr("send")}
        >
          <SendIcon width={18} height={18} />
        </button>
      </form>
    </>
  );
}

function Message({ m, onNavigate }: { m: ChatMessage; onNavigate: () => void }) {
  const { tr } = useAssistant();

  if (m.via === "receipt") {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
        <p className="text-muted">🔎 {m.text}</p>
        {m.pending && <p className="mt-1 text-muted">{tr("thinking")}</p>}
        {m.error && <p className="mt-1 text-bad">{m.text}</p>}
        <Citations m={m} onNavigate={onNavigate} />
      </div>
    );
  }

  const mine = m.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine
            ? "bg-accent text-accent-ink"
            : m.error
              ? "bg-bad-soft text-bad"
              : m.found === false
                ? "bg-neutral-soft"
                : "bg-surface-2 ring-1 ring-line"
        }`}
      >
        {m.via === "voice" && (
          <span className="me-1 opacity-70" aria-hidden>
            🎙
          </span>
        )}
        {m.pending ? <span className="text-muted">{tr("thinking")}</span> : m.text}
        {!mine && <Citations m={m} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

function Citations({ m, onNavigate }: { m: ChatMessage; onNavigate: () => void }) {
  const { tr } = useAssistant();
  if (!m.citations?.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted">{tr("sources")}</p>
      <ul className="mt-1 space-y-1.5">
        {m.citations.map((c) => (
          <li key={`${c.meetingId}-${c.seconds}`}>
            <Link
              href={c.href}
              onClick={onNavigate}
              className="flex items-start gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink hover:border-accent"
            >
              <PlayIcon width={12} height={12} className="mt-0.5 shrink-0 text-accent" />
              <span>
                <span className="font-mono text-accent">{formatTime(c.seconds)}</span> · {c.label}
                <span className="block text-muted">
                  {c.meetingTitle} · {c.meetingDate}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
