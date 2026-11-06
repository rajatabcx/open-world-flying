import type { Metadata } from "next";
import GalleryLoader from "./gallery-loader";

export const metadata: Metadata = { title: "Asset gallery" };

export default function AssetsPage() {
  return <GalleryLoader />;
}
