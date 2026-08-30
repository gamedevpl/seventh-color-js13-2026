// What the unicorn is DOING. Every pose writes target angles into a scratch
// vector and the rig eases toward it, which buys every transition in the
// game for one exponential - rearing settles back down, a grazing head
// comes up to meet the camera, and none of it needs a transition table.
//
// The gait cycles are written directly rather than eased, because a 2 Hz
// cycle under a 0.1 s time constant loses almost nothing and a slower one
// would damp the very thing being animated.

import { NB, LEGS } from './uni.js';
import { BPM } from './snd.js';

// Pose ids. Kept as small ints because behaviour, scoring and the HUD all
// speak in them.
export const GRAZE = 0, IDLE = 1, WALK = 2, TROT = 3, GALLOP = 4,
  REAR = 5, TOSS = 6, SHAKE = 7, SLEEP = 8, PRANCE = 9, BOW = 10;

// Names double as the photo caption vocabulary, so they read as English.
export const POSE_NAME = [
  'grazing', 'standing', 'walking', 'trotting', 'galloping',
  'rearing', 'mane toss', 'shaking out', 'asleep', 'prancing', 'taking a bow',
];

// Gait phase offsets per leg, in the rig's leg order (hindL hindR foreL
// foreR). A walk is the four-beat sequence, a trot is diagonal pairs, and
// a gallop leads with the hind pair a fraction ahead of the fore.
const GAITS = {
  [WALK]: [0, .5, .25, .75],
  [TROT]: [0, .5, .5, 0],
  [GALLOP]: [0, .12, .5, .62],
};
// LOCKED TO THE TRACK. Every gait is a whole number of beats per stride, so
// the hooves land on the music instead of near it - which for a game whose
// subject is a unicorn showing off to a strut is most of the difference
// between an animal moving and an animal performing.
//
// Worth recording: these were tuned by eye first, at 1.1 / 1.9 / 2.6, and
// the tempo-locked values come out at 0.97 / 1.93 / 2.58. The lock is free.
const BPS = BPM / 60;
const GAIT_HZ = { [WALK]: BPS / 2, [TROT]: BPS, [GALLOP]: BPS / .75 };
const GAIT_SWING = { [WALK]: .34, [TROT]: .52, [GALLOP]: .78 };

const T = new Float32Array(NB * 3);

const set = (i, p, y = 0, r = 0) => { T[i * 3] = p; T[i * 3 + 1] = y; T[i * 3 + 2] = r; };

// A leg pair: upper swings, lower folds during the forward reach. The knee
// only ever bends one way, which is what max(0, ...) is for - a leg that
// bends both ways reads as broken rather than as animated.
function legCycle(li, ph, swing) {
  const u = LEGS[li];
  set(u, -swing * Math.sin(ph));
  T[(u + 1) * 3] = swing * 1.5 * Math.max(0, Math.sin(ph - .7));
}

function standLegs(spread = 0) {
  for (let i = 0; i < 4; i++) {
    const u = LEGS[i];
    set(u, spread * (i < 2 ? 1 : -1));
    T[(u + 1) * 3] = .04;
  }
}

// st carries the animation clock and where the unicorn wants to look.
// Returns the root height offset the pose asks for, so a rearing or
// sleeping unicorn sits at the right height without the caller knowing
// which pose it is.
export function poseTarget(st) {
  const t = st.t, m = st.mode;
  let lift = 0, pitch = 0, roll = 0;
  T.fill(0);

  if (m === GRAZE) {
    standLegs(.05);
    // Head down to the grass, with a slow chew and a shift of weight.
    set(1, 1.05 + Math.sin(t * .7) * .04);
    set(2, .55 + Math.abs(Math.sin(t * 3.1)) * .07, Math.sin(t * .35) * .3);
    set(3, .3 + Math.sin(t * 1.3) * .18, Math.sin(t * .9) * .35);
    pitch = .05;
  } else if (m === IDLE) {
    standLegs(.03);
    // Breathing, an ear-flick shift, an idle tail. A perfectly still
    // animal reads as a statue and photographs like one.
    set(1, -.06 + Math.sin(t * .8) * .05);
    set(2, .04 + Math.sin(t * 1.7) * .03);
    set(3, .12, Math.sin(t * 1.1) * .4);
    lift = Math.sin(t * .8) * .006;
  } else if (m === WALK || m === TROT || m === GALLOP) {
    const hz = GAIT_HZ[m], sw = GAIT_SWING[m], off = GAITS[m];
    const ph = t * hz * 6.283;
    for (let i = 0; i < 4; i++) legCycle(i, ph + off[i] * 6.283, sw);
    // The body rises twice per cycle and pitches into the stride.
    lift = Math.abs(Math.sin(ph)) * (m === GALLOP ? .1 : .03);
    pitch = Math.sin(ph * 2) * (m === GALLOP ? .1 : .03);
    set(1, -.12 - sw * .2 + Math.sin(ph) * .1);
    set(2, .08 + Math.sin(ph) * .06);
    set(3, -.1 - sw * .3, Math.sin(ph) * .3);
  } else if (m === REAR) {
    // The money shot. The root pivots at the hip, so pitching it back
    // lifts everything forward of the hindquarters for free.
    const u = Math.min(1, st.hold * 2.2);       // rises fast, holds
    const R = .95;                              // how far the body goes back
    pitch = -R * u;
    lift = -.08 * u;
    // EVERY bone above the root inherits that pitch, so each one that wants
    // to stay upright in the world has to cancel it. Getting this wrong is
    // what made the first cut read as an animal falling over backwards
    // rather than rearing: the neck was set 0.55 back from a body already
    // 1.15 back, which put it past vertical.
    for (let i = 0; i < 2; i++) {               // hind legs stay planted
      set(LEGS[i], (R - .25) * u);
      T[(LEGS[i] + 1) * 3] = .45 * u;
    }
    for (let i = 2; i < 4; i++) {               // forelegs paw the air
      const k = i === 2 ? 1 : -1;
      set(LEGS[i], -.85 * u + Math.sin(t * 7 + k) * .3 * u);
      T[(LEGS[i] + 1) * 3] = (1.3 + Math.sin(t * 7 + k) * .4) * u;
    }
    set(1, R * .8 * u);                          // neck near vertical
    set(2, .25 * u);                             // head level, looking out
    set(3, (R - 1.35) * u, Math.sin(t * 4) * .3);
  } else if (m === TOSS) {
    // A mane toss: the head whips up and sideways, and the hair does the
    // rest. Short, sharp, and worth pointing a camera at.
    const u = Math.sin(Math.min(3.14, st.hold * 5.2));
    const w = Math.sin(st.hold * 12);
    standLegs(.04);
    // The whip has to be sharp AND wide, because the mane is solved from
    // the head's motion - a gentle nod moves the roots slowly enough that
    // follow-the-leader keeps every strand tidy, and nothing flies.
    set(1, -.62 * u, w * .35 * u);
    set(2, -.35 * u, w * 1.15 * u, w * .6 * u);
    set(3, -.25, Math.sin(t * 5) * .6);
    roll = w * .11 * u;
    lift = u * .04;
  } else if (m === SHAKE) {
    // A whole-body shimmy that travels from the withers back.
    const u = Math.min(1, st.hold * 4) * Math.min(1, (1.4 - st.hold) * 4);
    standLegs(.09);
    const w = Math.sin(t * 21) * u;
    roll = w * .16;
    set(1, -.15, w * .5, w * .6);
    set(2, .05, w * .7, w * .5);
    set(3, .1, w * 1.1);
    lift = Math.abs(w) * .02;
  } else if (m === SLEEP) {
    // Folded on the ground. The root drops most of a leg's length and the
    // legs tuck rather than dangle.
    lift = -.42;
    pitch = .08;
    for (let i = 0; i < 4; i++) {
      set(LEGS[i], i < 2 ? 1.35 : 1.25);
      T[(LEGS[i] + 1) * 3] = i < 2 ? 1.9 : 2.0;
    }
    set(1, .55 + Math.sin(t * .5) * .03);        // slow breathing
    set(2, .35, .55);                            // head curled round
    set(3, .5, .3);
  } else if (m === PRANCE) {
    // Knows exactly how good it looks. High knees, arched neck, tail up -
    // one step per beat, which is what makes it read as a catwalk rather
    // than as a horse that happens to be lifting its feet.
    const ph = t * BPS * 6.283;
    for (let i = 0; i < 4; i++) {
      const u = LEGS[i], p = ph + [0, .5, .5, 0][i] * 6.283;
      set(u, -.3 * Math.sin(p));
      T[(u + 1) * 3] = Math.max(0, Math.sin(p - .5)) * 1.5;   // high knee
    }
    lift = Math.abs(Math.sin(ph)) * .05;
    set(1, -.42 + Math.sin(ph) * .06);           // arched, head tucked in
    set(2, .5);
    set(3, -.75, Math.sin(ph) * .25);            // tail carried high
    roll = Math.sin(ph) * .05;
  } else if (m === BOW) {
    // Front end down, hindquarters up, forelegs reaching out along the
    // floor. Same inheritance rule as rearing, with the sign flipped: the
    // root tips nose-down by B, so the hind legs cancel B to stay standing
    // and the forelegs need B taken off the angle they actually want.
    const B = .5, u = Math.min(1, st.hold * 2.4);
    pitch = B * u;
    // The hip goes UP, not down. Tipping the body nose-down swings the
    // reaching forelegs below the floor - measured at 9.6 cm under it - and
    // raising the hindquarters is what a bow does anyway.
    lift = .04 * u;
    for (let i = 0; i < 2; i++) {
      set(LEGS[i], -B * u);
      T[(LEGS[i] + 1) * 3] = .12 * u;
    }
    for (let i = 2; i < 4; i++) {
      set(LEGS[i], (-1.35 - B) * u + .06 * i);
      T[(LEGS[i] + 1) * 3] = .1 * u;
    }
    set(1, .55 * u);
    set(2, .3 * u);
    set(3, -.55 * u, Math.sin(t * 2.2) * .3);
  }

  // Looking at the camera is applied ON TOP of whatever the pose is doing,
  // split between neck and head so the whole animal turns rather than the
  // skull swivelling on a fixed neck. This is what makes eye contact - and
  // eye contact is the whole game.
  const g = st.gaze;
  if (g) {
    T[1 * 3 + 1] += st.lookYaw * .45 * g;
    T[2 * 3 + 1] += st.lookYaw * .55 * g;
    T[1 * 3] += -st.lookPitch * .3 * g;
    T[2 * 3] += -st.lookPitch * .7 * g;
  }
  // The root's own tilt rides in the same vector as every other joint, so
  // it eases on the same clock instead of needing its own smoothing.
  T[0] = pitch;
  T[2] = roll;
  return lift;
}

// Ease the live pose toward the target. One time constant for the whole
// vector: fast enough that a gait is not damped, slow enough that a mode
// change is a movement rather than a cut.
export function applyPose(P, st, dt) {
  const lift = poseTarget(st);
  const k = 1 - Math.exp(-dt / .09);
  const a = P.a;
  for (let i = 0; i < NB * 3; i++) a[i] += (T[i] - a[i]) * k;
  st.lift += (lift - st.lift) * k;
  P.y = .62 + st.lift;
  return st;
}

export function makeAnim() {
  return {
    t: 0, mode: IDLE, hold: 0, lift: 0, pitch: 0, roll: 0,
    gaze: 0, lookYaw: 0, lookPitch: 0,
  };
}
