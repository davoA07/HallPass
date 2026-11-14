#!/usr/bin/env node
/**
 * Pre-translate captions for the moments the demo plays, so they appear
 * instantly instead of after a 5–15 s live translation.
 *
 * For every processed meeting it takes each agenda item's start and key moments
 * (where answers and chapter buttons jump to), plus any extra ranges below, and
 * saves the caption chunks covering them to data/captions/<meetingId>/<lang>.json.
 * The /api/captions route serves those files first; everything else is still
 * translated live.
 *
 * Run with the app running (npm run dev):
 *   node scripts/preload-captions.mjs              # Armenian and Spanish
 *   node scripts/preload-captions.mjs hy,es,ko     # other languages
 * Re-running is cheap: chunks already saved are skipped. Re-run after
 * reprocessing a meeting (files are tied to the meeting's generatedAt).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.HALLPASS_URL || "http://localhost:3000";
const LANGS = (process.argv[2] || "hy,es").split(",").map((s) => s.trim()).filter(Boolean);
const CHUNK = 120; // must match CAPTION_CHUNK_SECONDS in src/lib/captions.ts
const AFTER = 1; // also take this many chunks after each moment
const CONCURRENCY = 3;

// Extra demo ranges in seconds: [meetingId, from, to].
const EXTRA = [["2024-10-08-special", 2700, 3060]]; // Justin Brezhnev on the hackathons (45:00–51:00)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const meetingsDir = path.join(root, "data", "meetings");
const outDir = path.join(root, "data", "captions");

const meetings = fs
  .readdirSync(meetingsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(meetingsDir, f), "utf8")))
  .filter((m) => !m.sample);

const jobs = [];
for (const m of meetings) {
  const chunks = new Set();
  const add = (t) => {
    const c = Math.floor(t / CHUNK);
    for (let i = 0; i <= AFTER; i++) chunks.add(c + i);
  };
  for (const item of m.items) {
    add(item.start);
    for (const k of item.keyMoments ?? []) add(k.t);
  }
  for (const [id, from, to] of EXTRA) if (id === m.id) for (let t = from; t < to; t += CHUNK) add(t);
  const last = m.transcript.at(-1)?.end ?? 0;
  const list = [...chunks].filter((c) => c * CHUNK <= last).sort((a, b) => a - b);
  for (const lang of LANGS) jobs.push({ m, lang, chunks: list });
}

let done = 0;
let total = 0;
for (const job of jobs) {
  const file = path.join(outDir, job.m.id, `${job.lang}.json`);
  let stored = { meetingId: job.m.id, lang: job.lang, generatedAt: job.m.generatedAt, chunks: {} };
  try {
    const old = JSON.parse(fs.readFileSync(file, "utf8"));
    if (old.generatedAt === job.m.generatedAt) stored = old;
  } catch {
    /* first run for this meeting and language */
  }
  const todo = job.chunks.filter((c) => !stored.chunks[String(c)]);
  total += todo.length;
  console.log(`${job.m.id} ${job.lang}: ${job.chunks.length} chunks, ${todo.length} to translate`);

  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const chunk = queue.shift();
      const res = await fetch(`${BASE}/api/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: job.m.id, lang: job.lang, chunk }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.lines)) {
        console.error(`  chunk ${chunk} failed: HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
        continue;
      }
      stored.chunks[String(chunk)] = data.lines;
      done++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(stored.chunks).sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(file, JSON.stringify({ ...stored, chunks: sorted }, null, 2) + "\n", "utf8");
}
console.log(`done: ${done} of ${total} chunks translated`);
