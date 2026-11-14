"use client";

import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatTime } from "@/lib/format";
import { getLanguage } from "@/lib/languages";
import { useAssistant } from "./AssistantProvider";
import { MicIcon } from "./icons";

type SessionOptions = NonNullable<Parameters<ReturnType<typeof useConversation>["startSession"]>[0]>;
type VoiceLanguage = NonNullable<NonNullable<NonNullable<SessionOptions["overrides"]>["agent"]>["language"]>;

/**
 * Voice mode: an ElevenLabs agent that talks with the resident and calls the
 * client tools below. Tool names and parameters must match agent/client-tools.json.
 * Mounted once in the layout so a call keeps going while the page changes.
 */
interface VoiceValue {
  connected: boolean;
  busy: boolean;
  speaking: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

const VoiceContext = createContext<VoiceValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      <VoiceBridge>{children}</VoiceBridge>
    </ConversationProvider>
  );
}

function VoiceBridge({ children }: { children: ReactNode }) {
  const { tr, lang, ask, play, pushMessage, requestDraft, nowPlaying } = useAssistant();
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
    try {
      const r = await ask(question, "voice");
      const sources = r.citations
        .map(
          (c) =>
            `${c.label}: ${c.meetingTitle} (${c.meetingDate}) at ${formatTime(c.seconds)} ` +
            `[meeting_id=${c.meetingId}, seconds=${c.seconds}]`,
        )
        .join("; ");
      const best = r.citations[0];
      return [
        `found: ${r.found}`,
        `answer: ${r.answer}`,
        best
          ? `The best matching video is now playing on the resident's screen at ${formatTime(best.seconds)} (${best.label}).`
          : "No video moment matched.",
        sources ? `all sources, shown on screen as video links: ${sources}` : "sources: none",
      ].join("\n");
    } catch (err) {
      return `error: could not search the meeting records (${err instanceof Error ? err.message : "unknown"}). Tell the resident and suggest typing the question.`;
    }
  });

  useConversationClientTool("show_video_moment", (p) => {
    const seconds = Number(p.seconds) || 0;
    const meetingId = String(p.meeting_id ?? "").trim();
    if (!meetingId) return "error: no meeting_id given";
    play(meetingId, seconds);
    return `Now playing that meeting video at ${formatTime(seconds)} on the resident's screen.`;
  });

  useConversationClientTool("draft_public_comment", async (p) => {
    const draft = await requestDraft({ position: String(p.position ?? ""), notes: String(p.notes ?? "") });
    if (!draft) return "error: the draft could not be created. Ask the resident to try the Write to the council form.";
    return [
      "The draft is now on screen in the resident's language, with an English translation beside it.",
      `subject: ${draft.subject}`,
      `draft: ${draft.comment}`,
      "Tell the resident to review and edit it, fill in any [placeholders], and send it themselves. You cannot send it.",
    ].join("\n");
  });

  const { status, isSpeaking } = conversation;
  const connected = status === "connected";
  const playingId = nowPlaying?.meetingId ?? null;

  // Keep the agent informed about language and the video on screen mid-call.
  const lastContext = useRef("");
  useEffect(() => {
    if (!connected) {
      lastContext.current = "";
      return;
    }
    const language = getLanguage(lang);
    const ctx = `The resident's preferred language is ${language.english} (${language.code}). Speak it unless they switch. ${
      playingId ? `The video on their screen is meeting "${playingId}".` : "No video is playing yet."
    }`;
    if (ctx !== lastContext.current) {
      lastContext.current = ctx;
      conversation.sendContextualUpdate(ctx);
    }
  }, [connected, lang, playingId, conversation]);

  const value = useMemo<VoiceValue>(() => {
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
        // Start the call in the picked language: the agent greets, listens and speaks
        // in it from the first word (its language detection still follows the
        // resident if they switch). The agent's Tagalog preset is "fil".
        const overrides = { agent: { language: (lang === "tl" ? "fil" : lang) as VoiceLanguage } };
        if (data.conversationToken) {
          conversation.startSession({ conversationToken: data.conversationToken, connectionType: "webrtc", overrides });
        } else if (data.agentId) {
          conversation.startSession({ agentId: data.agentId, connectionType: "webrtc", overrides });
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
    return {
      connected,
      busy: starting || status === "connecting",
      speaking: isSpeaking,
      error,
      start: () => void start(),
      stop: () => conversation.endSession(),
    };
  }, [connected, starting, status, isSpeaking, error, conversation, tr, lang]);

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside <VoiceProvider>");
  return ctx;
}

/** The talk button. `lg` is the big one on the start screen. */
export function MicButton({ size = "md" }: { size?: "lg" | "md" }) {
  const { tr } = useAssistant();
  const { connected, busy, speaking, error, start, stop } = useVoice();
  const label = connected ? tr("endCall") : busy ? tr("connecting") : size === "lg" ? tr("tapToTalk") : tr("talk");
  const status = connected ? (speaking ? tr("speaking") : tr("listening")) : null;

  if (size === "lg") {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => (connected ? stop() : start())}
          disabled={busy}
          aria-pressed={connected}
          aria-label={label}
          className={`relative grid h-24 w-24 place-items-center rounded-full shadow-lg transition hover:scale-105 disabled:opacity-60 ${
            connected ? "bg-bad text-white" : "bg-accent text-accent-ink"
          }`}
        >
          <span
            aria-hidden
            className={`absolute -inset-3 rounded-full ${connected ? "bg-bad/20" : "bg-accent/15"} ${
              connected && speaking ? "animate-pulse" : ""
            } ${busy ? "animate-ping" : ""}`}
          />
          <MicIcon width={36} height={36} className="relative" />
        </button>
        <span className="text-sm font-medium" aria-live="polite">
          {status ?? label}
        </span>
        {error && <span className="text-sm text-bad">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (connected ? stop() : start())}
      disabled={busy}
      aria-pressed={connected}
      title={status ?? undefined}
      className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition disabled:opacity-60 ${
        connected ? "bg-bad text-white" : "bg-accent text-accent-ink"
      }`}
    >
      {connected && (
        <span aria-hidden className={`absolute inset-0 rounded-full ${speaking ? "animate-pulse bg-white/25" : ""}`} />
      )}
      <MicIcon width={18} height={18} className="relative" />
      <span className="relative">{label}</span>
    </button>
  );
}
