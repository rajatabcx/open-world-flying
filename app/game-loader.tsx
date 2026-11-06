"use client";

import dynamic from "next/dynamic";

// WebGL only exists in the browser, so the game skips server rendering.
const Game = dynamic(() => import("@/game/Game"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-sky-200 text-lg text-slate-700">Gathering the wind…</div>
  ),
});

export default function GameLoader() {
  return <Game />;
}
