import { z } from "zod";
import { translateCaptions } from "@/lib/ai";
import { aiErrorResponse, badRequest } from "@/lib/api";
import { CAPTION_CHUNK_SECONDS, type CaptionLine } from "@/lib/captions";
import { storedCaptions } from "@/lib/captionStore";
import { isSupportedLanguage } from "@/lib/languages";
import { getMeeting } from "@/lib/meetings";

const Body = z.object({
  meetingId: z.string(),
  lang: z.string().refine(isSupportedLanguage, "Unsupported language"),
  chunk: z.number().int().min(0).max(100_000),
});

// Translated chunks are kept for the life of the server process, so each part
// of a meeting is translated once per language however many people watch it.
const cache = new Map<string, Promise<CaptionLine[]>>();

/**
 * Captions for one CAPTION_CHUNK_SECONDS window of a meeting video: the
 * transcript lines that start in it, in the requested language.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { meetingId, lang, chunk } = parsed.data;

  const meeting = getMeeting(meetingId);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const from = chunk * CAPTION_CHUNK_SECONDS;
  const to = from + CAPTION_CHUNK_SECONDS;
  const segments = meeting.transcript.filter((s) => s.start >= from && s.start < to);
  const original: CaptionLine[] = segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  if (lang === "en" || original.length === 0) return Response.json({ lines: original });

  const stored = storedCaptions(meeting.id, lang, meeting.generatedAt, chunk);
  if (stored) return Response.json({ lines: stored });

  const key = `${meeting.id}:${meeting.generatedAt}:${lang}:${chunk}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = translateCaptions(
      original.map((l, i) => ({ i, text: l.text })),
      lang,
    ).then((byIndex) => original.map((l, i) => ({ ...l, text: byIndex.get(i) ?? l.text })));
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  try {
    return Response.json({ lines: await pending });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
