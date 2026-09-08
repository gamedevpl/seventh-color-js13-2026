import {chromium} from 'playwright-core';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const src=readFileSync('fireball/src/snd.js','utf8').replace(/export /g,'');
  const render=async (events)=>page.evaluate(async ({src,events})=>{
    const audio=new OfflineAudioContext(2,44100*3,44100);
    window.AudioContext=function(){return audio};
    let seed=1;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    new Function('events',src+`;wake();for(const [kind,x,z] of events)spatial(kind==='boom'?boom:thud,1,x,z);`)(events);
    const out=await audio.startRendering();
    return [0,1].map(i=>{const a=out.getChannelData(i);return Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length)});
  },{src,events});
  for(const kind of ['thud','boom']) {
    const left=await render([[kind,-12,0]]),right=await render([[kind,12,0]]);
    assert.ok(left[0]>.001&&left[1]<1e-6);assert.ok(right[1]>.001&&right[0]<1e-6);
    const far=await render([[kind,-240,0]]);assert.ok(far[0]<left[0]*.2);
    const both=await render([[kind,-12,0],[kind,12,0]]);
    assert.ok(both[0]>.001&&both[1]>.001,'overlapping events retain independent positions');
    assert.ok(both[0]/both[1]>.75&&both[0]/both[1]<1.25);
    console.log('PASS',kind,{left,right,far,both});
  }
} finally {await browser.close()}
