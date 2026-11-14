import { z } from "zod";
import { draftPublicComment } from "@/lib/ai";
import { aiErrorResponse, badRequest } from "@/lib/api";
import { isSupportedLanguage } from "@/lib/languages";
import { getMeeting } from "@/lib/meetings";

const Body = z.object({
  lang: z.string().default("en"),
  position: z.string().trim().min(1).max(200),
  notes: z.string().trim().min(1).max(4000),
  meetingId: z.string().nullish(),
  itemId: z.string().nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  const { lang, position, notes, meetingId, itemId } = parsed.data;
  try {
    const draft = await draftPublicComment({
      lang: isSupportedLanguage(lang) ? lang : "en",
      position,
      notes,
      meeting: meetingId ? getMeeting(meetingId) : null,
      itemId: itemId ?? null,
    });
    return Response.json(draft);
  } catch (err) {
    return aiErrorResponse(err);
  }
}
