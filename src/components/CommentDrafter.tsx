"use client";

import { useState } from "react";
import type { StringKey } from "@/lib/i18n";
import { errorText, postJSON, useAssistant } from "./AssistantProvider";
import { CopyIcon } from "./icons";

const POSITIONS: { key: StringKey; value: string }[] = [
  { key: "support", value: "supports it" },
  { key: "oppose", value: "opposes it" },
  { key: "concern", value: "has a concern" },
  { key: "question", value: "has a question" },
];

const COMMENT_URL = process.env.NEXT_PUBLIC_PUBLIC_COMMENT_URL || null;

export function CommentDrafter() {
  const { tr, lang, draft, setDraft, requestDraft, commentTarget, startComment } = useAssistant();
  const busy = draft.status === "drafting" || draft.status === "translating";
  const english = lang === "en";

  async function retranslate() {
    setDraft({ status: "translating" });
    try {
      const { text } = await postJSON<{ text: string }>("/api/translate", { text: draft.comment, lang: "en" });
      setDraft({ english: text, status: "ready" });
    } catch (err) {
      setDraft({ status: "error", error: errorText(err, tr) });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <h2 className="font-semibold">{tr("draftTitle")}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{tr("aboutMeeting")}:</span>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
          {commentTarget.itemTitle ?? commentTarget.meetingTitle ?? tr("general")}
        </span>
        {(commentTarget.itemId || commentTarget.meetingId) && (
          <button type="button" className="text-xs text-muted underline" onClick={() => startComment({})}>
            {tr("general")}
          </button>
        )}
      </div>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          requestDraft();
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">{tr("position")}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {POSITIONS.map((p) => (
              <label
                key={p.key}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                  draft.position === p.value ? "border-accent bg-accent-soft" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="position"
                  value={p.value}
                  checked={draft.position === p.value}
                  onChange={() => setDraft({ position: p.value })}
                  className="sr-only"
                />
                {tr(p.key)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="comment-notes" className="text-sm font-medium">
            {tr("notes")}
          </label>
          <textarea
            id="comment-notes"
            value={draft.notes}
            onChange={(e) => setDraft({ notes: e.target.value })}
            rows={4}
            className="mt-2 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !draft.position || !draft.notes.trim()}
          className="h-11 w-full rounded-xl bg-accent font-medium text-accent-ink disabled:opacity-50"
        >
          {draft.status === "drafting" ? tr("drafting") : tr("draftButton")}
        </button>
      </form>

      {draft.status === "error" && <p className="mt-3 text-sm text-bad">{draft.error}</p>}

      {draft.comment && (
        <section className="mt-6 space-y-4">
          {draft.subject && <p className="text-sm font-medium">{draft.subject}</p>}
          <DraftBox
            label={tr("yourComment")}
            value={draft.comment}
            onChange={(v) => setDraft({ comment: v })}
            copyLabel={tr("copy")}
            copiedLabel={tr("copied")}
          />
          {!english && (
            <>
              <DraftBox
                label={tr("englishVersion")}
                value={draft.english}
                onChange={(v) => setDraft({ english: v })}
                copyLabel={tr("copy")}
                copiedLabel={tr("copied")}
                ltr
              />
              <button
                type="button"
                onClick={retranslate}
                disabled={busy}
                className="text-sm text-accent underline disabled:opacity-50"
              >
                {draft.status === "translating" ? tr("translating") : tr("retranslate")}
              </button>
            </>
          )}
          {draft.checklist.length > 0 && (
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
              {draft.checklist.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <p className="font-medium">{tr("youSend")}</p>
            <p className="mt-1">{tr("howToSend")}</p>
            {COMMENT_URL && (
              <a href={COMMENT_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block underline">
                {tr("openCommentPage")} ↗
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function DraftBox({
  label,
  value,
  onChange,
  copyLabel,
  copiedLabel,
  ltr,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  copyLabel: string;
  copiedLabel: string;
  ltr?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked; the text is still selectable */
            }
          }}
          className="inline-flex items-center gap-1 text-xs text-accent"
        >
          <CopyIcon width={14} height={14} />
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        dir={ltr ? "ltr" : undefined}
        lang={ltr ? "en" : undefined}
        className="mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed"
      />
    </div>
  );
}
