// Deterministic collision regressions, independent of rendering and the relay.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newWorld, leaders, units, events, step, charge, edgeDanger, nearEdge } from '../fireball/src/herd.js';

function duel() {
  newWorld(0);
  for (const u of units) { u.st = 3; if (!leaders.includes(u)) u.lead = -1; }
  for (const L of leaders) L.ai = null;
  const [A, B] = leaders;
  for (const [i, L] of [A, B].entries()) Object.assign(L, {
    st: 0, x: i ? 1 : -1, z: 0, vx: i ? -11 : 11, vz: 0, spd: 11,
    yaw: i ? Math.PI : 0, wave: 1, charge: 1, chg: 1, burn: 3,
  });
  return [A, B];
}

function followers(L, count) {
  for (const u of units.filter(u => !leaders.includes(u) && u.col === L.col).slice(0, count)) {
    Object.assign(u, { st: 0, lead: L.lead, x: L.x, z: 3 });
  }
}

test('equal head-on rainbows both lose a heart', () => {
  const [A, B] = duel();
  step(0, {});
  assert.deepEqual([A.hearts, B.hearts], [2, 2]);
  assert.deepEqual([A.wave, B.wave], [0, 0]);
  assert.equal(events.filter(e => e.k === 'boom').length, 1);
});

test('current herd size wins regardless of leader order or ignition power', () => {
  for (const winner of [0, 1]) {
    const pair = duel(), W = pair[winner], loser = pair[1 - winner];
    followers(W, 3); followers(loser, 1);
    W.wave = 4; loser.wave = 20;
    step(0, {});
    assert.equal(W.hearts, 3);
    assert.equal(loser.hearts, 2);
    assert.equal(W.wave, 0);
    assert.equal(W.cool, 3);
  }
});

test('grazing rainbows deflect without damage and stay lit while held', () => {
  const [A, B] = duel();
  B.yaw = A.yaw; A.vx = A.spd = 22; B.vx = B.spd = 11;
  followers(B, 1);
  // Put a follower inside the other rainbow too: immunity covers the herd.
  const follower = units.find(u => u !== B && u.lead === B.lead);
  follower.x = A.x; follower.z = 0;
  step(0, {});
  assert.equal(events.filter(e => e.k === 'graze').length, 1);
  assert.deepEqual([A.hearts, B.hearts], [3, 3]);
  assert.equal(follower.lead, B.lead);
  for (let i = 0; i < 10; i++) {
    charge(A, 1); charge(B, 1); step(1 / 60, {});
  }
  assert.ok(A.wave && B.wave);
  assert.equal(events.filter(e => e.k === 'graze').length, 1);
  assert.equal(events.filter(e => e.k === 'hurt').length, 0);
});

test('an unlit rival is still hurt by a rainbow', () => {
  const [A, B] = duel();
  B.wave = B.charge = B.chg = 0;
  step(0, {});
  assert.equal(B.hearts, 2);
  assert.equal(A.hearts, 3);
});

test('release cancels charging, but ignition commits until burnout', () => {
  const [A, B] = duel(); B.st = 3;
  A.wave = 0; A.charge = .5;
  charge(A, 0); step(1 / 60, {});
  assert.ok(A.charge < .5);
  A.wave = 1; A.charge = A.chg = 1; A.burn = .1;
  charge(A, 0); step(1 / 60, {});
  assert.ok(A.wave && A.chg);
  for (let i = 0; i < 6; i++) step(1 / 60, {});
  assert.equal(A.wave, 0);
  charge(A, 1); assert.equal(A.chg, 0);
  for (let i = 0; i < 181; i++) step(1 / 60, {});
  charge(A, 1); assert.equal(A.chg, 1);
});

test('edge warning predicts outward speed, without warning on a safe inward path', () => {
  const [A] = duel();
  Object.assign(A, { x: 20, z: 0, vx: 37, vz: 0 });
  assert.equal(nearEdge(A.x, A.z), false);
  assert.equal(edgeDanger(A), true);
  A.vx = -37;
  assert.equal(edgeDanger(A), false);
});

test('the last two herds keep their positions and followers without a scripted phase', () => {
  const [A, B] = duel();
  Object.assign(A, {x: -40, z: 10, wave: 0, chg: 0, charge: 0});
  Object.assign(B, {x: 40, z: -10, wave: 0, chg: 0, charge: 0});
  followers(A, 3); followers(B, 1);
  const before = units.map(u => [u.x, u.z, u.lead, u.col]);
  step(0, {round: 1});
  assert.deepEqual(units.map(u => [u.x, u.z, u.lead, u.col]), before);
  assert.deepEqual([A.n, B.n], [3, 1]);
  assert.equal(events.some(e => e.k === 'final'), false);
  step(1 / 60, {});
  assert.ok(A.x > -40, 'no countdown freezes movement');
  assert.equal(A.chg, 0, 'no forced charge');
});

test('mega clash rewards impact speed and is independent of array order', () => {
  for (const fast of [0, 1]) {
    const pair = duel();
    const flock = units.filter(u => !leaders.includes(u));
    flock.forEach((u, i) => { const L = pair[i < 35 ? 0 : 1]; Object.assign(u, {st: 0, lead: L.lead, x: L.x, z: 3}); });
    pair[fast].spd = 37; pair[1 - fast].spd = 25;
    step(0, {});
    assert.equal(pair[fast].hearts, 3);
    assert.equal(pair[1 - fast].hearts, 0);
  }
});

test('35+ instability has a build-up and braking cools it', () => {
  newWorld(0);
  const A = leaders[0];
  leaders.forEach(L => L.ai = null);
  units.filter(u => !leaders.includes(u)).slice(0, 35).forEach(u => Object.assign(u, {lead: 0, st: 0, x: 0, z: 3}));
  Object.assign(A, { x: 0, z: 0, vx: 0, vz: 0, in: {t: 0, f: 0, b: 0} });
  // Keep the fixture safely in the centre; measure heat independently of steering.
  for (let i = 0; i < 200; i++) { A.x = A.z = A.vx = A.vz = 0; step(1 / 60, {}); }
  assert.ok(A.heat > .4 && A.heat < .8);
  assert.equal(A.wave, 0);
  A.in.b = 1; charge(A, 0); step(1 / 60, {});
  assert.equal(A.heat, 0);
});


test('a 35+ herd self-ignites, stays lit after spending followers, and ignores braking', () => {
  newWorld(0);
  const A = leaders[0];
  leaders.forEach(L => { L.ai = null; if (L !== A) L.st = 3; });
  units.filter(u => !leaders.includes(u)).slice(0, 35).forEach(u => Object.assign(u, {lead: 0, st: 0, x: 0, z: 3}));
  A.in = {t: 0, f: 0, b: 0};
  const tick = () => { A.x = A.z = A.vx = A.vz = 0; charge(A, 0); step(1 / 60, {}); };
  for (let i = 0; i < 800 && !A.wave; i++) tick();
  assert.ok(A.wave >= 35);
  for (let i = 0; i < 60; i++) tick();
  assert.ok(A.n < 35 && A.wave > 0);
  A.in.b = 1; tick();
  assert.ok(A.wave > 0);
  assert.equal(A.heat, 0);
});


test('a grazing unit overlapping a rival stays finite and can separate', () => {
  newWorld(0);
  const L = leaders[0], u = units.find(u => u.lead < 0 && u.col !== L.col);
  u.x = L.x; u.z = L.z;
  for (let i = 0; i < 120; i++) step(1 / 30, {});
  assert.ok(units.every(u => Number.isFinite(u.x + u.z + u.vx + u.vz)));
  assert.ok(Math.hypot(u.x - L.x, u.z - L.z) > 0);
});

test('seed 42 mutual pursuit resolves through ordinary combat', () => {
  const random = Math.random;
  let seed = 42, blows = 0;
  Math.random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
  try {
    newWorld(0); leaders[0].ai = {t: 0, goal: null};
    for (let i = 0; i < 420 * 30 && leaders.filter(L => L.st !== 3).length > 1; i++) {
      step(1 / 30, {});
      blows += events.filter(e => e.k === 'hurt').length;
      // Committed rainbows can be redirected beyond the boundary.
      events.length = 0;
    }
    assert.ok(leaders.filter(L => L.st !== 3).length <= 1);
    assert.ok(blows > 0);
    assert.equal(units.length, 77);
  } finally { Math.random = random; }
});

test('eliminating a leader releases adopted wild followers too', () => {
  for (const cause of ['edge', 'horn']) {
    const [A, B] = duel();
    Object.assign(A, {hearts: 1, x: cause === 'edge' ? 96 : -.3, wave: 0, chg: 0, charge: 0});
    Object.assign(B, {x: .3, wave: 0, charge: .8, sp: 37});
    const follower = units.find(u => !leaders.includes(u));
    Object.assign(follower, {st: 0, col: 7, lead: A.lead, x: 50, z: 30});
    step(0, {});
    assert.equal(A.st, 3, cause);
    assert.equal(follower.lead, -1, cause + ' must not leave a herd following a statue');
    assert.equal(follower.col, 7);
  }
});

test('braking overrides held charge and sprint, stopping before the edge', () => {
  const [A, B] = duel(); B.st = 3;
  Object.assign(A, {wave: 0, x: 60, z: 0, yaw: 0, vx: 37, vz: 0, spd: 37, in: {t: 0, f: 1, b: 1}});
  for (let i = 0; i < 180; i++) { charge(A, 1); step(1 / 60, {}); }
  assert.equal(A.st, 0);
  assert.equal(A.wave, 0);
  assert.equal(A.chg, 0);
  assert.ok(A.spd < .01 && Math.abs(A.vx) < .01);
  assert.ok(A.x < 81, 'braking from the warning leaves a safe margin');
});

test('large herds ignite sooner while small herd timing stays unchanged', () => {
  const ignition = n => {
    newWorld(0);
    const A = leaders[0];
    leaders.forEach(L => { L.ai = null; if (L !== A) L.st = 3; });
    units.filter(u => !leaders.includes(u)).forEach((u, i) => Object.assign(u,
      i < n ? {lead: 0, st: 0, x: 0, z: 3} : {lead: -1, st: 3}));
    for (let i = 1; i <= 360; i++) {
      A.x = A.z = A.vx = A.vz = 0;
      charge(A, 1); step(1 / 60, {});
      if (A.wave) return i / 60;
    }
    return Infinity;
  };
  const small = ignition(10), large = ignition(35);
  assert.ok(small >= 3.19 && small <= 3.24);
  assert.ok(large >= 2.07 && large <= 2.11);
});

test('AI collects nearby neutrals but answers an incoming rainbow', () => {
  const [A, B] = duel();
  Object.assign(A, {x: 0, wave: 0, chg: 0, charge: 0, ai: {t: 0, goal: null}});
  Object.assign(B, {x: 40, z: 0, wave: 0, charge: 0, chg: 0, stun: 99});
  followers(A, 3);
  const food = units.find(u => !leaders.includes(u) && u.lead < 0);
  Object.assign(food, {col: 7, st: 0, x: 20, z: 0});
  for (let i = 0; i < 481; i++) {
    A.x = A.z = A.vx = A.vz = 0;
    food.x = 20; food.z = 0; food.lead = -1;
    step(1 / 30, {});
  }
  assert.equal(A.ai.sprint, false, 'nearby food takes precedence over hunting');
  B.wave = 1; B.yaw = Math.PI; A.ai.t = 0;
  step(0, {});
  assert.equal(A.ai.sprint, true, 'incoming attackers still take precedence over food');
});

test('ramming a leader and nearby follower leaves distant followers standing', () => {
  const [A, B] = duel(); B.wave = B.charge = B.chg = 0;
  const [near, far] = units.filter(u => !leaders.includes(u)).slice(0, 2);
  Object.assign(near, {st: 0, col: B.col, lead: B.lead, x: 0, z: 1});
  Object.assign(far, {st: 0, col: B.col, lead: B.lead, x: 40, z: 30});
  step(0, {});
  assert.equal(B.hearts, 2);
  assert.equal(near.st, 1);
  assert.equal(far.st, 0);
  assert.equal(far.lead, B.lead);
});

function sideImpact(nA = 10, nB = 35, speed = 37, edge = false) {
  const [A, B] = duel();
  Object.assign(A, {x: edge ? 79 : -6, z: 0, yaw: 0, vx: speed, vz: 0, spd: speed, burn: 6});
  Object.assign(B, {x: edge ? 85 : 0, z: 0, yaw: Math.PI / 2, vx: 0, vz: 37, spd: 37, burn: 6, in: {t: 0, f: 0, b: 1}});
  units.filter(u => !leaders.includes(u)).slice(0, nA + nB).forEach((u, i) => {
    const L = i < nA ? A : B;
    Object.assign(u, {st: 0, lead: L.lead, col: L.col, x: L.x, z: L.z});
  });
  return [A, B];
}

test('side impact transfers normal momentum, preserves health and both rainbows', () => {
  const [A, B] = sideImpact();
  const beforeX = 11 * A.vx + 36 * B.vx, beforeZ = 11 * A.vz + 36 * B.vz;
  step(0, {});
  assert.ok(Math.abs(11 * A.vx + 36 * B.vx - beforeX) < 1e-6);
  assert.ok(Math.abs(11 * A.vz + 36 * B.vz - beforeZ) < 1e-6);
  assert.ok(B.vx > 0 && B.yaw < Math.PI / 2);
  assert.ok(A.wave && B.wave);
  assert.deepEqual([A.hearts, B.hearts], [3, 3]);
  assert.equal(events.filter(e => e.k === 'boom').length, 0);
  assert.equal(events.filter(e => e.k === 'graze').length, 1);
});

test('heavier and faster side impacts redirect the target further', () => {
  const turn = (n, speed) => {
    const [, B] = sideImpact(n, 35, speed); step(0, {});
    return Math.PI / 2 - B.yaw;
  };
  assert.ok(turn(10, 37) > turn(3, 37));
  assert.ok(turn(10, 37) > turn(10, 15));
});

test('opposing headings with an offset contact graze instead of exploding', () => {
  const [A, B] = sideImpact();
  B.yaw = Math.PI; B.vx = -37; B.vz = 0;
  A.x = -2; B.z = 12;
  for (const u of units) if (u.lead >= 0 && !leaders.includes(u)) {
    u.x = leaders[u.lead].x; u.z = leaders[u.lead].z;
  }
  step(0, {});
  assert.equal(events.filter(e => e.k === 'boom').length, 0);
  assert.equal(events.filter(e => e.k === 'graze').length, 1);
  assert.ok(A.wave && B.wave);
});

test('separating rainbows do not receive a second collision impulse', () => {
  const [A, B] = sideImpact(); A.vx = -37;
  step(0, {});
  assert.equal(events.filter(e => e.k === 'graze' || e.k === 'boom').length, 0);
  assert.equal(A.vx, -37); assert.equal(B.vx, 0);
});

test('a smaller rainbow can redirect a larger one over the edge despite braking', () => {
  const run = hit => {
    const [A, B] = sideImpact(10, 35, 37, true);
    if (!hit) { A.st = 3; A.wave = 0; }
    for (let i = 0; i < 45 && B.st !== 3; i++) { charge(B, 0); step(1 / 30, {}); }
    return B.st;
  };
  assert.equal(run(false), 0, 'the parallel course is safe without contact');
  assert.equal(run(true), 3, 'the impact pushes the committed rainbow outside');
});
