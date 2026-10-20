import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameFrame } from "@/components/game-frame/game-frame";
import { findPlayableGame, playableGames } from "@/data/games";

// Unknown slugs end in notFound(), which dev-mode instant validation reports as a failed render.
// Real game pages are fully prerendered by generateStaticParams, so there is nothing to validate.
export const instant = false;

// Only playable games get a page; every other slug is a 404.
export function generateStaticParams() {
  return playableGames.map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: PageProps<"/play/[slug]">): Promise<Metadata> {
  const game = findPlayableGame((await params).slug);
  if (!game) return {};
  return {
    title: game.title,
    description: game.description,
    openGraph: {
      title: game.title,
      description: game.description,
      images: [{ url: game.cover, width: 1200, height: 630, alt: `${game.title} title screen` }],
    },
  };
}

export default async function PlayPage({ params }: PageProps<"/play/[slug]">) {
  const game = findPlayableGame((await params).slug);
  if (!game) notFound();
  return <GameFrame game={game} />;
}
