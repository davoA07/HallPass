/**
 * Shared meeting format. This is the contract between the data pipeline
 * (pipeline/process_meeting.py writes it) and the website + agent (read it).
 * Human-readable version: docs/meeting-format.md. Change both together.
 *
 * All times are seconds from the start of the SOURCE VIDEO (not the clip),
 * so a link like /meetings/<id>?t=754 always lands on the right moment.
 */

export type VideoSource =
  | { kind: "youtube"; youtubeId: string }
  // e.g. "/media/2026-11-04.mp4" served from public/. offset = source-video time
  // at which this file starts (when only a clip was saved).
  | { kind: "file"; src: string; offset?: number }
  | { kind: "link"; urlTemplate: string } // external player; "{t}" is replaced with seconds
  | { kind: "none" };

export type VoteChoice = "yes" | "no" | "abstain" | "absent" | "unknown";

export type OutcomeKind =
  | "vote"
  | "direction"
  | "presentation"
  | "public_comment"
  | "discussion"
  | "procedural"
  | "other";

export interface Outcome {
  kind: OutcomeKind;
  /** Plain-language result, e.g. "Approved 4–1". Null when nothing was decided. */
  result: string | null;
  yes: number | null;
  no: number | null;
  abstain: number | null;
  votes: { name: string; vote: VoteChoice }[];
}

export interface AgendaItem {
  id: string; // "item-1", stable within a meeting
  agendaNumber: string | null; // "8a" if the agenda numbers it
  title: string; // official-style title
  headline: string; // plain-language news headline
  summary: string; // 2–4 plain-language sentences
  whyItMatters: string; // one sentence for residents
  start: number;
  end: number;
  outcome: Outcome;
  speakers: string[]; // speaker ids (see Meeting.speakers)
  keyMoments: { t: number; label: string }[];
  topics: string[]; // lowercase keywords, e.g. ["parking", "housing"]
}

export interface Speaker {
  id: string; // "speaker_0" from diarization
  name: string | null; // only if stated in the meeting; never guessed
  role: string | null; // "Mayor", "Councilmember", "Resident", "City staff"…
}

export interface TranscriptSegment {
  speaker: string; // speaker id
  start: number;
  end: number;
  text: string;
}

export interface ItemTranslation {
  headline: string;
  summary: string;
  whyItMatters: string;
  result?: string | null; // translated Outcome.result
}

export interface MeetingTranslation {
  overview: string;
  items: Record<string, ItemTranslation>; // keyed by AgendaItem.id
}

export interface Meeting {
  id: string; // url slug, e.g. "2026-11-04-regular"
  title: string;
  body: string; // "Glendale City Council"
  date: string; // ISO date "2026-11-04"
  /** true for fictional fixture data. Hidden once any real meeting exists. */
  sample?: boolean;
  source: {
    videoUrl: string | null; // original page/video URL
    agendaUrl: string | null;
    minutesUrl: string | null;
  };
  video: VideoSource;
  /** Portion of the source video that was processed. */
  clip: { start: number; end: number | null };
  language: string; // spoken language of the meeting, ISO 639-1
  generatedAt: string;
  aiGenerated: boolean;
  /** Set to true only after a person checked the summaries against the video. */
  reviewed: boolean;
  overview: string;
  items: AgendaItem[];
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  translations: Record<string, MeetingTranslation>; // keyed by language code
}

export type Tone = "good" | "bad" | "warn" | "neutral";

/** One agenda item, shown like a video chapter. */
export interface Chapter {
  id: string;
  start: number;
  end: number;
  headline: string;
  /** Short result such as "Approved 4–0", only for votes. */
  result: string | null;
  tone: Tone;
}

/** What the browser needs to show a meeting in the video feed and player. */
export interface VideoCard {
  id: string;
  title: string;
  body: string;
  date: string;
  sample: boolean;
  /** Spoken language of the meeting (ISO 639-1); chapters are written in it. */
  language: string;
  /** Playable source. A YouTube copy is preferred over a local file. */
  video: VideoSource;
  thumbnail: string | null;
  /** Length in seconds, when known. */
  duration: number | null;
  /** The chapter that best describes the meeting (its card title). */
  mainChapterId: string | null;
  chapters: Chapter[];
  /** Stored chapter translations, keyed by language code, then chapter id. */
  i18n: Record<string, Record<string, { headline: string; result: string | null }>>;
}

/** A link back to the exact moment in a meeting video. */
export interface Citation {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  seconds: number;
  label: string;
  href: string;
}
