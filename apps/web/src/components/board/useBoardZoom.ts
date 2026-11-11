import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SHARP_CELL } from '../../art/tileImages';
import { REDUCED_MOTION } from '../../game/useMediaQuery';
import { canZoom as zoomable, centredOn, clampCell, fitted, frame, place, softCell, zoomAround, type View } from './zoomGeometry';

/** A pointer that moves less than this before it lifts is a tap, not a pan. */
const TAP_SLOP = 8;
/**
 * The wheel's zoom is drawn as a transform and committed once the wheel has been still this long. Long
 * enough not to land mid-pinch, where redrawing the map at its new size would drop frames.
 */
const WHEEL_SETTLE = 250;
/** The click a browser sends right after a drag ends, within this long, is the drag's and is ignored. */
const DRAG_CLICK = 400;
/** A flung map slows down with this time constant (ms), as a scrolled page does. */
const FLING_DECAY = 325;
/** Slower than this (px/ms) when let go, the map just stops. */
const FLING_MIN = 0.25;
/** How long the buttons' zoom, a wheel notch and the spring back from past an edge take (ms). */
const GLIDE_MS = 260;
/**
 * How closely the map follows the wheel (time constants, ms): a mouse wheel's notches ease in over a few
 * frames; a trackpad's stream is only evened out, as its events don't keep time with the screen's frames
 * (some frames get two steps, some none, and the map would stutter).
 */
const NOTCH_LAG = 60;
const TRACKPAD_LAG = 28;

export interface BoardZoom extends View {
  /** The wrap's size in pixels. */
  w: number;
  h: number;
  zoomed: boolean;
  /** Whether zooming does anything here (it doesn't when the spaces are big already). */
  canZoom: boolean;
  zoomBy: (factor: number) => void;
  fit: () => void;
  /** Pan so the space (r, c) is in the middle, as far as the board's edges allow. */
  centreOn: (r: number, c: number) => void;
  /**
   * Zoomed in, pan the space (r, c) into view if it's off screen, at the same zoom. Does nothing at the
   * whole map or while a finger or the mouse is on it, so it never fights a gesture.
   */
  reveal: (r: number, c: number) => void;
  /** Shows that the map zooms: in on the space (r, c) and back out again. A touch or the wheel stops it. */
  demo: (r: number, c: number) => void;
}

/** Safari's (non-standard) GestureEvent: `scale` since the gesture began. */
type SafariGesture = Event & { scale: number; clientX: number; clientY: number };
const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'];

/** Whether something around `el` scrolls vertically: then a plain wheel over the board scrolls it, not the zoom. */
function scrollsAround(el: HTMLElement): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    const scroller = p === document.scrollingElement || overflow === 'auto' || overflow === 'scroll';
    if (scroller && p.scrollHeight > p.clientHeight + 1) return true;
  }
  return false;
}

/**
 * The board's size and position in its wrap: fitted to it, or zoomed in and panned. Pinch and drag
 * (touch or mouse), the wheel (with Ctrl, a trackpad pinch, or any wheel when nothing around the board
 * scrolls) and `zoomBy` / `fit` / `centreOn` move it; the last three, and a wheel's notches, glide there. A
 * flung map carries on and slows down; pulled past an edge or a zoom limit, it gives and springs back. While a gesture is under way the board only gets a
 * CSS transform, and the wrap the class `gesture`; when it ends, the new size is committed as
 * `cell`, so dice, text and artwork redraw crisp. A drag never ends in a click on the board. A map of
 * another size starts fitted.
 */
export function useBoardZoom(wrap: RefObject<HTMLDivElement>, board: RefObject<HTMLDivElement>, rows: number, cols: number): BoardZoom {
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The zoom as a multiple of the fitted size, so it survives a resize; x, y as last committed; `map`
  // the map it was for.
  const map = `${rows}x${cols}`;
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0, map });

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Measured before the first paint, so the map doesn't show at a default size and then shrink.
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);

  const f = frame(size.w, size.h, rows, cols, SHARP_CELL / (window.devicePixelRatio || 1));
  const canZoom = zoomable(f);
  const zoomed = canZoom && view.map === map && view.zoom > 1.001;
  const current = zoomed ? place(f, clampCell(f, f.fit * view.zoom), view.x, view.y) : fitted(f);

  const commit = (v: View) => {
    const zoom = v.cell / f.fit;
    // What will be drawn: a hair past the whole map is the whole map.
    const next = canZoom && zoom > 1.001 ? place(f, clampCell(f, f.fit * zoom), v.x, v.y) : fitted(f); // as `current` works it out
    if (next.cell === current.cell && next.x === current.x && next.y === current.y) {
      // Nothing to redraw; just drop the preview, and the view waiting to be drawn.
      redraw.current?.();
      return;
    }
    setView({ zoom, x: v.x, y: v.y, map });
  };

  // Gesture handlers are attached once and read the latest values from here.
  const latest = useRef({ f, current, zoomed, commit, stopDemo: () => {} });
  /** Glides the map to the view `to` makes of where it's going (set by the gesture effect once mounted). */
  const glide = useRef<(to: (from: View) => View) => void>();
  /** Shows a view just committed and drawn: as is, or as the gesture under way (set by the gesture effect). */
  const redraw = useRef<() => void>();
  /** Whether a pointer is down on the map (set by the gesture effect). */
  const touching = useRef<() => boolean>(() => false);

  // The demo runs on timers; a touch, the wheel or unmounting stops it and puts the map back.
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopDemo = useCallback(() => {
    if (!demoTimers.current.length) return;
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
    wrap.current?.classList.remove('gesture');
    if (board.current) Object.assign(board.current.style, { transition: '', transform: '' });
  }, [wrap, board]);
  const demo = (r: number, c: number) => {
    const el = board.current;
    if (!el || !canZoom || zoomed) return;
    stopDemo();
    const cell = Math.min(f.max, current.cell * 2);
    const to = centredOn(f, cell, r, c);
    const at = (ms: number, step: () => void) => demoTimers.current.push(setTimeout(step, ms));
    wrap.current?.classList.add('gesture');
    el.style.transition = 'transform .9s cubic-bezier(.45, 0, .25, 1)';
    at(30, () => (el.style.transform = `translate(${to.x - current.x}px, ${to.y - current.y}px) scale(${cell / current.cell})`));
    at(2100, () => (el.style.transform = ''));
    at(3050, stopDemo);
  };

  latest.current = { f, current, zoomed, commit, stopDemo };
  useLayoutEffect(() => stopDemo, [stopDemo]);

  // The committed view has been drawn: drop the gesture's transform (the stage clips the map, see .stage).
  useLayoutEffect(() => {
    if (redraw.current) return redraw.current();
    wrap.current?.classList.remove('gesture');
    if (board.current) board.current.style.transform = '';
  }, [wrap, board, current.cell, current.x, current.y]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let base: View = latest.current.current; // the view when the pointers last changed
    let start = new Map<number, { x: number; y: number }>();
    let live: View | null = null; // what's on screen while panning, pinching, wheeling or gliding
    let goal: View | null = null; // where a glide or the wheel is heading
    let chasing = false; // the wheel's easing loop is running (towards `goal`)
    let lag = TRACKPAD_LAG; // its time constant
    // A view committed but not drawn yet: a gesture that starts in between carries on from it.
    let committed: View | null = null;
    let focus = { x: 0, y: 0 }; // the middle of the last pinch, which a spring back zooms around
    let track: { t: number; x: number; y: number }[] = []; // the last 100ms of a one-finger pan, for its speed
    let frame = 0; // a glide or fling under way
    let swallowUntil = 0; // clicks before this time belong to a drag
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let lastWheel = -Infinity; // when the last wheel event came, so a burst measures the page once
    let scrolls = false; // whether something around the board scrolls, as of this wheel burst
    let ctrlWheel = -Infinity; // when the last Ctrl+wheel (another browser's trackpad pinch) came
    let pinchFrom: View | null = null; // where Safari's trackpad pinch started
    // The wrap's place on the page, measured when a gesture starts (the board moves, the wrap doesn't).
    let rect = el.getBoundingClientRect();
    const reduced = matchMedia(REDUCED_MOTION);

    const local = (e: { clientX: number; clientY: number }) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    /** What's on screen. */
    const shown = () => live ?? committed ?? latest.current.current;
    /** Show `v` as a transform of the committed view, clipped to the wrap. */
    const preview = (v: View) => {
      live = v;
      el.classList.add('gesture');
      const from = latest.current.current;
      if (board.current) board.current.style.transform = `translate(${v.x - from.x}px, ${v.y - from.y}px) scale(${v.cell / from.cell})`;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      goal = null;
      chasing = false;
    };
    /** Commit what's on screen, so it redraws crisp. The clip stays until that's drawn (see above). */
    const finish = () => {
      stop();
      clearTimeout(wheelTimer);
      if (!live) return el.classList.remove('gesture');
      committed = live;
      live = null;
      latest.current.commit(committed);
    };
    /** Ease from what's on screen to `to`, then `done`. */
    const tween = (to: View, ms: number, done: () => void = finish) => {
      stop();
      const from = shown();
      if (reduced.matches) {
        preview(to);
        return done();
      }
      goal = to;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const k = 1 - (1 - t) ** 3;
        // Size and position change in step, so whatever point the glide zooms around stays put.
        preview({ cell: from.cell + (to.cell - from.cell) * k, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
        if (t < 1) frame = requestAnimationFrame(step);
        else {
          frame = 0;
          goal = null;
          done();
        }
      };
      frame = requestAnimationFrame(step);
    };
    /**
     * Head for `to`, easing what's on screen towards it a little each frame (time constant `ms`), so the
     * map moves evenly however unevenly the wheel's events come. A new `to` just moves the target.
     */
    const chase = (to: View, ms: number) => {
      if (reduced.matches) {
        stop();
        return preview(to);
      }
      lag = ms;
      if (!chasing) {
        stop();
        chasing = true;
        let last = performance.now();
        const step = (now: number) => {
          const dt = Math.min(50, now - last);
          last = now;
          const v = shown();
          const g = goal!;
          if (Math.abs(g.cell - v.cell) < 0.05 && Math.abs(g.x - v.x) < 0.3 && Math.abs(g.y - v.y) < 0.3) {
            preview(g);
            return stop();
          }
          // Size and position change in step, so the point under the cursor stays put.
          const k = 1 - Math.exp(-dt / lag);
          preview({ cell: v.cell + (g.cell - v.cell) * k, x: v.x + (g.x - v.x) * k, y: v.y + (g.y - v.y) * k });
          frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      }
      goal = to;
    };
    /** Let go while moving: the map carries on and slows down, stopping at the edges. */
    const fling = (vx: number, vy: number) => {
      stop();
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(32, now - last);
        last = now;
        const v = live!;
        const want = { x: v.x + vx * dt, y: v.y + vy * dt };
        const next = place(latest.current.f, v.cell, want.x, want.y);
        if (next.x !== want.x) vx = 0;
        if (next.y !== want.y) vy = 0;
        const decay = Math.exp(-dt / FLING_DECAY);
        vx *= decay;
        vy *= decay;
        preview(next);
        if (Math.hypot(vx, vy) < 0.02) return finish();
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    /** The last finger lifted: spring back inside the limits, or fling, or just stop. */
    const release = () => {
      if (swallowUntil === Infinity) swallowUntil = performance.now() + DRAG_CLICK;
      if (!live) return finish();
      const settled = zoomAround(latest.current.f, live, 1, focus.x, focus.y);
      if (Math.abs(settled.cell - live.cell) > 0.01 || Math.abs(settled.x - live.x) > 0.5 || Math.abs(settled.y - live.y) > 0.5)
        return tween(settled, GLIDE_MS);
      const now = performance.now();
      const recent = track.filter((p) => now - p.t < 100);
      const [a, b] = [recent[0], recent[recent.length - 1]];
      // A finger that stopped before lifting doesn't fling.
      if (a && b && b.t > a.t && now - b.t < 50) {
        const vx = (b.x - a.x) / (b.t - a.t);
        const vy = (b.y - a.y) / (b.t - a.t);
        if (Math.hypot(vx, vy) > FLING_MIN) return fling(vx, vy);
      }
      finish();
    };
    /** Pointers came or went: carry on from where the gesture is now. */
    const rebase = () => {
      base = shown();
      start = new Map(pointers);
      track = [];
    };
    const lift = (id: number) => {
      if (!pointers.delete(id)) return;
      if (pointers.size === 0) release();
      else rebase();
    };
    touching.current = () => pointers.size > 0;
    redraw.current = () => {
      committed = null;
      // A gesture went on while the view was being committed: show it over the new one.
      if (live) return preview(live);
      el.classList.remove('gesture');
      if (board.current) board.current.style.transform = '';
    };
    glide.current = (to) => {
      latest.current.stopDemo();
      clearTimeout(wheelTimer);
      tween(to(goal ?? shown()), GLIDE_MS);
    };

    const down = (e: PointerEvent) => {
      latest.current.stopDemo();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as Element).closest('.zoom-controls, .zoom-hint')) return;
      if (!zoomable(latest.current.f)) return;
      // A touch catches a moving map, and is only that, not a tap on what's under it.
      if (pointers.size === 0) {
        swallowUntil = frame ? Infinity : 0;
        rect = el.getBoundingClientRect();
      }
      stop();
      clearTimeout(wheelTimer);
      pointers.set(e.pointerId, local(e));
      rebase();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      // The button was let go where we didn't see it (outside the window, say): that drag is over.
      if (e.pointerType === 'mouse' && e.buttons === 0) return lift(e.pointerId);
      pointers.set(e.pointerId, local(e));
      const { f, zoomed } = latest.current;
      const pts = [...pointers.values()];
      const was = [...pointers.keys()].map((id) => start.get(id)!);
      let next: View;
      if (pts.length >= 2) {
        const [a, b] = pts;
        const [a0, b0] = was;
        const s = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, Math.hypot(a0.x - b0.x, a0.y - b0.y));
        const cell = softCell(f, base.cell * s);
        const k = cell / base.cell;
        const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
        const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        focus = m1;
        next = place(f, cell, m1.x - (m0.x - base.x) * k, m1.y - (m0.y - base.y) * k, true);
      } else {
        // One pointer pans, but only a zoomed board, and only once it has moved more than a tap would.
        const [p] = pts;
        const [p0] = was;
        if (!live && (!zoomed || Math.hypot(p.x - p0.x, p.y - p0.y) < TAP_SLOP)) return;
        next = place(f, base.cell, base.x + p.x - p0.x, base.y + p.y - p0.y, true);
        const now = performance.now();
        track = [...track.filter((q) => now - q.t < 100), { t: now, x: next.x, y: next.y }];
      }
      if (!el.hasPointerCapture(e.pointerId)) for (const id of pointers.keys()) el.setPointerCapture(id);
      swallowUntil = Infinity;
      preview(next);
    };
    const up = (e: PointerEvent) => lift(e.pointerId);
    // A drag that ends over a mech or a space must not also act on it.
    const click = (e: MouseEvent) => {
      if (performance.now() >= swallowUntil) return;
      swallowUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    };
    /** Commits once the map has been still for a moment (the wheel's events, a trackpad pinch), not mid-gesture. */
    const settle = () => void (wheelTimer = setTimeout(() => (chasing ? settle() : finish()), WHEEL_SETTLE));
    const wheel = (e: WheelEvent) => {
      latest.current.stopDemo();
      const { f } = latest.current;
      const now = performance.now();
      if (now - lastWheel > WHEEL_SETTLE) {
        scrolls = scrollsAround(el);
        rect = el.getBoundingClientRect();
      }
      lastWheel = now;
      if (e.ctrlKey) ctrlWheel = now;
      if (!zoomable(f) || pointers.size || (!e.ctrlKey && scrolls)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const at = local(e);
      const from = goal ?? shown();
      const next = zoomAround(f, from, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), at.x, at.y);
      if (next.cell === from.cell && next.x === from.x && next.y === from.y) return;
      clearTimeout(wheelTimer);
      // A mouse wheel moves in notches (or a trackpad flicked hard: big steps).
      chase(next, e.deltaMode !== 0 || (!e.ctrlKey && Math.abs(dy) >= 40) ? NOTCH_LAG : TRACKPAD_LAG);
      settle();
    };
    /**
     * Safari's trackpad pinch comes as gesture events, not a Ctrl+wheel, and would zoom the page. On iOS a
     * pinch fires them too, alongside its touches, which zoom the map already (above), as does a Ctrl+wheel.
     */
    const gesture = (e: SafariGesture) => {
      e.preventDefault();
      const { f } = latest.current;
      if (e.type === 'gesturestart') {
        pinchFrom = null;
        if (pointers.size || !zoomable(f)) return;
        latest.current.stopDemo();
        stop();
        clearTimeout(wheelTimer);
        rect = el.getBoundingClientRect();
        pinchFrom = shown();
      } else if (e.type === 'gesturechange') {
        if (!pinchFrom || pointers.size || performance.now() - ctrlWheel < WHEEL_SETTLE) return;
        const at = Number.isFinite(e.clientX) ? local(e) : { x: f.w / 2, y: f.h / 2 };
        clearTimeout(wheelTimer);
        chase(zoomAround(f, pinchFrom, e.scale, at.x, at.y), TRACKPAD_LAG);
      } else if (pinchFrom) {
        pinchFrom = null;
        settle();
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    for (const type of GESTURES) el.addEventListener(type, gesture as EventListener);
    return () => {
      for (const type of GESTURES) el.removeEventListener(type, gesture as EventListener);
      stop();
      clearTimeout(wheelTimer);
      glide.current = undefined;
      redraw.current = undefined;
      touching.current = () => false;
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
    };
  }, [wrap, board]);

  /** Glide to a view, or jump there before the gesture effect is attached. */
  const go = (to: (from: View) => View) => (glide.current ? glide.current(to) : commit(to(current)));

  return {
    ...current,
    w: size.w,
    h: size.h,
    zoomed,
    canZoom,
    zoomBy: (factor) => go((from) => zoomAround(f, from, factor, f.w / 2, f.h / 2)),
    fit: () => go(() => fitted(f)),
    demo,
    centreOn: (r, c) => go((from) => centredOn(f, from.cell, r, c)),
    reveal: (r, c) => {
      if (!zoomed || touching.current()) return;
      const { cell, x, y } = current;
      const inView = x + c * cell >= 0 && x + (c + 1) * cell <= f.w && y + r * cell >= 0 && y + (r + 1) * cell <= f.h;
      if (!inView) go((from) => centredOn(f, from.cell, r, c));
    },
  };
}
