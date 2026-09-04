// Raw WebGL, one shader, hand-rolled mat4 - the whole renderer. Three.js
// costs more than this entire game's budget; a maze of boxes, a ribbon and
// one pony need exactly one program: position/normal/color, lambert light,
// distance fog. Same discipline as game one's draw.js: a thin layer the
// call sites stay readable through, not an engine.

export let gl, canvas;

// Two materials in one program. Solid geometry gets lambert + fog-toward-
// fog-colour. Glow gets no lighting (it emits, it is not lit) and fades
// toward nothing rather than toward fog, because additive blending adds -
// mixing a distant glow toward the fog colour would brighten the horizon
// instead of letting the light die away.
// `add` lives in both stages, so it carries an explicit precision: default
// float precision is highp in the vertex shader and mediump in the fragment
// one, and a uniform whose precision disagrees across stages is a link error.
const VS = `attribute vec3 p,n,c;attribute float a;uniform mat4 vp,md;uniform vec3 cam;
uniform mediump float add,dim;varying vec3 vc;varying float vf,va;
void main(){vec4 w=md*vec4(p,1.);gl_Position=vp*w;
float l=.55+.45*max(dot(normalize((md*vec4(n,0.)).xyz),normalize(vec3(.4,1.,.3))),0.);
vc=c*mix(l,1.,add);va=a*dim;vf=clamp((length(w.xyz-cam)-12.)/mix(58.,150.,add),0.,1.);}`;
// Fireball draws solids and additive glow; the surfer's glass material is
// unused here. Keeping only these two paths leaves room for the game rules.
const FS = `precision mediump float;varying vec3 vc;varying float vf,va;
uniform vec3 fog;uniform float add;
void main(){if(add>.5)gl_FragColor=vec4(vc,va*(1.-vf*.92));
else gl_FragColor=vec4(mix(vc,fog,vf),va);}`;

let prog, loc = {};

export function initGL(c) {
  canvas = c;
  // The HUD is a separate overlay; it never reads the WebGL buffer back.
  gl = c.getContext('webgl');
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  for (const u of ['vp', 'md', 'cam', 'fog', 'add', 'dim']) loc[u] = gl.getUniformLocation(prog, u);
  gl.uniform1f(loc.dim, 1);
  for (const a of ['p', 'n', 'c', 'a']) loc[a] = gl.getAttribLocation(prog, a);
  gl.enable(gl.DEPTH_TEST);
}

export function frameGL(vp, cam, fog) {
  mode(0);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(fog[0], fog[1], fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(loc.vp, false, vp);
  gl.uniform3fv(loc.cam, cam);
  gl.uniform3fv(loc.fog, fog);
}

// Two materials, one program.
//   0 SOLID  lambert + fog, opaque, writes depth.
//   1 GLOW   emissive, additive, depth TEST but no depth WRITE - glow layers
//            still hide behind solid things but never occlude each other,
//            they sum, and that summing is the bloom.
export function mode(m) {
  gl.uniform1f(loc.add, m === 1 ? 1 : 0);
  if (!m) { gl.disable(gl.BLEND); gl.depthMask(true); return; }
  gl.enable(gl.BLEND);
  gl.depthMask(false);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
}

// A blanket multiplier on every vertex alpha, so one mesh can be drawn a
// second time as a faint ghost of itself - which is all a reflection is.
export const setDim = (v) => gl.uniform1f(loc.dim, v);

// A planar reflection needs a MASK. A mirror image floating beside the
// track - out over a gap, past the edge, in the empty air - is worse than
// no mirror at all. So the deck marks the stencil buffer as it draws, and
// the reflected pass lands only where the deck itself appeared on screen.
// The deck is drawn after the solids and tests depth, so a stretch of it
// hidden behind the scenery marks nothing and reflects nothing.
//   1 write the mask (the deck pass)   2 test it (the mirror pass)   0 off
export function mask(m) {
  if (!m) { gl.disable(gl.STENCIL_TEST); return; }
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(m === 1 ? gl.ALWAYS : gl.EQUAL, 1, 255);
  gl.stencilOp(gl.KEEP, gl.KEEP, m === 1 ? gl.REPLACE : gl.KEEP);
}

// Mirror through the plane (point q, unit normal n): x - 2(n.x - n.q)n.
// Handed the deck's own normal, so the mirror rolls through a corkscrew
// with the road instead of staying politely horizontal.
export function reflector(q, n) {
  const [a, b, c] = n, d = 2 * (a * q[0] + b * q[1] + c * q[2]);
  return [
    1 - 2 * a * a, -2 * a * b, -2 * a * c, 0,
    -2 * b * a, 1 - 2 * b * b, -2 * b * c, 0,
    -2 * c * a, -2 * c * b, 1 - 2 * c * c, 0,
    d * a, d * b, d * c, 1,
  ];
}

// Interleaved pos3/normal3/color3/alpha1. `dynamic` meshes re-upload each
// frame (the braid); everything else is built once at round start.
export function createMesh(arr, dynamic) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  return { b, n: arr.length / 10, dynamic };
}

// Accepts a preallocated Float32Array plus a float count, so the per-frame
// mesh (the rainbow) can be rebuilt with no allocation at all - a few
// hundred KB of fresh arrays every frame is a GC hitch waiting to happen.
export function updateMesh(m, arr, count) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
  const n = count === undefined ? arr.length : count;
  gl.bufferData(gl.ARRAY_BUFFER, ArrayBuffer.isView(arr) ? arr.subarray(0, n) : new Float32Array(arr), gl.DYNAMIC_DRAW);
  m.n = n / 10;
}

export function drawMesh(m, model) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
  gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 40, 0);
  gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 40, 12);
  gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, 40, 24);
  gl.vertexAttribPointer(loc.a, 1, gl.FLOAT, false, 40, 36);
  gl.enableVertexAttribArray(loc.p);
  gl.enableVertexAttribArray(loc.n);
  gl.enableVertexAttribArray(loc.c);
  gl.enableVertexAttribArray(loc.a);
  gl.uniformMatrix4fv(loc.md, false, model);
  gl.drawArrays(gl.TRIANGLES, 0, m.n);
}

// --- the little linear algebra this game actually needs ------------------
export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), d = near - far;
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / d, -1, 0, 0, 2 * far * near / d, 0];
}

// General up vector, because the camera rolls with the track now - a
// corkscrew is only a corkscrew if the horizon turns with you.
export function lookAt(eye, at, up = [0, 1, 0]) {
  let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
  const zl = Math.hypot(zx, zy, zz);
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ];
}

export function mul(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  }
  return o;
}

// translate * rotateY - for things that spin in place (pillars, shards).
export function modelTR(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw) * s, si = Math.sin(yaw) * s;
  return [c, 0, -si, 0, 0, s, 0, 0, si, 0, c, 0, x, y, z, 1];
}

// Full-frame model matrix: the rider is glued to the track's moving frame
// (side/up/forward), so it corkscrews when the track does.
export function modelFrame(p, X, Y, Z, s) {
  return [
    X[0] * s, X[1] * s, X[2] * s, 0,
    Y[0] * s, Y[1] * s, Y[2] * s, 0,
    Z[0] * s, Z[1] * s, Z[2] * s, 0,
    p[0], p[1], p[2], 1,
  ];
}

// Axis-aligned box into an interleaved array: center, full sizes, color.
// `a` matters for additive boxes: front+back faces SUM, so alpha 1 clamps
// any colour to white - a coloured glow box needs a low alpha.
export function pushBox(v, cx, cy, cz, sx, sy, sz, r, g, b, a = 1) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const F = [
    [[1, 0, 0], [x, -y, -z, x, y, -z, x, y, z, x, -y, z]],
    [[-1, 0, 0], [-x, -y, z, -x, y, z, -x, y, -z, -x, -y, -z]],
    [[0, 1, 0], [-x, y, -z, -x, y, z, x, y, z, x, y, -z]],
    [[0, -1, 0], [-x, -y, z, -x, -y, -z, x, -y, -z, x, -y, z]],
    [[0, 0, 1], [-x, -y, z, x, -y, z, x, y, z, -x, y, z]],
    [[0, 0, -1], [x, -y, -z, -x, -y, -z, -x, y, -z, x, y, -z]],
  ];
  for (const [n, q] of F) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      v.push(cx + q[i * 3], cy + q[i * 3 + 1], cz + q[i * 3 + 2], n[0], n[1], n[2], r, g, b, a);
    }
  }
}
