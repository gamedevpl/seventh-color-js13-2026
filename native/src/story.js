import { GAMES } from './games.js';

// The one machine every beat runs on: dialogue -> game? or choice? -> retry?
// -> success dialogue? -> next beat, or END if the beat is marked `ending`.
// Every beat is a data row on this machine (design rule 2) - no beat gets
// its own logic; a beat that skips choice/success/game just has no such
// field. A mechanic (games.js) owns its own play-state but never its own
// copy of the surrounding dialogue/success/next plumbing.

export const P = { DIALOGUE: 0, CHOICE: 1, RETRY: 2, SUCCESS: 3, END: 4, GAME: 5 };

export function makeRound(beats, startId) {
  return { beats, id: startId, phase: P.DIALOGUE, line: 0, choiceIndex: 0, elapsed: 0, g: null };
}

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
  if (b.ending) { r.phase = P.END; return; }
  r.id = b.next;
  r.phase = P.DIALOGUE;
  r.line = 0;
}

// tick runs every frame regardless of phase (elapsed drives blink/talk
// animation everywhere); the GAME phase additionally runs its mechanic's
// own per-frame update here, since a mechanic completes by continuous
// input (holding a turn key, timing a tap), not a single press like the
// other phases.
export function tick(r, dt, input) {
  r.elapsed += dt;
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
  if (r.phase === P.GAME) return; // GAME completes via tick(), not press()
  if (++r.line < b.successDialogue.length) return;
  r.line = 0;
  finish(r, b);
}
