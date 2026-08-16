// The one machine every beat runs on: dialogue -> (choice -> retry)? -> next
// beat. Built incrementally - M1 only exercises plain dialogue advance;
// choice/retry/cinematic phases arrive at M2 when a beat first needs them,
// per the "build only what's exercised" rule.

export function makeRound(beats, startId) {
  return { beats, id: startId, line: 0, elapsed: 0, done: false };
}

export function currentBeat(r) {
  return r.beats.find((b) => b.id === r.id);
}

export function tick(r, dt) {
  r.elapsed += dt;
}

// Returns true if the whole round just ended (last beat's dialogue closed).
export function press(r) {
  const b = currentBeat(r);
  if (++r.line < b.dialogue.length) return false;
  r.line = 0;
  if (b.next) { r.id = b.next; return false; }
  r.done = true;
  return true;
}
