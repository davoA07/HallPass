"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getLanguage } from "@/lib/languages";
import { t as translate, type StringKey } from "@/lib/i18n";
import type { Citation } from "@/lib/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  via: "text" | "voice" | "receipt";
  citations?: Citation[];
  found?: boolean;
  pending?: boolean;
  error?: boolean;
}

export interface CommentTarget {
  meetingId: string | null;
  meetingTitle: string | null;
  itemId: string | null;
  itemTitle: string | null;
}

export interface DraftState {
  position: string;
  notes: string;
  subject: string;
  comment: string;
  english: string;
  checklist: string[];
  status: "idle" | "drafting" | "ready" | "translating" | "error";
  error?: string;
}

export interface AskResponse {
  found: boolean;
  answer: string;
  citations: Citation[];
}

/** The video on screen. `nonce` changes on every request, so asking for the same moment twice still seeks. */
export interface NowPlaying {
  meetingId: string;
  seconds: number;
  nonce: number;
}

interface AssistantContextValue {
  lang: string;
  setLang: (code: string) => void;
  tr: (key: StringKey) => string;
  dir: "ltr" | "rtl";
  /** What the chat column shows: the conversation or the comment drafter. */
  tab: "ask" | "comment";
  setTab: (tab: "ask" | "comment") => void;
  messages: ChatMessage[];
  pushMessage: (m: Omit<ChatMessage, "id">) => string;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  /**
   * Ask the meeting records. The best matching moment starts playing.
   * `via: "voice"` records the question as a receipt card (the agent speaks the answer).
   */
  ask: (question: string, via?: "text" | "voice") => Promise<AskResponse>;
  nowPlaying: NowPlaying | null;
  play: (meetingId: string, seconds: number) => void;
  /** Back to the start screen: clears the conversation, video and draft. */
  reset: () => void;
  commentTarget: CommentTarget;
  startComment: (target: Partial<CommentTarget>) => void;
  draft: DraftState;
  setDraft: (patch: Partial<DraftState>) => void;
  requestDraft: (opts?: { position?: string; notes?: string }) => Promise<DraftState | null>;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

const EMPTY_DRAFT: DraftState = {
  position: "",
  notes: "",
  subject: "",
  comment: "",
  english: "",
  checklist: [],
  status: "idle",
};

const EMPTY_TARGET: CommentTarget = { meetingId: null, meetingTitle: null, itemId: null, itemTitle: null };

const LANG_KEY = "ach.lang";

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A failed API call. `status` is 0 when the request never reached the server. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new RequestError(err instanceof Error ? err.message : String(err), 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new RequestError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  return data as T;
}

/**
 * The message a resident sees when a request fails, in their language. Server
 * error texts are English and meant for developers, so they go to the console.
 */
export function errorText(err: unknown, tr: (key: StringKey) => string): string {
  console.warn(err);
  return err instanceof RequestError && err.status === 429 ? tr("busy") : tr("aiError");
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState("en");
  const [tab, setTab] = useState<"ask" | "comment">("ask");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget>(EMPTY_TARGET);
  const [draft, setDraftState] = useState<DraftState>(EMPTY_DRAFT);

  // Refs so async callbacks (voice tools) always see the latest values.
  const messagesRef = useRef(messages);
  const langRef = useRef(lang);
  const playingRef = useRef(nowPlaying);
  const targetRef = useRef(commentTarget);
  const draftRef = useRef(draft);
  useEffect(() => {
    messagesRef.current = messages;
    langRef.current = lang;
    playingRef.current = nowPlaying;
    targetRef.current = commentTarget;
    draftRef.current = draft;
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      // Restoring a saved preference after hydration is the intended behavior here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setLangState(getLanguage(saved).code);
    } catch {
      /* storage unavailable: keep English */
    }
  }, []);

  const language = getLanguage(lang);
  useEffect(() => {
    document.documentElement.lang = language.code;
    document.documentElement.dir = language.rtl ? "rtl" : "ltr";
  }, [language]);

  const setLang = useCallback((code: string) => {
    const next = getLanguage(code).code;
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const pushMessage = useCallback((m: Omit<ChatMessage, "id">) => {
    const id = newId();
    setMessages((prev) => [...prev, { ...m, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const play = useCallback((meetingId: string, seconds: number) => {
    setNowPlaying((prev) => ({ meetingId, seconds: Math.max(0, seconds), nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const ask = useCallback(
    async (question: string, via: "text" | "voice" = "text"): Promise<AskResponse> => {
      const history = messagesRef.current
        .filter((m) => m.via !== "receipt" && !m.pending && !m.error)
        .map((m) => ({ role: m.role, text: m.text }));
      let pendingId: string;
      setTab("ask");
      if (via === "text") {
        pushMessage({ role: "user", text: question, via: "text" });
        pendingId = pushMessage({ role: "assistant", text: "", via: "text", pending: true });
      } else {
        pendingId = pushMessage({ role: "assistant", text: question, via: "receipt", pending: true });
      }
      try {
        const result = await postJSON<AskResponse>("/api/ask", {
          question,
          lang: langRef.current,
          meetingId: playingRef.current?.meetingId ?? null,
          history,
        });
        updateMessage(pendingId, {
          pending: false,
          text: via === "text" ? result.answer : question,
          citations: result.citations,
          found: result.found,
        });
        // The first citation is the model's best match: play it.
        const best = result.citations[0];
        if (best) play(best.meetingId, best.seconds);
        return result;
      } catch (err) {
        const message = errorText(err, (key) => translate(langRef.current, key));
        updateMessage(pendingId, { pending: false, error: true, text: message });
        throw err;
      }
    },
    [pushMessage, updateMessage, play],
  );

  const setDraft = useCallback((patch: Partial<DraftState>) => {
    setDraftState((prev) => ({ ...prev, ...patch }));
  }, []);

  const startComment = useCallback((target: Partial<CommentTarget>) => {
    setCommentTarget({ ...EMPTY_TARGET, ...target });
    setTab("comment");
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setNowPlaying(null);
    setTab("ask");
    setCommentTarget(EMPTY_TARGET);
    setDraftState(EMPTY_DRAFT);
  }, []);

  const requestDraft = useCallback(async (opts?: { position?: string; notes?: string }) => {
    const position = opts?.position ?? draftRef.current.position;
    const notes = opts?.notes ?? draftRef.current.notes;
    if (!position.trim() || !notes.trim()) return null;
    setDraftState((prev) => ({ ...prev, position, notes, status: "drafting", error: undefined }));
    setTab("comment");
    const target = targetRef.current;
    try {
      const result = await postJSON<{ subject: string; comment: string; english: string; checklist: string[] }>(
        "/api/draft-comment",
        {
          lang: langRef.current,
          position,
          notes,
          meetingId: target.meetingId ?? playingRef.current?.meetingId ?? null,
          itemId: target.itemId,
        },
      );
      const next: DraftState = { position, notes, ...result, status: "ready" };
      setDraftState(next);
      return next;
    } catch (err) {
      const message = errorText(err, (key) => translate(langRef.current, key));
      setDraftState((prev) => ({ ...prev, status: "error", error: message }));
      return null;
    }
  }, []);

  const value = useMemo<AssistantContextValue>(
    () => ({
      lang,
      setLang,
      tr: (key) => translate(lang, key),
      dir: language.rtl ? "rtl" : "ltr",
      tab,
      setTab,
      messages,
      pushMessage,
      updateMessage,
      ask,
      nowPlaying,
      play,
      reset,
      commentTarget,
      startComment,
      draft,
      setDraft,
      requestDraft,
    }),
    [
      lang,
      setLang,
      language.rtl,
      tab,
      messages,
      pushMessage,
      updateMessage,
      ask,
      nowPlaying,
      play,
      reset,
      commentTarget,
      startComment,
      draft,
      setDraft,
      requestDraft,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

export { postJSON };
