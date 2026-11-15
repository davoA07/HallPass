# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "elevenlabs>=2.78",
#   "anthropic>=2.8",
#   "pydantic>=2.7",
#   "python-dotenv>=1.0",
# ]
# ///
"""
HallPass — meeting pipeline.

  video URL or local file
    -> 1. audio      (yt-dlp + FFmpeg)          pipeline/work/<id>/audio.mp3
    -> 2. transcript (ElevenLabs Scribe)        pipeline/work/<id>/scribe.json
    -> 3. segments   (speaker turns + times)    pipeline/work/<id>/segments.json
    -> 4. structure  (Claude: agenda items)     pipeline/work/<id>/structure.json
    -> 5. translate  (Claude, optional --langs) pipeline/work/<id>/translations.json
    -> data/meetings/<id>.json                  (the shared format, see docs/meeting-format.md)

Every step caches its output and is skipped on re-run; use --force STEP to redo
one step (and everything after it). Transcribe each meeting once to save credits.

Examples (run from the repo root):

  uv run pipeline/process_meeting.py --id 2026-11-04-regular \\
      --url "https://www.youtube.com/watch?v=XXXX" --start 00:42:00 --end 01:10:00 \\
      --title "City Council Regular Meeting" --date 2026-11-04 \\
      --agenda pipeline/agendas/2026-11-04.pdf --keyterms pipeline/keyterms.txt --langs hy,es

  uv run pipeline/process_meeting.py --id test-clip --file ~/Downloads/clip.mp4 --date 2026-11-04
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "pipeline" / "work"
OUT = ROOT / "data" / "meetings"
MEDIA = ROOT / "public" / "media"
STEPS = ["audio", "transcript", "segments", "structure", "translate"]

# Load keys and settings before reading them below. Variables already set in the
# shell win over the files, so `CLAUDE_MODEL=... uv run ...` overrides one run.
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
# Server-side refusal fallbacks: a declined request is re-run on a fallback model.
# Claude Haiku 5.5 has no fallback model, so its requests leave the parameter out
# and a declined request stays on Haiku.
FALLBACK = (
    {}
    if MODEL.startswith("claude-haiku")
    else dict(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
)

LANG_NAMES = {
    "en": "English", "hy": "Armenian", "es": "Spanish", "ko": "Korean",
    "tl": "Tagalog", "fa": "Persian",
}


def log(msg: str) -> None:
    print(f"[pipeline] {msg}", flush=True)


def parse_ts(value: str | None) -> float | None:
    """'1:02:03', '62:03', '3723' -> seconds."""
    if value is None:
        return None
    parts = [float(p) for p in value.split(":")]
    secs = 0.0
    for p in parts:
        secs = secs * 60 + p
    return secs


def hms(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def trim_args(start: float | None, end: float | None) -> list[str]:
    """ffmpeg input options that cut [start, end) out of the source (times in seconds)."""
    out: list[str] = []
    if start is not None:
        out += ["-ss", str(start)]
    if end is not None:
        out += ["-to", str(end)]
    return out


def audio_seconds(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(path)])
    return float(out.strip())


def run(cmd: list[str]) -> str:
    log("$ " + " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stdout + res.stderr)
        raise SystemExit(f"Command failed: {cmd[0]} (exit {res.returncode})")
    return res.stdout


# ---------------------------------------------------------------------------
# 1. Audio (and optional local video copy)
# ---------------------------------------------------------------------------

def step_audio(args, work: Path, meta: dict) -> None:
    audio = work / "audio.mp3"
    for tool in ("ffmpeg",) + (("yt-dlp",) if args.url else ()):
        if not shutil.which(tool):
            raise SystemExit(f"{tool} not found on PATH (brew install {tool})")

    start, end = parse_ts(args.start), parse_ts(args.end)

    if args.url:
        info = json.loads(run(["yt-dlp", "--dump-single-json", "--no-playlist", "--skip-download", args.url]))
        meta.update({
            "extractor": info.get("extractor_key") or info.get("extractor"),
            "video_id": info.get("id"),
            "webpage_url": info.get("webpage_url") or args.url,
            "title": info.get("title"),
            "upload_date": info.get("upload_date"),
            "duration": info.get("duration"),
        })
        section = []
        if start is not None or end is not None:
            section = ["--download-sections", f"*{hms(start or 0)}-{hms(end) if end else 'inf'}"]
        # Download the whole audio track, then cut locally. yt-dlp's section
        # downloads can stop early on long videos and still exit 0, which once
        # left a 1h26m file for a 4h40m request.
        for old in work.glob("source.*"):
            old.unlink()
        run(["yt-dlp", "--no-playlist", "-f", "bestaudio/best", "-o", str(work / "source.%(ext)s"), args.url])
        sources = sorted(work.glob("source.*"))
        if not sources:
            raise SystemExit("yt-dlp produced no audio file; check its output above.")
        run(["ffmpeg", "-y", "-loglevel", "error", *trim_args(start, end), "-i", str(sources[0]),
             "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", str(audio)])
        sources[0].unlink()
        if args.keep_video:
            MEDIA.mkdir(parents=True, exist_ok=True)
            run([
                "yt-dlp", "--no-playlist", "-f", "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
                "--merge-output-format", "mp4", *section,
                "-o", str(MEDIA / f"{args.id}.%(ext)s"), args.url,
            ])
    else:
        src = Path(args.file).expanduser()
        if not src.exists():
            raise SystemExit(f"File not found: {src}")
        trim = trim_args(start, end)
        run(["ffmpeg", "-y", "-loglevel", "error", *trim, "-i", str(src),
             "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", str(audio)])
        meta.update({"local_file": str(src)})
        if args.keep_video:
            MEDIA.mkdir(parents=True, exist_ok=True)
            run(["ffmpeg", "-y", "-loglevel", "error", *trim, "-i", str(src),
                 "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", str(MEDIA / f"{args.id}.mp4")])

    if not audio.exists():
        raise SystemExit("Audio extraction produced no audio.mp3; check yt-dlp output above.")

    # Stop on a short file instead of transcribing part of the meeting.
    got = audio_seconds(audio)
    full = meta.get("duration")
    want = (end if end is not None else full) - (start or 0) if (end is not None or full) else None
    if want and got < want * 0.98 - 5:
        audio.unlink()
        raise SystemExit(
            f"Audio is {hms(got)} long but {hms(want)} was requested; the download was cut short. "
            "Run the same command again."
        )
    meta.update({"clip_start": start or 0, "clip_end": end})
    (work / "meta.json").write_text(json.dumps(meta, indent=2))
    log(f"audio ready: {audio} ({audio.stat().st_size / 1e6:.1f} MB)")


# ---------------------------------------------------------------------------
# 2. Transcript (ElevenLabs Scribe)
# ---------------------------------------------------------------------------

def step_transcript(args, work: Path) -> None:
    from elevenlabs.client import ElevenLabs

    if not os.environ.get("ELEVENLABS_API_KEY"):
        raise SystemExit("Set ELEVENLABS_API_KEY in .env.local")
    keyterms: list[str] = []
    if args.keyterms:
        for line in Path(args.keyterms).read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                keyterms.append(line[:50])
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    kwargs = dict(
        model_id=args.scribe_model,
        diarize=True,
        timestamps_granularity="word",
        tag_audio_events=False,
    )
    if args.spoken_language:
        kwargs["language_code"] = args.spoken_language
    if args.num_speakers:
        kwargs["num_speakers"] = args.num_speakers
    if keyterms:
        kwargs["keyterms"] = keyterms[:1000]
    log(f"transcribing with {args.scribe_model} ({len(keyterms)} keyterms)… this can take a few minutes")
    with open(work / "audio.mp3", "rb") as f:
        result = client.speech_to_text.convert(file=f, **kwargs)
    data = result.model_dump() if hasattr(result, "model_dump") else result
    (work / "scribe.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    log(f"transcript: {len(data.get('words') or [])} words, language {data.get('language_code')}")


# ---------------------------------------------------------------------------
# 3. Segments: words -> speaker turns with absolute video times
# ---------------------------------------------------------------------------

def step_segments(work: Path, meta: dict) -> None:
    data = json.loads((work / "scribe.json").read_text())
    offset = float(meta.get("clip_start") or 0)
    segments: list[dict] = []
    cur: Optional[dict] = None

    def flush():
        nonlocal cur
        if cur and cur["text"].strip():
            cur["text"] = re.sub(r"\s+", " ", cur["text"]).strip()
            segments.append(cur)
        cur = None

    for w in data.get("words") or []:
        kind = w.get("type")
        if kind == "audio_event":
            continue
        if kind == "spacing":
            if cur:
                cur["text"] += w.get("text") or " "
            continue
        start = float(w["start"]) + offset
        end = float(w["end"]) + offset
        speaker = w.get("speaker_id") or "speaker_unknown"
        new_turn = (
            cur is None
            or speaker != cur["speaker"]
            or start - cur["end"] > 2.0
            or (end - cur["start"] > 45)
            or (end - cur["start"] > 20 and cur["text"].rstrip().endswith((".", "?", "!")))
        )
        if new_turn:
            flush()
            cur = {"speaker": speaker, "start": round(start, 2), "end": round(end, 2), "text": ""}
        cur["text"] += w.get("text") or ""
        cur["end"] = round(end, 2)
    flush()
    (work / "segments.json").write_text(json.dumps(segments, ensure_ascii=False, indent=1))
    log(f"segments: {len(segments)} speaker turns")


# ---------------------------------------------------------------------------
# 4. Structure (Claude): agenda items, plain-language summaries, votes
# ---------------------------------------------------------------------------

class Vote(BaseModel):
    name: str
    vote: Literal["yes", "no", "abstain", "absent", "unknown"]


class Outcome(BaseModel):
    kind: Literal["vote", "direction", "presentation", "public_comment", "discussion", "procedural", "other"]
    result: Optional[str]
    yes: Optional[int]
    no: Optional[int]
    abstain: Optional[int]
    votes: list[Vote]


class Moment(BaseModel):
    t: float
    label: str


class Item(BaseModel):
    agenda_number: Optional[str]
    title: str
    headline: str
    summary: str
    why_it_matters: str
    start: float
    end: float
    outcome: Outcome
    speakers: list[str]
    key_moments: list[Moment]
    topics: list[str]


class SpeakerInfo(BaseModel):
    speaker_id: str
    name: Optional[str]
    role: Optional[str]


class Structure(BaseModel):
    overview: str
    items: list[Item]
    speakers: list[SpeakerInfo]


STRUCTURE_SYSTEM = """You turn a city council meeting transcript into plain-language news for residents.

The transcript lines look like: [t=SECONDS] speaker_id: text. SECONDS is the position in the meeting video.

Produce:
- overview: 2–3 sentences on what the meeting decided, for a resident who skipped it.
- items: one per agenda item actually discussed in this transcript (skip roll call/pledge unless something happened). For each:
  - agenda_number from the agenda if given, else null. title: official-style title.
  - headline: a short news headline saying what HAPPENED (e.g. "Council approves…", "Council delays…"), not just the topic.
  - summary: 2–4 plain sentences (reading level of a 12-year-old; keep official terms but explain them).
  - why_it_matters: one sentence on what changes for residents. If nothing changes yet, say so.
  - start/end: seconds, taken from the [t=...] markers where the item begins and ends.
  - outcome: kind = vote | direction (council gave staff direction, no formal vote) | presentation | public_comment | discussion | procedural | other. result: plain words like "Approved 4–1" or null. yes/no/abstain counts and per-member votes ONLY if stated in the transcript; otherwise null / [] — never infer a vote.
  - speakers: speaker_ids who spoke during the item.
  - key_moments: 1–4 moments with the exact [t=...] value and a short label (e.g. "Vote: approved 4–1", "Resident raises parking concern").
  - topics: 2–6 lowercase keywords residents might search for.
- speakers: for every speaker_id, a name ONLY if stated in the meeting (e.g. "Thank you, Councilmember X", roll call), else null; a role (Mayor, Councilmember, City Clerk, City staff, Resident…) if clear, else null.

Accuracy over completeness: never invent facts, names, numbers or votes. If unsure, say less."""


def transcript_text(segments: list[dict]) -> str:
    return "\n".join(f"[t={int(s['start'])}] {s['speaker']}: {s['text']}" for s in segments)


def agenda_blocks(agenda_path: Optional[str]) -> list[dict]:
    if not agenda_path:
        return []
    p = Path(agenda_path).expanduser()
    if p.suffix.lower() == ".pdf":
        data = base64.standard_b64encode(p.read_bytes()).decode()
        return [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}},
            {"type": "text", "text": "Above: the official agenda for this meeting. Use its item numbers and titles."},
        ]
    return [{"type": "text", "text": f"<agenda>\n{p.read_text()}\n</agenda>"}]


def step_structure(args, work: Path) -> None:
    segments = json.loads((work / "segments.json").read_text())
    if not segments:
        raise SystemExit("No transcript segments; check the audio.")
    client = anthropic.Anthropic(base_url=os.environ.get("CLAUDE_API_BASE_URL") or "https://api.anthropic.com")
    content = agenda_blocks(args.agenda) + [{
        "type": "text",
        "text": f"Meeting: {args.title} — {args.body}, {args.date}\n\n<transcript>\n{transcript_text(segments)}\n</transcript>",
    }]
    log(f"structuring with {MODEL}…")
    response = client.beta.messages.parse(
        model=MODEL,
        # Long meetings (2+ hours, many items) need room for reasoning plus the JSON;
        # the explicit timeout lets the SDK accept a large max_tokens without streaming.
        max_tokens=48000,
        timeout=1800.0,
        system=STRUCTURE_SYSTEM,
        messages=[{"role": "user", "content": content}],
        output_format=Structure,
        output_config={"effort": "high"},
        **FALLBACK,
    )
    if response.stop_reason in ("refusal", "max_tokens") or response.parsed_output is None:
        raise SystemExit(f"Structuring failed (stop_reason={response.stop_reason}). Try a shorter clip.")
    s: Structure = response.parsed_output

    lo, hi = segments[0]["start"], segments[-1]["end"]
    clamp = lambda t: round(min(max(float(t), lo), hi), 1)  # noqa: E731
    items = []
    for n, it in enumerate(sorted(s.items, key=lambda i: i.start), start=1):
        items.append({
            "id": f"item-{n}",
            "agendaNumber": it.agenda_number,
            "title": it.title,
            "headline": it.headline,
            "summary": it.summary,
            "whyItMatters": it.why_it_matters,
            "start": clamp(it.start),
            "end": clamp(max(it.end, it.start)),
            "outcome": it.outcome.model_dump(),
            "speakers": it.speakers,
            "keyMoments": [{"t": clamp(m.t), "label": m.label} for m in it.key_moments],
            "topics": [t.lower() for t in it.topics],
        })
    known = {seg["speaker"] for seg in segments}
    named = {sp.speaker_id: sp for sp in s.speakers}
    speakers = [
        {"id": sid, "name": named[sid].name if sid in named else None, "role": named[sid].role if sid in named else None}
        for sid in sorted(known)
    ]
    out = {"overview": s.overview, "items": items, "speakers": speakers}
    (work / "structure.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    log(f"structure: {len(items)} agenda items, usage {response.usage.input_tokens} in / {response.usage.output_tokens} out")


# ---------------------------------------------------------------------------
# 5. Translate (Claude)
# ---------------------------------------------------------------------------

class ItemTr(BaseModel):
    id: str
    headline: str
    summary: str
    why_it_matters: str
    result: Optional[str]


class MeetingTr(BaseModel):
    overview: str
    items: list[ItemTr]


def step_translate(args, work: Path) -> None:
    langs = [l.strip() for l in (args.langs or "").split(",") if l.strip() and l.strip() != "en"]
    path = work / "translations.json"
    existing = json.loads(path.read_text()) if path.exists() else {}
    if not langs:
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=1))
        return
    structure = json.loads((work / "structure.json").read_text())
    payload = {
        "overview": structure["overview"],
        "items": [{"id": i["id"], "headline": i["headline"], "summary": i["summary"],
                   "why_it_matters": i["whyItMatters"], "result": i["outcome"].get("result")}
                  for i in structure["items"]],
    }
    client = anthropic.Anthropic(base_url=os.environ.get("CLAUDE_API_BASE_URL") or "https://api.anthropic.com")
    for lang in langs:
        if lang in existing:
            log(f"translation {lang}: cached")
            continue
        name = LANG_NAMES.get(lang, lang)
        log(f"translating to {name}…")
        response = client.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            system=("Translate these city council meeting summaries for residents. Use plain, everyday language. "
                    "Keep names, numbers, vote counts and agenda numbers exactly. Keep each id unchanged. "
                    "Translate only; add nothing."),
            messages=[{"role": "user", "content": f"Target language: {name} ({lang})\n\n{json.dumps(payload, ensure_ascii=False)}"}],
            output_format=MeetingTr,
            output_config={"effort": "medium"},
            **FALLBACK,
        )
        if response.parsed_output is None or response.stop_reason in ("refusal", "max_tokens"):
            log(f"translation {lang} failed (stop_reason={response.stop_reason}); skipping")
            continue
        tr: MeetingTr = response.parsed_output
        existing[lang] = {
            "overview": tr.overview,
            "items": {i.id: {"headline": i.headline, "summary": i.summary, "whyItMatters": i.why_it_matters,
                             "result": i.result}
                      for i in tr.items},
        }
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=1))


# ---------------------------------------------------------------------------
# Assemble data/meetings/<id>.json
# ---------------------------------------------------------------------------

ISO3_TO_1 = {"eng": "en", "hye": "hy", "arm": "hy", "spa": "es", "kor": "ko", "tgl": "tl", "fil": "tl",
             "fas": "fa", "per": "fa", "rus": "ru", "zho": "zh", "chi": "zh"}


def iso639_1(code: Optional[str]) -> str:
    code = (code or "").lower()
    if len(code) == 2:
        return code
    return ISO3_TO_1.get(code, "en")


def video_source(args, meta: dict) -> dict:
    if args.keep_video and (MEDIA / f"{args.id}.mp4").exists():
        # The local copy starts at the clip start, so the player subtracts this offset.
        return {"kind": "file", "src": f"/media/{args.id}.mp4", "offset": meta.get("clip_start") or 0}
    extractor = (meta.get("extractor") or "").lower()
    if extractor == "youtube" and meta.get("video_id"):
        return {"kind": "youtube", "youtubeId": meta["video_id"]}
    if args.video_url_template:
        return {"kind": "link", "urlTemplate": args.video_url_template}
    if meta.get("webpage_url"):
        return {"kind": "link", "urlTemplate": meta["webpage_url"]}
    return {"kind": "none"}


def assemble(args, work: Path, meta: dict) -> Path:
    structure = json.loads((work / "structure.json").read_text())
    segments = json.loads((work / "segments.json").read_text())
    tr_path = work / "translations.json"
    translations = json.loads(tr_path.read_text()) if tr_path.exists() else {}
    scribe = json.loads((work / "scribe.json").read_text())
    date = args.date
    if not date and meta.get("upload_date"):
        d = meta["upload_date"]
        date = f"{d[:4]}-{d[4:6]}-{d[6:]}"
    meeting = {
        "id": args.id,
        "title": args.title or meta.get("title") or "City Council Meeting",
        "body": args.body,
        "date": date or datetime.now(timezone.utc).date().isoformat(),
        "source": {
            "videoUrl": args.url or meta.get("webpage_url"),
            "agendaUrl": args.agenda_url,
            "minutesUrl": args.minutes_url,
        },
        "video": video_source(args, meta),
        "clip": {"start": meta.get("clip_start") or 0, "end": meta.get("clip_end")},
        "language": iso639_1(scribe.get("language_code")),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "aiGenerated": True,
        "reviewed": False,
        "overview": structure["overview"],
        "items": structure["items"],
        "speakers": structure["speakers"],
        "transcript": segments,
        "translations": translations,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{args.id}.json"
    path.write_text(json.dumps(meeting, ensure_ascii=False, indent=1))
    return path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--id", required=True, help="slug for the meeting, e.g. 2026-11-04-regular")
    src = p.add_mutually_exclusive_group()
    src.add_argument("--url", help="meeting video URL (anything yt-dlp supports)")
    src.add_argument("--file", help="local audio/video file instead of --url")
    p.add_argument("--start", help="clip start, e.g. 00:42:00 (process a segment only)")
    p.add_argument("--end", help="clip end, e.g. 01:10:00")
    p.add_argument("--title", default="City Council Meeting")
    p.add_argument("--body", default="Glendale City Council")
    p.add_argument("--date", help="YYYY-MM-DD (defaults to the video's upload date)")
    p.add_argument("--agenda", help="agenda as .pdf, .txt or .md — improves item titles and numbers")
    p.add_argument("--agenda-url", help="public link to the agenda, shown on the meeting page")
    p.add_argument("--minutes-url", help="public link to the minutes")
    p.add_argument("--keyterms", help="file with one name/term per line to help transcription")
    p.add_argument("--spoken-language", help="ISO code if known, e.g. en")
    p.add_argument("--num-speakers", type=int, help="max speakers, helps diarization")
    p.add_argument("--scribe-model", default="scribe_v2")
    p.add_argument("--langs", default="", help="pre-translate summaries, e.g. hy,es,ko")
    p.add_argument("--keep-video", action="store_true", help="save an mp4 to public/media for offline playback")
    p.add_argument("--video-url-template", help="external player URL with {t} for seconds, if not YouTube")
    p.add_argument("--force", choices=STEPS, help="redo this step and all later steps")
    args = p.parse_args()

    work = WORK / args.id
    work.mkdir(parents=True, exist_ok=True)
    meta_path = work / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    redo = set(STEPS[STEPS.index(args.force):]) if args.force else set()

    def needed(step: str, output: str) -> bool:
        return step in redo or not (work / output).exists()

    if needed("audio", "audio.mp3"):
        if not (args.url or args.file):
            raise SystemExit("Give --url or --file for the first run")
        step_audio(args, work, meta)
    if needed("transcript", "scribe.json"):
        step_transcript(args, work)
    if needed("segments", "segments.json"):
        step_segments(work, meta)
    if needed("structure", "structure.json"):
        step_structure(args, work)
    if args.langs or "translate" in redo:
        if "translate" in redo and (work / "translations.json").exists():
            (work / "translations.json").unlink()
        step_translate(args, work)
    path = assemble(args, work, meta)
    log(f"wrote {path.relative_to(ROOT)} — review the summaries against the video before the demo,")
    log("then set \"reviewed\": true in that file.")


if __name__ == "__main__":
    main()
