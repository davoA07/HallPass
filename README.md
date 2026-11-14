# Ask City Hall

**City Hall, in your language, with receipts.**

A voice assistant that explains what the city council decided, in the resident's
own language, and then helps them take part in the next meeting. Built for
JEWEL CITY HACKS 6.0 (Glendale Community College, November 14, 2026).

1. **Watch:** every council meeting is a video in a YouTube-style feed, split into plain-language chapters (one per agenda item), translated on request.
2. **Ask:** tap the mic (or type) and ask "What did the council decide about parking?" Answers come only from the meeting records.
3. **Receipts:** every answer plays the most relevant meeting video at the exact moment, with other moments one tap away. If the records don't say, it says it doesn't know.
4. **Act:** draft a public comment in your language with an English translation beside it. You review, edit and send it yourself. The app never submits anything.

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev                  # http://localhost:3000
```

The site runs without any keys using a clearly labeled fictional sample meeting
(`data/meetings/sample-meeting.json`); it hides itself as soon as one real meeting
is processed. Asking questions, translation and comment drafts need
`ANTHROPIC_API_KEY`. Voice needs `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID`
(see [`agent/README.md`](agent/README.md)); without them the panel falls back to text.

## Process a real meeting

Needs `yt-dlp`, `ffmpeg` and [`uv`](https://docs.astral.sh/uv/) (`brew install yt-dlp ffmpeg uv`).
Update yt-dlp right before use: `brew upgrade yt-dlp`.

```bash
uv run pipeline/process_meeting.py --id 2026-11-04-regular \
  --url "<meeting video URL>" --start 00:42:00 --end 01:10:00 \
  --title "City Council Regular Meeting" --date 2026-11-04 \
  --agenda path/to/agenda.pdf --agenda-url "<public agenda link>" \
  --keyterms pipeline/keyterms.txt --langs hy,es --keep-video
```

- Each step caches in `pipeline/work/<id>/`; re-running skips finished steps, so each meeting is transcribed once. `--force structure` redoes summaries without paying for transcription again.
- `--start/--end` process a clean 20–30 minute segment (best for the demo). Times in the output stay relative to the full video.
- `--keep-video` saves an mp4 to `public/media/` so the demo plays offline.
- `--keyterms`: copy `pipeline/keyterms.example.txt` and add councilmember and street names from the official roster and agenda.
- Output: `data/meetings/<id>.json` in the [shared format](docs/meeting-format.md). Check the summaries against the video, then set `"reviewed": true`.

## How it works

```
meeting video ─ yt-dlp/FFmpeg ─► audio ─ ElevenLabs Scribe ─► words + speakers + times
   ─► speaker turns ─ Claude ─► agenda items, headlines, votes, key moments ─► data/meetings/*.json
                                                                                  │
 Next.js site ◄───────────────────────────────────────────────────────────────────┘
   /                start screen (talk button, question box) → player + chat; meeting video feed below
   /meetings/[id]   same screen with that meeting already playing (?t=SECONDS jumps)
   /api/ask         Claude answers from all meeting records, cites [t=SECONDS], or says "I don't know"
   /api/draft-comment, /api/translate, /api/translate-meeting
   /api/agent-session  short-lived ElevenLabs token for the voice agent
 Voice agent (ElevenLabs) ── client tools in the browser: ask_city_records, show_video_moment, draft_public_comment
```

No database: processed meetings are JSON files. Every model call opts into
server-side refusal fallbacks (`fallbacks: "default"`), except on Claude Haiku 5.5
(`CLAUDE_MODEL=claude-haiku-5-5`), which has no fallback model.

| Path | What |
|---|---|
| `pipeline/process_meeting.py` | download → transcribe → structure → translate |
| `src/lib/types.ts`, `docs/meeting-format.md` | the shared meeting JSON contract |
| `src/lib/ai.ts` | prompts and Claude calls (answers, drafts, translation) |
| `src/components/HomeView.tsx`, `Stage.tsx`, `VideoFeed.tsx`, `VideoPlayer.tsx` | start screen, player + chapters, video feed, timestamp seeking |
| `src/components/ChatPanel.tsx`, `VoiceProvider.tsx`, `CommentDrafter.tsx` | chat, voice agent + talk button, write to the council |
| `src/lib/i18n.ts` | interface strings (have native speakers check them) |
| `agent/` | ElevenLabs agent prompt, tool definitions, setup steps |

## Team split

| Person | Owns | Start here |
|---|---|---|
| A: Data pipeline | 2–3 meetings processed with timestamps | `pipeline/`, `docs/meeting-format.md` |
| B: Voice agent | agent prompt, tools, language switching, 10 test questions | `agent/`, `src/lib/ai.ts` |
| C: Website | meeting page, player, panel polish | `src/components/` |
| D: Pitch and testing | demo script, rehearsals, backup recording, credits | this README |

## Before the demo: verify

- [ ] Hackathon rules on pre-existing code and when coding may start
- [ ] The city's video source works with yt-dlp, and the audio extracts cleanly
- [ ] Transcription quality on a 5–10 minute clip: names, timestamps, speaker labels
- [ ] Armenian in the live voice agent (and which variety: Eastern or Western)
- [ ] How the city accepts public comments (then set `NEXT_PUBLIC_PUBLIC_COMMENT_URL`)
- [ ] Free credit limits for transcription, the agent and speech
- [ ] Any population or language statistics used in the pitch
- [ ] Native speakers checked the interface strings in `src/lib/i18n.ts`
- [ ] Demo meetings reviewed by hand and marked `"reviewed": true`
- [ ] Text mode tested as the fallback; backup demo video recorded

## Credits

- [ElevenLabs](https://elevenlabs.io) Scribe (speech-to-text) and Agents (voice), via [`@elevenlabs/react`](https://github.com/elevenlabs/packages) and [`elevenlabs-python`](https://github.com/elevenlabs/elevenlabs-python)
- [Claude](https://www.anthropic.com/claude) via the Anthropic SDKs, for summaries, answers, translation and comment drafts
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org) for audio
- [Next.js](https://nextjs.org), [Tailwind CSS](https://tailwindcss.com)
- Ideas from [OpenCouncil](https://github.com/schemalabz/opencouncil) and [Council Data Project](https://councildataproject.org) (read for ideas; no code used)

Not an official city service. Summaries are AI-generated from public meeting
recordings; every answer links to the video so residents can check it.
