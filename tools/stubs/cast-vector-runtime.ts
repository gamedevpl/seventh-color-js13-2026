// Stub: the editor's runtime vector overrides.
//
// CAST_VECTOR_OVERRIDES ships empty — no vector document was ever committed —
// so every one of these returns false on the real build too, and the painters
// fall through to the procedural art. Stubbing them is a no-op at runtime that
// strands cast-vector-shapes.ts (12 KB) for the compressor to delete.
export function paintPostureVectorOverride() { return false; }
export function paintFrontVectorOverride() { return false; }
export function paintProfileVectorOverride() { return false; }
export function createRuntimeVectorDocuments() { return {}; }
export function setRuntimeVectorDocuments() {}
