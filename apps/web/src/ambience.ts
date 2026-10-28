// The music: a slow, low drone of a few voices drifting from chord to chord over a deep root, a wind of noise,
// and now and then a plucked note, a distant thump, a fall of stones or a hollow breath. Earth, not space: each
// world has a score of its own (SCORES), all rooted on D so the opening (openingSound.ts) flows into any of them.
// It plays from the lobby on while music is on and the page is visible (once the browser lets sound start, after
// the first tap or key), fading in and out; the lobby has Mars's, and a game has that of its world.
//
// Everything it builds is let go when it stops: the sources stop, and once the fade is over every lasting
// node is disconnected, since the echo is a loop that would otherwise keep itself alive. The reverb is shared
// with the opening, and kept (audio.ts).

import { audio, contour, filter, gain, hz, isOn, noiseSource, onSwitch, oscillator, panner, reverb, spread } from './audio';
import type { World } from '@regolith/engine';
import { opening } from './openingSound';
import { pick, rand } from './random';

const FADE_IN = 6;
const FADE_OUT = 2.5;
/** Longer than any game, in seconds: the drone's sources are stopped when it fades out. */
const FOREVER = 60 * 60 * 24;

type Range = [number, number];

/**
 * How a world sounds. The pad is a few voices on `chords` (MIDI notes, low voice first, as many in each), each
 * gliding to its note in the next chord a little after the one below it, so a change drifts in like a slow
 * melody. Over it, on their own timers: plucks, from a scale; and for some worlds thumps, stones and breaths.
 */
interface Score {
  chords: number[][];
  wave: 'sawtooth' | 'triangle';
  padLevel: number;
  /** The pad's lowpass: where it sits, and how far it swings. */
  cutoff: number;
  sweep: number;
  /** A sine under the bass voice, `shift` semitones from it. */
  sub: { shift: number; level: number };
  /** Band-passed noise: where it sits, how far it wanders, how loud, and how much it gusts (0 to 1). */
  wind: { freq: number; sweep: number; level: number; gust: number };
  /** How much of the sound goes to the reverb: little, for a dry and close earth. */
  reverb: number;
  echo: { time: number; feedback: number };
  /** A plucked note: partials as [ratio, level], seconds between plucks. */
  pluck: {
    scale: number[];
    range: Range;
    wave: OscillatorType;
    partials: [number, number][];
    bright: number;
    level: number;
    decay: number;
    every: Range;
  };
  /** A soft drum that falls in pitch, like a footfall; `double` makes it a heartbeat. */
  thump?: { note: number; level: number; decay: number; every: Range; double: boolean };
  /** A few stones knocking: bursts of noise at pitches within `freq`. */
  stones?: { freq: Range; level: number; every: Range };
  /** A hollow, breathy tone swelling and fading, from the pluck's scale. */
  breath?: { range: Range; level: number; seconds: number; every: Range };
}

// Pitch classes of the scales the plucks play: C = 0, D = 2.
const SCORES: Record<World, Score> = {
  // Warm, dusty and wide: open fifths on D minor, a slow heartbeat underneath, dry wind, kalimba-like plucks.
  mars: {
    chords: [
      [38, 45, 53, 57], // Dm
      [34, 41, 50, 53], // B♭
      [36, 43, 52, 55], // C
      [33, 40, 48, 55], // Am7
    ],
    wave: 'sawtooth',
    padLevel: 0.024,
    cutoff: 480,
    sweep: 160,
    sub: { shift: 0, level: 0.06 },
    wind: { freq: 380, sweep: 220, level: 0.035, gust: 0.8 },
    reverb: 0.45,
    echo: { time: 0.62, feedback: 0.3 },
    pluck: {
      scale: [2, 5, 7, 9, 0],
      range: [50, 74],
      wave: 'sine',
      partials: [
        [1, 1],
        [4, 0.12],
      ],
      bright: 1600,
      level: 0.06,
      decay: 1.8,
      every: [7, 14],
    },
    thump: { note: 38, level: 0.16, decay: 0.7, every: [7, 13], double: true },
  },
  // Phobos: a low, battered rock. The chords sit down in the cellar and lean on E♭, with deep slow knocks and
  // stones falling in the dark.
  phobos: {
    chords: [
      [26, 33, 38, 45], // D
      [27, 34, 39, 46], // E♭
      [26, 33, 41, 45], // Dm
      [24, 31, 36, 43], // C
    ],
    wave: 'sawtooth',
    padLevel: 0.028,
    cutoff: 330,
    sweep: 110,
    sub: { shift: 12, level: 0.07 },
    wind: { freq: 260, sweep: 140, level: 0.03, gust: 0.5 },
    reverb: 0.35,
    echo: { time: 0.95, feedback: 0.38 },
    pluck: {
      scale: [2, 3, 7, 9, 0],
      range: [38, 62],
      wave: 'triangle',
      partials: [
        [1, 1],
        [2.4, 0.1],
      ],
      bright: 900,
      level: 0.08,
      decay: 1.3,
      every: [9, 18],
    },
    thump: { note: 33, level: 0.2, decay: 1, every: [10, 18], double: false },
    stones: { freq: [700, 2400], level: 0.05, every: [7, 15] },
  },
  // Deimos: smaller, paler and calmer. Higher, lighter chords in A and D, hollow reed-like breaths, a few pebbles.
  deimos: {
    chords: [
      [45, 52, 57, 64], // A
      [43, 50, 55, 62], // G
      [38, 45, 52, 57], // Dsus
      [41, 48, 57, 60], // F
    ],
    wave: 'triangle',
    padLevel: 0.04,
    cutoff: 760,
    sweep: 240,
    sub: { shift: -12, level: 0.03 },
    wind: { freq: 560, sweep: 300, level: 0.03, gust: 0.9 },
    reverb: 0.6,
    echo: { time: 0.72, feedback: 0.4 },
    pluck: {
      scale: [2, 4, 7, 9, 11],
      range: [62, 81],
      wave: 'triangle',
      partials: [
        [1, 1],
        [3, 0.1],
      ],
      bright: 2400,
      level: 0.045,
      decay: 3,
      every: [9, 17],
    },
    stones: { freq: [2000, 4200], level: 0.025, every: [11, 22] },
    breath: { range: [55, 74], level: 0.024, seconds: 6, every: [12, 20] },
  },
};

/** The world whose score plays when no game is on screen. */
const LOBBY: World = 'mars';

interface Drone {
  ac: AudioContext;
  world: World;
  score: Score;
  bus: GainNode;
  /** Where plucks and breaths go: the echo, then the reverb. */
  chimes: AudioNode;
  voices: OscillatorNode[][];
  /** The sine under the bass voice. */
  sub?: OscillatorNode;
  sources: AudioScheduledSourceNode[];
  /** The nodes that last as long as the drone, disconnected when it has faded out. */
  nodes: AudioNode[];
  timers: Set<number>;
  chord: number;
}

let wanted = 0;
/** The world of the game on screen, if any. */
let onScreen: World | null = null;
let drone: Drone | null = null;
/** The lobby's title is showing on first opening: the drone waits for the opening (`holdForTitle`). */
let holding = false;
/** The music has begun since the page loaded: the opening is only for an app that opens on the lobby. */
let begun = false;

/** Starts the music, for as long as the app is open; returns the way to stop it (for a React effect). */
export function ambience(): () => void {
  wanted++;
  sync();
  return () => {
    wanted--;
    sync();
  };
}

/** Has the music be that of `w`'s score (a game's world), for as long as it is on screen; returns the way to stop (for a React effect). */
export function playWorld(w: World): () => void {
  onScreen = w;
  sync();
  return () => {
    if (onScreen === w) onScreen = null;
    sync();
  };
}

function sync() {
  const play = wanted > 0 && !holding && isOn('music') && document.visibilityState === 'visible';
  if (play && !drone) {
    const ac = audio();
    if (ac) {
      drone = start(ac, onScreen ?? LOBBY);
      begun = true;
    }
  } else if (play && drone && drone.world !== (onScreen ?? LOBBY)) {
    // To another world's score: the old fades out as the new fades in.
    const ac = drone.ac;
    stop(drone, FADE_OUT);
    drone = start(ac, onScreen ?? LOBBY);
  } else if (!play && drone) {
    // Hidden, the audio is suspended at once (audio.ts): a fade would only be heard on return, over the new drone.
    stop(drone, document.visibilityState === 'hidden' ? 0 : FADE_OUT);
    drone = null;
  }
}
onSwitch(sync);
document.addEventListener('visibilitychange', sync);
// In development a code change swaps this module for a new one: stop this one's drone, or it plays on.
import.meta.hot?.dispose(() => {
  wanted = 0;
  sync();
});

/**
 * The lobby's title is showing on the app's first screen: the drone waits. `open` plays the opening, as the title
 * is about to rise, and resolves when it is heard, so the title rises with its rush; the drone then comes in under
 * its tail, so one flows into the other. Where the browser doesn't yet let sound start (no click yet), there is no
 * opening: `open` resolves at once, and the drone comes in with the first click. If the music has already begun
 * (the app reopened on a game, then went to the lobby), it plays on and there is no opening. `release` says the
 * title has gone.
 */
export function holdForTitle(): { open: () => Promise<void>; release: () => void } {
  if (begun) return { open: () => Promise.resolve(), release: () => {} };
  holding = true;
  sync();
  let opened: Promise<void> | null = null;
  return {
    open: () => (opened ??= playOpening()),
    release: () => {
      if (!opened) letGo();
    },
  };
}

function letGo() {
  holding = false;
  sync();
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function playOpening() {
  const ac = isOn('music') ? audio() : null;
  if (!ac || !(ac.state === 'running' || navigator.userActivation?.hasBeenActive)) return letGo();
  // The audio may only just be starting (a phone takes a moment): the opening's times only run once it has.
  await Promise.race([ac.resume().catch(() => undefined), wait(500)]);
  if (ac.state !== 'running' || !isOn('music') || document.visibilityState !== 'visible') return letGo();
  const { start, land } = opening(ac);
  // The drone is built once the chord has bloomed, not with the opening: on a phone, building and playing
  // both at once makes the opening stutter.
  window.setTimeout(
    () => {
      letGo();
      if (drone) fadeIn(drone, ac.currentTime + 1, 7);
    },
    (land + 1 - ac.currentTime) * 1000,
  );
  // Until it comes out of the speaker, which on a phone is a good while after it is played.
  await wait((start - ac.currentTime + ac.baseLatency + (ac.outputLatency || 0)) * 1000);
}

/** A slow sine wobbling `param` by `depth` around its value. */
function lfo(ac: AudioContext, d: Drone, param: AudioParam, rate: number, depth: number) {
  const osc = source(d, oscillator(ac, 'sine', rate, ac.currentTime, ac.currentTime + FOREVER));
  osc.connect(keep(d, gain(ac, depth))).connect(param);
}

/** `node`, to be disconnected when the drone has faded out. */
function keep<T extends AudioNode>(d: Drone, node: T): T {
  d.nodes.push(node);
  return node;
}

/** `node`, a source to stop when the drone fades out. */
function source<T extends AudioScheduledSourceNode>(d: Drone, node: T): T {
  d.sources.push(node);
  return keep(d, node);
}

function start(ac: AudioContext, world: World): Drone {
  const t = ac.currentTime;
  const score = SCORES[world];
  // The drone fades in and out on its way into the reverb, which rings on as it fades out.
  const bus = gain(ac, 0);
  const d: Drone = { ac, world, score, bus, chimes: bus, voices: [], sources: [], nodes: [bus], timers: new Set(), chord: 0 };
  fadeIn(d, t, FADE_IN);
  bus.connect(keep(d, gain(ac, 0.45))).connect(ac.destination);
  bus.connect(keep(d, gain(ac, score.reverb))).connect(reverb(ac));

  // The plucks and breaths ring through a dark echo before the reverb.
  const echo = keep(d, ac.createDelay(2));
  echo.delayTime.value = score.echo.time;
  echo
    .connect(keep(d, filter(ac, 'lowpass', 1400)))
    .connect(keep(d, gain(ac, score.echo.feedback)))
    .connect(echo);
  echo.connect(bus);
  d.chimes = keep(d, gain(ac, 1));
  d.chimes.connect(bus);
  d.chimes.connect(echo);

  // The pad: pairs of detuned voices, darkened by a lowpass that slowly opens and closes.
  const pad = keep(d, filter(ac, 'lowpass', score.cutoff, 0.6));
  pad.connect(bus);
  lfo(ac, d, pad.frequency, 0.019, score.sweep);
  const chord = score.chords[0];
  chord.forEach((note, i) => {
    const level = keep(d, gain(ac, score.padLevel));
    // Each voice breathes at its own pace.
    lfo(ac, d, level.gain, rand(0.03, 0.08), score.padLevel * 0.6);
    level.connect(keep(d, panner(ac, spread(i, chord.length, 0.55)))).connect(pad);
    const pair = [-6, 6].map((cents) => {
      const osc = source(d, oscillator(ac, score.wave, hz(note), t, t + FOREVER));
      osc.detune.value = cents + rand(-2, 2);
      osc.connect(level);
      return osc;
    });
    d.voices.push(pair);
  });

  // The ground: a sine under the bass voice, which follows it.
  if (score.sub.level) {
    d.sub = source(d, oscillator(ac, 'sine', hz(chord[0] + score.sub.shift), t, t + FOREVER));
    d.sub.connect(keep(d, gain(ac, score.sub.level))).connect(bus);
  }

  // The wind: band-passed noise whose pitch wanders and whose strength gusts.
  const { wind } = score;
  const blow = source(d, noiseSource(ac, t, t + FOREVER));
  const band = keep(d, filter(ac, 'bandpass', wind.freq, 0.7));
  lfo(ac, d, band.frequency, 0.013, wind.sweep);
  const gusts = keep(d, gain(ac, wind.level * (1 - wind.gust / 2)));
  lfo(ac, d, gusts.gain, rand(0.04, 0.09), wind.level * wind.gust * 0.5);
  blow.connect(band).connect(gusts).connect(bus);

  later(d, rand(22, 32), () => changeChord(d));
  repeat(d, [3, 6], score.pluck.every, pluck);
  if (score.thump) repeat(d, [2, 5], score.thump.every, thump);
  if (score.stones) repeat(d, [5, 10], score.stones.every, stones);
  if (score.breath) repeat(d, [6, 10], score.breath.every, breath);
  return d;
}

/** Runs `fn` after `first` seconds, then again and again, `every` seconds apart. */
function repeat(d: Drone, first: Range, every: Range, fn: (d: Drone) => void) {
  const go = () => {
    fn(d);
    later(d, rand(...every), go);
  };
  later(d, rand(...first), go);
}

/**
 * Runs `fn` in `seconds`, unless the drone stops first. While the audio is suspended (a phone's app losing focus,
 * audio.ts) it waits again: its time stands still, and chimes played then would all ring out at once on return.
 */
function later(d: Drone, seconds: number, fn: () => void) {
  const id = window.setTimeout(() => {
    d.timers.delete(id);
    if (d.ac.state === 'running') fn();
    else later(d, seconds, fn);
  }, seconds * 1000);
  d.timers.add(id);
}

function changeChord(d: Drone) {
  const { ac, score } = d;
  let next = Math.floor(Math.random() * (score.chords.length - 1));
  if (next >= d.chord) next++;
  d.chord = next;
  score.chords[next].forEach((note, i) => {
    const at = ac.currentTime + i * rand(0.6, 1.4);
    for (const osc of d.voices[i]) osc.frequency.setTargetAtTime(hz(note), at, 2.2);
  });
  d.sub?.frequency.setTargetAtTime(hz(score.chords[next][0] + score.sub.shift), ac.currentTime, 2.2);
  later(d, rand(24, 36), () => changeChord(d));
}

/** A note of the world's scale, within `range`. */
function inScale(scale: number[], [lo, hi]: Range): number {
  const notes: number[] = [];
  for (let n = lo; n <= hi; n++) if (scale.includes(n % 12)) notes.push(n);
  return pick(notes);
}

/** One plucked note, a little less often followed by a second. */
function pluck(d: Drone, again = true) {
  const { ac, score } = d;
  const p = score.pluck;
  const note = inScale(p.scale, p.range);
  const at = ac.currentTime + 0.05;
  const env = contour(ac, at, [
    [0.008, p.level],
    [p.decay, 0],
  ]);
  env
    .connect(filter(ac, 'lowpass', p.bright, 0.5))
    .connect(panner(ac, rand(-0.6, 0.6)))
    .connect(d.chimes);
  for (const [ratio, level] of p.partials)
    oscillator(ac, p.wave, hz(note) * ratio, at, at + p.decay + 0.1)
      .connect(gain(ac, level))
      .connect(env);
  if (again && Math.random() < 0.3) later(d, rand(0.5, 1), () => pluck(d, false));
}

/** A soft drum falling in pitch, far off; a heartbeat is two, the second softer. */
function thump(d: Drone, again = true) {
  const { ac, score } = d;
  const t = score.thump!;
  const at = ac.currentTime + 0.05;
  const strength = again ? 1 : 0.6;
  const env = contour(ac, at, [
    [0.015, t.level * strength],
    [t.decay, 0],
  ]);
  env.connect(d.bus);
  const osc = oscillator(ac, 'sine', hz(t.note) * 1.5, at, at + t.decay + 0.1);
  osc.frequency.exponentialRampToValueAtTime(hz(t.note), at + 0.18);
  osc.connect(env);
  if (again && t.double) later(d, 0.52, () => thump(d, false));
}

/** A few stones knocking, a little way off. */
function stones(d: Drone) {
  const { ac, score } = d;
  const s = score.stones!;
  const pan = rand(-0.8, 0.8);
  let at = ac.currentTime + 0.05;
  for (let i = Math.floor(rand(2, 6)); i > 0; i--) {
    const click = contour(ac, at, [
      [0.003, s.level * rand(0.4, 1)],
      [0.07, 0],
    ]);
    noiseSource(ac, at, at + 0.1)
      .connect(filter(ac, 'bandpass', rand(...s.freq), 5))
      .connect(click)
      .connect(panner(ac, pan + rand(-0.1, 0.1)))
      .connect(d.chimes);
    at += rand(0.04, 0.22);
  }
}

/** One hollow breath: a soft tone swelling slowly out of a puff of noise, from the pad's chord. */
function breath(d: Drone) {
  const { ac, score } = d;
  const b = score.breath!;
  const tones = score.chords[d.chord].map((n) => n % 12);
  const note = inScale(tones, b.range);
  const at = ac.currentTime + 0.05;
  const env = contour(ac, at, [
    [b.seconds * 0.4, b.level],
    [b.seconds, 0],
  ]);
  env.connect(panner(ac, rand(-0.6, 0.6))).connect(d.chimes);
  const end = at + b.seconds + 0.1;
  oscillator(ac, 'sine', hz(note), at, end).connect(env);
  oscillator(ac, 'triangle', hz(note) * 2, at, end)
    .connect(gain(ac, 0.15))
    .connect(env);
  noiseSource(ac, at, end)
    .connect(filter(ac, 'bandpass', hz(note), 10))
    .connect(gain(ac, 4))
    .connect(env);
}

/** Silent until `at`, then fading in over `seconds`. */
function fadeIn({ ac, bus }: Drone, at: number, seconds: number) {
  bus.gain.cancelScheduledValues(ac.currentTime);
  bus.gain.setValueAtTime(0, ac.currentTime);
  bus.gain.setValueAtTime(0, at);
  bus.gain.linearRampToValueAtTime(1, at + seconds);
}

function stop(d: Drone, fade: number) {
  const { ac, bus } = d;
  d.timers.forEach(clearTimeout);
  d.timers.clear();
  const t = ac.currentTime;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setValueAtTime(bus.gain.value, t);
  bus.gain.linearRampToValueAtTime(0, t + fade);
  for (const s of d.sources) s.stop(t + fade + 0.1);
  window.setTimeout(() => d.nodes.forEach((n) => n.disconnect()), (fade + 0.5) * 1000);
}
