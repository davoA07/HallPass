import { HomeView } from "@/components/HomeView";
import { listMeetings, summarize } from "@/lib/meetings";

export default function Home() {
  const meetings = listMeetings().map(summarize);
  return <HomeView meetings={meetings} />;
}
