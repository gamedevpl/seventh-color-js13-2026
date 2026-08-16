// The one machine every beat runs on: dialogue -> choice? -> retry? ->
// success dialogue? -> next beat, or END if the beat is marked `ending`.
// Every beat is a data row on this machine (design rule 2) - no beat gets
// its own logic; a beat that skips choice/success just has no such field.

export const P = { DIALOGUE: 0, CHOICE: 1, RETRY: 2, SUCCESS: 3, END: 4 };

export function makeRound(beats, startId) {
  return { beats, id: startId, phase: P.DIALOGUE, line: 0, choiceIndex: 0, elapsed: 0 };
}

export function currentBeat(r) {
  return r.beats.find((b) => b.id === r.id);
}

export function tick(r, dt) {
  r.elapsed += dt;
}

export function moveChoice(r, dir) {
  const n = currentBeat(r).choice.options.length;
  r.choiceIndex = (r.choiceIndex + dir + n) % n;
}

function finish(r, b) {
  if (b.ending) { r.phase = P.END; return; }
  r.id = b.next;
  r.phase = P.DIALOGUE;
  r.line = 0;
}

export function press(r) {
  const b = currentBeat(r);
  if (r.phase === P.DIALOGUE) {
    if (++r.line < b.dialogue.length) return;
    r.line = 0;
    if (b.choice) { r.phase = P.CHOICE; r.choiceIndex = 0; }
    else if (b.successDialogue) r.phase = P.SUCCESS;
    else finish(r, b);
    return;
  }
  if (r.phase === P.CHOICE) {
    r.phase = r.choiceIndex === b.choice.correct ? P.SUCCESS : P.RETRY;
    return;
  }
  if (r.phase === P.RETRY) { r.phase = P.CHOICE; return; }
  if (++r.line < b.successDialogue.length) return;
  r.line = 0;
  finish(r, b);
}
