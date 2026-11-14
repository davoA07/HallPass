import { z } from "zod";
import { askCityRecords } from "@/lib/ai";
import { aiErrorResponse, badRequest } from "@/lib/api";
import { isSupportedLanguage } from "@/lib/languages";
import { listMeetings } from "@/lib/meetings";

const Body = z.object({
  question: z.string().trim().min(1).max(2000),
  lang: z.string().default("en"),
  meetingId: z.string().nullish(),
  // Keep the most recent turns rather than rejecting a long conversation.
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().transform((s) => s.slice(0, 4000)) }))
    .max(200)
    .transform((h) => h.slice(-20))
    .default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { question, lang, meetingId, history } = parsed.data;

  const meetings = listMeetings();
  if (meetings.length === 0) {
    return Response.json({ found: false, answer: "No meetings have been processed yet.", citations: [] });
  }
  try {
    const result = await askCityRecords({
      question,
      lang: isSupportedLanguage(lang) ? lang : "en",
      history,
      meetings,
      focusMeetingId: meetingId ?? null,
    });
    return Response.json(result);
  } catch (err) {
    return aiErrorResponse(err);
  }
}
