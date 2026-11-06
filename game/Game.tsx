"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { DirectionalLight } from "three";
import { audioState, renderForTest, setMuted, startAudio, stopAudio } from "./audio";
import { captionNow, dropParcel, errands } from "./errands";
import { Errands } from "./Errands";
import { flight, startAt, type FlightMode } from "./flight";
import { press } from "./input";
import { PEOPLE } from "./people";
import { People } from "./People";
import { Hero } from "./Hero";
import { Sky, Terrain, Water } from "./Island";
import { Arches, Trees, Villages } from "./Scenery";
import { Balloons, Birds, Clouds, Leaves, Streaks, Wind } from "./Sky";
import { heightAt, PLACES, VILLAGES, type PlaceId } from "./terrain";
import { TREES } from "./trees";
import { BALLOONS, FOG_FAR, FOG_NEAR, HORIZON, SUN, WIND } from "./world";

const PACE: Record<FlightMode, string> = {
  idle: "",
  hover: "Hovering",
  flap: "Flapping",
  climb: "Climbing",
  glide: "Gliding",
  dive: "Diving",
  boost: "Boosting",
};

function World() {
  const light = useRef<DirectionalLight>(null);
  return (
    <>
      <color attach="background" args={[HORIZON]} />
      <fog attach="fog" args={[HORIZON, FOG_NEAR, FOG_FAR]} />
      <hemisphereLight args={["#dcecff", "#c9b48a", 1.05]} />
      <directionalLight
        ref={light}
        position={[SUN.x * 420, SUN.y * 420, SUN.z * 420]}
        intensity={2.1}
        color="#fff0d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={10}
        shadow-camera-far={900}
        shadow-normalBias={0.6}
      />
      <Sky />
      <Terrain />
      <Water />
      <Trees />
      <Villages />
      <Arches />
      <Suspense fallback={null}>
        <Hero lightRef={light} />
        <Balloons />
      </Suspense>
      <Birds />
      <Clouds />
      <Wind />
      <Streaks />
      <Leaves />
      <People />
      <Errands />
    </>
  );
}

export default function Game() {
  const [flying, setFlying] = useState(false);
  const [hint, setHint] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [pace, setPace] = useState("Flapping");
  const [caption, setCaption] = useState("");
  const [carrying, setCarrying] = useState(false);

  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      Object.assign(window, { __flight: flight, __game: { BALLOONS, WIND, VILLAGES, TREES, PEOPLE, errands, heightAt, renderForTest, audioState } });
    }
    return stopAudio;
  }, []);

  // A small read-out, so it's always clear what speed you're at.
  useEffect(() => {
    if (!flying) return;
    const id = setInterval(() => {
      setPace(flight.speed < -2 ? "Drifting back" : PACE[flight.mode]);
      setCaption(captionNow(flight.clock));
      setCarrying(!!errands.carrying);
    }, 200);
    return () => clearInterval(id);
  }, [flying]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyX") dropParcel();
      if (e.code !== "KeyM") return;
      setMutedState((value) => {
        setMuted(!value);
        return !value;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function begin(place: PlaceId) {
    startAudio();
    startAt(place);
    setFlying(true);
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 14000);
  }

  function changeStart() {
    flight.flying = false;
    setFlying(false);
  }

  return (
    <div className="fixed inset-0 touch-none select-none overflow-hidden bg-sky-200">
      <Canvas flat shadows dpr={[1, 1.6]} camera={{ fov: 60, near: 1, far: 12000, position: [0, 700, 900] }} gl={{ antialias: true }}>
        <World />
      </Canvas>

      {!flying && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/45 via-transparent to-transparent px-6 pb-14 text-center text-white">
          <h1 className="text-6xl font-light tracking-tight drop-shadow-lg sm:text-7xl">Aloft</h1>
          <p className="mt-3 max-w-md text-lg text-white/90 drop-shadow">
            The wind answered, and now the island flies. There&apos;s nowhere you have to be.
          </p>
          <p className="mt-7 text-sm text-white/80">Where do you want to start?</p>
          <div className="pointer-events-auto mt-3 flex flex-wrap justify-center gap-3">
            {(Object.keys(PLACES) as PlaceId[]).map((id) => (
              <button
                key={id}
                onClick={() => begin(id)}
                className="rounded-full bg-white px-7 py-3 text-base font-medium text-slate-900 shadow-lg transition hover:scale-105 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {PLACES[id].label}
              </button>
            ))}
          </div>
          <p className="mt-8 text-xs text-white/65">
            Hot air balloons by Poly by Google and jeremy (CC BY 3.0). Character by Quaternius (CC0).
          </p>
        </div>
      )}

      {flying && (
        <>
          <div
            className={`pointer-events-none absolute inset-x-4 top-16 mx-auto max-w-md rounded-2xl bg-black/35 px-5 py-3 text-sm leading-6 text-white backdrop-blur transition-opacity duration-1000 ${hint ? "opacity-100" : "opacity-0"}`}
          >
            <p><b className="font-semibold">↓</b> flap up · <b className="font-semibold">↑</b> dive · <b className="font-semibold">← →</b> turn</p>
            <p><b className="font-semibold">W</b> flap forward · let go to glide · <b className="font-semibold">S</b> brake to a hover</p>
            <p><b className="font-semibold">Shift</b> boost · or drag the mouse to steer</p>
            <p className="mt-1 text-white/80">See a golden glow? Someone has a parcel, if you feel like carrying it.</p>
          </div>
          {caption && (
            <div className="pointer-events-none absolute inset-x-4 bottom-16 mx-auto w-fit max-w-lg rounded-2xl bg-black/35 px-5 py-2 text-center text-sm leading-6 text-white backdrop-blur pointer-coarse:bottom-40">
              {caption}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-4 py-1.5 text-sm text-white backdrop-blur pointer-coarse:bottom-28">
            {pace}
          </div>
          <div className="absolute right-4 top-4 flex gap-2">
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                setMuted(!muted);
                setMutedState(!muted);
              }}
              aria-pressed={muted}
              className="rounded-full bg-black/25 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/40"
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button
              onClick={changeStart}
              className="rounded-full bg-black/25 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/40"
            >
              Change start
            </button>
          </div>
          <div className="absolute bottom-6 right-4 hidden gap-2 pointer-coarse:flex">
            {carrying && (
              <button onClick={dropParcel} className="h-16 w-16 rounded-full bg-white/30 text-xs font-medium text-white backdrop-blur active:bg-white/50">
                Set down
              </button>
            )}
            {[
              ["KeyS", "Brake"],
              ["KeyW", "Flap"],
              ["ShiftLeft", "Boost"],
            ].map(([code, label]) => (
              <button
                key={code}
                onPointerDown={() => press(code, true)}
                onPointerUp={() => press(code, false)}
                onPointerCancel={() => press(code, false)}
                onPointerLeave={() => press(code, false)}
                className="h-16 w-16 rounded-full bg-white/30 text-xs font-medium text-white backdrop-blur active:bg-white/50"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
