// The app's opening, as the lobby's title rises on first opening: a deep hit, a rush climbing with the title,
// and as it lands a wide D minor chord blooming open with high chimes over it, all in a long reverb. It is the
// drone's first chord (music.ts), so the one rings on into the other.

import { compressor, contour, filter, gain, glide, hz, noiseSource, oscillator, panner, reverb, spread } from './core';

/** Seconds from the start to the title landing: its rise (components/lobby/useIntro.ts) takes about one, settling gently. */
const LAND = 0.8;
/** Seconds the chord rings after the landing. */
const RING = 8;
/** D minor, from a low D up through A, D, F, A, C, E to a high A, as MIDI notes. */
const CHORD = [26, 38, 45, 50, 53, 57, 60, 64, 69];
/** D, A and E high above it. */
const CHIMES = [74, 81, 88];

/**
 * Seconds from now to the start. Building the reverb, if it isn't ready yet (core.ts), can take tens of
 * milliseconds on a phone, and its output buffers are long: starting sooner, the first notes would be scheduled
 * in the past and come in late, stuttering.
 */
const LEAD = 0.12;

/** Plays the opening, starting in a moment; returns when it starts, and when the title lands and the chord blooms. */
export function opening(ac: AudioContext): { start: number; land: number } {
  // The reverb is ready first, so building it takes no time from the start.
  const verb = reverb(ac);
  const at = ac.currentTime + LEAD;
  const land = at + LAND;
  // Held in by a compressor, on its way out and into the reverb.
  const comp = compressor(ac, -12);
  comp.connect(ac.destination);
  comp.connect(verb);
  const mix = gain(ac, 0.8);
  mix.connect(comp);

  thud(ac, mix, at);
  rush(ac, mix, at);
  bloom(ac, mix, land);
  chimes(ac, mix, verb, land);

  // Once the chord has gone, nothing is left playing.
  window.setTimeout(() => comp.disconnect(), (land + RING + 0.5 - ac.currentTime) * 1000);
  return { start: at, land };
}

/** A deep thud falling in pitch. */
function thud(ac: AudioContext, dest: AudioNode, at: number) {
  const osc = oscillator(ac, 'sine', 72, at, at + 2.6);
  osc.frequency.exponentialRampToValueAtTime(34, at + 1.4);
  osc
    .connect(
      contour(ac, at, [
        [0.012, 0.55],
        [2.4, 0],
      ]),
    )
    .connect(dest);
}

/** Noise swept up with the title, swelling into its landing. */
function rush(ac: AudioContext, dest: AudioNode, at: number) {
  const band = filter(ac, 'bandpass', 160, 1.4);
  glide(band.frequency, at, 160, [
    [LAND, 3200],
    [LAND * 2, 7000],
  ]);
  noiseSource(ac, at, at + LAND * 2 + 0.1)
    .connect(band)
    .connect(
      contour(ac, at, [
        [LAND * 0.9, 0.22],
        [LAND * 2, 0],
      ]),
    )
    .connect(dest);
}

/** The chord: detuned saws spread across the stereo field, their lowpass opening wide at `land` and slowly closing as they fade. */
function bloom(ac: AudioContext, dest: AudioNode, land: number) {
  const from = land - 0.15;
  const open = filter(ac, 'lowpass', 280, 0.9);
  glide(open.frequency, land, 280, [
    [0.5, 3400],
    [RING - 1, 420],
  ]);
  open
    .connect(
      contour(ac, from, [
        [0.25, 1],
        [2, 0.55],
        [RING, 0],
      ]),
    )
    .connect(dest);
  CHORD.forEach((note, i) => {
    const pan = panner(ac, spread(i, CHORD.length, 0.7));
    pan.connect(open);
    for (const cents of [-9, 9]) {
      const osc = oscillator(ac, 'sawtooth', hz(note), from, land + RING);
      osc.detune.value = cents;
      // The low D carries the weight.
      osc.connect(gain(ac, i === 0 ? 0.05 : 0.028)).connect(pan);
    }
  });
}

/** The chimes rising one after another as the chord blooms, mostly heard in the reverb. */
function chimes(ac: AudioContext, dest: AudioNode, verb: AudioNode, land: number) {
  CHIMES.forEach((note, i) => {
    const at = land + 0.05 + i * 0.14;
    const env = contour(ac, at, [
      [0.01, 0.05],
      [4, 0],
    ]);
    oscillator(ac, 'sine', hz(note), at, at + 4.1).connect(env);
    env.connect(gain(ac, 0.4)).connect(dest);
    env.connect(verb);
  });
}
