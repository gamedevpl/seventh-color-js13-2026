// Raw WebGL, one shader, hand-rolled mat4 - the whole renderer. Three.js
// costs more than this entire game's budget; a maze of boxes, a ribbon and
// one pony need exactly one program: position/normal/color, lambert light,
// distance fog. Same discipline as game one's draw.js: a thin layer the
// call sites stay readable through, not an engine.

export let gl, canvas;

const VS = `attribute vec3 p,n,c;uniform mat4 vp,md;uniform vec3 cam;
varying vec3 vc;varying float vf;
void main(){vec4 w=md*vec4(p,1.);gl_Position=vp*w;
float l=.55+.45*max(dot(normalize((md*vec4(n,0.)).xyz),normalize(vec3(.4,1.,.3))),0.);
vc=c*l;vf=clamp((length(w.xyz-cam)-7.)/20.,0.,1.);}`;
const FS = `precision mediump float;varying vec3 vc;varying float vf;uniform vec3 fog;
void main(){gl_FragColor=vec4(mix(vc,fog,vf),1.);}`;

let prog, loc = {};

export function initGL(c) {
  canvas = c;
  gl = c.getContext('webgl', { antialias: true });
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
  for (const u of ['vp', 'md', 'cam', 'fog']) loc[u] = gl.getUniformLocation(prog, u);
  for (const a of ['p', 'n', 'c']) loc[a] = gl.getAttribLocation(prog, a);
  gl.enable(gl.DEPTH_TEST);
}

export function frameGL(vp, cam, fog) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(fog[0], fog[1], fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(loc.vp, false, vp);
  gl.uniform3fv(loc.cam, cam);
  gl.uniform3fv(loc.fog, fog);
}

// Interleaved pos3/normal3/color3. `dynamic` meshes re-upload each frame
// (the braid); everything else is built once at round start.
export function createMesh(arr, dynamic) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  return { b, n: arr.length / 9, dynamic };
}

export function updateMesh(m, arr) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
  m.n = arr.length / 9;
}

export function drawMesh(m, model) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
  gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 36, 0);
  gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 36, 12);
  gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, 36, 24);
  gl.enableVertexAttribArray(loc.p);
  gl.enableVertexAttribArray(loc.n);
  gl.enableVertexAttribArray(loc.c);
  gl.uniformMatrix4fv(loc.md, false, model);
  gl.drawArrays(gl.TRIANGLES, 0, m.n);
}

// --- the little linear algebra this game actually needs ------------------
export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), d = near - far;
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / d, -1, 0, 0, 2 * far * near / d, 0];
}

export function lookAt(eye, at) {
  let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
  const zl = Math.hypot(zx, zy, zz);
  zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xz = -zx;                       // cross(up=(0,1,0), z)
  const xl = Math.hypot(xx, xz) || 1;
  xx /= xl; xz /= xl;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;   // cross(z, x)
  return [
    xx, yx, zx, 0,
    0, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ];
}

export function mul(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  }
  return o;
}

// translate * rotateY - the only model transform anything here needs.
export function modelTR(x, y, z, yaw = 0, s = 1) {
  const c = Math.cos(yaw) * s, si = Math.sin(yaw) * s;
  return [c, 0, -si, 0, 0, s, 0, 0, si, 0, c, 0, x, y, z, 1];
}

// Axis-aligned box into an interleaved array: center, full sizes, color.
export function pushBox(v, cx, cy, cz, sx, sy, sz, r, g, b) {
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
      v.push(cx + q[i * 3], cy + q[i * 3 + 1], cz + q[i * 3 + 2], n[0], n[1], n[2], r, g, b);
    }
  }
}
