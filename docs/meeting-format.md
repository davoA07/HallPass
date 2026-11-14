# Processed meeting format

One JSON file per meeting in `data/meetings/<id>.json`. The pipeline writes it,
the website and the voice agent read it. TypeScript source of truth:
[`src/lib/types.ts`](../src/lib/types.ts). If you change a field, change both.

**All times are seconds from the start of the source video**, even when only a
clip was transcribed, so `/meetings/<id>?t=754` always lands on the right moment.

```jsonc
{
  "id": "2026-11-04-regular",            // url slug
  "title": "City Council Regular Meeting",
  "body": "Glendale City Council",
  "date": "2026-11-04",
  "sample": false,                        // true only for fictional fixtures (hidden once real meetings exist)
  "source": { "videoUrl": "…", "agendaUrl": "…", "minutesUrl": null },
  "video": { "kind": "youtube", "youtubeId": "…" },
  //   or { "kind": "file", "src": "/media/<id>.mp4", "offset": 2520 }  (local copy of a clip)
  //   or { "kind": "link", "urlTemplate": "https://…?t={t}" }        (external player)
  //   or { "kind": "none" }
  "clip": { "start": 2520, "end": 4200 },  // part of the video that was processed
  "language": "en",                       // spoken language
  "generatedAt": "2026-11-14T11:02:00Z",
  "aiGenerated": true,
  "reviewed": false,                      // set true by hand after checking against the video
  "overview": "2–3 plain sentences on what was decided.",
  "items": [
    {
      "id": "item-1",
      "agendaNumber": "8a",               // or null
      "title": "Official-style title",
      "headline": "Council approves …",   // says what HAPPENED
      "summary": "2–4 plain sentences.",
      "whyItMatters": "One sentence for residents.",
      "start": 2531.2, "end": 3010.0,
      "outcome": {
        "kind": "vote",                    // vote | direction | presentation | public_comment | discussion | procedural | other
        "result": "Approved 4–1",          // or null
        "yes": 4, "no": 1, "abstain": 0,   // null unless stated in the meeting
        "votes": [{ "name": "…", "vote": "yes" }]  // [] unless stated
      },
      "speakers": ["speaker_0", "speaker_2"],
      "keyMoments": [{ "t": 2990.5, "label": "Vote: approved 4–1" }],
      "topics": ["parking", "permits"]
    }
  ],
  "speakers": [
    { "id": "speaker_0", "name": null, "role": "Mayor" }   // name only if said in the meeting
  ],
  "transcript": [
    { "speaker": "speaker_0", "start": 2531.2, "end": 2544.9, "text": "…" }
  ],
  "translations": {
    "hy": {
      "overview": "…",
      "items": { "item-1": { "headline": "…", "summary": "…", "whyItMatters": "…", "result": "…" } }
    }
  }
}
```

## Rules the pipeline follows (and hand edits should too)

- Never guess names or votes. `name: null` and empty `votes` are fine.
- `headline` says what happened ("Council delays …"), not just the topic.
- Keep `start`/`end` and `keyMoments[].t` inside the transcript's time range.
- After a person checks a meeting against the video, set `"reviewed": true`; the
  page then shows "checked by a person" instead of the AI notice.
