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

// A slow, unresolved loop in D major that never feels like it's heading anywhere.
const CHORDS = [
  [50, 57, 62, 66, 69, 76], // Dmaj add9
  [43, 55, 62, 67, 71, 74], // Gmaj
  [47, 54, 62, 66, 69, 74], // Bm7
  [45, 57, 62, 64, 69, 76], // Asus4
];
const CHORD_SECONDS = 14;
const SCALE = [74, 76, 78, 81, 83, 86, 88, 90];

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

/** Builds the mix: music and effects go through soft compression, with a shared room. */
function buildOutput(ctx: BaseAudioContext, destination: AudioNode): Output & { master: GainNode; mix: Mix } {
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.ratio.value = 6;
  master.connect(limiter);
  limiter.connect(destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 4.5, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet);
  wet.connect(master);

  const music = ctx.createGain();
  music.gain.value = 0.8;
  const musicTone = ctx.createBiquadFilter();
  musicTone.type = "lowpass";
  musicTone.frequency.value = 18000;
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

function padNote(out: Output, freq: number, start: number, length: number, level: number, bus: AudioNode = out.pads) {
  const { ctx } = out;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.3;
  filter.frequency.setValueAtTime(420, start);
  filter.frequency.linearRampToValueAtTime(1050, start + length * 0.55);
  filter.frequency.linearRampToValueAtTime(420, start + length);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + length * 0.4);
  gain.gain.setValueAtTime(level, start + length * 0.6);
  gain.gain.linearRampToValueAtTime(0, start + length);
  filter.connect(gain);
  gain.connect(bus);
  for (const [type, detune, amount] of [
    ["triangle", -6, 0.6],
    ["triangle", 6, 0.6],
    ["sine", 0, 0.8],
  ] as const) {
    const osc = ctx.createOscillator();
    const part = ctx.createGain();
    part.gain.value = amount;
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(part);
    part.connect(filter);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

function pluck(out: Output, freq: number, start: number, level: number, bus: AudioNode = out.plucks) {
  const { ctx } = out;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.2);
  gain.connect(bus);
  for (const [ratio, amount] of [
    [1, 1],
    [2, 0.22],
    [3.01, 0.06],
  ]) {
    const osc = ctx.createOscillator();
    const part = ctx.createGain();
    part.gain.value = amount;
    osc.frequency.value = freq * ratio;
    osc.connect(part);
    part.connect(gain);
    osc.start(start);
    osc.stop(start + 3.3);
  }
}

/** Schedules one chord's worth of music: the pad, and a few unhurried notes on top. */
function scheduleBar(out: Output, bar: number, start: number) {
  const chord = CHORDS[bar % CHORDS.length];
  chord.forEach((note, i) => {
    padNote(out, midi(note), start, CHORD_SECONDS + 5, i === 0 ? 0.075 : 0.042);
  });
  let t = start + 1.5 + Math.random() * 3;
  let last = Math.floor(Math.random() * SCALE.length);
  while (t < start + CHORD_SECONDS) {
    // Step to a nearby note, so the line wanders instead of jumping.
    last = Math.max(0, Math.min(SCALE.length - 1, last + Math.round((Math.random() - 0.5) * 4)));
    pluck(out, midi(SCALE[last]), t, 0.05 + Math.random() * 0.035);
    t += 2.2 + Math.random() * 3.6;
  }
  // Near the villages, a warm plucked pattern like someone playing on a doorstep.
  const low = [...chord].sort((a, b) => a - b).slice(0, 5);
  const beat = CHORD_SECONDS / 14;
  for (let i = 0; i < 14; i++) {
    if (i % 7 === 6) continue;
    const note = low[[0, 2, 3, 1, 4, 2][i % 6]];
    pluck(out, midi(note + (note < 50 ? 12 : 0)), start + i * beat + Math.random() * 0.03, 0.05 + Math.random() * 0.018, out.warm);
  }
  // High up, thin glassy tones hang over everything.
  for (const note of [chord[3] + 24, chord[5] + 12]) {
    padNote(out, midi(note), start + 2 + Math.random() * 4, CHORD_SECONDS - 2, 0.016, out.high);
  }
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
  bell.frequency.value = midi(SCALE[Math.floor(Math.random() * 4) + 2]);
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
  source.buffer = noiseBuffer(ctx, 0.35);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.8;
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

function loopInto(out: Output, type: BiquadFilterType, frequency: number, q: number) {
  const { ctx } = out;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 5);
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
  const wind = loopInto(out, "bandpass", 400, 0.5);
  return {
    wind: wind.gain,
    windFilter: wind.filter,
    rush: loopInto(out, "highpass", 2200, 0.4).gain,
    spray: loopInto(out, "highpass", 3400, 0.5).gain,
    falls: loopInto(out, "lowpass", 1100, 0.3).gain,
    rain: loopInto(out, "bandpass", 5200, 0.4).gain,
  };
}

function applyScene(ctx: BaseAudioContext, beds: Beds, mix: Mix, s: Scene) {
  const now = ctx.currentTime;
  const set = (param: AudioParam, value: number, ease = 0.25) => param.setTargetAtTime(value, now, ease);
  set(beds.wind.gain, s.wind);
  set(beds.windFilter.frequency, s.windTone);
  set(beds.rush.gain, s.rush);
  set(beds.spray.gain, s.spray, 0.12);
  set(beds.falls.gain, s.falls);
  set(beds.rain.gain, s.rain, 0.8);

  set(mix.padTrim.frequency, 30 + s.high * 340, 1.6);
  set(mix.padLevel.gain, 1 - s.high * 0.42, 1.6);
  set(mix.pluckLevel.gain, 1 - s.village * 0.3, 1.6);
  set(mix.warmLevel.gain, s.village, 1.6);
  set(mix.highLevel.gain, s.high, 1.6);
  set(mix.wet.gain, 0.5 + s.high * 0.25 + s.cave * 0.3, 1.6);
  set(mix.sfxRoom.gain, 0.18 + s.cave * 0.55, 0.5);
  set(mix.musicTone.frequency, s.cave > 0.5 ? 950 : 18000, 0.8);
  set(mix.musicLevel.gain, 0.8 * (1 - s.night * 0.22), 2);
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
