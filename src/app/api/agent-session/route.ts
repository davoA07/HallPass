/**
 * Gives the browser what it needs to start an ElevenLabs voice session.
 * - With ELEVENLABS_API_KEY: a short-lived WebRTC conversation token (private agent).
 * - Without it: the agent id (only works if the agent is public).
 * - Neither: 503, and the UI falls back to text mode.
 */
export async function POST() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId) {
    return Response.json({ error: "Voice agent not configured (ELEVENLABS_AGENT_ID)." }, { status: 503 });
  }
  if (!apiKey) return Response.json({ agentId });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" },
  );
  if (!res.ok) {
    console.error("ElevenLabs token error", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "Could not start a voice session." }, { status: 502 });
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) return Response.json({ error: "Could not start a voice session." }, { status: 502 });
  return Response.json({ conversationToken: data.token });
}
