"use client";

import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatTime, momentHref } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import { useAssistant } from "./AssistantProvider";
import { MicIcon } from "./icons";

/**
 * Voice mode: an ElevenLabs agent that talks with the resident and calls the
 * client tools below. Tool names and parameters must match agent/client-tools.json.
 */
export function VoiceControl() {
  return (
    <ConversationProvider>
      <VoiceInner />
    </ConversationProvider>
  );
}

function VoiceInner() {
  const router = useRouter();
  const { tr, lang, ask, pushMessage, requestDraft, currentMeetingId, setTab } = useAssistant();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const conversation = useConversation({
    onMessage: ({ message, role }) => {
      if (message?.trim()) pushMessage({ role: role === "user" ? "user" : "assistant", text: message, via: "voice" });
    },
    onError: (message) => setError(String(message)),
  });

  useConversationClientTool("ask_city_records", async (p) => {
    const question = String(p.question ?? "").trim();
    if (!question) return "error: no question given";
    setTab("ask");
    try {
      const r = await ask(question, "voice");
      const sources = r.citations
        .map(
          (c) =>
            `${c.label}: ${c.meetingTitle} (${c.meetingDate}) at ${formatTime(c.seconds)} ` +
            `[meeting_id=${c.meetingId}, seconds=${c.seconds}]`,
        )
        .join("; ");
      return [
        `found: ${r.found}`,
        `answer: ${r.answer}`,
        sources ? `sources shown on screen as video links: ${sources}` : "sources: none",
      ].join("\n");
    } catch (err) {
      return `error: could not search the meeting records (${err instanceof Error ? err.message : "unknown"}). Tell the resident and suggest typing the question.`;
    }
  });

  useConversationClientTool("show_video_moment", (p) => {
    const seconds = Number(p.seconds) || 0;
    router.push(momentHref(String(p.meeting_id ?? ""), seconds));
    return `Opened the meeting video at ${formatTime(seconds)}.`;
  });

  useConversationClientTool("draft_public_comment", async (p) => {
    const draft = await requestDraft({ position: String(p.position ?? ""), notes: String(p.notes ?? "") });
    if (!draft) return "error: the draft could not be created. Ask the resident to try the Speak up form.";
    return [
      "The draft is now on screen in the resident's language, with an English translation beside it.",
      `subject: ${draft.subject}`,
      `draft: ${draft.comment}`,
      "Tell the resident to review and edit it, fill in any [placeholders], and send it themselves. You cannot send it.",
    ].join("\n");
  });

  const { status, isSpeaking } = conversation;
  const connected = status === "connected";

  // Keep the agent informed about language and page changes mid-call.
  const lastContext = useRef("");
  useEffect(() => {
    if (!connected) {
      lastContext.current = "";
      return;
    }
    const language = getLanguage(lang);
    const ctx = `The resident's preferred language is ${language.english} (${language.code}). Speak it unless they switch. ${
      currentMeetingId ? `They are viewing meeting "${currentMeetingId}".` : "They are on the home page."
    }`;
    if (ctx !== lastContext.current) {
      lastContext.current = ctx;
      conversation.sendContextualUpdate(ctx);
    }
  }, [connected, lang, currentMeetingId, conversation]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch("/api/agent-session", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        agentId?: string;
        conversationToken?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "voice unavailable");
      if (data.conversationToken) {
        conversation.startSession({ conversationToken: data.conversationToken, connectionType: "webrtc" });
      } else if (data.agentId) {
        conversation.startSession({ agentId: data.agentId, connectionType: "webrtc" });
      } else {
        throw new Error("voice unavailable");
      }
    } catch (err) {
      console.warn("voice start failed", err);
      setError(tr("voiceUnavailable"));
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || status === "connecting";
  const label = connected ? tr("endCall") : busy ? tr("connecting") : tr("talk");

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => (connected ? conversation.endSession() : start())}
        disabled={busy}
        aria-pressed={connected}
        className={`relative inline-flex h-12 items-center gap-2 rounded-full px-5 font-medium transition ${
          connected ? "bg-bad text-white" : "bg-accent text-accent-ink"
        } disabled:opacity-60`}
      >
        {connected && (
          <span
            aria-hidden
            className={`absolute inset-0 rounded-full ${isSpeaking ? "animate-pulse bg-white/20" : ""}`}
          />
        )}
        <MicIcon width={18} height={18} />
        {label}
      </button>
      <div className="min-w-0 text-sm" aria-live="polite">
        {connected && <span className="text-muted">{isSpeaking ? tr("speaking") : tr("listening")}</span>}
        {error && <span className="text-bad">{error}</span>}
      </div>
    </div>
  );
}
