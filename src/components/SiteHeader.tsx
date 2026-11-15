"use client";

import Link from "next/link";
import { LANGUAGES } from "@/lib/languages";
import { useAssistant } from "./AssistantProvider";
import { CapitolIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { useVoice } from "./VoiceProvider";

export function SiteHeader() {
  const { lang, setLang, tr, reset } = useAssistant();
  const voice = useVoice();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          onClick={() => {
            if (voice.connected) voice.stop();
            reset();
          }}
          className="flex items-center gap-2 font-semibold tracking-tight text-ink"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
            <CapitolIcon width={18} height={18} />
          </span>
          <span>HallPass</span>
        </Link>
        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          <label className="sr-only" htmlFor="lang-select">
            {tr("language")}
          </label>
          <select
            id="lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { tr } = useAssistant();
  return <footer className="px-4 pb-8 pt-2 text-center text-xs text-muted">{tr("footer")}</footer>;
}
