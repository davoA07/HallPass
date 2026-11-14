"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { formatTime } from "@/lib/format";
import type { VideoSource } from "@/lib/types";

export interface PlayerHandle {
  seek: (seconds: number) => void;
}

interface Props {
  video: VideoSource;
  initialTime?: number;
  /** Start playing as soon as the player loads (used when the assistant picks a video). */
  autoplay?: boolean;
  onTime?: (seconds: number) => void;
  labels: { noVideo: string; openVideo: string };
  ref?: Ref<PlayerHandle>;
}

/**
 * One player for every video source. All times are seconds in the source
 * video; file sources that hold only a clip subtract their offset.
 */
export function VideoPlayer({ video, initialTime = 0, autoplay = false, onTime, labels, ref }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [linkTime, setLinkTime] = useState(initialTime);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onTimeRef.current = onTime;
  });

  useImperativeHandle(
    ref,
    () => ({
      seek(seconds: number) {
        if (video.kind === "youtube") {
          const win = iframeRef.current?.contentWindow;
          const send = (func: string, args: unknown[] = []) =>
            win?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
          send("seekTo", [seconds, true]);
          send("playVideo");
        } else if (video.kind === "file") {
          const el = videoRef.current;
          if (!el) return;
          el.currentTime = Math.max(0, seconds - (video.offset ?? 0));
          el.play().catch(() => {});
        } else if (video.kind === "link") {
          setLinkTime(seconds);
          window.open(linkUrl(video.urlTemplate, seconds), "_blank", "noopener");
        }
        onTimeRef.current?.(seconds);
      },
    }),
    [video],
  );

  // YouTube reports playback time to a listening parent ("infoDelivery" messages).
  useEffect(() => {
    if (video.kind !== "youtube") return;
    const onMessage = (e: MessageEvent) => {
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const time = data?.info?.currentTime;
        if (typeof time === "number") onTimeRef.current?.(time);
      } catch {
        /* not a player message */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [video.kind]);

  if (video.kind === "youtube") {
    const src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtubeId)}` +
      `?enablejsapi=1&rel=0&playsinline=1&start=${Math.floor(initialTime)}${autoplay ? "&autoplay=1" : ""}`;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          ref={iframeRef}
          src={src}
          title="Meeting video"
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          onLoad={() =>
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
              "*",
            )
          }
        />
      </div>
    );
  }

  if (video.kind === "file") {
    return (
      <video
        ref={videoRef}
        src={video.src}
        controls
        autoPlay={autoplay}
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-2xl bg-black"
        onLoadedMetadata={(e) => {
          if (initialTime) e.currentTarget.currentTime = Math.max(0, initialTime - (video.offset ?? 0));
        }}
        onTimeUpdate={(e) => onTimeRef.current?.(e.currentTarget.currentTime + (video.offset ?? 0))}
      />
    );
  }

  if (video.kind === "link") {
    return (
      <div className="grid aspect-video w-full place-items-center rounded-2xl border border-line bg-surface-2 p-6 text-center">
        <a
          href={linkUrl(video.urlTemplate, linkTime)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink"
        >
          {labels.openVideo} {formatTime(linkTime)}
        </a>
      </div>
    );
  }

  return (
    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-dashed border-line bg-surface-2 p-6 text-center text-sm text-muted">
      {labels.noVideo}
    </div>
  );
}

function linkUrl(template: string, seconds: number) {
  return template.includes("{t}") ? template.replaceAll("{t}", String(Math.floor(seconds))) : template;
}
