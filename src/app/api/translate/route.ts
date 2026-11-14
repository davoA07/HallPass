import { z } from "zod";
import { translateText } from "@/lib/ai";
import { aiErrorResponse, badRequest } from "@/lib/api";
import { isSupportedLanguage } from "@/lib/languages";

const Body = z.object({
  text: z.string().trim().min(1).max(6000),
  lang: z.string().refine(isSupportedLanguage, "Unsupported language"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return Response.json({ text: await translateText(parsed.data.text, parsed.data.lang) });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
