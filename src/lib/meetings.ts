import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Meeting, Outcome, Tone, VideoCard, VideoSource } from "./types";

/**
 * Processed meetings live as JSON files in data/meetings/ (written by the
 * pipeline). Reads are synchronous on purpose: with Cache Components enabled,
 * synchronous work finishes during prerender, so meeting pages stay static.
 */
const MEETINGS_DIR = path.join(process.cwd(), "data", "meetings");

function readAll(): Meeting[] {
  if (!fs.existsSync(MEETINGS_DIR)) return [];
  const meetings: Meeting[] = [];
  for (const file of fs.readdirSync(MEETINGS_DIR).sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(MEETINGS_DIR, file), "utf8");
      meetings.push(JSON.parse(raw) as Meeting);
    } catch (err) {
      console.error(`Skipping unreadable meeting file ${file}:`, err);
    }
  }
  return meetings;
}

/** Real meetings, newest first. Sample fixtures only appear when nothing real exists yet. */
export function listMeetings(): Meeting[] {
  const all = readAll().sort((a, b) => b.date.localeCompare(a.date));
  const real = all.filter((m) => !m.sample);
  return real.length > 0 ? real : all;
}

export function getMeeting(id: string): Meeting | null {
  return listMeetings().find((m) => m.id === id) ?? null;
}

/** "https://www.youtube.com/watch?v=ID", "youtu.be/ID", "/live/ID", "/embed/ID" -> "ID" */
export function youtubeIdFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Prefer the meeting's YouTube copy: it plays anywhere, gives a thumbnail, and
 * its times match the transcript (the pipeline downloads that same video).
 */
function playableVideo(m: Meeting): VideoSource {
  if (m.video.kind === "youtube") return m.video;
  const id = youtubeIdFrom(m.source.videoUrl);
  return id ? { kind: "youtube", youtubeId: id } : m.video;
}

function toneOf(o: Outcome): Tone {
  if (o.kind !== "vote") return "neutral";
  if (o.yes != null && o.no != null && o.no > o.yes) return "bad";
  return "good";
}

export function toCard(m: Meeting): VideoCard {
  const video = playableVideo(m);
  const lastEnd = Math.max(m.transcript.at(-1)?.end ?? 0, ...m.items.map((i) => i.end), 0);
  const length = (i: Meeting["items"][number]) => i.end - i.start;
  // The longest substantive item is usually what the meeting is remembered for.
  const main =
    [...m.items].filter((i) => i.outcome.kind !== "procedural").sort((a, b) => length(b) - length(a))[0] ??
    m.items[0] ??
    null;

  const i18n: VideoCard["i18n"] = {};
  for (const [code, tr] of Object.entries(m.translations ?? {})) {
    i18n[code] = {};
    for (const it of m.items) {
      const t = tr.items[it.id];
      i18n[code][it.id] = {
        headline: t?.headline ?? it.headline,
        result: it.outcome.kind === "vote" ? (t?.result ?? it.outcome.result) : null,
      };
    }
  }

  return {
    id: m.id,
    title: m.title,
    body: m.body,
    date: m.date,
    sample: Boolean(m.sample),
    language: m.language,
    video,
    thumbnail: video.kind === "youtube" ? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg` : null,
    duration: lastEnd > 0 ? lastEnd : null,
    mainChapterId: main?.id ?? null,
    chapters: m.items.map((it) => ({
      id: it.id,
      start: it.start,
      end: it.end,
      headline: it.headline,
      result: it.outcome.kind === "vote" ? it.outcome.result : null,
      tone: toneOf(it.outcome),
    })),
    i18n,
  };
}
