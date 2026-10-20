import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-12 text-center">
      <div className="grid max-w-md justify-items-center gap-5">
        <p className="font-[family-name:var(--font-sign)] text-6xl text-[var(--neon-pink)] [text-shadow:0_0_0.3em_var(--neon-pink)]">
          404
        </p>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
          That record isn&apos;t in the jukebox
        </h1>
        <p className="text-[var(--cream-soft)]">
          The link might be old, or the game isn&apos;t out yet.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-[var(--neon-orange)] px-6 py-3 text-lg font-extrabold text-[var(--night-deep)] no-underline"
        >
          Back to the arcade
        </Link>
      </div>
    </main>
  );
}
