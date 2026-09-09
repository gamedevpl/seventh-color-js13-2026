// THE PLAIN, SHARED. Seven herds run the plain and seven people can drive
// them; whatever is left over is driven by the brains, so a room with one
// person in it is exactly the game you play offline.
//
// The relay we are given is a dumb pipe: everything you send reaches every
// other socket in the room, you never hear your own voice back, and the
// only thing it adds is a line when someone arrives or leaves. So all of
// the structure below is built out of nothing but broadcasts.
//
// One client is the HOST: it alone runs the herd, and twenty times a
// second it writes the whole plain into a packet - every unicorn's place,
// heading and state - which everyone else eases toward and animates
// locally. Clients only anticipate their own movement; the host still
// owns collision, ownership, ignition and life state.
// The people who are not host send four bytes of input instead.
//
// Who hosts is not negotiated. Everyone announces themselves once a
// second, so everyone knows the same set of names, and the smallest name
// hosts. When it leaves, the next smallest simply starts writing packets.

import { units, leaders, newWorld, charge, chargeTime, move, recount, revive, lerp, wrapA } from './herd.js';

const TAU = Math.PI * 2;
const ROOM = 'wss://relay.js13kgames.com/uf-v3';
const SEATS = 7;
const JOINING = 'JOINING';
const ALONE = 'OFFLINE';
const SNAP = 1 / 20;                      // state at 20 Hz, input every rendered frame
const GONE = 3.5;                         // silence this long and you are out

export const net = {
  on: 0,                                  // is the socket up at all
  host: 0,                                // are we the one running the plain
  // The leader we drive, -1 when we have none. It must start at -1: a
  // client that has not been dealt a seat yet used to believe it held the
  // first one, and sent its thumbs to somebody else's herd.
  me: -1,
  seats: 1,                               // people on the plain
  said: '',                               // a line for the HUD
  news: null,                             // {k, i}: a seat taken or given up
};

let ws = null, id = '', tag = 0, hello = 0;
let seen = new Map();                     // id -> when we last heard it
let roster = [];                          // seat -> id, '' for a free one
let t = 0, tSnap = 0, tSeen = 0, tHeard = -99, joined = 0;
let netIn = [];                           // seat -> the input it last sent
let held = [];                            // seat -> was somebody on it last frame
let pending = [], serial = 0, turns = 0;
let lastR = '';                           // the seating as last announced

export function open(room) {
  if (ws) return;
  close();
  tag = (Math.random() * 65536) | 0;
  net.said = JOINING;
  try { ws = new WebSocket(room || net.room || ROOM); } catch { net.said = ALONE; return; }
  const socket = ws;
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { net.on = 1; t = 0; tHeard = -99; joined = 0; };
  // A socket that is refused says so; a socket that is merely blocked can
  // hang forever, and the message must not go on claiming we are joining
  // something while the plain runs on underneath it.
  setTimeout(() => { if (ws === socket && !net.on) { net.said = ALONE; close(); } }, 6000);
  ws.onclose = () => { close(); net.dropped = 1; net.said = ALONE; };
  ws.onerror = () => { net.said = ALONE; net.on = 0; };
  ws.onmessage = (e) => hear(e.data);
  hello = setInterval(() => { if (id) say('h' + id); }, 1000);
}
// A socket closes asynchronously, so its handlers must be taken off before
// a new one is opened - or the old one's onclose lands on the new one. And
// the names it heard go with it: our own old name, left behind, sorted
// smallest and blocked the election for as long as it took to go stale.
export function close() {
  const w = ws; ws = null; clearInterval(hello); id = '';
  t = tSnap = tSeen = joined = 0; tHeard = -99;
  net.dropped = 0; net.news = null; net.seats = 1;
  net.on = net.host = 0; net.me = -1; roster = []; lastR = ''; was = null; seen.clear();
  held = []; netIn = []; pending = []; turns = serial = 0;
  // Closing a socket that is still connecting makes the browser complain
  // in the console; let it arrive first, then leave.
  if (!w) return;
  w.onclose = w.onmessage = w.onerror = w.onopen = null;
  if (w.readyState) w.close(); else w.onopen = () => w.close();
}

function hear(d) {
  if (typeof d !== 'string') {
    if (d.byteLength !== 4 && d.byteLength !== 4 + units.length * 7 + SEATS * 7) return;
    const v = new DataView(d);
    if (v.getUint8(0) === 1) packet(v); else input(v);
    return;
  }
  const k = d[0], rest = d.slice(1);
  // Our own name, handed to us the moment we connect.
  if (k === '@') { id = rest; seen.set(id, t); say('h' + id); return; }
  // Someone announcing themselves.
  if (k === 'h') { seen.set(rest, t); return; }
  if (k === '-') { seen.delete(rest); return; }
  // The seating, which only the host writes. We keep it even when we are
  // not host: if the host leaves, whoever takes over carries on from it
  // instead of dealing the colours out again.
  if (k === 'r') { roster = rest.split('|'); reseat(); }
}

// Who came and who went, as the seating changes. Not on the first roster
// we ever see - that would read the whole room out to a newcomer - and
// never about ourselves.
let was = null;
function reseat() {
  if (was) for (let i = 0; i < SEATS; i++) {
    if (!!roster[i] !== !!was[i] && roster[i] !== id && was[i] !== id) net.news = { k: roster[i] ? 1 : 0, i };
  }
  was = roster.slice();
  const i = roster.indexOf(id);
  net.me = i;
  net.seats = roster.filter((x) => x).length || 1;
}

// --- the packet -----------------------------------------------------------
// Seven bytes a unicorn: where it is, which way it faces, and one byte
// holding its state, its herd and its colour. Seven bytes a leader on top.
let dv;
function write() {
  const n = 4 + units.length * 7 + SEATS * 7;
  if (dv?.byteLength !== n) dv = new DataView(new ArrayBuffer(n));
  const v = dv;
  v.setUint8(0, 1); v.setUint16(1, tag);
  v.setUint8(3, net.seats);
  let o = 4;
  for (const u of units) {
    v.setInt16(o, Math.max(-32000, Math.min(32000, u.x * 128))); o += 2;
    v.setInt16(o, Math.max(-32000, Math.min(32000, u.z * 128))); o += 2;
    v.setUint8(o++, u.yaw / TAU * 256);
    const ld = u.lead < 0 ? 7 : u.lead;
    v.setUint8(o++, u.st | (ld << 2) | (u.col << 5));
    v.setUint8(o++, Math.min(255, u.y * 16));
  }
  for (let i = 0; i < leaders.length; i++) {
    const L = leaders[i];
    for (const n of [L.stun * 20, L.cool * 20, L.charge * 255, L.wave, (L.st === 3 ? L.gone || 0 : L.wave ? L.burn : L.heat || 0) * 20, netIn[i]?.seq || 0]) v.setUint8(o++, Math.min(255, n));
    v.setUint8(o++, L.hearts | (L.st << 2) | (L.chg ? 32 : 0) | (roster[i] ? 64 : 0));
  }
  ws.send(v.buffer);
}

// What the client hears. Positions become targets rather than truth: the
// frame follows them through a damped velocity, so 20 Hz packets do not
// turn into a stop/start displacement and camera-speed pulse every frame.
function packet(v) {
  const theirs = v.getUint16(1);
  // Two hosts can only happen in the first second of an empty room. The
  // smaller tag keeps the plain; the other one stands down mid-packet.
  if (net.host) { if (theirs >= tag) return; net.host = 0; }
  tHeard = t;
  net.seats = v.getUint8(3);
  let o = 4;
  for (const u of units) {
    u.tx = v.getInt16(o) / 128; o += 2;
    u.tz = v.getInt16(o) / 128; o += 2;
    u.tyaw = v.getUint8(o++) / 256 * TAU;
    const p = v.getUint8(o++);
    u.st = p & 3;
    const ld = (p >> 2) & 7; u.lead = ld === 7 ? -1 : ld;
    u.col = p >> 5;
    u.ty = v.getUint8(o++) / 16;
  }
  for (const L of leaders) {
    L.stun = v.getUint8(o++) / 20;
    L.cool = v.getUint8(o++) / 20;
    L.charge = v.getUint8(o++) / 255;
    L.wave = v.getUint8(o++);
    L.burn = v.getUint8(o++) / 20;
    const ack = v.getUint8(o++);
    const f = v.getUint8(o++);
    L.hearts = f & 3; L.st = (f >> 2) & 3; L.chg = f & 32; L.man = f & 64;
    if (L === leaders[net.me]) {
      if (L.st || L.stun) { pending = []; turns = 0; }
      L.tyaw += turns - (pending[ack] || 0);
    }
    if (L.st === 3) L.gone = L.burn;
    else if (!L.wave) L.heat = L.burn;
  }
}

// --- the client's own frame ----------------------------------------------
// Legs, tumbles and the herd's footprint are worked out here rather than
// sent: they are the parts nobody can tell apart from the real thing.
export function ghost(dt, local) {
  recount();
  const k = Math.min(1, dt * 14);
  for (const u of units) {
    u.daze = Math.max(0, u.daze - dt); u.hit = Math.max(0, u.hit - dt);
    u.up = Math.max(0, u.up - dt);
    u.lunge = Math.max(0, u.lunge - dt * 4);
    u.recoil = Math.max(0, u.recoil - dt * 3);
    if (u.tx === undefined) continue;
    u.vx = lerp(u.vx, (u.tx - u.x) * 14, Math.min(1, dt * 18));
    u.vz = lerp(u.vz, (u.tz - u.z) * 14, Math.min(1, dt * 18));
    u.x += u.vx * dt; u.z += u.vz * dt;
    u.y += (u.ty - u.y) * k;
    u.yaw += wrapA(u.tyaw - u.yaw) * k;
    u.roll = u.st === 1 ? u.roll + dt * (4 + u.spin) : 0;
    // Velocity stays finite even when two frames share a timestamp.
    const sp = Math.hypot(u.vx, u.vz);
    u.sp = lerp(u.sp, sp, dt * 6);
    u.ph += sp * dt * 1.7 * u.gait;
  }
  // Leaders are unicorns too, so their own eased speed is the herd's.
  for (const L of leaders) L.spd = L.sp;
  // Store cumulative local turns in a bounded 8-bit ring. Subtracting the
  // acknowledged prefix replays only turns newer than the host snapshot.
  // Between snapshots advance the target too, or it fights opposite input.
  // Apply local input after reconciliation, so steering appears this frame.
  // This bounded anticipation uses the same kinematics as the host, without
  // replaying combat. Position integrates once per frame for every unicorn;
  // adding another herd displacement here fights the snapshot correction.
  // Stun/death and stale snapshots disable anticipation.
  const L = leaders[net.me];
  if (L && !L.st && !L.stun && t - tHeard < .5) {
    L.chg = (local.c && !local.b || L.wave) && !L.cool;
    L.charge = Math.max(0, Math.min(1, L.charge + dt * (L.chg ? 1 / chargeTime(L) : -1.5)));
    const yaw = L.yaw;
    move(L, dt, local.t, L.chg ? 11 + 26 * L.charge : local.b ? 0 : local.f ? 15 : 11);
    const delta = L.yaw - yaw;
    L.tyaw += delta;
    pending[serial] = turns += delta;
  }
}

// --- the tick -------------------------------------------------------------
// `local` is what this player is pressing. Returns 1 if this frame is ours
// to simulate (we are the host, or we are alone), 0 if we are watching a
// plain that somebody else is running.
export const spy = () => ({ id, t, tHeard, joined, names: [...seen.keys()].sort(), roster });
export function tick(dt, local) {
  if (!net.on) return 1;
  t += dt;


  // Names go quiet when a tab dies without closing its socket.
  if (t - tSeen > 1) {
    tSeen = t;
    for (const [k, when] of seen) if (t - when > GONE && k !== id) seen.delete(k);
  }

  // A second of listening before we decide anything: long enough to have
  // heard everyone already on the plain announce themselves.
  if (!joined) { if (t > 1.2) joined = 1; else { net.said = JOINING; return 0; } }

  // Whoever is running the plain keeps running it. Only silence hands it
  // on, and then it goes to the smallest name, which everybody sorts the
  // same way and nobody has to vote on.
  //
  // The first build gave it to the smallest name outright, and so every
  // arrival with a small name took the plain off whoever had it - which
  // meant a second and a half of frozen unicorns for everyone each time
  // somebody joined. Stability beats order here: an arrival should be
  // invisible to the people already playing.
  if (!net.host && t - tHeard > 1.2) {
    const names = [...seen.keys()].sort();
    if (names[0] === id) start();
  }

  if (net.host) {
    seat([...seen.keys()].sort());
    drive(local);
    tSnap += dt;
    if (tSnap >= SNAP) { tSnap %= SNAP; queueMicrotask(write); }
    net.said = '';
    return 1;
  }
  // Watching someone else's plain. If the packets stop, the host is gone
  // and the sort above will hand the plain to whoever is next.
  if (t - tHeard > 2) { net.said = JOINING; return 0; }
  net.said = '';
  if (net.me >= 0) {
    const b = new Uint8Array([2, net.me, (local.t + 1) | (local.f << 2) | (local.b << 3) | (local.c << 4), serial = (serial + 1) & 255]);
    pending[serial] = turns; // Retire old ring slots even while stunned/stale.
    ws.send(b);
  }
  return 0;
}
function say(s) { if (ws && ws.readyState === 1) ws.send(s); }

function start() {
  net.host = 1; pending = []; turns = 0;
  // Taking over from a host that left keeps the plain exactly as it was -
  // we have been drawing it all along. Only an empty room gets a new one.
  if (tHeard < 0) newWorld(0);
  else held = roster.slice(); // Existing riders must not revive on host migration.
}


// The host deals the seats and only says so when they change. Nobody who
// already has a colour ever loses it to somebody else arriving.
function seat(names) {
  for (let i = 0; i < SEATS; i++) if (roster[i] && !seen.has(roster[i])) roster[i] = '';
  for (const n of names) {
    if (roster.indexOf(n) >= 0) continue;
    for (let i = 0; i < SEATS; i++) if (!roster[i]) { roster[i] = n; break; }
  }
  while (roster.length < SEATS) roster.push('');
  const s = roster.join('|');
  if (s !== lastR) { lastR = s; say('r' + s); reseat(); }
}

// Hand every seated leader its input, and let the brains keep the rest.
function drive(local) {
  for (let i = 0; i < SEATS; i++) {
    const L = leaders[i];
    if (!roster[i]) { L.ai = L.ai || { t: 0, goal: null }; L.in = null; held[i] = 0; continue; }
    // A seat just TAKEN gets a herd worth taking: nobody should inherit a
    // statue, or a leader on its last heart with nothing behind it. Only
    // on the way in, though - a rider who dies waits out the five seconds
    // like everybody else, or the plain has no teeth for the people on it.
    if (!held[i]) { held[i] = 1; revive(L); }
    L.ai = null;
    const q = i === net.me ? local : netIn[i];
    if (!q || t - (q.at || t) > 1.5) { L.in = { t: 0, f: 0, b: 0 }; charge(L, 0); continue; }
    L.in = q; charge(L, q.c);
  }
}

// Four bytes from someone else's thumbs.
export function input(v) {
  if (v.getUint8(0) !== 2) return;
  const s = v.getUint8(1), b = v.getUint8(2);
  if (s >= SEATS) return;
  netIn[s] = { t: (b & 3) - 1, f: b & 4, b: b & 8, c: b & 16, seq: v.getUint8(3), at: t };
}
