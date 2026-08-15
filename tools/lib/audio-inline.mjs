// Swap the assembled build's base64 WAV prelude for a runtime synthesiser.
//
// gamedev.pl renders shared/audio/sounds.json to WAV at build time and inlines
// the result, which costs ~230 KB of base64 in one game. The patch definitions
// those WAVs come from are a few hundred bytes, and the renderer is ~40 lines,
// so js13k moves the same render to boot time. Byte-for-byte identical output:
// the noise seed is each sound's positional index in the full catalog, exactly
// as tools/audio.ts seeds it.

const PRELUDE_PATTERN = /window\.__GAME_AUDIO_ASSETS__ = Object\.freeze\((\{.*?\})\);\n/s;

export function readSelectedPatches(catalog, soundNames) {
  const names = Object.keys(catalog.sounds);
  const patches = {};
  for (const name of soundNames) {
    const definition = catalog.sounds[name];
    if (!definition) throw new Error(`sound "${name}" is not in the shared catalog`);
    // tools/audio.ts seeds from a 1-based counter over the whole catalog.
    patches[name] = { ...definition, s: names.indexOf(name) + 1 };
  }
  return patches;
}

/** The synthesiser that ships, as source. Mirrors tools/audio.ts renderSound. */
function runtimeSource(patches, sampleRate) {
  return `window.__GAME_AUDIO_ASSETS__=function(P,R){
var out={},b64=typeof btoa=='function'?btoa:function(s){return Buffer.from(s,'binary').toString('base64')};
function osc(w,p){return w=='sine'?Math.sin(p):w=='square'?(Math.sin(p)>=0?1:-1):w=='triangle'?2/Math.PI*Math.asin(Math.sin(p)):w=='saw'?2*(p/(Math.PI*2)-Math.floor(p/(Math.PI*2)+.5)):0}
for(var key in P){
var d=P[key],rate=d.sampleRate||R,n=Math.ceil(d.duration*rate),buf=new Float64Array(n),ns=d.s>>>0;
for(var vi=0;vi<d.voices.length;vi++){
var v=d.voices[vi],ph=0,dl=v.delay||0,vd=Math.max(.001,d.duration-dl),at=v.attack||0,rl=v.release||0;
for(var f=0;f<n;f++){
var t=f/rate-dl;if(t<0||t>=vd)continue;
var fr=v.from+(v.to-v.from)*(t/vd),val;
if(v.wave=='noise'){ns=Math.imul(ns^ns>>>15,1|ns);ns^=ns+Math.imul(ns^ns>>>7,61|ns);val=((ns^ns>>>14)>>>0)/2147483648-1}
else{ph+=Math.PI*2*fr/rate;val=osc(v.wave,ph)}
buf[f]+=val*v.gain*((at>0?Math.min(1,t/at):1)*(rl>0?Math.min(1,(vd-t)/rl):1))}}
var peak=0;for(var f=0;f<n;f++)peak=Math.max(peak,Math.abs(buf[f]));
var sc=peak>.92?.92/peak:1,bytes=new Uint8Array(44+n*2),view=new DataView(bytes.buffer);
view.setUint32(0,0x52494646);view.setUint32(4,36+n*2,true);view.setUint32(8,0x57415645);
view.setUint32(12,0x666d7420);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
view.setUint32(36,0x64617461);view.setUint32(40,n*2,true);
for(var f=0;f<n;f++)view.setInt16(44+f*2,Math.round(Math.max(-1,Math.min(1,buf[f]*sc))*32767),true);
var str='';for(var i=0;i<bytes.length;i+=8192)str+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
out[key]='data:audio/wav;base64,'+b64(str)}
return out}(${JSON.stringify(patches)},${sampleRate});
`;
}

/**
 * Replace the inlined WAV prelude in an assembled bundle.
 *
 * Returns the rewritten JavaScript plus what the swap cost and saved, so the
 * size ledger can bill the transform rather than assert it.
 */
export function inlineSynthesizedAudio(js, catalog, soundNames) {
  const match = js.match(PRELUDE_PATTERN);
  if (!match) throw new Error('no __GAME_AUDIO_ASSETS__ prelude found — did the assembler change?');
  const patches = readSelectedPatches(catalog, soundNames);
  const replacement = runtimeSource(patches, catalog.sampleRate);
  return {
    js: js.replace(PRELUDE_PATTERN, () => replacement),
    before: match[0].length,
    after: replacement.length,
  };
}

export { runtimeSource, PRELUDE_PATTERN };
