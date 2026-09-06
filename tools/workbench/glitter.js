import {gl,initGL,frameGL,mode,createMesh,updateMesh,drawMesh,perspective,lookAt,mul,IDENT} from '../../fireball/src/gl.js';
import {createField} from 'glitter-field';
const canvas=document.querySelector('canvas');initGL(canvas);
const fields=[createField(false),createField(true)],meshes=fields.map(()=>createMesh(new Float32Array(9436*120)));
const pause=document.querySelector('#pause'),orbit=document.querySelector('#orbit'),wake=document.querySelector('#wake'),speed=document.querySelector('#speed'),gain=document.querySelector('#gain');
let paused=false,t=0,last=performance.now();pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Wznów':'Pauza'};
function frame(now){const dt=Math.min(.04,(now-last)/1000)*(paused?0:+speed.value);last=now;t+=dt;
const yaw=orbit.checked?t*.12:0,e=[Math.sin(yaw)*12,4,-Math.cos(yaw)*12],r=[Math.cos(yaw),0,Math.sin(yaw)];
const vp=mul(perspective(Math.PI/3,1,.1,220),lookAt(e,[0,8,12]));
frameGL(vp,e,[.055,.04,.095]);mode(1);
for(let i=0;i<2;i++){gl.viewport(i*640,0,640,640);const vertices=fields[i](dt,t,e,r,wake.checked,+gain.value);updateMesh(meshes[i],vertices,vertices.length);drawMesh(meshes[i],IDENT);}
window.GLITTER={t,vertices:meshes.map(m=>m.n)};requestAnimationFrame(frame);}
requestAnimationFrame(frame);
