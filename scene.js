import * as THREE from './vendor/three.module.min.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'});
} catch (e) {
  window.dispatchEvent(new Event('nis:gl-ready'));
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 500);
scene.add(camera);

// ---------------- lights ----------------
scene.add(new THREE.HemisphereLight(0xcfd9ff, 0x1a1410, .9));
const sun = new THREE.DirectionalLight(0xfff4e6, 2.6);
sun.position.set(-30, 40, 18);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x7f9cff, 1.1);
rim.position.set(35, 15, -30);
scene.add(rim);

// ---------------- noise ----------------
function hash(x, y){ const s = Math.sin(x*127.1 + y*311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y){
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf*xf*(3 - 2*xf), v = yf*yf*(3 - 2*yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a)*u + (c - a)*v + (a - b - c + d)*u*v;
}
function fbm(x, y, o = 5){ let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++){ s += a*vnoise(x*f, y*f); f *= 2.03; a *= .5; } return s; }
function ridged(x, y){ let s = 0, a = .5, f = 1; for (let i = 0; i < 5; i++){ s += a*(1 - Math.abs(vnoise(x*f, y*f)*2 - 1)); f *= 2.1; a *= .5; } return s; }
const smax = (a, b, k = 2) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h*h*k*.25; };
function peak(x, z, cx, cz, h, R, rAmp, ph){
  const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
  const RR = R * (1 + rAmp * Math.pow(Math.abs(Math.cos(1.5*(ang - ph))), 4));
  return h * Math.pow(Math.max(0, 1 - r / RR), 1.6);
}

// Everest massif in a 60×60 block (x = east, z = south)
const P = {ev: [0, -4], lh: [3, 2], nu: [-6, 5], ch: [-1, -14], bc: [-13, 17]};
function H(x, z){
  let h = 0;
  h = smax(h, peak(x, z, ...P.ev, 17, 22, .55, .4));
  h = smax(h, peak(x, z, ...P.lh, 15, 15, .5, 1.3));
  h = smax(h, peak(x, z, ...P.nu, 12.5, 13, .6, 2.2));
  h = smax(h, peak(x, z, ...P.ch, 11.5, 14, .4, .9));
  h = smax(h, peak(x, z, 18, -6, 10, 14, .4, .2));
  h = smax(h, peak(x, z, -20, -10, 9, 14, .4, 1.7));
  h = smax(h, peak(x, z, 17, 17, 8, 14, .4, 2.6));
  h = smax(h, peak(x, z, -24, 22, 6, 11, .4, .5));
  h = smax(h, peak(x, z, 22, -22, 8, 12, .4, 1.1));
  h = smax(h, peak(x, z, -14, -24, 7, 12, .4, 2.0));
  const m = Math.min(h / 17, 1);
  h += (ridged(x*.16 + 4, z*.16 + 9) - .5) * 4.2 * (.35 + m);
  h += (fbm(x*.5, z*.5, 3) - .5) * .8;
  h += 2.2 + fbm(x*.06 + 3, z*.06 + 1, 3) * 2;
  return h;
}

// ---------------- terrain block ----------------
const block = new THREE.Group();
scene.add(block);
const HALF = 30, BOTTOM = -6, SEG = innerWidth < 820 ? 160 : 240;

{ // top surface
  const g = new THREE.PlaneGeometry(HALF*2, HALF*2, SEG, SEG);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const SNOW = new THREE.Color(0xf1f3f7), GLAC = new THREE.Color(0xc3ccd8), ROCK = new THREE.Color(0x7b7064),
        ROCK2 = new THREE.Color(0x534a42), MOR = new THREE.Color(0x8f867a);
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
    const line = 8.5 + (fbm(x*.25, z*.25, 3) - .5) * 5;
    if (y > line && ny > .66 || y > line + 5 && ny > .5) c.copy(SNOW);
    else if (y < 5.2 && ny > .82) c.copy(GLAC).lerp(MOR, fbm(x*.9, z*.3, 3) > .55 ? .6 : 0);
    else c.copy(ny < .6 ? ROCK2 : ROCK).lerp(SNOW, Math.max(0, (ny - .8)) * 1.5);
    c.offsetHSL(0, 0, (fbm(x*1.3, z*1.3, 2) - .5) * .08);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  block.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors: true, roughness: .95, metalness: 0})));
}
{ // layered soil sides
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512;
  const x = cv.getContext('2d');
  const bands = ['#3f2c20', '#7b5136', '#94613f', '#6f4830', '#a26c45', '#835638', '#6a432c', '#9a6644', '#5c3b28', '#8a5a3b'];
  let yy = 512, i = 0;
  while (yy > 0){ const h = 22 + hash(i, 3) * 46; x.fillStyle = bands[i % bands.length]; x.fillRect(0, yy - h, 4, h); yy -= h; i++; }
  x.fillStyle = '#3a2a1e'; x.fillRect(0, 0, 4, 10);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const pos = [], uv = [], idx = [];
  const edges = [t => [-HALF + t*60, HALF], t => [HALF, HALF - t*60], t => [HALF - t*60, -HALF], t => [-HALF, -HALF + t*60]];
  let base = 0;
  for (const f of edges){
    for (let k = 0; k <= SEG; k++){
      const t = k / SEG, [px, pz] = f(t), py = H(px, pz);
      pos.push(px, py, pz, px, BOTTOM, pz);
      uv.push(t, (py - BOTTOM) / 22, t, 0);
    }
    for (let k = 0; k < SEG; k++){ const a = base + k*2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    base += (SEG + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  block.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({map: tex, roughness: 1, side: THREE.DoubleSide})));
  const bot = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({color: 0x2a1d14}));
  bot.rotation.x = Math.PI / 2; bot.position.y = BOTTOM; block.add(bot);
}

// ---------------- route + markers ----------------
const routeXZ = new THREE.CatmullRomCurve3([[-13,17],[-10.5,13.5],[-8,10.5],[-5.5,8.2],[-3,6.2],[-1,4],[.8,2],[1.6,.2],[1.4,-1.4],[.8,-2.8],[0,-4]]
  .map(([x, z]) => new THREE.Vector3(x, 0, z)));
const routePts = routeXZ.getSpacedPoints(260).map(v => new THREE.Vector3(v.x, H(v.x, v.z) + .3, v.z));
const route = new THREE.CatmullRomCurve3(routePts);
const ORANGE = 0xff8a1f;
const routeGeo = new THREE.TubeGeometry(route, 400, .22, 8);
const routeIdx = routeGeo.index.count;
block.add(new THREE.Mesh(routeGeo, new THREE.MeshBasicMaterial({color: ORANGE})));
const head = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), new THREE.MeshBasicMaterial({color: 0xffffff}));
block.add(head);
const basePin = new THREE.Group();
{
  const s = new THREE.Mesh(new THREE.SphereGeometry(.9, 20, 14), new THREE.MeshBasicMaterial({color: ORANGE}));
  s.position.y = 2.4; basePin.add(s);
  const c = new THREE.Mesh(new THREE.ConeGeometry(.62, 1.7, 20), new THREE.MeshBasicMaterial({color: ORANGE}));
  c.rotation.x = Math.PI; c.position.y = 1.15; basePin.add(c);
  const d = new THREE.Mesh(new THREE.CircleGeometry(.35, 16), new THREE.MeshBasicMaterial({color: 0xffffff}));
  d.position.set(0, 2.4, .91); basePin.add(d);
  basePin.position.set(P.bc[0], H(...P.bc), P.bc[1]);
  block.add(basePin);
}
{ // summit flag
  const f = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3, 6), new THREE.MeshBasicMaterial({color: 0xffffff}));
  pole.position.y = 1.5; f.add(pole);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({color: ORANGE, side: THREE.DoubleSide}));
  fl.position.set(.95, 2.4, 0); f.add(fl);
  f.position.set(P.ev[0], H(...P.ev), P.ev[1]);
  block.add(f);
}
const LABELS = ['ev', 'lh', 'nu', 'ch', 'bc'].map(k => ({
  el: document.querySelector(`[data-lb="${k}"]`),
  minor: k === 'lh' || k === 'ch' || k === 'nu', v: new THREE.Vector3(P[k][0], H(...P[k]) + (k === 'bc' ? 4.2 : 1.6), P[k][1])
}));

// ---------------- gear models ----------------
function ropeTex(){
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8481c'; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 64; i += 4){ g.fillStyle = i % 8 ? '#d23d14' : '#f25a26'; g.fillRect(0, i, 256, 2); }   // braid ribs
  g.strokeStyle = '#c9e04a'; g.lineWidth = 3;                                                          // zig-zag tracer
  for (const off of [0, 32]){ g.beginPath(); for (let x = 0; x <= 256; x += 32){ g.lineTo(x, off + (x / 32 % 2 ? 26 : 6)); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const MAT = {
  clay: new THREE.MeshStandardMaterial({color: 0xdcd7ce, roughness: .92}),
  clay2: new THREE.MeshStandardMaterial({color: 0xb9b3a8, roughness: .95, flatShading: true}),
  face: new THREE.MeshStandardMaterial({color: 0xc8c2b8, roughness: .7}),
  red: new THREE.MeshStandardMaterial({color: 0xd1201c, roughness: .38, metalness: .35}),
  helmRed: new THREE.MeshStandardMaterial({color: 0xe0182b, roughness: .35}),
  black: new THREE.MeshStandardMaterial({color: 0x17181c, roughness: .55, metalness: .3}),
  matte: new THREE.MeshStandardMaterial({color: 0x1b1c20, roughness: .95}),
  steel: new THREE.MeshStandardMaterial({color: 0xc6ccd6, roughness: .3, metalness: .9}),
  orange: new THREE.MeshStandardMaterial({color: 0xff6a1f, roughness: .45, metalness: .5})
};
const RT = ropeTex();
const UP = new THREE.Vector3(0, 1, 0);
function limb(a, b, r, mat){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(d.length(), .01), 6, 14), mat);
  m.position.copy(A).add(B).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}
const tube = (pts, r, mat, seg = 60) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 8), mat);
function extrude(shape, depth, mat, bevel = .012){
  const g = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 24});
  g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, mat);
}

// technical ice axe: curved red shaft with slots, serrated black pick, black grip with trigger rest
function iceAxe(){
  const g = new THREE.Group();
  const C = new THREE.CatmullRomCurve3([[-.42, 1.12], [-.05, .8], [.24, .25], [.36, -.35], [.3, -.85], [.18, -1.25]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const N = 60, L = [], Rr = [];
  for (let i = 0; i <= N; i++){
    const t = i / N, p = C.getPoint(t), tg = C.getTangent(t), nx = -tg.y, ny = tg.x;
    const w = t < .72 ? .085 - t*.012 : .12;
    L.push(new THREE.Vector2(p.x + nx*w, p.y + ny*w)); Rr.push(new THREE.Vector2(p.x - nx*w, p.y - ny*w));
  }
  const outline = (a, b) => new THREE.Shape(L.slice(a, b + 1).concat(Rr.slice(a, b + 1).reverse()));
  const shaft = outline(2, 44);
  for (const [a, b] of [[8, 18], [22, 34]]){
    const pts = [];
    for (let i = a; i <= b; i++){ const t = i / N, p = C.getPoint(t), tg = C.getTangent(t); pts.push(new THREE.Vector2(p.x - tg.y*.03, p.y + tg.x*.03)); }
    for (let i = b; i >= a; i--){ const t = i / N, p = C.getPoint(t), tg = C.getTangent(t); pts.push(new THREE.Vector2(p.x + tg.y*.03, p.y - tg.x*.03)); }
    shaft.holes.push(new THREE.Path(pts));
  }
  g.add(extrude(shaft, .07, MAT.red));
  g.add(extrude(outline(43, 60), .15, MAT.black, .02));
  { const t = C.getPoint(.7), s = new THREE.Shape();
    s.moveTo(t.x - .02, t.y + .02); s.lineTo(t.x - .26, t.y + .02); s.lineTo(t.x - .3, t.y - .06); s.lineTo(t.x - .2, t.y - .04); s.lineTo(t.x - .02, t.y - .1);
    g.add(extrude(s, .1, MAT.black)); }
  { const e = C.getPoint(1), s = new THREE.Shape();
    s.moveTo(e.x - .13, e.y + .05); s.lineTo(e.x + .12, e.y + .03); s.lineTo(e.x + .02, e.y - .22); s.lineTo(e.x - .08, e.y - .1);
    g.add(extrude(s, .1, MAT.steel)); }
  { const s = new THREE.Shape(); const hx = -.42, hy = 1.12;
    s.moveTo(hx + .05, hy + .1);
    s.quadraticCurveTo(hx - .35, hy + .02, hx - .72, hy - .62);
    s.lineTo(hx - .66, hy - .6);
    for (let i = 0; i <= 9; i++){ const t = i / 9, bx = hx - .66 + t*.6, by = hy - .6 + Math.pow(t, .8)*.52; s.lineTo(bx, by); s.lineTo(bx + .02, by - .05); }
    s.lineTo(hx + .1, hy - .05);
    g.add(extrude(s, .045, MAT.black)); }
  { const s = new THREE.Shape(); const hx = -.4, hy = 1.16;
    s.moveTo(hx - .05, hy + .02); s.lineTo(hx + .32, hy + .3);
    for (let i = 0; i < 5; i++){ s.lineTo(hx + .3 - i*.07, hy + .24 - i*.04); s.lineTo(hx + .27 - i*.07, hy + .28 - i*.04); }
    s.lineTo(hx + .02, hy - .05);
    g.add(extrude(s, .045, MAT.black)); }
  for (const [x, y] of [[-.4, 1.08], [-.22, .97], [-.32, 1.18]]){
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .1, 10), MAT.steel);
    b.rotation.x = Math.PI / 2; b.position.set(x, y, 0); g.add(b);
  }
  return g;
}
function carabiner(mat){
  const pts = [[-.25,-.55],[.2,-.62],[.36,-.3],[.34,.3],[.14,.62],[-.16,.6],[-.3,.3],[-.32,-.25]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 90, .07, 14, true), mat));
  const gate = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .75, 10), MAT.steel);
  gate.position.set(-.39, .02, 0); gate.rotation.z = .08; g.add(gate);
  return g;
}
// helmet: red top cap, black vented shell, red straps with black buckle
function helmet(){
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.72, 48, 24, 0, Math.PI*2, 0, Math.PI/2), MAT.matte);
  shell.scale.set(1, .92, 1.18); g.add(shell);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.735, 48, 16, 0, Math.PI*2, 0, Math.PI*.3), MAT.helmRed);
  cap.scale.set(1, .92, 1.18); cap.rotation.x = -.18; cap.position.z = -.04; g.add(cap);
  for (let i = 0; i < 6; i++){                               // side vents
    const a = (i < 3 ? -1 : 1) * (.55 + (i % 3) * .32);
    const v = new THREE.Mesh(new THREE.BoxGeometry(.2, .07, .05), i % 3 === 1 ? MAT.helmRed : new THREE.MeshBasicMaterial({color: 0x050505}));
    v.position.set(Math.sin(a) * .7, .34, Math.cos(a) * .82);
    v.lookAt(Math.sin(a) * 2, .34, Math.cos(a) * 2.4); v.rotation.z += .5; g.add(v);
  }
  const brim = new THREE.Mesh(new THREE.TorusGeometry(.72, .025, 8, 60), MAT.matte);
  brim.rotation.x = Math.PI/2; brim.scale.set(1, 1.18, 1); g.add(brim);
  const strapMat = MAT.helmRed;
  g.add(tube([[-.66, 0, .25], [-.5, -.45, .2], [-.18, -.78, .12]], .022, strapMat, 20));
  g.add(tube([[.66, 0, .25], [.5, -.45, .2], [.18, -.78, .12]], .022, strapMat, 20));
  g.add(tube([[-.66, 0, -.35], [-.5, -.42, -.05], [-.5, -.45, .2]], .02, strapMat, 20));
  g.add(tube([[.66, 0, -.35], [.5, -.42, -.05], [.5, -.45, .2]], .02, strapMat, 20));
  g.add(tube([[-.18, -.78, .12], [0, -.84, .1], [.18, -.78, .12]], .03, MAT.matte, 12));
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, .05), MAT.black);
  buckle.position.set(.32, -.62, .17); buckle.rotation.z = .9; g.add(buckle);
  return g;
}
// mountaineer's coil: a bundle of long loops, twisted
function ropeCoil(){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({map: RT, roughness: .85});
  for (let i = 0; i < 16; i++){
    const off = (i - 7.5) * .055, depth = Math.sin(i * 1.7) * .09, pts = [];
    for (let k = 0; k < 80; k++){
      const s = k / 80 * Math.PI * 2;
      let x = Math.cos(s) * (.42 + Math.abs(Math.sin(s)) * .02) + off, y = Math.sin(s) * 1.25, z = depth;
      const pinch = 1 - .32 * Math.exp(-y*y * 6);                // waist where the coil is tied
      x *= pinch;
      const tw = y * 1.1, cx = x * Math.cos(tw) - z * Math.sin(tw), cz = x * Math.sin(tw) + z * Math.cos(tw);
      pts.push(new THREE.Vector3(cx, y, cz));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, .05, 8, true);
    const uv = geo.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * 40);
    g.add(new THREE.Mesh(geo, mat));
  }
  const wrap = [];
  for (let k = 0; k <= 60; k++){ const a = k * .55; wrap.push(new THREE.Vector3(Math.cos(a) * .36, (k / 60 - .5) * .32, Math.sin(a) * .2)); }
  const w = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wrap), 200, .05, 8), mat); g.add(w);
  g.rotation.z = -.35;
  return g;
}
// clay statue: seated climber on a faceted rock
function statue(){
  const g = new THREE.Group(), C = MAT.clay;
  const rg = new THREE.DodecahedronGeometry(1.1, 1), rp = rg.attributes.position, key = {};
  for (let i = 0; i < rp.count; i++){
    const k = [rp.getX(i), rp.getY(i), rp.getZ(i)].map(v => v.toFixed(3)).join();
    const j = key[k] || (key[k] = [hash(i, 1) - .5, hash(i, 2) - .5, hash(i, 3) - .5].map(v => v * .32));
    rp.setXYZ(i, rp.getX(i) + j[0], rp.getY(i) + j[1], rp.getZ(i) + j[2]);
  }
  rg.computeVertexNormals();
  const rock = new THREE.Mesh(rg, MAT.clay2); rock.scale.set(1, .8, .9); rock.position.y = -.82; g.add(rock);
  [
    [[-.18, .15, 0], [.18, .15, 0], .17],
    [[0, .22, -.04], [0, .82, .08], .27],
    [[.15, .12, .05], [.25, .6, .45], .12], [[.25, .6, .45], [.28, .06, .62], .1],
    [[-.15, .12, .05], [-.3, .16, .55], .12], [[-.3, .16, .55], [-.38, -.45, .76], .1],
    [[.3, .76, .05], [.36, .48, .34], .085], [[.36, .48, .34], [.26, .62, .52], .075],
    [[-.3, .76, .05], [-.42, .44, .24], .085], [[-.42, .44, .24], [-.32, .3, .5], .075]
  ].forEach(([a, b, r]) => g.add(limb(a, b, r, C)));
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.3, 28, 20), C); hood.position.set(0, 1.17, .08); hood.scale.set(1, 1.08, 1); g.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.2, 24, 16), MAT.face); face.position.set(0, 1.14, .3); face.scale.set(1, 1.05, .45); g.add(face);
  const rimH = new THREE.Mesh(new THREE.TorusGeometry(.21, .045, 10, 28), C); rimH.position.set(0, 1.14, .31); g.add(rimH);
  const pack = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .45, 6, 14), C); pack.position.set(0, .72, -.36); pack.scale.set(1.35, 1, .8); g.add(pack);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .62, 16), C); roll.rotation.z = Math.PI/2; roll.position.set(0, 1.12, -.36); g.add(roll);
  for (const [x, y, z] of [[.28, -.02, .7], [-.38, -.53, .84]]){
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .16, 4, 10), C); b.rotation.x = Math.PI/2; b.position.set(x, y, z); g.add(b);
  }
  for (const [x, y, z] of [[.26, .62, .54], [-.32, .3, .52]]){ const h = new THREE.Mesh(new THREE.SphereGeometry(.08, 14, 10), C); h.position.set(x, y, z); g.add(h); }
  g.add(tube([[-.32, .3, .52], [-.55, -.2, .85], [-.35, -.9, 1.05], [.1, -1.3, .9]], .022, C));
  g.add(tube([[-.32, .3, .52], [-.2, -.25, .95], [.25, -.75, 1.05], [.55, -1.35, .8]], .022, C));
  g.add(tube([[.26, .62, .54], [.5, .1, .75], [.62, -.5, .7], [.8, -1.2, .5]], .022, C));
  g.add(tube([[.2, .15, .25], [-.1, .1, .3], [-.3, .2, .25]], .03, C, 20));
  g.position.y = -.1;
  const w = new THREE.Group(); w.add(g); return w;
}

// floating gear, each tied to a page section (camera space)
const hud = new THREE.Group();
camera.add(hud);
const hudKey = new THREE.DirectionalLight(0xffffff, 2.2); hudKey.position.set(-3, 4, 4); camera.add(hudKey);
const carab = new THREE.Group();
{ const c1 = carabiner(MAT.orange), c2 = carabiner(MAT.steel); c1.position.x = -.25; c2.position.x = .25; c2.rotation.z = .5; c1.rotation.y = .6; carab.add(c1, c2); carab.scale.setScalar(1.25); }
const ITEMS = [
  {obj: statue(), sec: 'about', side: 1, scale: 1.15, wobble: true},
  {obj: iceAxe(), sec: 'team', side: -1, scale: 1.2, wobble: true},
  {obj: carab, sec: 'ach', side: 1, scale: 1, spin: .7},
  {obj: helmet(), sec: 'gallery', side: -1, scale: 1.15, spin: .45, tilt: .35},
  {obj: ropeCoil(), sec: 'join', side: 1, scale: .95, spin: .35}
];
ITEMS.forEach(it => { it.el = document.getElementById(it.sec); it.obj.visible = false; hud.add(it.obj); });

// ---------------- loop ----------------
let W = 0, Hh = 0, aspect = 1;
function resize(){
  W = innerWidth; Hh = innerHeight;
  renderer.setSize(W, Hh, false);
  aspect = W / Hh; camera.aspect = aspect;
  camera.fov = aspect < .8 ? 44 : 30;
  camera.updateProjectionMatrix();
}
resize(); addEventListener('resize', resize);

let mx = 0, my = 0, sx = 0, sy = 0, sp = 0, hp = 0, introT = null;
addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
addEventListener('nis:intro', () => { introT = performance.now(); });

const clamp = v => Math.min(Math.max(v, 0), 1);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const t0 = performance.now();
let lastT = t0, first = true;
const v3 = new THREE.Vector3();

function render(now){
  const t = (now - t0) / 1000, dt = Math.min((now - lastT) / 1000, .05); lastT = now;
  const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  const p = clamp(scrollY / max), h = clamp(scrollY / innerHeight);
  const f = reduced ? 1 : 1 - Math.pow(.002, dt);
  sp += (p - sp) * f; hp += (h - hp) * f;
  sx += (mx - sx) * .05; sy += (my - sy) * .05;
  const ik = reduced ? 1 : introT ? easeOut(clamp((now - introT) / 2000)) : 0;
  const phone = aspect < .8;

  // camera: fixed 3/4 view from above, like a relief model on a table
  const dist = phone ? 128 : 92;
  camera.position.set(0, dist * .56, dist * .83);
  camera.lookAt(0, phone ? 9 : 9.5, 0);

  // block: rotates with scroll, sinks below after the hero
  block.rotation.y = Math.PI/4 - .25 + sp * 1.5 + (reduced ? 0 : Math.sin(t * .12) * .06) + sx * .2 + (1 - ik) * .7;
  block.rotation.x = sy * .05;
  block.position.y = -hp * (phone ? 110 : 22) - (1 - ik) * 14;
  block.scale.setScalar((phone ? .6 : .62) * (1 - hp * .1));
  block.updateMatrixWorld();

  // route grows: a bit on intro, then with the whole page scroll
  const k = Math.max(ik * .3, sp);
  routeGeo.setDrawRange(0, Math.max(6, Math.floor(routeIdx * k / 6) * 6));
  route.getPointAt(Math.max(k, .001), head.position);
  basePin.rotation.y = -block.rotation.y;

  // labels follow their peaks
  LABELS.forEach(l => {
    if (!l.el) return;
    v3.copy(l.v).applyMatrix4(block.matrixWorld).project(camera);
    const x = (v3.x * .5 + .5) * W, y = (-v3.y * .5 + .5) * Hh;
    l.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    l.el.style.opacity = phone && l.minor ? 0 : ik * clamp(1 - hp * 3);
  });

  // floating gear tied to sections
  const D = 7, halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * D, halfW = halfH * aspect, vh = innerHeight;
  ITEMS.forEach((it, i) => {
    const r = it.el.getBoundingClientRect();
    const c = phone ? r.top / vh : (r.top + r.height / 2 - vh / 2) / vh;
    const vis = phone ? clamp(1 - Math.max(-c - .35, c - .25, 0) * 2.5) : clamp(1.25 - Math.abs(c) * 1.6);
    it.obj.visible = vis > .001;
    if (!it.obj.visible) return;
    const e = easeOut(vis);
    let x, y; const s = it.scale * (phone ? .5 : 1) * (halfH / 2.6);
    if (phone){ x = 0; y = halfH * (1 - 2 * (c + .21)); }
    else { x = it.side * halfW * .5 + it.side * (1 - e) * halfW * .9; y = -c * halfH * 1.4; }
    it.obj.position.set(x, y + Math.sin(t*1.2 + i) * .08, -D);
    it.obj.scale.setScalar(s * (.6 + .4 * e));
    const spin = it.wobble ? Math.sin(t * .5) * .6 - it.side * .5 : t * it.spin;
    it.obj.rotation.set((it.tilt || 0) + Math.sin(t*.6 + i) * .12, (reduced ? -it.side * .4 : spin) + c * 2 * it.side, Math.sin(t*.8 + i) * .06);
  });

  renderer.render(scene, camera);
  if (first){ first = false; window.dispatchEvent(new Event('nis:gl-ready')); }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
