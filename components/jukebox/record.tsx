import Image from "next/image";
import type { CSSProperties } from "react";
import type { Game } from "@/data/games";
import styles from "./record.module.css";

export function Record({ game, preload }: { game: Game; preload: boolean }) {
  return (
    <div className={styles.record}>
      <div className={styles.spin}>
        {game.comingSoon ? (
          <div className={styles.label} style={{ "--hue": game.labelHue } as CSSProperties}>
            <span className={styles.labelTitle}>{game.title}</span>
            <span className={styles.labelNote}>Coming soon</span>
          </div>
        ) : (
          <div className={`${styles.label} ${styles.coverLabel}`}>
            <Image src={game.cover} alt="" fill sizes="160px" preload={preload} draggable={false} className={styles.backdrop} />
            <Image src={game.cover} alt="" fill sizes="160px" preload={preload} draggable={false} />
          </div>
        )}
        <span className={styles.spindle} />
      </div>
    </div>
  );
}
