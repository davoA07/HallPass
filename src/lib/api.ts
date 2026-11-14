import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AIUnavailableError } from "./ai";

export function badRequest(err: z.ZodError) {
  return Response.json({ error: "Invalid request", details: z.treeifyError(err) }, { status: 400 });
}

/** Turn SDK/model errors into a short JSON error the UI can show. */
export function aiErrorResponse(err: unknown) {
  if (err instanceof AIUnavailableError) {
    return Response.json({ error: err.message }, { status: 502 });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return Response.json(
      { error: "The AI service isn't configured. Set ANTHROPIC_API_KEY in .env.local." },
      { status: 503 },
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Too many requests right now. Try again in a moment." }, { status: 429 });
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Claude API error", err.status, err.message);
    return Response.json({ error: "The AI service had a problem. Try again." }, { status: 502 });
  }
  if (err instanceof Anthropic.AnthropicError) {
    // e.g. missing credentials raised client-side before any request is sent
    console.error("Claude client error", err.message);
    return Response.json(
      { error: "The AI service isn't configured. Set ANTHROPIC_API_KEY in .env.local." },
      { status: 503 },
    );
  }
  console.error(err);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      { error: "The AI service isn't configured. Set ANTHROPIC_API_KEY in .env.local." },
      { status: 503 },
    );
  }
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}
