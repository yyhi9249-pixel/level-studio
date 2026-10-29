import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = id => document.getElementById(id);
// self-heal: create controls an older index.html may be missing, and show the build number
if (!$('snapAmt')) { const i = document.createElement('input'); Object.assign(i, { id: 'snapAmt', type: 'number', value: '0.25', step: '0.05', min: '0.05', title: 'Snap amount' }); i.style.width = '58px'; $('snap').parentElement.after(i); }
if (!$('themeBtn')) { const b = document.createElement('button'); b.id = 'themeBtn'; b.textContent = 'Light / dark'; (document.querySelector('.tools') || $('home')).append(b); }
{ const v = document.createElement('span'); v.textContent = 'v0.1.5 early alpha \u00b7 build 17'; $('statusbar').append(v); }

/* ---------- projects (saved in this browser) ---------- */
const KEY = 'levelstudio.projects.v1';
let projects = [];
try { projects = JSON.parse(localStorage.getItem(KEY)) || []; } catch { projects = []; }
const writeStore = () => { try { localStorage.setItem(KEY, JSON.stringify(projects)); return true; } catch { return false; } };
let current = null, tpl = null, thumbData = null;

let curFolder = '', q = '', folderList = [];
try { folderList = JSON.parse(localStorage.getItem('levelstudio.folders.v1')) || []; } catch {}
const saveFolders = () => { try { localStorage.setItem('levelstudio.folders.v1', JSON.stringify(folderList)); } catch {} };
function renderList() {
  const ul = $('projectList'); ul.innerHTML = '';
  const names = [...new Set([...folderList, ...projects.map(p => p.folder).filter(Boolean)])].sort(), fl = $('folders'); fl.replaceChildren();
  [['', 'All projects'], ...names.map(n => [n, n])].forEach(([k, t]) => { const b = document.createElement('button'); b.textContent = (k ? '\u25b8 ' : '') + t; b.className = curFolder === k ? 'on' : ''; b.onclick = () => { curFolder = k; renderList(); }; fl.append(b); });
  const list = projects.filter(p => (!curFolder || p.folder === curFolder) && p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.updated - a.updated);
  if (!list.length) { ul.innerHTML = '<li class="empty">No projects here.</li>'; return; }
  list.forEach(p => {
    const li = document.createElement('li'); li.innerHTML = '<span class="name"></span><span class="meta"></span>';
    li.querySelector('.name').textContent = p.name; li.querySelector('.meta').textContent = p.blocks.length + ' blocks \u00b7 ' + new Date(p.updated).toLocaleDateString() + (p.folder ? ' \u00b7 ' + p.folder : '');
    const mk = (t, f, c) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; if (c) b.className = c; return b; };
    li.append(mk('Open', () => openProject(p.id), 'primary'),
      mk('Rename', () => { const n = prompt('Project name', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 40); writeStore(); renderList(); } }),
      mk('Move', () => { const n = prompt('Move to folder (empty = none)', p.folder || ''); if (n !== null) { p.folder = n.trim(); if (p.folder && !folderList.includes(p.folder)) { folderList.push(p.folder); saveFolders(); } writeStore(); renderList(); } }),
      mk('Delete', () => { if (confirm('Delete "' + p.name + '"? This cannot be undone.')) { projects = projects.filter(x => x.id !== p.id); writeStore(); renderList(); } }));
    ul.append(li);
  });
}
$('search').oninput = e => { q = e.target.value; renderList(); };
$('newFolder').onclick = () => { const n = prompt('Folder name'); if (n && n.trim() && !folderList.includes(n.trim())) { folderList.push(n.trim()); saveFolders(); renderList(); } };
$('setBtn').onclick = () => { $('hsettings').hidden = !$('hsettings').hidden; };
$('ver').textContent = 'Version 0.1.5 \u00b7 early alpha \u00b7 build 17';
async function createProject() {
  const name = $('newName').value.trim() || 'Untitled level';
  if (!tpl) { try { const r = await fetch('new.level', { cache: 'no-store' }); if (r.ok) tpl = await r.arrayBuffer(); } catch {} }
  if (!tpl) alert('Could not find new.level. Upload it to your GitHub repo next to index.html (the file name must be exactly new.level). A blank level was made instead.');
  if (tpl) { await importLevel(new File([tpl], 'new.level')); if (current) { current.name = name; $('projName').textContent = name; saveNow(); } $('newName').value = ''; return; }
  const p = { id: Date.now().toString(36), name, blocks: [{ s: 'Start', m: '', p: [0, 0.5, 0], sc: [1, 1, 1] }], updated: Date.now() };
  projects.push(p); writeStore();
  $('newName').value = '';
  openProject(p.id);
}
$('createBtn').onclick = createProject;
$('newName').addEventListener('keydown', e => { if (e.key === 'Enter') createProject(); });
$('homeBtn').onclick = () => { if (net && !confirm('Going back to projects will ' + (net.role === 'host' ? 'close your room.' : 'leave the room.') + ' Continue?')) return; if (net) leaveRoom(true); saveNow(); $('editor').hidden = true; $('home').hidden = false; renderList(); };

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
  Pyramid: () => new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4),
  Prism: () => new THREE.CylinderGeometry(0.5774, 0.5774, 1, 3).rotateX(Math.PI / 2)
};
const SHAPE_ENUM = { Cube: 'CUBE', Sphere: 'SPHERE', Cylinder: 'CYLINDER', Pyramid: 'PYRAMID', Prism: 'PRISM' };
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
  if (d.s === 'Cone') d = { ...d, s: 'Pyramid' };
  const mesh = new THREE.Mesh(geoFor(d.s), SPECIALS[d.s] ? specMat(d.s) : getMat(d.m));
  mesh.position.fromArray(d.p); mesh.scale.fromArray(d.sc); if (d.q) mesh.quaternion.fromArray(d.q);
  mesh.userData = { s: d.s, m: d.m, id: d.id || uid(), cfg: migrateCfg(d.cfg ? JSON.parse(JSON.stringify(d.cfg)) : defCfg(d.s), d.s), folder: d.f || '', gid: d.g || '', name: d.n || '', gname: d.gn || '' };
  if (d.s === 'Light') syncLight(mesh);
  if (SHAPES[d.s]) { paint(mesh); tileUV(mesh); } constrain(mesh); if (d.s === 'Sign') signTex(mesh);
  return mesh;
}
const blockData = b => ({ s: b.userData.s, m: b.userData.m, id: b.userData.id, cfg: b.userData.cfg, f: b.userData.folder || '', g: b.userData.gid || '', n: b.userData.name || '', gn: b.userData.gname || '', p: b.position.toArray(), q: b.quaternion.toArray(), sc: b.scale.toArray() });
const serialize = () => { stopPreviews(); stopAllRuns(); return group.children.map(blockData); };

let saveTimer;
function saveNow() {
  if (!current) return;
  current.blocks = serialize(); current.amb = amb; current.updated = Date.now();
  $('status').textContent = writeStore() ? 'Saved' : 'Could not save (browser storage is full or blocked)';
}
function changed() { $('status').textContent = 'Saving...'; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); queueRefresh(); netChanged(); }

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
  if (tm || e.ctrlKey || e.shiftKey) return;
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
  netTick(); if (tm) testTick(); else if (flyMode) flyTick(); else controls.update(); tickPreviews(); renderer.render(scene, camera);
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
  const q = { x: 0, y: 0, z: 0, w: 1 }, nodes = []; let cx = 0, hasStart = false; const gm = {}; rawList = []; exMap = new Map(); codeWarn = [];
  const pushN = (b, n) => { if (!b.userData.gid && (n.levelNodeStatic || n.levelNodeCrumbling)) { const x = animBytes(b); if (x.length) exMap.set(n, x); } (b.userData.gid ? (gm[b.userData.gid] = gm[b.userData.gid] || []) : nodes).push(n); };
  for (const b of group.children) {
    const [x, y, z] = b.position.toArray(), [sx, sy, sz] = b.scale.toArray(), s = b.userData.s;
    if (TYPEF[s]) { rawList.push(rawNode(b)); continue; }
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
    const rep = exportReport(); if (rep.saved.length) warn.add('Saved in your project but NOT written to the .level yet (no confirmed GRAB field number):\n  - ' + rep.saved.join('\n  - '));
    codeWarn.forEach(w => warn.add(w)); codeWarn = [];
    const head = { formatVersion: 26, title: current.name, creators: (current.meta || {}).creators || 'Level Studio', description: (current.meta || {}).description ?? 'Made with Level Studio', complexity: cx, maxCheckpointCount: (current.meta || {}).checkpoints || 10 };
    const LNT = T.fields.levelNodes.resolvedType, parts = [T.encode(T.fromObject(conform(T, head, '', warn))).finish()];
    nodes.forEach(n => { const c = conform(LNT, n, '', warn); if (!Object.keys(c).length) return; let bytes = LNT.encode(LNT.fromObject(c)).finish(); const x = exMap.get(n); if (x) bytes = cat([bytes, x]); parts.push(lenEntry(6, bytes)); });
    rawList.forEach(r => parts.push(lenEntry(6, r)));
    parts.push(lenEntry(8, ambBytes())); ((current.meta || {}).tags || []).forEach(t => parts.push(strEntry(9, t))); parts.push(cat([vint(96), vint(1)]));
    const buf = cat(parts);
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
    const u8 = new Uint8Array(await file.arrayBuffer()), o = T.toObject(T.decode(u8), { enums: String, longs: Number });
    const top = wireEntries(u8), wr = top.filter(e => e.f === 6).map(e => u8.subarray(e.ds, e.de)), amE = top.find(e => e.f === 8), tags = top.filter(e => e.f === 9).map(e => new TextDecoder().decode(u8.subarray(e.ds, e.de)));
    const v3 = (v, d) => [v?.x ?? d, v?.y ?? d, v?.z ?? d];
    const q4 = r => r ? [r.x ?? 0, r.y ?? 0, r.z ?? 0, r.w ?? ((r.x || r.y || r.z) ? 0 : 1)] : [0, 0, 0, 1];
    const shapeOf = n => Object.keys(SHAPE_ENUM).find(k => norm(n).endsWith(norm(SHAPE_ENUM[k])));
    const matOf = n => Object.keys(MATS).filter(k => norm(n).endsWith(norm(MATS[k].g))).sort((a, b) => MATS[b].g.length - MATS[a].g.length)[0];
    const special = { levelNodeStart: 'Start', levelNodeFinish: 'Finish', levelNodeTrigger: 'Trigger', levelNodeGravity: 'Gravity', levelNodeParticleEmitter: 'Particle' };
    const blocks = [], skipped = {};
    const skip = k => { skipped[k] = (skipped[k] || 0) + 1; };
    const walk = (list, M, gid, wr) => {
      for (const [ii, n] of (list || []).entries()) { const w = wr && wr[ii];
        const key = Object.keys(n).find(k => k.startsWith('levelNode')), v = (key && n[key]) || {};
        if (!key && w) { rawImport(w, gid, blocks); continue; }
        const mat = new THREE.Matrix4().compose(new THREE.Vector3(...v3(v.position, 0)), new THREE.Quaternion(...q4(v.rotation)), new THREE.Vector3(...v3(v.scale, 1)));
        if (key === 'levelNodeGroup') { walk(v.childNodes, M.clone().multiply(mat), uid()); continue; }
        const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); M.clone().multiply(mat).decompose(P, Q, S);
        const base = { p: P.toArray(), q: Q.toArray(), sc: S.toArray(), g: gid };
        if (key === 'levelNodeStatic' || key === 'levelNodeCrumbling') {
          const sh = shapeOf(String(v.shape));
          if (sh) blocks.push({ ...base, s: sh, m: matOf(String(v.material)) || 'Default', cfg: { anims: [], color: rgbHex(v.color), cmode: v.color ? 'custom' : 'default', spec: 0, stable: v.stableTime ?? 1, respawn: v.respawnTime ?? 5 } }); else skip('unknown shape');
          if (sh && w) { const an = parseAnims(w, base); if (an.length) blocks[blocks.length - 1].cfg.anims = an; }
        } else if (special[key]) {
          const sp = special[key], r = v.radius;
          blocks.push({ ...base, s: sp, m: '', g: '', sc: (sp === 'Finish' || sp === 'Start') && r ? [2 * r, 1, 2 * r] : sp === 'Particle' ? [1, 1, 1] : base.sc });
        } else if (key === 'levelNodeSign') blocks.push({ ...base, s: 'Sign', m: '', sc: [1, 1, 1], cfg: { text: v.text || '' } });
        else skip(key || 'unknown node');
      }
    };
    walk(o.levelNodes, new THREE.Matrix4(), '', wr);
    const p = { id: Date.now().toString(36), name: (o.title || file.name.replace(/\.level$/i, '')).slice(0, 40), blocks, updated: Date.now(), amb: ambIn(o.ambienceSettings), meta: { creators: o.creators || '', description: o.description || '', checkpoints: o.maxCheckpointCount || 10, tags }, ambRaw: amE ? b64(u8.subarray(amE.ds, amE.de)) : undefined };
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
function defCfg0(s) {
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
  xPanel(box, b, c);
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
  if (ctrl && e.shiftKey && k === 'f8') { e.preventDefault(); pickGLB(); return; }
  if (ctrl && e.altKey && k === 'i') { e.preventDefault(); thumbMenu(); return; }
  if (ctrl && e.altKey && k === 'q') { e.preventDefault(); toggleFly(); return; }
  if ((flyMode || tm) && !ctrl && 'wasdqec '.includes(k)) return;
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
  else if (k === 't') toggleTest(); else if (k === 'm') toggleCollide(); else if (k === 'l') setLights(!lightsOn);
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
    '  - Settings panels for Trigger, Gravity, Particle, Sound, Light and Code blocks (they export with default or imported settings).',
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
  View: [['Frame selection', 'F', frame], ['Reset camera', 'Home', resetCam], ['Toggle snap', 'G', toggleSnap], ['Atmosphere panel', 'A', toggleAtmo], ['Fly mode', 'Ctrl+Alt+Q', toggleFly], ['Test mode (first person)', 'T', toggleTest], ['Collision', 'M', toggleCollide], ['Dynamic lighting', 'L', () => setLights(!lightsOn)]],
  Tools: [['Spiral staircase', '', () => gen('spiral')], ['Ring of pillars', '', () => gen('ring')], ['Pyramid tower', '', () => gen('tower')], ['Checker floor', '', () => gen('checker')], ['Helix of spheres', '', () => gen('helix')]],
  Settings: [['Light mode', '', toggleTheme, () => document.documentElement.dataset.theme === 'light'], ['Show grid', '', () => { gridH.visible = !gridH.visible; }, () => gridH.visible], ['Snap amount...', '', () => { const v = prompt('Snap amount', snapAmt); if (v && +v > 0) { $('snapAmt').value = +v; applySnap(); } }], ['Atmosphere panel', 'A', toggleAtmo, () => !$('atmo').hidden], ['Snap to grid', 'G', toggleSnap, () => $('snap').checked], ['Snap to blocks', 'Ctrl+O', toggleSnapB, () => snapB], ['Collision', 'M', toggleCollide, () => collide], ['Dynamic lighting', 'L', () => setLights(!lightsOn), () => lightsOn], ['Fly mode', 'Ctrl+Alt+Q', toggleFly, () => flyMode], ['Keep transforms when placing', 'Ctrl+P', toggleKeep, () => keepXf], ['Duplicate in place', '', () => { dupInPlace = !dupInPlace; flash('Duplicate in place ' + (dupInPlace ? 'on' : 'off')); }, () => dupInPlace]],
  Help: [['Code blocks and export', '', () => topic('Code blocks and export')], ['Code instruction numbers...', '', opDialog], ['Working together (rooms)', '', () => topic('Working together (rooms)')], ['Importing levels', '', () => topic('Importing levels')], ['Exporting, and using levels in the game', '', () => topic('Exporting and using levels in the game')], ['Importing textures', '', () => topic('Importing textures')], ['Downloading levels', '', () => topic('Downloading levels')], ['Potential problems', '', () => topic('Potential problems')], ['Updates and limitations', '', showUpdates], ['Inspect a .level file', '', inspectLevel], ['Send feedback', '', feedbackDialog], ['Keyboard shortcuts', '?', showHelp], ['Show GRAB format fields', '', showFormat]]
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
  if (c.x && c.x.Colored && c.x.Colored.grad) return c.x.Colored.c1 || '#ffffff';
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
  const sx = (b.userData.cfg.x || {}).Sign || {}; g.fillStyle = sx.textColor || '#222'; g.font = (sx.italic ? 'italic ' : '') + (sx.bold === false ? '' : 'bold ') + Math.round(28 * (sx.textScale || 1)) + 'px sans-serif'; g.textAlign = 'center';
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
window.addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function toggleFly() {
  if (tm) return;
  flyMode = !flyMode; controls.enabled = !flyMode; flyLast = performance.now();
  if (flyMode) { tc.detach(); const q0 = camera.quaternion.clone(); camera.rotation.order = 'YXZ'; camera.rotation.setFromQuaternion(q0, 'YXZ'); camera.rotation.z = 0; }
  else { const q1 = camera.quaternion.clone(); camera.rotation.order = 'XYZ'; camera.quaternion.copy(q1); controls.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6)); }
  flash(flyMode ? 'Fly mode: WASD, Shift = 2x, right-drag to look' : 'Fly mode off');
}
function flyTick() {
  const n = performance.now(), dt = Math.min(0.1, (n - flyLast) / 1000); flyLast = n;
  const sp = (keys.shift ? 16 : 8) * dt, d = camera.getWorldDirection(new THREE.Vector3()), r = new THREE.Vector3().crossVectors(d, camera.up).normalize();
  if (keys.w) camera.position.addScaledVector(d, sp); if (keys.s) camera.position.addScaledVector(d, -sp);
  if (keys.e || keys[' ']) camera.position.y += sp; if (keys.q || keys.c) camera.position.y -= sp;
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
  if (tool !== 'select' || e.button !== 0 || !(e.ctrlKey || e.shiftKey) || tc.axis || flyMode || tm) return;
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
  if (!b || !['Cube', 'Cylinder', 'Sphere'].includes(b.userData.s)) return;
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
function pickThumb(cb) {
  const f = el('input', { type: 'file', accept: 'image/*', onchange: () => {
    const file = f.files[0]; if (!file) return; const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = 16 / 9, cw = img.width / img.height > r ? img.height * r : img.width, ch = img.width / img.height > r ? img.height : img.width / r;
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      c.getContext('2d').drawImage(img, (img.width - cw) / 2, (img.height - ch) / 2, cw, ch, 0, 0, 1280, 720); thumbData = c.toDataURL('image/png'); URL.revokeObjectURL(url); if (cb) cb();
    }; img.src = url;
  } }); f.click();
}
function exportLevel() {
  if (!current) return;
  const m = current.meta = current.meta || { creators: 'Level Studio', description: 'Made with Level Studio', checkpoints: 10 };
  const t = el('input', { value: current.name, maxLength: 40 }), cr = el('input', { value: m.creators }), de = el('textarea', { value: m.description, rows: 4 }), cp = el('input', { type: 'number', min: 1, max: 100, value: m.checkpoints }), tg = el('input', { value: (m.tags || []).join(', '), placeholder: 'parkour, fling' });
  const d = el('dialog', {}, el('h3', { textContent: 'Export level' }), field('Title', t), field('Creators', cr), field('Description', de), field('Checkpoints', cp), field('Tags', tg));
  const go = () => { current.name = t.value.trim() || current.name; m.creators = cr.value; m.description = de.value; m.checkpoints = Math.max(1, parseInt(cp.value) || 10); m.tags = tg.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12); $('projName').textContent = current.name; saveNow(); d.close(); d.remove(); doExport(); };
  d.append(el('div', { className: 'row' }, btn('Cancel', () => { d.close(); d.remove(); }), btn('Export', go, 'primary')));
  d.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); thumbMenu(); } });
  document.body.append(d); d.showModal();
}
fetch('new.level').then(r => r.ok ? r.arrayBuffer() : null).then(b => {
  tpl = b; let seeded = false; try { seeded = !!localStorage.getItem('levelstudio.seeded'); } catch {}
  if (b && !projects.length && !seeded) { try { localStorage.setItem('levelstudio.seeded', '1'); } catch {} importLevel(new File([b], 'new.level')); }
}).catch(() => {});

/* ---------- GLB -> blocks, test mode ---------- */
function pickGLB() { const f = el('input', { type: 'file', accept: '.glb,.gltf', onchange: () => f.files[0] && importGLB(f.files[0]) }); f.click(); }
async function importGLB(file) {
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const root = (await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')).scene; root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(root), sz = bb.getSize(new THREE.Vector3()), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3();
    let div = 40, runs = [], cell;
    for (let tries = 0; tries < 6; tries++) {
      cell = Math.max(sz.x, sz.y, sz.z) / div || 1; const cells = new Map();
      root.traverse(m => {
        if (!m.isMesh) return; const pos = m.geometry.attributes.position, idx = m.geometry.index, mat = Array.isArray(m.material) ? m.material[0] : m.material, col = (mat.color || new THREE.Color(1, 1, 1)).getHexString();
        for (let i = 0; i < (idx ? idx.count : pos.count); i += 3) {
          [A, B, C].forEach((v, k) => v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld));
          const n = Math.ceil(Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A)) / (cell * 0.5)) + 1;
          for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) { P.copy(A).addScaledVector(B.clone().sub(A), u / n).addScaledVector(C.clone().sub(A), v / n); cells.set([0, 1, 2].map(k => Math.floor((P.getComponent(k) - bb.min.getComponent(k)) / cell)).join(','), col); }
        }
      });
      runs = []; const keys2 = [...cells.keys()].map(k => k.split(',').map(Number)).sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
      keys2.forEach(([x, y, z]) => { const col = cells.get(x + ',' + y + ',' + z), r = runs[runs.length - 1]; if (r && r.y === y && r.z === z && r.col === col && r.x + r.n === x) r.n++; else runs.push({ x, y, z, n: 1, col }); });
      if (runs.length <= 2500) break; div = Math.round(div * 0.7);
    }
    const ox = -sz.x / 2, oz = -sz.z / 2, id = uid(), made = [];
    runs.forEach(r => made.push(addBlock({ s: 'Cube', m: 'Colored', p: [ox + (r.x + r.n / 2) * cell, (r.y + 0.5) * cell, oz + (r.z + 0.5) * cell], sc: [r.n * cell, cell, cell], g: id, n: '', cfg: { anims: [], color: '#' + r.col, cmode: 'custom', spec: 0 } })));
    selectMany(made); flash('Converted to ' + made.length + ' blocks (grouped)');
  } catch (e) { alert('Could not read that model:\n' + e.message); }
}
let tm = null; const ropeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff })); ropeLine.frustumCulled = false; ropeLine.visible = false; scene.add(ropeLine);
function toggleTest() {
  if (tm) { endTest(); return; }
  trigInside.clear(); trigState.clear(); trigBtn.clear();
  const st = group.children.find(b => b.userData.s === 'Start'), sp = st ? st.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : new THREE.Vector3(0, 2, 0);
  tm = { pos: sp.clone(), spawn: sp, vel: new THREE.Vector3(), yaw: 0, pitch: 0, rope: null, ground: false, cam: { p: camera.position.clone(), q: camera.quaternion.clone() } };
  controls.enabled = false; tc.detach(); selBox.visible = false; ghost.visible = false; flyLast = performance.now(); camera.rotation.order = 'YXZ'; cvs.requestPointerLock();
  startAllCode(); flash('Test mode: WASD move, Space jump, hold click to grapple (Shift reels in), Esc exits');
}
function endTest() { if (!tm) return; stopAllRuns(); stopPreviews(); const c = tm.cam; tm = null; ropeLine.visible = false; if (document.pointerLockElement) document.exitPointerLock(); camera.position.copy(c.p); camera.quaternion.copy(c.q); controls.enabled = !flyMode; flash('Test mode off'); }
document.addEventListener('mousemove', e => { if (tm && document.pointerLockElement === cvs) { tm.yaw -= e.movementX * 0.0025; tm.pitch = Math.max(-1.5, Math.min(1.5, tm.pitch - e.movementY * 0.0025)); } });
document.addEventListener('pointerlockchange', () => { if (tm && !document.pointerLockElement) endTest(); });
cvs.addEventListener('mousedown', e => {
  if (!tm || e.button !== 0) return; const d = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation); ray.set(camera.position, d);
  const h = ray.intersectObjects(group.children, false)[0]; tm.rope = h && h.distance < 60 ? { p: h.point.clone(), len: h.distance } : null;
});
cvs.addEventListener('mouseup', () => { if (tm) tm.rope = null; });
function testTick() {
  const n = performance.now(), dt = Math.min(0.05, (n - flyLast) / 1000); flyLast = n; const t = tm;
  const f = new THREE.Vector3(-Math.sin(t.yaw), 0, -Math.cos(t.yaw)), r = new THREE.Vector3(Math.cos(t.yaw), 0, -Math.sin(t.yaw)), w = new THREE.Vector3();
  if (keys.w) w.add(f); if (keys.s) w.sub(f); if (keys.d) w.add(r); if (keys.a) w.sub(r);
  if (w.lengthSq()) w.normalize();
  if (t.ground) { t.vel.x += (w.x * 7 - t.vel.x) * Math.min(1, 12 * dt); t.vel.z += (w.z * 7 - t.vel.z) * Math.min(1, 12 * dt); if (keys[' ']) t.vel.y = 9; }
  else { t.vel.x += w.x * 10 * dt; t.vel.z += w.z * 10 * dt; }
  t.vel.y -= 25 * dt;
  if (t.rope) {
    if (keys.shift) t.rope.len = Math.max(2, t.rope.len - 14 * dt);
    const d = t.rope.p.clone().sub(t.pos), dist = d.length();
    if (dist > t.rope.len) { d.divideScalar(dist); const vr = t.vel.dot(d); if (vr < 0) t.vel.addScaledVector(d, -vr); t.pos.addScaledVector(d, dist - t.rope.len); }
  }
  const boxes = group.children.filter(b => SHAPES[b.userData.s]).map(b => ({ b: new THREE.Box3().setFromObject(b), lava: /Lava/.test(b.userData.m) }));
  t.ground = false;
  ['x', 'y', 'z'].forEach(ax => {
    t.pos[ax] += t.vel[ax] * dt;
    boxes.forEach(({ b, lava }) => {
      const pb = new THREE.Box3(new THREE.Vector3(t.pos.x - 0.4, t.pos.y - 1.6, t.pos.z - 0.4), new THREE.Vector3(t.pos.x + 0.4, t.pos.y + 0.2, t.pos.z + 0.4));
      if (!pb.intersectsBox(b)) return;
      if (lava) { t.pos.copy(t.spawn); t.vel.set(0, 0, 0); t.rope = null; return; }
      if (t.vel[ax] > 0) t.pos[ax] = b.min[ax] - (ax === 'y' ? 0.2 : 0.4) - 0.001; else { t.pos[ax] = b.max[ax] + (ax === 'y' ? 1.6 : 0.4) + 0.001; if (ax === 'y') t.ground = true; }
      t.vel[ax] = 0;
    });
  });
  if (t.pos.y < -60) { t.pos.copy(t.spawn); t.vel.set(0, 0, 0); t.rope = null; }
  camera.position.copy(t.pos); camera.rotation.set(t.pitch, t.yaw, 0);
  ropeLine.visible = !!t.rope; if (t.rope) ropeLine.geometry.setFromPoints([t.pos.clone().add(new THREE.Vector3(0, -0.4, 0)), t.rope.p]);
}

/* ---------- help, updates, feedback, thumbnail menu, level inspector ---------- */
const HT = {
  'Importing levels': 'Use Import .level (home screen or File menu) and pick a .level file from your computer. Blocks, shapes, materials, colors, signs, crumbling blocks, groups and atmosphere are read in. Anything this version of the format cannot describe is skipped, and a message lists what was skipped.\n\nTo bring in a level from a friend, ask them for the .level file itself.',
  'Exporting and using levels in the game': 'Export .level (Ctrl+E) opens a window for the title, creators, description and checkpoints, then downloads a .level file to your browser downloads folder.\n\nI do not have verified, current steps for loading a custom .level file into GRAB, and they may change between game versions. Check the GRAB community or the GRAB-Level-Format page on GitHub for the up to date method.\n\nIf export shows a warning, read it: it lists fields the format files did not recognise.',
  'Importing textures': 'Two ways:\n1) Site owner: put a folder named textures next to index.html in the GitHub repo. Use lowercase file names: default, grabbable, ice, lava, wood, grapple, grapplelava, crumbling, colored, bouncing, snow (png, jpg or webp). They load for everyone.\n2) Anyone: File > Import textures (pick a folder). Images are named the same way and are stored in this browser only.\n\nTextures repeat across each face, one tile per unit. Textures are only used in the editor view.',
  'Downloading levels': 'Level Studio does not have an online level browser. Your projects live in this browser, so export a .level file regularly as a backup: clearing browser data deletes projects.\n\nExporting downloads the file to your normal downloads folder. To move a project to another computer, export it there and import the .level file.',
  'Potential problems': '- Looks unchanged after an update: hard refresh with Ctrl+Shift+F5 or Ctrl+Shift+R. The status bar shows the build number.\n- "Could not load the GRAB proto files": the protofiles folder (level.proto and types.proto) must be next to index.html.\n- "Could not find new.level": upload new.level next to index.html.\n- Projects vanished: browser storage was cleared or you opened a different web address.\n- "Browser storage is full": export your levels and delete old projects.\n- Some Ctrl shortcuts may be taken by your browser; use the menus instead.\n- Trigger, Gravity, Particle, Sound, Light, Code, animations and several block options are not exported. See Updates and limitations.\n- This is a very early version: bugs are expected.'
};
function topic(t) { showDialog(t, HT[t]); }
function showUpdates() {
  showDialog('Updates and limitations', 'Level Studio is a VERY EARLY version (0.1.5, alpha). Expect bugs and missing features. Export your levels often.\n\nWhat works: placing and editing blocks (cube, sphere, cylinder, pyramid, prism), materials, custom colors on Colored and Lava blocks, signs, crumbling blocks, groups, atmosphere, import and export.\n\nWhy some things do not work:\n- Trigger, Gravity, Particle, Sound, Light and Code blocks: their file layout was worked out from sample levels. They now export, but only with the settings they were imported with or a default template: the settings panels for them in the editor are not connected yet.\n- Animations export (position and rotation keyframes, speed). Neon, transparent, additive, specular and physics are not understood yet, so they are editor-only.\n- Cone: GRAB has no cone shape. Pyramid is the closest.\n- Passable blocks and group animation: not available in this format / not built yet.\n- Test mode is a simplified preview, not the real game physics.\n\nHow it can improve: newer format files, or example .level files that contain those blocks. Use Help > Inspect a .level file to see what is inside one, and send feedback with what you find.');
}
const FEEDBACK_EMAIL = ''; // site owner: put an email address here to enable the "Open email" button
function feedbackDialog() {
  const type = sel([['Bug', 'Bug report'], ['Idea', 'Idea or request'], ['Other', 'Other']], 'Bug', () => {}), msg = el('textarea', { rows: 6, placeholder: 'What happened, or what would you like?' }), contact = el('input', { placeholder: 'Contact (optional)' });
  const text = () => '[Level Studio v0.1.5 early alpha, build 17]\nType: ' + type.value + '\nContact: ' + contact.value + '\nBrowser: ' + navigator.userAgent + '\nRecent errors: ' + (errLog.join(' | ') || 'none') + '\n\n' + msg.value;
  const d = el('dialog', {}, el('h3', { textContent: 'Send feedback' }), hint('This is a very early version. Bug reports and ideas help a lot.'), field('Type', type), field('Contact', contact), msg,
    el('div', { className: 'row' }, btn('Copy', () => navigator.clipboard && navigator.clipboard.writeText(text())),
      ...(FEEDBACK_EMAIL ? [btn('Open email', () => { location.href = 'mailto:' + FEEDBACK_EMAIL + '?subject=' + encodeURIComponent('Level Studio feedback') + '&body=' + encodeURIComponent(text()); })] : []),
      btn('Close', () => { d.close(); d.remove(); }, 'primary')));
  document.body.append(d); d.showModal();
}
function thumbMenu() {
  const img = el('img'); img.style.cssText = 'width:100%;aspect-ratio:16/9;object-fit:cover;background:rgba(128,128,128,.2);border-radius:8px';
  const sync = () => { if (thumbData) img.src = thumbData; else img.removeAttribute('src'); };
  const d = el('dialog', {}, el('h3', { textContent: 'Thumbnail' }), img, el('div', { className: 'row' },
    btn('Choose image', () => pickThumb(sync)),
    btn('Save PNG', () => { if (!thumbData) return; const a = document.createElement('a'); a.href = thumbData; a.download = ((current && current.name) || 'level').replace(/[^\w-]+/g, '_') + '.png'; a.click(); }),
    btn('Remove', () => { thumbData = null; sync(); }), btn('Close', () => { d.close(); d.remove(); }, 'primary')));
  sync(); document.body.append(d); d.showModal();
}
function wire(buf, ind) {
  const out = []; let i = 0;
  const rv = () => { let r = 0n, sh = 0n; while (i < buf.length) { const b = buf[i++]; r |= BigInt(b & 127) << sh; if (!(b & 128)) break; sh += 7n; } return r; };
  try {
    while (i < buf.length) {
      const key = Number(rv()), f = key >> 3, t = key & 7;
      if (t === 0) out.push(ind + f + ': varint ' + rv());
      else if (t === 1) { out.push(ind + f + ': double ' + new DataView(buf.buffer, buf.byteOffset + i, 8).getFloat64(0, true)); i += 8; }
      else if (t === 5) { const dv = new DataView(buf.buffer, buf.byteOffset + i, 4); out.push(ind + f + ': float ' + dv.getFloat32(0, true).toFixed(4) + '  (int ' + dv.getUint32(0, true) + ')'); i += 4; }
      else if (t === 2) {
        const n = Number(rv()), sub = buf.subarray(i, i + n); if (i + n > buf.length) return null; i += n; let str = null;
        try { str = new TextDecoder('utf-8', { fatal: true }).decode(sub); } catch {}
        if (n > 0 && str !== null && /^[\x20-\x7e\n\t]*$/.test(str)) out.push(ind + f + ': "' + str + '"');
        else { const inner = n ? wire(sub, ind + '  ') : null; if (inner) out.push(ind + f + ': {', inner, ind + '}'); else out.push(ind + f + ': bytes[' + n + ']'); }
      } else return null;
    }
  } catch { return null; }
  return out.join('\n');
}
function inspectLevel() {
  const f = el('input', { type: 'file', accept: '.level', onchange: async () => {
    const file = f.files[0]; if (!file) return; const txt = wire(new Uint8Array(await file.arrayBuffer()), '');
    showDialog('Raw contents of ' + file.name + ' (numbers are protobuf field numbers; send this to the developer)', txt || 'Could not read this file as protobuf data.', true);
  } }); f.click();
}
$('updBtn').onclick = showUpdates; $('fbBtn').onclick = feedbackDialog;
$('helpBtn').onclick = () => showDialog('Help', Object.entries(HT).map(([k, v]) => k.toUpperCase() + '\n' + v).join('\n\n'));

/* ---------- collaboration (peer to peer rooms) ---------- */
HT['Working together (rooms)'] = 'Build one level with other people live. No account needed.\n\nHOST A ROOM\n1) Open your level, click Collaborate (top bar), enter your name, press Start room.\n2) Send the 6 character room code to your friends (Copy code button).\n3) When someone joins, they appear in the list waiting for you. Choose Allow edit, View only, or Deny. You can change anyone\'s permission or remove them at any time.\n\nJOIN A ROOM\n1) On the home screen click Join a room (or Collaborate inside the editor).\n2) Enter your name and the code, press Join.\n3) Wait for the host to let you in. The level opens, and you get a saved copy in your project list.\n\nWHAT YOU SEE\nEveryone shows as a floating colored circle with their name over it, at their camera position.\n\nGOOD TO KNOW\n- The host must keep the tab open; closing it ends the room.\n- It connects browsers directly (WebRTC) using a free public matching server. Strict networks or school/work firewalls can block it. Other people in the room can see your network address, so only share the code with people you trust.\n- If two people edit at the same moment, the latest change wins, and undo history resets when someone else\'s change arrives.\n- View only people can look around; anything they try to change is undone.\n- Very early version: save a copy with Export .level before long sessions.';
let net = null, netPending = null, netT = null, netApplying = false, lastPos = 0;
const avatars = new Map(), peerColor = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return 'hsl(' + h + ',80%,60%)'; };
function avatar(id, name, p) {
  let a = avatars.get(id);
  if (!a) {
    a = new THREE.Group(); const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText(String(name).slice(0, 14), 128, 43);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); sp.scale.set(2, 0.5, 1); sp.position.y = 0.85; sp.renderOrder = 999;
    a.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(peerColor(id)), transparent: true, opacity: 0.85 })), sp); scene.add(a); avatars.set(id, a);
  }
  a.position.fromArray(p);
}
function dropAvatar(id) { const a = avatars.get(id); if (a) { scene.remove(a); avatars.delete(id); } }
const snap = () => ({ t: 'state', name: current.name, blocks: serialize(), amb: { ...amb } });
function applyState(st) {
  if (tc.dragging) { netPending = st; return; }
  netApplying = true; const keep = [...multi].map(m => m.userData.id);
  select(null); group.clear(); st.blocks.forEach(d => group.add(makeBlock(d)));
  amb = { ...DEFAULT_AMB, ...(st.amb || {}) }; applyAmb(amb); undoStack.length = 0; redoStack.length = 0;
  selectMany(group.children.filter(m => keep.includes(m.userData.id))); queueRefresh(); netApplying = false; if (current) saveNow();
}
function netChanged() {
  if (!net || netApplying) return;
  if (net.role === 'guest' && net.perm !== 'edit') { if (net.last) netPending = net.last; return; }
  clearTimeout(netT); netT = setTimeout(() => { const m = snap(); if (net.role === 'host') net.conns.forEach(c => c.perm && c.open && c.send(m)); else if (net.conn && net.conn.open) net.conn.send(m); }, 250);
}
function netTick() {
  if (!net) return;
  if (netPending && !tc.dragging) { const p = netPending; netPending = null; applyState(p); }
  const n = performance.now(); if (n - lastPos < 100) return; lastPos = n;
  const m = { t: 'pos', name: net.name, p: camera.position.toArray() };
  if (net.role === 'host') net.conns.forEach(c => c.perm && c.open && c.send({ ...m, id: 'host' })); else if (net.perm && net.conn && net.conn.open) net.conn.send(m);
}
const rnd = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join(''); };
function hostRoom(name, tries = 0) {
  if (!window.Peer) { alert('The networking library did not load. Check your internet connection and reload.'); return; }
  const code = rnd(), peer = new Peer('levelstudio-' + code.toLowerCase()); net = { role: 'host', peer, code, name, conns: [] };
  peer.on('open', renderCollab);
  peer.on('connection', c => { net.conns.push(c); c.on('data', d => hostData(c, d)); c.on('close', () => dropConn(c)); });
  peer.on('error', e => { if (e.type === 'unavailable-id' && tries < 3) { peer.destroy(); hostRoom(name, tries + 1); } else { alert('Could not start the room (' + e.type + ').'); leaveRoom(true); } });
}
function dropConn(c) { if (!net) return; net.conns = net.conns.filter(x => x !== c); dropAvatar(c.peer); net.conns.forEach(o => o.open && o.send({ t: 'left', id: c.peer })); renderCollab(); }
function hostData(c, d) {
  if (d.t === 'hello') { c.nm = String(d.name || 'Guest').slice(0, 20); c.pending = true; renderCollab(); flash(c.nm + ' wants to join: open Collaborate to answer'); return; }
  if (!c.perm) return;
  if (d.t === 'chat') { const text = String(d.text || '').slice(0, 300); addChat(c.nm, text); net.conns.forEach(o => { if (o !== c && o.perm && o.open) o.send({ t: 'chat', name: c.nm, text }); }); return; }
  if (d.t === 'pos') { avatar(c.peer, c.nm, d.p); net.conns.forEach(o => { if (o !== c && o.perm && o.open) o.send({ t: 'pos', id: c.peer, name: c.nm, p: d.p }); }); }
  else if (d.t === 'state') {
    if (c.perm !== 'edit') { c.send(snap()); return; }
    applyState(d); net.conns.forEach(o => { if (o !== c && o.perm && o.open) o.send(d); });
  }
}
function setPerm(c, p) { c.pending = false; c.perm = p; c.send({ t: 'role', role: p }); if (p) c.send(snap()); renderCollab(); }
function joinRoom(code, name) {
  if (!window.Peer) { alert('The networking library did not load. Check your internet connection and reload.'); return; }
  code = code.trim().toUpperCase(); if (code.length < 4) { alert('Enter the room code.'); return; }
  const peer = new Peer(); net = { role: 'guest', peer, code, name, perm: null, opened: false };
  peer.on('open', () => {
    const c = peer.connect('levelstudio-' + code.toLowerCase(), { reliable: true }); net.conn = c;
    c.on('open', () => { c.send({ t: 'hello', name }); renderCollab(); });
    c.on('data', guestData); c.on('close', () => { if (net) { alert('The room was closed.'); leaveRoom(true); } });
  });
  peer.on('error', e => { alert('Could not join (' + e.type + '). Check the code and that the host still has the room open.'); leaveRoom(true); });
  renderCollab();
}
function guestData(d) {
  if (d.t === 'role') { net.perm = d.role; renderCollab(); flash(d.role === 'edit' ? 'You can edit in this room' : 'View only in this room'); }
  else if (d.t === 'denied') { alert('The host did not let you in.'); leaveRoom(true); }
  else if (d.t === 'kick') { alert('You were removed from the room.'); leaveRoom(true); }
  else if (d.t === 'state') { net.last = d; if (!net.opened) { net.opened = true; openShared(d); } else applyState(d); }
  else if (d.t === 'chat') addChat(d.name, d.text);
  else if (d.t === 'pos') avatar(d.id, d.name, d.p);
  else if (d.t === 'left') dropAvatar(d.id);
}
function openShared(m) {
  let p = projects.find(x => x.id === 'room-' + net.code);
  if (!p) { p = { id: 'room-' + net.code, name: ('Shared: ' + m.name).slice(0, 40), blocks: m.blocks, amb: m.amb, updated: Date.now() }; projects.push(p); } else { p.blocks = m.blocks; p.amb = m.amb; }
  writeStore(); openProject(p.id);
}
function leaveRoom(quiet) {
  if (!net) return; const n = net; net = null; clearTimeout(netT); try { n.peer.destroy(); } catch {}
  [...avatars.keys()].forEach(dropAvatar); renderCollab(); if (!quiet) flash('Left the room');
}
const cd = el('dialog', { id: 'collab' }); document.body.append(cd);
const myName = () => { try { return localStorage.getItem('levelstudio.name') || ''; } catch { return ''; } };
function renderCollab() {
  const cb = $('collabBtn'); if (cb) cb.textContent = net ? 'Room ' + net.code + (net.role === 'host' ? ' (' + net.conns.filter(c => c.perm).length + ')' : '') : 'Collaborate';
  chatBox.hidden = !(net && (net.role === 'host' || net.perm)); if (!net) $('chatLog').replaceChildren();
  const wc = net && net.role === 'host' ? net.conns.filter(c => c.pending).length : 0;
  if (cb) { cb.className = wc ? 'primary' : ''; if (wc) cb.textContent += ' \u2022 ' + wc + ' waiting'; }
  const k = [el('h3', { textContent: 'Collaborate' })];
  if (!net) {
    const nm = el('input', { value: myName(), placeholder: 'Your name', maxLength: 20 }), code = el('input', { placeholder: 'Room code', maxLength: 8 }); code.style.textTransform = 'uppercase';
    const need = () => { const n = nm.value.trim(); if (!n) { alert('Enter your name first.'); return null; } try { localStorage.setItem('levelstudio.name', n); } catch {} return n; };
    k.push(field('Your name', nm), el('h4', { textContent: 'Join a room' }), field('Room code', code), btn('Join', () => { const n = need(); if (n) { joinRoom(code.value, n); } }, 'primary'));
    if (current && !$('editor').hidden) k.push(el('h4', { textContent: 'Host this level' }), hint('Others join with a code, and you decide what each person can do.'), btn('Start room', () => { const n = need(); if (n) hostRoom(n); }, 'primary'));
  } else if (net.role === 'host') {
    const big = el('div', { textContent: net.code }); big.style.cssText = 'font:700 34px ui-monospace,monospace;letter-spacing:.2em;text-align:center;margin:8px 0';
    k.push(hint('Room open. Share this code. Keep this tab open.'), big, el('div', { className: 'row' }, btn('Copy code', () => navigator.clipboard && navigator.clipboard.writeText(net.code))));
    const wait = net.conns.filter(c => c.pending), ok2 = net.conns.filter(c => c.perm);
    if (wait.length) k.push(el('h4', { textContent: 'Waiting to join' }));
    wait.forEach(c => k.push(el('div', { className: 'row' }, el('span', { textContent: c.nm }), btn('Allow edit', () => setPerm(c, 'edit'), 'primary'), btn('View only', () => setPerm(c, 'view')), btn('Deny', () => { c.send({ t: 'denied' }); setTimeout(() => c.close(), 200); }))));
    k.push(el('h4', { textContent: 'In the room (' + ok2.length + ')' }));
    if (!ok2.length) k.push(hint('Nobody yet.'));
    ok2.forEach(c => k.push(el('div', { className: 'row' }, el('span', { textContent: c.nm }), sel([['edit', 'Can edit'], ['view', 'View only']], c.perm, v => setPerm(c, v)), btn('Remove', () => { c.send({ t: 'kick' }); setTimeout(() => c.close(), 200); }))));
    k.push(btn('Stop room', () => leaveRoom()));
  } else {
    k.push(hint('Room ' + net.code + ': ' + (net.perm === 'edit' ? 'you can edit.' : net.perm === 'view' ? 'view only.' : 'waiting for the host to let you in...')), btn('Leave room', () => leaveRoom()));
  }
  k.push(el('div', { className: 'row' }, btn('Help', () => topic('Working together (rooms)')), btn('Close', () => cd.close(), 'primary')));
  cd.replaceChildren(...k);
}
function collabDialog() { renderCollab(); if (!cd.open) cd.showModal(); }
{ const b = document.createElement('button'); b.id = 'collabBtn'; b.textContent = 'Collaborate'; b.onclick = collabDialog; $('exportBtn').before(b); }
$('joinBtn').onclick = collabDialog;

/* ---------- chat, error log ---------- */
const chatBox = el('section', { id: 'chatBox', hidden: true }, el('h3', { textContent: 'Chat' }), el('div', { id: 'chatLog' }), el('div', { className: 'row' }, el('input', { id: 'chatIn', placeholder: 'Message', maxLength: 300 }), btn('Send', () => sendChat())));
$('right').append(chatBox);
$('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function addChat(name, text, me) {
  const row = el('div', { className: 'chat' + (me ? ' me' : '') }, el('b', { textContent: name + ': ' }), el('span', { textContent: text })), log = $('chatLog');
  log.append(row); while (log.children.length > 200) log.firstChild.remove(); log.scrollTop = log.scrollHeight;
}
function sendChat() {
  const i = $('chatIn'), text = i.value.trim().slice(0, 300); if (!text || !net) return;
  if (net.role === 'host') { i.value = ''; addChat(net.name, text, true); net.conns.forEach(c => c.perm && c.open && c.send({ t: 'chat', name: net.name, text })); }
  else if (net.perm && net.conn && net.conn.open) { i.value = ''; net.conn.send({ t: 'chat', text }); addChat(net.name, text, true); }
}
const errLog = [];
const logErr = m => { errLog.push(new Date().toLocaleTimeString() + ' ' + m); if (errLog.length > 5) errLog.shift(); flash('Something went wrong: ' + m + ' (Help > Send feedback)'); };
window.addEventListener('error', e => logErr(e.message));
window.addEventListener('unhandledrejection', e => logErr(String((e.reason && e.reason.message) || e.reason)));

/* ---------- raw protobuf layer (special blocks, animations, atmosphere, tags) ---------- */
const TPLB64 = {8:'CAISDw28SMe+FcSlakEd2jknvxoPDUpMEkAVSkwSQB1KTBJAIgoV9AQ1PyX0BDU/Kg8Nd75bwRV3vtvBHaRwa8EwAQ==',11:'Cg8NPrAzvhUcqlhBHepSLUASDw3QuQxAFdC5DEAd0LkMQBoKFfQENT8l9AQ1PyibAzIKDQAAgD8VMzPzPzoUDQAAgD8VAACAPx0AAIA/JQAAgD9CFA0AAIA/FQAAgD8dAACAPyUAAIA/SgoNCtcjPBXXo/A+UgoNCtejPBWuR+E+cgB6Cg0AAGDAHQAAgL+CAQoVMzMTQB0zM/M/igEAkgEFFc3MjD8=',12:'Cg8NAD9yvRXq8HRBHZ99V8ASZxADHQYeoj4lRpEwQC2amZk/NWdmRkA9+XJYRUUAAAxCTedYTDlVlPx4u11qpe08ZQAAFkNt9SjkQHX8s+Q/fYSGnz2FAWilXL6NAdmWGkCVAS8dVTqdAcz50DulAea6jUWtAc9VBEEaBXNvdW5kLZqZ6UBFAADzQw==',13:'Cg8NOlUsPhU8TntBHbGB6sAgASoPDWW/qT8VZb+pPx1lv6k/MgoV9AQ1PyX0BDU/OAFAAQ==',14:'Cg8NGDFpvxVe4ndBHe5pUMESChX0BDU/JfQENT8YASIUDQAAgD8VzMxMPh3MzEw+JQAAgD8tMzOTQDWamYRCPQAANEJFAACgQE0AAAAAUAE=',10:'COgHEg8NsP/fvBUtx3lBHbHkH8EaDw3wg78/FfCDvz8d8IO/PyIKFfQENT8l9AQ1PzICGgA='};
const AMBT = 'ChQNKVyPPhVGtvM+HUjhOj8lAACAPxIUDfp+aj8VKxh1Px0rGHU/JQAAgD8dAAA0QiUAgJ1DLQAAgD84AEIUDf+yez8VotF9Px2i0X0/JQAAgD9NAACAP1IUDQAAgD8VAACAPx0AAIA/JQAAgD9dAACAP2UAAIA/bQAAAD9yAH0AAIA/hQEAAAAAigEUDQAAgD8VAACAPx0AAIA/JQAAgD+VAQAAgD+dAQAAAAClAQAAlkOtAQAAoEC1AQAAAAA=';
let rawList = [], exMap = new Map();
const TYPEF = { Gravity: 8, Trigger: 10, Particle: 11, Sound: 12, Code: 13, Light: 14 }, FIELD_TYPE = Object.fromEntries(Object.entries(TYPEF).map(([k, v]) => [v, k]));
const TSPEC = { 8: { p: 2, s: 3, r: 4 }, 10: { p: 2, s: 3, r: 4 }, 11: { p: 1, s: 2, r: 3 }, 12: { p: 1 }, 13: { p: 1, s: 5, r: 6 }, 14: { p: 1, r: 2 } };
function b64(u) { let s = ''; for (let i = 0; i < u.length; i += 8000) s += String.fromCharCode(...u.subarray(i, i + 8000)); return btoa(s); }
const unb64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
function wireEntries(buf) {
  const out = []; let i = 0; const rv = () => { let r = 0, sh = 0; while (i < buf.length) { const c = buf[i++]; r += (c & 127) * 2 ** sh; if (!(c & 128)) break; sh += 7; } return r; };
  while (i < buf.length) {
    const s = i, key = rv(), f = Math.floor(key / 8), t = key & 7; let ds = i;
    if (t === 0) rv(); else if (t === 1) i += 8; else if (t === 5) i += 4; else if (t === 2) { const n = rv(); ds = i; i += n; } else throw new Error('bad protobuf data');
    out.push({ f, t, s, e: i, ds, de: i });
  }
  return out;
}
const cat = arrs => { const o = new Uint8Array(arrs.reduce((a, x) => a + x.length, 0)); let p = 0; arrs.forEach(x => { o.set(x, p); p += x.length; }); return o; };
const vint = n => { const o = []; while (n > 127) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return Uint8Array.from(o); };
const fEntry = (f, x) => cat([vint(f * 8 + 5), new Uint8Array(new Float32Array([x]).buffer)]);
const lenEntry = (f, body) => cat([vint(f * 8 + 2), vint(body.length), body]);
const strEntry = (f, str) => lenEntry(f, new TextEncoder().encode(str));
const vecBody = a => cat(a.map((x, i) => fEntry(i + 1, x)));
function patchEntries(buf, repl) {
  const seen = new Set(), out = [];
  wireEntries(buf).forEach(e => { if (repl[e.f]) { if (!seen.has(e.f)) { seen.add(e.f); out.push(repl[e.f]); } } else out.push(buf.subarray(e.s, e.e)); });
  Object.keys(repl).forEach(k => { if (!seen.has(+k)) out.push(repl[k]); });
  return cat(out);
}
function readVec(buf, fno, n, dflt) {
  const x = wireEntries(buf).find(z => z.f === fno && z.t === 2); if (!x) return dflt;
  const sub = buf.subarray(x.ds, x.de), r = Array(n).fill(0);
  wireEntries(sub).forEach(z => { if (z.t === 5 && z.f >= 1 && z.f <= n) r[z.f - 1] = readF(sub, z); });
  return r;
}
const readF = (buf, z) => new DataView(buf.buffer, buf.byteOffset + z.ds, 4).getFloat32(0, true);
function defCfg(s) { const c = defCfg0(s); if (TYPEF[s] && !c.raw) c.raw = b64(unb64(TPLB64[TYPEF[s]])); return c; }
function rawNode(b) {
  const f = TYPEF[b.userData.s], sp = TSPEC[f], base = unb64(b.userData.cfg.raw || TPLB64[f]), r = {};
  rawExtra(b, r); r[sp.p] = lenEntry(sp.p, vecBody(b.position.toArray())); if (sp.s) r[sp.s] = lenEntry(sp.s, vecBody(b.scale.toArray())); if (sp.r) r[sp.r] = lenEntry(sp.r, vecBody(b.quaternion.toArray()));
  return lenEntry(f, patchEntries(base, r));
}
function rawImport(w, gid, blocks) {
  wireEntries(w).forEach(e => {
    const sp = TSPEC[e.f]; if (!sp) return; const inner = w.subarray(e.ds, e.de), s = FIELD_TYPE[e.f];
    const cfg = { ...defCfg0(s), raw: b64(inner) }; rawReadExtra(s, inner, cfg);
    blocks.push({ s, m: '', g: gid, p: readVec(inner, sp.p, 3, [0, 0, 0]), q: sp.r ? readVec(inner, sp.r, 4, [0, 0, 0, 1]) : [0, 0, 0, 1], sc: sp.s ? readVec(inner, sp.s, 3, [1, 1, 1]) : [1, 1, 1], cfg });
  });
}
function animBytes(b) {
  const bq = b.quaternion.clone().invert(), bp = b.position;
  return cat((b.userData.cfg.anims || []).filter(a => a.frames.length > 1).map(a => {
    const fr = a.frames.map(f => {
      const p = [f.p[0] - bp.x, f.p[1] - bp.y, f.p[2] - bp.z], q = bq.clone().multiply(new THREE.Quaternion().fromArray(f.q)), parts = [];
      if (f.t) parts.push(fEntry(1, f.t)); parts.push(lenEntry(2, p.some(v => Math.abs(v) > 1e-6) ? vecBody(p) : new Uint8Array())); parts.push(lenEntry(3, vecBody(q.toArray())));
      return lenEntry(2, cat(parts));
    });
    return lenEntry(15, cat([strEntry(1, a.name || 'idle'), ...fr, fEntry(4, (a.speed || 100) / 100)]));
  }));
}
function parseAnims(w, base) {
  const out = [];
  wireEntries(w).filter(e => e.f === 15 && e.t === 2).forEach(e => {
    const a = w.subarray(e.ds, e.de), an = { name: 'Animation' + (out.length + 1), speed: 100, mode: 'loop', smooth: false, frames: [] };
    wireEntries(a).forEach(z => {
      if (z.f === 1 && z.t === 2) an.name = new TextDecoder().decode(a.subarray(z.ds, z.de));
      else if (z.f === 4 && z.t === 5) an.speed = Math.round(readF(a, z) * 100);
      else if (z.f === 2 && z.t === 2) {
        const fr = a.subarray(z.ds, z.de), te = wireEntries(fr).find(y => y.f === 1 && y.t === 5), off = readVec(fr, 2, 3, [0, 0, 0]), rq = readVec(fr, 3, 4, [0, 0, 0, 1]);
        an.frames.push({ t: te ? readF(fr, te) : 0, p: [base.p[0] + off[0], base.p[1] + off[1], base.p[2] + off[2]], q: new THREE.Quaternion(...base.q).multiply(new THREE.Quaternion(...rq)).toArray(), s: base.sc.slice() });
      }
    });
    if (an.frames.length) out.push(an);
  });
  return out;
}
function ambBytes() {
  const base = unb64((current && current.ambRaw) || AMBT), col = (f, h) => { const c = hx(h); return lenEntry(f, cat([fEntry(1, c.r), fEntry(2, c.g), fEntry(3, c.b), fEntry(4, 1)])); };
  return patchEntries(base, { 1: col(1, amb.skyZenith), 2: col(2, amb.skyHorizon), 3: fEntry(3, amb.sunAltitude), 4: fEntry(4, amb.sunAzimuth), 5: fEntry(5, amb.sunSize), 6: fEntry(6, amb.fogDensity) });
}

/* ---------- movable panels ---------- */
const UIK = 'levelstudio.ui.v1'; let uis = {}; try { uis = JSON.parse(localStorage.getItem(UIK)) || {}; } catch {}
const saveUI = () => { try { localStorage.setItem(UIK, JSON.stringify(uis)); } catch {} };
function movable(id, varName, label) {
  const e = $(id), g = document.createElement('div'); g.className = 'grip'; g.textContent = label || '\u22ee\u22ee drag to move \u00b7 double-click to dock'; e.prepend(g);
  const fl = (l, t, w, h) => { e.classList.add('floating'); Object.assign(e.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' }); if (varName) $('editor').style.setProperty(varName, '0px'); };
  g.ondblclick = () => { e.classList.remove('floating'); ['left', 'top', 'width', 'height'].forEach(k => { e.style[k] = ''; }); if (varName) $('editor').style.removeProperty(varName); delete uis[id]; saveUI(); };
  g.onpointerdown = ev => {
    ev.preventDefault(); const r = e.getBoundingClientRect(); if (!e.classList.contains('floating')) fl(r.left, r.top, r.width, Math.min(r.height, innerHeight - r.top));
    const b0 = e.getBoundingClientRect(), ox = ev.clientX - b0.left, oy = ev.clientY - b0.top; g.setPointerCapture(ev.pointerId);
    g.onpointermove = m => { e.style.left = Math.max(0, Math.min(innerWidth - 60, m.clientX - ox)) + 'px'; e.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - oy)) + 'px'; };
    g.onpointerup = () => { g.onpointermove = null; g.onpointerup = null; const b = e.getBoundingClientRect(); uis[id] = [b.left, b.top, b.width, b.height]; saveUI(); };
  };
  if (uis[id]) fl(...uis[id]);
}
movable('left', '--lw'); movable('right', '--rw'); movable('toolbar', null, '\u22ee\u22ee');
addEventListener('resize', () => ['left', 'right', 'toolbar'].forEach(id => { const e = $(id); if (e.classList.contains('floating')) { const r = e.getBoundingClientRect(); e.style.left = Math.max(0, Math.min(innerWidth - 60, r.left)) + 'px'; e.style.top = Math.max(0, Math.min(innerHeight - 40, r.top)) + 'px'; } }));

/* ---------- GRAB settings pack: code, trigger, particle, gravity, sound, colored, lava, sign, animation ---------- */
// ex:true  = written into the .level using field numbers confirmed from a real GRAB level
// ex:false = saved in your project and shown here, but no confirmed GRAB field number yet (see exportReport)
const F = (k, l, t, d, o, ex = false) => ({ k, l, t, d, o, ex });
const PROPS = ['Pos.X', 'Pos.Y', 'Pos.Z', 'Rot.X', 'Rot.Y', 'Rot.Z', 'Sca.X', 'Sca.Y', 'Sca.Z', 'Col.R', 'Col.G', 'Col.B', 'Col.Sel'];
const XS = {
  Trigger: [
    ['Trigger settings', F('startActive', 'Start active', 'bool', true), F('onEnter', 'On enter', 'bool', true), F('onLeave', 'On leave', 'bool', false), F('leftHand', 'Left hand', 'bool', true), F('rightHand', 'Right hand', 'bool', true), F('button', 'Button press', 'bool', false), F('suppress', 'Suppress grapples', 'bool', false), F('group', 'Group name', 'text', '')],
    ['Trigger connections', F('cObj', 'Target object', 'block', ''), F('cAnim', 'Target animation', 'anim', ''), F('cCode', 'Target code', 'block', ''), F('cTrig', 'Target trigger', 'block', ''), F('cEnter', 'On enter connection', 'block', ''), F('cLeave', 'On leave connection', 'block', ''), F('cAnimConn', 'Animation connection', 'anim', ''), F('cGroup', 'Group connection', 'text', '')]
  ],
  Gravity: [
    ['Gravity', F('mode', 'Gravity mode', 'sel', 1, [[0, 'Mode 0'], [1, 'Mode 1 (custom direction in your sample)'], [2, 'Mode 2']], true), F('strength', 'Gravity strength', 'num', 9.81, 0.5, true), F('dir', 'Direction X Y Z', 'vec', [0, -1, 0], 0.1, true), F('particles', 'Particle visibility', 'bool', true, null, true), F('monkey', 'Monkey movement', 'bool', false)]
  ],
  Particle: [
    ['Particle', F('type', 'Particle type (number)', 'num', 100, 1, true), F('color', 'Color', 'color', '#ffffff', null, true), F('color2', 'End color', 'color', '#ffffff', null, true), F('scale', 'Scale', 'num', 1, 0.1), F('rot', 'Rotation offset', 'num', 0, 15), F('pos', 'Position offset X Y Z', 'vec', [0, 0, 0], 0.1), F('visible', 'Visibility', 'bool', true)]
  ],
  Sound: [
    ['Sound settings', F('name', 'Sound', 'text', 'sound'), F('playback', 'Playback', 'sel', 'trigger', [['trigger', 'On trigger'], ['loop', 'Loop'], ['once', 'Once at start']]), F('anim', 'Animation', 'anim', ''), F('conn', 'Connections', 'block', '')]
  ],
  Sign: [
    ['Sign settings', F('show', 'Show sign', 'bool', true), F('textColor', 'Text color', 'color', '#222222'), F('textScale', 'Text scale', 'num', 1, 0.1), F('bold', 'Bold', 'bool', true), F('italic', 'Italic', 'bool', false), F('anim', 'Animation', 'anim', ''), F('conn', 'Connections', 'block', '')]
  ],
  Colored: [
    ['Colored block', F('grad', 'Gradient mode', 'bool', false), F('c1', 'First color', 'color', '#ffffff'), F('c2', 'Second color', 'color', '#888888'), F('grabbable', 'Grabbable', 'bool', true), F('grapple', 'Can grapple', 'bool', false), F('passable', 'Passable', 'bool', false), F('anim', 'Animation', 'anim', ''), F('conn', 'Connections', 'block', '')]
  ],
  Lava: [
    ['Lava', F('note', 'Position, rotation, scale and color are in the transform fields above and the Look section.', 'note')]
  ],
  Anim: [
    ['Animation settings', F('startActive', 'Start active', 'bool', true), F('pivot', 'Pivot X Y Z', 'vec', [0, 0, 0], 0.1), F('animConn', 'Animation connection', 'anim', ''), F('trigConn', 'Trigger connection', 'block', '')]
  ]
};
const xKey = b => { const s = b.userData.s, m = b.userData.m; if (XS[s]) return [s]; if (SHAPES[s]) return [...(m === 'Colored' ? ['Colored'] : []), ...(m === 'Lava' ? ['Lava'] : []), 'Anim']; return []; };
function xGet(c, key) { c.x = c.x || {}; const o = c.x[key] = c.x[key] || {}; (XS[key] || []).forEach(sec => sec.slice(1).forEach(f => { if (o[f.k] === undefined && f.t !== 'note') o[f.k] = JSON.parse(JSON.stringify(f.d)); })); return o; }
function blockSel(val, on) { return sel([['', '(none)'], ...group.children.map(m => [m.userData.id, label(m)])], val, on); }
function xField(o, f) {
  const set = v => { o[f.k] = v; changed(); const b = selected; if (b) { if (b.userData.s === 'Sign') signTex(b); if (SHAPES[b.userData.s]) paint(b); } };
  const tag = f.ex ? '' : ' *';
  if (f.t === 'note') return hint(f.l);
  let inp;
  if (f.t === 'bool') inp = el('input', { type: 'checkbox', checked: !!o[f.k], onchange: e => set(e.target.checked) });
  else if (f.t === 'text') inp = txt(o[f.k], set);
  else if (f.t === 'num') inp = num(o[f.k], set, f.o || 1);
  else if (f.t === 'color') inp = color(o[f.k], set);
  else if (f.t === 'sel') { inp = sel(f.o.map(([v, t]) => [String(v), t]), String(o[f.k]), v => set(isNaN(+v) ? v : +v)); }
  else if (f.t === 'block') inp = blockSel(o[f.k], set);
  else if (f.t === 'anim') { inp = txt(o[f.k], set, 'animation name'); inp.setAttribute('list', 'animNames'); }
  else if (f.t === 'vec') { inp = el('div', { className: 'row' }); o[f.k].forEach((v, i) => inp.append(num(v, n => { o[f.k][i] = n; changed(); }, f.o || 1))); }
  return field(f.l + tag, inp);
}
function xPanel(box, b, c) {
  const keys = xKey(b); if (!keys.length && b.userData.s !== 'Code') return;
  keys.forEach(key => {
    const o = xGet(c, key);
    XS[key].forEach(sec => { box.append(el('h4', { textContent: sec[0] })); sec.slice(1).forEach(f => box.append(xField(o, f))); });
  });
  if (b.userData.s === 'Code') codeExtra(box, b, c);
  box.append(hint('Fields marked * are saved in your project but not written to the .level yet (no confirmed GRAB field number). The rest are exported.'));
}
function codeExtra(box, b, c) {
  const o = xGet(c, 'Code'); c.x.Code = o;
  const d = { run: 'shared', regsT: 'R0\nR1\nR2\nR3\nR4\nR5\nR6\nR7', inputs: '', outputs: '', cObj: '', cTrig: '', cAnim: '', cIn: '', cOut: '', cReg: '' };
  Object.keys(d).forEach(k => { if (o[k] === undefined) o[k] = d[k]; });
  const area = (k, ph, rows = 3) => el('textarea', { value: o[k], placeholder: ph, rows, className: 'code', oninput: e => { o[k] = e.target.value; changed(); } });
  box.append(el('h4', { textContent: 'Code settings *' }),
    field('Runs', sel([['shared', 'Shared'], ['before', 'Run before player movement'], ['after', 'Run after player movement']], o.run, v => { o.run = v; changed(); })),
    el('h5', { textContent: 'Registers (one per line)' }), area('regsT', 'R0'), el('h5', { textContent: 'Inputs (one per line)' }), area('inputs', 'name'), el('h5', { textContent: 'Outputs (one per line)' }), area('outputs', 'name'),
    field('Insert property', sel([['', 'Insert...'], ...PROPS.map(p => [p, 'obj0.' + p])], '', v => { if (v) { c.code = (c.code || '') + '\nobj0.' + v; renderInspector(); changed(); } })),
    el('h4', { textContent: 'Code connections *' }),
    ...[['cObj', 'Object connections'], ['cTrig', 'Trigger connections'], ['cAnim', 'Animation connections'], ['cIn', 'Input connections'], ['cOut', 'Output connections'], ['cReg', 'Register connections']].map(([k, l]) => field(l, txt(o[k], v => { o[k] = v; changed(); }, 'name = target'))));
}
// the confirmed export: patches fields we saw in a real GRAB level into the raw block bytes
const vEntry = (f, n) => cat([vint(f * 8), vint(n)]);
const colBody = h => { const c = hx(h); return cat([fEntry(1, c.r), fEntry(2, c.g), fEntry(3, c.b), fEntry(4, 1)]); };
function rawExtra(b, r) {
  if (b.userData.s === 'Code') { const pr = codeProgram(b); if (pr) r[2] = lenEntry(2, pr); }
  const x = (b.userData.cfg || {}).x, s = b.userData.s; if (!x) return;
  if (s === 'Gravity' && x.Gravity) { const g = x.Gravity, d = new THREE.Vector3(...g.dir); if (d.lengthSq() > 0) d.normalize(); d.multiplyScalar(g.strength); r[1] = vEntry(1, g.mode); r[5] = lenEntry(5, vecBody(d.toArray())); r[6] = vEntry(6, g.particles ? 1 : 0); }
  if (s === 'Particle' && x.Particle) { const p = x.Particle; r[5] = vEntry(5, Math.round(p.type)); r[7] = lenEntry(7, colBody(p.color)); r[8] = lenEntry(8, colBody(p.color2)); }
}
function readVar(buf, f, dflt) { const e = wireEntries(buf).find(z => z.f === f && z.t === 0); if (!e) return dflt; let i = e.ds, r = 0, sh = 0; while (i < buf.length) { const c = buf[i++]; r += (c & 127) * 2 ** sh; if (!(c & 128)) break; sh += 7; } return r; }
function rawReadExtra(s, inner, cfg) {
  if (s === 'Gravity') { const d = readVec(inner, 5, 3, [0, -9.81, 0]), v = new THREE.Vector3(...d), len = v.length(); cfg.x = { Gravity: { mode: readVar(inner, 1, 1), strength: len || 9.81, dir: len ? v.normalize().toArray() : [0, -1, 0], particles: !!readVar(inner, 6, 1), monkey: false } }; }
  if (s === 'Particle') { const rc = f => { const e = wireEntries(inner).find(z => z.f === f && z.t === 2); if (!e) return '#ffffff'; const sub = inner.subarray(e.ds, e.de), c = [0, 1, 2].map(i => { const z = wireEntries(sub).find(y => y.f === i + 1 && y.t === 5); return z ? readF(sub, z) : 1; }); return rgbHex({ r: c[0], g: c[1], b: c[2] }); }; cfg.x = { Particle: { type: readVar(inner, 5, 100), color: rc(7), color2: rc(8) } }; }
}
function exportReport() {
  const saved = {}, ok = {};
  group.children.forEach(b => { const s = b.userData.s, x = (b.userData.cfg || {}).x; if (!x) return; xKey(b).concat(s === 'Code' ? ['Code'] : []).forEach(k => { (XS[k] || []).forEach(sec => sec.slice(1).forEach(f => { if (f.t === 'note') return; (f.ex ? ok : saved)[s + ' / ' + f.l] = 1; })); if (k === 'Code') saved['Code / shared-before-after, registers, inputs, outputs, connections'] = 1; }); });
  return { ok: Object.keys(ok), saved: Object.keys(saved) };
}

/* ---------- GRAB code editor: keywords, colours, autocomplete, lint, full screen ---------- */
const GASM = {
  Data: { SET: [2, 'DST SRC', 'Copies a value. Use it to update health, score, or speed.'], SWAP: [2, 'A B', 'Switches two values. Great for swapping states or positions without a temporary variable.'] },
  Arithmetic: { ADD: [3, 'DST A B', 'Adds numbers. Useful for score, movement, or timers.'], SUB: [3, 'DST A B', 'Subtracts numbers. Good for damage, countdowns, or moving backward.'], MUL: [3, 'DST A B', 'Multiplies numbers. Great for boosts, scaling, or multiplying effects.'], DIV: [3, 'DST A B', 'Divides numbers. Useful for slowing things down or averaging values.'], MOD: [3, 'DST A B', 'Remainder (A % B). Great for looping animations or repeating patterns.'], FLOOR: [2, 'DST A', 'Rounds down to a whole number. Useful for grid snap or tile maps.'], SQRT: [2, 'DST A', 'Square root. Used for distances, like how far enemies are from the player.'] },
  Comparison: { EQUAL: [3, 'DST A B', 'Checks if A equals B.'], LESS: [3, 'DST A B', 'Checks if A is less than B.'], GREATER: [3, 'DST A B', 'Checks if A is greater than B.'] },
  Logical: { AND: [3, 'DST A B', 'True only if both are true.'], OR: [3, 'DST A B', 'True if either is true.'], NOT: [2, 'DST A', 'Flips true/false. Good for toggles like switches or doors.'] },
  Trigonometry: { SIN: [2, 'DST A', 'Sine of an angle. Move something in its look direction (forward/backward).'], COS: [2, 'DST A', 'Cosine of an angle. Used with SIN to move in the direction it faces (left/right).'], ATAN2: [3, 'DST A B', 'Angle between two points. Makes enemies or bullets turn toward the player.'] },
  Flow: { NOOP: [0, '', 'Does nothing for one step. A spacer or placeholder.'], LABEL: [1, 'LABEL', 'Marks a spot in the code. For loops or landmarks.'], GOTO: [1, 'LABEL', 'Jumps to a label. Repeat actions or skip ahead.'], IF: [2, 'REG LABEL', 'Jumps only if REG is not zero.'], END: [0, '', 'Stops the script. Useful for finishing a cutscene or behavior.'], PASS: [0, '', 'Waits one frame. Exactly the same as SLEEP 0 (and exports as SLEEP 0).'] },
  Vector: { VEC_SET: [2, 'destVec srcVec', 'Copies the components of src into dest.'], VEC_ADD: [2, 'destVec srcVec', 'Adds two vectors component-wise: dest = dest + src.'], VEC_SUB: [2, 'destVec srcVec', 'Subtracts src from dest component-wise.'], VEC_MUL: [2, 'destVec srcVec', 'Multiplies dest by src component-wise.'], VEC_SCL: [2, 'destVec scalar', 'Scales every component of dest by one number.'], VEC_LEN: [2, 'DST srcVec', 'Length of the vector, stored in DST (VEC_LEN srcVec alone stores in R0).', 1], VEC_DOT: [2, 'destVec srcVec', 'Dot product, stored in R0 (or VEC_DOT R3 a b to pick the register).', 3] },
  Misc: { RAND: [2, 'DST N', 'Random number from 0 to N.'], SLEEP: [1, 'MS', 'Pauses for a short time. SLEEP 0 waits until the next frame.'] }
};
const CATCOL = { Data: '#6cb6ff', Arithmetic: '#ffb86b', Comparison: '#c792ea', Logical: '#ff7a90', Trigonometry: '#5eead4', Vector: '#ff9ecb', Flow: '#f2d45c', Misc: '#a3e635' };
const INSTR = {}; Object.entries(GASM).forEach(([cat, o]) => Object.entries(o).forEach(([k, [n, sig, doc, alt]]) => { INSTR[k.toUpperCase()] = { name: k, n, sig, doc, cat, alt }; }));
const escH = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const isNumT = t => /^-?(\d+\.?\d*|\.\d+)$/.test(t), isRegT = t => /^[RV]\d+(\.[XYZ])?$/i.test(t), isPropT = t => /^[A-Za-z_]\w*\.[\w.]+$/.test(t);
function hlLine(raw, kw) {
  const ci = raw.indexOf(';'), code = ci < 0 ? raw : raw.slice(0, ci), com = ci < 0 ? '' : raw.slice(ci); let out = '', idx = 0, op = '';
  code.split(/(\s+)/).forEach(t => {
    if (!t || /^\s+$/.test(t)) { out += t; return; }
    if (idx === 0) { op = t.toUpperCase(); const d = INSTR[op]; out += d ? '<span style="color:' + CATCOL[d.cat] + ';font-weight:600">' + escH(t) + '</span>' : '<span class="cbad">' + escH(t) + '</span>'; }
    else { const cls = isRegT(t) ? 'creg' : isNumT(t) ? 'cnum' : (kw && kw.has(t.split('.')[0].toLowerCase())) ? 'ckw' : isPropT(t) ? 'cprop' : (op === 'LABEL' || op === 'GOTO' || (op === 'IF' && idx === 2)) ? 'clab' : t === 'DeltaTime' ? 'cbuilt' : 'carg'; out += '<span class="' + cls + '">' + escH(t) + '</span>'; }
    idx++;
  });
  return out + (com ? '<span class="ccom">' + escH(com) + '</span>' : '');
}
function lintCode(src) {
  const notes = [], labels = new Set(), jumps = []; let count = 0;
  src.split('\n').forEach((raw, i) => {
    const line = raw.split(';')[0].trim(); if (!line) return;
    const [op, ...a] = line.split(/\s+/), OP = op.toUpperCase(), d = INSTR[OP], ln = 'Line ' + (i + 1) + ': '; count++;
    if (!d) { notes.push(ln + '"' + op + '" is not a GRAB instruction'); return; }
    if (a.length !== d.n && a.length !== d.alt) notes.push(ln + OP + ' needs ' + d.n + ' value' + (d.n === 1 ? '' : 's') + ' (' + OP + ' ' + d.sig + '), found ' + a.length);
    if (OP.startsWith('VEC_')) a.forEach((t, k) => { if (isNumT(t) && !(OP === 'VEC_SCL' && k === 1)) notes.push(ln + 'a vector (V0, obj0.Pos, Player.Pos...) is needed here, not the number ' + t); });
    if (d.sig.startsWith('DST') && a[0] && isNumT(a[0])) notes.push(ln + 'the destination of ' + OP + ' must be a register or property, not a number');
    if (OP === 'LABEL' && a[0]) { if (labels.has(a[0])) notes.push(ln + 'label "' + a[0] + '" is defined twice'); labels.add(a[0]); }
    if (OP === 'GOTO' && a[0]) jumps.push([i + 1, a[0]]);
    if (OP === 'IF' && a[1]) jumps.push([i + 1, a[1]]);
  });
  jumps.forEach(([ln, l]) => { if (!labels.has(l)) notes.push('Line ' + ln + ': label "' + l + '" is never defined'); });
  if (count > 150) notes.push('Over the 150 instruction limit');
  return { count, notes };
}
const TPL_ARG = { DST: 'R0', SRC: 'R1', A: 'R1', B: 'R2', LABEL: 'Loop', REG: 'R0', N: '10', MS: '0' };
TPL_ARG.destVec = 'V0'; TPL_ARG.srcVec = 'V1'; TPL_ARG.scalar = '2';
const insText = k => { const d = INSTR[k.toUpperCase()]; return d.name + (d.sig ? ' ' + d.sig.split(' ').map(x => TPL_ARG[x] || x).join(' ') : ''); };
function codeEditor(c, onChange, rows, full, kwf = () => []) {
  const gut = el('pre', { className: 'cgut' }), hl = el('pre', { className: 'chl' }), ta = el('textarea', { className: 'cta', spellcheck: false, wrap: 'off', rows, value: c.code || '' });
  const sug = el('div', { className: 'csug' }), info = el('div', { className: 'cinfo' }), notes = el('div', { className: 'notes' });
  const root = el('div', { className: 'cedit' + (full ? ' full' : '') }, sug, el('div', { className: 'cbody' }, gut, el('div', { className: 'cin' }, hl, ta)), info, notes);
  const lineInfo = () => { const pos = ta.selectionStart, before = ta.value.slice(0, pos), ls = before.lastIndexOf('\n') + 1, le = ta.value.indexOf('\n', pos), line = ta.value.slice(ls, le < 0 ? undefined : le), pre = before.slice(ls); return { ls, line, pre, first: pre.match(/^\s*([A-Za-z]*)$/) }; };
  const wordAt = () => { const m = lineInfo().pre.match(/([A-Za-z_][\w.]*)$/); return m ? m[1] : ''; };
  const matches = () => { const li = lineInfo(); if (li.first) { if (!li.first[1]) return []; const p = li.first[1].toUpperCase(); return Object.keys(INSTR).filter(k => k.startsWith(p) && k !== p).map(k => INSTR[k].name); } const w = wordAt().toLowerCase(); if (!w) return []; return kwf().filter(t => t.toLowerCase().startsWith(w) && t.toLowerCase() !== w); };
  function complete(k) { const li = lineInfo(), isI = !!li.first, s = ta.selectionStart - wordAt().length, pos = ta.selectionStart; ta.setRangeText(isI ? k + ' ' : k, s, pos, 'end'); input(); }
  function refresh() {
    const L = ta.value.split('\n'); const kw = new Set(kwf().map(t => t.split('.')[0].toLowerCase())); hl.innerHTML = L.map(l => hlLine(l, kw)).join('\n') + '\n'; gut.textContent = L.map((_, i) => i + 1).join('\n');
    const r = lintCode(ta.value), li = lineInfo(), op = (li.line.split(';')[0].trim().split(/\s+/)[0] || '').toUpperCase(), d = INSTR[op];
    info.textContent = r.count + ' / 150 instructions' + (d ? '   |   ' + op + ' ' + d.sig + ' - ' + d.doc : ''); info.className = 'cinfo' + (r.count > 150 ? ' bad' : '');
    notes.replaceChildren(...r.notes.slice(0, full ? 12 : 4).map(n => el('div', { textContent: n })));
    const m = matches(); sug.replaceChildren(...m.slice(0, 10).map(k => { const d = INSTR[k.toUpperCase()]; return el('button', { textContent: k, title: d ? d.doc : 'connected value', style: 'color:' + (d ? CATCOL[d.cat] : '#ff9e64'), onmousedown: e => { e.preventDefault(); complete(k); } }); }));
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop;
  }
  function input() { c.code = ta.value; onChange(); refresh(); }
  ta.oninput = input; ta.onclick = ta.onkeyup = refresh; ta.onscroll = () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; };
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Tab') { e.preventDefault(); const m = matches(); if (m.length) complete(m[0]); else { ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); input(); } }
    else if (e.key === 'Enter') { const ind = (lineInfo().line.match(/^\s*/) || [''])[0]; if (ind) { e.preventDefault(); ta.setRangeText('\n' + ind, ta.selectionStart, ta.selectionEnd, 'end'); input(); } }
    else if (e.key === 'Escape' && full) root.dispatchEvent(new CustomEvent('closecode'));
  });
  refresh();
  return { el: root, set(t) { ta.value = t; input(); }, insert(t) { const p = ta.selectionStart, ls = ta.value.lastIndexOf('\n', p - 1) + 1, le = ta.value.indexOf('\n', p), cur = ta.value.slice(ls, le < 0 ? undefined : le).trim(); if (cur) { ta.setRangeText('\n' + t, le < 0 ? ta.value.length : le, le < 0 ? ta.value.length : le, 'end'); } else ta.setRangeText(t, ls, le < 0 ? ta.value.length : le, 'end'); ta.focus(); input(); } };
}
function openCodeFs(b, c) {
  const ed = codeEditor(c, () => { stopRun(b); changed(); }, 30, true, () => kwTokens(b)), ov = el('div', { className: 'cfs' });
  const close = () => { ov.remove(); renderInspector(); };
  const ref = el('div', { className: 'cref' }, el('h3', { textContent: 'Instructions (click to insert)' }));
  Object.entries(GASM).forEach(([cat, o]) => { ref.append(el('h5', { textContent: cat, style: 'color:' + CATCOL[cat] })); Object.keys(o).forEach(k => ref.append(el('button', { className: 'cinst', title: o[k][2], onclick: () => ed.insert(insText(k)) }, el('b', { textContent: k, style: 'color:' + CATCOL[cat] }), el('span', { textContent: ' ' + o[k][1] })))); });
  const conn = el('div'); const rebuild = () => conn.replaceChildren(...connectedList(b, c, ed, rebuild)); rebuild(); ref.prepend(conn);
  ref.append(el('h5', { textContent: 'Other values' }), ...['Player.Pos', 'Player.Vel', 'V0', 'R0', 'DeltaTime', 'Time', ...lines(codeX(c).inputs).map(n => 'Input.' + n), ...lines(codeX(c).outputs).map(n => 'Output.' + n)].map(p => el('button', { className: 'cinst', onclick: () => ed.insert(p) }, el('span', { textContent: p, className: 'cprop' }))));
  ov.append(el('div', { className: 'chead' }, el('strong', { textContent: 'Code: ' + label(b) }), el('span', { className: 'spacer' }),
    sel([['', 'Insert example...'], ...Object.keys(SNIPPETS).map(k => [k, k])], '', k => { if (k) ed.set(SNIPPETS[k]); }), btn('Copy as GRAB code', () => { navigator.clipboard && navigator.clipboard.writeText(exportCode(c.code)); flash('Copied (PASS written as SLEEP 0)'); }), btn('Close (Esc)', close, 'primary')), el('div', { className: 'cmain' }, ref, el('div', { className: 'cright' }, runBar(b, c), ed.el)));
  ed.el.addEventListener('closecode', close); document.body.append(ov); ov.querySelector('textarea').focus();
}
function codePanel(box, b, c) {
  const ed = codeEditor(c, () => { stopRun(b); changed(); }, 14, false, () => kwTokens(b));
  box.append(el('h4', { textContent: 'Code (GRAB assembly)' }), btn('Open full screen editor', () => openCodeFs(b, c), 'primary'), runBar(b, c), ed.el, connectSel(b, c, () => renderInspector()),
    field('Example', sel([['', 'Insert...'], ...Object.keys(SNIPPETS).map(k => [k, k])], '', k => { if (k) ed.set(SNIPPETS[k]); })),
    linkList(b, 'links', 'Linked blocks'),
    el('p', { className: 'hint', textContent: 'Linked names (obj0, trg0...) follow link order, which is my best guess at the in-game numbering. Tab completes an instruction. Use Run to try it on the connected blocks.' }));
}

/* ---------- connecting code to blocks ---------- */
function connectSel(b, c, after) {
  const linked = new Set(c.links || []), opts = group.children.filter(m => m !== b && !linked.has(m.userData.id));
  return field('Connect block', sel([['', opts.length ? 'Choose a block...' : '(no other blocks)'], ...opts.map(m => [m.userData.id, label(m) + ' (' + m.userData.s + ')'])], '', id => { if (!id) return; stopRun(b); c.links = [...(c.links || []), id]; changed(); after(); }));
}
function connectedList(b, c, ed, rebuild) {
  const out = [el('h3', { textContent: 'Connected blocks' })], names = linkNames(b), ids = c.links || [];
  if (!ids.some(id => byId(id))) out.push(hint('Nothing connected yet. Connect a block, then use its name (obj0, trg0) in your code.'));
  ids.forEach((id, i) => { const m = byId(id); if (!m) return; const n = names[i], trig = m.userData.s === 'Trigger';
    out.push(el('div', { className: 'lrow' }, el('b', { textContent: n + ' = ' + label(m), style: 'color:#82aaff' }), btn('x', () => { stopRun(b); c.links = c.links.filter(x => x !== id); changed(); rebuild(); })));
    out.push(el('div', { className: 'row', style: 'flex-wrap:wrap;margin-bottom:6px' }, ...(trig ? [['Trigger.Active', n + '.Trigger.Active']] : [['Pos', n + '.Pos'], ['Pos.X', n + '.Pos.X'], ['Pos.Y', n + '.Pos.Y'], ['Pos.Z', n + '.Pos.Z'], ['Rot', n + '.Rot'], ['Sca', n + '.Sca'], ...(SHAPES[m.userData.s] ? [['Col.R', n + '.Col.R'], ['Col.G', n + '.Col.G'], ['Col.B', n + '.Col.B']] : []), ...((m.userData.cfg.anims || []).length ? [['Anim.Active', n + '.Anim.Active']] : [])]).map(([l, t]) => btn(l, () => ed.insert(t)))));
  });
  out.push(connectSel(b, c, rebuild)); return out;
}

/* ---------- running code ---------- */
const codeRuns = new Map(); let codeLast = 0, codeRaf = 0, codeUI = null;
function compileGasm(src) {
  const prog = [], labels = {};
  src.split('\n').forEach((raw, i) => { const line = raw.split(';')[0].trim(); if (!line) return; const [op, ...a] = line.split(/\s+/), OP = op.toUpperCase(); if (OP === 'LABEL') { labels[a[0]] = prog.length; return; } prog.push(OP === 'PASS' ? { op: 'SLEEP', a: ['0'], ln: i + 1 } : { op: OP, a, ln: i + 1 }); });
  return { prog, labels };
}
const nameMap = b => { const o = {}; let ob = 0, tr = 0; ((b.userData.cfg || {}).links || []).forEach(id => { const m = byId(id); if (!m) return; const n = m.userData.s === 'Trigger' ? 'trg' + tr++ : 'obj' + ob++; o[n] = m; const al = (m.userData.name || '').replace(/[^A-Za-z0-9_]/g, '').toLowerCase(); if (al && /^[a-z_]/.test(al) && !o[al] && !['player', 'input', 'output', 'time', 'deltatime'].includes(al)) o[al] = m; }); return o; };
const codeX = c => ((c.x || {}).Code) || {}, lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
const regAlias = c => { const o = {}; lines(codeX(c).regsT).forEach((n, i) => { if (!/^R\d+$/i.test(n) && /^[A-Za-z_]\w*$/.test(n)) o[n.toLowerCase()] = i; }); return o; };
function kwTokens(b) {
  const c = b.userData.cfg, out = ['Player.Pos', 'Player.Vel', 'DeltaTime', 'Time'];
  Object.entries(nameMap(b)).forEach(([n, m]) => { out.push(n); if (m.userData.s === 'Trigger') out.push(n + '.Trigger.Active'); else { ['Pos', 'Rot', 'Sca'].forEach(k => { out.push(n + '.' + k); 'XYZ'.split('').forEach(x => out.push(n + '.' + k + '.' + x)); }); if (SHAPES[m.userData.s]) ['R', 'G', 'B'].forEach(x => out.push(n + '.Col.' + x)); if ((m.userData.cfg.anims || []).length) out.push(n + '.Anim.Active'); } });
  lines(codeX(c).inputs).forEach(n => out.push('Input.' + n)); lines(codeX(c).outputs).forEach(n => out.push('Output.' + n)); Object.keys(regAlias(c)).forEach(n => out.push(n));
  return out;
}
const RAD = 180 / Math.PI;
function vget(run, tok) {
  if (isNumT(tok)) return { get: () => +tok, set() {} };
  if (/^deltatime$/i.test(tok)) return { get: () => run.dt, set() {} };
  if (/^time$/i.test(tok)) return { get: () => run.time, set() {} };
  let m;
  if ((m = tok.match(/^R(\d+)$/i))) { const i = +m[1]; return { get: () => run.R[i] || 0, set: v => { run.R[i] = v; } }; }
  if ((m = tok.match(/^V(\d+)(?:\.([XYZ]))?$/i))) { const i = +m[1], ci = m[2] ? 'XYZ'.indexOf(m[2].toUpperCase()) : -1; run.V[i] = run.V[i] || [0, 0, 0]; return ci < 0 ? { vec: true, get: () => run.V[i].slice(), set: v => { run.V[i] = v.slice(); } } : { get: () => run.V[i][ci], set: v => { run.V[i][ci] = v; } }; }
  const al = run.regNames[tok.toLowerCase()]; if (al !== undefined) return { get: () => run.R[al] || 0, set: v => { run.R[al] = v; } };
  const p = tok.split('.'); if (p.length < 2) return null;
  const head = p[0].toLowerCase(), kind = p[1].toLowerCase(); let g, st;
  if (head === 'input' || head === 'in') return { get: () => run.inputs[p[1]] || 0, set: v => { run.inputs[p[1]] = v; } };
  if (head === 'output' || head === 'out') return { get: () => run.outputs[p[1]] || 0, set: v => { run.outputs[p[1]] = v; } };
  if (head === 'player') {
    if (kind === 'pos') { g = () => (tm ? tm.pos.toArray() : run.player.pos.slice()); st = v => { if (tm) tm.pos.fromArray(v); else run.player.pos = v.slice(); }; }
    else if (kind === 'vel') { g = () => (tm ? tm.vel.toArray() : run.player.vel.slice()); st = v => { if (tm) tm.vel.fromArray(v); else run.player.vel = v.slice(); }; }
    else return null;
  } else {
    const blk = run.names[head]; if (!blk) return null;
    if (kind === 'anim') { const an = blk.userData.cfg.anims || []; return { get: () => (run.animOn[head] ? 1 : 0), set: v => { if (v && !run.animOn[head] && an.length) { startPreview(blk, an[0]); run.animOn[head] = true; } else if (!v && run.animOn[head]) { stopPreviews(); run.animOn[head] = false; } } }; }
    if (kind === 'pos') { g = () => blk.position.toArray(); st = v => blk.position.fromArray(v); }
    else if (kind === 'sca') { g = () => blk.scale.toArray(); st = v => { blk.scale.fromArray(v.map(x => Math.max(0.01, x))); if (SHAPES[blk.userData.s]) tileUV(blk); }; }
    else if (kind === 'rot') { g = () => { const e = new THREE.Euler().setFromQuaternion(blk.quaternion); return [e.x * RAD, e.y * RAD, e.z * RAD]; }; st = v => blk.quaternion.setFromEuler(new THREE.Euler(v[0] / RAD, v[1] / RAD, v[2] / RAD)); }
    else if (kind === 'col') {
      if (!SHAPES[blk.userData.s]) return null; const k = (p[2] || '').toLowerCase(); if (k === 'sel') return { get: () => 0, set() {} };
      const ci = 'rgb'.indexOf(k); if (ci < 0) return null;
      const rgb = () => { const h = blk.userData.cfg.color || '#ffffff'; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
      return { get: () => rgb()[ci], set: v => { const a = rgb(); a[ci] = Math.min(1, Math.max(0, v)); blk.userData.cfg.color = '#' + a.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); blk.userData.cfg.cmode = 'custom'; paint(blk); } };
    }
    else if (kind === 'trigger') return { get: () => (run.trig[head] ? 1 : 0), set: v => { run.trig[head] = !!v; } };
    else return null;
  }
  const ci = p[2] ? 'xyz'.indexOf(p[2].toLowerCase()) : -1;
  return ci < 0 ? { vec: true, get: g, set: st } : { get: () => g()[ci], set: v => { const a = g(); a[ci] = v; st(a); } };
}
function execOp(run, I) {
  const a = I.a, need = t => { const r = t === undefined ? null : vget(run, t); if (!r) { const h = String(t || '').split('.')[0]; throw new Error('Line ' + I.ln + ': cannot find "' + t + '"' + (/^(obj|trg)\d+$/i.test(h) ? ' - ' + h + ' is not connected (use Connect block)' : '')); } return r; };
  const num = t => need(t).get(), dst = (t, v) => need(t).set(v), vec = t => { const r = need(t); if (!r.vec) throw new Error('Line ' + I.ln + ': "' + t + '" is not a vector (use V0, obj0.Pos, Player.Pos...)'); return r; };
  const bin = f => dst(a[0], f(num(a[1]), num(a[2]))), vbin = f => { const d = vec(a[0]), s = vec(a[1]), x = d.get(), y = s.get(); d.set(x.map((v, i) => f(v, y[i]))); };
  if (I.op !== 'GOTO' && I.op !== 'IF' && I.op !== 'SLEEP' && I.op !== 'NOOP') run.idle = false;
  switch (I.op) {
    case 'SET': { const d = need(a[0]), s = need(a[1]); d.set(s.get()); break; }
    case 'SWAP': { const x = need(a[0]), y = need(a[1]), t = x.get(); x.set(y.get()); y.set(t); break; }
    case 'ADD': bin((x, y) => x + y); break; case 'SUB': bin((x, y) => x - y); break; case 'MUL': bin((x, y) => x * y); break;
    case 'DIV': bin((x, y) => (y ? x / y : 0)); break; case 'MOD': bin((x, y) => (y ? x % y : 0)); break;
    case 'FLOOR': dst(a[0], Math.floor(num(a[1]))); break; case 'SQRT': dst(a[0], Math.sqrt(Math.max(0, num(a[1])))); break;
    case 'EQUAL': bin((x, y) => (x === y ? 1 : 0)); break; case 'LESS': bin((x, y) => (x < y ? 1 : 0)); break; case 'GREATER': bin((x, y) => (x > y ? 1 : 0)); break;
    case 'AND': bin((x, y) => (x && y ? 1 : 0)); break; case 'OR': bin((x, y) => (x || y ? 1 : 0)); break; case 'NOT': dst(a[0], num(a[1]) ? 0 : 1); break;
    case 'SIN': dst(a[0], Math.sin(num(a[1]) / RAD)); break; case 'COS': dst(a[0], Math.cos(num(a[1]) / RAD)); break; case 'ATAN2': bin((x, y) => Math.atan2(x, y) * RAD); break;
    case 'NOOP': case 'END': if (I.op === 'END') run.done = true; break;
    case 'GOTO': if (!(a[0] in run.labels)) throw new Error('Line ' + I.ln + ': label "' + a[0] + '" is not defined'); { const back = run.labels[a[0]] < run.pc; run.pc = run.labels[a[0]]; if (back && run.auto && !run.idle) { run.wake = run.time; run.idle = true; return 'yield'; } } break;
    case 'IF': if (num(a[0])) { if (!(a[1] in run.labels)) throw new Error('Line ' + I.ln + ': label "' + a[1] + '" is not defined'); { const back = run.labels[a[1]] < run.pc; run.pc = run.labels[a[1]]; if (back && run.auto && !run.idle) { run.wake = run.time; run.idle = true; return 'yield'; } } } break;
    case 'RAND': dst(a[0], Math.floor(Math.random() * num(a[1]))); break;
    case 'SLEEP': run.idle = true; run.wake = run.time + Math.max(0, num(a[0])) / 1000; return 'yield';
    case 'VEC_ADD': vbin((x, y) => x + y); break; case 'VEC_SUB': vbin((x, y) => x - y); break; case 'VEC_MUL': vbin((x, y) => x * y); break; case 'VEC_SET': vbin((x, y) => y); break;
    case 'VEC_SCL': { const d = vec(a[0]), k = num(a[1]); d.set(d.get().map(v => v * k)); break; }
    case 'VEC_LEN': { const two = a.length >= 2; dst(two ? a[0] : 'R0', Math.hypot(...vec(a[two ? 1 : 0]).get())); break; }
    case 'VEC_DOT': { const three = a.length >= 3, x = vec(a[three ? 1 : 0]).get(), y = vec(a[three ? 2 : 1]).get(); dst(three ? a[0] : 'R0', x[0] * y[0] + x[1] * y[1] + x[2] * y[2]); break; }
    default: throw new Error('Line ' + I.ln + ': unknown instruction ' + I.op);
  }
}
function startRun(b) {
  stopRun(b); const c = b.userData.cfg, { prog, labels } = compileGasm(c.code || ''), L = lintCode(c.code || '');
  const run = { b, prog, labels, pc: 0, R: Array(16).fill(0), V: Array.from({ length: 8 }, () => [0, 0, 0]), names: nameMap(b), time: 0, dt: 0, wake: 0, done: false, err: L.notes.find(n => /not a GRAB instruction|needs \d/.test(n)) || '', trig: {}, player: { pos: [0, 1, 0], vel: [0, 0, 0] }, saved: new Map(), auto: c.autoLoop !== false, regNames: regAlias(c), inputs: { ...(codeX(c).inVals || {}) }, outputs: {}, animOn: {} };
  Object.values(run.names).forEach(m => run.saved.set(m, { p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone(), col: m.userData.cfg.color, cm: m.userData.cfg.cmode }));
  codeRuns.set(b, run); if (!codeRaf) { codeLast = performance.now(); codeRaf = requestAnimationFrame(codeLoop); }
}
function stopRun(b) {
  const run = codeRuns.get(b); if (!run) return; codeRuns.delete(b);
  if (Object.values(run.animOn).some(Boolean)) stopPreviews();
  run.saved.forEach((v, m) => { m.position.copy(v.p); m.quaternion.copy(v.q); m.scale.copy(v.s); if (SHAPES[m.userData.s]) { m.userData.cfg.color = v.col; m.userData.cfg.cmode = v.cm; paint(m); tileUV(m); } if (m === selected) syncSel(); });
  updateLinks(); updateRunUI();
}
const stopAllRuns = () => [...codeRuns.keys()].forEach(stopRun);
const trigPrev = new Map();
function startAllCode() { trigPrev.clear(); group.children.filter(m => m.userData.s === 'Code' && m.userData.cfg.startActive !== false).forEach(startRun); if (!codeRaf) { codeLast = performance.now(); codeRaf = requestAnimationFrame(codeLoop); } }
const trigState = new Map(), trigInside = new Map(), trigBtn = new Set();
function fireAnim(name, target) {
  const list = target ? [target] : group.children.filter(m => (m.userData.cfg.anims || []).some(a => a.name === name));
  list.forEach(m => { const an = m.userData.cfg.anims || [], a = an.find(z => z.name === name) || an[0]; if (a && a.frames.length > 1 && !previews.has(m)) startPreview(m, a); });
}
function trigFire(t, kind) {
  const x = (t.userData.cfg.x || {}).Trigger; if (!x) return;
  const objs = [x.cObj, kind === 'leave' ? x.cLeave : x.cEnter].filter(Boolean).map(byId).filter(Boolean), anims = [x.cAnim, x.cAnimConn].filter(Boolean);
  if (anims.length) anims.forEach(n => (objs.length ? objs.forEach(o => fireAnim(n, o)) : fireAnim(n, null)));
  objs.forEach(o => { if (o.userData.s === 'Code') { if (!codeRuns.has(o)) startRun(o); } else if (!anims.length && (o.userData.cfg.anims || []).length) fireAnim(o.userData.cfg.anims[0].name, o); });
  const cb = x.cCode && byId(x.cCode); if (cb && cb.userData.s === 'Code' && !codeRuns.has(cb)) startRun(cb);
  const ct = x.cTrig && byId(x.cTrig); if (ct) { const cx = (ct.userData.cfg.x || {}).Trigger || {}; trigState.set(ct, !(trigState.has(ct) ? trigState.get(ct) : cx.startActive !== false)); }
  flash('Trigger ' + label(t) + ': ' + kind);
}
function trigTick() {
  if (!tm) return;
  group.children.forEach(t => {
    if (t.userData.s !== 'Trigger') return; const x = (t.userData.cfg.x || {}).Trigger; if (!x) return;
    const inB = p => { const l = t.worldToLocal(p); return Math.abs(l.x) <= 0.5 && Math.abs(l.y) <= 0.5 && Math.abs(l.z) <= 0.5; };
    const inside = [0, 0.8, 1.5].some(d => inB(tm.pos.clone().add(new THREE.Vector3(0, -d, 0)))), was = trigInside.get(t) || false; trigInside.set(t, inside);
    if (!(trigState.has(t) ? trigState.get(t) : x.startActive !== false)) return;
    if (inside && !was && x.onEnter !== false) trigFire(t, 'enter');
    if (!inside && was && x.onLeave) trigFire(t, 'leave');
    if (inside && x.button) { if (keys.f) { if (!trigBtn.has(t)) { trigBtn.add(t); trigFire(t, 'button'); } } else trigBtn.delete(t); }
  });
}
function stepRun(run, dt) {
  run.dt = dt; run.time += dt; if (tm) Object.entries(run.names).forEach(([n, m]) => { if (m.userData.s === 'Trigger') { const l = m.worldToLocal(tm.pos.clone()); run.trig[n] = Math.abs(l.x) <= 0.5 && Math.abs(l.y) <= 0.5 && Math.abs(l.z) <= 0.5; } });
  if (run.done || run.err || run.time < run.wake) return;
  for (let n = 0; n < 2000 && run.pc < run.prog.length; n++) { const I = run.prog[run.pc++]; let r; try { r = execOp(run, I); } catch (e) { run.err = e.message; return; } if (r === 'yield' || run.done) break; }
  if (run.pc >= run.prog.length) run.done = true;
}
function codeLoop(t) {
  codeRaf = 0; if (!codeRuns.size && !tm) return; trigTick(); const dt = Math.min(0.1, (t - codeLast) / 1000 || 0.016); codeLast = t;
  codeRuns.forEach(run => stepRun(run, dt)); if (selected && [...codeRuns.values()].some(r => Object.values(r.names).includes(selected))) syncSel(); updateLinks(); updateRunUI(); codeRaf = requestAnimationFrame(codeLoop);
}
function updateRunUI() {
  if (!codeUI || !document.body.contains(codeUI.pre)) return; const run = codeRuns.get(codeUI.b), f = x => (Math.round(x * 100) / 100).toString();
  codeUI.status.textContent = !run ? 'Stopped' : run.err ? 'Error: ' + run.err : run.done ? 'Finished' : 'Running';
  codeUI.status.style.color = run && run.err ? '#ff6b6b' : '';
  const outs = run ? Object.entries(run.outputs).map(([k, v]) => 'Output.' + k + '=' + f(v)).join('  ') : '';
  codeUI.pre.textContent = run ? (outs ? outs + '\n' : '') + run.R.slice(0, 8).map((v, i) => 'R' + i + '=' + f(v)).join('  ') + '\n' + run.V.slice(0, 4).map((v, i) => 'V' + i + '=(' + v.map(f).join(',') + ')').join('  ') : '';
}
function runBar(b, c) {
  const status = el('span', { className: 'hint', textContent: 'Stopped' }), pre = el('pre', { className: 'crun' });
  const trigs = Object.entries(nameMap(b)).filter(([, m]) => m.userData.s === 'Trigger').map(([n]) => field(n + ' active', el('input', { type: 'checkbox', onchange: e => { const r = codeRuns.get(b); if (r) r.trig[n] = e.target.checked; } })));
  const o = codeX(c), ins = lines(o.inputs).map(n => field('Input.' + n, num((o.inVals || {})[n] || 0, v => { c.x.Code.inVals = c.x.Code.inVals || {}; c.x.Code.inVals[n] = v; const r = codeRuns.get(b); if (r) r.inputs[n] = v; }, 0.1)));
  const opts = [field('Start active', el('input', { type: 'checkbox', checked: c.startActive !== false, onchange: e => { c.startActive = e.target.checked; changed(); } })), field('Auto-wait in loops', el('input', { type: 'checkbox', checked: c.autoLoop !== false, onchange: e => { c.autoLoop = e.target.checked; stopRun(b); changed(); } }))];
  codeUI = { b, pre, status };
  return el('div', { className: 'cbar' }, el('div', { className: 'row' }, btn('Run', () => { startRun(b); updateRunUI(); }, 'primary'), btn('Stop', () => stopRun(b)), status), ...opts, ...ins, ...trigs, pre,
    hint('Runs on the connected blocks and moves them live; Stop puts them back. SIN/COS/ATAN2 use degrees, like Rot (as in the GASM tutorial). In Test mode every code block with Start active on runs automatically; with it off, a trigger set to target this code (Trigger settings) starts it. Loops wait one frame on each pass automatically, or write PASS yourself.'));
}

const exportCode = src => String(src || '').split('\n').map(l => l.replace(/^(\s*)PASS\b/i, '$1SLEEP 0')).join('\n');
Object.assign(SNIPPETS, {
  'Spin obj0 (PASS in loop)': 'LABEL Loop\nMUL R0 DeltaTime 90\nADD obj0.Rot.Y obj0.Rot.Y R0\nPASS\nGOTO Loop\n',
  'Chase the player (vectors)': 'LABEL Loop\nVEC_SET V0 Player.Pos\nVEC_SUB V0 obj0.Pos\nVEC_LEN R0 V0\nGREATER R1 R0 0.2\nNOT R1 R1\nIF R1 Wait\nDIV R2 3 R0\nMUL R2 R2 DeltaTime\nVEC_SCL V0 R2\nVEC_ADD obj0.Pos V0\nLABEL Wait\nPASS\nGOTO Loop\n',
  'Raise obj0 when trg0 is active': 'LABEL Loop\nSET R0 trg0.Trigger.Active\nIF R0 Go\nPASS\nGOTO Loop\nLABEL Go\nADD obj0.Pos.Y obj0.Pos.Y 5\nEND\n'
});

/* ---------- code export (numbers worked out from the cheat sheet level) ---------- */
// The cheat sheet level holds 33 instruction slots. Their value shapes are certain (r=register, L=label, c=number).
// Their NAMES are not stored in the file, so the numbering below is a best guess until confirmed.
const SLOT_SHAPES = ['rr', 'rr', 'rrr', 'rrr', 'rrr', 'rrr', 'rrr', 'rrr', 'rrr', 'rrr', 'rrr', 'rr', 'L', 'L', 'rL', 'c', '', 'rc', 'rr', 'rrr', 'rr', 'rr', 'rr', 'rrr', 'rrr', 'rr', 'rr', 'rrr', 'rrr', 'rrr', 'rrr', 'rr', 'rrr'];
const OP_GUESS = { SET: 1, SWAP: 2, ADD: 3, SUB: 4, MUL: 5, DIV: 6, MOD: 7, EQUAL: 8, LESS: 9, GREATER: 10, AND: 11, NOT: 12, LABEL: 13, GOTO: 14, IF: 15, SLEEP: 16, NOOP: 17, RAND: 18 };
const OPK = 'levelstudio.opcodes.v1'; let opTable = { map: OP_GUESS, confirmed: false }, codeWarn = [];
try { const t = JSON.parse(localStorage.getItem(OPK)); if (t && t.map) opTable = t; } catch {}
function codeProgram(b) {
  const c = b.userData.cfg, src = exportCode(c.code || ''), lab = label(b);
  const vars = lines(codeX(c).regsT), names = vars.length ? vars : ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];
  if (!src.trim()) return null;
  const regIdx = t => { const i = names.findIndex(v => v.toLowerCase() === t.toLowerCase()); return i >= 0 ? i : -1; };
  const labels = [], rows = [], bad = new Set(), noNum = new Set();
  src.split('\n').forEach(raw => { const l = raw.split(';')[0].trim(); if (!l) return; const [op, a0] = l.split(/\s+/); if (op.toUpperCase() === 'LABEL' && a0 && !labels.includes(a0)) labels.push(a0); });
  src.split('\n').forEach(raw => {
    const l = raw.split(';')[0].trim(); if (!l) return; const [op, ...a] = l.split(/\s+/), OP = op.toUpperCase(), ops = [];
    a.forEach((t, k) => {
      const isLab = (OP === 'LABEL' || OP === 'GOTO') ? k === 0 : OP === 'IF' ? k === 1 : false;
      if (isLab) { const i = labels.indexOf(t); if (i < 0) bad.add('label ' + t); else ops.push([5, i]); }
      else if (isNumT(t)) ops.push([4, +t]);
      else if (regIdx(t) >= 0) ops.push([2, regIdx(t)]);
      else bad.add(t);
    });
    const n = opTable.map[OP]; if (n === undefined) noNum.add(OP);
    rows.push({ n, ops });
  });
  if (bad.size) { codeWarn.push('Code block "' + lab + '": it uses ' + [...bad].slice(0, 4).join(', ') + ' (connected blocks, player values or other things that cannot be exported yet), so the code was left empty in the .level'); return null; }
  if (noNum.size) { codeWarn.push('Code block "' + lab + '": no instruction number is set for ' + [...noNum].join(', ') + ' (Help > Code instruction numbers), so the code was left empty in the .level'); return null; }
  if (!opTable.confirmed) codeWarn.push('Code was exported using UNCONFIRMED instruction numbers. Check Help > Code instruction numbers against the game before trusting it.');
  const ins = rows.map(r => lenEntry(5, cat([cat([vint(8), vint(r.n)]), ...r.ops.map(([k, v]) => lenEntry(2, k === 4 ? cat([vint(8), vint(4), fEntry(3, v)]) : cat([vint(8), vint(k), vint(16), vint(v)])))])));
  return cat([...names.map(n => lenEntry(3, strEntry(1, n))), ...labels.map(n => lenEntry(4, strEntry(1, n))), ...ins]);
}
function opDialog() {
  const names = Object.keys(INSTR).filter(k => k !== 'PASS'), inv = {}, pick = {}; Object.entries(opTable.map).forEach(([k, n]) => { inv[n] = k; pick[n] = k; });
  const kind = { r: 'register', L: 'label', c: 'number' };
  const rows = SLOT_SHAPES.map((sh, i) => { const n = i + 1; return field('#' + n + '  ' + (sh ? sh.split('').map(x => kind[x]).join(', ') : 'no values'), sel([['', '(not sure)'], ...names.filter(k => INSTR[k].n === sh.length).map(k => [k, k])], inv[n] || '', v => { pick[n] = v; })); });
  const box = el('div'); box.style.cssText = 'max-height:55vh;overflow:auto;margin:8px 0'; box.append(...rows);
  const d = el('dialog', {}, el('h3', { textContent: 'Code instruction numbers' }), hint('GRAB stores each instruction as a number. Open the instruction list in the game: slot #1 is the first one it shows, #2 the second, and so on. Pick which instruction each slot is. The values it takes come from the cheat sheet level, so only matching instructions are offered. Leave a slot as "not sure" if you do not know it.'), box,
    el('div', { className: 'row' }, btn('Cancel', () => { d.close(); d.remove(); }), btn('Save', () => {
      const map = {}, used = new Set(); let dup = '';
      Object.entries(pick).forEach(([n, k]) => { if (!k) return; if (used.has(k)) dup = k; used.add(k); map[k] = +n; });
      if (dup) { alert(dup + ' is chosen for two slots. Each instruction can only be in one slot.'); return; }
      opTable = { map, confirmed: true }; try { localStorage.setItem(OPK, JSON.stringify(opTable)); } catch {} d.close(); d.remove(); flash('Instruction numbers saved');
    }, 'primary')));
  document.body.append(d); d.showModal();
}
HT['Code blocks and export'] = 'WHAT EXPORTS\nCode that uses registers (R0, R1... or the names you gave them), plain numbers, labels, GOTO, IF and SLEEP is written into the .level, with the instruction layout taken from the cheat sheet level.\n\nWHAT DOES NOT EXPORT YET\n- Values from connected blocks (obj0.Pos.X...), Player values, DeltaTime, Input/Output, vectors (V0...) and code connections. If a block uses any of these, its code is left empty in the .level and you get a warning.\n- Instructions without a known number. The cheat sheet level only contains numbered slots, not their names, so use Help > Code instruction numbers to say which instruction is which slot. Until you save that table the numbers are a best guess and every export warns about it.\n\nTRIGGERS IN THE EDITOR\nIn Test mode (T), walking into a trigger runs what it is connected to: its animation, connected blocks, code blocks, and other triggers. Settings used: Start active, On enter, On leave, Button press (F).';

const LESSONS = [
  { id: 'regs', title: '1. Registers', text: ['Registers are small storage boxes for numbers. GASM gives you eight of them: R0 to R7. You can overwrite them whenever you like.', 'SET puts a value in a register. ADD, SUB, MUL and DIV take the destination first, then the two values to combine.'],
    code: 'SET R0 10   ; store 10 in R0\nSET R1 20   ; store 20 in R1\nADD R2 R0 R1  ; R2 = R0 + R1 = 30\nSUB R3 R1 R0  ; R3 = 20 - 10 = 10\nMUL R4 R0 R1  ; R4 = 200\nDIV R5 R1 R0  ; R5 = 2',
    task: 'Put 10 in R0 and 20 in R1, then use ADD to store their total in R2.', start: '; write your code here\n', hint: 'SET R0 10, SET R1 20, then ADD R2 R0 R1.',
    check: (src, run) => { const r = run(src, { frames: 5 }); return [[/\bADD\b/i.test(src), 'You used ADD'], [r.R[0] === 10, 'R0 is 10 (now ' + r.R[0] + ')'], [r.R[1] === 20, 'R1 is 20 (now ' + r.R[1] + ')'], [r.R[2] === 30, 'R2 is 30 (now ' + r.R[2] + ')']]; } },
  { id: 'arith', title: '2. Arithmetic', text: ['More maths: MOD gives the remainder, FLOOR rounds down, SQRT is the square root, and SWAP exchanges two registers without needing a third. MOD is great for repeating patterns.'],
    code: 'MOD R0 17 5   ; remainder of 17 / 5 = 2\nFLOOR R1 4.8  ; 4\nSQRT R2 25    ; 5\nSWAP R3 R4    ; exchange R3 and R4',
    task: 'Store 15 in R0 and 7 in R1. Add them into R2, then multiply R2 by 2 into R3. You should end with R2 = 22 and R3 = 44.', start: '', hint: 'ADD R2 R0 R1 then MUL R3 R2 2.',
    check: (src, run) => { const r = run(src, { frames: 5 }); return [[/\bADD\b/i.test(src) && /\bMUL\b/i.test(src), 'You used ADD and MUL'], [r.R[2] === 22, 'R2 is 22 (now ' + r.R[2] + ')'], [r.R[3] === 44, 'R3 is 44 (now ' + r.R[3] + ')']]; } },
  { id: 'loops', title: '3. Loops', text: ['Loops repeat instructions, which is how you move things, watch triggers and run animations continuously.', 'Three instructions make a loop: LABEL names a place to jump to, GOTO jumps back to it, and SLEEP 0 waits until the next frame. Without that wait, the loop would run endlessly inside a single frame.'],
    code: 'SET R0 0\nLABEL loop\nADD R0 R0 1\nSLEEP 0\nGOTO loop',
    task: 'Make a loop that increases R0 by 5 every frame.', start: 'SET R0 0\n', hint: 'Inside the loop: ADD R0 R0 5, then SLEEP 0, then GOTO back to your label.',
    check: (src, run) => { const r = run(src, { frames: 10 }); return [[/\bLABEL\b/i.test(src) && /\bGOTO\b/i.test(src), 'You used LABEL and GOTO'], [/\b(SLEEP|PASS)\b/i.test(src), 'The loop waits for the next frame'], [r.R[0] >= 45 && r.R[0] <= 50 && r.R[0] % 5 === 0, 'After 10 frames R0 is 50 (now ' + r.R[0] + ')'], [!r.done, 'The loop keeps running']]; } },
  { id: 'cond', title: '4. Conditions', text: ['A comparison checks two values and stores 1 (true) or 0 (false) in a register. EQUAL, LESS and GREATER compare; AND, OR and NOT combine true/false values.', 'The comparison does not jump anywhere. IF does: if the register is not zero it jumps to a label, otherwise it carries on with the next line. There is no automatic else, so you build one with labels and GOTO.'],
    code: 'GREATER R0 R1 10  ; is R1 bigger than 10?\nIF R0 high        ; if yes, jump to high\nSET R2 0          ; otherwise R2 = 0\nGOTO finish\nLABEL high\nSET R2 1\nLABEL finish\nEND',
    task: 'R0 starts with a number (we change it between tests). Set R1 to 1 if R0 is greater than 10, otherwise set R1 to 0.', start: '', hint: 'GREATER R2 R0 10, then IF R2 yes. Set R1 to 0 and GOTO the end, then LABEL yes and set R1 to 1.',
    check: (src, run) => [[12, 1], [10, 0], [3, 0]].map(([v, e]) => { const r = run(src, { frames: 5, pre: { R0: v, R1: 9 } }); return [r.R[1] === e, 'R0 = ' + v + ' gives R1 = ' + e + ' (got ' + r.R[1] + ')']; }) },
  { id: 'cond2', title: '5. Combining conditions', text: ['AND is true only if both inputs are true. OR is true if at least one is. NOT flips true and false.', 'GREATER-or-equal does not exist as one instruction, so you combine GREATER and EQUAL with OR.'],
    code: 'GREATER R0 10 5   ; true\nLESS R1 3 8       ; true\nAND R2 R0 R1      ; true only if both are true\nIF R2 bothTrue',
    task: 'R0 starts with a number. Set R1 to 1 if R0 is greater than OR equal to 10, otherwise 0.', start: '', hint: 'GREATER R2 R0 10 and EQUAL R3 R0 10, then OR R4 R2 R3, and IF on R4.',
    check: (src, run) => [[10, 1], [11, 1], [9, 0]].map(([v, e]) => { const r = run(src, { frames: 5, pre: { R0: v, R1: 9 } }); return [r.R[1] === e, 'R0 = ' + v + ' gives R1 = ' + e + ' (got ' + r.R[1] + ')']; }).concat([[/\bOR\b/i.test(src), 'You used OR']]) },
  { id: 'obj', title: '6. Object connections', text: ['Connections let code change blocks in your level. In the studio you connect a block to a code block, and it gets a name like obj0 (triggers are trg0). Then you can read and write its properties.', 'Pos.X/Y/Z is position. Rot.X/Y/Z is rotation in degrees. Trigger blocks have Trigger.Active.'],
    code: 'SET obj0.Pos.X 5\nADD obj0.Pos.Y obj0.Pos.Y 2\nADD obj0.Rot.Y obj0.Rot.Y 45', objs: { obj0: [0, 0, 0] },
    task: 'In this practice obj0 starts at the origin. Move it up by 2 units and rotate it 90 degrees around its Y axis.', start: '', hint: 'ADD obj0.Pos.Y obj0.Pos.Y 2 and ADD obj0.Rot.Y obj0.Rot.Y 90.',
    check: (src, run) => { const r = run(src, { frames: 5, objs: { obj0: [0, 0, 0] } }), m = r.names.obj0; if (!m) return [[false, 'obj0 was not found']]; const e = new THREE.Euler().setFromQuaternion(m.quaternion); return [[Math.abs(m.position.y - 2) < 0.01, 'Height is 2 (now ' + fx(m.position.y) + ')'], [Math.abs(e.y * RAD - 90) < 1, 'Rotation Y is 90 (now ' + fx(e.y * RAD) + ')']]; } },
  { id: 'dt', title: '7. Delta time', text: ['Moving a fixed amount each frame depends on the frame rate. DeltaTime is the time since the last frame, so multiplying a speed by it gives the same result on any frame rate.', 'Put the maths inside a loop to keep updating.'],
    code: 'LABEL loop\nMUL R0 2 DeltaTime        ; 2 units per second\nADD obj0.Pos.Y obj0.Pos.Y R0\nSLEEP 0\nGOTO loop', objs: { obj0: [0, 0, 0] },
    task: 'Make obj0 rise at 3 units per second using DeltaTime and a loop. After one second it should be at height 3.', start: 'LABEL loop\n', hint: 'MUL R0 3 DeltaTime, ADD obj0.Pos.Y obj0.Pos.Y R0, SLEEP 0, GOTO loop.',
    check: (src, run) => { const r = run(src, { frames: 60, objs: { obj0: [0, 0, 0] } }), m = r.names.obj0; if (!m) return [[false, 'obj0 was not found']]; return [[/deltatime/i.test(src), 'You used DeltaTime'], [m.position.y > 2.8 && m.position.y < 3.2, 'After 1 second the height is about 3 (now ' + fx(m.position.y) + ')'], [!r.done, 'The loop keeps running']]; } },
  { id: 'vec', title: '8. Vectors', text: ['A vector holds three numbers (X, Y, Z): positions, directions, offsets. The vector instructions are VEC_SET, VEC_ADD, VEC_SUB, VEC_MUL, VEC_SCL, VEC_LEN and VEC_DOT.', 'In this studio they take the destination first: VEC_ADD V0 V1 means V0 = V0 + V1. You can use V0 to V7, or a connected block, like obj0.Pos. Check the exact syntax in your game version before relying on it there.', 'By hand: (1,2,3)+(4,5,6)=(5,7,9), (4,5,6)-(1,2,3)=(3,3,3), (1,2,3)x2=(2,4,6), the length of (3,4,0) is 5, and (1,2,3).(4,5,6)=32.'],
    code: 'VEC_SET V0 obj0.Pos   ; copy obj0 position into V0\nVEC_ADD V0 obj1.Pos   ; add obj1 position\nVEC_SET obj0.Pos V0', objs: { obj0: [1, 2, 3], obj1: [4, 5, 6] },
    task: 'obj0 sits at (1,2,3) and obj1 at (4,5,6). Add obj1\'s position to obj0\'s so obj0 ends at (5,7,9).', start: '', hint: 'VEC_ADD obj0.Pos obj1.Pos does it in one line.',
    check: (src, run) => { const r = run(src, { frames: 5, objs: { obj0: [1, 2, 3], obj1: [4, 5, 6] } }), m = r.names.obj0; if (!m) return [[false, 'obj0 was not found']]; const p = m.position.toArray(); return [[/VEC_/i.test(src), 'You used a vector instruction'], [p[0] === 5 && p[1] === 7 && p[2] === 9, 'obj0 is at (5,7,9) (now ' + p.map(fx).join(',') + ')']]; } },
  { id: 'trig', title: '9. Trigonometry', text: ['SIN and COS create circular motion, waves and oscillation. ATAN2 gives an angle from two coordinates. GASM trigonometry works in degrees.'],
    code: 'SIN R0 90    ; 1\nCOS R1 0     ; 1\nATAN2 R2 1 1 ; 45',
    task: 'Store the sine of 30 degrees in one register and the cosine of 60 degrees in a different one. Both answers are 0.5.', start: '', hint: 'SIN R0 30 and COS R1 60.',
    check: (src, run) => { const r = run(src, { frames: 5 }); return [[/\bSIN\b/i.test(src) && /\bCOS\b/i.test(src), 'You used SIN and COS'], [Math.abs(r.R[0] - 0.5) < 0.001, 'R0 is 0.5 (now ' + fx(r.R[0]) + ')'], [Math.abs(r.R[1] - 0.5) < 0.001, 'R1 is 0.5 (now ' + fx(r.R[1]) + ')']]; } },
  { id: 'rand', title: '10. Random numbers', text: ['RAND R0 6 stores a random whole number from 0 up to 5. To shift the range, add to it, so RAND then ADD 1 gives 1 to 6.'],
    code: 'RAND R0 6      ; 0 to 5\nADD R0 R0 1    ; 1 to 6',
    task: 'Generate a random whole number from 1 to 10 and store it in R0.', start: '', hint: 'RAND R0 10 gives 0 to 9. Add 1.',
    check: (src, run) => { const seen = new Set(); let bad = 0; for (let i = 0; i < 200; i++) { const v = run(src, { frames: 3 }).R[0]; seen.add(v); if (!Number.isInteger(v) || v < 1 || v > 10) bad++; } return [[/\bRAND\b/i.test(src), 'You used RAND'], [bad === 0, 'Every result was a whole number from 1 to 10'], [seen.has(1) && seen.has(10), 'Both 1 and 10 can come up']]; } },
  { id: 'debug', title: '11. Macros and debugging', info: true, text: ['Macros (#FOR, #IF, #END, #DEFINE) generate code before it runs. They are not normal instructions, so check your editor\'s macro syntax before using them.', 'When a script does not work, check: register values (including R7), connection names and whether the property can be written, that every label exists and jumps go to the right one, that comparisons give the true/false you expect, that loops wait for the next frame, that vector instructions get vectors, and that nothing can divide by zero.'],
    code: '', task: 'Read the checklist above, then continue to the final challenge.', start: '', hint: '', check: null },
  { id: 'final', title: '12. Final challenge: moving platform', final: true, text: ['Build a platform that rises and falls forever.', 'Use an object connection (obj0), DeltaTime so the speed is steady, a loop, comparisons with true/false registers to detect the top and bottom, and IF to switch direction. Add a comment the first time each instruction appears.'],
    code: '', objs: { obj0: [0, 0, 0] }, task: 'obj0 starts at height 0. Make it rise to height 5, then fall back to 0, and repeat. Keep it moving for the whole test (20 seconds).', start: '; platform: rises to 5, falls to 0\nSET R0 1   ; R0 = direction (1 up, 0 down)\nLABEL loop\n', hint: 'Use R1 for the speed: MUL R1 2 DeltaTime. If R0 is 1 add R1 to obj0.Pos.Y, otherwise subtract it. Then GREATER R2 obj0.Pos.Y 5 and if true set R0 to 0; LESS R3 obj0.Pos.Y 0 and if true set R0 to 1. Finish each frame with SLEEP 0 and GOTO loop.',
    check: (src, run) => { const ys = []; const r = run(src, { frames: 1200, objs: { obj0: [0, 0, 0] }, probe: (rn) => { ys.push(rn.names.obj0.position.y); } }); if (!r.names.obj0) return [[false, 'obj0 was not found']]; let turns = 0, dir = 0; for (let i = 1; i < ys.length; i++) { const d = ys[i] - ys[i - 1]; if (Math.abs(d) < 1e-9) continue; const nd = d > 0 ? 1 : -1; if (dir && nd !== dir) turns++; dir = nd; } const mx = Math.max(...ys), mn = Math.min(...ys);
      return [[/deltatime/i.test(src), 'You used DeltaTime'], [/\bLABEL\b/i.test(src) && /\bGOTO\b/i.test(src), 'You used a loop (LABEL and GOTO)'], [/\bIF\b/i.test(src), 'You used IF'], [/\b(GREATER|LESS)\b/i.test(src), 'You used a comparison'], [mx > 4.5 && mx < 5.8, 'The top is about 5 (reached ' + fx(mx) + ')'], [mn > -0.4 && mn < 0.4, 'The bottom is about 0 (reached ' + fx(mn) + ')'], [turns >= 2, 'It keeps switching direction (' + turns + ' turns)'], [!r.done, 'The script keeps running']]; } }
];
const fx = n => Math.round(n * 1000) / 1000;
function lessonRun(src, o = {}) {
  const { prog, labels } = compileGasm(src), L = lintCode(src), names = {};
  Object.entries(o.objs || {}).forEach(([n, p]) => { const m = new THREE.Object3D(); m.userData = { s: 'Fake', cfg: { anims: [] } }; m.position.fromArray(p); names[n] = m; });
  const run = { prog, labels, pc: 0, R: Array(16).fill(0), V: Array.from({ length: 8 }, () => [0, 0, 0]), names, time: 0, dt: 0, wake: 0, done: false, err: L.notes.find(n => /not a GRAB instruction|needs \d/.test(n)) || '', trig: {}, player: { pos: [0, 1, 0], vel: [0, 0, 0] }, saved: new Map(), auto: false, regNames: {}, inputs: {}, outputs: {}, animOn: {} };
  Object.entries(o.pre || {}).forEach(([k, v]) => { run.R[+k.slice(1)] = v; });
  for (let f = 0; f < (o.frames || 120) && !run.done && !run.err; f++) { stepRun(run, o.dt || 1 / 60); if (o.probe) o.probe(run, f); }
  return run;
}
const LK = 'levelstudio.learn.v1'; let ls = { done: {}, code: {}, at: 0 }; try { ls = { ...ls, ...JSON.parse(localStorage.getItem(LK)) }; } catch {}
const saveLs = () => { try { localStorage.setItem(LK, JSON.stringify(ls)); } catch {} };
const learnEl = el('section', { id: 'learn', hidden: true }); document.body.append(learnEl);
let learnFrom = 'home';
function openLearn() {
  if (!$('editor').hidden) { if (tm) endTest(); saveNow(); learnFrom = 'editor'; } else learnFrom = 'home';
  $('editor').hidden = true; $('home').hidden = true; learnEl.hidden = false; renderLearn();
}
function closeLearn() { learnEl.hidden = true; if (learnFrom === 'editor') { $('editor').hidden = false; resize(); queueRefresh(); } else { $('home').hidden = false; renderList(); } }
function renderLearn() {
  ls.at = Math.max(0, Math.min(ls.at, LESSONS.length - 1)); const i = ls.at, L = LESSONS[i], doneN = LESSONS.filter(x => ls.done[x.id]).length;
  const ed = codeEditor({ code: ls.code[L.id] ?? L.start }, () => {}, 16, false), ta = ed.el.querySelector('textarea'), out = el('div', { className: 'lout' });
  ta.addEventListener('input', () => { ls.code[L.id] = ta.value; saveLs(); });
  const go = n => { ls.at = n; saveLs(); renderLearn(); };
  const showRun = () => {
    const r = lessonRun(ta.value, { frames: L.id === 'dt' ? 60 : 30, objs: L.objs, pre: L.pre }); const f = x => fx(x);
    out.className = 'lout'; out.textContent = (r.err ? 'Problem: ' + r.err + '\n' : '') + r.R.slice(0, 8).map((v, k) => 'R' + k + '=' + f(v)).join('  ') + Object.entries(r.names).map(([n, m]) => '\n' + n + ' pos=(' + m.position.toArray().map(f).join(', ') + ')').join('');
  };
  const doCheck = () => {
    if (L.info) { ls.done[L.id] = true; saveLs(); renderLearn(); return; }
    const rows = L.check(ta.value, lessonRun), ok = rows.every(r => r[0]); out.className = 'lout';
    out.replaceChildren(...rows.map(([k, m]) => el('div', { className: k ? 'lok' : 'lno', textContent: (k ? '\u2713 ' : '\u2717 ') + m })));
    if (ok) { ls.done[L.id] = true; saveLs(); out.append(el('div', { className: 'lok', textContent: L.final ? 'Challenge complete! You have finished the course.' : 'Well done! You can go to the next lesson.' })); learnEl.querySelector('.lbar i').style.width = (LESSONS.filter(x => ls.done[x.id]).length / LESSONS.length * 100) + '%'; learnEl.querySelector('.lnav').replaceWith(nav()); }
  };
  const nav = () => el('nav', { className: 'lnav' }, ...LESSONS.map((x, k) => el('button', { className: k === i ? 'on' : '', textContent: (ls.done[x.id] ? '\u2713 ' : '') + x.title, onclick: () => go(k) })));
  const content = el('div', { className: 'lcontent' }, el('h2', { textContent: L.title }), ...L.text.map(t => el('p', { textContent: t })));
  if (L.code) content.append(el('h4', { textContent: 'Example' }), el('pre', { className: 'lcode', textContent: L.code }), btn('Copy example into the editor', () => { ed.set(L.code); ls.code[L.id] = L.code; saveLs(); }));
  content.append(el('div', { className: 'ltask' }, el('b', { textContent: L.final ? 'Final challenge: ' : 'Your turn: ' }), L.task));
  if (L.hint) content.append(el('details', {}, el('summary', { textContent: 'Need a hint?' }), el('p', { textContent: L.hint })));
  const right = el('div', { className: 'lright' }, el('h4', { textContent: 'Your code' }), ed.el,
    el('div', { className: 'row', style: 'margin-top:8px;flex-wrap:wrap' }, ...(L.info ? [] : [btn('Run', showRun), btn('Check my answer', doCheck, 'primary'), btn('Start over', () => { ed.set(L.start); ls.code[L.id] = L.start; saveLs(); out.textContent = ''; })]), ...(L.info ? [btn('I have read this', doCheck, 'primary')] : []),
      i > 0 ? btn('Previous', () => go(i - 1)) : '', i < LESSONS.length - 1 ? btn('Next lesson', () => go(i + 1), ls.done[L.id] ? 'primary' : '') : ''), out);
  if (L.info === undefined && !L.check) right.append(hint(''));
  learnEl.replaceChildren(
    el('div', { className: 'lhead' }, btn('\u2190 Back', closeLearn), el('strong', { textContent: 'Learn GASM code' }), el('span', { className: 'hint', textContent: doneN + ' of ' + LESSONS.length + ' lessons done' }), (() => { const b = el('div', { className: 'lbar' }, el('i')); b.firstChild.style.width = (doneN / LESSONS.length * 100) + '%'; return b; })(), el('span', { className: 'spacer' }), el('span', { className: 'hint', textContent: 'Your level was saved automatically.' })),
    el('div', { className: 'lbody' }, nav(), content, right));
}
{ const b = document.createElement('button'); b.id = 'learnBtn'; b.textContent = 'Learn code'; b.onclick = openLearn; $('exportBtn').before(b); }
{ const b = document.createElement('button'); b.textContent = 'Learn code'; b.onclick = openLearn; $('joinBtn').before(b); }

renderList(); refreshUI();
