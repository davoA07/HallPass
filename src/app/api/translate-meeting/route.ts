import { z } from "zod";
import { translateMeeting } from "@/lib/ai";
import { aiErrorResponse, badRequest } from "@/lib/api";
import { isSupportedLanguage } from "@/lib/languages";
import { getMeeting } from "@/lib/meetings";
import type { MeetingTranslation } from "@/lib/types";

const Body = z.object({
  meetingId: z.string(),
  lang: z.string().refine(isSupportedLanguage, "Unsupported language"),
});

// Live translations are kept for the life of the server process. For the demo,
// pre-translate with the pipeline (--langs hy,es) so nothing depends on this.
const cache = new Map<string, Promise<MeetingTranslation>>();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { meetingId, lang } = parsed.data;

  const meeting = getMeeting(meetingId);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });
  const stored = meeting.translations?.[lang];
  if (stored) return Response.json(stored);

  const key = `${meeting.id}:${meeting.generatedAt}:${lang}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = translateMeeting(meeting, lang);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  try {
    return Response.json(await pending);
  } catch (err) {
    return aiErrorResponse(err);
  }
}
