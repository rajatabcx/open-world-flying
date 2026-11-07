// All sound is synthesised here, so there are no audio files or licenses to manage.

type Output = {
  ctx: BaseAudioContext;
  music: AudioNode;
  sfx: AudioNode;
  /** The music's layers, which rise and fall with where you are. */
  pads: AudioNode;
  plucks: AudioNode;
  warm: AudioNode;
  high: AudioNode;
};
type Mix = {
  padTrim: BiquadFilterNode;
  padLevel: GainNode;
  pluckLevel: GainNode;
  warmLevel: GainNode;
  highLevel: GainNode;
  wet: GainNode;
  sfxRoom: GainNode;
  musicLevel: GainNode;
  musicTone: BiquadFilterNode;
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// The music is a slow, sparse piece for soft keys: a gentle rolled chord every so often,
// a few unhurried notes from the pentatonic scale, and a lot of quiet in between. Every
// tone is a pure sine with at most a whisper of overtone, nothing is detuned, and no filter
// sweeps, so there's no throbbing or swelling to wear on the ear.
const CHORDS = [
  [50, 57, 61, 64, 66], // D major 9, open voicing
  [47, 54, 57, 62, 66], // B minor 7
  [43, 50, 54, 59, 62], // G major 7
  [45, 52, 57, 61, 64], // A, open fifth with the third on top
];
const CHORD_SECONDS = 16;
// D major pentatonic, which has no clashing notes, kept in the warm middle register.
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78];

function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Deep, soft noise like distant surf, with none of white noise's hiss. */
function brownBuffer(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  // Fade the ends together so the loop has no click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[i] *= k;
    data[data.length - 1 - i] *= k;
  }
  return buffer;
}

/** Builds the mix: music and effects go through soft compression, with a shared room. */
function buildOutput(ctx: BaseAudioContext, destination: AudioNode): Output & { master: GainNode; mix: Mix } {
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.02;
  limiter.release.value = 0.4;
  master.connect(limiter);
  limiter.connect(destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  reverb.connect(wet);
  wet.connect(master);

  const music = ctx.createGain();
  music.gain.value = 0.6;
  const musicTone = ctx.createBiquadFilter();
  musicTone.type = "lowpass";
  musicTone.frequency.value = 3200;
  music.connect(musicTone);
  musicTone.connect(master);
  musicTone.connect(reverb);

  const padTrim = ctx.createBiquadFilter();
  padTrim.type = "highpass";
  padTrim.frequency.value = 30;
  const padLevel = ctx.createGain();
  padTrim.connect(padLevel);
  padLevel.connect(music);
  const pluckLevel = ctx.createGain();
  pluckLevel.connect(music);
  const warmLevel = ctx.createGain();
  warmLevel.gain.value = 0.5;
  warmLevel.connect(music);
  const highLevel = ctx.createGain();
  highLevel.gain.value = 0.5;
  highLevel.connect(music);

  const sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(master);
  const sfxRoom = ctx.createGain();
  sfxRoom.gain.value = 0.18;
  sfx.connect(sfxRoom);
  sfxRoom.connect(reverb);

  return {
    ctx,
    master,
    music,
    sfx,
    pads: padTrim,
    plucks: pluckLevel,
    warm: warmLevel,
    high: highLevel,
    mix: { padTrim, padLevel, pluckLevel, warmLevel, highLevel, wet, sfxRoom, musicLevel: music, musicTone },
  };
}

/** A soft held tone that fades in and out slowly. Pure sine, so it never beats or throbs. */
function padNote(out: Output, freq: number, start: number, length: number, level: number, bus: AudioNode = out.pads) {
  const { ctx } = out;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + Math.min(5, length * 0.35));
  gain.gain.setValueAtTime(level, start + length * 0.65);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(bus);
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** A soft electric-piano note: a gentle touch, a warm body and a long, quiet fade. */
function key(out: Output, freq: number, start: number, level: number, bus: AudioNode = out.plucks, length = 4.5) {
  const { ctx } = out;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.06);
  gain.gain.exponentialRampToValueAtTime(level * 0.35, start + 1.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 1100;
  soften.Q.value = 0.1;
  gain.connect(soften);
  soften.connect(bus);
  const body = ctx.createOscillator();
  body.frequency.value = freq;
  body.connect(gain);
  // A faint octave that fades faster than the note, which gives the key its soft "tine".
  const tine = ctx.createOscillator();
  const tineGain = ctx.createGain();
  tine.frequency.value = freq * 2;
  tineGain.gain.setValueAtTime(0.1, start);
  tineGain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
  tine.connect(tineGain);
  tineGain.connect(gain);
  for (const osc of [body, tine]) {
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

/** Schedules one chord's worth of music, with plenty of space left in it. */
function scheduleBar(out: Output, bar: number, start: number) {
  const chord = CHORDS[bar % CHORDS.length];
  // A low, quiet bed of just the root and fifth underneath.
  padNote(out, midi(chord[0]), start, CHORD_SECONDS + 3, 0.03);
  padNote(out, midi(chord[1]), start + 0.5, CHORD_SECONDS + 2, 0.02);
  // The chord, rolled slowly from the bottom up, once at the start of the bar.
  chord.slice(1).forEach((note, i) => key(out, midi(note), start + 0.3 + i * 0.22, 0.03, out.plucks, 7));
  // Two or three melody notes, stepping gently, with long gaps between them.
  let t = start + 4 + Math.random() * 2;
  let last = 1 + Math.floor(Math.random() * 4);
  const notes = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < notes && t < start + CHORD_SECONDS - 2; i++) {
    last = Math.max(0, Math.min(SCALE.length - 1, last + [-1, 1, -2, 2][Math.floor(Math.random() * 4)]));
    key(out, midi(SCALE[last]), t, 0.028 + Math.random() * 0.008);
    t += 3 + Math.random() * 2.5;
  }
  // Near the villages, the same chord is played again softly halfway through, like someone
  // playing indoors.
  chord.slice(1, 4).forEach((note, i) => key(out, midi(note), start + CHORD_SECONDS / 2 + i * 0.3, 0.022, out.warm, 6));
  // High up, a single faint note an octave above hangs in the air.
  padNote(out, midi(chord[chord.length - 1] + 12), start + 3, CHORD_SECONDS - 3, 0.008, out.high);
}

function playBounce(out: Output, at: number) {
  const { ctx } = out;
  const pitch = 0.9 + Math.random() * 0.25;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150 * pitch, at);
  osc.frequency.exponentialRampToValueAtTime(420 * pitch, at + 0.09);
  osc.frequency.exponentialRampToValueAtTime(300 * pitch, at + 0.42);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.6, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
  osc.connect(gain);
  gain.connect(out.sfx);
  osc.start(at);
  osc.stop(at + 0.55);
  // A soft bell on top makes it sound cheerful.
  const bell = ctx.createOscillator();
  const bellGain = ctx.createGain();
  bell.frequency.value = midi(SCALE[Math.floor(Math.random() * 4) + 2] + 12);
  bellGain.gain.setValueAtTime(0.09, at + 0.03);
  bellGain.gain.exponentialRampToValueAtTime(0.001, at + 0.9);
  bell.connect(bellGain);
  bellGain.connect(out.sfx);
  bell.start(at + 0.03);
  bell.stop(at + 1);
}

function playCrash(out: Output, at: number, strength: number) {
  const { ctx } = out;
  const level = 0.3 + strength * 0.4;
  // Rustling leaves.
  const leaves = ctx.createBufferSource();
  leaves.buffer = noiseBuffer(ctx, 0.8);
  const bright = ctx.createBiquadFilter();
  bright.type = "bandpass";
  bright.frequency.setValueAtTime(4200, at);
  bright.frequency.exponentialRampToValueAtTime(1600, at + 0.6);
  bright.Q.value = 0.7;
  const leafGain = ctx.createGain();
  leafGain.gain.setValueAtTime(0, at);
  leafGain.gain.linearRampToValueAtTime(level * 0.8, at + 0.02);
  leafGain.gain.exponentialRampToValueAtTime(0.001, at + 0.75);
  leaves.connect(bright);
  bright.connect(leafGain);
  leafGain.connect(out.sfx);
  leaves.start(at);
  // A snapped twig.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.08);
  const snapFilter = ctx.createBiquadFilter();
  snapFilter.type = "highpass";
  snapFilter.frequency.value = 1800;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(level * 0.5, at);
  snapGain.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
  snap.connect(snapFilter);
  snapFilter.connect(snapGain);
  snapGain.connect(out.sfx);
  snap.start(at);
  // The soft thud of the trunk.
  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.frequency.setValueAtTime(120, at);
  thud.frequency.exponentialRampToValueAtTime(52, at + 0.18);
  thudGain.gain.setValueAtTime(level, at);
  thudGain.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
  thud.connect(thudGain);
  thudGain.connect(out.sfx);
  thud.start(at);
  thud.stop(at + 0.3);
}

/** A short rising run of soft bells. */
function playBells(out: Output, at: number, notes: number[], level: number) {
  const { ctx } = out;
  notes.forEach((note, i) => {
    const start = at + i * 0.13;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + 1.6);
    gain.connect(out.sfx);
    for (const [ratio, amount] of [
      [1, 1],
      [2.76, 0.12],
    ]) {
      const osc = ctx.createOscillator();
      const part = ctx.createGain();
      part.gain.value = amount;
      osc.frequency.value = midi(note) * ratio;
      osc.connect(part);
      part.connect(gain);
      osc.start(start);
      osc.stop(start + 1.7);
    }
  });
}

const PICKUP = [74, 81];
const DELIVERED = [74, 78, 81, 86];

/** A puff of air from one wingbeat. */
function playBeat(out: Output, at: number, strength: number) {
  const { ctx } = out;
  const source = ctx.createBufferSource();
  source.buffer = brownBuffer(ctx, 0.35);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.4;
  filter.frequency.setValueAtTime(190, at);
  filter.frequency.linearRampToValueAtTime(520, at + 0.07);
  filter.frequency.exponentialRampToValueAtTime(130, at + 0.3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.42 + strength * 0.5, at + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(out.sfx);
  source.start(at);
}

/** Feet or shoulder meeting the ground: a soft, low bump with no crack to it. */
function playThud(out: Output, at: number, strength: number) {
  const { ctx } = out;
  const level = 0.25 + strength * 0.45;
  const thud = ctx.createOscillator();
  const gain = ctx.createGain();
  thud.frequency.setValueAtTime(95, at);
  thud.frequency.exponentialRampToValueAtTime(42, at + 0.25);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
  thud.connect(gain);
  gain.connect(out.sfx);
  thud.start(at);
  thud.stop(at + 0.45);
  const dust = ctx.createBufferSource();
  dust.buffer = brownBuffer(ctx, 0.6);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  const dustGain = ctx.createGain();
  dustGain.gain.setValueAtTime(level * 0.9, at);
  dustGain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
  dust.connect(filter);
  filter.connect(dustGain);
  dustGain.connect(out.sfx);
  dust.start(at);
}

/** Two low, soft notes, a nudge to pull up rather than an alarm. */
function playWarn(out: Output, at: number) {
  const { ctx } = out;
  [69, 64].forEach((note, i) => {
    const start = at + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = midi(note);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.09, start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
    osc.connect(gain);
    gain.connect(out.sfx);
    osc.start(start);
    osc.stop(start + 0.75);
  });
}

export type Scene = {
  wind: number;
  windTone: number;
  rush: number;
  spray: number;
  falls: number;
  rain: number;
  /** 0 to 1, how high above the ground you are. */
  high: number;
  /** 0 to 1, how close to a village you are. */
  village: number;
  cave: number;
  night: number;
};

type Beds = { wind: GainNode; windFilter: BiquadFilterNode; rush: GainNode; spray: GainNode; falls: GainNode; rain: GainNode };

function loopInto(out: Output, type: BiquadFilterType, frequency: number, q: number, soft = false) {
  const { ctx } = out;
  const source = ctx.createBufferSource();
  source.buffer = soft ? brownBuffer(ctx, 6) : noiseBuffer(ctx, 5);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(out.sfx);
  source.start();
  return { gain, filter };
}

/** The sounds that never stop, only swell: the air, the water and the rain. */
function buildBeds(out: Output): Beds {
  // The air is all deep, soft noise through gentle low-pass filters, so even a full-speed
  // dive sounds like a long exhale rather than a hiss.
  const wind = loopInto(out, "lowpass", 400, 0.3, true);
  return {
    wind: wind.gain,
    windFilter: wind.filter,
    rush: loopInto(out, "lowpass", 650, 0.2, true).gain,
    spray: loopInto(out, "bandpass", 1500, 0.3).gain,
    falls: loopInto(out, "lowpass", 1100, 0.3).gain,
    rain: loopInto(out, "bandpass", 5200, 0.4).gain,
  };
}

function applyScene(ctx: BaseAudioContext, beds: Beds, mix: Mix, s: Scene) {
  const now = ctx.currentTime;
  const set = (param: AudioParam, value: number, ease = 0.25) => param.setTargetAtTime(value, now, ease);
  // Slow easing, so speeding up swells the air instead of switching it on.
  set(beds.wind.gain, s.wind, 0.6);
  set(beds.windFilter.frequency, s.windTone, 0.8);
  set(beds.rush.gain, s.rush, 0.9);
  set(beds.spray.gain, s.spray, 0.12);
  set(beds.falls.gain, s.falls);
  set(beds.rain.gain, s.rain, 0.8);

  set(mix.padTrim.frequency, 30, 1.6);
  set(mix.padLevel.gain, 1 - s.high * 0.3, 1.6);
  set(mix.pluckLevel.gain, 1 - s.village * 0.3, 1.6);
  set(mix.warmLevel.gain, s.village * 0.8, 1.6);
  set(mix.highLevel.gain, s.high, 1.6);
  set(mix.wet.gain, 0.28 + s.high * 0.12 + s.cave * 0.25, 1.6);
  set(mix.sfxRoom.gain, 0.18 + s.cave * 0.55, 0.5);
  set(mix.musicTone.frequency, s.cave > 0.5 ? 950 : 3200, 0.8);
  set(mix.musicLevel.gain, 0.6 * (1 - s.night * 0.22), 2);
}

export const SILENT: Scene = { wind: 0, windTone: 400, rush: 0, spray: 0, falls: 0, rain: 0, high: 0, village: 0, cave: 0, night: 0 };

let beds: Beds | null = null;
let context: AudioContext | null = null;
let output: (Output & { master: GainNode; mix: Mix }) | null = null;
let muted = false;
let timer: ReturnType<typeof setInterval> | undefined;

/** Must be called from a click or key press, because browsers block sound before that. */
export function startAudio() {
  if (context) {
    void context.resume();
    return;
  }
  context = new AudioContext();
  output = buildOutput(context, context.destination);
  output.master.gain.value = muted ? 0 : 1;
  beds = buildBeds(output);
  void context.resume();
  let bar = 0;
  let next = context.currentTime + 0.15;
  const pump = () => {
    if (!context || !output) return;
    while (next < context.currentTime + 6) {
      scheduleBar(output, bar++, next);
      next += CHORD_SECONDS;
    }
  };
  pump();
  timer = setInterval(pump, 2000);
  document.addEventListener("visibilitychange", onVisibility);
}

function onVisibility() {
  if (!context) return;
  if (document.hidden) void context.suspend();
  else void context.resume();
}

export function stopAudio() {
  clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisibility);
  void context?.close();
  context = null;
  output = null;
  beds = null;
}

export const audioState = () => context?.state ?? "not started";

export function setMuted(value: boolean) {
  muted = value;
  if (context && output) output.master.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.08);
}

export function bounceSound() {
  if (context && output) playBounce(output, context.currentTime);
}

export function crashSound(strength: number) {
  if (context && output) playCrash(output, context.currentTime, strength);
}

export function thudSound(strength: number) {
  if (context && output) playThud(output, context.currentTime, strength);
}

export function warnSound() {
  if (context && output) playWarn(output, context.currentTime);
}

export function wingBeatSound(strength: number) {
  if (context && output) playBeat(output, context.currentTime, strength);
}

export function setScene(scene: Scene) {
  if (context && output && beds) applyScene(context, beds, output.mix, scene);
}

export function pickupSound() {
  if (context && output) playBells(output, context.currentTime, PICKUP, 0.14);
}

export function deliveredSound() {
  if (context && output) playBells(output, context.currentTime, DELIVERED, 0.16);
}

/** Renders sound with no speakers, so a test can check levels. */
export async function renderForTest(kind: "music" | "bounce" | "crash" | "beat" | "fast" | "falls", seconds: number) {
  const ctx = new OfflineAudioContext(2, 44100 * seconds, 44100);
  const out = buildOutput(ctx, ctx.destination);
  if (kind === "music") {
    for (let i = 0; i * CHORD_SECONDS < seconds; i++) scheduleBar(out, i, i * CHORD_SECONDS);
  } else if (kind === "bounce") {
    playBounce(out, 0.05);
  } else if (kind === "beat") {
    playBeat(out, 0.05, 0.55);
  } else if (kind === "fast" || kind === "falls") {
    const test = buildBeds(out);
    const scene = kind === "fast" ? { ...SILENT, wind: 0.34, windTone: 1100, rush: 0.15 } : { ...SILENT, falls: 0.32 };
    applyScene(ctx, test, out.mix, scene);
  } else {
    playCrash(out, 0.05, 1);
  }
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (const v of data) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / data.length).toFixed(4) };
}
