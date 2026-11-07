"use client";

import { useEffect, useRef } from "react";
import { errands } from "./errands";
import { flight } from "./flight";
import { VILLAGE_NAMES } from "./villages";

/**
 * While you carry a parcel, an arrow at the top of the screen points the way to whoever
 * it's for, with how far there is left to go. It updates every frame straight on the page,
 * so it turns smoothly with you.
 */
export function GuideArrow() {
  const box = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let frame = 0;
    let shown = "";
    const update = () => {
      frame = requestAnimationFrame(update);
      const to = errands.carrying?.to;
      const dx = to ? to.x - flight.pos.x : 0;
      const dz = to ? to.z - flight.pos.z : 0;
      const distance = Math.hypot(dx, dz);
      // Hidden once you're close enough to see their circle, and while you're talking.
      const visible = !!to && distance > 25 && !errands.talk && !flight.photo;
      if (box.current) box.current.style.opacity = visible ? "1" : "0";
      if (!to || !visible) return;
      // Ahead of you is up on screen, so the arrow turns by the angle off your nose.
      const fx = -Math.sin(flight.yaw);
      const fz = -Math.cos(flight.yaw);
      const ahead = dx * fx + dz * fz;
      const right = dx * -fz + dz * fx;
      const angle = Math.atan2(right, ahead);
      if (arrow.current) arrow.current.style.transform = `rotate(${angle}rad)`;
      const far = distance > 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance / 10) * 10} m`;
      const text = `${to.name} · ${VILLAGE_NAMES[to.village]} · ${far}`;
      if (text !== shown && label.current) {
        shown = text;
        label.current.textContent = text;
      }
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div ref={box} className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-1.5 opacity-0 transition-opacity duration-500" aria-hidden>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/35 shadow-lg ring-2 ring-amber-300/80 backdrop-blur">
        <div ref={arrow}>
          <svg width="30" height="30" viewBox="0 0 30 30">
            <path d="M15 2 L26 24 L15 18.5 L4 24 Z" fill="#ffc861" stroke="#7a4a12" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <p ref={label} className="rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur" />
    </div>
  );
}
