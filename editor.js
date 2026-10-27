import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = id => document.getElementById(id);

/* ---------- projects (saved in this browser) ---------- */
const KEY = 'levelstudio.projects.v1';
let projects = [];
try { projects = JSON.parse(localStorage.getItem(KEY)) || []; } catch { projects = []; }
const writeStore = () => { try { localStorage.setItem(KEY, JSON.stringify(projects)); return true; } catch { return false; } };
let current = null;

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
    li.append(open, del);
    ul.append(li);
  });
}

function createProject() {
  const name = $('newName').value.trim() || 'Untitled level';
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
    const m = MATS[name] || MATS.Default, tex = new THREE.CanvasTexture(drawTex(m));
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
scene.add(new THREE.GridHelper(40, 40, 0x3a6a9a, 0x7fa6cc));

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(6, 5, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0); controls.enableDamping = true;

const group = new THREE.Group(); scene.add(group);       // all placed blocks
const selBox = new THREE.BoxHelper(new THREE.Mesh(), 0xffc93c); selBox.visible = false; scene.add(selBox);

/* ---------- editor state ---------- */
let tool = 'place', shape = 'Cube', matName = 'Stone', selected = null;
const undoStack = [], redoStack = [];
function pushCmd(u, r) { undoStack.push({ u, r }); redoStack.length = 0; }
let linkMode = null;
const previews = new Map();

// move / rotate / scale gizmo
const SNAP_ROT = THREE.MathUtils.degToRad(15);
const tc = new TransformControls(camera, renderer.domElement);
tc.setTranslationSnap(0.25); tc.setRotationSnap(SNAP_ROT); tc.setScaleSnap(0.25);
scene.add(tc);
function syncSel() { if (!selected) return; selBox.setFromObject(selected); fillTransform(); }
let before = null;
tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
tc.addEventListener('mouseDown', () => { const m = tc.object; if (m) before = { m, p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone() }; });
tc.addEventListener('mouseUp', () => {
  if (!before) return;
  const b = before; before = null;
  if (!b.m.position.equals(b.p) || !b.m.quaternion.equals(b.q) || !b.m.scale.equals(b.s))
    {
      const n = { p: b.m.position.clone(), q: b.m.quaternion.clone(), s: b.m.scale.clone() };
      const put = (p, q, sc) => () => { b.m.position.copy(p); b.m.quaternion.copy(q); b.m.scale.copy(sc); syncSel(); };
      pushCmd(put(b.p, b.q, b.s), put(n.p, n.q, n.s));
    }
});
tc.addEventListener('objectChange', () => { syncSel(); changed(); });
const getScale = () => new THREE.Vector3(...['sx', 'sy', 'sz'].map(id => Math.max(0.25, parseFloat($(id).value) || 1)));

const ghost = new THREE.Mesh(SHAPES.Cube(), new THREE.MeshStandardMaterial({ color: 0xffc93c, transparent: true, opacity: 0.5 }));
ghost.visible = false; scene.add(ghost);
function updateGhost() { ghost.geometry.dispose(); ghost.geometry = geoFor(shape); ghost.scale.copy(getScale()); }

function makeBlock(d) {
  const mesh = new THREE.Mesh(geoFor(d.s), SPECIALS[d.s] ? specMat(d.s) : getMat(d.m));
  mesh.position.fromArray(d.p); mesh.scale.fromArray(d.sc); if (d.q) mesh.quaternion.fromArray(d.q);
  mesh.userData = { s: d.s, m: d.m, id: d.id || uid(), cfg: migrateCfg(d.cfg ? JSON.parse(JSON.stringify(d.cfg)) : defCfg(d.s), d.s) };
  if (d.s === 'Light') syncLight(mesh);
  return mesh;
}
const blockData = b => ({ s: b.userData.s, m: b.userData.m, id: b.userData.id, cfg: b.userData.cfg, p: b.position.toArray(), q: b.quaternion.toArray(), sc: b.scale.toArray() });
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
  selected = mesh; selBox.visible = !!mesh;
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
  const sc = getScale(), n = h.normal;
  const p = h.point.clone().add(n.clone().multiply(sc).multiplyScalar(0.5));
  ['x', 'y', 'z'].forEach(a => { if (Math.abs(n[a]) < 0.5) p[a] = Math.round(p[a] * 4) / 4; });
  return p;
}

const cvs = renderer.domElement;
let down = null;
cvs.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, b: e.button, gizmo: tc.axis !== null }; });
cvs.addEventListener('pointermove', e => {
  if (tool !== 'place') { ghost.visible = false; return; }
  const h = pick(e);
  ghost.visible = !!h;
  if (h) ghost.position.copy(placement(h));
});
cvs.addEventListener('pointerleave', () => { ghost.visible = false; });
cvs.addEventListener('pointerup', e => {
  if (!down || down.b !== 0 || down.gizmo || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
  down = null;
  const h = pick(e);
  if (tool === 'place') {
    if (h) addBlock({ s: shape, m: matName, p: placement(h).toArray(), sc: getScale().toArray() });
  } else if (linkMode && h && h.mesh) toggleLink(h.mesh);
  else select(h && h.mesh ? h.mesh : null);
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
$('snap').onchange = () => {
  const on = $('snap').checked;
  tc.setTranslationSnap(on ? 0.25 : null); tc.setRotationSnap(on ? SNAP_ROT : null); tc.setScaleSnap(on ? 0.25 : null);
};

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
    if (tool === 'select' && selected && !SPECIALS[selected.userData.s]) { selected.material = getMat(n); selected.userData.m = n; changed(); }
    refreshUI();
  };
  $('mats').append(b);
});
['sx', 'sy', 'sz'].forEach(id => $(id).addEventListener('input', () => {
  updateGhost();
  if (selected) { selected.scale.copy(getScale()); selBox.setFromObject(selected); changed(); }
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
  controls.update(); tickPreviews(); renderer.render(scene, camera);
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
  const q = { x: 0, y: 0, z: 0, w: 1 }, nodes = []; let cx = 0, hasStart = false;
  for (const b of group.children) {
    const [x, y, z] = b.position.toArray(), [sx, sy, sz] = b.scale.toArray(), s = b.userData.s;
    const position = { x, y, z }, scale = { x: sx, y: sy, z: sz };
    const [qx, qy, qz, qw] = b.quaternion.toArray(), q = { x: qx, y: qy, z: qz, w: qw };
    if (SHAPES[s]) {
      const m = MATS[b.userData.m] || MATS.Default;
      nodes.push({ levelNodeStatic: { shape: SHAPE_ENUM[s], material: m.g, position, scale, rotation: q, color: { r: 1, g: 1, b: 1, a: 1 } } });
      cx += m.g === 'GRABBABLE_CRUMBLING' ? 3 : 2;
    } else if (s === 'Start') { hasStart = true; nodes.push({ levelNodeStart: { position, rotation: q } }); }
    else if (s === 'Finish') nodes.push({ levelNodeFinish: { position, radius: Math.max(sx, sz) / 2 } });
    else if (s === 'Trigger') { nodes.push({ levelNodeTrigger: { position, scale, rotation: q } }); cx += 2; }
    else if (s === 'Gravity') { nodes.push({ levelNodeGravity: { position, scale, rotation: q } }); cx += 2; }
    else if (s === 'Particle') { nodes.push({ levelNodeParticleEmitter: { position, rotation: q } }); cx += 2; }
    else if (s === 'Code') nodes.push({ levelNodeCode: { position, scale, rotation: q, code: b.userData.cfg.code || '' } });
    else if (s === 'Sound') nodes.push({ levelNodeSound: { position, rotation: q } });
    else if (s === 'Light') nodes.push({ levelNodeLight: { position, rotation: q } });
  }
  if (!hasStart) nodes.push({ levelNodeStart: { position: { x: 0, y: 0.5, z: 0 }, rotation: q } });
  return { nodes, cx: group.children.reduce((a, b) => a + cxOf(b), 0) };
}
async function exportLevel() {
  try {
    saveNow();
    const T = await loadSchema(), warn = new Set(), { nodes, cx } = toNodes();
    if (group.children.some(b => { const c = b.userData.cfg || {}; return b.userData.s === 'Trigger' || b.userData.s === 'Sound' || b.userData.s === 'Light' || (c.anims && c.anims.length) || (c.links && c.links.length); }))
      warn.add('Trigger settings, animations, sound and light settings and code links are saved in your project but not exported yet (use Help > Show GRAB format fields so they can be added)');
    const level = { ambienceSettings: ambOut(), formatVersion: 6, title: current.name, creators: 'Level Studio', description: 'Made with Level Studio', complexity: cx, maxCheckpointCount: 10, levelNodes: nodes };
    const clean = conform(T, level, '', warn);
    clean.levelNodes = (clean.levelNodes || []).filter(n => Object.keys(n).length);
    const buf = T.encode(T.fromObject(clean)).finish();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
    a.download = current.name.replace(/[^\w-]+/g, '_') + '.level';
    a.click(); URL.revokeObjectURL(a.href);
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
    const m = getMat(name); m.map = t; m.needsUpdate = true;
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
    for (const n of o.levelNodes || []) {
      const key = Object.keys(n).find(k => k.startsWith('levelNode')), v = (key && n[key]) || {};
      const base = { p: v3(v.position, 0), q: q4(v.rotation), sc: v3(v.scale, 1) };
      if (key === 'levelNodeStatic') {
        const sh = shapeOf(String(v.shape));
        if (sh) blocks.push({ ...base, s: sh, m: matOf(String(v.material)) || 'Default' }); else skip('unknown shape');
      } else if (special[key]) {
        const sp = special[key], r = v.radius;
        blocks.push({ ...base, s: sp, m: '', sc: sp === 'Finish' && r ? [2 * r, 1, 2 * r] : (sp === 'Start' || sp === 'Particle') ? [1, 1, 1] : base.sc });
      } else skip(key || 'unknown node');
    }
    const p = { id: Date.now().toString(36), name: (o.title || file.name.replace(/\.level$/i, '')).slice(0, 40), blocks, updated: Date.now() };
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
  if (s === 'Trigger') return { fire: 'enter', action: 'start', anim: 'Animation1', sublevel: '', targets: [] };
  if (s === 'Code') return { code: STARTER, links: [] };
  if (s === 'Sound') return { mode: 'simple', preset: 'Pickup/Coin', wave: 'Sine', volume: 1, range: 20, length: 0.4, freq: 440 };
  if (s === 'Light') return { kind: 'point', color: '#ffffff', brightness: 1, range: 12, falloff: 1, angle: 45, spotFalloff: 1 };
  if (SHAPES[s]) return { anims: [] };
  return {};
}
const byId = id => group.children.find(b => b.userData.id === id);
const label = b => b.userData.s + ' ' + (group.children.indexOf(b) + 1);
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
  if (SHAPES[s] && !c.anims) c.anims = [];
  return c;
}
function applyPose(b, a, t) {
  const f = a.frames; if (!f.length) return;
  let i = 0; while (i < f.length - 1 && f[i + 1].t <= t) i++;
  const A = f[i], B = f[Math.min(i + 1, f.length - 1)];
  let k = B.t > A.t ? (t - A.t) / (B.t - A.t) : 1; k = Math.min(Math.max(k, 0), 1);
  if (a.smooth) k = k * k * (3 - 2 * k);
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
  box.append(el('h4', { textContent: 'Trigger' }),
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
    field('Smooth', el('input', { type: 'checkbox', checked: !!a.smooth, onchange: e => { a.smooth = e.target.checked; changed(); } })),
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
  if (s === 'Trigger') triggerPanel(box, b, c); else if (s === 'Code') codePanel(box, b, c); else if (s === 'Sound') soundPanel(box, b, c); else if (s === 'Light') lightPanel(box, b, c); else if (SHAPES[s]) animPanel(box, b, c);
}

/* ---------- outliner + status bar ---------- */
let rq = false;
function queueRefresh() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; updateLinks(); capLights(); updateAnimNames(); renderOutliner(); updateStatus(); }); }
function renderOutliner() {
  if ($('editor').hidden) return;
  const kids = group.children, frag = document.createDocumentFragment();
  kids.slice(0, 300).forEach((b, i) => {
    const sp = SPECIALS[b.userData.s], row = el('div', { className: 'orow' + (b === selected ? ' on' : '') }), dot = el('i');
    dot.style.background = sp ? '#' + sp.c.toString(16).padStart(6, '0') : (MATS[b.userData.m] || MATS.Default).c;
    row.append(dot, document.createTextNode(b.userData.s + ' ' + (i + 1) + (sp ? '' : '  \u00b7  ' + b.userData.m)));
    row.onclick = () => { setTool('select'); select(b); };
    frag.append(row);
  });
  if (kids.length > 300) frag.append(el('div', { className: 'omore', textContent: '+ ' + (kids.length - 300) + ' more' }));
  $('outliner').replaceChildren(frag);
  $('outliner').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function updateStatus() {
  $('sbTool').textContent = tool === 'place' ? 'Place: ' + shape : 'Select: ' + { translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[tc.mode];
  $('sbSel').textContent = selected ? label(selected) : 'Nothing selected';
  $('sbCount').textContent = group.children.length + ' blocks, complexity ' + group.children.reduce((a, b) => a + cxOf(b), 0);
  $('ocount').textContent = group.children.length;
}

/* ---------- edit commands ---------- */
function undo() { const c = undoStack.pop(); if (!c) return; c.u(); redoStack.push(c); changed(); }
function redo() { const c = redoStack.pop(); if (!c) return; c.r(); undoStack.push(c); changed(); }
function delSel() { if (selected) removeBlock(selected); }
function duplicate() {
  if (!selected || selected.userData.s === 'Start') return;
  const d = { ...blockData(selected), id: uid() }; d.p = [d.p[0] + 0.5, d.p[1], d.p[2] + 0.5];
  const m = addBlock(d); setTool('select'); select(m);
}
function nudge(v) {
  if (!selected) return;
  const m = selected, p0 = m.position.clone(); m.position.add(v); const p1 = m.position.clone();
  pushCmd(() => { m.position.copy(p0); syncSel(); }, () => { m.position.copy(p1); syncSel(); });
  syncSel(); changed();
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
  if (ctrl) {
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'd') { e.preventDefault(); duplicate(); }
    else if (k === 's') { e.preventDefault(); saveNow(); }
    else if (k === 'e') { e.preventDefault(); exportLevel(); }
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
  File: [['Import textures (folder)', '', () => $('fileTex').click()], ['Import .level file', '', () => $('fileLevel').click()], ['Save', 'Ctrl+S', saveNow], ['Export .level', 'Ctrl+E', exportLevel], ['Back to projects', '', () => $('homeBtn').click()]],
  Edit: [['Undo', 'Ctrl+Z', undo], ['Redo', 'Ctrl+Shift+Z', redo], ['Duplicate', 'Ctrl+D', duplicate], ['Delete', 'Del', delSel], ['Deselect', 'Esc', () => select(null)]],
  View: [['Frame selection', 'F', frame], ['Reset camera', 'Home', resetCam], ['Toggle snap', 'G', toggleSnap], ['Atmosphere panel', 'A', toggleAtmo]],
  Help: [['Keyboard shortcuts', '?', showHelp], ['Show GRAB format fields', '', showFormat]]
};
Object.entries(MENUS).forEach(([name, items]) => {
  const d = el('details', { className: 'menu' }, el('summary', { textContent: name })), list = el('div');
  items.forEach(([t, k, fn]) => list.append(el('button', { onclick: () => { d.removeAttribute('open'); fn(); } }, el('span', { textContent: t }), el('kbd', { textContent: k }))));
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
function capLights() { let n = 0; group.children.forEach(b => b.children.forEach(x => { if (x.isLight) { const on = n++ < 8; if (x.visible !== on) x.visible = on; } })); }
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
const ambOut = () => ({ sunAzimuth: amb.sunAzimuth, sunAltitude: amb.sunAltitude, sunSize: amb.sunSize, fogDensity: amb.fogDensity,
  skyZenithColor: hx(amb.skyZenith), skyHorizonColor: hx(amb.skyHorizon), sunColor: hx(amb.sunColor), sunBrightness: amb.sunBrightness, ambientBrightness: amb.ambientBrightness });
applyAmb(amb);

renderList(); refreshUI();
