// The scores the music plays (music.ts), as data: what each sounds like. All are rooted on D, so the opening
// (opening.ts) flows into any of them and each into any other.

/** A range, low to high: of seconds, or of MIDI notes. */
export type Range = [number, number];

/**
 * How a score sounds. The pad is a few voices on `chords` (MIDI notes, low voice first, as many in each), each
 * gliding to its note in the next chord a little after the one below it, so a change drifts in like a slow
 * melody. Over it, each on its own timer, whichever of the rest it has: plucks from a scale, thumps, stones,
 * breaths, a pulse of notes, singing bowls, or a flute's tune.
 */
export interface Score {
  name: string;
  chords: number[][];
  wave: 'sawtooth' | 'triangle' | 'sine';
  padLevel: number;
  /** The pad throbs this many times a second, if at all. */
  throb?: number;
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
  pluck?: {
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
  /**
   * A steady pulse of soft notes walking the chord in `pattern` (indexes into its voices), `shift` semitones up,
   * one every `step` seconds; its loudness swells and ebbs over about `swell` seconds, so it comes and goes.
   */
  arp?: {
    pattern: number[];
    shift: number;
    step: number;
    level: number;
    decay: number;
    bright: number;
    swell: number;
    /**
     * A slow second line against the pulse, swelling as the pulse ebbs and ebbing as it swells, so one hands over
     * to the other: held notes from `scale` in `range`, moving at most twice a bar, landing on the chord each bar.
     */
    counter?: { scale: number[]; range: Range; level: number };
  };
  /** A singing bowl struck now and then on a note of the chord, `shift` up: metal partials ringing and beating. */
  bowl?: { shift: number; level: number; ring: number; every: Range };
  /**
   * A flute playing a tune: groups of phrases, each phrase notes as "name:beats" ("F#4:1.5"), `beat` seconds
   * long. Within a group it takes a breath of `breath` beats between phrases, between groups it rests, and once
   * it has played them all it pauses longer and goes round again. Each time round it is played a little
   * differently: now and then a grace note flicked in from the note above, and a little give in the time.
   */
  song?: {
    tune: string[][];
    level: number;
    beat: number;
    breath: number;
    rest: Range;
    pause: Range;
    /** How far it wavers on a held note, in cents; it comes in a moment after the note does, as a player's does. */
    vibrato: number;
    /** The chance of a grace note before a note of a beat or more. */
    grace: number;
  };
}

/** The playlist, in no order: which plays first is chosen at random. Scales are pitch classes: C = 0, D = 2. */
export const PLAYLIST: Score[] = [
  // Dust: warm and wide: open fifths on D minor, a slow heartbeat underneath, dry wind, kalimba-like plucks.
  {
    name: 'dust',
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
  // Cellar: low and battered. The chords sit down in the cellar and lean on E♭, with deep slow knocks and
  // stones falling in the dark.
  {
    name: 'cellar',
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
  // Pale: lighter and calmer. Higher, lighter chords in A and D, hollow reed-like breaths, a few pebbles.
  {
    name: 'pale',
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
  // Loom: a machine humming in the dark. Hanging chords built of fourths and sevenths, a quick pulse of soft notes
  // weaving through them and echoing on the off-beat, the pad throbbing in time. As the pulse ebbs, a slow reedy
  // line rises against it, stepping through D minor, and sinks again as the pulse comes back. No plucks, no drum.
  {
    name: 'loom',
    chords: [
      [38, 45, 52, 57], // Dsus2
      [34, 45, 50, 53], // B♭maj7
      [36, 45, 48, 55], // Am7/C
      [31, 45, 50, 53], // G7sus2
    ],
    wave: 'triangle',
    padLevel: 0.026,
    throb: 1 / 0.96,
    cutoff: 620,
    sweep: 220,
    sub: { shift: 0, level: 0.05 },
    wind: { freq: 240, sweep: 90, level: 0.015, gust: 0.4 },
    reverb: 0.4,
    echo: { time: 0.72, feedback: 0.45 },
    arp: {
      pattern: [0, 2, 1, 3, 2, 1, 3, 2],
      shift: 24,
      step: 0.24,
      level: 0.05,
      decay: 0.45,
      bright: 2600,
      swell: 40,
      counter: { scale: [2, 4, 5, 7, 9, 10, 0], range: [57, 72], level: 0.04 },
    },
  },
  // Bowls: still air and metal. A pure, quiet pad of stacked fourths, and singing bowls struck one at a time,
  // ringing a long while and beating slowly as they die away.
  {
    name: 'bowls',
    chords: [
      [38, 43, 48, 53], // D G C F
      [40, 45, 50, 55], // E A D G
      [33, 38, 43, 48], // A D G C
      [36, 41, 45, 50], // C F A D
    ],
    wave: 'sine',
    padLevel: 0.05,
    cutoff: 1200,
    sweep: 200,
    sub: { shift: -12, level: 0.04 },
    wind: { freq: 1400, sweep: 600, level: 0.012, gust: 0.9 },
    reverb: 0.75,
    echo: { time: 1.3, feedback: 0.3 },
    bowl: { shift: 12, level: 0.05, ring: 14, every: [5, 11] },
  },
  // Desert: a flute over a drone. The ground holds on D with the fifth while a breathy flute plays a slow tune in
  // the old D phrygian-dominant mode (E♭ and F♯, the sound of a desert song), now and then a frame drum.
  {
    name: 'desert',
    chords: [
      [26, 38, 45, 50], // D5
      [27, 39, 46, 51], // E♭5
      [26, 38, 45, 54], // D
      [31, 38, 43, 46], // Gm
    ],
    wave: 'sawtooth',
    padLevel: 0.022,
    cutoff: 380,
    sweep: 120,
    sub: { shift: 0, level: 0.07 },
    wind: { freq: 450, sweep: 250, level: 0.03, gust: 0.8 },
    reverb: 0.55,
    echo: { time: 0.66, feedback: 0.32 },
    thump: { note: 40, level: 0.14, decay: 0.45, every: [9, 16], double: true },
    song: {
      tune: [
        // The call, falling through the mode to D, and its answer, rising to rest on A, open.
        ['A4:1 Bb4:.5 A4:.5 G4:1 F#4:.5 G4:.5 Eb4:1.5 D4:3', 'D4:.5 Eb4:.5 F#4:1 G4:.5 A4:1.5 Bb4:.5 A4:.5 G4:.5 F#4:.5 A4:3'],
        // The call again, and an answer that comes home to D.
        ['A4:1 Bb4:.5 A4:.5 G4:1 F#4:.5 G4:.5 Eb4:1.5 D4:3', 'G4:.5 A4:.5 Bb4:1 A4:.5 G4:.5 F#4:1 Eb4:.5 F#4:.5 D4:3'],
        // Up high: climbing to the D above and falling to A, then up to G and all the way down home.
        [
          'A4:.5 C5:.5 D5:1.5 Eb5:.5 D5:1 C5:.5 Bb4:.5 A4:3',
          'D5:.5 F#5:.5 G5:2 F#5:.5 Eb5:.5 D5:1 C5:.5 Bb4:.5 A4:1 G4:.5 F#4:.5 Eb4:1 D4:4',
        ],
      ],
      level: 0.05,
      beat: 0.62,
      breath: 1,
      rest: [4, 8],
      pause: [20, 35],
      vibrato: 16,
      grace: 0.2,
    },
  },
];
