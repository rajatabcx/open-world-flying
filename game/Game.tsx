"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { Color, DirectionalLight, Fog, HemisphereLight } from "three";
import { Atmosphere } from "./Atmosphere";
import { sky, hurryDay } from "./time";
import { VillageLife } from "./VillageLife";
import { weather, startShower } from "./weather";
import { audioState, renderForTest, setMuted, startAudio, stopAudio } from "./audio";
import { answerNo, answerYes, captionNow, errands, startTalk, talkable, type Talk } from "./errands";
import { Errands } from "./ErrandScene";
import { GuideArrow } from "./GuideArrow";
import { canLand, flight, land, startAt, toggleWings } from "./flight";
import { enterPhoto, leavePhoto, loadPostcards, makePostcard, placeName, savePostcards, type Postcard } from "./photo";
import { Ruin } from "./Ruin";
import { SeaSkim } from "./SeaSkim";
import { press } from "./input";
import { PEOPLE } from "./people";
import { People } from "./Villagers";
import { Fliers } from "./Fliers";
import { Hero } from "./Hero";
import { Sky, Terrain, Water } from "./Island";
import { Caves } from "./Caves";
import { Trees } from "./Forest";
import { Arches, Villages } from "./Scenery";
import { RiverAndFalls } from "./Waters";
import { Balloons, Birds, Clouds, Leaves, Streaks, Wind } from "./Sky";
import { CAVES, FALLS, heightAt, PLACES, RIVER, VILLAGES, type PlaceId } from "./terrain";
import { VILLAGE_NAMES } from "./villages";
import { TREES } from "./trees";
import { BALLOONS, FOG_FAR, FOG_NEAR, HORIZON, SUN, WIND } from "./world";

const capture = { take: null as null | (() => string) };

/** Renders one clean frame and reads it back, which the screen itself can't offer. */
function CaptureBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") Object.assign(window, { __scene: scene, __gl: gl });
    capture.take = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/jpeg", 0.92);
    };
    return () => {
      capture.take = null;
    };
  }, [gl, scene, camera]);
  return null;
}

function World() {
  const light = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const fog = useRef<Fog>(null);
  const background = useRef<Color>(null);
  useFrame(() => {
    // All the light comes from the time of day. Caves swallow it as you fly in.
    if (light.current) {
      light.current.intensity = sky.keyIntensity * (1 - flight.cave * 0.8);
      light.current.color.copy(sky.key);
    }
    if (fill.current) {
      fill.current.intensity = sky.fillIntensity * (1 - flight.cave * 0.72);
      fill.current.color.copy(sky.fillSky);
      fill.current.groundColor.copy(sky.fillGround);
    }
    fog.current?.color.copy(sky.horizon);
    background.current?.copy(sky.horizon);
  });
  return (
    <>
      <color ref={background} attach="background" args={[HORIZON]} />
      <fog ref={fog} attach="fog" args={[HORIZON, FOG_NEAR, FOG_FAR]} />
      <hemisphereLight ref={fill} args={["#dcecff", "#c9b48a", 1.05]} />
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
      <RiverAndFalls />
      <Caves />
      <Trees />
      <Villages />
      <Arches />
      <Suspense fallback={null}>
        <Hero lightRef={light} />
        <Balloons />
        <Fliers />
      </Suspense>
      <Birds />
      <Clouds />
      <Wind />
      <Streaks />
      <Leaves />
      <People />
      <VillageLife />
      <Atmosphere />
      <SeaSkim />
      <Ruin />
      <CaptureBridge />
      <Errands />
    </>
  );
}

export default function Game() {
  const [flying, setFlying] = useState(false);
  const [hint, setHint] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [caption, setCaption] = useState("");
  const [landable, setLandable] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [talk, setTalk] = useState<Talk | null>(null);
  const [warning, setWarning] = useState(false);
  const [folded, setFolded] = useState(false);
  const [onFoot, setOnFoot] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [album, setAlbum] = useState<Postcard[] | null>(null);
  const [flash, setFlash] = useState(false);

  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      Object.assign(window, { __flight: flight, __game: { BALLOONS, WIND, VILLAGES, TREES, PEOPLE, errands, CAVES, FALLS, RIVER, sky, weather, startShower, heightAt, renderForTest, audioState } });
    }
    return stopAudio;
  }, []);

  // Keeps the on-screen captions and the land button current.
  useEffect(() => {
    if (!flying) return;
    const id = setInterval(() => {
      setCaption(captionNow(flight.clock));
      setLandable(canLand());
      setCanTalk(!!talkable());
      setTalk(errands.talk);
      setWarning(flight.warning > 0.35);
      setFolded(flight.folded);
      setOnFoot(flight.resting);
    }, 120);
    return () => clearInterval(id);
  }, [flying]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (errands.talk) {
        if (e.code === "Enter" || e.code === "KeyF" || e.code === "KeyY") answerYes();
        if (e.code === "Escape" || e.code === "KeyN") answerNo();
        setTalk(errands.talk);
        return;
      }
      if (e.code === "KeyF" && startTalk()) setTalk(errands.talk);
      if (e.code === "KeyQ") toggleWings();
      if (e.code === "KeyH" && flight.flying) toggleControls();
      if (e.code === "KeyT") hurryDay();
      if (e.code === "KeyE") land();
      if (e.code === "KeyP" && flight.flying) togglePhoto();
      if (e.code === "Enter" && flight.photo) void snap();
      if (e.code !== "KeyM") return;
      setMutedState((value) => {
        setMuted(!value);
        return !value;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Once you ask for the controls, they stay up until you put them away.
  function toggleControls() {
    clearTimeout(hintTimer.current);
    setHint((shown) => !shown);
  }

  function togglePhoto() {
    if (flight.photo) {
      leavePhoto();
      setPhotoMode(false);
    } else {
      enterPhoto();
      setPhotoMode(true);
    }
  }

  async function snap() {
    if (!capture.take) return;
    const place = placeName(flight.pos.x, flight.pos.y, flight.pos.z);
    const image = await makePostcard(capture.take(), place);
    savePostcards([{ id: Date.now(), place, image }, ...loadPostcards()]);
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
  }

  function begin(place: PlaceId) {
    startAudio();
    startAt(place);
    setFlying(true);
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 14000);
  }

  function changeStart() {
    leavePhoto();
    setPhotoMode(false);
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

      {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}

      {album && (
        <div className="absolute inset-0 overflow-y-auto bg-slate-950/80 p-6 text-white backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light">Postcards</h2>
              <button onClick={() => setAlbum(null)} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-slate-900">
                Close
              </button>
            </div>
            {album.length === 0 && <p className="mt-10 text-center text-white/80">No postcards yet. Press P while flying to take your first.</p>}
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {album.map((card) => (
                <figure key={card.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image} alt={`Postcard of ${card.place}`} className="w-full rounded shadow-xl" />
                  <figcaption className="mt-2 flex gap-3 text-sm">
                    <a href={card.image} download={`${card.place}.jpg`} className="underline underline-offset-2">
                      Save
                    </a>
                    <button
                      onClick={() => {
                        const left = album.filter((c) => c.id !== card.id);
                        savePostcards(left);
                        if (left.length === 0) localStorage.removeItem("aloft-postcards");
                        setAlbum(left);
                      }}
                      className="underline underline-offset-2"
                    >
                      Remove
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      )}

      {flying && photoMode && !album && (
        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3 px-4 text-white">
          <p className="rounded-full bg-black/35 px-4 py-1.5 text-center text-sm backdrop-blur">Arrows move the camera · W and S zoom</p>
          <div className="flex gap-2">
            <button onClick={() => void snap()} className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-slate-900 shadow-lg">
              Take photo (Enter)
            </button>
            <button onClick={togglePhoto} className="rounded-full bg-black/40 px-5 py-2.5 text-sm backdrop-blur">
              Done (P)
            </button>
          </div>
        </div>
      )}

      {flying && !photoMode && !album && (
        <>
          <div
            className={`pointer-events-none absolute inset-x-4 top-16 mx-auto max-w-md rounded-2xl bg-black/35 px-5 py-3 text-sm leading-6 text-white backdrop-blur transition-opacity duration-1000 ${hint ? "opacity-100" : "opacity-0"}`}
          >
            <p><b className="font-semibold">↓</b> flap up · <b className="font-semibold">↑</b> dive · <b className="font-semibold">← →</b> turn</p>
            <p><b className="font-semibold">W</b> flap forward · let go to glide · <b className="font-semibold">S</b> brake to a hover</p>
            <p><b className="font-semibold">Shift</b> boost · or drag the mouse to steer</p>
            <p><b className="font-semibold">Q</b> pack the wings away and drop · any flying key throws them open again</p>
            <p><b className="font-semibold">E</b> land · on foot <b className="font-semibold">W A S D</b> walk, <b className="font-semibold">← →</b> turn, <b className="font-semibold">Shift</b> run</p>
            <p><b className="font-semibold">Space</b> take off again · <b className="font-semibold">F</b> talk to someone</p>
            <p><b className="font-semibold">P</b> photo · <b className="font-semibold">T</b> move the day along · <b className="font-semibold">M</b> sound · <b className="font-semibold">H</b> show or hide this</p>
            <p className="mt-1 text-white/80">See a golden glow? Someone has a parcel. Land nearby, walk up and talk to them, if you feel like carrying it.</p>
          </div>
          <GuideArrow />
          {warning && !talk && (
            <div role="status" className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
              <div className="animate-pulse rounded-full bg-amber-400/80 px-5 py-2 text-sm font-semibold tracking-wide text-slate-900 shadow-lg backdrop-blur">
                Pull up ↓
              </div>
            </div>
          )}
          {talk && (
            <div className="absolute inset-x-4 bottom-8 mx-auto max-w-md rounded-2xl bg-black/50 px-5 py-4 text-white shadow-xl backdrop-blur pointer-coarse:bottom-40">
              <p className="text-xs uppercase tracking-widest text-amber-200/90">
                {talk.person.name} · {VILLAGE_NAMES[talk.person.village]}
              </p>
              <p className="mt-1.5 text-base leading-6">&ldquo;{talk.pages[talk.page]}&rdquo;</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    answerYes();
                    setTalk(errands.talk);
                  }}
                  className="rounded-full bg-white px-5 py-2 text-sm font-medium text-slate-900"
                >
                  {talk.page < talk.pages.length - 1 ? "Go on (Enter)" : talk.kind === "ask" ? "I'll take it (Enter)" : "Hand it over (Enter)"}
                </button>
                {talk.kind === "ask" && (
                  <button
                    onClick={() => {
                      answerNo();
                      setTalk(errands.talk);
                    }}
                    className="rounded-full bg-white/15 px-5 py-2 text-sm"
                  >
                    Not today (Esc)
                  </button>
                )}
              </div>
              {talk.kind === "ask" && talk.page === talk.pages.length - 1 && <p className="mt-2.5 text-xs text-white/70">Once you take it, it stays with you until it&apos;s delivered.</p>}
            </div>
          )}
          {caption && !talk && (
            <div className="pointer-events-none absolute inset-x-4 bottom-8 mx-auto w-fit max-w-lg rounded-2xl bg-black/35 px-5 py-2 text-center text-sm leading-6 text-white backdrop-blur pointer-coarse:bottom-40">
              {caption}
            </div>
          )}
          <div className="absolute right-4 top-4 flex gap-2">
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                toggleControls();
              }}
              aria-pressed={hint}
              className="rounded-full bg-black/25 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/40"
            >
              Controls
            </button>
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
            <button onClick={togglePhoto} className="rounded-full bg-black/25 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/40">
              Photo
            </button>
            <button onClick={() => setAlbum(loadPostcards())} className="rounded-full bg-black/25 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/40">
              Postcards
            </button>
            <button
              onClick={changeStart}
              className="rounded-full bg-black/25 px-4 py-2 text-sm text-white backdrop-blur transition hover:bg-black/40"
            >
              Change start
            </button>
          </div>
          <div className="absolute bottom-6 right-4 hidden gap-2 pointer-coarse:flex">
            {landable && (
              <button onClick={() => land()} className="h-16 w-16 rounded-full bg-white/30 text-xs font-medium text-white backdrop-blur active:bg-white/50">
                Land
              </button>
            )}
            {canTalk && (
              <button onClick={() => startTalk() && setTalk(errands.talk)} className="h-16 w-16 rounded-full bg-white/30 text-xs font-medium text-white backdrop-blur active:bg-white/50">
                Talk
              </button>
            )}
            {onFoot ? (
              <button
                onPointerDown={() => press("Space", true)}
                onPointerUp={() => press("Space", false)}
                onPointerCancel={() => press("Space", false)}
                onPointerLeave={() => press("Space", false)}
                className="h-16 w-16 rounded-full bg-white/30 text-xs font-medium text-white backdrop-blur active:bg-white/50"
              >
                Fly
              </button>
            ) : (
              <button onClick={toggleWings} className="h-16 w-16 rounded-full bg-white/30 text-xs font-medium text-white backdrop-blur active:bg-white/50">
                {folded ? "Open" : "Drop"}
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
