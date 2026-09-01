// THE HERD. Everything that is true about the world lives here, and nothing
// in here draws or makes a sound: main.js reads `units`, `leaders`, `balls`
// and drains `events`. Every unicorn is a `unit`; seven of them are also
// `leaders` (the player is leaders[0]) and the rest either follow a leader
// or graze as neutrals of their colour. A leader may CHARGE: the herd
// spirals in and melts into a rainbow fireball that carries the whole herd
// across the plain, absorbs its own colour, blasts everyone else apart, and
// meets another fireball as a clash the bigger one wins.

import { COL } from './uni.js';

export const ARENA = 105;                 // half-size of the plain
export const PER = 10;                    // grazing unicorns per colour
export const WILD = 7;                    // the eighth colour: anyone's
export const units = [], leaders = [], balls = [], events = [];
export const meadows = [];                // [x, z] home of each colour
let time = 0;
export const now = () => time;

const rnd = (a = 1) => Math.random() * a;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, k) => a + (b - a) * k;

function unit(x, z, col) {
  return {
    x, z, vx: 0, vz: 0, y: 0, vy: 0, yaw: rnd(7), col, lead: -1,
    // st: 0 on the ground, 1 thrown through the air, 2 inside a fireball,
    // 3 a statue - what is left of a leader with no hearts.
    st: 0, ph: rnd(7), seed: rnd(7), daze: 0, hit: 0, morph: 0, sp: 0, wan: 0,
  };
}

// Player colour is chosen on the title; the six rivals take the rest.
export function newWorld(playerCol) {
  units.length = leaders.length = balls.length = events.length = meadows.length = 0;
  time = 0;
  // Seven meadows on a ring. The player's is always due south of the
  // centre - the opening shot looks the same way every time, and the
  // colours simply rotate around it.
  for (let i = 0; i < 7; i++) {
    const c = (playerCol + i) % 7, a = Math.PI / 2 + i * Math.PI * 2 / 7, R = 66;
    const mx = Math.cos(a) * R, mz = Math.sin(a) * R;
    meadows[c] = [mx, mz];
    const L = unit(mx, mz, c);
    L.yaw = a + Math.PI;                  // facing the centre
    L.lead = i; L.hearts = 3; L.chg = 0; L.charge = 0; L.cool = 0; L.stun = 0;
    L.ball = null; L.n = 0; L.ai = i ? { t: rnd(.3), goal: null, mode: 0 } : null;
    leaders.push(L); units.push(L);
    for (let k = 0; k < PER; k++) {
      const b = rnd(7), d = 3 + rnd(13);
      units.push(unit(mx + Math.cos(b) * d, mz + Math.sin(b) * d, c));
    }
  }
}

export const herdOf = (L) => units.filter((u) => u !== L && u.lead === L.lead && u.st !== 3);
export const alive = () => leaders.filter((L) => L.st !== 3);

// How long a charge takes: a bigger herd takes longer to fold in, which is
// the window a rival gets to answer.
const chargeTime = (L) => 1.2 + .09 * L.n;

function scatter(u, fx, fz, s) {
  u.st = 1; u.lead = -1; u.morph = 0;
  const d = Math.hypot(fx, fz) || 1;
  u.vx = fx / d * s + rnd(4) - 2; u.vz = fz / d * s + rnd(4) - 2;
  u.vy = 6 + rnd(5); u.y = Math.max(u.y, .1);
}

function hurt(L, fx, fz) {
  L.hearts--; L.stun = 2.6; L.chg = 0; L.charge = 0;
  events.push({ k: 'hurt', L });
  if (L.hearts <= 0) {
    // A leader with no hearts turns to stone where it stands, and its
    // colour is nobody's: every unicorn that wore it goes wild.
    L.st = 3; L.ball = null;
    for (const u of units) if (u !== L && u.col === L.col) { u.col = WILD; if (u.lead === L.lead) u.lead = -1; }
    events.push({ k: 'dead', L });
  } else {
    // Knocked flat rather than thrown - a leader is never lost, only stunned.
    L.st = 1; L.vx = fx * .6; L.vz = fz * .6; L.vy = 7; L.y = .1;
  }
}

// Every follower is flung, and if it had a leader in there the leader pays
// a heart. `s` is how far: a clash throws further than a blast.
function breakHerd(L, cx, cz, s) {
  for (const u of units) if (u !== L && u.lead === L.lead && u.st !== 3) {
    scatter(u, u.x - cx + rnd(2) - 1, u.z - cz + rnd(2) - 1, s + rnd(4));
  }
  L.ball = null;
  hurt(L, (L.x - cx) * 3, (L.z - cz) * 3);
}

// The charge: hold to fold the herd in, release to fire. Releasing before a
// quarter charge is a feint - the herd simply unfolds again.
export function charge(L, on) {
  if (L.st !== 0 || L.stun > 0 || L.ball) return;
  if (on) {
    if (!L.chg && L.cool <= 0) { L.chg = 1; L.charge = 0; events.push({ k: 'chg', L }); }
  } else if (L.chg) {
    L.chg = 0;
    if (L.charge < .25) { L.charge = 0; return; }
    fire(L);
  }
}

function fire(L) {
  const herd = herdOf(L), pw = 1 + herd.length * L.charge;
  const b = {
    x: L.x, z: L.z, vx: Math.cos(L.yaw) * 26, vz: Math.sin(L.yaw) * 26,
    pw, own: L.lead, life: 1.5 + pw * .11, age: 0, r: 0,
  };
  b.r0 = radius(pw);
  for (const u of herd) { u.st = 2; u.morph = 1; }
  L.st = 2; L.ball = b; L.charge = 0; L.cool = 3;
  balls.push(b);
  events.push({ k: 'fire', L, b });
}

export const radius = (pw) => 1.4 + .55 * Math.sqrt(pw);

// The fireball opens back up into a herd where it stopped. Followers land in
// a ring, still following - the fireball is a way to travel as much as a
// way to fight.
function unfold(b, keep) {
  const L = leaders[b.own];
  balls.splice(balls.indexOf(b), 1);
  if (L.st !== 2) return;                 // already dealt with by a clash
  L.st = 0; L.ball = null; L.x = b.x; L.z = b.z; L.y = 0; L.morph = 1;
  let k = 0;
  for (const u of units) if (u !== L && u.lead === L.lead && u.st === 2) {
    const a = u.seed + k * 2.4, d = 1.5 + Math.sqrt(k) * 1.1;
    u.x = b.x + Math.cos(a) * d; u.z = b.z + Math.sin(a) * d; u.y = 0;
    if (keep !== undefined && k >= keep) scatter(u, u.x - b.x, u.z - b.z, 12);
    else { u.st = 0; u.vx = u.vz = 0; }
    k++;
  }
  events.push({ k: 'land', L, b });
}

// Two fireballs meet. The bigger one wins outright: the loser's whole herd
// is thrown across the plain and its leader pays a heart; the winner keeps
// only what it had over the loser, and the rest is thrown too. The margin
// is the price of the fight.
function clash(a, b) {
  const A = leaders[a.own], B = leaders[b.own];
  const [w, l, W, Lo] = a.pw >= b.pw ? [a, b, A, B] : [b, a, B, A];
  const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  events.push({ k: 'boom', x: cx, z: cz, pw: w.pw + l.pw });
  w.x = l.x = cx; w.z = l.z = cz;
  // The loser first: unfold puts its unicorns on the ground so breakHerd
  // can throw them from the clash point.
  unfold(l); breakHerd(Lo, cx, cz, 16);
  if (w.pw === l.pw) { unfold(w); breakHerd(W, cx, cz, 16); return; }
  unfold(w, Math.max(0, Math.round(w.pw - l.pw - 1)));
}

// --- the rival brains -----------------------------------------------------
// Four moods. GATHER walks to the nearest unicorn it may take. HUNT closes
// on a weaker herd and fires when lined up. FLEE runs from a stronger one.
// ANSWER is the counter to an incoming fireball: fold in and meet it if
// we would win, otherwise sidestep. Everyone gets bolder as the match wears
// on, so a match cannot stall into seven grazing herds.
function think(L, dt) {
  const ai = L.ai;
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = .25;
  // Boldness: at the start a rival only picks on a herd two thirds its
  // size; after a minute and a half it will take on anyone its own size,
  // because seven herds of ten grazing forever is not a match.
  const bold = Math.min(1, time / 90);
  let want = null, fold = false;
  // A fireball coming our way?
  for (const b of balls) {
    if (b.own === L.lead) continue;
    const dx = L.x - b.x, dz = L.z - b.z, d = Math.hypot(dx, dz);
    const along = (dx * b.vx + dz * b.vz) / (26 * d);
    if (d < 40 && along > .8) {
      if (L.n + 1 > b.pw * 1.15 && L.n >= 2) { fold = true; want = [b.x, b.z]; }
      else want = [L.x - dz * 2, L.z + dx * 2];            // step aside
    }
  }
  if (!want) {
    let hunt = null, hd = 1e9, run = null, rd = 1e9;
    for (const R of leaders) {
      if (R === L || R.st === 3) continue;
      const d = Math.hypot(R.x - L.x, R.z - L.z);
      if (time > 15 && R.n + 1 <= (L.n + 1) * (.65 + .4 * bold) && d < 30 + 60 * bold && d < hd && L.n >= 3) { hunt = R; hd = d; }
      if (R.n > (L.n + 1) * 1.5 && d < 22 && d < rd) { run = R; rd = d; }
    }
    if (run && !hunt) want = [L.x + (L.x - run.x), L.z + (L.z - run.z)];
    else if (hunt) {
      // Lead the shot a little, and fire once we are lined up and close.
      want = [hunt.x + hunt.vx * .6, hunt.z + hunt.vz * .6];
      const err = Math.abs(wrapA(Math.atan2(want[1] - L.z, want[0] - L.x) - L.yaw));
      if (hd < 30 * bold && err < .2 && L.cool <= 0) fold = true;
    } else {
      let best = null, bd = 1e9;
      for (const u of units) {
        if (u.lead >= 0 || u.st !== 0 || (u.col !== L.col && u.col !== WILD)) continue;
        // Prefer a cluster: a unicorn with neighbours is worth walking to.
        const d = Math.hypot(u.x - L.x, u.z - L.z) - (u.col === WILD ? 6 : 0);
        if (d < bd) { bd = d; best = u; }
      }
      want = best ? [best.x, best.z] : [meadows[L.col][0] * .5, meadows[L.col][1] * .5];
    }
  }
  ai.goal = want;
  // A charge that has begun is held to completion unless the reason went
  // away; a brain that toggles the button every tick would never fire.
  if (fold && !L.chg) charge(L, 1);
  if (L.chg && (L.charge >= 1 || (!fold && L.charge > .5))) charge(L, 0);
}

// --- the step -------------------------------------------------------------
// `input` is the player's: turn (-1..1), fwd (0/1 sprint), back (0/1).
export function step(dt, input) {
  time += dt;
  for (const L of leaders) L.n = 0;
  for (const u of units) if (u.lead >= 0 && u !== leaders[u.lead] && u.st !== 3) leaders[u.lead].n++;

  // Leaders steer; everyone else reacts.
  for (const L of leaders) {
    if (L.st === 3) continue;
    L.cool = Math.max(0, L.cool - dt);
    if (L.ai) think(L, dt);
    if (L.st !== 0) continue;
    L.stun = Math.max(0, L.stun - dt);
    let turn = 0, spd = 11;
    if (L.ai) {
      const g = L.ai.goal;
      if (g) turn = Math.max(-1, Math.min(1, wrapA(Math.atan2(g[1] - L.z, g[0] - L.x) - L.yaw) * 3));
    } else { turn = input.turn; spd = input.fwd ? 15 : input.back ? 5 : 11; }
    if (L.stun > 0) { spd = 0; turn = 0; }
    if (L.chg) {
      spd *= .3;
      L.charge = Math.min(1, L.charge + dt / chargeTime(L));
    }
    L.yaw += turn * dt * 2.6;
    const tx = Math.cos(L.yaw) * spd, tz = Math.sin(L.yaw) * spd;
    L.vx = lerp(L.vx, tx, dt * 6); L.vz = lerp(L.vz, tz, dt * 6);
    // Morph is the herd's, but the leader carries it for drawing: it sinks
    // into the ball last.
    L.morph = L.chg ? L.charge : Math.max(0, L.morph - dt * 2.5);
  }

  for (const u of units) {
    u.daze = Math.max(0, u.daze - dt); u.hit = Math.max(0, u.hit - dt);
    if (u.st === 1) {
      u.x += u.vx * dt; u.z += u.vz * dt; u.y += u.vy * dt; u.vy -= 22 * dt;
      u.yaw += dt * 9;
      if (u.y <= 0) { u.y = 0; u.st = 0; u.vx = u.vz = 0; u.daze = u.hearts ? 0 : 1.2; }
      continue;
    }
    if (u.st !== 0 || u.hearts) continue;
    const L = u.lead >= 0 ? leaders[u.lead] : null;
    let tx = 0, tz = 0, spd = 2;
    if (L) {
      // A slot in the herd's wake, in the leader's own frame. sqrt(n) wide
      // so a big herd is a broad wedge, not a queue.
      const n = Math.sqrt(L.n + 1), w = Math.sin(u.seed * 3) * n * 1.4, back = 1.6 + (Math.cos(u.seed * 5) * .5 + .5) * n * 1.6;
      const c = Math.cos(L.yaw), s = Math.sin(L.yaw);
      let gx = L.x - c * back - s * w, gz = L.z - s * back + c * w;
      // Charging: the slot is on the sphere, and pulled in hard.
      if (L.chg) { const r = radius(L.n) * .7; gx = L.x + Math.cos(u.seed * 7) * r; gz = L.z + Math.sin(u.seed * 7) * r; }
      const dx = gx - u.x, dz = gz - u.z, d = Math.hypot(dx, dz) || 1;
      spd = Math.min(L.chg ? 30 : 19, d * 3.2);
      tx = dx / d * spd; tz = dz / d * spd;
      u.morph = L.chg ? L.charge : Math.max(0, u.morph - dt * 2.5);
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
        const fx = u.x - L2.x, fz = u.z - L2.z, fd = Math.hypot(fx, fz);
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
    u.vx = lerp(u.vx, tx, dt * 5); u.vz = lerp(u.vz, tz, dt * 5);
  }

  // Separation, and the horn fight. One pass over the pairs does both.
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
      // Two herds touching: the smaller one loses the unicorn in the
      // contact. Leaders only bounce - a heart is only ever lost to a fireball.
      if (a.lead < 0 || b.lead < 0 || a.lead === b.lead || a.hit || b.hit) continue;
      const A = leaders[a.lead], B = leaders[b.lead];
      const [big, small, su] = A.n === B.n ? (rnd() < .5 ? [A, B, b] : [B, A, a]) : A.n > B.n ? [A, B, b] : [B, A, a];
      a.hit = b.hit = .4;
      if (su.hearts) { events.push({ k: 'horn', x: a.x, z: a.z }); continue; }
      scatter(su, su.x - big.x, su.z - big.z, 7);
      events.push({ k: 'knock', x: su.x, z: su.z, col: su.col });
    }
  }

  for (const u of units) {
    if (u.st !== 0) continue;
    u.x += u.vx * dt; u.z += u.vz * dt;
    // The plain has an edge, and it is soft.
    if (Math.abs(u.x) > ARENA) u.vx -= u.x * dt * .5;
    if (Math.abs(u.z) > ARENA) u.vz -= u.z * dt * .5;
    const sp = Math.hypot(u.vx, u.vz);
    u.sp = lerp(u.sp, sp, dt * 6);
    u.ph += sp * dt * 1.7;
    if (sp > .5 && !u.hearts) u.yaw = lerp(u.yaw, u.yaw + wrapA(Math.atan2(u.vz, u.vx) - u.yaw), dt * 8);
  }

  // The fireballs.
  for (const b of [...balls]) {
    if (!balls.includes(b)) continue;
    b.age += dt; b.life -= dt;
    b.r = radius(b.pw);
    b.x += b.vx * dt; b.z += b.vz * dt;
    const L = leaders[b.own];
    L.x = b.x; L.z = b.z;
    for (const u of units) if (u.lead === b.own && u.st === 2) { u.x = b.x; u.z = b.z; }
    if (Math.abs(b.x) > ARENA + 4 || Math.abs(b.z) > ARENA + 4) b.life = 0;
    // Another fireball?
    for (const o of balls) if (o !== b && Math.hypot(o.x - b.x, o.z - b.z) < o.r + b.r) { clash(b, o); break; }
    if (!balls.includes(b)) continue;
    // Everyone on the ground within reach.
    for (const u of units) {
      if (u.st !== 0 || Math.hypot(u.x - b.x, u.z - b.z) > b.r + .9) continue;
      const mine = u.lead === b.own, kin = u.col === L.col || u.col === WILD;
      if (mine) continue;
      if (u.lead < 0 && kin) {
        // Absorbed: our colour, or a wild one, rolled up on the way.
        u.lead = b.own; u.st = 2; u.morph = 1; b.pw += 1; b.life += .1;
        events.push({ k: 'eat', b });
        continue;
      }
      if (u.hearts) {
        // A leader caught in the open: hurt, and everyone following it
        // is thrown. A herd that was mid-charge is caught the same way.
        breakHerd(u, b.x, b.z, 11);
        b.pw -= 2;
      } else {
        scatter(u, u.x - b.x, u.z - b.z, 10 + b.pw * .3);
        b.pw -= 1;
      }
      events.push({ k: 'blast', x: u.x, z: u.z, col: u.col });
    }
    if (b.pw <= 0) { events.push({ k: 'boom', x: b.x, z: b.z, pw: 2 }); b.life = 0; }
    if (b.life <= 0) unfold(b);
  }
}

// The player's position for the camera: the leader, or the fireball it
// is riding in.
export const focus = () => leaders[0].ball || leaders[0];
export const won = () => leaders[0].st !== 3 && alive().length === 1;
export const lost = () => leaders[0].st === 3;
