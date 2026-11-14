# ElevenLabs voice agent setup

The website already handles the voice session and the three client tools. You only
need to create the agent once in the ElevenLabs dashboard (about 5 minutes).

1. **Create an agent** (ElevenLabs → Agents → New agent → blank).
2. **System prompt:** paste [`system-prompt.md`](system-prompt.md).
3. **First message:** something short, e.g. "Hi! I can tell you what the city council decided, in your language. What would you like to know?"
4. **Language:** default English. Add Armenian, Spanish and any others you want under *additional languages*, and turn on the **language detection** system tool so the agent switches when the resident does.
   - Verify Armenian end to end before the demo: speech-to-text and text-to-speech list Armenian, but real-time agent support (and which variety, Eastern or Western) is not confirmed.
5. **Client tools:** add the three tools in [`client-tools.json`](client-tools.json) (Tools → Add tool → Client). Same names and parameter names; tick *Wait for response*. The names must match `src/components/VoiceControl.tsx` exactly.
6. **Security:** keep the agent private (authentication on). The app's `/api/agent-session` route gets a short-lived conversation token with your API key, so the key never reaches the browser.
7. Copy the agent id into `.env.local` as `ELEVENLABS_AGENT_ID`, with `ELEVENLABS_API_KEY`.

## How it fits together

```
Resident speaks ──► ElevenLabs agent (speech in/out, language switching)
                        │ calls client tool in the browser
                        ▼
              ask_city_records(question)
                        │ POST /api/ask
                        ▼
              Claude reads all processed meetings, answers in the resident's
              language with [t=SECONDS] citations, or says "I don't know"
                        │
                        ▼
              Answer goes back to the agent (spoken) + citation cards on screen
              that jump to the exact moment in the video
```

Text mode uses the same `/api/ask` route, so the demo still works if the
microphone, the agent, or the venue Wi-Fi fails.
