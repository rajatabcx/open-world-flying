export const input = { x: 0, y: 0, throttle: 0, boost: false };

const held = new Set<string>();
let drag = { x: 0, y: 0 };
let dragStart: { id: number; x: number; y: number } | null = null;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function refresh() {
  const kx = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
  // Like a flight stick: pull back (down) to flap and rise, push forward (up) to dive.
  const ky = (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0);
  input.x = kx || drag.x;
  input.y = ky || drag.y;
  input.throttle = (held.has("KeyW") ? 1 : 0) - (held.has("KeyS") ? 1 : 0);
  input.boost = held.has("ShiftLeft") || held.has("ShiftRight") || held.has("Space");
}

/** Used by the on-screen touch buttons, which act like held keys. */
export function press(code: string, down: boolean) {
  if (down) held.add(code);
  else held.delete(code);
  refresh();
}

const isScene = (e: Event) => e.target instanceof HTMLCanvasElement;

function onKeyDown(e: KeyboardEvent) {
  held.add(e.code);
  if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  refresh();
}
function onKeyUp(e: KeyboardEvent) {
  held.delete(e.code);
  refresh();
}
// Mouse and touch both steer only while dragging. When released, the wings level out,
// so a pointer resting off-centre can never keep turning you.
function onPointerDown(e: PointerEvent) {
  if (!isScene(e) || dragStart) return;
  dragStart = { id: e.pointerId, x: e.clientX, y: e.clientY };
}
function onPointerMove(e: PointerEvent) {
  if (dragStart?.id !== e.pointerId) return;
  drag = { x: clamp((e.clientX - dragStart.x) / 110), y: clamp((e.clientY - dragStart.y) / 110) };
  refresh();
}
function onPointerUp(e: PointerEvent) {
  if (dragStart?.id !== e.pointerId) return;
  dragStart = null;
  drag = { x: 0, y: 0 };
  refresh();
}
function onLeave() {
  dragStart = null;
  drag = { x: 0, y: 0 };
  held.clear();
  refresh();
}

export function attachInput() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("blur", onLeave);
  document.documentElement.addEventListener("mouseleave", onLeave);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("blur", onLeave);
    document.documentElement.removeEventListener("mouseleave", onLeave);
  };
}
