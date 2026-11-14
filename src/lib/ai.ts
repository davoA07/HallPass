import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { formatTime, momentHref } from "./format";
import { getLanguage } from "./languages";
import type { Citation, Meeting, MeetingTranslation } from "./types";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// Pin the base URL so a shell-level ANTHROPIC_BASE_URL (set by other tools)
// doesn't silently reroute the app. Override with CLAUDE_API_BASE_URL if needed.
const client = new Anthropic({
  baseURL: process.env.CLAUDE_API_BASE_URL || "https://api.anthropic.com",
});

/**
 * Calls opt into server-side refusal fallbacks: if the model declines, the API
 * re-runs the request on a fallback model inside the same call. Claude Haiku 5.5
 * has no fallback model, so its requests leave the parameter out and a declined
 * request stays on Haiku (the route then shows its "couldn't answer" message).
 */
const FALLBACK = MODEL.startsWith("claude-haiku")
  ? {}
  : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export class AIUnavailableError extends Error {}

function check(stopReason: string | null, parsed: unknown) {
  if (stopReason === "refusal") throw new AIUnavailableError("The model declined this request.");
  if (stopReason === "max_tokens") throw new AIUnavailableError("The answer was cut off.");
  if (parsed == null) throw new AIUnavailableError("The model returned an unreadable answer.");
}

// ---------------------------------------------------------------------------
// Corpus: every processed meeting rendered as text the model can cite from.
// ---------------------------------------------------------------------------

/** Rough cap so a pile of 3-hour meetings can't blow up latency (≈ 4 chars/token). */
const TRANSCRIPT_CHAR_BUDGET = 1_200_000;

function speakerLabel(m: Meeting, id: string): string {
  const s = m.speakers.find((x) => x.id === id);
  if (!s) return id;
  const parts = [s.role, s.name].filter(Boolean).join(" ");
  return parts ? `${parts} (${id})` : id;
}

function renderMeeting(m: Meeting, includeTranscript: boolean): string {
  const lines: string[] = [];
  lines.push(
    `<meeting id="${m.id}" title="${m.title}" body="${m.body}" date="${m.date}" reviewed="${m.reviewed}">`,
  );
  lines.push(`<overview>${m.overview}</overview>`);
  lines.push("<agenda_items>");
  for (const it of m.items) {
    const o = it.outcome;
    const tally =
      o.yes != null ? ` (yes ${o.yes}, no ${o.no ?? 0}, abstain ${o.abstain ?? 0})` : "";
    lines.push(
      `[t=${Math.floor(it.start)}] ${it.agendaNumber ? `Item ${it.agendaNumber}: ` : ""}${it.title}` +
        ` | ${formatTime(it.start)}–${formatTime(it.end)}` +
        ` | Headline: ${it.headline} | Summary: ${it.summary}` +
        ` | Outcome: ${o.kind}${o.result ? `, ${o.result}` : ""}${tally}` +
        (o.votes.length ? ` | Votes: ${o.votes.map((v) => `${v.name}=${v.vote}`).join(", ")}` : "") +
        (it.keyMoments.length
          ? ` | Moments: ${it.keyMoments.map((k) => `[t=${Math.floor(k.t)}] ${k.label}`).join("; ")}`
          : ""),
    );
  }
  lines.push("</agenda_items>");
  if (includeTranscript) {
    lines.push("<transcript>");
    for (const seg of m.transcript) {
      lines.push(`[t=${Math.floor(seg.start)}] ${speakerLabel(m, seg.speaker)}: ${seg.text}`);
    }
    lines.push("</transcript>");
  } else {
    lines.push("<transcript omitted='too long; cite agenda item times' />");
  }
  lines.push("</meeting>");
  return lines.join("\n");
}

export function buildCorpus(meetings: Meeting[]): string {
  let budget = TRANSCRIPT_CHAR_BUDGET;
  return meetings
    .map((m) => {
      const size = m.transcript.reduce((n, s) => n + s.text.length + 40, 0);
      const include = size <= budget;
      if (include) budget -= size;
      return renderMeeting(m, include);
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Ask: answer a resident's question with citations to video moments.
// ---------------------------------------------------------------------------

const ASK_SYSTEM = `You are "HallPass", a civic assistant that explains what a city council discussed and decided, for residents who may not speak English and have never watched a council meeting.

You answer ONLY from the meeting records provided below. Each record has agenda items and a transcript; every line starts with [t=SECONDS], the moment in the meeting video.

Rules:
- Use only facts present in the records. Never use outside knowledge about the city, its officials, or its laws.
- If the records do not answer the question, set found=false and say plainly that you don't know from these meetings. You may suggest what kind of meeting or city office might have the answer, without inventing details.
- Cite the moments that support your answer: for each citation give the meeting id and the [t=SECONDS] value of the transcript line or agenda item where the support is, plus a short label (in the answer language) describing what happens there. 1–3 citations is ideal. Never cite a time that is not in the records.
- Distinguish what was DECIDED (votes, approvals) from what was only DISCUSSED or PROPOSED. Report vote counts exactly as recorded.
- Names: only use a person's name if the records state it. Otherwise use their role ("a councilmember", "a resident").
- Write the answer in the language named in the request. Use plain words a 12-year-old could follow; keep official terms but explain them. 2–4 short sentences, no markdown, no bullet points: the answer may be read aloud.
- Residents often type their language in Latin letters, the way they text: Armenian such as "inch voroshets khorhurdy jri gneri masin" or "xorhurdy inch oroshec?" (with x, gh, 8, 3, 4, 7 standing in for Armenian letters), Persian as Finglish, Russian as translit. Read romanized text as that language, not as English, and answer in that language's own script (Armenian in Armenian letters).
- Do not tell the resident what to think or how to vote. Stay neutral.
- If the resident wants to speak up about an issue, briefly mention that you can help them draft a public comment.`;

const AskSchema = z.object({
  found: z.boolean(),
  answer: z.string(),
  citations: z.array(
    z.object({
      meeting_id: z.string(),
      seconds: z.number(),
      label: z.string(),
    }),
  ),
});

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AskResult {
  found: boolean;
  answer: string;
  citations: Citation[];
}

export async function askCityRecords(opts: {
  question: string;
  lang: string;
  history: AskTurn[];
  meetings: Meeting[];
  focusMeetingId?: string | null;
}): Promise<AskResult> {
  const { question, lang, history, meetings, focusMeetingId } = opts;
  const language = getLanguage(lang);
  const corpus = buildCorpus(meetings);

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of history.slice(-6)) {
    messages.push({ role: turn.role, content: turn.text });
  }
  const focus = focusMeetingId
    ? `\nThe resident is currently viewing meeting "${focusMeetingId}"; prefer it when the question is ambiguous.`
    : "";
  messages.push({
    role: "user",
    content: `Answer language: ${language.english} (${language.code}). If my message is written in another language, including that language typed in Latin letters, answer in that language instead.${focus}\n\nResident's question: ${question}`,
  });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(AskSchema) },
    system: [
      { type: "text", text: ASK_SYSTEM },
      {
        type: "text",
        text: `<meeting_records>\n${corpus}\n</meeting_records>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });
  check(response.stop_reason, response.parsed_output);
  const out = response.parsed_output!;

  // Keep only citations that point at a real meeting and a plausible time.
  const citations: Citation[] = [];
  for (const c of out.citations) {
    const m = meetings.find((x) => x.id === c.meeting_id);
    if (!m) continue;
    const last = m.transcript.at(-1)?.end ?? m.items.at(-1)?.end ?? Infinity;
    if (!(c.seconds >= 0 && c.seconds <= last + 5)) continue;
    citations.push({
      meetingId: m.id,
      meetingTitle: m.title,
      meetingDate: m.date,
      seconds: Math.floor(c.seconds),
      label: c.label,
      href: momentHref(m.id, c.seconds),
    });
  }

  return { found: out.found, answer: out.answer, citations };
}

// ---------------------------------------------------------------------------
// Public comment drafting. The resident reviews and sends it themselves.
// ---------------------------------------------------------------------------

const DRAFT_SYSTEM = `You help residents write a short public comment to their city council, in their own language, with an English translation beside it.

Rules:
- Write in the first person as the resident. Respectful, specific, under 200 words.
- Residents often type their language in Latin letters, the way they text: Armenian such as "jri gnery shat en bardzranum, chem karogh vcharel" or "xndrum em chbardzracnel" (with x, gh, 8, 3, 4, 7 standing in for Armenian letters), Persian as Finglish, Russian as translit. Read romanized notes as that language, not as English, and follow the language rule in the request.
- Use only what the resident told you plus the agenda item facts provided. Do not invent personal details, statistics, or claims. Where a personal detail would help (name, neighborhood), leave a placeholder in square brackets, e.g. [your name], written in the resident's language.
- Reference the agenda item and meeting date when provided.
- Keep the resident's position exactly; do not soften, strengthen, or change it.
- "english" must be a faithful English translation of "comment" (identical if the resident's language is English).
- "checklist": 2–4 short reminders in the resident's language, e.g. fill in placeholders, check the facts, confirm how and when the city accepts comments.`;

const DraftSchema = z.object({
  subject: z.string(),
  comment: z.string(),
  english: z.string(),
  checklist: z.array(z.string()),
});

export type DraftResult = z.infer<typeof DraftSchema>;

export async function draftPublicComment(opts: {
  lang: string;
  position: string;
  notes: string;
  meeting: Meeting | null;
  itemId: string | null;
}): Promise<DraftResult> {
  const language = getLanguage(opts.lang);
  const item = opts.meeting?.items.find((i) => i.id === opts.itemId) ?? null;
  const context = opts.meeting
    ? `Meeting: ${opts.meeting.title}, ${opts.meeting.body}, ${opts.meeting.date}.` +
      (item
        ? `\nAgenda item${item.agendaNumber ? ` ${item.agendaNumber}` : ""}: ${item.title}\nWhat happened: ${item.summary}\nOutcome: ${item.outcome.result ?? item.outcome.kind}`
        : "")
    : "No specific meeting selected.";

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(DraftSchema) },
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Language for "comment" and "checklist": if the resident's notes below are in a language other than English, in its own script or typed in Latin letters (e.g. "jri gnery shat en bardzranum" is Armenian), write in the notes' language, in its own script. Otherwise write in ${language.english} (${language.code}), the language the resident picked.\nPosition: ${opts.position}\n${context}\n\nWhat the resident wants to say, in their words:\n${opts.notes}`,
      },
    ],
  });
  check(response.stop_reason, response.parsed_output);
  return response.parsed_output!;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

const TranslateTextSchema = z.object({ text: z.string() });

export async function translateText(text: string, targetLang: string): Promise<string> {
  const language = getLanguage(targetLang);
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(TranslateTextSchema) },
    system:
      "Translate the resident's public comment faithfully. Keep meaning, tone, placeholders in [brackets] and line breaks. Translate only; add nothing.",
    messages: [{ role: "user", content: `Target language: ${language.english}\n\n${text}` }],
  });
  check(response.stop_reason, response.parsed_output);
  return response.parsed_output!.text;
}

const MeetingTranslationSchema = z.object({
  overview: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      headline: z.string(),
      summary: z.string(),
      why_it_matters: z.string(),
      result: z.string().nullable(),
    }),
  ),
});

export async function translateMeeting(m: Meeting, targetLang: string): Promise<MeetingTranslation> {
  const language = getLanguage(targetLang);
  const payload = {
    overview: m.overview,
    items: m.items.map((i) => ({
      id: i.id,
      headline: i.headline,
      summary: i.summary,
      why_it_matters: i.whyItMatters,
      result: i.outcome.result,
    })),
  };
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(MeetingTranslationSchema) },
    system:
      "Translate these city council meeting summaries for residents. Use plain, everyday language. Keep names, numbers, vote counts, and agenda numbers exactly. Keep each item's id unchanged. Translate only; add nothing.",
    messages: [
      {
        role: "user",
        content: `Target language: ${language.english} (${language.code})\n\n${JSON.stringify(payload)}`,
      },
    ],
  });
  check(response.stop_reason, response.parsed_output);
  const out = response.parsed_output!;
  const items: MeetingTranslation["items"] = {};
  for (const it of out.items) {
    items[it.id] = {
      headline: it.headline,
      summary: it.summary,
      whyItMatters: it.why_it_matters,
      result: it.result,
    };
  }
  return { overview: out.overview, items };
}
