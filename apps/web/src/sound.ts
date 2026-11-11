// Tiny synthesized sound kit (no audio files). All sounds are short and quiet.

import { ARRIVE, BATTLE, BEAM_ARRIVES, boomAt, CUBE, DICE, MOST_BOOMS, MECH, SHOT } from './beats';
import { effects, envelope, filter, gain, glide, jitter, kept, noiseSource, oscillator, out } from './audio';
import { fanfare, lament } from './gameOverSound';
import { pick } from './random';

/** A few short random click samples reused by every dice clatter. */
const clickBuffers = kept((ac) => {
  const size = Math.floor(ac.sampleRate * 0.035);
  return Array.from({ length: 8 }, () => {
    const buf = ac.createBuffer(1, size, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    return buf;
  });
});

function click(ac: AudioContext, at: number, level: number, freq: number) {
  const src = ac.createBufferSource();
  src.buffer = pick(clickBuffers(ac));
  src
    .connect(filter(ac, 'bandpass', freq, 2.5))
    .connect(gain(ac, level))
    .connect(out(ac));
  src.start(at);
}

/** A click `delay` seconds from now, as `tone` and `noise` take theirs. */
function tick(gain: number, freq: number, delay = 0) {
  const ac = effects();
  if (ac) click(ac, ac.currentTime + delay, gain, freq);
}

/**
 * A die rolled, heard as Die3D shows it (beats.ts): a faint toss as it leaves the table, then clicks that slow
 * down and soften from when it lands back to when it settles.
 */
export function playRoll(count = 1) {
  const ac = effects();
  if (!ac) return;
  const now = ac.currentTime;
  click(ac, now, 0.05, 2600 + Math.random() * 1200);
  const hits = 7 + count * 2;
  const gaps = Array.from({ length: hits - 1 }, (_, i) => 0.035 + (i + 1) * 0.012 + Math.random() * 0.03);
  const fit = (DICE.hop - DICE.lands) / 1000 / gaps.reduce((a, b) => a + b, 0);
  let t = DICE.lands / 1000;
  for (let i = 0; i < hits; i++) {
    click(ac, now + t, 0.22 * (1 - i / hits) + 0.03, 1800 + Math.random() * 2200);
    t += (gaps[i] ?? 0) * fit;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number, rise = 0.01) {
  const ac = effects();
  if (!ac) return;
  const at = ac.currentTime + delay;
  const osc = oscillator(ac, type, freq, at, at + dur + 0.05);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  osc.connect(envelope(ac, at, dur, gain, rise)).connect(out(ac));
}

/** Filtered noise whose filter sweeps from `from` to `to` Hz: whooshes, hisses and booms. */
function noise(
  dur: number,
  gain: number,
  {
    delay = 0,
    type = 'bandpass',
    from = 1000,
    to = from,
    q = 1,
    rise = 0.01,
  }: {
    delay?: number;
    type?: BiquadFilterType;
    from?: number;
    to?: number;
    q?: number;
    rise?: number;
  } = {},
) {
  const ac = effects();
  if (!ac) return;
  const at = ac.currentTime + delay;
  const f = filter(ac, type, from, q);
  glide(f.frequency, at, from, [[dur, to]]);
  noiseSource(ac, at, at + dur + 0.05)
    .connect(f)
    .connect(envelope(ac, at, dur, gain, rise))
    .connect(out(ac));
}

/** A low boom with a crackling tail. */
function boom(delay = 0, size = 1) {
  noise(0.7 * size, 0.5, { delay, type: 'lowpass', from: 1800, to: 80, q: 0.7, rise: 0.005 });
  tone(jitter(110), 0.55 * size, 'sine', 0.3, delay, 32, 0.005);
  noise(0.35, 0.08, { delay: delay + 0.08, type: 'highpass', from: 3000, to: 1200, rise: 0.02 });
}

/**
 * A cube dropped on an objective, heard as the board shows it (beats.ts): a falling whistle, the clack of it
 * landing, then a ringing chord as the objective is claimed. `delay`: when the drop starts, in seconds.
 */
function cubeDrop(delay = 0) {
  const fall = CUBE.fall / 1000;
  noise(fall, 0.05, { delay, type: 'bandpass', from: 2600, to: 900, q: 2, rise: fall * 0.75 });
  const land = delay + fall;
  tone(jitter(150), 0.2, 'sine', 0.28, land, 70, 0.003);
  noise(0.05, 0.25, { delay: land, type: 'bandpass', from: 2400, q: 3, rise: 0.002 });
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.8, 'sine', 0.04, land + 0.03 + i * 0.035));
}

/** A battle's result sting waits this long, in seconds, for the blow to land and the result to be stamped (.arena-stamp). */
const STAMP = 0.22;

export const sfx = {
  select: () => tone(880, 0.07, 'sine', 0.05),
  /** It's your move (online): two soft notes rising. `level` turns it down (in the game, where the player is watching). */
  yourMove: (level = 1) => {
    tone(784, 0.22, 'sine', 0.06 * level, 0, undefined, 0.01);
    tone(1175, 0.4, 'sine', 0.05 * level, 0.15, undefined, 0.01);
  },
  /** A mech flying across the board: a deep engine rumble that swells as it passes, for as long as it glides (beats.ts). */
  fly: () => {
    const f = jitter(1);
    const glide = MECH.glide / 1000;
    noise(glide, 0.3, { type: 'lowpass', from: 160 * f, to: 520 * f, q: 3, rise: 0.25 });
    tone(48 * f, glide, 'sine', 0.16, 0, 72 * f, 0.2);
    tone(96 * f, glide - 0.05, 'triangle', 0.05, 0.02, 140 * f, 0.2);
  },
  /**
   * A mech arriving on the board from the salvage yard or reserve, or brought by a card: a rising shimmer, and
   * the thump of it landing `land` ms in, as it appears (beats.ts).
   */
  arrive: (land: number = ARRIVE.land) => {
    tone(300, 0.35, 'sine', 0.05, 0, 1300, 0.12);
    tone(450, 0.35, 'triangle', 0.025, 0.02, 1950, 0.12);
    noise(0.35, 0.05, { type: 'highpass', from: 2000, to: 7000, rise: 0.25 });
    tone(180, 0.12, 'sine', 0.12, land / 1000, 120);
  },
  /** Two mechs trading places: two tones crossing. */
  swap: () => {
    tone(500, 0.3, 'sine', 0.05, 0, 1100);
    tone(1100, 0.3, 'sine', 0.05, 0, 500);
    noise(0.3, 0.05, { type: 'bandpass', from: 900, to: 2600, q: 3, rise: 0.12 });
  },
  /** A mech number changed without a roll: a mechanical servo. */
  retune: () => {
    tone(220, 0.07, 'square', 0.025, 0, 330);
    tone(330, 0.09, 'square', 0.025, 0.08, 440);
    noise(0.04, 0.1, { delay: 0.17, type: 'bandpass', from: 3200, q: 2.5, rise: 0.003 });
  },
  /** A mech destroyed, `after` ms from now. `count` > 1 stagger a few booms, as Explosions does (beats.ts). */
  explode: (count = 1, after = 0) => {
    for (let i = 0; i < Math.min(count, MOST_BOOMS); i++) boom((after + boomAt(i)) / 1000, i ? 0.8 : 1);
  },
  /** A mech beaten in a battle's strip: the blow, metal crumpling, debris and the fire catching. Its boom is for the map, as the battle closes. */
  wreck: () => {
    tone(jitter(90), 0.3, 'sine', 0.35, 0, 38, 0.003);
    noise(0.09, 0.4, { type: 'bandpass', from: 2200, to: 700, q: 1.2, rise: 0.002 });
    [0.05, 0.11, 0.19, 0.3].forEach((d, i) => tick(0.2 - i * 0.035, jitter(1100 - i * 150), d));
    noise(0.6, 0.12, { delay: 0.06, type: 'lowpass', from: 1400, to: 250, rise: 0.05 });
  },
  /** An attack repelled: a thud on the defender's guard, and the guard ringing like a struck plate. */
  repel: () => {
    tone(jitter(120), 0.12, 'sine', 0.25, 0, 70, 0.002);
    noise(0.04, 0.2, { type: 'highpass', from: 2500, rise: 0.001 });
    (
      [
        [740, 0.05, 0.45],
        [1130, 0.035, 0.32],
        [1790, 0.025, 0.2],
        [2470, 0.015, 0.12],
      ] as const
    ).forEach(([f, level, dur]) => tone(jitter(f, 0.03), dur, 'triangle', level, 0, undefined, 0.002));
  },
  /** A battle won by this screen's player, a mech destroyed: a brass stab rising, as the result is stamped. */
  triumph: () => {
    [196, 294, 392].forEach((f, i) => {
      tone(f, 0.28, 'sawtooth', 0.03, STAMP + i * 0.09);
      tone(f * 2, 0.28, 'triangle', 0.03, STAMP + i * 0.09);
    });
  },
  /** A battle lost by this screen's player, its mech destroyed: low brass sinking. */
  defeat: () => {
    [233, 196, 147].forEach((f, i) => tone(f, i === 2 ? 0.7 : 0.26, 'sawtooth', 0.035, STAMP + i * 0.17, i === 2 ? 110 : undefined));
    tone(73, 0.9, 'sine', 0.12, STAMP + 0.34, 49);
  },
  /** A shot fired in a battle's strip: the rifle's crack. */
  gunshot: () => {
    noise(0.05, 0.4, { type: 'highpass', from: 1800, rise: 0.001 });
    tone(jitter(160), 0.08, 'sine', 0.2, 0, 70, 0.002);
  },
  /** A shot flying past its target: a falling whine, gone by. */
  whizz: () => {
    tone(jitter(2400), 0.35, 'sine', 0.035, 0.05, 700, 0.1);
    noise(0.35, 0.06, { delay: 0.05, type: 'bandpass', from: 5000, to: 1400, q: 3, rise: 0.12 });
  },
  /** An atomic: launched, its whistle falling, then it goes off as the battle's result shows (beats.ts): a crack, a long rolling rumble, the air rushing back. */
  atomic: () => {
    const fall = BATTLE.atomic / 1000;
    noise(0.12, 0.22, { type: 'lowpass', from: 900, to: 300, rise: 0.003 });
    tone(2000, fall, 'sine', 0.035, 0.02, 420, fall * 0.3);
    noise(fall, 0.05, { delay: 0.02, type: 'bandpass', from: 4200, to: 900, q: 1.5, rise: fall * 0.6 });
    noise(0.07, 0.6, { delay: fall, type: 'lowpass', from: 9000, rise: 0.001 });
    noise(2.2, 0.55, { delay: fall, type: 'lowpass', from: 1500, to: 45, q: 0.7, rise: 0.01 });
    tone(jitter(62), 2, 'sine', 0.4, fall, 22, 0.008);
    noise(1.5, 0.05, { delay: fall + 0.15, type: 'highpass', from: 1800, to: 5000, rise: 0.9 });
  },
  /** A shot on the map: ignition, a screaming climb with a hissing trail, then the impact as it lands, `after` ms in (beats.ts); with none, only the impact. */
  shot: (after: number = SHOT.flight) => {
    const flight = after / 1000;
    if (flight) {
      noise(0.12, 0.25, { type: 'lowpass', from: 900, to: 300, rise: 0.003 });
      tone(260, flight - 0.05, 'sawtooth', 0.03, 0.03, 1800, 0.05);
      noise(flight, 0.12, { delay: 0.03, type: 'bandpass', from: 1200, to: 5000, q: 1.2, rise: 0.08 });
    }
    boom(flight, 0.7);
  },
  /** Atomics gained: two metal clunks of rounds racked into place. */
  atomicLoad: () => {
    for (const d of [0, 0.14]) {
      tone(190, 0.09, 'triangle', 0.1, d, 140);
      noise(0.05, 0.12, { delay: d, type: 'bandpass', from: 3400, q: 6, rise: 0.003 });
    }
  },
  /** A cube placed on an objective: claimed, seized, or a starting objective. */
  cube: () => cubeDrop(),
  /** A cube knocked off an objective (a claim displacing it): a clack, the cube tumbling away, a falling note. */
  displace: () => {
    noise(0.05, 0.22, { type: 'bandpass', from: 1800, q: 3, rise: 0.002 });
    [0.09, 0.17, 0.23].forEach((d, i) => tick(0.14 - i * 0.03, 1500 - i * 250, d));
    tone(392, 0.4, 'triangle', 0.045, 0.02, 196);
  },
  /** A cube relocated: the beam carrying it (board/CardEffects), then its drop where it lands (game/staging). */
  relocate: () => {
    const ride = BEAM_ARRIVES / 1000;
    tone(1400, ride, 'sine', 0.035, 0, 500, 0.05);
    noise(ride, 0.05, { type: 'highpass', from: 6000, to: 2000, rise: 0.1 });
    cubeDrop(ride);
  },
  /** Research gained: a quick rising data chirp. */
  research: () => [880, 1175, 1760].forEach((f, i) => tone(f, 0.09, 'triangle', 0.035, i * 0.05)),
  /** Power gained: a low surge of power. */
  power: () => {
    tone(98, 0.45, 'sawtooth', 0.03, 0, 147, 0.08);
    tone(196, 0.4, 'triangle', 0.04, 0.03, 294, 0.08);
  },
  /** A card taken: a paper flick. */
  card: () => {
    noise(0.08, 0.1, { type: 'highpass', from: 2500, to: 5000, rise: 0.005 });
    tone(520, 0.12, 'triangle', 0.04, 0.02, 700);
  },
  /** Cards discarded: a downward paper swish. */
  discard: () => noise(0.25, 0.08, { type: 'bandpass', from: 5000, to: 1200, q: 0.8, rise: 0.05 }),
  /** A Discovery: a sparkling rising arpeggio. */
  discovery: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.25, 'sine', 0.045, i * 0.06)),
  /** Take Over: an ominous low brass chord. */
  takeOver: () => [110, 165, 131].forEach((f, i) => tone(f, 1.1, 'sawtooth', 0.035, i * 0.05, undefined, 0.15)),
  /** A skill used: a bright power-up zap. */
  skill: () => {
    tone(660, 0.12, 'triangle', 0.05, 0, 1320);
    tone(1320, 0.18, 'sine', 0.035, 0.08, 1760);
  },
  /** A mech salvaged by Recycle: everything rushing inward, then a small dull pop as it's gone. */
  implode: () => {
    tone(900, 0.28, 'sine', 0.06, 0, 90, 0.02);
    noise(0.28, 0.09, { type: 'bandpass', from: 5000, to: 300, q: 2, rise: 0.2 });
    tone(60, 0.12, 'sine', 0.25, 0.28, 35, 0.002);
    tick(0.18, 700, 0.28);
  },
  /** A barrier blown (the Wisp, Barricade): the pulse's hiss, the blister swelling, then the glass ringing as it freezes. */
  barrier: () => {
    noise(0.12, 0.18, { type: 'highpass', from: 3000, to: 1200, rise: 0.003 });
    tone(jitter(260), 0.16, 'triangle', 0.08, 0, 620);
    [2093, 3136, 4186].forEach((f, i) => tone(jitter(f, 0.02), 0.5 - i * 0.1, 'sine', 0.03 - i * 0.007, 0.14, undefined, 0.002));
  },
  /** Kinetic Shunt: a heavy shove, then what it pushed scraping along for as long as it glides (beats.ts). */
  shunt: () => {
    tone(jitter(70), 0.2, 'sine', 0.35, 0, 40, 0.003);
    noise(0.05, 0.3, { type: 'lowpass', from: 1600, rise: 0.002 });
    noise(MECH.glide / 1000, 0.1, { delay: 0.03, type: 'bandpass', from: 700, to: 300, q: 2, rise: 0.02 });
  },
  /** Orbital Cannon's lance: a charging whine, then the crack as it strikes, `strike` ms in (game/strike). */
  lance: (strike = 0) => {
    const at = strike / 1000;
    if (at) {
      tone(500, at, 'sawtooth', 0.025, 0, 3200, at * 0.6);
      noise(at, 0.06, { type: 'highpass', from: 2000, to: 8000, rise: at * 0.8 });
    }
    noise(0.06, 0.4, { delay: at, type: 'highpass', from: 2500, rise: 0.001 });
    tone(1800, 0.22, 'sine', 0.05, at, 300, 0.002);
  },
  /** Unstable Reactor's arc: an electric buzz and crackle as it reaches across, joining the two mechs `strike` ms in (game/strike). */
  arc: (strike = 0) => {
    const dur = strike / 1000 + 0.15;
    tone(jitter(120), dur, 'sawtooth', 0.04);
    for (let i = 0; i < 10; i++) tick(0.12, 2500 + Math.random() * 3500, (i * dur) / 10 + Math.random() * 0.01);
  },
  /** An Ice Tunnel opening: a wobbling hum that swells. */
  portal: () => {
    tone(110, 0.9, 'sine', 0.08, 0, 220, 0.3);
    tone(113, 0.9, 'sine', 0.08, 0, 226, 0.3);
    noise(0.9, 0.06, { type: 'bandpass', from: 300, to: 3000, q: 4, rise: 0.5 });
  },

  // Tactics: a signature sound each, played as the card resolves.
  /** Power Grab: war drums. */
  drums: () => {
    for (const d of [0, 0.18, 0.3, 0.42]) {
      tone(95, 0.22, 'sine', 0.22, d, 45, 0.004);
      noise(0.08, 0.1, { delay: d, type: 'lowpass', from: 900, rise: 0.003 });
    }
  },
  /** Contraband: coins changing hands (the atomics' own sound follows). */
  coins: () => {
    for (const d of [0, 0.07, 0.16]) {
      tone(jitter(2600, 0.05), 0.15, 'sine', 0.03, d);
      tone(jitter(3900, 0.05), 0.1, 'sine', 0.02, d);
    }
  },
  /** Headhunter: a deck being riffled. */
  shuffle: () => {
    for (let i = 0; i < 18; i++) tick(0.08, 3000 + Math.random() * 3000, i * 0.025 + Math.random() * 0.01);
  },
  /** Forced March: a spin-up that keeps getting faster. */
  forcedMarch: () => {
    let t = 0;
    for (let i = 0; i < 8; i++) {
      tone(300 + i * 90, 0.06, 'triangle', 0.04, t);
      t += 0.11 - i * 0.01;
    }
    tone(1100, 0.3, 'sine', 0.04, t, 1600);
  },
  /** Kill Zone: target-lock beeps, then the lock tone. */
  lockOn: () => {
    [0, 0.16, 0.28, 0.37].forEach((d) => tone(1250, 0.05, 'square', 0.02, d));
    tone(1650, 0.35, 'square', 0.018, 0.46);
  },
  /** Sabotage: everyone else's systems powering down, with a glitch. */
  powerDown: () => {
    tone(700, 0.8, 'sawtooth', 0.035, 0, 60);
    noise(0.8, 0.04, { type: 'lowpass', from: 4000, to: 200 });
    [0.15, 0.22, 0.4].forEach((d) => tick(0.12, 900, d));
  },
  /** Orbital Cannon: a klaxon while a target is chosen. */
  alarm: () => [0, 0.22, 0.44, 0.66].forEach((d, i) => tone(i % 2 ? 440 : 560, 0.2, 'square', 0.025, d)),
  /** Invasion: a deep swell as the fleet is recalled. */
  invasion: () => {
    tone(55, 1.2, 'sawtooth', 0.05, 0, 110, 0.6);
    noise(1.1, 0.08, { type: 'bandpass', from: 200, to: 2500, q: 1.5, rise: 0.8 });
    [220, 277, 330].forEach((f) => tone(f, 0.9, 'triangle', 0.03, 0.8));
  },
  /** Reinforcements: a launch horn as a new mech is built. */
  launch: () => {
    tone(196, 0.5, 'sawtooth', 0.03, 0, 392, 0.1);
    tone(294, 0.5, 'sawtooth', 0.025, 0.05, 588, 0.1);
  },

  win: fanfare,
  /** The game won by someone else, heard by a player who lost. */
  lose: lament,
  error: () => tone(200, 0.15, 'sine', 0.05, 0, 150),
};
