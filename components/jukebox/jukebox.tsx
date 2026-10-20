"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import type { Game } from "@/data/games";
import { Record } from "./record";
import styles from "./jukebox.module.css";

const mod = (a: number, n: number) => ((a % n) + n) % n;

// Signed distance from the selector position to record i, going the short way round the ring.
const ringDistance = (i: number, pos: number, n: number) => mod(i - pos + n / 2, n) - n / 2;

function slideStyle(d: number) {
  const abs = Math.abs(d);
  const side = Math.sign(d);
  const near = Math.min(abs, 1);
  const x = side * (near * 0.68 + Math.max(abs - 1, 0) * 0.32);
  return {
    transform: `translateX(calc(var(--record) * ${x})) translateZ(calc(var(--record) * ${-Math.min(abs, 2.5) * 0.5})) rotateY(${-side * near * 62}deg)`,
    opacity: abs > 2.4 ? 0 : 1,
    filter: `brightness(${1 - Math.min(abs, 2) * 0.28})`,
    zIndex: 10 - Math.round(abs * 2),
  };
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );

type Drag = {
  pointerId: number;
  startX: number;
  startPos: number;
  moved: boolean;
  samples: { x: number; t: number }[];
};

// Moves the selector by whole records from wherever it is now.
const stepFrom = (delta: number) => (p: number) => Math.round(p) + delta;

export function Jukebox({ games }: { games: Game[] }) {
  const n = games.length;
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  // Unbounded so the ring can keep turning; the selected record is pos wrapped onto the list.
  const [pos, setPos] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const selectedIndex = mod(Math.round(pos), n);
  const selected = games[selectedIndex];
  const playHref = selected.comingSoon ? null : `/play/${selected.slug}`;


  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setPos(stepFrom(e.key === "ArrowLeft" ? -1 : 1));
      } else if (e.key === "Enter" && playHref && !target.closest("a, button")) {
        router.push(playHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playHref, router]);

  // Pixels of drag that move the ring by one record.
  const recordPitch = () => (stage.current?.offsetWidth ?? 600) * 0.32;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startPos: pos,
      moved: false,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.samples = [...d.samples.filter((s) => e.timeStamp - s.t < 100), { x: e.clientX, t: e.timeStamp }];
    if (!reduceMotion) setPos(d.startPos - dx / recordPitch());
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(false);

    if (!d.moved) {
      // A tap on a neighbour brings it to the front.
      const slide = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
      if (slide) {
        const from = Math.round(pos);
        setPos(from + ringDistance(Number(slide.dataset.index), from, n));
      }
      return;
    }

    const first = d.samples[0];
    const elapsed = Math.max(e.timeStamp - first.t, 1);
    const velocity = (e.clientX - first.x) / elapsed; // px per ms
    const pitch = recordPitch();
    const start = Math.round(d.startPos);
    const dx = e.clientX - d.startX;

    if (reduceMotion) {
      setPos(start - Math.sign(dx));
      return;
    }
    // Let the throw carry on as if it decelerated over ~180ms, then land on the nearest record.
    let target = Math.round(d.startPos - (dx + velocity * 180) / pitch);
    // A quick flick always moves at least one record.
    if (target === start && Math.abs(velocity) > 0.3) target = start - Math.sign(velocity);
    setPos(Math.max(start - 3, Math.min(start + 3, target)));
  }

  // Also runs when capture is lost mid-drag (say the window loses focus), so the ring never stays stuck between records.
  function onPointerCancel() {
    drag.current = null;
    setDragging(false);
    setPos((p) => Math.round(p));
  }

  return (
    <div className={styles.cabinet}>
      <div className={styles.arch}>
        <h1 className={styles.marquee}>
          <span className={styles.marqueeTop}>Kitty&apos;s</span>{" "}
          <span className={styles.marqueeBottom}>Arcade</span>
        </h1>
      </div>

      <div className={styles.body}>
        <div className={styles.windowFrame}>
          <div
            ref={stage}
            className={styles.stage}
            data-dragging={dragging || undefined}
            role="region"
            aria-roledescription="carousel"
            aria-label="Games"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
          >
            {/* Remounting on each pick lets reduced motion swap records with a fade. */}
            <div key={reduceMotion ? selectedIndex : "ring"} className={styles.ring}>
              {games.map((game, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <div
                    key={game.slug}
                    data-index={i}
                    data-selected={isSelected}
                    className={styles.slide}
                    style={slideStyle(ringDistance(i, pos, n))}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${i + 1} of ${n}: ${game.title}`}
                    aria-hidden={!isSelected}
                  >
                    <Record game={game} preload={i === 0} />
                  </div>
                );
              })}
            </div>
          </div>

          <button type="button" className={`${styles.flick} ${styles.flickPrev}`} onClick={() => setPos(stepFrom(-1))}>
            <ChevronLeft aria-hidden strokeWidth={3} />
            <span className="sr-only">Previous game</span>
          </button>
          <button type="button" className={`${styles.flick} ${styles.flickNext}`} onClick={() => setPos(stepFrom(1))}>
            <ChevronRight aria-hidden strokeWidth={3} />
            <span className="sr-only">Next game</span>
          </button>
        </div>

        <div className={styles.panel}>
          <p className="sr-only" aria-live="polite">
            {`Selection ${selected.code}, ${selected.title}. ${selected.comingSoon ? "Coming soon." : "Ready to play."}`}
          </p>
          {/* Every strip is stacked in one cell so the panel is always as tall as the longest one and nothing below it jumps. */}
          <section className={styles.strip} aria-labelledby="selected-title">
            {games.map((game, i) => {
              const isSelected = i === selectedIndex;
              return (
                <div key={game.slug} className={styles.stripContent} data-selected={isSelected} aria-hidden={!isSelected}>
                  <p className={styles.code}>{game.code}</p>
                  <div>
                    <h2 id={isSelected ? "selected-title" : undefined} className={styles.title}>
                      {game.title}
                    </h2>
                    <p className={styles.description}>
                      {game.comingSoon ? <strong>Coming soon. </strong> : null}
                      {game.description}
                    </p>
                    {!game.comingSoon && game.needsKeyboard ? (
                      <p className={styles.keyboardNote}>Needs a keyboard, so it plays best on a laptop.</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>

          {playHref ? (
            <Link href={playHref} className={styles.play}>
              Play {selected.shortTitle}
            </Link>
          ) : (
            <button type="button" className={styles.play} disabled>
              Coming soon
            </button>
          )}
        </div>

        <div className={styles.grille} aria-hidden />
      </div>
    </div>
  );
}
