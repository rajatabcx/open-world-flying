"use client";

import { Center, Clone, OrbitControls, PerspectiveCamera, View, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box3, Vector3 } from "three";
import { categories, type Model } from "./models";

class LoadBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Models come in wildly different sizes, so each one is scaled to fill its card.
function FittedModel({ file, onLoaded }: { file: string; onLoaded: () => void }) {
  const { scene } = useGLTF(file);
  const scale = useMemo(() => {
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    return 2 / Math.max(size.x, size.y, size.z);
  }, [scene]);
  useEffect(onLoaded, [onLoaded]);
  return (
    <Center scale={scale}>
      <Clone object={scene} />
    </Center>
  );
}

function ModelCard({ model }: { model: Model }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <article className="overflow-hidden rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5">
      <div className="relative h-64 bg-gradient-to-b from-sky-200 to-orange-50">
        <View className="absolute inset-0">
          <PerspectiveCamera makeDefault position={[2.6, 1.5, 3.9]} fov={40} />
          <hemisphereLight args={["#ffffff", "#f3e6d3", 3]} />
          <directionalLight position={[4, 6, 3]} intensity={2.5} />
          <OrbitControls makeDefault autoRotate autoRotateSpeed={1.5} enablePan={false} enableZoom={false} />
          <LoadBoundary onError={() => setStatus("failed")}>
            <Suspense fallback={null}>
              <FittedModel file={model.file} onLoaded={() => setStatus("ready")} />
            </Suspense>
          </LoadBoundary>
        </View>
        {status !== "ready" && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-600">
            {status === "loading" ? "Loading…" : "Couldn't load this model"}
          </p>
        )}
      </div>
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <h3 className="font-medium text-slate-900">{model.name}</h3>
          <p className="text-sm text-slate-600">
            {model.author} · {model.sizeKb < 1024 ? `${model.sizeKb} KB` : `${(model.sizeKb / 1024).toFixed(1)} MB`} ·{" "}
            <a className="underline" href={`https://poly.pizza/m/${model.id}`} target="_blank" rel="noreferrer">
              Source
            </a>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            model.license === "CC0" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          {model.license === "CC0" ? "CC0, no credit" : "Credit required"}
        </span>
      </div>
    </article>
  );
}

export default function Gallery() {
  const root = useRef<HTMLDivElement>(null!);
  return (
    <div ref={root} className="relative min-h-screen bg-orange-50 text-slate-900">
      <main className="relative mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-4xl font-semibold tracking-tight">Asset gallery</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Drag any model to spin it. These are candidates, so pick what fits the world.</p>
        {categories.map((category) => (
          <section key={category.title} className="mt-12">
            <h2 className="text-2xl font-semibold">{category.title}</h2>
            <p className="mt-1 text-slate-600">{category.note}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {category.models.map((model) => (
                <ModelCard key={model.id} model={model} />
              ))}
            </div>
          </section>
        ))}
      </main>
      <Canvas
        eventSource={root}
        eventPrefix="client"
        style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
        gl={{ alpha: true }}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
