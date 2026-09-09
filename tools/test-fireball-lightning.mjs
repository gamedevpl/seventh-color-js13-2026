import assert from 'node:assert/strict';
import {lightning} from '../fireball/src/lightning.js';
const bolt=()=>({a:[-4,.9,0],b:[4,.9,1],col:[.4,.55,1],t:.132,w:.4});
function draw(arcs,dt=0){const points=[];const put=(...v)=>{points.push(v);put.n+=10};put.n=0;const count=lightning(arcs,put,[0,1,0],dt);return {points,count};}
const a=draw([bolt()]),b=draw([bolt()]);assert.deepEqual(a,b,'channel must remain stable');
assert.equal(a.count,15*12*10);assert.ok(a.points.every(p=>p.slice(0,3).every(Number.isFinite)));
const dim=bolt();dim.t=.1;const later=draw([dim]);
assert.deepEqual(a.points.map(p=>p.slice(0,3)),later.points.map(p=>p.slice(0,3)),'return stroke uses the same channel');
assert.notEqual(a.points[0][4],later.points[0][4]);
const arcs=Array.from({length:60},bolt);assert.equal(draw(arcs).count,60*15*12*10);draw(arcs,.2);assert.equal(arcs.length,0);
// First strip starts at a; the final main strip reaches b, independent of its branch.
const first=a.points.slice(0,2);
assert.ok(Math.abs((first[0][0]+first[1][0])/2+4)<1e-9);
assert.ok(a.points.some(p=>Math.abs(p[0]-4)<1e-9&&Math.abs(p[2]-1)<1e-9));
console.log('PASS stable lightning channel, return strokes, endpoints, capacity and expiry');
