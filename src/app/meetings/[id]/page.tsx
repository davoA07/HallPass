import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HomeView } from "@/components/HomeView";
import { getMeeting, listMeetings, toCard } from "@/lib/meetings";

export function generateStaticParams() {
  // Cache Components requires at least one param; the placeholder 404s.
  const ids = listMeetings().map((m) => ({ id: m.id }));
  return ids.length > 0 ? ids : [{ id: "__none__" }];
}

type Params = PageProps<"/meetings/[id]">["params"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const meeting = getMeeting(id);
  return { title: meeting ? `${meeting.title} · HallPass` : "Meeting not found" };
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
  // Same screen as the home page, with this meeting already playing (at ?t=SECONDS if given).
  return <HomeView cards={listMeetings().map(toCard)} initialMeetingId={meeting.id} />;
}

function MeetingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 pt-6" aria-busy>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="aspect-video rounded-2xl bg-neutral-soft" />
        <div className="h-[62vh] rounded-2xl bg-neutral-soft lg:h-[calc(100dvh-7rem)] lg:max-h-[46rem]" />
      </div>
    </div>
  );
}
