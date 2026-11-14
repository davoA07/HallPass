"use client";

import Link from "next/link";
import { LANGUAGES } from "@/lib/languages";
import { useAssistant } from "./AssistantProvider";
import { CapitolIcon, ChatIcon } from "./icons";

export function SiteHeader() {
  const { lang, setLang, tr, setOpen, setTab } = useAssistant();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
            <CapitolIcon width={18} height={18} />
          </span>
          <span>HallPass</span>
        </Link>
        <div className="ms-auto flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => {
              setTab("ask");
              setOpen(true);
            }}
            className="hidden h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink sm:flex"
          >
            <ChatIcon width={16} height={16} />
            {tr("askTab")}
          </button>
        </div>
      </div>
    </header>
  );
}
