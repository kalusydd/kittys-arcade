"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PlayableGame } from "@/data/games";
import styles from "./game-frame.module.css";

export function GameFrame({ game }: { game: PlayableGame }) {
  const frame = useRef<HTMLIFrameElement>(null);

  // Hand the keyboard to the game straight away, so arrow keys and space reach it without a click.
  const focusGame = () => {
    frame.current?.focus();
    frame.current?.contentWindow?.focus();
  };
  useEffect(focusGame, []);

  return (
    <main className={styles.screen}>
      <iframe
        ref={frame}
        src={game.gamePath}
        title={`${game.title}, the game`}
        allow="autoplay; fullscreen; gamepad"
        className={styles.frame}
        onLoad={focusGame}
      />
      <Link href="/" className={styles.back}>
        <ArrowLeft aria-hidden size={16} strokeWidth={2.5} />
        Back to the arcade
      </Link>
      {game.needsKeyboard ? (
        <p className={styles.touchNote}>
          {game.shortTitle} needs a keyboard, so it plays best on a laptop.
        </p>
      ) : null}
    </main>
  );
}
