import type { Metadata } from "next";
import GameLoader from "./game-loader";

export const metadata: Metadata = {
  title: "Aloft",
  description: "A relaxing open-world game where people simply fly.",
};

export default function Home() {
  return <GameLoader />;
}
