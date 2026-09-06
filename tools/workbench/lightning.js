import {buildAll,HIPS,PIVOT} from '../../fireball/src/uni.js';
import {initGL,frameGL,mode,createMesh,updateMesh,drawMesh,IDENT,perspective,lookAt,mul,modelTR} from '../../fireball/src/gl.js';
import {lightning} from '../../fireball/src/lightning.js';
const canvas=document.querySelector('canvas');canvas.width=1000;canvas.height=600;initGL(canvas);
const models=buildAll();
const buf=new Float32Array(120000),mesh=createMesh([],true),arcs=[];
let paused=false,last=0,clock=0,spawn=0,seed=0;
document.querySelector('#pause').onclick=()=>paused=!paused;
document.querySelector('#seed').onclick=()=>{seed++;paused=false;spawn=0;};
function frame(t){const dt=paused?0:Math.min(.04,(t-last)/1000);last=t;clock+=dt;spawn-=dt;
 const eye=[Math.sin(clock*.15)*5,4,12],vp=mul(perspective(1,1000/600,.1,100),lookAt(eye,[0,1,0]));frameGL(vp,eye,[.025,.02,.06]);mode(0);
 for(const [x,z] of [[-4,Math.sin(seed)],[4,Math.cos(seed)]]) {
  const M=modelTR(x,0,z,Math.PI/2),u=models[0];drawMesh(u.body,M);
  drawMesh(u.crown,mul(M,modelTR(...PIVOT)));
  for(const [hx,hz] of HIPS)drawMesh(u.leg,mul(M,modelTR(hx,.43,hz)));
 }mode(1);
 if(spawn<=0){spawn=+document.querySelector('#rate').value;arcs.push({a:[-4,.9,Math.sin(seed)],b:[4,.9,Math.cos(seed)],col:[.4,.55,1],t:.15,w:.4});}
 const put=(x,y,z,c,a)=>{let n=put.n;buf.set([x,y,z,0,1,0,...c,a],n);put.n+=10};put.n=0;
 lightning(arcs,put,[0,1,0],dt);updateMesh(mesh,buf,put.n);drawMesh(mesh,IDENT);requestAnimationFrame(frame);
}requestAnimationFrame(frame);
window.bench={flash(){arcs.length=0;arcs.push({a:[-4,.9,Math.sin(seed)],b:[4,.9,Math.cos(seed)],col:[.4,.55,1],t:.132,w:.4});paused=true;}};
document.querySelector('#still').onclick=()=>window.bench.flash();
