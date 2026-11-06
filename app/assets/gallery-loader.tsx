"use client";

import dynamic from "next/dynamic";

// WebGL only exists in the browser, so the gallery skips server rendering.
const Gallery = dynamic(() => import("./gallery"), { ssr: false });

export default function GalleryLoader() {
  return <Gallery />;
}
