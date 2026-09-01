// A stand-in for the js13k relay, small enough to live in the repo.
//
// The real one is a Cloudflare Durable Object and behaves exactly like
// this: it hands each socket its own id on connect, repeats everything you
// send to every OTHER socket in the room, never echoes you back to
// yourself, and posts a line when somebody arrives or leaves. Anything
// prefixed `@<id>|` goes to that one socket instead of the room.
//
// It is here so the online tests can run without the network, and so the
// day the real relay changes shape we find out by comparing against
// something we can read.

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(data) {
  const bin = typeof data !== 'string';
  const body = bin ? Buffer.from(data) : Buffer.from(data, 'utf8');
  const n = body.length;
  const head = n < 126 ? Buffer.from([bin ? 0x82 : 0x81, n])
    : Buffer.from([bin ? 0x82 : 0x81, 126, n >> 8 & 255, n & 255]);
  return Buffer.concat([head, body]);
}

export function startRelay() {
  const rooms = new Map();
  const server = createServer((_, res) => { res.writeHead(404); res.end(); });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + 'Sec-WebSocket-Accept: ' + createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n');

    const path = req.url;
    const id = randomBytes(16).toString('base64url').slice(0, 22);
    if (!rooms.has(path)) rooms.set(path, new Map());
    const room = rooms.get(path);

    const send = (s, d) => { try { s.write(frame(d)); } catch {} };
    send(socket, '@' + id);
    for (const [, s] of room) send(s, '+' + id);
    room.set(id, socket);

    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 15, masked = buf[1] & 128;
        let n = buf[1] & 127, o = 2;
        if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); o = 4; }
        else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); o = 10; }
        const mask = masked ? buf.subarray(o, o + 4) : null;
        if (masked) o += 4;
        if (buf.length < o + n) return;
        const body = Buffer.from(buf.subarray(o, o + n));
        buf = buf.subarray(o + n);
        if (mask) for (let i = 0; i < n; i++) body[i] ^= mask[i & 3];
        if (op === 8) { socket.end(); return; }
        if (op !== 1 && op !== 2) continue;
        const payload = op === 1 ? body.toString('utf8') : body;
        // `@<id>|rest` is for one socket; everything else is for the room.
        // The real relay's ids are not a fixed width, so find the bar.
        const bar = body[0] === 64 ? body.indexOf(124) : -1;
        if (bar > 1 && bar < 40) {
          const one = room.get(body.subarray(1, bar).toString('utf8'));
          if (one) send(one, op === 1 ? payload.slice(bar + 1) : body.subarray(bar + 1));
          continue;
        }
        for (const [k, s] of room) if (k !== id) send(s, payload);
      }
    });

    const bye = () => {
      if (!room.has(id)) return;
      room.delete(id);
      for (const [, s] of room) send(s, '-' + id);
      if (!room.size) rooms.delete(path);
    };
    socket.on('close', bye);
    socket.on('error', bye);
  });

  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      res({ url: `ws://127.0.0.1:${port}`, port, close: () => server.close(), rooms });
    });
  });
}

// A live run cannot go straight out: the browser has no way through this
// sandbox's proxy, and Node does. So the pages talk to a socket on the
// loopback and every byte is carried, untouched, to the real relay - which
// is the thing we actually want to put a question to.
export function startBridge(upstream) {
  const server = createServer((_, res) => { res.writeHead(404); res.end(); });
  server.on('upgrade', (req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + 'Sec-WebSocket-Accept: ' + createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64') + '\r\n\r\n');
    const out = new WebSocket(upstream + req.url);
    out.binaryType = 'arraybuffer';
    const queue = [];
    out.onopen = () => { for (const m of queue) out.send(m); queue.length = 0; };
    out.onmessage = (e) => { try { socket.write(frame(typeof e.data === 'string' ? e.data : Buffer.from(e.data))); } catch {} };
    out.onclose = () => socket.end();
    out.onerror = () => socket.end();
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 15, masked = buf[1] & 128;
        let n = buf[1] & 127, o = 2;
        if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); o = 4; }
        else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); o = 10; }
        const mask = masked ? buf.subarray(o, o + 4) : null;
        if (masked) o += 4;
        if (buf.length < o + n) return;
        const body = Buffer.from(buf.subarray(o, o + n));
        buf = buf.subarray(o + n);
        if (mask) for (let i = 0; i < n; i++) body[i] ^= mask[i & 3];
        if (op === 8) { out.close(); socket.end(); return; }
        if (op !== 1 && op !== 2) continue;
        const m = op === 1 ? body.toString('utf8') : body;
        if (out.readyState === 1) out.send(m); else queue.push(m);
      }
    });
    socket.on('close', () => out.close());
    socket.on('error', () => out.close());
  });
  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => res({ url: `ws://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}
