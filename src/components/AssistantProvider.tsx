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

interface AssistantContextValue {
  lang: string;
  setLang: (code: string) => void;
  tr: (key: StringKey) => string;
  dir: "ltr" | "rtl";
  open: boolean;
  setOpen: (open: boolean) => void;
  tab: "ask" | "comment";
  setTab: (tab: "ask" | "comment") => void;
  messages: ChatMessage[];
  pushMessage: (m: Omit<ChatMessage, "id">) => string;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  /** Ask the meeting records. `via: "voice"` records the answer as a receipt card. */
  ask: (question: string, via?: "text" | "voice") => Promise<AskResponse>;
  currentMeetingId: string | null;
  setCurrentMeetingId: (id: string | null) => void;
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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "comment">("ask");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<CommentTarget>({
    meetingId: null,
    meetingTitle: null,
    itemId: null,
    itemTitle: null,
  });
  const [draft, setDraftState] = useState<DraftState>(EMPTY_DRAFT);

  // Refs so async callbacks (voice tools) always see the latest values.
  const messagesRef = useRef(messages);
  const langRef = useRef(lang);
  const meetingRef = useRef(currentMeetingId);
  const targetRef = useRef(commentTarget);
  const draftRef = useRef(draft);
  useEffect(() => {
    messagesRef.current = messages;
    langRef.current = lang;
    meetingRef.current = currentMeetingId;
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

  const ask = useCallback(
    async (question: string, via: "text" | "voice" = "text"): Promise<AskResponse> => {
      const history = messagesRef.current
        .filter((m) => m.via !== "receipt" && !m.pending && !m.error)
        .map((m) => ({ role: m.role, text: m.text }));
      let pendingId: string;
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
          meetingId: meetingRef.current,
          history,
        });
        updateMessage(pendingId, {
          pending: false,
          text: via === "text" ? result.answer : question,
          citations: result.citations,
          found: result.found,
        });
        return result;
      } catch (err) {
        const message = errorText(err, (key) => translate(langRef.current, key));
        updateMessage(pendingId, { pending: false, error: true, text: message });
        throw err;
      }
    },
    [pushMessage, updateMessage],
  );

  const setDraft = useCallback((patch: Partial<DraftState>) => {
    setDraftState((prev) => ({ ...prev, ...patch }));
  }, []);

  const startComment = useCallback((target: Partial<CommentTarget>) => {
    setCommentTarget({
      meetingId: target.meetingId ?? null,
      meetingTitle: target.meetingTitle ?? null,
      itemId: target.itemId ?? null,
      itemTitle: target.itemTitle ?? null,
    });
    setTab("comment");
    setOpen(true);
  }, []);

  const requestDraft = useCallback(
    async (opts?: { position?: string; notes?: string }) => {
      const position = opts?.position ?? draftRef.current.position;
      const notes = opts?.notes ?? draftRef.current.notes;
      if (!position.trim() || !notes.trim()) return null;
      setDraftState((prev) => ({ ...prev, position, notes, status: "drafting", error: undefined }));
      setTab("comment");
      setOpen(true);
      const target = targetRef.current;
      try {
        const result = await postJSON<{ subject: string; comment: string; english: string; checklist: string[] }>(
          "/api/draft-comment",
          {
            lang: langRef.current,
            position,
            notes,
            meetingId: target.meetingId ?? meetingRef.current,
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
    },
    [],
  );

  const value = useMemo<AssistantContextValue>(
    () => ({
      lang,
      setLang,
      tr: (key) => translate(lang, key),
      dir: language.rtl ? "rtl" : "ltr",
      open,
      setOpen,
      tab,
      setTab,
      messages,
      pushMessage,
      updateMessage,
      ask,
      currentMeetingId,
      setCurrentMeetingId,
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
      open,
      tab,
      messages,
      pushMessage,
      updateMessage,
      ask,
      currentMeetingId,
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
