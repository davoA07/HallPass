import { HomeView } from "@/components/HomeView";
import { listMeetings, toCard } from "@/lib/meetings";

export default function Home() {
  return <HomeView cards={listMeetings().map(toCard)} />;
}
