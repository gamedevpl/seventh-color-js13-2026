// Stub: the in-game cast editor's state. The js13k build ships no editor, so
// this is the shape runtime.ts reads with the door permanently shut.
export function createCastEditorState() {
  return { open: false, suppressClick: false, ignorePointerFrames: 0, playing: false, timeline: 0 };
}
