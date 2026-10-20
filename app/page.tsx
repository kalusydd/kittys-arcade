import { Jukebox } from "@/components/jukebox/jukebox";
import { games } from "@/data/games";

export default function Home() {
  return (
    <main className="min-h-svh px-4 pt-[max(1.5rem,4svh)] pb-10">
      <Jukebox games={games} />
    </main>
  );
}
