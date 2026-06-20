// 🔫 Arcade FPS Shooter — pointer-lock mouselook, raycast targets, combo & timer.
import * as THREE from 'three';
import { createEngine, addLights, makeHUD, makeBanner, damp } from '../engine.js';

const { renderer, scene, camera, input, setUpdate } = createEngine({
  background: 0x05060f,
  fog: { color: 0x05060f, near: 40, far: 220 },
  fov: 75,
});
addLights(scene, { sun: 0x9fd0ff, sunIntensity: 0.6, shadowSize: 120 });

// A little extra fill so the neon arena reads without a strong sun.
scene.add(new THREE.AmbientLight(0x2a3360, 1.4));

const ARENA = 100; // half-extent of the playable square (so ~200x200)

// ---- Ground + neon grid ------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
  new THREE.MeshStandardMaterial({ color: 0x0a0e1f, roughness: 0.9, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(ARENA * 2, 50, 0x1de9ff, 0x14315c);
grid.position.y = 0.02;
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

// Glowing perimeter walls so the bounds read clearly.
const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c1330, emissive: 0x1b6bff, emissiveIntensity: 0.6 });
for (const s of [-1, 1]) {
  const a = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, 6, 1), wallMat);
  a.position.set(0, 3, s * ARENA); a.receiveShadow = true; scene.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 6, ARENA * 2), wallMat);
  b.position.set(s * ARENA, 3, 0); b.receiveShadow = true; scene.add(b);
}

// ---- Scatter emissive cover boxes --------------------------------------
const coverColors = [0xff2d75, 0x1de9ff, 0xa855f7, 0x39ff14, 0xffb800];
function scatterCover() {
  for (let i = 0; i < 14; i++) {
    const r = 18 + Math.random() * (ARENA - 28);
    const ang = Math.random() * Math.PI * 2;
    const w = 3 + Math.random() * 6, h = 4 + Math.random() * 10, d = 3 + Math.random() * 6;
    const col = coverColors[(Math.random() * coverColors.length) | 0];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x10162e, emissive: col, emissiveIntensity: 0.35, roughness: 0.6 })
    );
    m.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
}
scatterCover();

// ---- Player rig (yaw on the rig, pitch on the camera) ------------------
// We parent the camera to a "rig" group: yaw rotates the rig, pitch rotates
// the camera. This keeps WASD movement aligned to where you're facing.
const EYE = 3;
const rig = new THREE.Group();
rig.position.set(0, EYE, ARENA * 0.6);
rig.add(camera);
camera.position.set(0, 0, 0);
scene.add(rig);
let yaw = Math.PI;   // face toward the arena center at start
let pitch = 0;
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);

// ---- Gun viewmodel (parented to the camera, sits bottom-right) ---------
const gun = new THREE.Group();
const gunMat = new THREE.MeshStandardMaterial({ color: 0x161b2e, emissive: 0x1de9ff, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.6 });
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.7), gunMat);
gunBody.position.set(0, 0, -0.25);
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), gunMat);
gunBarrel.rotation.x = Math.PI / 2;
gunBarrel.position.set(0, 0.02, -0.7);
gun.add(gunBody, gunBarrel);
gun.position.set(0.32, -0.28, -0.6); // bottom-right of view
camera.add(gun);

// Muzzle flash sprite-ish glow at the barrel tip.
const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 })
);
muzzle.position.set(0, 0.02, -0.95);
gun.add(muzzle);

// ---- Targets (bots) ----------------------------------------------------
// Each bot: a box body + an emissive core sphere, bobbing & drifting.
const targets = [];
const TARGET_COUNT = 7;
const NEON = [0xff2d75, 0x1de9ff, 0x39ff14, 0xa855f7, 0xff7a00];

function randSpot() {
  return new THREE.Vector3(
    (Math.random() * 2 - 1) * (ARENA - 14),
    2.4 + Math.random() * 4,
    (Math.random() * 2 - 1) * (ARENA - 14)
  );
}

function makeTarget() {
  const col = NEON[(Math.random() * NEON.length) | 0];
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.8, 1.4, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x0c1124, emissive: col, emissiveIntensity: 0.5, roughness: 0.5 })
  );
  body.castShadow = true;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: col })
  );
  core.position.y = 0.4;
  g.add(body, core);
  const p = randSpot();
  g.position.copy(p);
  g.userData = {
    base: p.clone(),
    phase: Math.random() * Math.PI * 2,
    driftDir: Math.random() * Math.PI * 2,
    pop: 0,            // >0 while playing the hit "pop" flash
  };
  scene.add(g);
  targets.push(g);
  return g;
}
for (let i = 0; i < TARGET_COUNT; i++) makeTarget();

// Reposition an existing bot (cheaper than re-creating geometry).
function respawn(t) {
  const p = randSpot();
  t.userData.base.copy(p);
  t.userData.phase = Math.random() * Math.PI * 2;
  t.userData.driftDir = Math.random() * Math.PI * 2;
  t.position.copy(p);
  t.scale.setScalar(1);
  t.visible = true;
}

// ---- Tracer line (reused) ----------------------------------------------
const tracerMat = new THREE.LineBasicMaterial({ color: 0x9fffff, transparent: true, opacity: 0 });
const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const tracer = new THREE.Line(tracerGeo, tracerMat);
tracer.frustumCulled = false;
scene.add(tracer);
let tracerLife = 0, muzzleLife = 0;

// ---- Crosshair (DOM) ---------------------------------------------------
const cross = document.createElement('div');
cross.style.cssText =
  'position:fixed;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;z-index:15;pointer-events:none;' +
  'background:radial-gradient(circle,#fff 0 1.5px,transparent 2px);' +
  'border:0;';
cross.innerHTML =
  '<div style="position:absolute;left:8px;top:0;width:2px;height:18px;background:rgba(255,255,255,.85)"></div>' +
  '<div style="position:absolute;top:8px;left:0;height:2px;width:18px;background:rgba(255,255,255,.85)"></div>';
document.body.appendChild(cross);

// ---- HUD + banner + help ----------------------------------------------
const hud = makeHUD();
const banner = makeBanner();
const help = document.createElement('div');
help.className = 'help';
help.innerHTML = '<kbd>Click</kbd> lock mouse · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Mouse</kbd> look · <kbd>Shift</kbd> sprint · <kbd>Click</kbd> shoot · <kbd>Esc</kbd> release';
document.body.appendChild(help);

// ---- Pointer lock + mouselook (the engine does NOT give us dx/dy) ------
const canvas = renderer.domElement;
let locked = false;
canvas.addEventListener('click', () => { if (!over) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
document.addEventListener('mousemove', (e) => {
  if (!locked || over) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
});

// ---- Shooting ----------------------------------------------------------
const ray = new THREE.Raycaster();
let score = 0, hits = 0, combo = 1, comboTimer = 0;

function shoot() {
  // Fire from the camera center, straight forward.
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);

  // Muzzle flash always plays on fire.
  muzzleLife = 0.06;

  const intersects = ray.intersectObjects(targets, true);
  // ignore bots already mid-pop so a fast double-click can't double-score
  const hitObj = intersects.find((h) =>
    h.object.parent && targets.includes(h.object.parent) && h.object.parent.userData.pop <= 0);
  const endPoint = origin.clone().addScaledVector(ray.ray.direction, 200);

  if (hitObj) {
    const t = hitObj.object.parent;
    endPoint.copy(hitObj.point);
    // pop + score
    comboTimer = 2.0;
    combo = Math.min(combo + 1, 9);
    const gained = 100 * combo;
    score += gained;
    hits++;
    t.userData.pop = 0.18; // brief scale flash before respawn
    banner.show(`+${gained}<small>${combo > 1 ? combo + 'x COMBO!' : 'HIT'}</small>`);
    bannerTimer = 0.5;
  } else {
    // miss → combo resets
    combo = 1; comboTimer = 0;
  }

  // tracer from gun barrel to impact/end
  const muzzleWorld = new THREE.Vector3();
  muzzle.getWorldPosition(muzzleWorld);
  const pts = tracer.geometry.attributes.position;
  pts.setXYZ(0, muzzleWorld.x, muzzleWorld.y, muzzleWorld.z);
  pts.setXYZ(1, endPoint.x, endPoint.y, endPoint.z);
  pts.needsUpdate = true;
  tracerLife = 0.07;
}

// ---- Game state --------------------------------------------------------
let timeLeft = 60, over = false, bannerTimer = 0;
let firing = false; // edge-detect: was the left button already held last frame?

// ---- Update loop -------------------------------------------------------
setUpdate((dt, elapsed) => {
  if (!over) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0; over = true;
      document.exitPointerLock();
      banner.show(`TIME!<small>Score ${score} · ${hits} hits · click <b>← Hub</b> to retry</small>`);
    }
  }

  // --- look & movement (only while locked and playing) ---
  if (locked && !over) {
    // yaw on the rig, pitch on the camera
    rig.rotation.y = yaw;
    camera.rotation.x = pitch;

    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 1.8 : 1;
    const speed = 22 * sprint;
    let mx = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    let mz = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      // move relative to look-yaw on the flat plane
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const dx = mx * cos - mz * sin;
      const dz = mx * sin + mz * cos;
      rig.position.x = THREE.MathUtils.clamp(rig.position.x + dx * speed * dt, -ARENA + 3, ARENA - 3);
      rig.position.z = THREE.MathUtils.clamp(rig.position.z + dz * speed * dt, -ARENA + 3, ARENA - 3);
    }
    rig.position.y = EYE;

    // fire on left click (engine sets input.mouse.left; pressed-once via wasPressed isn't for mouse)
    if (input.mouse.left && !firing) shoot();
    firing = input.mouse.left;
  } else {
    firing = false;
  }

  // --- combo decay (resets after ~2s idle) ---
  if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 1; }

  // --- animate targets: bob + slow drift, kept in bounds ---
  for (const t of targets) {
    const u = t.userData;
    if (u.pop > 0) {
      // hit pop: scale up then vanish & respawn
      u.pop -= dt;
      const k = u.pop / 0.18;
      t.scale.setScalar(1 + (1 - k) * 1.6);
      t.children[0].material.emissiveIntensity = 0.5 + (1 - k) * 2;
      if (u.pop <= 0) {
        t.children[0].material.emissiveIntensity = 0.5;
        respawn(t);
      }
      continue;
    }
    if (over) continue;
    // drift the base point and reflect off bounds
    u.base.x += Math.cos(u.driftDir) * 6 * dt;
    u.base.z += Math.sin(u.driftDir) * 6 * dt;
    if (Math.abs(u.base.x) > ARENA - 14 || Math.abs(u.base.z) > ARENA - 14) u.driftDir += Math.PI * 0.6;
    u.base.x = THREE.MathUtils.clamp(u.base.x, -(ARENA - 14), ARENA - 14);
    u.base.z = THREE.MathUtils.clamp(u.base.z, -(ARENA - 14), ARENA - 14);
    t.position.x = u.base.x;
    t.position.z = u.base.z;
    t.position.y = u.base.y + Math.sin(elapsed * 1.6 + u.phase) * 0.9;
    t.rotation.y += dt * 0.8;
  }

  // --- feedback fades ---
  if (tracerLife > 0) { tracerLife -= dt; tracerMat.opacity = Math.max(0, tracerLife / 0.07); }
  if (muzzleLife > 0) { muzzleLife -= dt; muzzle.material.opacity = Math.max(0, muzzleLife / 0.06); }
  // gentle gun bob / sway toward rest
  gun.position.x = damp(gun.position.x, 0.32, 10, dt);
  gun.position.y = damp(gun.position.y, -0.28 + Math.sin(elapsed * 3) * 0.004, 10, dt);

  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0 && !over) banner.hide(); }

  // --- HUD ---
  hud.innerHTML =
    `<div class="label">Arcade FPS</div>` +
    `<div class="big">${score}</div>` +
    `<div><span class="label">Combo</span> <b>x${combo}</b></div>` +
    `<div><span class="label">Targets hit</span> <b>${hits}</b></div>` +
    `<div><span class="label">Time</span> <b>${Math.ceil(timeLeft)}s</b></div>` +
    (locked || over ? '' : `<div style="color:#ffd36e">click to lock mouse</div>`);
});
