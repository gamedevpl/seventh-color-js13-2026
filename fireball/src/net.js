// THE PLAIN, SHARED. Seven herds run the plain and seven people can drive
// them; whatever is left over is driven by the brains, so a room with one
// person in it is exactly the game you play offline.
//
// The relay we are given is a dumb pipe: everything you send reaches every
// other socket in the room, you never hear your own voice back, and the
// only thing it adds is a line when someone arrives or leaves. So all of
// the structure below is built out of nothing but broadcasts.
//
// One client is the HOST: it alone runs the herd, and twelve times a
// second it writes the whole plain into a packet - every unicorn's place,
// heading and state - which everyone else eases toward and animates
// locally. Nobody replays the simulation, so nobody can drift out of it.
// The people who are not host send three bytes of input instead.
//
// Who hosts is not negotiated. Everyone announces themselves once a
// second, so everyone knows the same set of names, and the smallest name
// hosts. When it leaves, the next smallest simply starts writing packets.

import { units, leaders, newWorld, charge, footprint } from './herd.js';

const TAU = Math.PI * 2;
const ROOM = 'wss://relay.js13kgames.com/unicorn-fireball';
const SEATS = 7;
const SNAP = 1 / 12;                      // the plain, twelve times a second
const IN = 1 / 20;                        // input, a little faster
const HELLO = 1;                          // and a name once a second
const GONE = 3.5;                         // silence this long and you are out

export const net = {
  on: 0,                                  // is the socket up at all
  host: 0,                                // are we the one running the plain
  me: 0,                                  // the leader we drive, -1 watching
  seats: 1,                               // people on the plain
  round: 0,                               // bumped when the host restarts
  said: '',                               // a line for the HUD
};

let ws = null, id = '', tag = 0;
let seen = new Map();                     // id -> when we last heard it
let roster = [];                          // seat -> id, '' for a free one
let t = 0, tHello = 0, tSnap = 0, tIn = 0, tSeen = 0, tHeard = -99, joined = 0;
let netIn = [];                           // seat -> the input it last sent
let bump = 0;                             // re-announce soon, someone is new

export function open(room) {
  if (ws) return;
  tag = (Math.random() * 65536) | 0;
  net.said = 'JOINING THE PLAIN';
  try { ws = new WebSocket(room || ROOM); } catch { net.said = 'NO PLAIN FOUND'; return; }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { net.on = 1; t = 0; tHeard = -99; joined = 0; };
  // A socket that is refused says so; a socket that is merely blocked can
  // hang forever, and the message must not go on claiming we are joining
  // something while the plain runs on underneath it.
  setTimeout(() => { if (ws && !net.on) { net.said = 'NO PLAIN HERE - PLAYING ALONE'; close(); } }, 6000);
  ws.onclose = () => { net.on = net.host = 0; net.me = 0; ws = null; if (!net.said) net.said = 'THE PLAIN IS GONE'; };
  ws.onerror = () => { net.said = 'NO PLAIN HERE - PLAYING ALONE'; net.on = 0; };
  ws.onmessage = (e) => hear(e.data);
}
export function close() { if (ws) { const w = ws; ws = null; net.on = net.host = 0; net.me = 0; w.close(); } }

function hear(d) {
  if (typeof d !== 'string') {
    const v = new DataView(d);
    if (v.getUint8(0) === 1) packet(v); else input(v);
    return;
  }
  const k = d[0], rest = d.slice(1);
  // Our own name, handed to us the moment we connect.
  if (k === '@') { id = rest; seen.set(id, t); return; }
  // Someone announcing themselves. A name we have not heard before is
  // worth answering at once, so joining feels immediate rather than
  // taking the full second until our next turn to speak.
  if (k === 'h') { if (!seen.has(rest)) bump = .1 + Math.random() * .2; seen.set(rest, t); return; }
  if (k === '-') { seen.delete(rest); return; }
  // The seating, which only the host writes. We keep it even when we are
  // not host: if the host leaves, whoever takes over carries on from it
  // instead of dealing the colours out again.
  if (k === 'r') { roster = rest.split('|'); reseat(); }
}

function reseat() {
  const i = roster.indexOf(id);
  net.me = i;
  net.seats = roster.filter((x) => x).length || 1;
}

// --- the packet -----------------------------------------------------------
// Seven bytes a unicorn: where it is, which way it faces, and one byte
// holding its state, its herd and its colour. Three bytes a leader on top.
let buf = null, dv = null;
function room() {
  const n = 5 + units.length * 7 + SEATS * 4;
  if (!buf || buf.byteLength !== n) { buf = new ArrayBuffer(n); dv = new DataView(buf); }
  return dv;
}
function write() {
  const v = room();
  v.setUint8(0, 1); v.setUint16(1, tag); v.setUint8(3, net.round & 255);
  v.setUint8(4, net.seats);
  let o = 5;
  for (const u of units) {
    v.setInt16(o, Math.max(-32000, Math.min(32000, u.x * 128))); o += 2;
    v.setInt16(o, Math.max(-32000, Math.min(32000, u.z * 128))); o += 2;
    v.setUint8(o++, (u.yaw / TAU * 256) & 255);
    const ld = u.lead < 0 ? 7 : u.lead;
    v.setUint8(o++, (u.st & 3) | (ld << 2) | ((u.col & 7) << 5));
    v.setUint8(o++, Math.min(255, u.y * 16));
  }
  for (const L of leaders) {
    v.setUint8(o++, L.charge * 255);
    v.setUint8(o++, Math.min(255, L.wave));
    v.setUint8(o++, Math.min(255, L.burn * 20));
    v.setUint8(o++, (L.hearts & 3) | ((L.st & 3) << 2) | (L.cool > 0 ? 16 : 0) | (L.chg ? 32 : 0));
  }
  ws.send(buf);
}

// What the client hears. Positions become targets rather than truth: the
// frame eases toward them, so a packet every 83ms still draws at 60.
function packet(v) {
  if (v.getUint8(0) !== 1) return;
  const theirs = v.getUint16(1);
  // Two hosts can only happen in the first second of an empty room. The
  // smaller tag keeps the plain; the other one stands down mid-packet.
  if (net.host) { if (theirs >= tag) return; net.host = 0; }
  tHeard = t;
  const r = v.getUint8(3);
  if (r !== net.round) { net.round = r; net.said = 'A NEW PLAIN'; }
  net.seats = v.getUint8(4);
  let o = 5;
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
    L.charge = v.getUint8(o++) / 255;
    L.wave = v.getUint8(o++);
    L.burn = v.getUint8(o++) / 20;
    const f = v.getUint8(o++);
    L.hearts = f & 3; L.st = (f >> 2) & 3; L.cool = f & 16 ? 1 : 0; L.chg = f & 32 ? 1 : 0;
  }
}

// --- the client's own frame ----------------------------------------------
// Legs, tumbles and the herd's footprint are worked out here rather than
// sent: they are the parts nobody can tell apart from the real thing.
const lerp = (a, b, k) => a + (b - a) * k;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function ghost(dt) {
  for (const L of leaders) { L.n = 0; L.cx = L.x; L.cz = L.z; }
  for (const u of units) if (u.lead >= 0 && u !== leaders[u.lead] && u.st !== 3) {
    const L = leaders[u.lead]; L.n++; L.cx += u.x; L.cz += u.z;
  }
  for (const L of leaders) { L.cx /= L.n + 1; L.cz /= L.n + 1; L.r = footprint(L.n); L.spd = 0; }
  const k = Math.min(1, dt * 14);
  for (const u of units) {
    u.daze = Math.max(0, u.daze - dt); u.hit = Math.max(0, u.hit - dt);
    u.up = Math.max(0, u.up - dt);
    u.lunge = Math.max(0, u.lunge - dt * 4);
    u.recoil = Math.max(0, u.recoil - dt * 3);
    if (u.tx === undefined) continue;
    const dx = (u.tx - u.x) * k, dz = (u.tz - u.z) * k;
    u.x += dx; u.z += dz;
    u.y += (u.ty - u.y) * k;
    u.yaw += wrapA(u.tyaw - u.yaw) * k;
    u.roll = u.st === 1 ? u.roll + dt * (4 + u.spin) : 0;
    // Two frames inside the same millisecond make dt zero, and a speed
    // divided by it is an infinity that reaches the oscillators as a NaN
    // and takes the whole loop down. Found on the real relay, where three
    // tabs make the frame clock jump about.
    const sp = Math.hypot(dx, dz) / (dt || .016);
    u.sp = lerp(u.sp, sp, dt * 6);
    u.ph += sp * dt * 1.7 * u.gait;
  }
  // Leaders are unicorns too, so their own eased speed is the herd's.
  for (const L of leaders) L.spd = L.sp;
}

// --- the tick -------------------------------------------------------------
// `local` is what this player is pressing. Returns 1 if this frame is ours
// to simulate (we are the host, or we are alone), 0 if we are watching a
// plain that somebody else is running.
export const spy = () => ({ id, t, tHeard, joined, names: [...seen.keys()].sort(), roster });
export function tick(dt, local) {
  if (!net.on) return 1;
  t += dt;

  if (bump > 0) { bump -= dt; if (bump <= 0) { say('h' + id); tHello = t; } }
  if (t - tHello > HELLO && id) { say('h' + id); tHello = t; }

  // Names go quiet when a tab dies without closing its socket.
  if (t - tSeen > 1) {
    tSeen = t;
    for (const [k, when] of seen) if (t - when > GONE && k !== id) seen.delete(k);
  }

  // A second of listening before we decide anything: long enough to have
  // heard everyone already on the plain announce themselves.
  if (!joined) { if (t > 1.2) joined = 1; else { net.said = 'JOINING THE PLAIN'; return 0; } }

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
    if (tSnap >= SNAP) { tSnap = 0; write(); }
    net.said = '';
    return 1;
  }
  // Watching someone else's plain. If the packets stop, the host is gone
  // and the sort above will hand the plain to whoever is next.
  if (t - tHeard > 2) { net.said = 'LOOKING FOR THE PLAIN'; return 0; }
  net.said = '';
  tIn += dt;
  if (tIn >= IN && net.me >= 0) {
    tIn = 0;
    const b = new Uint8Array([2, net.me, (local.t + 1) | (local.f ? 4 : 0) | (local.b ? 8 : 0) | (local.c ? 16 : 0)]);
    ws.send(b.buffer);
  }
  return 0;
}
function say(s) { if (ws && ws.readyState === 1) ws.send(s); }

function start() {
  net.host = 1;
  // Taking over from a host that left keeps the plain exactly as it was -
  // we have been drawing it all along. Only an empty room gets a new one.
  if (tHeard < 0) { net.round = (net.round + 1) & 255; newWorld(0); }
  net.said = 'THE PLAIN IS YOURS';
}

// The host starts the next plain when one herd is left standing.
export function restart() {
  if (!net.host) return;
  net.round = (net.round + 1) & 255;
  newWorld(0);
  for (let i = 0; i < SEATS; i++) leaders[i].in = null;
  netIn = [];
}

// The host deals the seats and only says so when they change. Nobody who
// already has a colour ever loses it to somebody else arriving.
let lastR = '';
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
    if (!roster[i]) { L.ai = L.ai || { t: 0, goal: null }; L.in = null; continue; }
    L.ai = null;
    const q = i === net.me ? local : netIn[i];
    if (!q || t - (q.at || t) > 1.5) { L.in = { t: 0, f: 0, b: 0 }; charge(L, 0); continue; }
    L.in = q; charge(L, q.c);
  }
}

// Three bytes from someone else's thumbs.
export function input(v) {
  if (v.getUint8(0) !== 2) return;
  const s = v.getUint8(1), b = v.getUint8(2);
  if (s < 0 || s >= SEATS) return;
  netIn[s] = { t: (b & 3) - 1, f: b & 4 ? 1 : 0, b: b & 8 ? 1 : 0, c: b & 16 ? 1 : 0, at: t };
}
