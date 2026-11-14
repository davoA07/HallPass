#!/usr/bin/env python3
"""
Create or update the HallPass voice agent in ElevenLabs from the files in agent/:

  system-prompt.md   the agent's instructions
  client-tools.json  the three tools the website runs (names must match VoiceControl.tsx)

Run from the repo root:

  python3 agent/sync_agent.py

It uses the ElevenLabs CLI's sign-in (`npx @elevenlabs/cli@1.11.0 auth login`).
Safe to re-run after editing the prompt or tools: it updates the same agent and
tools (ids kept in agent/elevenlabs.json) instead of creating new ones, and it
writes ELEVENLABS_AGENT_ID into .env.local.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT_DIR = ROOT / "agent"
IDS_FILE = AGENT_DIR / "elevenlabs.json"
ENV_FILE = ROOT / ".env.local"
# On Windows npx is npx.cmd, which subprocess can't find by the bare name;
# shutil.which resolves it (and npx.ps1 is often blocked by execution policy).
CLI = [shutil.which("npx") or "npx", "-y", "@elevenlabs/cli@1.11.0"]

NAME = "HallPass"
# Armenian needs one of ElevenLabs' newer voice models (v3 / v4 families).
VOICE_MODEL = "eleven_v3_conversational"

# The greeting in each language the agent can switch to. ElevenLabs uses "fil" for Tagalog.
# Have native speakers check these before the demo.
FIRST_MESSAGES = {
    "en": "Hi! I'm HallPass. I can tell you what the city council decided, in your language, "
          "and help you speak up. What would you like to know?",
    "hy": "Բարև։ Ես HallPass-ն եմ։ Կարող եմ ձեր լեզվով պատմել, թե ինչ որոշեց քաղաքային խորհուրդը, "
          "և օգնել ձեզ արտահայտվել։ Ի՞նչ կուզենայիք իմանալ։",
    "es": "¡Hola! Soy HallPass. Puedo contarte en tu idioma lo que decidió el concejo municipal "
          "y ayudarte a participar. ¿Qué te gustaría saber?",
    "ko": "안녕하세요! 저는 HallPass입니다. 시의회가 무엇을 결정했는지 여러분의 언어로 알려 드리고, "
          "의견을 내는 것도 도와드릴게요. 무엇이 궁금하신가요?",
    "fa": "سلام! من HallPass هستم. می‌توانم به زبان شما بگویم شورای شهر چه تصمیمی گرفت "
          "و کمکتان کنم نظرتان را بگویید. چه چیزی می‌خواهید بدانید؟",
    "fil": "Kumusta! Ako ang HallPass. Masasabi ko sa iyong wika kung ano ang napagpasyahan "
           "ng konseho ng lungsod, at matutulungan kitang magsalita. Ano ang gusto mong malaman?",
}


def cli(*args: str, body: dict | None = None):
    cmd = CLI + list(args) + ["--format", "json"]
    if body is not None:
        cmd += ["--json", "-"]
    res = subprocess.run(
        cmd,
        input=json.dumps(body) if body is not None else None,
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if res.returncode != 0:
        sys.exit(f"elevenlabs {' '.join(args)} failed:\n{(res.stderr or res.stdout).strip()}")
    out = res.stdout.strip()
    return json.loads(out) if out else None


def load_ids() -> dict:
    return json.loads(IDS_FILE.read_text()) if IDS_FILE.exists() else {}


def sync_tools(saved: dict) -> dict[str, str]:
    tools = json.loads((AGENT_DIR / "client-tools.json").read_text())
    ids: dict[str, str] = {}
    for tool in tools:
        name = tool["name"]
        tool_id = saved.get("tool_ids", {}).get(name)
        if tool_id:
            cli("agents", "tools", "update", "--tool-id", tool_id, body={"tool_config": tool})
            print(f"updated tool  {name}")
        else:
            res = cli("agents", "tools", "create", "--no-extract", body={"tool_config": tool})
            tool_id = res["id"] if isinstance(res, dict) else str(res)
            print(f"created tool  {name}")
        ids[name] = tool_id
    return ids


def agent_body(tool_ids: dict[str, str]) -> dict:
    return {
        "name": NAME,
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGES["en"],
                "language": "en",
                "prompt": {
                    "prompt": (AGENT_DIR / "system-prompt.md").read_text(),
                    "tool_ids": list(tool_ids.values()),
                    "built_in_tools": {
                        "language_detection": {
                            "type": "system",
                            "name": "language_detection",
                            "description": "",
                            "params": {"system_tool_type": "language_detection"},
                        }
                    },
                },
            },
            "tts": {"model_id": VOICE_MODEL},
            # Ignore voices other than the resident's (people talking nearby, a TV),
            # which otherwise get transcribed as questions and interrupt answers.
            "vad": {"background_voice_detection": True},
            "language_presets": {
                code: {"overrides": {"agent": {"first_message": text}}}
                for code, text in FIRST_MESSAGES.items()
                if code != "en"
            },
        },
        "platform_settings": {
            # Private agent: the website's /api/agent-session mints short-lived tokens.
            "auth": {"enable_auth": True},
            # The website starts each call in the resident's picked language
            # (VoiceControl.tsx passes overrides.agent.language), which picks the
            # matching greeting from language_presets above.
            "overrides": {"conversation_config_override": {"agent": {"language": True}}},
        },
    }


def write_env_agent_id(agent_id: str) -> None:
    text = ENV_FILE.read_text() if ENV_FILE.exists() else ""
    line = f"ELEVENLABS_AGENT_ID={agent_id}"
    if re.search(r"^ELEVENLABS_AGENT_ID=.*$", text, re.M):
        text = re.sub(r"^ELEVENLABS_AGENT_ID=.*$", line, text, count=1, flags=re.M)
    else:
        text = (text.rstrip("\n") + "\n" if text else "") + line + "\n"
    ENV_FILE.write_text(text)


def main() -> None:
    saved = load_ids()
    tool_ids = sync_tools(saved)
    body = agent_body(tool_ids)
    agent_id = saved.get("agent_id")
    if agent_id:
        cli("agents", "update", "--agent-id", agent_id, body=body)
        print(f"updated agent {NAME} ({agent_id})")
    else:
        res = cli("agents", "create", "--no-extract", body=body)
        agent_id = res["agent_id"] if isinstance(res, dict) else str(res)
        print(f"created agent {NAME} ({agent_id})")
    IDS_FILE.write_text(json.dumps({"agent_id": agent_id, "tool_ids": tool_ids}, indent=2) + "\n")
    write_env_agent_id(agent_id)

    # Read the agent back and check the parts the website depends on.
    agent = cli("agents", "get", "--agent-id", agent_id)
    cc = agent["conversation_config"]
    prompt = cc["agent"]["prompt"]
    checks = {
        "prompt matches system-prompt.md": prompt.get("prompt") == body["conversation_config"]["agent"]["prompt"]["prompt"],
        "3 client tools attached": sorted(prompt.get("tool_ids") or []) == sorted(tool_ids.values()),
        "language detection on": bool((prompt.get("built_in_tools") or {}).get("language_detection")),
        f"voice model {VOICE_MODEL}": (cc.get("tts") or {}).get("model_id") == VOICE_MODEL,
        "background voice detection on": bool((cc.get("vad") or {}).get("background_voice_detection")),
        "languages: " + ", ".join(sorted(cc.get("language_presets") or {})): set(cc.get("language_presets") or {}) >= set(FIRST_MESSAGES) - {"en"},
        "authentication required": bool(((agent.get("platform_settings") or {}).get("auth") or {}).get("enable_auth")),
        "per-call language override allowed": bool(
            ((((agent.get("platform_settings") or {}).get("overrides") or {}).get("conversation_config_override") or {})
             .get("agent") or {}).get("language")
        ),
    }
    for label, ok in checks.items():
        print(f"  {'ok ' if ok else 'BAD'} {label}")
    if not all(checks.values()):
        sys.exit("Some settings did not stick; check the agent in the ElevenLabs dashboard.")
    print("ELEVENLABS_AGENT_ID written to .env.local")


if __name__ == "__main__":
    main()
