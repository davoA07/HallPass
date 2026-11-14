import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MeetingView } from "@/components/MeetingView";
import { getMeeting, listMeetings } from "@/lib/meetings";

export function generateStaticParams() {
  // Cache Components requires at least one param; the placeholder 404s.
  const ids = listMeetings().map((m) => ({ id: m.id }));
  return ids.length > 0 ? ids : [{ id: "__none__" }];
}

type Params = PageProps<"/meetings/[id]">["params"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const meeting = getMeeting(id);
  return { title: meeting ? `${meeting.title} · Ask City Hall` : "Meeting not found" };
}

export default function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  return (
    <Suspense fallback={<MeetingSkeleton />}>
      <MeetingContent params={params} />
    </Suspense>
  );
}

async function MeetingContent({ params }: { params: Params }) {
  const { id } = await params;
  const meeting = getMeeting(id);
  if (!meeting) notFound();
  return <MeetingView meeting={meeting} />;
}

function MeetingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 pt-6" aria-busy>
      <div className="h-4 w-48 rounded bg-neutral-soft" />
      <div className="mt-3 h-8 w-80 max-w-full rounded bg-neutral-soft" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="aspect-video rounded-xl bg-neutral-soft" />
        <div className="space-y-4">
          <div className="h-24 rounded-2xl bg-neutral-soft" />
          <div className="h-40 rounded-2xl bg-neutral-soft" />
        </div>
      </div>
    </div>
  );
}
