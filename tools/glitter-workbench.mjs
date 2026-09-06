// A/B workbench uses the game's particle field, geometry and WebGL shader.
import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const source=readFileSync('fireball/src/main.js','utf8');
let particles=source.slice(source.indexOf('function vertexWriter('),source.indexOf('// --- the charge,'));
const a=particles.indexOf('    // Rotating'),b=particles.indexOf('\n  }\n  return put.n;',a);
particles=particles.slice(0,a)+readFileSync('tools/workbench/glitter-effect.txt','utf8')+particles.slice(b);
particles=particles.replace('flash = dust ?', 'flash = dust && variant ?').replace('** 64 * f * 8','** 64 * f * strength');
const field=`export function createField(variant){
const PMAX=220,PBUF=new Float32Array(9436*120),PART=[],ARENA=95;
let glitterTick=0,time=0,strength=8,eye,camR,player={x:0,z:0},units=[];
const RAINBOW=[[1,.2,.2],[1,.6,.1],[1,1,.3],[.3,1,.5],[.2,.7,1],[.5,.4,1],[.9,.3,1]],now=()=>time,who=()=>player;
${particles}
return (dt,t,e,r,wake,gain)=>{time=t;strength=gain;eye=e;camR=r;units=wake?[{x:Math.sin(t*.7)*15,z:Math.cos(t*.7)*15,sp:37,st:0,wave:1,r:8}]:[];const n=particleVerts(dt);return PBUF.subarray(0,n)};}`;
const out=await build({entryPoints:['tools/workbench/glitter.js'],bundle:true,write:false,format:'iife',plugins:[{name:'shared-particles',setup(b){b.onResolve({filter:/^glitter-field$/},()=>({path:'field',namespace:'field'}));b.onLoad({filter:/.*/,namespace:'field'},()=>({contents:field,loader:'js'}));}}]});
mkdirSync('build/glitter-workbench',{recursive:true});
writeFileSync('build/glitter-workbench/index.html',`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Brokat — workbench</title><style>body{margin:0;background:#100d1d;color:#eae3ff;font:15px system-ui}main{max-width:1100px;margin:24px auto;padding:0 20px}h1{font-size:26px;margin-bottom:8px}p{color:#b3aac5}button,label{margin-right:20px}button{padding:8px 14px;background:#302746;color:inherit;border:1px solid #685486;border-radius:8px}.labels{display:flex;margin:24px 0 8px}.labels b{width:50%}canvas{width:100%;display:block}small{display:block;margin-top:12px;color:#b3aac5}</style><main><h1>Brokat — krótkie refleksy</h1><p>Ta sama drobinka i pole brokatu po obu stronach. Po prawej — rzadkie białe refleksy, bez ramion i zmiany wielkości płatków.</p><button id=pause>Pauza</button><label><input id=orbit type=checkbox> Obrót kamery</label><label><input id=wake type=checkbox> Podrywanie brokatu</label><label>Tempo <input id=speed type=range min=.1 max=1 step=.1 value=1></label><label>Siła refleksów <input id=gain type=range min=1 max=12 step=1 value=8></label><div class=labels><b>Sam kolorowy brokat</b><b>Brokat + refleksy</b></div><canvas width=1280 height=640></canvas><small>Porównuj w ruchu. Pauza pozwala obejrzeć kształt refleksu; obrót pokazuje zależność od kamery.</small></main><script>${out.outputFiles[0].text}</script>`);
console.log('build/glitter-workbench/index.html');
