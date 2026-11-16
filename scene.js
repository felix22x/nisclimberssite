import * as THREE from './vendor/three.module.min.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
} catch (e) {
  window.dispatchEvent(new Event('nis:gl-ready'));
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const NAVY = 0x050b2a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(NAVY);
scene.fog = new THREE.Fog(NAVY, 55, 150);

const camera = new THREE.PerspectiveCamera(36, 1, .1, 400);
scene.add(camera);

// ---------------- lights ----------------
scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x050b2a, .75));
const moon = new THREE.DirectionalLight(0xe6ecff, 2.4);
moon.position.set(-40, 50, 30);
scene.add(moon);
const rim = new THREE.DirectionalLight(0x6c8cff, 1.4);
rim.position.set(50, 20, -40);
scene.add(rim);
const warm = new THREE.DirectionalLight(0xffb089, .5);
warm.position.set(30, 10, 50);
scene.add(warm);

// ---------------- noise ----------------
function hash(x, y){ const s = Math.sin(x*127.1 + y*311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y){
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf*xf*(3 - 2*xf), v = yf*yf*(3 - 2*yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a)*u + (c - a)*v + (a - b - c + d)*u*v;
}
function fbm(x, y, o = 5){ let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++){ s += a*vnoise(x*f, y*f); f *= 2.03; a *= .5; } return s; }
function ridged(x, y){ let s = 0, a = .5, f = 1; for (let i = 0; i < 4; i++){ s += a*(1 - Math.abs(vnoise(x*f, y*f)*2 - 1)); f *= 2.1; a *= .5; } return s; }
const smax = (a, b, k = 3) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h*h*k*.25; };

// pyramid peak with 3 ridges
function peak(x, z, cx, cz, h, R, rAmp, ph){
  const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
  const RR = R * (1 + rAmp * Math.pow(Math.abs(Math.cos(1.5*(ang - ph))), 4));
  const k = Math.max(0, 1 - r / RR);
  return h * Math.pow(k, 1.75);
}
function height(x, z){
  let h = peak(x, z, 0, 0, 28, 30, .6, .45);           // Everest
  h = smax(h, peak(x, z, 8, -9, 19, 20, .45, 1.2));     // Lhotse
  h = smax(h, peak(x, z, -12, 7, 15.5, 18, .4, 2.1));   // Nuptse
  h = smax(h, peak(x, z, 30, 16, 12, 20, .35, .2));
  h = smax(h, peak(x, z, -34, -18, 13, 22, .35, 1.0));
  h = smax(h, peak(x, z, -48, 22, 9, 20, .3, .6));
  h = smax(h, peak(x, z, 44, -30, 14, 24, .3, 2.4));
  const m = Math.min(h / 26, 1);
  h += (ridged(x*.11 + 4, z*.11 + 9) - .5) * 5.5 * (.25 + m);
  h += (fbm(x*.4, z*.4, 3) - .5) * 1.1 * m;
  h += fbm(x*.035 + 11, z*.035 + 3, 3) * 4 - 2.4;
  return h;
}

// ---------------- terrain ----------------
const SIZE = 190, SEG = innerWidth < 820 ? 150 : 210;
let geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
geo.rotateX(-Math.PI / 2);
{
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), z = p.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (SIZE/2);
    p.setY(i, height(x, z) - Math.pow(Math.max(edge - .7, 0) / .3, 2) * 6);
  }
}
geo = geo.toNonIndexed();
geo.computeVertexNormals();
{
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const SNOW = new THREE.Color(0xeef2fb), SNOW2 = new THREE.Color(0xc9d3ee), ROCK = new THREE.Color(0x26346a),
        ROCK2 = new THREE.Color(0x161f4a), LOW = new THREE.Color(0x0b1438), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i += 3){
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    if (n.y < 0) n.negate();
    const h = (a.y + b.y + c.y) / 3, cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
    const line = 8 + (fbm(cx*.2, cz*.2, 3) - .5) * 6;
    const streak = ridged(cx*.5 + 7, cz*.5 + 2) > .62;
    if (h > line && n.y > .64 && !streak) tmp.copy(n.y > .8 ? SNOW : SNOW2);
    else if (h > line + 4 && n.y > .5 && !streak) tmp.copy(SNOW2);
    else if (h < 1.2) tmp.copy(LOW);
    else tmp.copy(n.y < .55 ? ROCK2 : ROCK);
    tmp.offsetHSL(0, 0, (hash(cx, cz) - .5) * .04);
    for (let k = 0; k < 3; k++) col.set([tmp.r, tmp.g, tmp.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: .92, metalness: 0}));
scene.add(terrain);
const SUMMIT = new THREE.Vector3(0, height(0, 0), 0);

// ---------------- summit flag ----------------
const flagGroup = new THREE.Group();
flagGroup.position.copy(SUMMIT);
const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2.4, 6), new THREE.MeshStandardMaterial({color: 0xdfe4f2, metalness: .6, roughness: .3}));
pole.position.y = 1.2; flagGroup.add(pole);
const flagGeo = new THREE.PlaneGeometry(1.6, 1, 16, 6); flagGeo.translate(.8, 0, 0);
const flagBase = flagGeo.attributes.position.array.slice();
const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({color: 0xff6a3d, side: THREE.DoubleSide, roughness: .7, flatShading: true}));
flag.position.set(.04, 1.95, 0); flagGroup.add(flag);
scene.add(flagGroup);

// ---------------- clouds ----------------
function softTex(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.45, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const soft = softTex();
const clouds = new THREE.Group();
for (let i = 0; i < 46; i++){
  const m = new THREE.SpriteMaterial({map: soft, color: 0xb9c6ee, transparent: true, opacity: .16 + Math.random()*.14, depthWrite: false, fog: true});
  const s = new THREE.Sprite(m);
  const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 40;
  s.position.set(Math.cos(a)*r, 5 + Math.random()*5, Math.sin(a)*r);
  const k = 12 + Math.random()*16; s.scale.set(k, k*.42, 1);
  s.userData = {a, r, v: (.004 + Math.random()*.006) * (Math.random() < .5 ? 1 : -1)};
  clouds.add(s);
}
scene.add(clouds);

// ---------------- stars + snow ----------------
{
  const n = 1400, pos = new Float32Array(n*3);
  for (let i = 0; i < n; i++){
    const th = Math.random()*Math.PI*2, ph = Math.random()*Math.PI*.45, r = 220;
    pos.set([Math.cos(th)*Math.sin(ph)*r, Math.cos(ph)*r*.8 + 10, Math.sin(th)*Math.sin(ph)*r], i*3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({color: 0xdfe4f2, size: .9, sizeAttenuation: true, transparent: true, opacity: .8, fog: false})));
}
const SNOWN = 1600;
const snowPos = new Float32Array(SNOWN*3), snowVel = new Float32Array(SNOWN);
for (let i = 0; i < SNOWN; i++){
  snowPos.set([(Math.random() - .5)*90, Math.random()*50, (Math.random() - .5)*90], i*3);
  snowVel[i] = .02 + Math.random()*.04;
}
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({map: soft, color: 0xffffff, size: .35, transparent: true, opacity: .85, depthWrite: false}));
scene.add(snow);

// ---------------- gear models ----------------
const M = {
  metal: new THREE.MeshStandardMaterial({color: 0xd5dcf0, metalness: .85, roughness: .28}),
  blue: new THREE.MeshStandardMaterial({color: 0x6c8cff, metalness: .55, roughness: .35}),
  orange: new THREE.MeshStandardMaterial({color: 0xff6a3d, metalness: .3, roughness: .45}),
  navy: new THREE.MeshStandardMaterial({color: 0x1e2f6b, roughness: .7, flatShading: true}),
  dark: new THREE.MeshStandardMaterial({color: 0x0d1330, roughness: .6}),
  white: new THREE.MeshStandardMaterial({color: 0xf3f5fb, roughness: .35, metalness: .05}),
  skin: new THREE.MeshStandardMaterial({color: 0xe3b48c, roughness: .8}),
  jacket: new THREE.MeshStandardMaterial({color: 0xff6a3d, roughness: .65, flatShading: true}),
  pack: new THREE.MeshStandardMaterial({color: 0x6c8cff, roughness: .6, flatShading: true}),
  glass: new THREE.MeshStandardMaterial({color: 0x9fb4ff, metalness: .9, roughness: .1})
};
const UP = new THREE.Vector3(0, 1, 0);
function limb(a, b, r, mat){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(d.length() - r*0.2, .01), 4, 10), mat);
  m.position.copy(A).add(B).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

function iceAxe(){
  const g = new THREE.Group();
  const shaft = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -1.1, 0), new THREE.Vector3(.04, -.3, 0), new THREE.Vector3(-.02, .45, 0), new THREE.Vector3(0, .95, 0)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(shaft, 40, .055, 12), M.blue));
  const grip = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -1.05, 0), new THREE.Vector3(.03, -.55, 0)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(grip, 10, .07, 12), M.dark));
  const spike = new THREE.Mesh(new THREE.ConeGeometry(.06, .25, 10), M.metal);
  spike.position.y = -1.22; spike.rotation.x = Math.PI; g.add(spike);
  const s = new THREE.Shape();
  s.moveTo(-.06, .88); s.lineTo(.34, .9); s.lineTo(.38, .8); s.lineTo(.06, .78);
  s.quadraticCurveTo(-.25, .74, -.7, .44); s.lineTo(-.62, .5);
  s.quadraticCurveTo(-.3, .82, -.06, 1.02); s.lineTo(-.06, .88);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(s, {depth: .07, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 2}), M.metal);
  head.position.z = -.035; g.add(head);
  for (let i = 0; i < 4; i++){ const t = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .08), M.metal); t.position.set(-.5 + i*.1, .5 + i*.065, 0); t.rotation.z = -.6; g.add(t); }
  return g;
}
function carabiner(mat){
  const pts = [[-.25,-.55],[.2,-.62],[.36,-.3],[.34,.3],[.14,.62],[-.16,.6],[-.3,.3],[-.32,-.25]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 90, .07, 12, true), mat));
  const gate = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .75, 8), M.metal);
  gate.position.set(-.39, .02, 0); gate.rotation.z = .08; g.add(gate);
  return g;
}
function helmet(){
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.7, 28, 16, 0, Math.PI*2, 0, Math.PI/2), M.white);
  shell.scale.set(1, .95, 1.15); g.add(shell);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(.7, .05, 8, 40), M.dark);
  brim.rotation.x = Math.PI/2; brim.scale.set(1, 1.15, 1); g.add(brim);
  for (const x of [-.25, .25]){ const v = new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .9), M.orange); v.position.set(x, .62, 0); v.rotation.z = x > 0 ? -.35 : .35; g.add(v); }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .1, 16), M.dark);
  lamp.rotation.x = Math.PI/2; lamp.position.set(0, .3, .8); g.add(lamp);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.09, 16), new THREE.MeshBasicMaterial({color: 0xfff3c4}));
  lens.position.set(0, .3, .856); g.add(lens);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(.62, .025, 6, 30, Math.PI), M.dark);
  strap.rotation.y = Math.PI/2; strap.rotation.z = Math.PI; g.add(strap);
  return g;
}
function ropeCoil(){
  const pts = [];
  for (let i = 0; i <= 420; i++){ const a = i*.11; const r = .78 + Math.sin(i*.37)*.04; pts.push(new THREE.Vector3(Math.cos(a)*r, (i/420)*.5 - .25 + Math.sin(a*3)*.02, Math.sin(a)*r*.85)); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 900, .055, 8), M.orange));
  const tie = new THREE.Mesh(new THREE.TorusGeometry(.12, .06, 8, 20), M.blue);
  tie.position.set(.82, 0, 0); tie.rotation.y = Math.PI/2; g.add(tie);
  const c = carabiner(M.blue); c.scale.setScalar(.45); c.position.set(.9, -.2, .1); g.add(c);
  return g;
}
function climber(){
  const g = new THREE.Group();
  g.add(limb([0, 1.05, 0], [0, 1.62, 0], .27, M.jacket));                // torso
  g.add(limb([.15, .98, 0], [.24, .58, .26], .12, M.navy));              // thigh R
  g.add(limb([.24, .58, .26], [.22, .12, .16], .1, M.navy));             // shin R
  g.add(limb([-.15, .98, 0], [-.26, .6, -.12], .12, M.navy));            // thigh L
  g.add(limb([-.26, .6, -.12], [-.26, .12, -.3], .1, M.navy));           // shin L
  for (const [x, z] of [[.22, .22], [-.26, -.24]]){ const b = new THREE.Mesh(new THREE.BoxGeometry(.2, .14, .34), M.dark); b.position.set(x, .06, z); g.add(b); }
  g.add(limb([.3, 1.58, 0], [.46, 1.92, .12], .085, M.jacket));          // upper arm R (raised)
  g.add(limb([.46, 1.92, .12], [.42, 2.32, .2], .075, M.jacket));        // forearm R
  g.add(limb([-.3, 1.58, 0], [-.5, 1.3, .16], .085, M.jacket));          // upper arm L
  g.add(limb([-.5, 1.3, .16], [-.44, 1.02, .32], .075, M.jacket));       // forearm L
  const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 16, 12), M.skin); head.position.set(0, 1.94, .02); g.add(head);
  const hel = new THREE.Mesh(new THREE.SphereGeometry(.215, 16, 10, 0, Math.PI*2, 0, Math.PI/2), M.white); hel.position.set(0, 1.97, .01); g.add(hel);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(.3, .08, .06), M.glass); goggles.position.set(0, 1.95, .19); g.add(goggles);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.48, .66, .28), M.pack); pack.position.set(0, 1.38, -.3); g.add(pack);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .52, 10), M.orange); roll.rotation.z = Math.PI/2; roll.position.set(0, 1.76, -.3); g.add(roll);
  const harness = new THREE.Mesh(new THREE.TorusGeometry(.26, .04, 6, 20), M.dark); harness.rotation.x = Math.PI/2; harness.position.y = 1.02; g.add(harness);
  const axe = iceAxe(); axe.scale.setScalar(.42); axe.position.set(.42, 2.6, .2); axe.rotation.set(.2, -.5, .25); g.add(axe);
  for (const [x, y, z] of [[.42, 2.32, .2], [-.44, 1.0, .32]]){ const h = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), M.dark); h.position.set(x, y, z); g.add(h); }
  const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.02, .2), new THREE.Vector3(.2, .7, .5), new THREE.Vector3(.1, .2, .7), new THREE.Vector3(-.3, -.5, .6)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(rope, 30, .03, 6), M.orange));
  g.position.y = -1.2;
  const w = new THREE.Group(); w.add(g); return w;
}

// floating gear, each tied to a page section; positions in camera space
const hud = new THREE.Group();
camera.add(hud);
const axes = new THREE.Group();
{ const a1 = iceAxe(), a2 = iceAxe(); a1.rotation.z = .5; a2.rotation.z = -.5; a2.rotation.y = Math.PI; a1.position.x = -.25; a2.position.x = .25; axes.add(a1, a2); }
const carab = new THREE.Group();
{ const c1 = carabiner(M.orange), c2 = carabiner(M.blue); c1.position.x = -.25; c2.position.x = .25; c2.rotation.z = .5; c1.rotation.y = .6; carab.add(c1, c2); carab.scale.setScalar(1.25); }
const ITEMS = [
  {obj: climber(), sec: 'about', side: 1, scale: 1.05, spin: .25},
  {obj: axes, sec: 'team', side: -1, scale: 1.05, spin: .5},
  {obj: carab, sec: 'ach', side: 1, scale: 1, spin: .7},
  {obj: helmet(), sec: 'gallery', side: -1, scale: 1.1, spin: .45, tilt: .5},
  {obj: ropeCoil(), sec: 'join', side: 1, scale: 1.25, spin: .35, tilt: .9}
];
ITEMS.forEach(it => { it.el = document.getElementById(it.sec); it.obj.visible = false; hud.add(it.obj); });
const hudLight = new THREE.PointLight(0xffffff, 6, 20); hudLight.position.set(2, 3, 2); hud.add(hudLight);

// ---------------- camera path ----------------
const CAM = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 15, 84), new THREE.Vector3(30, 17, 60), new THREE.Vector3(44, 20, 18),
  new THREE.Vector3(18, 26, -32), new THREE.Vector3(-26, 30, -22), new THREE.Vector3(-14, SUMMIT.y + 5, 9)
]);
const LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 21, 0), new THREE.Vector3(0, 16, 0), new THREE.Vector3(0, 16, 0),
  new THREE.Vector3(0, 19, 0), new THREE.Vector3(0, 22, 0), new THREE.Vector3(0, SUMMIT.y + 1.6, 0)
]);

// ---------------- loop ----------------
let W = 0, H = 0, aspect = 1;
function resize(){
  W = innerWidth; H = window.visualViewport ? Math.max(innerHeight, document.documentElement.clientHeight) : innerHeight;
  renderer.setSize(W, H, false);
  aspect = W / H; camera.aspect = aspect;
  camera.fov = aspect < .8 ? 52 : 36;
  camera.updateProjectionMatrix();
}
resize(); addEventListener('resize', resize);

let mx = 0, my = 0, sx = 0, sy = 0, sp = 0, introT = null;
addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
addEventListener('nis:intro', () => { introT = performance.now(); });

const pos = new THREE.Vector3(), look = new THREE.Vector3();
const clamp = v => Math.min(Math.max(v, 0), 1);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const t0 = performance.now();
let lastT = t0, first = true;

function render(now){
  const t = (now - t0) / 1000, dt = Math.min((now - lastT) / 1000, .05); lastT = now;
  const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  const p = clamp(scrollY / max);
  sp += (p - sp) * (reduced ? 1 : 1 - Math.pow(.001, dt));
  sx += (mx - sx) * .05; sy += (my - sy) * .05;

  // intro: camera dolly in from far and low
  const ik = reduced ? 1 : introT ? easeOut(clamp((now - introT) / 2200)) : 0;
  CAM.getPoint(sp, pos); LOOK.getPoint(sp, look);
  const narrow = aspect < .8 ? 1.25 : 1;
  pos.sub(look).multiplyScalar(narrow * (1 + (1 - ik) * .45)).add(look);
  pos.y -= (1 - ik) * 6;
  const orbit = reduced ? 0 : Math.sin(t * .08) * 2.5;
  pos.x += orbit + sx * 4; pos.y += -sy * 2;
  camera.position.copy(pos); camera.lookAt(look);

  // clouds drift
  clouds.children.forEach(s => { s.userData.a += s.userData.v * dt * (reduced ? 0 : 1); s.position.x = Math.cos(s.userData.a) * s.userData.r; s.position.z = Math.sin(s.userData.a) * s.userData.r; });

  // snow
  if (!reduced){
    const a = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOWN; i++){
      a[i*3 + 1] -= snowVel[i] * dt * 60;
      a[i*3] += Math.sin(t + i) * .01;
      if (a[i*3 + 1] < 0) a[i*3 + 1] = 50;
    }
    snowGeo.attributes.position.needsUpdate = true;
    snow.position.set(camera.position.x * .6, 0, camera.position.z * .6);
  }

  // flag wave
  const fa = flagGeo.attributes.position.array;
  for (let i = 0; i < fa.length; i += 3){ const x = flagBase[i]; fa[i + 2] = Math.sin(x*3.2 - t*5) * .12 * x; }
  flagGeo.attributes.position.needsUpdate = true; flagGeo.computeVertexNormals();

  // floating gear tied to sections
  const dist = 7, halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * aspect;
  const vh = innerHeight;
  ITEMS.forEach((it, i) => {
    const r = it.el.getBoundingClientRect();
    const phone = aspect < .8;
    const c = phone ? r.top / vh : (r.top + r.height / 2 - vh / 2) / vh;   // phone: 0 when section top hits the top
    const vis = phone ? clamp(1 - Math.max(-c - .35, c - .25, 0) * 2.5) : clamp(1.25 - Math.abs(c) * 1.6);
    it.obj.visible = vis > .001;
    if (!it.obj.visible) return;
    const e = easeOut(vis);
    let x, y, s = it.scale * (phone ? .5 : 1) * (halfH / 2.6);
    if (phone){ x = 0; y = halfH * (1 - 2 * (c + .21)); }
    else { x = it.side * halfW * .5 + it.side * (1 - e) * halfW * .9; y = -c * halfH * 1.4; }
    it.obj.position.set(x, y + Math.sin(t*1.2 + i) * .08, -dist);
    it.obj.scale.setScalar(s * (.6 + .4 * e));
    it.obj.rotation.set((it.tilt || 0) * .4 + Math.sin(t*.6 + i) * .15, (reduced ? 0 : t * it.spin) + c * 2.2 * it.side, Math.sin(t*.8 + i) * .08);
  });

  renderer.render(scene, camera);
  if (first){ first = false; window.dispatchEvent(new Event('nis:gl-ready')); }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
