// The Web Audio plumbing every synthesized sound shares (effects.ts, gameOver.ts, music.ts, opening.ts): the
// context, the output bus, white noise, a reverb and a few node builders, and the player's sound and music
// switches.

import { APPLE_TOUCH } from '../platform';
import { remember, stored } from '../storage';
import { appKey } from '../appId';

/** The two switches in the game's top bar: sound effects, and the music (music.ts). */
type Switch = 'sound' | 'music';

let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let effectsGain: GainNode | null = null;
const switches: Record<Switch, boolean> = {
  sound: stored(appKey('sound')) !== 'off',
  music: stored(appKey('music')) !== 'off',
};
const listeners = new Set<() => void>();
let verb: { input: ConvolverNode; level: GainNode } | null = null;
/** The reverb's level, in the mix. */
const WET = 0.9;

/**
 * A slow device: few cores or little memory. Not an iPhone or iPad, which are quick, and whose Safari is not to be
 * trusted with a sample rate of its own.
 */
const SLOW =
  !APPLE_TOUCH &&
  ((navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 2);

/**
 * How the audio is made. The browser's default is as little ahead as it can, so taps sound at once; on a phone that
 * leaves no slack, and when the page is busy (the fireworks) the sound breaks up. A few hundredths of a second
 * later is unnoticed in a board game, and a slow device is given more still. A slow device also makes its sound
 * at a lower rate, which more than halves the work of the reverbs, and loses only what is above 16 kHz (nothing
 * in the music; the very top of a cymbal).
 */
const OPTIONS: AudioContextOptions = SLOW ? { latencyHint: 'playback', sampleRate: 32000 } : { latencyHint: 'balanced' };

function newContext(): AudioContext {
  try {
    return new AudioContext(OPTIONS);
  } catch {
    return new AudioContext();
  }
}

export function audio(): AudioContext | null {
  try {
    ctx ??= newContext();
    // Not while the app is away: the audio stays suspended until it is back (below).
    if (ctx.state === 'suspended' && !away()) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Whether sound effects or music are on, as the player last set them (kept across visits). */
export function isOn(which: Switch): boolean {
  return switches[which];
}

/**
 * The audio, for a sound effect: none while sound effects are off, so nothing is built to play unheard, nor while
 * the app is away, when the audio is suspended and every sound played would come out at once on its return.
 */
export function effects(): AudioContext | null {
  return switches.sound && !away() ? audio() : null;
}

export function turn(which: Switch, on: boolean) {
  if (switches[which] === on) return;
  switches[which] = on;
  remember(appKey(which), on ? 'on' : 'off');
  if (which === 'sound' && ctx && effectsGain) effectsGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
  if (on) audio();
  listeners.forEach((l) => l());
}

/** Calls `listener` whenever sound effects or music are turned on or off; returns the way to stop. */
export function onSwitch(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Where every sound effect goes: a gentle compressor, so several sounds at once don't clip, then silence while sound is off. */
export function out(ac: AudioContext): AudioNode {
  if (!bus) {
    const comp = compressor(ac, -14);
    effectsGain = gain(ac, switches.sound ? 1 : 0);
    comp.connect(effectsGain).connect(ac.destination);
    bus = comp;
  }
  return bus;
}

const preparations: ((ac: AudioContext) => void)[] = [];

/**
 * Has `build` make what a sound needs (a reverb, a set of samples) once the audio has started, when the page is
 * idle, rather than in the moment the sound is first played, where on a phone it holds up the page.
 */
function prepare(build: (ac: AudioContext) => void) {
  preparations.push(build);
}

/**
 * What `build` makes for the audio (a reverb, a set of samples), made once, prepared ahead (`prepare`), and
 * then reused by every sound that asks for it.
 */
export function kept<T>(build: (ac: AudioContext) => T): (ac: AudioContext) => T {
  let made: { ac: AudioContext; value: T } | null = null;
  const get = (ac: AudioContext) => {
    if (made?.ac !== ac) made = { ac, value: build(ac) };
    return made.value;
  };
  prepare(get);
  return get;
}

const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 0));

/** Each preparation in an idle moment of its own, so together they don't hold up the page. */
function prepareFrom(ac: AudioContext, i: number) {
  if (i < preparations.length)
    idle(() => {
      preparations[i](ac);
      prepareFrom(ac, i + 1);
    });
}

// Starting the audio can take ~100 ms: it is done when the page is next idle after the first touch or key
// (browsers only let sound start after one), not inside the tap that first plays a sound.
function warm() {
  window.removeEventListener('pointerdown', warm, true);
  window.removeEventListener('keydown', warm, true);
  idle(() => {
    const ac = audio();
    if (ac) prepareFrom(ac, 0);
  });
}
window.addEventListener('pointerdown', warm, true);
window.addEventListener('keydown', warm, true);

// On a phone, losing focus is the first sign of the app going away (to another app, or the list of apps), before
// it is hidden. On a computer it is only another window being clicked, and the music plays on.
const TOUCH = matchMedia('(pointer: coarse)').matches;
const away = () => document.visibilityState === 'hidden' || (TOUCH && !document.hasFocus());

// At the first sign of the app going away its audio is suspended, with no fade: a phone slows a hidden page's
// timers, and sound left playing as it puts the app away stutters on for seconds. The reverb is silenced too, so
// its tail isn't heard on return; it comes back slowly once the app is.
function leave() {
  if (!ctx) return;
  verb?.level.gain.cancelScheduledValues(ctx.currentTime);
  verb?.level.gain.setValueAtTime(0, ctx.currentTime);
  if (ctx.state === 'running') void ctx.suspend();
}
function come() {
  if (!ctx || away()) return;
  verb?.level.gain.setTargetAtTime(WET, ctx.currentTime, 1);
  if (ctx.state === 'suspended') void ctx.resume();
}
document.addEventListener('visibilitychange', () => (away() ? leave() : come()));
window.addEventListener('pagehide', leave);
document.addEventListener('freeze', leave);
if (TOUCH) {
  window.addEventListener('blur', leave);
  window.addEventListener('focus', come);
}

/** Two seconds of white noise, made once and reused by every noise sound. */
const whiteNoise = kept((ac) => {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
});

/**
 * Has `params` take one value for each slice of 128 samples rather than for every sample. A filter otherwise
 * works out its shape afresh for every sample while its frequency moves, the most costly thing these sounds do;
 * at the speeds they move, the steps are not heard.
 */
function sliced(...params: AudioParam[]) {
  for (const p of params)
    try {
      p.automationRate = 'k-rate';
    } catch {
      // A browser that doesn't allow it works per sample.
    }
}

/** Sets `param` to `from` at `at`, then glides through `points`, each [seconds after `at`, value], exponentially (as pitch and loudness are heard). */
export function glide(param: AudioParam, at: number, from: number, points: [number, number][]) {
  param.setValueAtTime(from, at);
  for (const [t, v] of points) param.exponentialRampToValueAtTime(Math.max(v, 0.0001), at + t);
}

/** A gain that rises from silence through `points`, as `glide` takes them; end on 0 to fade out. */
export function contour(ac: AudioContext, at: number, points: [number, number][]): GainNode {
  const g = ac.createGain();
  glide(g.gain, at, 0.0001, points);
  return g;
}

/** Gain that swells from silence to `peak` at `at + rise`, then fades out by `at + dur`. */
export function envelope(ac: AudioContext, at: number, dur: number, peak: number, rise = 0.01): GainNode {
  return contour(ac, at, [
    [rise, peak],
    [dur, 0],
  ]);
}

/** An oscillator playing from `at` to `end`; ramp its frequency from `at` on. */
export function oscillator(ac: AudioContext, type: OscillatorType, freq: number, at: number, end: number): OscillatorNode {
  const osc = ac.createOscillator();
  sliced(osc.frequency, osc.detune);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.start(at);
  osc.stop(end);
  return osc;
}

/** White noise from `at` to `end`. It starts at a random point so repeats don't sound identical, and loops to cover any sound that runs past its end. */
export function noiseSource(ac: AudioContext, at: number, end: number): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = whiteNoise(ac);
  src.loop = true;
  src.start(at, Math.random());
  src.stop(end);
  return src;
}

export function filter(ac: AudioContext, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  sliced(f.frequency, f.Q);
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** A compressor holding sound in above `threshold` dB, so several sounds at once don't clip. */
export function compressor(ac: AudioContext, threshold: number, ratio = 4): DynamicsCompressorNode {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = threshold;
  comp.ratio.value = ratio;
  return comp;
}

/** A stereo panner at `pan`, from -1 (left) to 1 (right). */
export function panner(ac: AudioContext, pan: number): StereoPannerNode {
  const p = ac.createStereoPanner();
  p.pan.value = pan;
  return p;
}

/** Where the `i`th of `n` voices sits when they are spread evenly across `width` of the stereo field (one, in the middle). */
export const spread = (i: number, n: number, width: number) => (n > 1 ? ((i / (n - 1)) * 2 - 1) * width : 0);

/** A gain node at `level`. */
export function gain(ac: AudioContext, level: number): GainNode {
  const g = ac.createGain();
  g.gain.value = level;
  return g;
}

/** A MIDI note's frequency: 69 is the A above middle C. */
export const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note's name as a MIDI note number: "C4" is middle C (60); "F#4", "Bb3". */
export function noteNumber(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + PITCH_CLASSES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/**
 * Where the music (music.ts) and its opening (opening.ts) send their sound to ring out: a long, dark stereo
 * reverb with a six-second tail, played out on its own. There is one, kept: building it takes a phone tens of
 * milliseconds, and the opening rings on into the drone, so two would work at once. It only works while something
 * is sent into it.
 */
export function reverb(ac: AudioContext): AudioNode {
  if (!verb) {
    const sr = ac.sampleRate;
    const len = Math.floor(sr * 6);
    const impulse = ac.createBuffer(2, len, sr);
    // Dying away over 1.7 seconds, after a swell of an eighth of a second.
    const fall = Math.exp(-1 / (1.7 * sr));
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let last = 0;
      let level = 1;
      for (let i = 0; i < len; i++) {
        // Smoothed noise, so the tail is soft rather than hissy.
        last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
        data[i] = last * level * Math.min(1, (i * 8) / sr);
        level *= fall;
      }
    }
    const input = ac.createConvolver();
    input.buffer = impulse;
    const level = gain(ac, document.visibilityState === 'visible' ? WET : 0);
    input.connect(level).connect(ac.destination);
    verb = { input, level };
  }
  return verb.input;
}
prepare(reverb);

/** `x` give or take a fraction `by`, so repeated sounds vary. */
export const jitter = (x: number, by = 0.08) => x * (1 + (Math.random() * 2 - 1) * by);
