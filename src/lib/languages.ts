export interface Language {
  code: string; // ISO 639-1
  english: string; // name in English (used in prompts)
  native: string; // name in the language itself (shown in the picker)
  locale: string; // for date formatting
  rtl?: boolean;
}

/**
 * Languages offered in the picker. Before quoting any of these as
 * "the languages Glendale speaks" in the pitch, verify the numbers.
 */
export const LANGUAGES: Language[] = [
  { code: "en", english: "English", native: "English", locale: "en-US" },
  { code: "hy", english: "Armenian", native: "Հայերեն", locale: "hy-AM" },
  { code: "es", english: "Spanish", native: "Español", locale: "es-US" },
  { code: "ko", english: "Korean", native: "한국어", locale: "ko-KR" },
  { code: "tl", english: "Tagalog", native: "Tagalog", locale: "fil-PH" },
  { code: "fa", english: "Persian", native: "فارسی", locale: "fa-IR", rtl: true },
];

export function getLanguage(code: string | null | undefined): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function isSupportedLanguage(code: unknown): code is string {
  return typeof code === "string" && LANGUAGES.some((l) => l.code === code);
}
