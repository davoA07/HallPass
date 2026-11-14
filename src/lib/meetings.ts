import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Meeting, MeetingSummary } from "./types";

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

export function summarize(m: Meeting): MeetingSummary {
  const top = m.items.slice(0, 4);
  const i18n: MeetingSummary["i18n"] = {};
  for (const [code, tr] of Object.entries(m.translations ?? {})) {
    i18n[code] = {
      overview: tr.overview,
      headlines: top.map((i) => tr.items[i.id]?.headline ?? i.headline),
    };
  }
  return {
    i18n,
    id: m.id,
    title: m.title,
    body: m.body,
    date: m.date,
    sample: Boolean(m.sample),
    reviewed: m.reviewed,
    overview: m.overview,
    itemCount: m.items.length,
    headlines: m.items.slice(0, 4).map((i) => i.headline),
  };
}
