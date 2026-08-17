import { GAMES } from './games.js';

// The one machine every beat runs on: dialogue -> game? or choice? -> retry?
// -> success dialogue? -> next beat, or END if the beat is marked `ending`.
// Every beat is a data row on this machine (design rule 2) - no beat gets
// its own logic; a beat that skips choice/success/game just has no such
// field. A mechanic (games.js) owns its own play-state but never its own
// copy of the surrounding dialogue/success/next plumbing.

export const P = { DIALOGUE: 0, CHOICE: 1, RETRY: 2, SUCCESS: 3, END: 4, GAME: 5, CUT: 6 };

export function makeRound(beats, startId) {
  const r = { beats, id: startId, phase: P.DIALOGUE, line: 0, choiceIndex: 0, elapsed: 0, g: null, cut: 0 };
  if (!currentBeat(r).dialogue) r.phase = P.CUT;
  return r;
}

// How long a narrated cutscene runs: one hold per line, so the writing
// sets the pacing rather than a number kept in sync with it by hand.
export const cutLength = (b) => b.cutscene.lines.length * (b.cutscene.hold ?? 3.1);

export function currentBeat(r) {
  return r.beats.find((b) => b.id === r.id);
}

function afterDialogue(r, b) {
  r.line = 0;
  if (b.game) { r.phase = P.GAME; r.g = GAMES[b.game].init(b); }
  else if (b.choice) { r.phase = P.CHOICE; r.choiceIndex = 0; }
  else if (b.successDialogue) r.phase = P.SUCCESS;
  else finish(r, b);
}

function finish(r, b) {
  // A cutscene is a held moment the player cannot press through - the one
  // place the story takes the controls back. It runs on the same machine as
  // everything else: one more phase, one more data field, no new plumbing.
  // A beat that carries dialogue plays its cutscene after it; a beat that
  // carries none *is* the cutscene, and was already in P.CUT on arrival.
  if (b.cutscene && b.dialogue && r.phase !== P.CUT) { r.phase = P.CUT; r.cut = 0; return; }
  if (b.ending) { r.phase = P.END; return; }
  r.id = b.next;
  r.line = 0;
  r.cut = 0;
  r.phase = currentBeat(r).dialogue ? P.DIALOGUE : P.CUT;
}

// tick runs every frame regardless of phase (elapsed drives blink/talk
// animation everywhere); the GAME phase additionally runs its mechanic's
// own per-frame update here, since a mechanic completes by continuous
// input (holding a turn key, timing a tap), not a single press like the
// other phases.
export function tick(r, dt, input) {
  r.elapsed += dt;
  if (r.phase === P.CUT) {
    r.cut += dt;
    const b = currentBeat(r);
    if (r.cut >= cutLength(b)) finish(r, b);
    return;
  }
  if (r.phase !== P.GAME) return;
  const b = currentBeat(r);
  if (GAMES[b.game].update(r.g, b, dt, input)) {
    r.g = null;
    r.line = 0;
    if (b.successDialogue) r.phase = P.SUCCESS; else finish(r, b);
  }
}

export function moveChoice(r, dir) {
  const n = currentBeat(r).choice.options.length;
  r.choiceIndex = (r.choiceIndex + dir + n) % n;
}

export function press(r) {
  const b = currentBeat(r);
  if (r.phase === P.DIALOGUE) {
    if (++r.line < b.dialogue.length) return;
    afterDialogue(r, b);
    return;
  }
  if (r.phase === P.CHOICE) {
    r.phase = r.choiceIndex === b.choice.correct ? P.SUCCESS : P.RETRY;
    return;
  }
  if (r.phase === P.RETRY) { r.phase = P.CHOICE; return; }
  // A cutscene holds, but it does not hold the player hostage: a press
  // moves to the next line early. The moment keeps its shape for anyone
  // who wants it and stops being a wall for anyone who does not - which
  // matters when a compo judge gives the entry ninety seconds.
  if (r.phase === P.CUT) {
    const hold = b.cutscene.hold ?? 3.1;
    r.cut = (Math.floor(r.cut / hold) + 1) * hold;
    if (r.cut >= cutLength(b)) finish(r, b);
    return;
  }
  if (r.phase === P.GAME) return; // GAME completes via tick(), not press()
  if (++r.line < b.successDialogue.length) return;
  r.line = 0;
  finish(r, b);
}
