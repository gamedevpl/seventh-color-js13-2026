// THE HERD. Everything that is true about the world lives here, and nothing
// in here draws or makes a sound: main.js reads `units` and `leaders` and
// drains `events`. Every unicorn is a `unit`; seven of them are also
// `leaders` (the player is leaders[0]) and the rest either follow a leader
// or graze as neutrals of their colour.
//
// The fight is horns first. Two herds that touch trade blows one unicorn
// at a time, and momentum decides each one: a unicorn running hard knocks
// one that is not. Holding the button is a CHARGE - the herd tightens into
// a wedge and gathers speed, slowly, and the longer it runs the more it
// crackles: arcs jump between the unicorns, the ground lights up under
// them, until the charge IGNITES and the whole band becomes a sliding
// rainbow the size of itself. Only the rainbow does real harm: everything
// it runs over is thrown, a leader it runs over loses a heart, and two
// rainbows that meet explode - the bigger herd wins.

import { COL } from './uni.js';

export const ARENA = 95;                  // half-size of the plain
export const EDGE = 14;                   // the warning band inside it
// How far outside the posts you may stray before the plain is done with
// you. There is a warning band, and then there is nothing.
const OUT = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > ARENA;
const nearEdge = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > ARENA - EDGE;
export { nearEdge };
// Warn before a fast herd reaches the narrow boundary band. Releasing the
// charge restores steering; a warning at the posts is already too late.
export const edgeDanger = (L) => nearEdge(L.x, L.z) || nearEdge(L.x + L.vx * 2, L.z + L.vz * 2);
export const PER = 10;                    // grazing unicorns per colour
export const WILD = 7;                    // the eighth colour: anyone's
export const units = [], leaders = [], events = [];
export const meadows = [];                // [x, z] home of each colour
let time = 0;
export const now = () => time;

export const rnd = (a = 1) => Math.random() * a;
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const lerp = (a, b, k) => a + (b - a) * k;

function unit(x, z, col) {
  return {
    x, z, vx: 0, vz: 0, y: 0, vy: 0, yaw: rnd(7), col, lead: -1,
    // st: 0 on the ground, 1 thrown through the air, 3 a statue - what is
    // left of a leader with no hearts.
    st: 0, ph: rnd(7), seed: rnd(7), daze: 0, hit: 0, sp: 0, wan: 0,
    // No two of them run the same. `gait` is how fast the legs swing for a
    // given speed, `pace` how hard it pushes to hold its slot, `size` its
    // build - a herd of identical animals at an identical tempo reads as a
    // texture, not as animals. `lunge` and `recoil` are the horn strike;
    // `spin`, `roll` and `up` are what a thrown unicorn does on the way
    // down and while it gets back on its feet.
    gait: .82 + rnd(.42), pace: .85 + rnd(.35), size: .94 + rnd(.14),
    lunge: 0, recoil: 0, spin: rnd(6), roll: 0, up: 0,
  };
}

export function newWorld(playerCol) {
  units.length = leaders.length = events.length = meadows.length = 0;
  time = 0;
  // Seven meadows on a ring. The player's is always due south of the
  // centre - the opening shot looks the same way every time, and the
  // colours simply rotate around it.
  for (let i = 0; i < 7; i++) {
    // The meadow ring. It used to sit at 66, twenty-nine units from an edge
  // that is now fatal - close enough that a first sweep of your own home
  // could walk you off the plain. Fifty-six leaves everyone a margin about
  // as deep as the warning band is wide, and hands the middle back to the
  // fight, which is where it belongs.
  const c = (playerCol + i) % 7, a = Math.PI / 2 + i * Math.PI * 2 / 7, R = 56;
    const mx = Math.cos(a) * R, mz = Math.sin(a) * R;
    meadows[c] = [mx, mz];
    const L = unit(mx, mz, c);
    L.yaw = a + Math.PI;                  // facing the centre
    L.lead = i; L.hearts = 3; L.chg = 0; L.charge = 0; L.cool = 0; L.stun = 0;
    // spd is the run speed the charge builds; wave is the rainbow, 0 or
    // its power; burn is how long it has left; cx/cz/r is the herd's
    // footprint, kept because the rainbow is the size of the band.
    L.spd = 11; L.wave = 0; L.burn = 0; L.n = 0; L.cx = mx; L.cz = mz; L.r = 2; L.threat = null; L.spent = 0; L.glance = 0;
    L.ai = i ? { t: rnd(.3), goal: null } : null; L.in = null;
    leaders.push(L); units.push(L);
    for (let k = 0; k < PER; k++) {
      const b = rnd(7), d = 3 + rnd(13);
      units.push(unit(mx + Math.cos(b) * d, mz + Math.sin(b) * d, c));
    }
  }
}

export const alive = () => leaders.filter((L) => L.st !== 3);
// Small herds keep their run-up. Above twenty, accumulated energy shortens
// ignition so a large band can light before contact on this finite plain.
// ...unless a rainbow is already coming at you: an ANSWER builds twice as
// fast. Without that the attacker always arrives before the defender has
// lit, and two rainbows never meet - the clash exists on paper only.
const chargeTime = (L) => (2.4 + .08 * L.n) / (1 + Math.max(0, L.n - 20) * .1) * (L.threat ? .5 : 1);
export const burnTime = (L) => 2.5 + .12 * L.n;
// Is a rainbow, or a charge about to be one, bearing down on L?
function threatened(L) {
  for (const R of leaders) {
    if (R === L || R.st === 3 || !(R.wave || R.charge > .4)) continue;
    const dx = L.x - R.x, dz = L.z - R.z, d = Math.hypot(dx, dz);
    if (d < 80 && (dx * Math.cos(R.yaw) + dz * Math.sin(R.yaw)) / (d || 1) > .75) return R;
  }
  return null;
}
export const footprint = (n) => 2.2 + 1.5 * Math.sqrt(n);

function scatter(u, fx, fz, s) {
  u.st = 1; u.lead = -1;
  const d = Math.hypot(fx, fz) || 1;
  u.vx = fx / d * s + rnd(4) - 2; u.vz = fz / d * s + rnd(4) - 2;
  u.vy = 6 + rnd(5); u.y = Math.max(u.y, .1);
}

// Off the plain: the leader is finished, whatever it had left. The rule
// is the same for the player and for the brains, and the brains are told
// about it in `think` - an edge that only kills the player is a trap.
function fell(L) {
  L.hearts = 0; L.chg = 0; L.charge = 0; L.wave = 0; L.spd = 0; L.st = 3; L.gone = 0;
  for (const u of units) if (u !== L) { if (u.col === L.col) u.col = WILD; if (u.lead === L.lead) u.lead = -1; }
  events.push({ k: 'fell', L });
  events.push({ k: 'dead', L });
}

function hurt(L, fx, fz) {
  L.hearts--; L.stun = 2.4; L.chg = 0; L.charge = 0; L.wave = 0; L.spd = 0;
  events.push({ k: 'hurt', L });
  if (L.hearts <= 0) {
    // A leader with no hearts turns to stone where it stands, and its
    // colour is nobody's: every unicorn that wore it goes wild.
    L.st = 3; L.gone = 0;
    for (const u of units) if (u !== L) { if (u.col === L.col) u.col = WILD; if (u.lead === L.lead) u.lead = -1; }
    events.push({ k: 'dead', L });
  } else {
    // Knocked flat rather than thrown - a leader is never lost, only stunned.
    L.st = 1; L.vx = fx * .6; L.vz = fz * .6; L.vy = 7; L.y = .1;
  }
}

// Every follower is flung, and the leader pays a heart. `s` is how far.
function breakHerd(L, cx, cz, s) {
  for (const u of units) if (u !== L && u.lead === L.lead && u.st !== 3) {
    scatter(u, u.x - cx + rnd(2) - 1, u.z - cz + rnd(2) - 1, s + rnd(4));
  }
  hurt(L, (L.x - cx) * 3, (L.z - cz) * 3);
}

// Back on your feet. Online the plain never ends and nobody sits out a
// round: five seconds after a leader turns to stone it rises at its own
// meadow, and its colour is called home out of the wild ones nobody is
// holding. Losing the herd is the whole punishment; losing the session
// would just empty the room.
export function revive(L) {
  const [mx, mz] = meadows[L.col];
  L.st = 0; L.hearts = 3; L.chg = 0; L.charge = 0; L.wave = 0; L.burn = 0;
  L.spd = 11; L.cool = 0; L.stun = 0; L.spent = 0; L.daze = 0; L.gone = 0; L.glance = 0;
  L.x = mx; L.z = mz; L.y = 0; L.heat = 0; L.vx = L.vz = L.vy = 0;
  L.yaw = Math.atan2(-mz, -mx);
  let n = PER;
  for (const u of units) {
    if (n <= 0) break;
    if (u === L || u.hearts || u.col !== WILD || u.st !== 0 || u.lead >= 0) continue;
    u.col = L.col; u.daze = 0;
    const a = rnd(7), d = 3 + rnd(13);
    u.x = mx + Math.cos(a) * d; u.z = mz + Math.sin(a) * d;
    n--;
  }
  events.push({ k: 'rise', L });
}

// Release or brake cancels the run-up. Once lit, the rainbow commits
// until burnout, a frontal clash or elimination; steering remains available.
export function charge(L, on) {
  if (L.st !== 0 || L.stun > 0) { L.chg = 0; return; }
  if (on && !L.chg && L.cool <= 0) events.push({ k: 'chg', L });
  L.chg = (on || L.wave) && L.cool <= 0 ? 1 : 0;
}

// Two rainbows meet. The bigger herd wins outright: the loser's whole herd
// is thrown across the plain and its leader pays a heart. The winner keeps
// its herd but the rainbow goes out - a clash costs the momentum too.
function clash(A, B) {
  const cx = (A.cx + B.cx) / 2, cz = (A.cz + B.cz) / 2;
  // Contact normal, not just heading difference: an offset scrape is not
  // a frontal impact. Only approaching bodies exchange momentum.
  const dx = B.cx - A.cx, dz = B.cz - A.cz, d = Math.hypot(dx, dz) || 1;
  const nx = dx / d, nz = dz / d;
  const closing = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
  if (closing <= 0) return;
  if (Math.cos(A.yaw) * nx + Math.sin(A.yaw) * nz < .65 ||
      Math.cos(B.yaw) * nx + Math.sin(B.yaw) * nz > -.65) {
    const ma = 1 / (A.n + 1), mb = 1 / (B.n + 1), impulse = closing * 1.5 / (ma + mb);
    for (const [L, sign] of [[A, -ma], [B, mb]]) {
      L.vx += sign * impulse * nx;
      L.vz += sign * impulse * nz;
      L.yaw = Math.atan2(L.vz, L.vx);
      L.spd = Math.hypot(L.vx, L.vz);
      L.glance = .6;
    }
    events.push({ k: 'graze', x: cx, z: cz });
    return;
  }
  const mega = A.n >= 30 && B.n >= 30;
  const power = L => (L.n + 1) * (mega ? Math.max(11, L.spd) : 1);
  const tied = Math.abs(power(A) - power(B)) < .01;
  const [W, Lo] = power(A) >= power(B) ? [A, B] : [B, A];
  if (mega) { Lo.hearts = 1; if (tied) W.hearts = 1; }
  events.push({ k: 'boom', x: cx, z: cz, pw: A.wave + B.wave });
  breakHerd(Lo, cx, cz, 16);
  if (tied) { breakHerd(W, cx, cz, 16); return; }
  W.wave = 0; W.charge = 0; W.chg = 0; W.cool = 3; W.burn = 0;
}

// --- the rival brains -----------------------------------------------------
// Four moods. GATHER walks to the nearest unicorn it may take. HUNT closes
// on a weaker herd - horns first, and a long straight run at it is worth a
// charge. FLEE runs from a stronger one. ANSWER is the reply to a rainbow
// coming this way: charge to meet it if we would win, otherwise sidestep.
// Everyone gets bolder as the match wears on, so a match cannot stall into
// seven grazing herds.
function think(L, dt) {
  const ai = L.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = .25;
  let target = L.threat;
  let want, run = false;
  // Gather first, then challenge nearby armies. As the round ages even
  // a smaller band takes the fight. Nearby collectable kin/wilds take priority
  // until 35 followers, except while burning or answering an incoming attack.
  if (!target && !(L.n < 35 && !L.wave && units.some(u => u.lead < 0 && u.st === 0 && !u.daze && (u.col === L.col || u.col === WILD) && Math.hypot(u.x - L.x, u.z - L.z) < 28)) && time > 15 && (L.n >= 3 || time > 90)) {
    let best = 100;
    for (const R of alive()) {
      const d = Math.hypot(R.x - L.x, R.z - L.z) * (R.ai ? 1 : .6);
      if (R !== L && d < best && R.n + 1 < (L.n + 1) * (1 + Math.min(1, time / 90))) { target = R; best = d; }
    }
  }
  if (target) {
    const d = Math.hypot(target.x - L.x, target.z - L.z);
    const lead = Math.min(.8, d / 45);
    want = [target.x + target.vx * lead, target.z + target.vz * lead];
    const err = Math.abs(wrapA(Math.atan2(want[1] - L.z, want[0] - L.x) - L.yaw));
    // Start the close-range answer before mutual pursuit settles into an orbit.
    run = d < 30 || d < 70 && (L.charge ? err < 1.5 : err < .35);
    // A hopelessly outnumbered herd dodges an incoming rainbow.
    if (target === L.threat && target.n > (L.n + 1) * 2 && d > 30) {
      want = [L.x - (L.z - target.z) * 2, L.z + (L.x - target.x) * 2]; run = false;
    }
  } else {
    let best = 1e9;
    want = [meadows[L.col][0] * .5, meadows[L.col][1] * .5];
    for (const u of units) {
      if (u.lead >= 0 || u.st !== 0 || u.col !== L.col && u.col !== WILD) continue;
      const d = Math.hypot(u.x - L.x, u.z - L.z) - (u.col === WILD ? 6 : 0);
      if (d < best) { best = d; want = [u.x, u.z]; }
    }
  }
  // A size-scaled but bounded lookahead leaves big armies room to ignite.
  const look = L.wave ? 45 + Math.sqrt(L.n) * 6 : 14 + L.spd * 1.4;
  const edge = nearEdge(L.x + Math.cos(L.yaw) * look, L.z + Math.sin(L.yaw) * look) || nearEdge(L.x, L.z);
  ai.goal = edge ? [0, 0] : want;
  ai.sprint = !!target;
  charge(L, !edge && (run || L.wave > 0));
}

// --- the step -------------------------------------------------------------
// `input` is the player's: turn (-1..1), fwd (0/1 sprint), back (0/1).
// Put something back just inside the line, at a stop.
function clamp(u) {
  u.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, u.x));
  u.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, u.z));
  u.vx = u.vz = 0; u.spd = 0;
}

export function recount() {
  for (const L of leaders) { L.n = 0; L.cx = L.x; L.cz = L.z; }
  for (const u of units) if (u.lead >= 0 && u !== leaders[u.lead] && u.st !== 3) {
    const L = leaders[u.lead];
    L.n++; L.cx += u.x; L.cz += u.z;
  }
  for (const L of leaders) { L.cx /= L.n + 1; L.cz /= L.n + 1; L.r = footprint(L.n); }
}

export function step(dt, input) {
  const over = input.over;
  time += dt;
  recount();

  // Leaders steer; everyone else reacts.
  for (const L of leaders) {
    if (L.st === 3) {
      if (input.arena && (L.gone = (L.gone || 0) + dt) > 5) revive(L);
      continue;
    }
    L.cool = Math.max(0, L.cool - dt);
    L.glance = Math.max(0, L.glance - dt);
    L.threat = threatened(L);
    if (L.ai) think(L, dt);
    if (L.st !== 0) { L.spd = 0; continue; }
    L.stun = Math.max(0, L.stun - dt);
    let turn = 0, want = 11;
    if (L.ai) {
      const g = L.ai.goal;
      if (g) turn = Math.max(-1, Math.min(1, wrapA(Math.atan2(g[1] - L.z, g[0] - L.x) - L.yaw) * 3));
      // A rival hunting, fleeing or dodging sprints, as the player can.
      if (L.ai.sprint) want = 15;
    } else if (L.in) { turn = L.in.t; want = L.in.b ? 0 : L.in.f ? 15 : 11; }
    if (L.in && L.in.b) charge(L, 0);
    const unstable = !over && L.n >= 35 && !edgeDanger(L) && !(L.in && L.in.b);
    L.heat = unstable && !L.cool ? Math.min(1, (L.heat || 0) + dt / 6) : 0;
    if (L.heat >= 1) charge(L, 1);
    if (L.stun > 0) { want = 0; turn = 0; }
    if (L.chg && L.stun <= 0) {
      // The charge builds, and the speed with it - slowly, so the run-up
      // is a thing you can see coming and a thing you can misjudge.
      if (!L.wave) L.charge = Math.min(1, L.charge + dt / chargeTime(L));
      want = 11 + 26 * L.charge;
      if (L.charge >= 1 && !L.wave) {
        // IGNITION. The band is the rainbow now, for as long as the herd
        // can hold it - bigger herds burn longer.
        L.wave = 1 + L.n; L.burn = burnTime(L); L.spent = 0;
        events.push({ k: 'ignite', L });
      }
    } else {
      L.charge = Math.max(0, L.charge - dt * 1.5);
    }
    if (L.wave) {
      L.wave = L.n + 1;
      L.burn -= dt;
      // The rainbow BURNS THE HERD. About a third of it over a full burn,
      // so a rainbow thrown at nothing is paid for: the spent ones drop
      // out dazed, still your colour, and can be gathered again - by you,
      // or by whoever gets there first.
      L.spent += dt * (L.n + 1) / (burnTime(L) * 3);
      while (L.spent >= 1) {
        L.spent -= 1;
        const q = units.find((u) => u.lead === L.lead && u !== L && u.st === 0);
        if (!q) break;
        q.lead = -1; q.daze = 4; q.st = 1; q.vy = 5; q.y = .1;
        q.vx = -Math.cos(L.yaw) * 6 + rnd(4) - 2; q.vz = -Math.sin(L.yaw) * 6 + rnd(4) - 2;
        events.push({ k: 'spend', u: q });
      }
      if (L.burn <= 0) { L.wave = 0; L.chg = 0; L.charge = 0; L.cool = 3; events.push({ k: 'fizzle', L }); }
    }
    // Heavy at speed: a charging herd turns like a herd, not a bicycle -
    // and a LIT herd is heavier again the bigger it is, so the biggest
    // rainbow on the plain is also the one that cannot correct its aim.
    L.yaw += turn * dt * 2.6 * (1 - .4 * L.charge) / (L.wave ? 1 + Math.sqrt(L.n) * .12 : 1);
    L.spd = lerp(L.spd, want, dt * (want > L.spd ? 1.7 : 4));
    const tx = Math.cos(L.yaw) * L.spd, tz = Math.sin(L.yaw) * L.spd;
    L.vx = lerp(L.vx, tx, dt * 6); L.vz = lerp(L.vz, tz, dt * 6);
  }

  for (const u of units) {
    u.daze = Math.max(0, u.daze - dt); u.hit = Math.max(0, u.hit - dt);
    if (u.st === 1) {
      // Thrown: it tumbles about its own axis, lands, bounces once, skids
      // to a stop and then spends `up` seconds getting back on its feet.
      u.x += u.vx * dt; u.z += u.vz * dt; u.y += u.vy * dt; u.vy -= 22 * dt;
      u.roll += dt * (4 + u.spin);
      if (u.y <= 0) {
        u.y = 0;
        if (u.vy < -6) { u.vy *= -.35; u.vx *= .5; u.vz *= .5; }
        else { u.st = 0; u.vx = u.vz = 0; u.up = .55; u.roll = 0; u.daze = Math.max(u.daze, u.hearts ? 0 : 1.2); }
      }
      continue;
    }
    u.up = Math.max(0, u.up - dt);
    u.lunge = Math.max(0, u.lunge - dt * 4);
    u.recoil = Math.max(0, u.recoil - dt * 3);
    if (u.st !== 0 || u.hearts) continue;
    const L = u.lead >= 0 ? leaders[u.lead] : null;
    let tx = 0, tz = 0;
    if (L) {
      // A slot in the herd's wake, in the leader's own frame. Math.sqrt(n) wide
      // so a big herd is a broad wedge, not a queue - and a charging herd
      // pulls that wedge tight, shoulder to shoulder.
      const n = Math.sqrt(L.n + 1), tight = 1 - .45 * L.charge;
      const drift = Math.sin(time * .7 + u.seed * 5) * .5 + Math.sin(time * .43 + u.seed) * .3;
      // Slots all round the leader, not a wake behind it: a herd runs
      // AROUND the one it follows. Each unicorn's seed puts it at a fixed
      // angle and radius, so the ring is a ring and not a queue.
      const ang = u.seed * 2.3, rad = (1.6 + (Math.cos(u.seed * 5) * .5 + .5) * n * 1.5) * tight;
      const w = Math.sin(ang) * rad + drift, back = Math.cos(ang) * rad + drift * .5;
      const c = Math.cos(L.yaw), s = Math.sin(L.yaw);
      const gx = L.x - c * back - s * w, gz = L.z - s * back + c * w;
      const dx = gx - u.x, dz = gz - u.z, d = Math.hypot(dx, dz) || 1;
      // Its own pace, and a slot that drifts: a herd running in lockstep
      // reads as a texture rather than as animals.
      const spd = Math.min((L.spd + 7) * u.pace, d * 2.2 * u.pace);
      tx = dx / d * spd; tz = dz / d * spd;
    } else {
      // Grazing: drift, keep near home, and shy away from any leader that
      // is not your colour.
      u.wan += (rnd(2) - 1) * dt * 3;
      const [mx, mz] = u.col === WILD ? [u.x, u.z] : meadows[u.col];
      const hx = mx - u.x, hz = mz - u.z, hd = Math.hypot(hx, hz);
      tx = Math.cos(u.yaw + u.wan) * 2; tz = Math.sin(u.yaw + u.wan) * 2;
      if (hd > 18) { tx += hx / hd * 4; tz += hz / hd * 4; }
      for (const L2 of leaders) {
        if (L2.st === 3 || L2.col === u.col || u.col === WILD) continue;
        const fx = u.x - L2.x, fz = u.z - L2.z, fd = Math.hypot(fx, fz) || 1;
        if (fd < 8) { tx += fx / fd * 8; tz += fz / fd * 8; }
      }
      // Joining: your colour's leader, or one of its followers, walking past.
      if (u.daze <= 0) for (const o of units) {
        if (o === u || o.lead < 0 || o.st !== 0) continue;
        const Lo = leaders[o.lead];
        if (Lo.st !== 0 || (u.col !== Lo.col && u.col !== WILD)) continue;
        const near = o.hearts ? 5 : 2.6;
        if (Math.abs(o.x - u.x) < near && Math.abs(o.z - u.z) < near) { u.lead = o.lead; events.push({ k: 'join', u, L: Lo }); break; }
      }
    }
    u.vx = lerp(u.vx, tx, dt * 3.5); u.vz = lerp(u.vz, tz, dt * 3.5);
  }

  // Separation, and the horn fight. One pass over the pairs does both.
  // Momentum decides a blow: a unicorn's own speed, and its herd's charge
  // - so a charging wedge ploughs through a grazing line, and two herds
  // ambling into each other trade unicorns evenly until one runs.
  const mom = (u) => .6 + u.sp / 12 + (u.lead >= 0 ? leaders[u.lead].charge * 2 : 0);
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.st !== 0) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (b.st !== 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.abs(dx) > 1.3 || Math.abs(dz) > 1.3) continue;
      const d = Math.hypot(dx, dz) || .01, push = (1.3 - d) / d * 14 * dt;
      a.vx -= dx * push; a.vz -= dz * push; b.vx += dx * push; b.vz += dz * push;
      if (a.lead < 0 || b.lead < 0 || a.lead === b.lead || a.hit || b.hit) continue;
      const ma = mom(a), mb = mom(b);
      const [win, lose] = ma === mb ? (rnd() < .5 ? [a, b] : [b, a]) : ma > mb ? [a, b] : [b, a];
      a.hit = b.hit = .4;
      // Two lit herds do not trade horns; their rainbows settle it below.
      const A = leaders[a.lead], B = leaders[b.lead];
      if (A.wave && B.wave) continue;
      if (lose.hearts) {
        // A leader takes a horn: knocked back, and if the horn came in on
        // a real charge - or the leader has no herd left to stand behind -
        // that is a heart. A lone leader is prey; it must run and gather,
        // and a hunter on top of it does not need a run-up to finish it.
        const W = leaders[win.lead];
        win.lunge = 1; lose.recoil = 1;
        events.push({ k: 'horn', x: a.x, z: a.z });
        if ((W.charge > .5 || lose.n === 0) && lose.stun <= 0) hurt(lose, lose.x - win.x, lose.z - win.z);
        else { lose.vx += (lose.x - win.x) * 6; lose.vz += (lose.z - win.z) * 6; }
        continue;
      }
      win.lunge = 1; lose.recoil = 1;
      // The first horn staggers; the second, while still reeling, throws.
      if (lose.daze <= 0) { lose.daze = .9; lose.vx += (lose.x - win.x) * 5; lose.vz += (lose.z - win.z) * 5; continue; }
      scatter(lose, lose.x - win.x, lose.z - win.z, 7 + mom(win) * 2);
      events.push({ k: 'knock', x: lose.x, z: lose.z, col: lose.col });
    }
  }

  for (const u of units) {
    if (u.st !== 0) continue;
    u.x += u.vx * dt; u.z += u.vz * dt;
    // The plain has an edge, and it is not soft any more. A leader that
    // crosses it is finished; anything else that crosses is simply gone
    // from the plain, and goes back to grazing just inside it.
    if (OUT(u.x, u.z)) {
      // Once the run is over the plain stops taking leaders. The closing
      // shot keeps running, and a herd still carrying speed - a lit one
      // especially - will cross the line while nobody is steering; that
      // used to turn a win into a loss on the end screen.
      if (u.hearts) { if (u.st === 0 && !over) fell(u); else clamp(u); }
      else {
        u.lead = -1; u.daze = 2; u.col = WILD;
        clamp(u);
        events.push({ k: 'lost', u });
      }
    }
    const sp = Math.hypot(u.vx, u.vz);
    u.sp = lerp(u.sp, sp, dt * 6);
    u.ph += sp * dt * 1.7 * u.gait;
    if (sp > .5 && !u.hearts) u.yaw = lerp(u.yaw, u.yaw + wrapA(Math.atan2(u.vz, u.vx) - u.yaw), dt * 8);
  }

  // The rainbows. Everything under one is thrown; two that meet explode.
  for (const L of leaders) {
    if (!L.wave || L.st !== 0) continue;
    for (const R of leaders) {
      if (R !== L && R.wave && R.st === 0 && !L.glance && !R.glance && Math.hypot(R.cx - L.cx, R.cz - L.cz) < R.r + L.r) { clash(L, R); break; }
    }
    if (!L.wave) continue;
    for (const u of units) {
      if (u.st !== 0 || u.lead === L.lead || Math.hypot(u.x - L.cx, u.z - L.cz) > L.r) continue;
      // Lit opponents are resolved only by clash(), including their followers.
      if (u.lead >= 0 && leaders[u.lead].wave) continue;
      const kin = u.col === L.col || u.col === WILD;
      if (u.lead < 0 && kin) {
        // Swept up: our colour, or a wild one, caught in the light.
        u.lead = L.lead; events.push({ k: 'join', u, L });
        continue;
      }
      if (u.hearts) { if (u.stun > 0) continue; hurt(u, (u.x - L.cx) * 3, (u.z - L.cz) * 3); }
      else scatter(u, u.x - L.cx, u.z - L.cz, 12 + L.n * .3);
      events.push({ k: 'blast', x: u.x, z: u.z, col: u.col, L });
    }
  }
}

export const won = (i) => leaders[i].st !== 3 && alive().length === 1;
export const lost = (i) => leaders[i].st === 3;
