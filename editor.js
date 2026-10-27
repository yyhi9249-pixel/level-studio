import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = id => document.getElementById(id);

/* ---------- projects (saved in this browser) ---------- */
const KEY = 'levelstudio.projects.v1';
let projects = [];
try { projects = JSON.parse(localStorage.getItem(KEY)) || []; } catch { projects = []; }
const writeStore = () => { try { localStorage.setItem(KEY, JSON.stringify(projects)); return true; } catch { return false; } };
let current = null, tpl = null, thumbData = null;

function renderList() {
  const ul = $('projectList');
  ul.innerHTML = '';
  if (!projects.length) { ul.innerHTML = '<li class="empty">No projects yet. Name a level above and press New project.</li>'; return; }
  [...projects].sort((a, b) => b.updated - a.updated).forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><span class="meta"></span>';
    li.querySelector('.name').textContent = p.name;
    li.querySelector('.meta').textContent = p.blocks.length + ' blocks';
    const open = document.createElement('button'); open.textContent = 'Open'; open.className = 'primary';
    open.onclick = () => openProject(p.id);
    const del = document.createElement('button'); del.textContent = 'Delete';
    del.onclick = () => { if (confirm('Delete "' + p.name + '"? This cannot be undone.')) { projects = projects.filter(x => x.id !== p.id); writeStore(); renderList(); } };
    const ren = document.createElement('button'); ren.textContent = 'Rename'; ren.onclick = () => { const n = prompt('Project name', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 40); writeStore(); renderList(); } };
    li.append(open, ren, del);
    ul.append(li);
  });
}

async function createProject() {
  const name = $('newName').value.trim() || 'Untitled level';
  if (tpl) { await importLevel(new File([tpl], 'new.level')); if (current) { current.name = name; $('projName').textContent = name; saveNow(); } $('newName').value = ''; return; }
  const p = { id: Date.now().toString(36), name, blocks: [{ s: 'Start', m: '', p: [0, 0.5, 0], sc: [1, 1, 1] }], updated: Date.now() };
  projects.push(p); writeStore();
  $('newName').value = '';
  openProject(p.id);
}
$('createBtn').onclick = createProject;
$('newName').addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });
$('homeBtn').onclick = () => { saveNow(); $('editor').hidden = true; $('home').hidden = false; renderList(); };

/* ---------- textures (drawn in code, no image files needed) ---------- */
// g = the GRAB material name used on export. Looks are my own approximations.
const MATS = {
  'Default':      { g: 'DEFAULT',             c: '#8d8f94', k: 'bricks' },
  'Grabbable':    { g: 'GRABBABLE',           c: '#d9a441', k: 'noise' },
  'Ice':          { g: 'ICE',                 c: '#9fdcf2', k: 'noise', o: 0.85 },
  'Lava':         { g: 'LAVA',                c: '#e8460f', k: 'lava' },
  'Wood':         { g: 'WOOD',                c: '#a0713f', k: 'planks' },
  'Grapple':      { g: 'GRAPPLABLE',          c: '#4f8fd6', k: 'grid' },
  'Grapple lava': { g: 'GRAPPLABLE_LAVA',     c: '#a83a8c', k: 'lava' },
  'Crumbling':    { g: 'GRABBABLE_CRUMBLING', c: '#b9a27a', k: 'bricks' },
  'Colored':      { g: 'DEFAULT_COLORED',     c: '#e5e5e5', k: 'noise' },
  'Bouncing':     { g: 'BOUNCING',            c: '#ee6aa7', k: 'noise' },
  'Snow':         { g: 'SNOW',                c: '#f2f6fa', k: 'noise' }
};
const SHAPES = {
  Cube: () => new THREE.BoxGeometry(1, 1, 1),
  Sphere: () => new THREE.SphereGeometry(0.5, 24, 16),
  Cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  Cone: () => new THREE.ConeGeometry(0.5, 1, 24),
  Pyramid: () => new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4),
  Prism: () => new THREE.CylinderGeometry(0.5774, 0.5774, 1, 3).rotateX(Math.PI / 2)
};
const SHAPE_ENUM = { Cube: 'CUBE', Sphere: 'SPHERE', Cylinder: 'CYLINDER', Cone: 'CONE', Pyramid: 'PYRAMID', Prism: 'PRISM' };
// special blocks (placeable now, behaviour comes later)
const SPECIALS = {
  Start:    { c: 0x3ecf6e, geo: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24), o: 0.8 },
  Finish:   { c: 0xe84040, geo: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24), o: 0.8 },
  Trigger:  { c: 0xa65cff, geo: () => new THREE.BoxGeometry(1, 1, 1), o: 0.4 },
  Gravity:  { c: 0x38c8e8, geo: () => new THREE.SphereGeometry(0.5, 16, 12), o: 0.4 },
  Particle: { c: 0xff7ad9, geo: () => new THREE.SphereGeometry(0.3, 12, 8), o: 0.9 },
  Code:     { c: 0xcccccc, geo: () => new THREE.BoxGeometry(1, 1, 1), o: 0.4 },
  Sound:    { c: 0xffa94d, geo: () => new THREE.SphereGeometry(0.35, 16, 12), o: 0.9 },
  Light:    { c: 0xfff3a0, geo: () => new THREE.SphereGeometry(0.25, 16, 12), o: 1 }
};
SPECIALS.Sign = { c: 0xffffff, geo: () => new THREE.BoxGeometry(1, 1, 0.1), o: 1 };
const geoFor = s => (SHAPES[s] || SPECIALS[s].geo)();
const specCache = {};
const specMat = s => specCache[s] || (specCache[s] = new THREE.MeshStandardMaterial({ color: SPECIALS[s].c, transparent: true, opacity: SPECIALS[s].o, depthWrite: false }));

function drawTex(m) {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = m.c; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = (Math.random() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (Math.random() * 0.14) + ')';
    g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3;
  if (m.k === 'bricks') for (let r = 0; r < 4; r++) {
    g.beginPath(); g.moveTo(0, r * 32); g.lineTo(s, r * 32);
    for (let x = (r % 2) * 32; x < s; x += 64) { g.moveTo(x, r * 32); g.lineTo(x, r * 32 + 32); }
    g.stroke();
  }
  if (m.k === 'planks') for (let x = 0; x < s; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
  if (m.k === 'grid') { g.strokeRect(2, 2, s - 4, s - 4); g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke(); }
  if (m.k === 'lava') {
    g.strokeStyle = '#ffd23a'; g.lineWidth = 5;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(Math.random() * s, 0); g.quadraticCurveTo(Math.random() * s, s / 2, Math.random() * s, s); g.stroke(); }
  }
  return cv;
}
const matCache = {};
function getMat(name) {
  if (!matCache[name]) {
    const m = MATS[name] || MATS.Default, tex = new THREE.CanvasTexture(drawTex(m)); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    matCache[name] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, transparent: !!m.o, opacity: m.o || 1, emissive: m.k === 'lava' ? 0x551100 : 0x000000 });
  }
  return matCache[name];
}

/* ---------- 3D scene ---------- */
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();

// sky: vertical gradient used as an equirectangular background
{
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2c6fd8'); gr.addColorStop(0.45, '#9fcdf5'); gr.addColorStop(0.5, '#e6f2fb'); gr.addColorStop(1, '#f1e4c3');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const sky = new THREE.CanvasTexture(cv);
  sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
}
const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(6, 12, 4); scene.add(sun);
const gridH = new THREE.GridHelper(40, 40, 0x3a6a9a, 0x7fa6cc); scene.add(gridH);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(6, 5, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0); controls.enableDamping = true;

const group = new THREE.Group(); scene.add(group);       // all placed blocks
const selBox = new THREE.BoxHelper(new THREE.Mesh(), 0xffc93c); selBox.visible = false; scene.add(selBox);

/* ---------- editor state ---------- */
let tool = 'place', shape = 'Cube', matName = 'Default', selected = null;
let multi = new Set(), snapB = false, flyMode = false, collide = false, keepXf = false, dupInPlace = false, lightsOn = true, snapAmt = 0.25, lastXf = null, flyLast = 0, ok = null;
const flash = t => { $('status').textContent = t; };
const undoStack = [], redoStack = [];
function pushCmd(u, r) { undoStack.push({ u, r }); redoStack.length = 0; }
let linkMode = null;
const previews = new Map();

// move / rotate / scale gizmo
const SNAP_ROT = THREE.MathUtils.degToRad(15);
const tc = new TransformControls(camera, renderer.domElement);
tc.setTranslationSnap(0.25); tc.setRotationSnap(SNAP_ROT); tc.setScaleSnap(0.25);
scene.add(tc);
function syncSel() { if (!selected) return; selBox.setFromObject(selected); fillTransform(); tileUV(selected); if (SHAPES[selected.userData.s]) lastXf = { q: selected.quaternion.toArray(), sc: selected.scale.toArray() }; }
let before = null;
tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
tc.addEventListener('mouseDown', () => { const m = tc.object; if (m === pivot) { pivot.updateMatrixWorld(); mstart = { inv: pivot.matrixWorld.clone().invert(), list: [...multi].map(x => { x.updateMatrix(); return { m: x, mat: x.matrix.clone() }; }) }; return; } ok = m && { p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone(), bad: hits(m) }; if (m) before = { m, p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone() }; });
tc.addEventListener('mouseUp', () => {
  if (mstart) { const L = mstart.list, ends = L.map(x => { x.m.updateMatrix(); return x.m.matrix.clone(); }); mstart = null; const put = arr => () => L.forEach((x, i) => { x.m.matrix.copy(arr[i]).decompose(x.m.position, x.m.quaternion, x.m.scale); tileUV(x.m); }); pushCmd(put(L.map(x => x.mat)), put(ends)); return; }
  if (!before) return;
  const b = before; before = null;
  if (!b.m.position.equals(b.p) || !b.m.quaternion.equals(b.q) || !b.m.scale.equals(b.s))
    {
      const n = { p: b.m.position.clone(), q: b.m.quaternion.clone(), s: b.m.scale.clone() };
      const put = (p, q, sc) => () => { b.m.position.copy(p); b.m.quaternion.copy(q); b.m.scale.copy(sc); syncSel(); };
      pushCmd(put(b.p, b.q, b.s), put(n.p, n.q, n.s));
    }
});
tc.addEventListener('objectChange', () => {
  const m = tc.object;
  if (m === pivot) { applyMulti(); changed(); return; }
  if (m && tc.mode === 'translate' && snapB) snapToBlocks(m);
  if (m && tc.mode === 'scale' && keys.q && before) oneWay(m);
  if (m && m !== pivot) constrain(m);
  if (m && ok) { if (hits(m) && !ok.bad) { m.position.copy(ok.p); m.quaternion.copy(ok.q); m.scale.copy(ok.s); } else ok = { p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone(), bad: ok.bad }; }
  syncSel(); changed();
});
const getScale = () => new THREE.Vector3(...['sx', 'sy', 'sz'].map(id => Math.max(0.25, parseFloat($(id).value) || 1)));

const ghost = new THREE.Mesh(SHAPES.Cube(), new THREE.MeshStandardMaterial({ color: 0xffc93c, transparent: true, opacity: 0.5 }));
ghost.visible = false; scene.add(ghost);
function updateGhost() { ghost.geometry.dispose(); ghost.geometry = geoFor(shape); ghost.scale.copy(placeScale()); }

function makeBlock(d) {
  const mesh = new THREE.Mesh(geoFor(d.s), SPECIALS[d.s] ? specMat(d.s) : getMat(d.m));
  mesh.position.fromArray(d.p); mesh.scale.fromArray(d.sc); if (d.q) mesh.quaternion.fromArray(d.q);
  mesh.userData = { s: d.s, m: d.m, id: d.id || uid(), cfg: migrateCfg(d.cfg ? JSON.parse(JSON.stringify(d.cfg)) : defCfg(d.s), d.s), folder: d.f || '', gid: d.g || '', name: d.n || '', gname: d.gn || '' };
  if (d.s === 'Light') syncLight(mesh);
  if (SHAPES[d.s]) { paint(mesh); tileUV(mesh); } constrain(mesh); if (d.s === 'Sign') signTex(mesh);
  return mesh;
}
const blockData = b => ({ s: b.userData.s, m: b.userData.m, id: b.userData.id, cfg: b.userData.cfg, f: b.userData.folder || '', g: b.userData.gid || '', n: b.userData.name || '', gn: b.userData.gname || '', p: b.position.toArray(), q: b.quaternion.toArray(), sc: b.scale.toArray() });
const serialize = () => { stopPreviews(); return group.children.map(blockData); };

let saveTimer;
function saveNow() {
  if (!current) return;
  current.blocks = serialize(); current.amb = amb; current.updated = Date.now();
  $('status').textContent = writeStore() ? 'Saved' : 'Could not save (browser storage is full or blocked)';
}
function changed() { $('status').textContent = 'Saving...'; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); queueRefresh(); }

function addBlock(d) {
  if (d.s === 'Start') group.children.filter(b => b.userData.s === 'Start').forEach(b => group.remove(b)); // only one start
  const mesh = makeBlock(d); group.add(mesh);
  pushCmd(() => { if (selected === mesh) select(null); group.remove(mesh); }, () => group.add(mesh));
  changed();
  return mesh;
}
function removeBlock(mesh) {
  select(null); group.remove(mesh);
  pushCmd(() => group.add(mesh), () => { if (selected === mesh) select(null); group.remove(mesh); });
  changed();
}
function select(mesh) { selectCore(mesh); renderInspector(); fillTransform(); queueRefresh(); }
function selectCore(mesh) {
  stopPreviews(); setLink(null);
  selected = mesh; multi = new Set(mesh ? [mesh] : []); selBox.visible = !!mesh;
  if (mesh && tool === 'select') tc.attach(mesh); else tc.detach();
  if (mesh) {
    selBox.setFromObject(mesh);
    $('sx').value = mesh.scale.x; $('sy').value = mesh.scale.y; $('sz').value = mesh.scale.z;
    if (!SPECIALS[mesh.userData.s]) matName = mesh.userData.m;
    refreshUI();
  }
}

/* ---------- placing and picking ---------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const h = ray.intersectObjects(group.children, false)[0];
  if (h) return { point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld), mesh: h.object };
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(ground, p) ? { point: p, normal: new THREE.Vector3(0, 1, 0) } : null;
}
function placement(h) {
  const sc = placeScale(), n = h.normal;
  const p = h.point.clone().add(n.clone().multiply(sc).multiplyScalar(0.5));
  ['x', 'y', 'z'].forEach(a => { if (Math.abs(n[a]) < 0.5 && $('snap').checked) p[a] = Math.round(p[a] / snapAmt) * snapAmt; });
  return p;
}

const cvs = renderer.domElement;
let down = null;
cvs.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, b: e.button, gizmo: tc.axis !== null }; });
cvs.addEventListener('pointermove', e => {
  if (tool !== 'place') { ghost.visible = false; return; }
  const h = pick(e);
  ghost.visible = !!h;
  if (h) ghost.position.copy(placePos(h));
  if (keepXf && lastXf) { ghost.quaternion.fromArray(lastXf.q); ghost.scale.fromArray(lastXf.sc); } else { ghost.quaternion.identity(); ghost.scale.set(1, 1, 1); }
});
cvs.addEventListener('pointerleave', () => { ghost.visible = false; });
cvs.addEventListener('pointerup', e => {
  if (!down || down.b !== 0 || down.gizmo || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
  down = null;
  if (e.ctrlKey || e.shiftKey) return;
  const h = pick(e);
  if (tool === 'place') {
    if (h) {
      const p = placePos(h); ghost.position.copy(p); ghost.updateMatrixWorld();
      if (!hits(ghost)) { const d = { s: shape, m: matName, p: p.toArray(), sc: placeScale().toArray() }; if (keepXf && lastXf) d.q = lastXf.q; addBlock(d); }
    }
  } else if (linkMode && h && h.mesh) toggleLink(h.mesh);
  else pickSel(h && h.mesh ? h.mesh : null);
});

/* ---------- side panel ---------- */
function refreshUI() {
  queueRefresh();
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', tool === 'select' && b.dataset.mode === tc.mode));
  document.querySelectorAll('#shapes button, #specials button').forEach(b => b.classList.toggle('on', b.dataset.k === shape));
  document.querySelectorAll('#mats button').forEach(b => b.classList.toggle('on', b.dataset.k === matName));
}
function setTool(t) { tool = t; ghost.visible = false; if (t === 'place') select(null); refreshUI(); }
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { tc.setMode(b.dataset.mode); setTool('select'); });
function applySnap() {
  const on = $('snap').checked; snapAmt = Math.max(0.05, parseFloat($('snapAmt').value) || 0.25);
  tc.setTranslationSnap(on ? snapAmt : null); tc.setScaleSnap(on ? snapAmt : null); tc.setRotationSnap(on ? SNAP_ROT : null);
}
$('snap').onchange = applySnap; $('snapAmt').oninput = applySnap;

Object.keys(SHAPES).forEach(n => {
  const b = document.createElement('button'); b.textContent = n; b.dataset.k = n;
  b.onclick = () => { shape = n; setTool('place'); updateGhost(); };
  $('shapes').append(b);
});
Object.keys(SPECIALS).forEach(n => {
  const b = document.createElement('button'); b.textContent = n; b.dataset.k = n;
  b.onclick = () => { shape = n; setTool('place'); updateGhost(); };
  $('specials').append(b);
});
Object.keys(MATS).forEach(n => {
  const b = document.createElement('button'); b.dataset.k = n;
  b.style.backgroundImage = 'url(' + drawTex(MATS[n]).toDataURL() + ')';
  b.innerHTML = '<span>' + n + '</span>';
  b.onclick = () => {
    matName = n;
    if (tool === 'select' && selected && !SPECIALS[selected.userData.s]) { multi.forEach(o => { if (SHAPES[o.userData.s]) { o.userData.m = n; paint(o); } }); changed(); }
    refreshUI();
  };
  $('mats').append(b);
});
['sx', 'sy', 'sz'].forEach(id => $(id).addEventListener('input', () => {
  updateGhost();
  if (selected) { selected.scale.copy(getScale()); constrain(selected); tileUV(selected); selBox.setFromObject(selected); changed(); }
}));

/* ---------- open a project, resize, render ---------- */
function openProject(id) {
  current = projects.find(p => p.id === id); if (!current) return;
  $('home').hidden = true; $('editor').hidden = false;
  $('projName').textContent = current.name; $('status').textContent = '';
  select(null); undoStack.length = 0; redoStack.length = 0;
  group.clear();
  current.blocks.forEach(d => group.add(makeBlock(d)));
  amb = { ...DEFAULT_AMB, ...(current.amb || {}) }; applyAmb(amb); if (!$('atmo').hidden) renderAtmo();
  setTool('place'); updateGhost(); resize(); queueRefresh();
}
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

renderer.setAnimationLoop(() => {
  if ($('editor').hidden) return;
  if (flyMode) flyTick(); else controls.update(); tickPreviews(); renderer.render(scene, camera);
});

/* ---------- export to GRAB (.level) ---------- */
// Uses Slin's official schema (MIT licensed): copy the "protofiles" folder from
// github.com/Slin/GRAB-Level-Format into your site next to index.html.
const PROTO_FILES = ['protofiles/level.proto', 'protofiles/types.proto'];
let LevelType = null;
async function loadSchema() {
  if (LevelType) return LevelType;
  if (!window.protobuf) throw new Error('The protobuf library did not load. Check your internet connection.');
  const root = new protobuf.Root(); let ok = 0;
  for (const f of PROTO_FILES) { try { await root.load(f); ok++; } catch (e) { /* that file may not exist */ } }
  if (!ok) throw new Error('Could not load the GRAB proto files. Copy the "protofiles" folder from github.com/Slin/GRAB-Level-Format into your site, next to index.html.');
  root.resolveAll();
  let found = null;
  (function walk(ns) { (ns.nestedArray || []).forEach(n => { if (n instanceof protobuf.Type && n.name === 'Level') found = n; if (n.nestedArray) walk(n); }); })(root);
  if (!found) throw new Error('No "Level" message found in the proto files.');
  return (LevelType = found);
}
const norm = s => s.toUpperCase().replace(/[^A-Z]/g, '');
function enumName(en, want) {
  const w = norm(want), keys = Object.keys(en.values);
  return keys.find(k => norm(k) === w) || keys.filter(k => norm(k).endsWith(w)).sort((a, b) => a.length - b.length)[0] || null;
}
// checks every field against the real schema; unknown ones are dropped and reported
function conform(T, obj, path, warn) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const f = T.fields[k];
    if (!f) { warn.add('unknown field ' + path + k + '  (available: ' + Object.keys(T.fields).join(', ') + ')'); continue; }
    const rt = f.resolvedType;
    if (rt instanceof protobuf.Enum) { const n = enumName(rt, v); if (n) out[k] = n; else warn.add('unknown value ' + path + k + ' = ' + v); }
    else if (rt instanceof protobuf.Type && v && typeof v === 'object') out[k] = f.repeated ? v.map(x => conform(rt, x, path + k + '.', warn)) : conform(rt, v, path + k + '.', warn);
    else out[k] = v;
  }
  return out;
}
function toNodes() {
  const q = { x: 0, y: 0, z: 0, w: 1 }, nodes = []; let cx = 0, hasStart = false; const gm = {}, pushN = (b, n) => (b.userData.gid ? (gm[b.userData.gid] = gm[b.userData.gid] || []) : nodes).push(n);
  for (const b of group.children) {
    const [x, y, z] = b.position.toArray(), [sx, sy, sz] = b.scale.toArray(), s = b.userData.s;
    const position = { x, y, z }, scale = { x: sx, y: sy, z: sz };
    const [qx, qy, qz, qw] = b.quaternion.toArray(), q = { x: qx, y: qy, z: qz, w: qw };
    if (SHAPES[s]) {
      const m = MATS[b.userData.m] || MATS.Default;
      pushN(b, m.g === 'GRABBABLE_CRUMBLING' ? { levelNodeCrumbling: { shape: SHAPE_ENUM[s], material: m.g, position, scale, rotation: q, stableTime: b.userData.cfg.stable ?? 1, respawnTime: b.userData.cfg.respawn ?? 5 } } : { levelNodeStatic: { shape: SHAPE_ENUM[s], material: m.g, position, scale, rotation: q, color: hx(colorOf(b)) } });
      cx += m.g === 'GRABBABLE_CRUMBLING' ? 3 : 2;
    } else if (s === 'Start') { hasStart = true; pushN(b, { levelNodeStart: { position, rotation: q, radius: Math.max(sx, sz) / 2 } }); }
    else if (s === 'Finish') pushN(b, { levelNodeFinish: { position, radius: Math.max(sx, sz) / 2 } });
    else if (s === 'Trigger') { pushN(b, { levelNodeTrigger: { position, scale, rotation: q } }); cx += 2; }
    else if (s === 'Gravity') { pushN(b, { levelNodeGravity: { position, scale, rotation: q } }); cx += 2; }
    else if (s === 'Particle') { pushN(b, { levelNodeParticleEmitter: { position, rotation: q } }); cx += 2; }
    else if (s === 'Code') pushN(b, { levelNodeCode: { position, scale, rotation: q, code: b.userData.cfg.code || '' } });
    else if (s === 'Sound') pushN(b, { levelNodeSound: { position, rotation: q } });
    else if (s === 'Light') pushN(b, { levelNodeLight: { position, rotation: q } });
    else if (s === 'Sign') pushN(b, { levelNodeSign: { position, rotation: q, text: b.userData.cfg.text || '' } });
  }
  Object.values(gm).forEach(ch => nodes.push({ levelNodeGroup: { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, childNodes: ch } }));
  if (!hasStart) nodes.push({ levelNodeStart: { position: { x: 0, y: 0.5, z: 0 }, rotation: q } });
  return { nodes, cx: group.children.reduce((a, b) => a + cxOf(b), 0) };
}
async function doExport() {
  try {
    saveNow();
    const T = await loadSchema(), warn = new Set(), { nodes: all, cx } = toNodes(), LN = T.fields.levelNodes.resolvedType.fields, nodes = all.filter(n => Object.keys(n).every(k => LN[k]));
    if (nodes.length < all.length) warn.add('This GRAB format version has no Trigger, Gravity, Particle, Sound, Light or Code blocks, so they were left out of the .level (they stay in your project)');
    if (group.children.some(b => { const c = b.userData.cfg || {}; return b.userData.s === 'Trigger' || b.userData.s === 'Sound' || b.userData.s === 'Light' || (c.anims && c.anims.length) || (c.links && c.links.length); }))
      warn.add('Trigger settings, animations, sound and light settings and code links are saved in your project but not exported yet (use Help > Show GRAB format fields so they can be added)');
    const level = { ambienceSettings: ambOut(), formatVersion: 6, title: current.name, creators: (current.meta || {}).creators || 'Level Studio', description: (current.meta || {}).description ?? 'Made with Level Studio', complexity: cx, maxCheckpointCount: (current.meta || {}).checkpoints || 10, levelNodes: nodes };
    const clean = conform(T, level, '', warn);
    clean.levelNodes = (clean.levelNodes || []).filter(n => Object.keys(n).length);
    const buf = T.encode(T.fromObject(clean)).finish();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
    a.download = current.name.replace(/[^\w-]+/g, '_') + '.level';
    a.click(); URL.revokeObjectURL(a.href);
    if (thumbData) { const t = document.createElement('a'); t.href = thumbData; t.download = a.download.replace(/\.level$/, '') + '.png'; t.click(); }
    $('status').textContent = warn.size ? 'Exported with warnings' : 'Exported';
    if (warn.size) alert('Exported, but these did not match the GRAB schema:\n\n' + [...warn].join('\n') + '\n\nSend this list to whoever maintains the site so they can fix the names.');
  } catch (e) { alert('Export failed:\n' + e.message); }
}
$('exportBtn').onclick = exportLevel;

/* ---------- import textures (folder) ---------- */
const TEX_KEY = 'levelstudio.textures.v1';
let customTex = {};
try { customTex = JSON.parse(localStorage.getItem(TEX_KEY)) || {}; } catch { customTex = {}; }
function applyTex(name, url) {
  new THREE.TextureLoader().load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = getMat(name); m.map = t; m.needsUpdate = true; group.children.forEach(paint);
  });
  const sw = document.querySelector('#mats [data-k="' + name + '"]');
  if (sw) sw.style.backgroundImage = 'url(' + url + ')';
}
Object.entries(customTex).forEach(([n, u]) => MATS[n] && applyTex(n, u));
const slug = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
function shrink(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(img, 0, 0, 256, 256); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}
async function importTextures(files) {
  const names = Object.keys(MATS), done = [], missed = [];
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    const base = slug(f.name.replace(/\.[^.]+$/, ''));
    const name = names.find(n => slug(n) === base || slug(MATS[n].g) === base);
    if (!name) { missed.push(f.name); continue; }
    try { customTex[name] = await shrink(f); applyTex(name, customTex[name]); done.push(name); } catch { missed.push(f.name); }
  }
  try { localStorage.setItem(TEX_KEY, JSON.stringify(customTex)); } catch { missed.push('(browser storage is full, so these will not be remembered next visit)'); }
  alert((done.length ? 'Loaded: ' + done.join(', ') : 'No textures matched.') + (missed.length ? '\n\nSkipped: ' + missed.join(', ') : '') +
    '\n\nName each image after its block: default, grabbable, ice, lava, wood, grapple, grapple lava, crumbling, colored, bouncing, snow (.png or .jpg).');
}

/* ---------- import a .level file ---------- */
async function importLevel(file) {
  try {
    const T = await loadSchema();
    const o = T.toObject(T.decode(new Uint8Array(await file.arrayBuffer())), { enums: String, longs: Number });
    const v3 = (v, d) => [v?.x ?? d, v?.y ?? d, v?.z ?? d];
    const q4 = r => r ? [r.x ?? 0, r.y ?? 0, r.z ?? 0, r.w ?? ((r.x || r.y || r.z) ? 0 : 1)] : [0, 0, 0, 1];
    const shapeOf = n => Object.keys(SHAPE_ENUM).find(k => norm(n).endsWith(norm(SHAPE_ENUM[k])));
    const matOf = n => Object.keys(MATS).filter(k => norm(n).endsWith(norm(MATS[k].g))).sort((a, b) => MATS[b].g.length - MATS[a].g.length)[0];
    const special = { levelNodeStart: 'Start', levelNodeFinish: 'Finish', levelNodeTrigger: 'Trigger', levelNodeGravity: 'Gravity', levelNodeParticleEmitter: 'Particle' };
    const blocks = [], skipped = {};
    const skip = k => { skipped[k] = (skipped[k] || 0) + 1; };
    const walk = (list, M, gid) => {
      for (const n of list || []) {
        const key = Object.keys(n).find(k => k.startsWith('levelNode')), v = (key && n[key]) || {};
        const mat = new THREE.Matrix4().compose(new THREE.Vector3(...v3(v.position, 0)), new THREE.Quaternion(...q4(v.rotation)), new THREE.Vector3(...v3(v.scale, 1)));
        if (key === 'levelNodeGroup') { walk(v.childNodes, M.clone().multiply(mat), uid()); continue; }
        const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); M.clone().multiply(mat).decompose(P, Q, S);
        const base = { p: P.toArray(), q: Q.toArray(), sc: S.toArray(), g: gid };
        if (key === 'levelNodeStatic' || key === 'levelNodeCrumbling') {
          const sh = shapeOf(String(v.shape));
          if (sh) blocks.push({ ...base, s: sh, m: matOf(String(v.material)) || 'Default', cfg: { anims: [], color: rgbHex(v.color), cmode: v.color ? 'custom' : 'default', spec: 0, stable: v.stableTime ?? 1, respawn: v.respawnTime ?? 5 } }); else skip('unknown shape');
        } else if (special[key]) {
          const sp = special[key], r = v.radius;
          blocks.push({ ...base, s: sp, m: '', g: '', sc: (sp === 'Finish' || sp === 'Start') && r ? [2 * r, 1, 2 * r] : sp === 'Particle' ? [1, 1, 1] : base.sc });
        } else if (key === 'levelNodeSign') blocks.push({ ...base, s: 'Sign', m: '', sc: [1, 1, 1], cfg: { text: v.text || '' } });
        else skip(key || 'unknown node');
      }
    };
    walk(o.levelNodes, new THREE.Matrix4(), '');
    const p = { id: Date.now().toString(36), name: (o.title || file.name.replace(/\.level$/i, '')).slice(0, 40), blocks, updated: Date.now(), amb: ambIn(o.ambienceSettings), meta: { creators: o.creators || '', description: o.description || '', checkpoints: o.maxCheckpointCount || 10 } };
    projects.push(p); writeStore(); openProject(p.id);
    const sk = Object.entries(skipped);
    if (sk.length || !blocks.length) alert('Imported ' + blocks.length + ' blocks.' + (sk.length ? '\n\nNot supported yet, so skipped:\n' + sk.map(([k, c]) => k + ' x' + c).join('\n') : ''));
  } catch (e) { alert('Could not import that file:\n' + e.message); }
}

/* ---------- File menu / buttons ---------- */
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  $('fileMenu')?.removeAttribute('open');
  ({ tex: () => $('fileTex').click(), level: () => $('fileLevel').click(), export: () => { if (current) exportLevel(); } })[b.dataset.act]();
}));
$('fileTex').onchange = e => { const f = [...e.target.files]; e.target.value = ''; importTextures(f); };
$('fileLevel').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importLevel(f); };

/* ---------- block settings: ids, defaults, links ---------- */
const uid = () => Math.random().toString(36).slice(2, 8);
const STARTER = `; Move obj0 up at 2 units per second
LABEL Loop
MUL R0 DeltaTime 2
ADD obj0.Pos.Y obj0.Pos.Y R0
SLEEP 0
GOTO Loop
`;
const SNIPPETS = {
  'Move up at 2 units/sec': STARTER,
  'Timer (3 seconds)': `; runs the action once after 3 seconds
LABEL Loop
ADD R0 R0 DeltaTime
GREATER R1 R0 3
IF R1 Done
SLEEP 0
GOTO Loop
LABEL Done
; action here
`,
  'Act when trigger is active': `LABEL Loop
SET R0 trg0.Trigger.Active
IF R0 Go
SLEEP 0
GOTO Loop
LABEL Go
; action here
SLEEP 0
GOTO Loop
`
};
const OPS = new Set('SET SWAP ADD SUB MUL DIV POW MOD SQRT ABS EQUAL LESS GREATER AND OR NOT LABEL GOTO IF SLEEP'.split(' '));
function defCfg(s) {
  if (s === 'Sign') return { text: 'Sign' };
  if (s === 'Trigger') return { fire: 'enter', action: 'start', anim: 'Animation1', sublevel: '', targets: [] };
  if (s === 'Code') return { code: STARTER, links: [] };
  if (s === 'Sound') return { mode: 'simple', preset: 'Pickup/Coin', wave: 'Sine', volume: 1, range: 20, length: 0.4, freq: 440 };
  if (s === 'Light') return { kind: 'point', color: '#ffffff', brightness: 1, range: 12, falloff: 1, angle: 45, spotFalloff: 1 };
  if (SHAPES[s]) return { anims: [], color: '#ffffff', neon: false, transp: false, spec: 0 };
  return {};
}
const byId = id => group.children.find(b => b.userData.id === id);
const label = b => b.userData.name || b.userData.s + ' ' + (group.children.indexOf(b) + 1);
function cxOf(b) { const s = b.userData.s; if (SHAPES[s]) return b.userData.m === 'Crumbling' ? 3 : 2; return { Trigger: 3, Gravity: 2, Particle: 2 }[s] || 0; }
function lintCode(src) {
  const notes = [], labels = new Set(), jumps = []; let count = 0;
  src.split('\n').forEach((raw, i) => {
    const line = raw.split(';')[0].trim(); if (!line) return;
    const [op, ...a] = line.split(/\s+/), OP = op.toUpperCase(); count++;
    if (!OPS.has(OP)) notes.push('Line ' + (i + 1) + ': "' + op + '" is not in my list of instructions (it may still be valid)');
    if (OP === 'LABEL' && a[0]) labels.add(a[0]);
    if (OP === 'GOTO' && a[0]) jumps.push([i + 1, a[0]]);
    if (OP === 'IF' && a[1]) jumps.push([i + 1, a[1]]);
  });
  jumps.forEach(([ln, l]) => { if (!labels.has(l)) notes.push('Line ' + ln + ': label "' + l + '" is never defined'); });
  if (count > 150) notes.push('Over the 150 instruction limit');
  return { count, notes };
}
function linkNames(b) { let o = 0, t = 0; return (b.userData.cfg.links || []).map(id => { const m = byId(id); return !m ? null : m.userData.s === 'Trigger' ? 'trg' + t++ : 'obj' + o++; }); }
function setLink(mode) {
  linkMode = mode; const bn = $('banner'); bn.hidden = !mode;
  if (mode) bn.textContent = (mode === 'links' ? 'Click blocks to link them to this code block' : 'Click blocks to add or remove trigger targets') + '. Press Esc when done.';
}
function toggleLink(m) {
  if (!selected || m === selected) return;
  const c = selected.userData.cfg, key = linkMode, id = m.userData.id;
  c[key] = (c[key] || []).includes(id) ? c[key].filter(x => x !== id) : [...(c[key] || []), id];
  changed(); renderInspector();
}
const linkLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false }));
linkLines.renderOrder = 999; linkLines.frustumCulled = false; scene.add(linkLines);
function updateLinks() {
  const pts = [];
  group.children.forEach(b => { const c = b.userData.cfg || {}; [...(c.targets || []), ...(c.links || [])].forEach(id => { const m = byId(id); if (m) pts.push(b.position, m.position); }); });
  linkLines.geometry.setFromPoints(pts);
}

/* ---------- keyframe animation ---------- */
const poseOf = b => ({ p: b.position.toArray(), q: b.quaternion.toArray(), s: b.scale.toArray() });
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const animDur = a => (a.frames.length ? a.frames[a.frames.length - 1].t : 0);
function migrateCfg(c, s) {
  if (c.anim === null || (c.anim && typeof c.anim === 'object')) {   // older 2-pose animation
    const a = c.anim; c.anims = c.anims || [];
    if (a && (a.a || a.b)) { const f = []; if (a.a) f.push({ t: 0, ...a.a }); if (a.b) f.push({ t: a.dur || 1, ...a.b }); c.anims.push({ name: a.name || 'Animation1', speed: 100, mode: a.loop || 'once', smooth: false, frames: f }); }
    delete c.anim;
  }
  if (SHAPES[s]) { c.anims = c.anims || []; c.color = c.color || '#ffffff'; }
  return c;
}
function applyPose(b, a, t) {
  const f = a.frames; if (!f.length) return;
  let i = 0; while (i < f.length - 1 && f[i + 1].t <= t) i++;
  const A = f[i], B = f[Math.min(i + 1, f.length - 1)];
  let k = B.t > A.t ? (t - A.t) / (B.t - A.t) : 1; k = Math.min(Math.max(k, 0), 1);
  { const sm = a.smoothAmt ?? (a.smooth ? 1 : 0); k += (k * k * (3 - 2 * k) - k) * sm; }
  b.position.lerpVectors(V1.fromArray(A.p), V2.fromArray(B.p), k);
  b.scale.lerpVectors(V1.fromArray(A.s), V2.fromArray(B.s), k);
  b.quaternion.slerpQuaternions(Q1.fromArray(A.q), Q2.fromArray(B.q), k);
}
function timeAt(a, secs) {
  const d = animDur(a), x = secs * (a.speed / 100); if (d <= 0) return 0;
  if (a.mode === 'loop') return x % d;
  if (a.mode === 'pingpong') { const m = x % (2 * d); return m > d ? 2 * d - m : m; }
  return Math.min(x, d);
}
function startPreview(b, a) {
  if (a.frames.length < 2) { alert('Add at least two keyframes first.'); return; }
  previews.set(b, { t0: performance.now(), base: poseOf(b), a }); tc.detach();
}
function scrub(b, a, t) {
  let v = previews.get(b);
  if (!v) { v = { base: poseOf(b), a }; previews.set(b, v); tc.detach(); }
  v.a = a; v.fixed = t; applyPose(b, a, t); selBox.setFromObject(b);
}
function stopPreviews() {
  if (!previews.size) return;
  previews.forEach((v, b) => { b.position.fromArray(v.base.p); b.quaternion.fromArray(v.base.q); b.scale.fromArray(v.base.s); });
  previews.clear();
  if (selected && tool === 'select') tc.attach(selected);
  syncSel();
}
function tickPreviews() {
  if (!previews.size) return;
  const now = performance.now();
  previews.forEach((v, b) => {
    const t = v.fixed !== undefined ? v.fixed : timeAt(v.a, (now - v.t0) / 1000);
    applyPose(b, v.a, t);
    const sc = document.getElementById('scrub'); if (sc && v.fixed === undefined) sc.value = t;
  });
  if (selected) selBox.setFromObject(selected);
}

/* ---------- inspector ---------- */
function el(tag, props = {}, ...kids) { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; }
const field = (l, input) => el('label', { className: 'fld' }, el('span', { textContent: l }), input);
const txt = (val, on, ph = '') => el('input', { value: val, placeholder: ph, oninput: e => on(e.target.value) });
const btn = (text, on, cls = '') => el('button', { textContent: text, onclick: on, className: cls });
function sel(opts, val, on) {
  const x = el('select'); opts.forEach(([v, t]) => x.append(el('option', { value: v, textContent: t, selected: v === val })));
  x.onchange = () => on(x.value); return x;
}
function fillTransform() {
  const on = !!selected;
  ['px', 'py', 'pz', 'rx', 'ry', 'rz'].forEach(id => { $(id).disabled = !on; if (!on) $(id).value = ''; });
  $('xfTitle').textContent = on ? 'Transform' : 'New block size';
  if (!on) return;
  const f = v => +v.toFixed(3), d = THREE.MathUtils.radToDeg, e = selected.rotation;
  selected.position.toArray().forEach((v, i) => { $('pxyz'[0] + 'xyz'[i]).value = f(v); });
  $('rx').value = f(d(e.x)); $('ry').value = f(d(e.y)); $('rz').value = f(d(e.z));
  ['x', 'y', 'z'].forEach(a => { $('s' + a).value = f(selected.scale[a]); });
}
['px', 'py', 'pz'].forEach((id, i) => $(id).addEventListener('input', () => {
  if (!selected) return; selected.position.setComponent(i, parseFloat($(id).value) || 0); selBox.setFromObject(selected); changed();
}));
['rx', 'ry', 'rz'].forEach((id, i) => $(id).addEventListener('input', () => {
  if (!selected) return; selected.rotation['xyz'[i]] = THREE.MathUtils.degToRad(parseFloat($(id).value) || 0); selBox.setFromObject(selected); changed();
}));

function linkList(b, key, title) {
  const c = b.userData.cfg, names = key === 'links' ? linkNames(b) : [], wrap = el('div', { className: 'links' }, el('h5', { textContent: title }));
  (c[key] || []).forEach((id, i) => {
    const m = byId(id); if (!m) return;
    wrap.append(el('div', { className: 'lrow' }, el('span', { textContent: (names[i] ? names[i] + ' = ' : '') + label(m) }),
      btn('x', () => { c[key] = c[key].filter(x => x !== id); changed(); renderInspector(); })));
  });
  const on = linkMode === key;
  wrap.append(btn(on ? 'Done' : 'Add / remove (click blocks)', () => { if (on) setLink(null); else { setTool('select'); setLink(key); } renderInspector(); }, on ? 'primary' : ''));
  return wrap;
}
function triggerPanel(box, b, c) {
  const acts = [['start', 'Start animation'], ['stop', 'Stop animation'], ['reverse', 'Reverse animation'], ['sound', 'Play sound'], ['light', 'Change light'], ['ambience', 'Change atmosphere'], ['sublevel', 'Load sublevel']];
  box.append(el('h4', { textContent: 'Trigger' }), partsFields(b, c),
    field('Fires', sel([['enter', 'On enter'], ['exit', 'On exit'], ['both', 'On enter and exit']], c.fire, v => { c.fire = v; changed(); })),
    field('Action', sel(acts, c.action, v => {
      c.action = v; if (v === 'ambience' && !c.amb) c.amb = { ...amb }; if (v === 'light' && !c.light) c.light = { brightness: 1, color: '#ffffff' };
      changed(); renderInspector();
    })));
  if (c.action === 'sublevel') { box.append(field('Level ID', txt(c.sublevel, v => { c.sublevel = v; changed(); }, 'published level id'))); return; }
  if (c.action === 'ambience') {
    box.append(hint('The trigger changes the level to these atmosphere settings.'), ambFields(c.amb, () => changed()),
      el('div', { className: 'row' }, btn('Preview', () => applyAmb(c.amb)), btn('Restore', () => applyAmb(amb))));
    return;
  }
  if (['start', 'stop', 'reverse'].includes(c.action)) { const i = txt(c.anim, v => { c.anim = v; changed(); }, 'animation name'); i.setAttribute('list', 'animNames'); box.append(field('Animation', i)); }
  if (c.action === 'light') box.append(field('Brightness', num(c.light.brightness, v => { c.light.brightness = v; changed(); }, 0.1)), field('Color', color(c.light.color, v => { c.light.color = v; changed(); })));
  box.append(linkList(b, 'targets', c.action === 'sound' ? 'Sound blocks to play' : c.action === 'light' ? 'Light blocks to change' : 'Targets (blocks with that animation)'));
}
function codePanel(box, b, c) {
  const notes = el('div', { className: 'notes' }), count = el('div', { className: 'count' });
  const upd = () => { const r = lintCode(c.code); count.textContent = r.count + ' / 150 instructions'; count.className = 'count' + (r.count > 150 ? ' bad' : ''); notes.replaceChildren(...r.notes.slice(0, 6).map(n => el('div', { textContent: n }))); };
  const ta = el('textarea', { value: c.code, spellcheck: false, rows: 14, className: 'code', oninput: e => { c.code = e.target.value; changed(); upd(); } });
  box.append(el('h4', { textContent: 'Code (GRAB assembly)' }), ta, count, notes,
    field('Example', sel([['', 'Insert...'], ...Object.keys(SNIPPETS).map(k => [k, k])], '', k => { if (k) { c.code = SNIPPETS[k]; ta.value = c.code; changed(); upd(); } })),
    linkList(b, 'links', 'Linked blocks'),
    el('p', { className: 'hint', textContent: 'Linked names (obj0, trg0...) follow link order, which is my best guess at the in-game numbering.' }));
  upd();
}
function animPanel(box, b, c) {
  box.append(el('h4', { textContent: 'Animations' }));
  c.ai = Math.max(0, Math.min(c.ai || 0, c.anims.length - 1));
  const top = el('div', { className: 'row' });
  if (c.anims.length) top.append(sel(c.anims.map((a, i) => [String(i), a.name]), String(c.ai), v => { stopPreviews(); c.ai = +v; renderInspector(); }));
  top.append(btn('New', () => { stopPreviews(); c.anims.push({ name: 'Animation' + (c.anims.length + 1), speed: 100, mode: 'loop', smooth: false, frames: [{ t: 0, ...poseOf(b) }] }); c.ai = c.anims.length - 1; changed(); renderInspector(); }));
  box.append(top);
  const a = c.anims[c.ai];
  if (!a) { box.append(hint('Press New, move the block, then add keyframes. Triggers start animations by name.')); return; }
  const d = animDur(a), playing = previews.has(b) && previews.get(b).fixed === undefined;
  box.append(field('Name', txt(a.name, v => { a.name = v; changed(); })),
    field('Speed %', num(a.speed, v => { a.speed = Math.max(1, v); changed(); }, 10)),
    field('Mode', sel([['once', 'Once'], ['loop', 'Loop'], ['pingpong', 'Ping-pong']], a.mode, v => { a.mode = v; changed(); })),
    field('Smoothing', el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: a.smoothAmt ?? (a.smooth ? 1 : 0), oninput: e => { a.smoothAmt = parseFloat(e.target.value); a.smooth = a.smoothAmt > 0; changed(); } })),
    field('Quick preset', sel([['', 'Choose...'], ...Object.keys(PRESETS).map(k => [k, k])], '', k => { if (k) { stopPreviews(); a.frames = PRESETS[k](poseOf(b)); a.mode = 'loop'; changed(); renderInspector(); } })),
    el('h5', { textContent: 'Keyframes (time in seconds)' }));
  const list = el('div', { className: 'frames' });
  a.frames.forEach((f, i) => list.append(el('div', { className: 'frow' }, el('span', { textContent: '#' + (i + 1) }),
    el('input', { type: 'number', value: f.t, min: 0, step: 0.1, onchange: e => { f.t = Math.max(0, parseFloat(e.target.value) || 0); a.frames.sort((x, y) => x.t - y.t); changed(); renderInspector(); } }),
    btn('Go', () => { stopPreviews(); b.position.fromArray(f.p); b.quaternion.fromArray(f.q); b.scale.fromArray(f.s); syncSel(); changed(); }),
    btn('Set', () => { stopPreviews(); Object.assign(f, poseOf(b)); changed(); }),
    btn('x', () => { stopPreviews(); a.frames.splice(i, 1); changed(); renderInspector(); }))));
  box.append(list,
    btn('+ Keyframe from current pose', () => { stopPreviews(); a.frames.push({ t: a.frames.length ? d + 1 : 0, ...poseOf(b) }); changed(); renderInspector(); }),
    el('input', { id: 'scrub', type: 'range', min: 0, max: d || 1, step: 0.01, value: 0, disabled: a.frames.length < 2, oninput: e => scrub(b, a, parseFloat(e.target.value)) }),
    el('div', { className: 'row' },
      btn(playing ? 'Stop' : 'Play', () => { const was = playing; stopPreviews(); if (!was) startPreview(b, a); renderInspector(); }),
      btn('Delete', () => { stopPreviews(); c.anims.splice(c.ai, 1); c.ai = 0; changed(); renderInspector(); })),
    hint('Go moves the block to a keyframe, Set saves the block pose into it. Stop returns the block to where it was.'));
}
function renderInspector() {
  const box = $('props'), b = selected; box.replaceChildren();
  $('selTitle').textContent = b ? 'Inspector: ' + label(b) : 'Inspector';
  if (!b) { box.append(el('p', { className: 'hint', textContent: 'Select a block (Q) to edit it, or press B to place blocks.' })); return; }
  const s = b.userData.s, c = b.userData.cfg;
  if (s === 'Trigger') triggerPanel(box, b, c); else if (s === 'Code') codePanel(box, b, c); else if (s === 'Sound') soundPanel(box, b, c); else if (s === 'Light') lightPanel(box, b, c); else if (s === 'Sign') signPanel(box, b, c); else if (SHAPES[s]) { colorPanel(box, b, c); animPanel(box, b, c); }
  box.append(field('Name', txt(b.userData.name || '', v => { b.userData.name = v; changed(); }, label(b))), ...(b.userData.gid ? [field('Group name', txt(b.userData.gname || '', v => { group.children.forEach(o => { if (o.userData.gid === b.userData.gid) o.userData.gname = v; }); changed(); }, 'Group'))] : []), field('Folder', txt(b.userData.folder || '', v => { multi.forEach(o => { o.userData.folder = v.trim(); }); changed(); }, 'folder name')));
}

/* ---------- outliner + status bar ---------- */
let rq = false;
function queueRefresh() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; updateLinks(); updateMulti(); capLights(); updateAnimNames(); renderOutliner(); updateStatus(); }); }
const closed = new Set();
const fk = b => b.userData.gid ? '\u2756 ' + (b.userData.gname || 'Group ' + b.userData.gid.slice(0, 3)) : (b.userData.folder || '');
function renderOutliner() {
  if ($('editor').hidden) return;
  const kids = group.children, frag = document.createDocumentFragment(); let cur = '', n = 0;
  kids.map((b, i) => i).sort((a, b) => fk(kids[a]).localeCompare(fk(kids[b]))).forEach(i => {
    if (n >= 300) return;
    const b = kids[i], f = fk(b);
    if (f !== cur) {
      cur = f;
      if (f) { const h = el('div', { className: 'omore', textContent: (closed.has(f) ? '\u25b8 ' : '\u25be ') + f, onclick: () => { closed.has(f) ? closed.delete(f) : closed.add(f); renderOutliner(); } }); h.style.cursor = 'pointer'; const hb = b; h.ondragover = e => e.preventDefault(); h.ondrop = () => dropInto(hb); frag.append(h); }
    }
    if (f && closed.has(f)) return;
    n++;
    const sp = SPECIALS[b.userData.s], row = el('div', { className: 'orow' + (multi.has(b) ? ' on' : '') }), dot = el('i');
    dot.style.background = sp ? '#' + sp.c.toString(16).padStart(6, '0') : (MATS[b.userData.m] || MATS.Default).c;
    row.append(dot, document.createTextNode((b.userData.name || b.userData.s + ' ' + (i + 1)) + (sp ? '' : '  \u00b7  ' + b.userData.m)));
    row.draggable = true; row.ondragstart = () => { dragB = b; };
    row.onclick = e => { setTool('select'); if (e.ctrlKey || e.shiftKey) selectMany([...multi, b]); else pickSel(b); };
    frag.append(row);
  });
  $('outliner').replaceChildren(frag);
  $('outliner').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function updateStatus() {
  $('sbTool').textContent = tool === 'place' ? 'Place: ' + shape : 'Select: ' + { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[tc.mode];
  $('sbSel').textContent = selected ? (multi.size > 1 ? multi.size + ' selected' : label(selected)) : 'Nothing selected';
  $('sbCount').textContent = group.children.length + ' blocks, complexity ' + group.children.reduce((a, b) => a + cxOf(b), 0);
  $('ocount').textContent = group.children.length;
}

/* ---------- edit commands ---------- */
function undo() { const c = undoStack.pop(); if (!c) return; c.u(); redoStack.push(c); changed(); }
function redo() { const c = redoStack.pop(); if (!c) return; c.r(); undoStack.push(c); changed(); }
function delSel() {
  const L = [...multi];
  if (L.length > 1) { select(null); L.forEach(m => group.remove(m)); pushCmd(() => L.forEach(m => group.add(m)), () => L.forEach(m => group.remove(m))); changed(); }
  else if (selected) removeBlock(selected);
}
function duplicate() {
  const src = [...multi].filter(m => m.userData.s !== 'Start'); if (!src.length) return;
  const gm = {};
  const made = src.map(s0 => { const d = { ...blockData(s0), id: uid() }; if (d.g) d.g = gm[d.g] = gm[d.g] || uid(); if (!dupInPlace) d.p = [d.p[0] + 0.5, d.p[1], d.p[2] + 0.5]; return addBlock(d); });
  setTool('select'); selectMany(made);
}
function nudge(v) {
  const L = [...multi]; if (!L.length) return;
  const p0 = L.map(m => m.position.clone());
  const was = L.some(m => hits(m)); L.forEach(m => m.position.add(v)); if (!was && L.some(m => hits(m))) { L.forEach((m, i) => m.position.copy(p0[i])); return; }
  const p1 = L.map(m => m.position.clone()), set = a => () => { L.forEach((m, i) => m.position.copy(a[i])); syncSel(); };
  pushCmd(set(p0), set(p1)); syncSel(); changed();
}
function frame() {
  const box = new THREE.Box3();
  if (selected) box.setFromObject(selected); else if (group.children.length) box.setFromObject(group); else box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(box.getSize(new THREE.Vector3()).length(), 2);
  controls.target.copy(c); camera.position.copy(c).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(r * 1.6));
}
function resetCam() { controls.target.set(0, 1, 0); camera.position.set(6, 5, 8); }
function toggleSnap() { $('snap').checked = !$('snap').checked; $('snap').onchange(); }
function cycleMat(dir) { const n = Object.keys(MATS); $('mats').querySelector('[data-k="' + n[(n.indexOf(matName) + dir + n.length) % n.length] + '"]').click(); }
function pickShape(i) { const n = [...Object.keys(SHAPES), ...Object.keys(SPECIALS)][i]; if (n) document.querySelector('#shapes [data-k="' + n + '"], #specials [data-k="' + n + '"]').click(); }

window.addEventListener('keydown', e => {
  if ($('editor').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, step = e.shiftKey ? 1 : 0.25;
  const mode = m => { tc.setMode(m); setTool('select'); };
  if (ctrl && e.altKey && k === 'q') { e.preventDefault(); toggleFly(); return; }
  if (flyMode && !ctrl && 'wasd'.includes(k)) return;
  if (ctrl) {
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'd') { e.preventDefault(); duplicate(); }
    else if (k === 's') { e.preventDefault(); saveNow(); }
    else if (k === 'e') { e.preventDefault(); exportLevel(); }
    else if (k === 'p') { e.preventDefault(); toggleKeep(); }
    else if (k === 'o') { e.preventDefault(); toggleSnapB(); }
    else if (k === 'f') { e.preventDefault(); if (!selected) return; const n = prompt('Folder name (empty removes it)', selected.userData.folder || ''); if (n !== null) { multi.forEach(o => { o.userData.folder = n.trim(); }); changed(); } }
    else if (k === 'a') { e.preventDefault(); selectMany([...group.children]); }
    else if (k === 'g') { e.preventDefault(); if (e.shiftKey) ungroup(); else makeGroup(); }
    return;
  }
  const mv = { arrowleft: [-1, 0, 0], arrowright: [1, 0, 0], arrowup: [0, 0, -1], arrowdown: [0, 0, 1], pageup: [0, 1, 0], pagedown: [0, -1, 0] }[k];
  if (mv) { if (selected) { e.preventDefault(); nudge(new THREE.Vector3(...mv).multiplyScalar(step)); } }
  else if (k === 'q') setTool('select');
  else if (k === 'w') mode('translate'); else if (k === 'e') mode('rotate'); else if (k === 'r') mode('scale');
  else if (k === 'b') setTool('place');
  else if (k === 'tab') { e.preventDefault(); setTool(tool === 'place' ? 'select' : 'place'); }
  else if (k === 'delete' || k === 'backspace' || k === 'x') delSel();
  else if (k === 'escape') { if (linkMode) { setLink(null); renderInspector(); } else select(null); }
  else if (k === 'f') frame(); else if (k === 'home') resetCam(); else if (k === 'g') toggleSnap();
  else if (k === 'a') toggleAtmo();
  else if (k === 'm') toggleCollide(); else if (k === 'l') setLights(!lightsOn);
  else if (k === '?') showHelp();
  else if (k === '[' || k === ']') cycleMat(k === ']' ? 1 : -1);
  else if (/^[1-9]$/.test(k)) pickShape(+k - 1);
});

/* ---------- dialogs, help, format inspector ---------- */
function showDialog(title, text, copy) {
  $('dlgT').textContent = title; $('dlgB').textContent = text; $('dlgCopy').hidden = !copy; $('dlgCopy').textContent = 'Copy'; $('dlg').showModal();
}
$('dlgClose').onclick = () => $('dlg').close();
$('dlgCopy').onclick = () => navigator.clipboard?.writeText($('dlgB').textContent).then(() => { $('dlgCopy').textContent = 'Copied'; });
function showHelp() {
  showDialog('Keyboard shortcuts', [
    'Q  Select tool            B  Place tool            Tab  Toggle Place / Select',
    'W  Move                   E  Rotate                R    Scale',
    'Delete / X  Delete        Ctrl+D  Duplicate        Esc  Deselect / finish linking',
    'Ctrl+Z  Undo              Ctrl+Shift+Z or Ctrl+Y  Redo',
    'Arrows  Nudge 0.25 (Shift = 1)      PageUp / PageDown  Nudge up / down',
    'F  Frame selection        Home  Reset camera       G  Toggle snap       A  Atmosphere panel',
    '1-9  Pick shape / special          [ ]  Previous / next texture',
    'Ctrl+S  Save              Ctrl+E  Export .level    ?  This help',
    'Ctrl+Alt+Q  Fly mode (WASD, Shift = 2x, right-drag look)   M  Collision   L  Dynamic lighting   Ctrl+P  Keep transforms',
    'Ctrl+O  Snap to blocks    Ctrl+click / Shift+click  Add to selection    Ctrl/Shift+drag  Box select',
    'Ctrl+G  Group    Ctrl+Shift+G  Ungroup    Ctrl+A  Select all    Hold Q while scaling  One-way scale',
    'Every setting is also in the Settings menu.',
    '',
    'Coming in future updates (not working yet):',
    '  - Additive, neon, transparent and specular: they show in the editor but are NOT exported yet.',
    '  - Physics and trigger body-part settings: saved in your project, not exported yet.',
    '  - Group animation and linking groups in code.',
    '  - Trigger, Gravity, Particle, Sound, Light and Code blocks are not in this GRAB format version, so they stay in your project but are not exported.',
    '',
    '',
    'Mouse: left-drag orbit, right-drag pan, scroll zoom, click to place or select.'
  ].join('\n'));
}
async function showFormat() {
  try {
    const T = await loadSchema(), f = T.fields.levelNodes;
    if (!f) throw new Error('The Level message has no levelNodes field. Its fields are: ' + Object.keys(T.fields).join(', '));
    const desc = (M, ind, d, seen) => Object.values(M.fields).map(x => {
      const rt = x.resolvedType; let line = ind + x.name + (x.repeated ? '[]' : '') + ': ' + (rt ? rt.name : x.type);
      if (rt instanceof protobuf.Type && d > 0 && !seen.has(rt)) { seen.add(rt); line += '\n' + desc(rt, ind + '  ', d - 1, seen); }
      else if (rt instanceof protobuf.Enum && Object.keys(rt.values).length < 40) line += '   {' + Object.keys(rt.values).join(', ') + '}';
      return line;
    }).join('\n');
    const out = ['Level\n' + desc(T, '  ', 0, new Set()), ''];
    f.resolvedType.fieldsArray.forEach(x => out.push(x.name + '\n' + (x.resolvedType instanceof protobuf.Type ? desc(x.resolvedType, '  ', 3, new Set()) : '  ' + x.type)));
    showDialog('GRAB format fields (copy this and send it to whoever maintains the site)', out.join('\n'), true);
  } catch (e) { alert('Could not read the format:\n' + e.message); }
}

/* ---------- menu bar ---------- */
const MENUS = {
  File: [['Import textures (folder)', '', () => $('fileTex').click()], ['Import .level file', '', () => $('fileLevel').click()], ['Save', 'Ctrl+S', saveNow], ['Export .level', 'Ctrl+E', exportLevel], ['Rename project', '', () => renameProject()], ['Back to projects', '', () => $('homeBtn').click()]],
  Edit: [['Group selected', 'Ctrl+G', makeGroup], ['Ungroup', 'Ctrl+Shift+G', ungroup], ['Select all', 'Ctrl+A', () => selectMany([...group.children])], ['Undo', 'Ctrl+Z', undo], ['Redo', 'Ctrl+Shift+Z', redo], ['Duplicate', 'Ctrl+D', duplicate], ['Delete', 'Del', delSel], ['Deselect', 'Esc', () => select(null)], ['Keep transforms when placing', 'Ctrl+P', toggleKeep], ['Duplicate in place (toggle)', '', () => { dupInPlace = !dupInPlace; flash('Duplicate in place ' + (dupInPlace ? 'on' : 'off')); }]],
  View: [['Frame selection', 'F', frame], ['Reset camera', 'Home', resetCam], ['Toggle snap', 'G', toggleSnap], ['Atmosphere panel', 'A', toggleAtmo], ['Fly mode', 'Ctrl+Alt+Q', toggleFly], ['Collision', 'M', toggleCollide], ['Dynamic lighting', 'L', () => setLights(!lightsOn)]],
  Tools: [['Spiral staircase', '', () => gen('spiral')], ['Ring of pillars', '', () => gen('ring')], ['Pyramid tower', '', () => gen('tower')], ['Checker floor', '', () => gen('checker')], ['Helix of spheres', '', () => gen('helix')]],
  Settings: [['Light mode', '', toggleTheme, () => document.documentElement.dataset.theme === 'light'], ['Show grid', '', () => { gridH.visible = !gridH.visible; }, () => gridH.visible], ['Snap to grid', 'G', toggleSnap, () => $('snap').checked], ['Snap to blocks', 'Ctrl+O', toggleSnapB, () => snapB], ['Collision', 'M', toggleCollide, () => collide], ['Dynamic lighting', 'L', () => setLights(!lightsOn), () => lightsOn], ['Fly mode', 'Ctrl+Alt+Q', toggleFly, () => flyMode], ['Keep transforms when placing', 'Ctrl+P', toggleKeep, () => keepXf], ['Duplicate in place', '', () => { dupInPlace = !dupInPlace; flash('Duplicate in place ' + (dupInPlace ? 'on' : 'off')); }, () => dupInPlace]],
  Help: [['Keyboard shortcuts', '?', showHelp], ['Show GRAB format fields', '', showFormat]]
};
Object.entries(MENUS).forEach(([name, items]) => {
  const d = el('details', { className: 'menu' }, el('summary', { textContent: name })), list = el('div'), subs = [];
  items.forEach(([t, k, fn, get]) => {
    const sp = el('span', { textContent: t }); if (get) subs.push(() => { sp.textContent = (get() ? '\u2713 ' : '\u2003 ') + t; });
    list.append(el('button', { onclick: () => { d.removeAttribute('open'); fn(); } }, sp, el('kbd', { textContent: k })));
  });
  d.addEventListener('toggle', () => subs.forEach(f => f()));
  d.append(list); $('menus').append(d);
});
document.addEventListener('pointerdown', e => document.querySelectorAll('.menu[open]').forEach(d => { if (!d.contains(e.target)) d.removeAttribute('open'); }));

/* ---------- form helpers ---------- */
const hint = t => el('p', { className: 'hint', textContent: t });
function num(val, on, step = 1) { return el('input', { type: 'number', step, value: val, oninput: e => { const v = parseFloat(e.target.value); if (isFinite(v)) on(v); } }); }
function color(val, on) { return el('input', { type: 'color', value: val, oninput: e => on(e.target.value) }); }
document.body.append(el('datalist', { id: 'animNames' }));
function updateAnimNames() {
  const names = new Set(); group.children.forEach(b => ((b.userData.cfg || {}).anims || []).forEach(a => names.add(a.name)));
  $('animNames').replaceChildren(...[...names].map(n => el('option', { value: n })));
}

/* ---------- sound block ---------- */
const SND = {
  'Pickup/Coin': { f: [880, 1760], w: 'square' }, 'Laser/Shoot': { f: [1400, 200], w: 'sawtooth' }, 'Explosion': { f: [0, 0], w: 'noise' },
  'PowerUp': { f: [300, 1200], w: 'square' }, 'Hit/Hurt': { f: [400, 80], w: 'sawtooth' }, 'Jump': { f: [250, 700], w: 'square' },
  'Blip/Select': { f: [600, 600], w: 'square' }, 'Synth': { f: [220, 220], w: 'sawtooth' }, 'Tone': { f: [440, 440], w: 'sine' },
  'Click': { f: [1000, 1000], w: 'square' }, 'Random': {}
};
let actx;
function playSound(c) {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  const keys = Object.keys(SND).filter(k => k !== 'Random');
  const P = c.mode === 'simple' ? (c.preset === 'Random' ? SND[keys[Math.floor(Math.random() * keys.length)]] : SND[c.preset]) : { f: [c.freq, c.freq], w: c.wave.toLowerCase() };
  const t0 = actx.currentTime, len = Math.max(0.02, c.length), g = actx.createGain(); let src;
  g.gain.setValueAtTime(Math.min(1, c.volume) * 0.3, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len); g.connect(actx.destination);
  if (P.w === 'noise') {
    const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src = actx.createBufferSource(); src.buffer = buf;
  } else {
    const k = c.mode === 'simple' ? c.freq / 440 : 1; src = actx.createOscillator(); src.type = P.w;
    src.frequency.setValueAtTime(P.f[0] * k, t0); src.frequency.exponentialRampToValueAtTime(Math.max(20, P.f[1] * k), t0 + len);
  }
  src.connect(g); src.start(t0); src.stop(t0 + len);
}
function soundPanel(box, b, c) {
  box.append(el('h4', { textContent: 'Sound' }), field('Mode', sel([['simple', 'Simple'], ['advanced', 'Advanced']], c.mode, v => { c.mode = v; changed(); renderInspector(); })));
  if (c.mode === 'simple') box.append(field('Preset', sel(Object.keys(SND).map(k => [k, k]), c.preset, v => { c.preset = v; changed(); })));
  else box.append(field('Waveform', sel(['Square', 'Sawtooth', 'Sine', 'Noise'].map(k => [k, k]), c.wave, v => { c.wave = v; changed(); })));
  box.append(field('Volume', num(c.volume, v => { c.volume = v; changed(); }, 0.1)), field('Max range', num(c.range, v => { c.range = v; changed(); }, 1)),
    field('Length (s)', num(c.length, v => { c.length = v; changed(); }, 0.1)), field('Frequency', num(c.freq, v => { c.freq = v; changed(); }, 10)),
    btn('Play preview', () => playSound(c), 'primary'), hint('Plays in the game when a trigger targets this block. The preview is only an approximation of the in-game sound.'));
}

/* ---------- light block ---------- */
function syncLight(b) {
  b.children.filter(x => x.isLight || x.userData.lt).forEach(x => b.remove(x));
  const c = b.userData.cfg, col = new THREE.Color(c.color), rad = THREE.MathUtils.degToRad;
  const L = c.kind === 'spot' ? new THREE.SpotLight(col, c.brightness * 60, c.range, rad(c.angle / 2), Math.min(1, c.spotFalloff / 2), 2) : new THREE.PointLight(col, c.brightness * 30, c.range, 2);
  if (L.target) { L.target.position.set(0, 0, -1); L.target.userData.lt = true; b.add(L.target); }
  b.add(L);
  if (b.material === specMat('Light')) b.material = b.material.clone();
  b.material.color.set(c.color);
}
function capLights() { let n = 0; group.children.forEach(b => b.children.forEach(x => { if (x.isLight) { const on = lightsOn && n++ < 8; if (x.visible !== on) x.visible = on; } })); }
function lightPanel(box, b, c) {
  const upd = f => v => { f(v); syncLight(b); changed(); };
  box.append(el('h4', { textContent: 'Light' }),
    field('Type', sel([['point', 'Point'], ['spot', 'Spotlight']], c.kind, v => { c.kind = v; syncLight(b); changed(); renderInspector(); })),
    field('Color', color(c.color, upd(v => { c.color = v; }))),
    field('Brightness', num(c.brightness, upd(v => { c.brightness = v; }), 0.1)),
    field('Range', num(c.range, upd(v => { c.range = v; }), 1)),
    field('Falloff', num(c.falloff, upd(v => { c.falloff = v; }), 0.1)));
  if (c.kind === 'spot') box.append(field('Spot angle', num(c.angle, upd(v => { c.angle = v; }), 5)), field('Spot falloff', num(c.spotFalloff, upd(v => { c.spotFalloff = v; }), 0.1)));
  box.append(hint('In the game only 3 lights can overlap (the newest turns off). Spotlights point along the block\u2019s forward direction, so rotate it to aim. The editor shows at most 8 lights live.'));
}

/* ---------- atmosphere ---------- */
const DEFAULT_AMB = { sunAzimuth: 315, sunAltitude: 45, sunSize: 1, sunColor: '#ffffff', sunBrightness: 1, ambientBrightness: 1, fogDensity: 0, skyZenith: '#2c6fd8', skyHorizon: '#e6f2fb' };
let amb = { ...DEFAULT_AMB };
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
scene.add(sunMesh);
function skyTex(zen, hor) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, zen); gr.addColorStop(0.5, hor); gr.addColorStop(1, '#f1e4c3'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function applyAmb(a) {
  const az = THREE.MathUtils.degToRad(a.sunAzimuth), al = THREE.MathUtils.degToRad(a.sunAltitude);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(al), Math.sin(al), Math.cos(az) * Math.cos(al));
  sun.position.copy(dir).multiplyScalar(30); sun.color.set(a.sunColor); sun.intensity = a.sunBrightness * 1.8;
  hemi.intensity = a.ambientBrightness * 1.3;
  sunMesh.position.copy(dir).multiplyScalar(400); sunMesh.scale.setScalar(12 * a.sunSize); sunMesh.material.color.set(a.sunColor);
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = skyTex(a.skyZenith, a.skyHorizon);
  scene.fog = a.fogDensity > 0 ? new THREE.FogExp2(a.skyHorizon, a.fogDensity * 0.05) : null;
  if (!lightsOn) { sun.visible = false; hemi.intensity = 2.6; }
}
function ambFields(o, on) {
  const w = el('div'), set = (k, v) => { o[k] = v; on(); };
  [['sunAzimuth', 'Sun azimuth', 0, 360, 1], ['sunAltitude', 'Sun altitude', -10, 90, 1], ['sunSize', 'Sun size', 0.1, 5, 0.1], ['sunBrightness', 'Sun brightness', 0, 3, 0.1], ['ambientBrightness', 'Ambient light', 0, 3, 0.1], ['fogDensity', 'Fog density', 0, 2, 0.05]]
    .forEach(([k, l, mn, mx, st]) => w.append(field(l, el('input', { type: 'range', min: mn, max: mx, step: st, value: o[k], oninput: e => set(k, parseFloat(e.target.value)) }))));
  [['sunColor', 'Sun color'], ['skyZenith', 'Sky top'], ['skyHorizon', 'Sky horizon']].forEach(([k, l]) => w.append(field(l, color(o[k], v => set(k, v)))));
  return w;
}
function renderAtmo() {
  $('atmoBody').replaceChildren(ambFields(amb, () => { applyAmb(amb); changed(); }), btn('Reset to default', () => { Object.assign(amb, DEFAULT_AMB); applyAmb(amb); changed(); renderAtmo(); }));
}
function toggleAtmo() { $('atmo').hidden = !$('atmo').hidden; if (!$('atmo').hidden) renderAtmo(); }
$('atmoBtn').onclick = toggleAtmo; $('atmoX').onclick = toggleAtmo;
const hx = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255, a: 1 });
const ambOut = () => ({ sunAzimuth: amb.sunAzimuth, sunAltitude: amb.sunAltitude, sunSize: amb.sunSize, fogDDensity: amb.fogDensity, skyZenithColor: hx(amb.skyZenith), skyHorizonColor: hx(amb.skyHorizon) });
const ambIn = a => a ? { ...DEFAULT_AMB, sunAzimuth: a.sunAzimuth || 0, sunAltitude: a.sunAltitude || 0, sunSize: a.sunSize ?? 0, fogDensity: a.fogDDensity || 0, skyZenith: a.skyZenithColor ? rgbHex(a.skyZenithColor) : DEFAULT_AMB.skyZenith, skyHorizon: a.skyHorizonColor ? rgbHex(a.skyHorizonColor) : DEFAULT_AMB.skyHorizon } : undefined;
applyAmb(amb);

/* ---------- look, signs, lighting, fly, collision ---------- */
function paint(b) {
  if (!SHAPES[b.userData.s]) return;
  const c = b.userData.cfg, m = getMat(b.userData.m).clone();
  m.color.set(colorOf(b)); m.roughness = 1 - (c.spec || 0) * 0.9;
  if (c.neon) { m.emissive.set(colorOf(b)); m.emissiveMap = m.map; }
  if (c.transp) { m.transparent = true; m.opacity = Math.min(m.opacity, 0.5); m.depthWrite = false; }
  if (c.add) { m.blending = THREE.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
  b.material = m;
}
function colorOf(b) {
  const c = b.userData.cfg, m = b.userData.m; if (m !== 'Colored' && m !== 'Lava') return '#ffffff';
  return (c.cmode || (m === 'Colored' ? 'custom' : 'default')) === 'custom' ? (c.color || '#ffffff') : '#ffffff';
}
function colorPanel(box, b, c) {
  const m = b.userData.m, mode = c.cmode || (m === 'Colored' ? 'custom' : 'default');
  const set = (k, v) => { multi.forEach(o => { if (SHAPES[o.userData.s]) { o.userData.cfg[k] = v; paint(o); } }); changed(); };
  const cb = (l, k) => field(l, el('input', { type: 'checkbox', checked: !!c[k], onchange: e => set(k, e.target.checked) }));
  box.append(el('h4', { textContent: multi.size > 1 ? 'Look (all ' + multi.size + ' selected)' : 'Look' }));
  if (m === 'Colored' || m === 'Lava') {
    box.append(field('Color mode', sel([['default', 'Default'], ['custom', 'Custom color']], mode, v => { set('cmode', v); renderInspector(); })));
    if (mode === 'custom') box.append(field('Color', color(c.color || '#ffffff', v => set('color', v))));
  }
  box.append(field('Specular', el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: c.spec || 0, oninput: e => set('spec', parseFloat(e.target.value)) })),
    cb('Neon', 'neon'), cb('Transparent', 'transp'), cb('Additive', 'add'), cb('Physics', 'phys'),
    hint('Neon, transparent, additive, specular and physics show in the editor, but the current GRAB format has no fields for them, so they are not exported.'));
  if (m === 'Crumbling') box.append(field('Stable time', num(c.stable ?? 1, v => set('stable', v), 0.1)), field('Respawn time', num(c.respawn ?? 5, v => set('respawn', v), 0.1)));
}
const rgbHex = c => c ? '#' + [c.r, c.g, c.b].map(x => Math.round(Math.min(1, Math.max(0, x ?? 0)) * 255).toString(16).padStart(2, '0')).join('') : '#ffffff';
function signTex(b) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = '#f5e9c8'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#222'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center';
  const L = (b.userData.cfg.text || '').split('\n').slice(0, 6);
  L.forEach((l, i) => g.fillText(l.slice(0, 16), 128, 135 + (i - (L.length - 1) / 2) * 34));
  b.material = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv) });
}
function signPanel(box, b, c) {
  box.append(el('h4', { textContent: 'Sign' }), el('textarea', { value: c.text, rows: 5, oninput: e => { c.text = e.target.value; signTex(b); changed(); } }), hint('Text shown on the sign in game.'));
}
function setLights(on) { lightsOn = on; sun.visible = on; hemi.intensity = on ? amb.ambientBrightness * 1.3 : 2.6; capLights(); flash('Dynamic lighting ' + (on ? 'on' : 'off')); }
function toggleKeep() { keepXf = !keepXf; flash('Keep transforms ' + (keepXf ? 'on' : 'off')); }
function toggleCollide() { collide = !collide; flash('Collision ' + (collide ? 'on' : 'off')); }
const placeScale = () => keepXf && lastXf ? new THREE.Vector3(...lastXf.sc) : new THREE.Vector3(1, 1, 1);
const BX = new THREE.Box3(), BY = new THREE.Box3();
function hits(m) {
  if (!collide || (m !== ghost && !SHAPES[m.userData.s])) return false;
  BX.setFromObject(m).expandByScalar(-0.02);
  return group.children.some(o => o !== m && !multi.has(o) && SHAPES[o.userData.s] && BX.intersectsBox(BY.setFromObject(o)));
}
const keys = {}; let look = null;
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function toggleFly() {
  flyMode = !flyMode; controls.enabled = !flyMode; flyLast = performance.now();
  if (flyMode) { tc.detach(); camera.rotation.order = 'YXZ'; camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ'); }
  else controls.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6));
  flash(flyMode ? 'Fly mode: WASD, Shift = 2x, right-drag to look' : 'Fly mode off');
}
function flyTick() {
  const n = performance.now(), dt = Math.min(0.1, (n - flyLast) / 1000); flyLast = n;
  const sp = (keys.shift ? 16 : 8) * dt, d = camera.getWorldDirection(new THREE.Vector3()), r = new THREE.Vector3().crossVectors(d, camera.up).normalize();
  if (keys.w) camera.position.addScaledVector(d, sp); if (keys.s) camera.position.addScaledVector(d, -sp);
  if (keys.d) camera.position.addScaledVector(r, sp); if (keys.a) camera.position.addScaledVector(r, -sp);
}
cvs.addEventListener('contextmenu', e => { if (flyMode) e.preventDefault(); });
cvs.addEventListener('pointerdown', e => { if (flyMode && e.button === 2) { look = { x: e.clientX, y: e.clientY }; cvs.setPointerCapture(e.pointerId); } });
cvs.addEventListener('pointermove', e => {
  if (!look) return;
  camera.rotation.y -= (e.clientX - look.x) * 0.004; camera.rotation.x = Math.max(-1.5, Math.min(1.5, camera.rotation.x - (e.clientY - look.y) * 0.004));
  look = { x: e.clientX, y: e.clientY };
});
cvs.addEventListener('pointerup', () => { look = null; });


/* ---------- multi-select, groups, snapping, tiling, textures ---------- */
const pivot = new THREE.Object3D(); scene.add(pivot); let mstart = null; const mbox = [];
function attachMulti() { const b = new THREE.Box3(); multi.forEach(m => b.expandByObject(m)); pivot.position.copy(b.getCenter(new THREE.Vector3())); pivot.quaternion.identity(); pivot.scale.set(1, 1, 1); pivot.updateMatrixWorld(); tc.attach(pivot); }
function applyMulti() {
  pivot.updateMatrixWorld(); const M = pivot.matrixWorld.clone().multiply(mstart.inv);
  mstart.list.forEach(x => { x.m.matrix.copy(M).multiply(x.mat).decompose(x.m.position, x.m.quaternion, x.m.scale); constrain(x.m); tileUV(x.m); });
  mbox.forEach(b => b.update());
}
function selectMany(list) {
  if (list.length < 2) { select(list[0] || null); return; }
  selectCore(null); multi = new Set(list); selected = list[list.length - 1]; selBox.visible = false;
  if (tool === 'select') attachMulti();
  renderInspector(); fillTransform(); queueRefresh();
}
function pickSel(m) { if (m && m.userData.gid) selectMany(group.children.filter(o => o.userData.gid === m.userData.gid)); else select(m); }
function updateMulti() {
  mbox.forEach(b => { scene.remove(b); b.geometry.dispose(); }); mbox.length = 0;
  if (multi.size > 1) [...multi].slice(0, 150).forEach(m => { const h = new THREE.BoxHelper(m, 0xffc93c); mbox.push(h); scene.add(h); });
}
function makeGroup() {
  const L = [...multi].filter(m => m.userData.s !== 'Start' && m.userData.s !== 'Finish');
  if (L.length < 2) { flash('Select 2 or more blocks (not Start or Finish) to group'); return; }
  const id = uid(); L.forEach(m => { m.userData.gid = id; }); changed(); flash('Grouped ' + L.length + ' blocks');
}
function ungroup() { multi.forEach(m => { m.userData.gid = ''; }); changed(); flash('Ungrouped'); }
const mq = el('div'); Object.assign(mq.style, { position: 'absolute', border: '1px solid #ffc93c', background: 'rgba(255,201,60,.15)', pointerEvents: 'none', display: 'none', zIndex: 4 }); view.append(mq);
let box0 = null;
cvs.addEventListener('pointerdown', e => {
  if (tool !== 'select' || e.button !== 0 || !(e.ctrlKey || e.shiftKey) || tc.axis || flyMode) return;
  box0 = { x: e.clientX, y: e.clientY }; controls.enabled = false; cvs.setPointerCapture(e.pointerId);
}, true);
cvs.addEventListener('pointermove', e => {
  if (!box0) return; const r = view.getBoundingClientRect();
  Object.assign(mq.style, { display: 'block', left: Math.min(box0.x, e.clientX) - r.left + 'px', top: Math.min(box0.y, e.clientY) - r.top + 'px', width: Math.abs(e.clientX - box0.x) + 'px', height: Math.abs(e.clientY - box0.y) + 'px' });
});
cvs.addEventListener('pointerup', e => {
  if (!box0) return; const b0 = box0; box0 = null; controls.enabled = !flyMode; mq.style.display = 'none';
  const list = new Set(multi), add = m => group.children.forEach(o => { if (o === m || (m.userData.gid && o.userData.gid === m.userData.gid)) list.add(o); });
  if (Math.hypot(e.clientX - b0.x, e.clientY - b0.y) > 5) {
    const r = cvs.getBoundingClientRect(), x1 = Math.min(b0.x, e.clientX), x2 = Math.max(b0.x, e.clientX), y1 = Math.min(b0.y, e.clientY), y2 = Math.max(b0.y, e.clientY);
    group.children.forEach(m => { const v = m.position.clone().project(camera); if (v.z > 1) return; const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top; if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) add(m); });
  } else {
    const h = pick(e);
    if (h && h.mesh) { const had = list.has(h.mesh); group.children.forEach(o => { if (o === h.mesh || (h.mesh.userData.gid && o.userData.gid === h.mesh.userData.gid)) had ? list.delete(o) : list.add(o); }); }
  }
  selectMany([...list]);
});
function oneWay(m) {
  const q = before.q, c = ['x', 'y', 'z']; m.position.copy(before.p);
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].forEach((a, i) => m.position.addScaledVector(a.applyQuaternion(q), (m.scale[c[i]] - before.s[c[i]]) / 2));
}
function snapToBlocks(m) {
  const T = 0.3, a = new THREE.Box3().setFromObject(m), best = [null, null, null];
  group.children.forEach(o => {
    if (o === m || multi.has(o) || !SHAPES[o.userData.s]) return;
    const b = BY.setFromObject(o);
    ['x', 'y', 'z'].forEach((k, i) => {
      const ac = [a.min[k], a.max[k], (a.min[k] + a.max[k]) / 2], bc = [b.min[k], b.max[k], (b.min[k] + b.max[k]) / 2];
      ac.forEach(x => bc.forEach(y => { const d = y - x; if (Math.abs(d) < T && (best[i] === null || Math.abs(d) < Math.abs(best[i]))) best[i] = d; }));
    });
  });
  best.forEach((d, i) => { if (d !== null) m.position['xyz'[i]] += d; });
}
function placePos(h) {
  const p = placement(h); if (!snapB) return p;
  ghost.position.copy(p); ghost.scale.copy(placeScale()); ghost.updateMatrixWorld(); snapToBlocks(ghost); return ghost.position.clone();
}
function toggleSnapB() { snapB = !snapB; flash('Snap to blocks ' + (snapB ? 'on' : 'off')); }
function tileUV(b) {
  if (!b || !SHAPES[b.userData.s]) return;
  const g = b.geometry, uv = g.attributes.uv; if (!uv) return;
  if (!g.userData.uv0) g.userData.uv0 = uv.array.slice();
  const o = g.userData.uv0, s = b.scale, cube = b.userData.s === 'Cube';
  for (let i = 0; i < uv.count; i++) {
    let a, c; if (cube) { const f = Math.floor(i / 4); [a, c] = f < 2 ? [s.z, s.y] : f < 4 ? [s.x, s.z] : [s.x, s.y]; } else { a = (s.x + s.z) / 2; c = s.y; }
    uv.setXY(i, o[2 * i] * a, o[2 * i + 1] * c);
  }
  uv.needsUpdate = true;
}
// textures from the repo's textures/ folder (lowercase names, e.g. textures/lava.png, textures/grapplelava.png)
Object.keys(MATS).forEach(n => {
  const names = [...new Set([slug(n), slug(MATS[n].g)])], exts = ['png', 'jpg', 'jpeg', 'webp'], urls = names.flatMap(x => exts.map(e => 'textures/' + x + '.' + e));
  const next = i => { if (i >= urls.length) return; const im = new Image(); im.onload = () => applyTex(n, urls[i]); im.onerror = () => next(i + 1); im.src = urls[i]; };
  next(0);
});

function partsFields(b, c) {
  c.parts = c.parts || { head: true, feet: true, handL: true, handR: true, grappleL: false, grappleR: false };
  const w = el('div'); w.append(el('h5', { textContent: 'Triggered by' }));
  [['head', 'Head'], ['feet', 'Feet'], ['handL', 'Left hand'], ['handR', 'Right hand'], ['grappleL', 'Left grapple'], ['grappleR', 'Right grapple']].forEach(([k, l]) => w.append(field(l, el('input', { type: 'checkbox', checked: !!c.parts[k], onchange: e => { c.parts[k] = e.target.checked; changed(); } }))));
  w.append(linkList(b, 'only', 'Only these blocks (empty = any block)'), hint('Saved in your project; the current GRAB format has no trigger blocks, so this is not exported.'));
  return w;
}
function constrain(m) {
  const k = m.userData.s;
  if (k === 'Sound' || k === 'Light') m.scale.set(1, 1, 1);
  else if (k === 'Start' || k === 'Finish') { const r = Math.max(m.scale.x, m.scale.z, 0.25); m.scale.set(r, 1, r); }
}
function renameProject() { const n = prompt('Project name', current.name); if (n && n.trim()) { current.name = n.trim().slice(0, 40); $('projName').textContent = current.name; saveNow(); } }
$('projName').ondblclick = renameProject; $('projName').title = 'Double-click to rename';

/* ---------- theme, folders drag, presets, generators, export dialog ---------- */
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('levelstudio.theme', t); } catch {} }
function toggleTheme() { setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); }
{ let t = null; try { t = localStorage.getItem('levelstudio.theme'); } catch {} setTheme(t || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')); }
$('themeBtn').onclick = toggleTheme;
let dragB = null;
function dropInto(h) {
  if (!dragB) return; const L = multi.has(dragB) ? [...multi] : [dragB];
  L.forEach(o => { if (h.userData.gid) { o.userData.gid = h.userData.gid; o.userData.gname = h.userData.gname; } else { o.userData.gid = ''; o.userData.folder = h.userData.folder; } });
  dragB = null; changed();
}
$('outliner').ondragover = e => e.preventDefault();
$('outliner').ondrop = e => { if (e.target === $('outliner') && dragB) { const L = multi.has(dragB) ? [...multi] : [dragB]; L.forEach(o => { o.userData.gid = ''; o.userData.folder = ''; }); dragB = null; changed(); } };
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const turn = (q, ax, deg) => new THREE.Quaternion().setFromAxisAngle(AX[ax], THREE.MathUtils.degToRad(deg)).multiply(new THREE.Quaternion().fromArray(q)).toArray();
const mv = (P, t, d = [0, 0, 0], k = 1, ax, deg = 0) => ({ t, p: [P.p[0] + d[0], P.p[1] + d[1], P.p[2] + d[2]], q: ax ? turn(P.q, ax, deg) : P.q, s: P.s.map(x => x * k) });
const PRESETS = {
  'Full 360 spin': P => [0, 1, 2, 3, 4].map(i => mv(P, i, [0, 0, 0], 1, 'y', i * 90)),
  'Move up and down': P => [mv(P, 0), mv(P, 1.5, [0, 3, 0]), mv(P, 3)],
  'Move side to side': P => [mv(P, 0), mv(P, 1.5, [4, 0, 0]), mv(P, 3)],
  'Pulse (grow and shrink)': P => [mv(P, 0), mv(P, 1, [0, 0, 0], 1.5), mv(P, 2)],
  'Rock back and forth': P => [mv(P, 0, [0, 0, 0], 1, 'z', -30), mv(P, 1, [0, 0, 0], 1, 'z', 30), mv(P, 2, [0, 0, 0], 1, 'z', -30)]
};
function gen(kind) {
  const o = selected ? selected.position.clone() : new THREE.Vector3(0, 0, 0), L = [], mk = (sh, p, sc, q, m) => L.push(addBlock({ s: sh, m: m || matName, p, sc, q }));
  const yq = a => turn([0, 0, 0, 1], 'y', THREE.MathUtils.radToDeg(a));
  if (kind === 'spiral') for (let i = 0; i < 24; i++) { const a = i * 0.5; mk('Cube', [o.x + Math.cos(a) * 4, o.y + i * 0.5, o.z + Math.sin(a) * 4], [2, 0.5, 1.5], yq(-a)); }
  if (kind === 'ring') for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; mk('Cylinder', [o.x + Math.cos(a) * 6, o.y + 2, o.z + Math.sin(a) * 6], [1, 4, 1]); }
  if (kind === 'tower') for (let i = 0; i < 6; i++) mk('Pyramid', [o.x, o.y + 0.5 + i * 1, o.z], [6 - i, 1, 6 - i]);
  if (kind === 'checker') for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) mk('Cube', [o.x + x * 2, o.y, o.z + z * 2], [2, 0.5, 2], undefined, (x + z) % 2 ? 'Default' : 'Grabbable');
  if (kind === 'helix') for (let i = 0; i < 30; i++) { const a = i * 0.45; mk('Sphere', [o.x + Math.cos(a) * 3, o.y + i * 0.4, o.z + Math.sin(a) * 3], [0.8, 0.8, 0.8]); }
  selectMany(L);
}
function pickThumb() {
  const f = el('input', { type: 'file', accept: 'image/*', onchange: () => {
    const file = f.files[0]; if (!file) return; const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = 16 / 9, cw = img.width / img.height > r ? img.height * r : img.width, ch = img.width / img.height > r ? img.height : img.width / r;
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      c.getContext('2d').drawImage(img, (img.width - cw) / 2, (img.height - ch) / 2, cw, ch, 0, 0, 1280, 720); thumbData = c.toDataURL('image/png'); URL.revokeObjectURL(url);
    }; img.src = url;
  } }); f.click();
}
function exportLevel() {
  if (!current) return;
  const m = current.meta = current.meta || { creators: 'Level Studio', description: 'Made with Level Studio', checkpoints: 10 };
  const t = el('input', { value: current.name, maxLength: 40 }), cr = el('input', { value: m.creators }), de = el('textarea', { value: m.description, rows: 4 }), cp = el('input', { type: 'number', min: 1, max: 100, value: m.checkpoints });
  const d = el('dialog', {}, el('h3', { textContent: 'Export level' }), field('Title', t), field('Creators', cr), field('Description', de), field('Checkpoints', cp));
  const go = () => { current.name = t.value.trim() || current.name; m.creators = cr.value; m.description = de.value; m.checkpoints = Math.max(1, parseInt(cp.value) || 10); $('projName').textContent = current.name; saveNow(); d.close(); d.remove(); doExport(); };
  d.append(el('div', { className: 'row' }, btn('Cancel', () => { d.close(); d.remove(); }), btn('Export', go, 'primary')));
  d.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && keys.tab && e.key.toLowerCase() === 'i') { e.preventDefault(); pickThumb(); } });
  document.body.append(d); d.showModal();
}
fetch('new.level').then(r => r.ok ? r.arrayBuffer() : null).then(b => {
  tpl = b; let seeded = false; try { seeded = !!localStorage.getItem('levelstudio.seeded'); } catch {}
  if (b && !projects.length && !seeded) { try { localStorage.setItem('levelstudio.seeded', '1'); } catch {} importLevel(new File([b], 'new.level')); }
}).catch(() => {});

renderList(); refreshUI();
