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
    st: 0, x: i ? 1 : -1, z: 0, vx: 0, vz: 0, spd: 0,
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
  B.yaw = A.yaw;
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

test('release cancels the rainbow and the cooldown expires normally', () => {
  const [A, B] = duel(); B.st = 3;
  charge(A, 0); step(1 / 60, {});
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


test('a 35+ herd self-ignites, stays lit after spending followers, and can brake', () => {
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
  assert.equal(A.wave, 0);
  assert.equal(A.heat, 0);
});
