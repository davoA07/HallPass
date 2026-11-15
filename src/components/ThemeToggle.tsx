"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY, type Theme } from "@/lib/theme";
import { useAssistant } from "./AssistantProvider";
import { MoonIcon, SunIcon } from "./icons";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    media.removeEventListener("change", cb);
  };
}

export function ThemeToggle() {
  const { tr } = useAssistant();
  // null on the server and during hydration, so the button renders the same markup in both.
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);

  // React's dev remount resets <html> attributes; put the saved choice back before paint.
  useLayoutEffect(() => {
    const t = saved();
    if (t) document.documentElement.setAttribute("data-theme", t);
    listeners.forEach((cb) => cb());
  }, []);

  function toggle() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    listeners.forEach((cb) => cb());
  }

  const label = theme === "dark" ? tr("lightMode") : tr("darkMode");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-ink transition hover:border-accent hover:text-accent"
    >
      {theme === "dark" ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
    </button>
  );
}
