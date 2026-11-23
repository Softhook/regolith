// The music: a slow, low drone of a few voices drifting from chord to chord over a deep root, a wind of noise,
// and over it, now and then, whatever its score has: plucked notes, distant thumps, falling stones, hollow breaths,
// a pulse of notes, singing bowls or a flute. Earth, not space. There are several scores (scores.ts), all rooted
// on D, so the opening (opening.ts) flows into any of them and each into any other. They play in a random order,
// each for several minutes, then slowly give way to another, so the music changes over a long session. The game
// steers it a little (components/GameScreen.tsx): a game starting brings a fresh score, and at its end the music
// sinks under the fanfare or lament (gameOver.ts). It plays from the lobby on while music is on and the page is
// visible (once the browser lets sound start, after the first tap or key), fading in and out.
//
// Everything it builds is let go when it stops: the sources stop, and once the fade is over every lasting
// node is disconnected, since the echo is a loop that would otherwise keep itself alive. The reverb is shared
// with the opening, and kept (core.ts).

import { audio, contour, filter, gain, hz, isOn, noiseSource, noteNumber, onSwitch, oscillator, panner, reverb, spread } from './core';
import { opening } from './opening';
import { PLAYLIST, type Range, type Score } from './scores';
import { pick, rand, shuffled } from '../random';

const FADE_IN = 6;
const FADE_OUT = 2.5;
/** Seconds one score plays before the next takes over. */
const STAY: Range = [300, 480];
/**
 * How the next takes over, in seconds. The old one's ornaments (plucks, pulses, songs) stop and it settles into
 * its drone, fading out over CROSSFADE while the new one's drone grows in under it; the new one's ornaments only
 * start once it has come in (SETTLE). The ear hears the ground shift slowly, then new things in it.
 */
const CROSSFADE = 40;
const SETTLE = 30;
/** A game starting brings the next score, unless this one has only played this long. */
const FRESH = 90;
/** At the end of a game the music sinks to this, under the fanfare or lament, for HUSH seconds, and comes back slowly. */
const DUCK = 0.15;
const HUSH = 9;
const RETURN = 20;
/** Coming back to the app, the music grows back in over about this many seconds rather than cutting straight in. */
const RETURN_IN = 3;
/** Longer than any game, in seconds: the drone's sources are stopped when it fades out. */
const FOREVER = 60 * 60 * 24;

/** Which score is playing (an index into PLAYLIST), and those still to come before the playlist goes round again. */
let current = Math.floor(Math.random() * PLAYLIST.length);
let toCome: number[] = [];

/** The next score: the rest in a shuffled order, then round again, never the same twice running. */
function nextScore(): number {
  if (!toCome.length) {
    toCome = shuffled(PLAYLIST.map((_, i) => i).filter((i) => i !== current));
  }
  return (current = toCome.shift()!);
}

interface Drone {
  ac: AudioContext;
  score: Score;
  bus: GainNode;
  /** After the bus, sinking under the end of a game (`hushForEnding`). */
  duck: GainNode;
  /** The ornaments that go on after their timers stop (the song's held note): hushed quickly when it stops. */
  parts: AudioParam[];
  /** When it started, on the audio clock. */
  began: number;
  /** Where plucks and breaths go: the echo, then the reverb. */
  chimes: AudioNode;
  voices: OscillatorNode[][];
  /** The sine under the bass voice. */
  sub?: OscillatorNode;
  sources: AudioScheduledSourceNode[];
  /** The nodes that last as long as the drone, disconnected when it has faded out. */
  nodes: AudioNode[];
  /** What it is to do next, by the audio clock's time (`later`). */
  queue: { due: number; fn: () => void }[];
  /** The one timer set, for the soonest of the queue, while the audio runs. */
  wake: number | null;
  stopped: boolean;
  chord: number;
}

let wanted = 0;
let drone: Drone | null = null;
/** Every drone still sounding: the one playing, and one fading out under it. */
const sounding = new Set<Drone>();
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

/** A game is starting: the music moves on to a fresh score, unless the one playing has only just begun. */
export function freshScore() {
  if (drone && drone.ac.currentTime - drone.began > FRESH && !hushed(drone)) moveOn(drone);
}

/** The audio clock's time until which the music is sunk under a game's end. */
let hushedTill = 0;
const hushed = (d: Drone) => d.ac.currentTime < hushedTill;

/** A game has ended: the music sinks under its fanfare or lament, then comes back slowly. */
export function hushForEnding() {
  if (!drone) return;
  const { ac, duck } = drone;
  const t = ac.currentTime;
  hushedTill = t + HUSH + RETURN;
  duck.gain.cancelScheduledValues(t);
  duck.gain.setValueAtTime(duck.gain.value, t);
  duck.gain.setTargetAtTime(DUCK, t, 0.6);
  duck.gain.setTargetAtTime(1, t + HUSH, RETURN / 4);
}

function sync() {
  // Hidden, the drone is kept, not stopped: the audio is suspended (core.ts), which costs nothing, and its queue
  // with it (`later`), so on return it carries on where it was.
  const play = wanted > 0 && !holding && isOn('music');
  const hidden = document.visibilityState === 'hidden';
  if (play && !drone && !hidden) {
    const ac = audio();
    if (ac) {
      drone = startDrone(ac, PLAYLIST[current], FADE_IN);
      begun = true;
    }
  } else if (!play && drone) {
    // Hidden, the audio is suspended: a fade would only be heard on return.
    stop(drone, hidden ? 0 : FADE_OUT);
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

/** Starts `score`, fading in over `fade` seconds (a crossfade's curve if `smooth`); its ornaments wait `settle`. */
function startDrone(ac: AudioContext, score: Score, fade: number, settle = 0, smooth = false): Drone {
  const t = ac.currentTime;
  // The drone fades in and out on its way into the reverb, which rings on as it fades out.
  const bus = gain(ac, 0);
  const duck = gain(ac, 1);
  const d: Drone = {
    ac,
    score,
    bus,
    duck,
    parts: [],
    began: t,
    chimes: bus,
    voices: [],
    sources: [],
    nodes: [bus, duck],
    queue: [],
    wake: null,
    stopped: false,
    chord: 0,
  };
  sounding.add(d);
  if (listening !== ac) {
    listening = ac;
    ac.addEventListener('statechange', () => onAudioState(ac));
  }
  if (smooth) {
    bus.gain.setValueAtTime(0, t);
    bus.gain.setValueCurveAtTime(EASE_IN, t, fade);
  } else fadeIn(d, t, fade);
  bus.connect(duck);
  // Coming in while the music is sunk under a game's end, it sinks too.
  if (hushed(d)) {
    duck.gain.setValueAtTime(DUCK, t);
    duck.gain.setTargetAtTime(1, Math.max(t, hushedTill - RETURN), RETURN / 4);
  }
  duck.connect(keep(d, gain(ac, 0.45))).connect(ac.destination);
  duck.connect(keep(d, gain(ac, score.reverb))).connect(reverb(ac));

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
  if (score.throb) {
    const throb = keep(d, gain(ac, 0.65));
    lfo(ac, d, throb.gain, score.throb, 0.35);
    pad.connect(throb).connect(bus);
  } else pad.connect(bus);
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

  later(d, settle + rand(22, 32), () => changeChord(d));
  const after = ([lo, hi]: Range): Range => [lo + settle, hi + settle];
  if (score.pluck) repeat(d, after([3, 6]), score.pluck.every, pluck);
  if (score.thump) repeat(d, after([2, 5]), score.thump.every, thump);
  if (score.stones) repeat(d, after([5, 10]), score.stones.every, stones);
  if (score.breath) repeat(d, after([6, 10]), score.breath.every, breath);
  if (score.bowl) repeat(d, after([1, 4]), score.bowl.every, bowl);
  const { arp: pulse, song: voice } = score;
  if (pulse) later(d, settle, () => arp(d, pulse));
  if (voice) later(d, settle, () => song(d, voice));
  later(d, rand(...STAY), () => moveOn(d));
  return d;
}

/** Equal-power curves for a crossfade: one rising as the other falls, the sum about as loud throughout. */
const EASE_IN = Float32Array.from({ length: 64 }, (_, i) => Math.sin(((i / 63) * Math.PI) / 2));
const EASE_OUT = EASE_IN.slice().reverse();

/** The playlist's next score comes in as this one goes out; not while the music is sunk under a game's end. */
function moveOn(d: Drone) {
  if (drone !== d) return;
  if (hushed(d)) return later(d, hushedTill - d.ac.currentTime + 5, () => moveOn(d));
  stop(d, CROSSFADE, true);
  drone = startDrone(d.ac, PLAYLIST[nextScore()], CROSSFADE, SETTLE, true);
}

/**
 * In development, the number keys play the scores: 1 the first in PLAYLIST, and so on, coming in over a few
 * seconds with all their parts at once, to hear each as wanted. The playlist goes on from there as usual.
 */
function audition(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return;
  const i = Number(e.key) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= PLAYLIST.length) return;
  current = i;
  toCome = [];
  console.info(`Music: ${PLAYLIST[i].name}`);
  if (!drone) return; // It starts on this score once the music is on.
  const { ac } = drone;
  hushedTill = 0;
  stop(drone, 4);
  drone = startDrone(ac, PLAYLIST[i], 4);
}
if (import.meta.env.DEV) {
  window.addEventListener('keydown', audition);
  import.meta.hot?.dispose(() => window.removeEventListener('keydown', audition));
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
 * Runs `fn` in `seconds` of the audio clock, unless the drone stops first. While the page is away the audio is
 * suspended (core.ts) and its clock stands still: so does the queue, with no timer set at all, and on return
 * everything carries on where it was.
 */
function later(d: Drone, seconds: number, fn: () => void) {
  if (d.stopped) return;
  d.queue.push({ due: d.ac.currentTime + seconds, fn });
  arm(d);
}

/** Sets the one timer for the soonest of the queue, if the audio is running. */
function arm(d: Drone) {
  if (d.wake !== null) clearTimeout(d.wake);
  d.wake = null;
  if (d.stopped || !d.queue.length || d.ac.state !== 'running') return;
  const due = Math.min(...d.queue.map((q) => q.due));
  d.wake = window.setTimeout(
    () => {
      d.wake = null;
      if (d.ac.state !== 'running') return; // Picked up again by onAudioState.
      const now = d.ac.currentTime + 0.01;
      const ready = d.queue.filter((q) => q.due <= now);
      d.queue = d.queue.filter((q) => q.due > now);
      for (const q of ready) if (!d.stopped) q.fn();
      arm(d);
    },
    Math.max(0, due - d.ac.currentTime) * 1000,
  );
}

/** The audio context whose suspending and resuming the music follows (`onAudioState`). */
let listening: AudioContext | null = null;
/** The audio was suspended while the music played (the app went away). */
let paused = false;

/**
 * The audio suspended or resumed: the drone's queue sleeps or wakes with it. Coming back, the music grows back in
 * rather than cutting in mid-chord at full strength.
 */
function onAudioState(ac: AudioContext) {
  if (ac.state !== 'running') {
    // Silenced now, while nothing plays: the audio comes back from silence. Silenced only once it is running
    // again, it would play a moment at full strength first, and drop, with a click.
    for (const d of sounding) {
      const g = d.duck.gain;
      g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(0, ac.currentTime);
    }
    if (sounding.size) paused = true;
    return;
  }
  if (paused) {
    paused = false;
    for (const d of sounding) growBack(d);
  }
  if (drone) arm(drone);
}

/**
 * The duck from silence (set as the audio stopped, `onAudioState`) back to where it should be: under a game's end
 * while that lasts, else full.
 */
function growBack(d: Drone) {
  const t = d.ac.currentTime;
  const g = d.duck.gain;
  if (hushed(d)) {
    g.setTargetAtTime(DUCK, t, RETURN_IN / 4);
    g.setTargetAtTime(1, Math.max(t + RETURN_IN, hushedTill - RETURN), RETURN / 4);
  } else g.setTargetAtTime(1, t, RETURN_IN / 4);
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

/** The notes of `scale` (pitch classes) within `range`, low to high. */
function scaleNotes(scale: number[], [lo, hi]: Range): number[] {
  const notes: number[] = [];
  for (let n = lo; n <= hi; n++) if (scale.includes(n % 12)) notes.push(n);
  return notes;
}

/** One plucked note, a little less often followed by a second. */
function pluck(d: Drone, again = true) {
  const { ac, score } = d;
  const p = score.pluck!;
  const note = pick(scaleNotes(p.scale, p.range));
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
  const note = pick(scaleNotes(tones, b.range));
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

/** A pulse of soft notes walking the chord, scheduled a little ahead on the audio clock so it keeps time. */
function arp(d: Drone, a: NonNullable<Score['arp']>) {
  const { ac } = d;
  // Fading in and out, from silence to full, over its swell; the counterpoint the other way about, on the same tide.
  const swell = keep(d, gain(ac, a.level / 2));
  const tide = source(d, oscillator(ac, 'sine', 1 / a.swell, ac.currentTime, ac.currentTime + FOREVER));
  tide.connect(keep(d, gain(ac, a.level / 2))).connect(swell.gain);
  const line = a.counter && counterpoint(d, a.counter, tide);
  swell.connect(keep(d, filter(ac, 'lowpass', a.bright, 0.7))).connect(d.chimes);
  let step = 0;
  let at = ac.currentTime + 0.5;
  const tick = () => {
    if (at < ac.currentTime) at = ac.currentTime + 0.05;
    // A second and a bit ahead, woken once a second: few wake-ups, and a chord change is heard within a second.
    while (at < ac.currentTime + 1.2) {
      const note = d.score.chords[d.chord][a.pattern[step % a.pattern.length]] + a.shift;
      if (line && step % 4 === 0) line(at, step % a.pattern.length === 0);
      // The first of each bar a touch stronger.
      const env = contour(ac, at, [
        [0.005, step % a.pattern.length ? 0.7 : 1],
        [a.decay, 0],
      ]);
      env.connect(panner(ac, Math.sin(step * 0.7) * 0.5)).connect(swell);
      oscillator(ac, 'sine', hz(note), at, at + a.decay + 0.05).connect(env);
      oscillator(ac, 'triangle', hz(note) * 2, at, at + a.decay + 0.05)
        .connect(gain(ac, 0.12))
        .connect(env);
      step++;
      at += a.step;
    }
    later(d, 1, tick);
  };
  tick();
}

/**
 * The pulse's counterpoint: one reedy voice of held notes, against the pulse on its tide (`arp`). Returns the way
 * to move it on, at each half bar: on the bar it goes to a note of the chord, a step or two on in the way it is
 * going, now and then turning; on the half bar it sometimes passes on a step to the next, and otherwise holds.
 */
function counterpoint(d: Drone, c: NonNullable<NonNullable<Score['arp']>['counter']>, tide: AudioNode) {
  const { ac } = d;
  const t = ac.currentTime;
  const swell = keep(d, gain(ac, c.level / 2));
  tide.connect(keep(d, gain(ac, -c.level / 2))).connect(swell.gain);
  const voice = keep(d, gain(ac, 0));
  d.parts.push(voice.gain);
  voice
    .connect(swell)
    .connect(keep(d, filter(ac, 'lowpass', 1500, 0.7)))
    .connect(keep(d, panner(ac, 0.35)))
    .connect(d.bus);

  const notes = scaleNotes(c.scale, c.range);
  let i = Math.floor(notes.length / 2);
  let dir = pick([-1, 1]);
  // Two triangles a few cents apart, so it breathes a little, as a reed does.
  const oscs = [-5, 5].map((cents) => {
    const o = source(d, oscillator(ac, 'triangle', hz(notes[i]), t, t + FOREVER));
    o.detune.value = cents;
    o.connect(voice);
    return o;
  });
  let singing = false;
  const sing = (at: number) => {
    for (const o of oscs) o.frequency.setTargetAtTime(hz(notes[i]), at, singing ? 0.03 : 0.001);
    // Each new note leans in a little.
    if (singing) voice.gain.setTargetAtTime(0.6, at - 0.05, 0.02);
    voice.gain.setTargetAtTime(1, at, singing ? 0.06 : 0.3);
    singing = true;
  };

  return (at: number, bar: boolean) => {
    if (!bar) {
      // Passing on a step, or holding.
      if (Math.random() < 0.5 || !notes[i + dir]) return;
      i += dir;
      return sing(at);
    }
    if (Math.random() < 0.25) dir = -dir;
    const chord = d.score.chords[d.chord].map((n) => n % 12);
    // The nearest note of the chord, best a step or two on the way it is going; staying put only if nothing else.
    let best = i;
    let cost = Infinity;
    for (let j = Math.max(0, i - 3); j <= Math.min(notes.length - 1, i + 3); j++) {
      if (!chord.includes(notes[j] % 12)) continue;
      const k = Math.abs(j - i) + (j === i ? 2 : Math.sign(j - i) !== dir ? 1.5 : 0);
      if (k < cost) [best, cost] = [j, k];
    }
    if (best !== i) dir = Math.sign(best - i);
    // Near the ends of its range it turns back.
    if (best <= 1) dir = 1;
    if (best >= notes.length - 2) dir = -1;
    i = best;
    sing(at);
  };
}

/** The partials of a struck bowl, as [ratio to its note, level, how long it rings as a share of the whole]. */
const BOWL: [number, number, number][] = [
  [1, 1, 1],
  [2.76, 0.5, 0.6],
  [5.4, 0.25, 0.35],
  [8.93, 0.12, 0.2],
];

/** A singing bowl struck on a note of the chord: each partial a pair of sines a hair apart, so it beats. */
function bowl(d: Drone) {
  const { ac, score } = d;
  const b = score.bowl!;
  const chord = score.chords[d.chord];
  const note = pick(chord) + b.shift + (Math.random() < 0.25 ? 12 : 0);
  const at = ac.currentTime + 0.05;
  const strength = rand(0.5, 1);
  const out = panner(ac, rand(-0.7, 0.7));
  out.connect(d.chimes);
  for (const [ratio, level, share] of BOWL) {
    const ring = b.ring * share;
    const env = contour(ac, at, [
      [0.006, b.level * level * strength],
      [ring, 0],
    ]);
    env.connect(out);
    const f = hz(note) * ratio;
    for (const beat of [0, rand(0.6, 2.2)]) oscillator(ac, 'sine', f + beat, at, at + ring + 0.1).connect(env);
  }
}

/** A phrase of the tune ("A4:1 Bb4:.5 …") as [note, beats]. */
const phraseOf = (text: string): [number, number][] =>
  text.split(/\s+/).map((n) => {
    const [name, beats] = n.split(':');
    return [noteNumber(name), Number(beats)];
  });

/**
 * A flute playing its tune (Score's `song`), group after group. One voice: a sine and a little reed, with breath
 * in a band that follows the note. Each phrase is scheduled on the audio clock as a whole, so it keeps time.
 */
function song(d: Drone, sg: NonNullable<Score['song']>) {
  const { ac } = d;
  const t = ac.currentTime;
  const tune = sg.tune.map((group) => group.map(phraseOf));
  // The notes it plays, low to high: a grace note is the one above.
  const heard = [...new Set(tune.flat(2).map(([n]) => n))].sort((a, b) => a - b);
  const above = (n: number) => heard.find((m) => m > n) ?? n + 1;
  const start = hz(tune[0][0][0][0]);

  const voice = keep(d, gain(ac, 0));
  d.parts.push(voice.gain);
  voice
    .connect(keep(d, filter(ac, 'lowpass', 2400, 0.7)))
    .connect(keep(d, panner(ac, rand(-0.3, 0.3))))
    .connect(d.chimes);
  const tone = source(d, oscillator(ac, 'sine', start, t, t + FOREVER));
  const reed = source(d, oscillator(ac, 'triangle', start, t, t + FOREVER));
  reed.connect(keep(d, gain(ac, 0.18))).connect(voice);
  tone.connect(voice);
  // The breath in it: noise through a narrow band that follows the note.
  const air = keep(d, filter(ac, 'bandpass', start, 12));
  source(d, noiseSource(ac, t, t + FOREVER))
    .connect(air)
    .connect(keep(d, gain(ac, 3)))
    .connect(voice);
  // Vibrato, only on held notes.
  const wobble = source(d, oscillator(ac, 'sine', 4.8, t, t + FOREVER));
  const depth = keep(d, gain(ac, 0));
  wobble.connect(depth);
  depth.connect(tone.detune);
  depth.connect(reed.detune);
  const pitch = [tone.frequency, reed.frequency, air.frequency];
  const to = (note: number, at: number, glide: number) => {
    for (const p of pitch) p.setTargetAtTime(hz(note), at, glide);
  };

  let g = 0;
  const play = () => {
    let at = ac.currentTime + 0.15;
    const group = tune[g];
    group.forEach((phrase, p) => {
      phrase.forEach(([note, beats], k) => {
        // A little give in the time, as a player's has.
        const len = beats * sg.beat * rand(0.95, 1.06);
        if (k && beats >= 1 && Math.random() < sg.grace) to(above(note), at - 0.08, 0.004);
        to(note, at, k ? 0.012 : 0.001);
        if (k) voice.gain.setTargetAtTime(sg.level * 0.6, at - 0.04, 0.015);
        voice.gain.setTargetAtTime(sg.level * rand(0.85, 1), at, k ? 0.04 : 0.07);
        depth.gain.setTargetAtTime(0, at, 0.04);
        if (len > 0.55) depth.gain.setTargetAtTime(sg.vibrato, at + 0.25, 0.25);
        at += len;
      });
      if (p < group.length - 1) {
        // A breath before the next phrase.
        voice.gain.setTargetAtTime(0, at - 0.2, 0.06);
        at += sg.breath * sg.beat;
      } else voice.gain.setTargetAtTime(0, at - 0.9, 0.35);
    });
    g = (g + 1) % tune.length;
    later(d, at - ac.currentTime + rand(...(g ? sg.rest : sg.pause)), play);
  };
  later(d, rand(4, 8), play);
}

/** Silent until `at`, then fading in over `seconds`. */
function fadeIn({ ac, bus }: Drone, at: number, seconds: number) {
  bus.gain.cancelScheduledValues(ac.currentTime);
  bus.gain.setValueAtTime(0, ac.currentTime);
  bus.gain.setValueAtTime(0, at);
  bus.gain.linearRampToValueAtTime(1, at + seconds);
}

/** Fades `d` out over `fade` seconds (on a crossfade's curve if `smooth`), and lets it go. */
function stop(d: Drone, fade: number, smooth = false) {
  const { ac, bus } = d;
  d.stopped = true;
  if (d.wake !== null) clearTimeout(d.wake);
  d.wake = null;
  d.queue = [];
  const t = ac.currentTime;
  for (const p of d.parts) {
    p.cancelScheduledValues(t);
    p.setTargetAtTime(0, t, 1.2);
  }
  // Held where it is, even partway through a fade in: cancelling that outright would jump back to silence (and
  // some browsers refuse a new fade overlapping it). Firefox has no `cancelAndHoldAtTime`.
  const g = bus.gain;
  if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
  else {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
  }
  if (smooth && g.value > 0.99) g.setValueCurveAtTime(EASE_OUT, t, fade);
  else g.linearRampToValueAtTime(0, t + fade);
  for (const s of d.sources) s.stop(t + fade + 0.1);
  window.setTimeout(
    () => {
      d.nodes.forEach((n) => n.disconnect());
      sounding.delete(d);
    },
    (fade + 0.5) * 1000,
  );
}
