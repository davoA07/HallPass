"use client";

import { useAssistant } from "./AssistantProvider";

export function SiteFooter() {
  const { tr } = useAssistant();
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">{tr("footer")}</footer>
  );
}
