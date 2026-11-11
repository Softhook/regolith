// The game's ending, all played in a hall: for a winner, a brass fanfare and the fireworks (components/fireworks/);
// for a player who lost, a lament.

import { contour, effects, envelope, filter, gain, glide, hz, jitter, kept, noiseSource, oscillator, out } from './audio';
import { pick } from './random';

/** A big hall: a synthesized reverb tail the fanfare and fireworks send into, so they ring out. */
const hall = kept((ac): AudioNode => {
  const len = Math.floor(ac.sampleRate * 3.2);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  // A short gap, then a dense tail dying away over about three seconds.
  const gap = Math.floor(ac.sampleRate * 0.012);
  const fall = Math.exp(-1 / (0.75 * ac.sampleRate));
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let level = Math.exp(-gap / (0.75 * ac.sampleRate));
    for (let i = gap; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * level * Math.min(1, (i * 25) / ac.sampleRate);
      level *= fall;
    }
  }
  const conv = ac.createConvolver();
  conv.buffer = ir;
  conv.connect(gain(ac, 0.55)).connect(out(ac));
  return conv;
});

/** Plays `node` straight out and sends `wet` of it into the hall. */
function send<T extends AudioNode>(ac: AudioContext, node: T, wet: number): T {
  node.connect(out(ac));
  node.connect(gain(ac, wet)).connect(hall(ac));
  return node;
}

/** A soft-clipping stage: a little grit and warmth, as a real horn section has. */
function warmth(ac: AudioContext, drive: number): WaveShaperNode {
  const shaper = ac.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  // Not oversampled: the brass is quiet enough going in that its grit doesn't alias, and oversampling is costly.
  shaper.curve = curve;
  return shaper;
}

/** Partials as [frequency ratio, level, decay seconds], each a sine dying away: drums and bells. */
function partials(ac: AudioContext, dest: AudioNode, at: number, freq: number, level: number, parts: number[][], sag = 1) {
  for (const [ratio, part, decay] of parts) {
    const osc = oscillator(ac, 'sine', freq * ratio * sag, at, at + decay + 0.05);
    if (sag !== 1) osc.frequency.exponentialRampToValueAtTime(freq * ratio, at + 0.08);
    osc.connect(envelope(ac, at, decay, level * part, 0.003)).connect(dest);
  }
}

/**
 * One section note: `voices` players on detuned saws, each starting a hair apart and scooping up
 * into the pitch, through a filter that opens with the breath (`bright`) and closes as it's held.
 */
function horn(
  ac: AudioContext,
  dest: AudioNode,
  at: number,
  freq: number,
  dur: number,
  level: number,
  { voices = 3, bright = 1, attack = 0.035 }: { voices?: number; bright?: number; attack?: number } = {},
) {
  const release = 0.18 + Math.min(dur, 1) * 0.25;
  const end = at + dur + release + 0.05;
  const lp = filter(ac, 'lowpass', freq * 1.4, 0.9);
  glide(lp.frequency, at, freq * 1.4, [
    [attack + 0.03, Math.min(16000, freq * (5 + 4 * bright))],
    [Math.min(dur, 0.5), Math.min(12000, freq * (2.6 + 1.8 * bright))],
  ]);
  // Blown, eased off, held (long notes swelling a little), released.
  const held = dur > 0.6 ? 0.95 : 0.75;
  const env = contour(ac, at, [
    [attack, level],
    [attack + 0.12, level * 0.75],
    [Math.max(attack + 0.13, dur * 0.85), level * held],
    [dur + release, 0],
  ]);
  lp.connect(env).connect(dest);

  // Vibrato that creeps in on held notes.
  let depth: GainNode | null = null;
  if (dur > 0.4) {
    depth = ac.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(freq * 0.007, at + Math.min(dur, 0.7));
    oscillator(ac, 'sine', jitter(5.2, 0.1), at, end).connect(depth);
  }

  for (let v = 0; v < voices; v++) {
    const start = at + Math.random() * 0.014;
    const osc = oscillator(ac, 'sawtooth', freq * 0.975, start, end);
    osc.frequency.exponentialRampToValueAtTime(freq, start + 0.05);
    osc.detune.value = (v - (voices - 1) / 2) * 7 + Math.random() * 4;
    depth?.connect(osc.frequency);
    osc.connect(gain(ac, 1 / Math.sqrt(voices))).connect(lp);
  }
}

/** A slow-blooming string pad. */
function strings(ac: AudioContext, dest: AudioNode, at: number, freqs: number[], dur: number, level: number) {
  const lp = filter(ac, 'lowpass', 2400);
  const env = contour(ac, at, [
    [0.5, level],
    [dur * 0.7, level],
    [dur, 0],
  ]);
  lp.connect(env).connect(dest);
  for (const f of freqs)
    for (const d of [-9, 0, 9]) {
      const osc = oscillator(ac, 'sawtooth', f, at, at + dur + 0.05);
      osc.detune.value = d + Math.random() * 3;
      osc.connect(lp);
    }
}

/** A timpani stroke: the drum's head (fundamental and the overtones a kettle drum has) sagging in pitch, and the mallet's thud. */
function kettle(ac: AudioContext, dest: AudioNode, at: number, freq: number, level: number, ring = 1.4) {
  const head = [
    [1, 1, ring],
    [1.5, 0.45, ring * 0.6],
    [1.98, 0.25, ring * 0.4],
    [2.44, 0.12, ring * 0.3],
  ];
  partials(ac, dest, at, freq, level, head, 1.03);
  noiseSource(ac, at, at + 0.15)
    .connect(filter(ac, 'lowpass', 500))
    .connect(envelope(ac, at, 0.12, level * 0.5, 0.002))
    .connect(dest);
}

/** A glockenspiel note: a bright bar with its inharmonic overtones. */
function bell(ac: AudioContext, dest: AudioNode, at: number, freq: number, level: number) {
  partials(ac, dest, at, freq, level, [
    [1, 1, 1.6],
    [2.76, 0.35, 0.6],
    [5.4, 0.12, 0.3],
  ]);
}

/** A crash cymbal: inharmonic metal partials and bright noise ringing away. */
function crash(ac: AudioContext, dest: AudioNode, at: number, level: number, dur = 3) {
  const end = at + dur + 0.05;
  const hp = filter(ac, 'highpass', 4200);
  const env = contour(ac, at, [
    [0.004, level],
    [0.25, level * 0.35],
    [dur, 0],
  ]);
  hp.connect(env).connect(dest);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800])
    oscillator(ac, 'square', f * 2.1, at, end)
      .connect(gain(ac, 0.12))
      .connect(hp);
  noiseSource(ac, at, end).connect(hp);
}

/** A cymbal played backwards: noise swelling up into a downbeat at `at + dur`. */
function swell(ac: AudioContext, dest: AudioNode, at: number, dur: number, level: number) {
  const hp = filter(ac, 'highpass', 7000);
  glide(hp.frequency, at, 7000, [[dur, 2500]]);
  noiseSource(ac, at, at + dur + 0.1)
    .connect(hp)
    .connect(envelope(ac, at, dur + 0.08, level, dur))
    .connect(dest);
}

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note's pitch from its name: 'C4' (middle C), 'Eb3', 'F#5'. */
function note(name: string): number {
  const [, letter, accidental, octave] = /^([A-G])(b|#)?(\d)$/.exec(name)!;
  return hz(12 * (Number(octave) + 1) + STEPS[letter] + (accidental === 'b' ? -1 : accidental === '#' ? 1 : 0));
}

/** How each brass part plays: players per note, how bright its breath is, its attack and its usual level. */
const PARTS = {
  trumpet: { voices: 3, bright: 1.1, attack: 0.035, level: 0.05 },
  horn: { voices: 2, bright: 0.55, attack: 0.05, level: 0.03 },
  trombone: { voices: 2, bright: 0.7, attack: 0.04, level: 0.05 },
  /** Horns played softly and dark: the lament's voice. */
  muted: { voices: 2, bright: 0.35, attack: 0.08, level: 0.05 },
  /** Muted horns holding a chord underneath. */
  pad: { voices: 2, bright: 0.25, attack: 0.15, level: 0.026 },
};
type Part = keyof typeof PARTS;

/**
 * An orchestra in the hall, with times counted from the start of the piece: brass (through a little grit,
 * when `grit` is given) and percussion, each sent `wet` into the hall. `perc` takes any other sound.
 */
function orchestra({ brassWet, percWet, grit }: { brassWet: number; percWet: number; grit?: number }) {
  const ac = effects();
  if (!ac) return null;
  const t0 = ac.currentTime + 0.05;
  const section = gain(ac, 0.9);
  if (grit) send(ac, section.connect(warmth(ac, grit)), brassWet);
  else send(ac, section, brassWet);
  const perc = send(ac, gain(ac, 1), percWet);
  const each = (notes: string | string[]) => (typeof notes === 'string' ? [notes] : notes).map(note);
  return {
    ac,
    t0,
    perc,
    /** `notes` (one, or a chord) played by `part` from `at` for `dur`. */
    brass(part: Part, notes: string | string[], at: number, dur: number, level = PARTS[part].level) {
      for (const f of each(notes)) horn(ac, section, t0 + at, f, dur, level, PARTS[part]);
    },
    strings: (notes: string[], at: number, dur: number, level: number) => strings(ac, section, t0 + at, each(notes), dur, level),
    timpani: (n: string, at: number, level: number, ring?: number) => kettle(ac, perc, t0 + at, note(n), level, ring),
    bell: (n: string, at: number, level: number) => bell(ac, perc, t0 + at, note(n), level),
    crash: (at: number, level: number, dur: number) => crash(ac, perc, t0 + at, level, dur),
    swell: (at: number, dur: number, level: number) => swell(ac, perc, t0 + at, dur, level),
    /** A tone (`type`) sliding from `from` to `to` Hz over `dur`, through a lowpass at `cutoff`. */
    slide(type: OscillatorType, from: number, to: number, at: number, dur: number, level: number, cutoff = 20000) {
      const osc = oscillator(ac, type, from, t0 + at, t0 + at + dur + 0.1);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + at + dur * 0.9);
      osc
        .connect(filter(ac, 'lowpass', cutoff))
        .connect(envelope(ac, t0 + at, dur, level, 0.006))
        .connect(perc);
    },
  };
}

/** When the fanfare's notes land, in seconds after it starts: the fireworks burst in time with them. */
export const FANFARE_HITS = { pickups: [0.75, 0.89, 1.03], first: 1.17, second: 1.9, rise: [2.45, 2.85], final: 3.25 };

/**
 * The victory fanfare: a timpani roll and cymbal swell, triplet pickups, a heroic climb through C, then
 * A-flat and B-flat major (♭VI–♭VII) into a huge C major chord with a crash, strings and bells.
 */
export function fanfare() {
  const o = orchestra({ brassWet: 0.45, percWet: 0.35, grit: 1.6 });
  if (!o) return;
  const H = FANFARE_HITS;
  /** One chord of the climb: a trumpet on top, horns and a trombone under it, and a drum stroke. */
  const hit = (at: number, dur: number, top: string, chord: string[], bass: string, drum: string, level = 0.06) => {
    o.brass('trumpet', top, at, dur, level);
    o.brass('horn', chord, at, dur);
    o.brass('trombone', bass, at, dur);
    o.timpani(drum, at, 0.27);
  };

  // The roll: soft to loud, and a reversed cymbal into the first note.
  for (let i = 0; i < 15; i++) o.timpani('G2', i * 0.048, 0.04 + i * 0.012, 0.5);
  o.swell(0, H.pickups[0], 0.07);

  // Ta-ta-ta TAAA, ta TAAA…
  for (const at of H.pickups) {
    o.brass('trumpet', 'G4', at, 0.11);
    o.brass('horn', 'G3', at, 0.11, 0.025);
  }
  hit(H.first, 0.6, 'C5', ['C4', 'E4', 'G4'], 'C3', 'C3');
  o.brass('trumpet', 'E5', H.second - 0.15, 0.13);
  hit(H.second, 0.5, 'G5', ['E4', 'G4', 'C5'], 'C3', 'G2');

  // …climbing on A-flat and B-flat…
  const [rise1, rise2] = H.rise;
  hit(rise1, 0.34, 'Ab5', ['Ab3', 'C4', 'Eb4'], 'Ab2', 'Ab2');
  hit(rise2, 0.34, 'Bb5', ['Bb3', 'D4', 'F4'], 'Bb2', 'Bb2', 0.065);
  o.swell(rise1, H.final - rise1, 0.05);

  // …and home on a huge C major, over a deep sub drop.
  const F = H.final;
  const hold = 2.6;
  o.brass('trumpet', 'C6', F, hold, 0.07);
  o.brass('trumpet', 'G5', F, hold, 0.04);
  o.brass('trumpet', 'E5', F, hold, 0.035);
  o.brass('horn', ['C4', 'E4', 'G4', 'C5'], F, hold, 0.032);
  o.brass('trombone', 'C3', F, hold, 0.06);
  o.brass('trombone', 'C2', F, hold);
  o.strings(['C3', 'G3', 'C4', 'E4', 'G4'], F, hold + 1.2, 0.02);
  o.timpani('C3', F, 0.34, 2);
  o.timpani('G2', F, 0.22, 2);
  o.crash(F, 0.09, 3.5);
  o.slide('sine', 70, 34, F, 1.8, 0.3);
  // A closing timpani flourish, and bells sparkling up through the chord.
  ['G2', 'G2', 'C3'].forEach((n, i) => o.timpani(n, F + hold - 0.5 + i * 0.12, 0.14 + i * 0.05));
  ['C6', 'E6', 'G6', 'C7', 'G6', 'C7'].forEach((n, i) => o.bell(n, F + 0.15 + i * 0.11, 0.035));
}

/**
 * The defeat lament: the mech's power failing, one deep drum, then muted horns falling E-flat, D, C over
 * A-flat major, G major and C minor (♭VI–V–i), fading into a cold, distant chord.
 */
export function lament() {
  // Further off in the hall than the fanfare.
  const o = orchestra({ brassWet: 0.6, percWet: 0.5 });
  if (!o) return;

  // Power failing: a tone sinking to nothing through dying static.
  o.slide('sawtooth', 220, 30, 0, 1.3, 0.05, 600);
  const hiss = filter(o.ac, 'lowpass', 3000);
  glide(hiss.frequency, o.t0, 3000, [[1.2, 200]]);
  noiseSource(o.ac, o.t0, o.t0 + 1.3)
    .connect(hiss)
    .connect(envelope(o.ac, o.t0, 1.2, 0.03, 0.02))
    .connect(o.perc);
  o.timpani('C2', 0.2, 0.32, 2.4);

  // The fall.
  const fall: [at: number, dur: number, top: string, chord: string[], bass: string][] = [
    [0.9, 0.7, 'Eb4', ['Ab2', 'C3', 'Eb3'], 'Ab1'],
    [1.65, 0.7, 'D4', ['G2', 'B2', 'D3'], 'G1'],
    [2.4, 2.6, 'C4', ['C3', 'Eb3', 'G3'], 'C2'],
  ];
  for (const [at, dur, top, chord, bass] of fall) {
    o.brass('muted', top, at, dur);
    o.brass('pad', chord, at, dur);
    o.brass('muted', bass, at, dur, 0.04);
  }
  o.strings(['C2', 'G2', 'C3', 'Eb3'], 2.4, 3.6, 0.016);
  o.timpani('C2', 2.4, 0.2, 2.5);
  o.bell('C5', 2.9, 0.018);
}

/** Short bursts of crackle, made once: dense random snaps that flare then die away, like crackling microstars. */
const crackleBuffers = kept((ac) => {
  const sr = ac.sampleRate;
  return Array.from({ length: 4 }, () => {
    const len = Math.floor(sr * 1.6);
    const buf = ac.createBuffer(2, len, sr);
    const [left, right] = [buf.getChannelData(0), buf.getChannelData(1)];
    const snaps = 260 + Math.floor(Math.random() * 120);
    for (let k = 0; k < snaps; k++) {
      // Most snaps come early, thinning out towards the end; a few are much louder than the rest.
      const start = Math.floor(Math.random() ** 1.8 * 1.5 * sr);
      const amp = 0.15 + 0.85 * Math.random() ** 4;
      const decay = sr * (0.0004 + Math.random() * 0.0016);
      const pan = Math.random();
      for (let i = 0; i < decay * 6 && start + i < len; i++) {
        const v = (Math.random() * 2 - 1) * amp * Math.exp(-i / decay);
        left[start + i] += v * (1 - pan * 0.7);
        right[start + i] += v * (0.3 + pan * 0.7);
      }
    }
    return buf;
  });
});

/** A crackle at `at`. */
function crackle(ac: AudioContext, at: number, level: number) {
  const src = ac.createBufferSource();
  src.buffer = pick(crackleBuffers(ac));
  src.playbackRate.value = jitter(1, 0.12);
  src
    .connect(filter(ac, 'highpass', 700))
    .connect(filter(ac, 'lowpass', jitter(7000, 0.2)))
    .connect(send(ac, gain(ac, level), 0.25));
  src.start(at);
}

/** The fireworks' sounds. `level` turns each down (under the fanfare). */
export const fireworkSound = {
  /** A mortar firing: a muffled thump and the rocket's hiss (sometimes a whistle) as it climbs for `flight` seconds. */
  launch: (flight: number, level = 1) => {
    const ac = effects();
    if (!ac) return;
    const at = ac.currentTime;
    const dest = send(ac, gain(ac, level), 0.3);
    const thump = oscillator(ac, 'sine', 110, at, at + 0.25);
    thump.frequency.exponentialRampToValueAtTime(45, at + 0.15);
    thump.connect(envelope(ac, at, 0.2, 0.12, 0.003)).connect(dest);
    const bp = filter(ac, 'bandpass', 2000, 1.5);
    glide(bp.frequency, at, 2000, [[flight, 5000]]);
    noiseSource(ac, at, at + flight + 0.05)
      .connect(bp)
      .connect(envelope(ac, at, flight, 0.03, flight * 0.4))
      .connect(dest);
    if (Math.random() < 0.3) {
      const whistle = oscillator(ac, 'sine', jitter(900), at + 0.05, at + flight + 0.1);
      whistle.frequency.exponentialRampToValueAtTime(jitter(2600), at + flight);
      whistle.connect(envelope(ac, at + 0.05, flight, 0.022, flight * 0.5)).connect(dest);
    }
  },
  /**
   * A shell bursting `distance` away (0 near to 1 far): the crack, a deep boom rolling round the hall, and with
   * `crackling` the snapping of microstars a moment later. Heard a little after it's seen, as from far off.
   */
  burst: (size = 1, { crackling = false, distance = Math.random(), level = 1 } = {}) => {
    const ac = effects();
    if (!ac) return;
    const at = ac.currentTime + 0.03 + distance * 0.18;
    const dest = send(ac, gain(ac, level * size * (1 - distance * 0.45)), 0.5 + distance * 0.3);
    // The report: a hard, bright crack, duller from further away.
    noiseSource(ac, at, at + 0.12)
      .connect(filter(ac, 'lowpass', 9000 - distance * 5000))
      .connect(envelope(ac, at, 0.09, 0.5, 0.001))
      .connect(dest);
    // The body: a boom that rumbles down.
    const lp = filter(ac, 'lowpass', 1100);
    glide(lp.frequency, at, 1100, [[1.1, 90]]);
    noiseSource(ac, at, at + 1.4 * size)
      .connect(lp)
      .connect(envelope(ac, at, 1.3 * size, 0.42, 0.004))
      .connect(dest);
    const thump = oscillator(ac, 'sine', jitter(80), at, at + 0.75);
    thump.frequency.exponentialRampToValueAtTime(30, at + 0.6);
    thump.connect(envelope(ac, at, 0.7, 0.35, 0.003)).connect(dest);
    if (crackling) crackle(ac, at + jitter(0.55, 0.2), 0.45 * level * (1 - distance * 0.4));
  },
  /** Crossette stars splitting: a handful of sharp pops. */
  pops: (level = 1) => {
    const ac = effects();
    if (!ac) return;
    const dest = send(ac, gain(ac, level), 0.4);
    for (let i = 0; i < 4; i++) {
      const at = ac.currentTime + 0.05 + Math.random() * 0.15;
      noiseSource(ac, at, at + 0.07)
        .connect(filter(ac, 'bandpass', jitter(2200, 0.4), 0.8))
        .connect(envelope(ac, at, 0.05, 0.25, 0.001))
        .connect(dest);
    }
  },
};
