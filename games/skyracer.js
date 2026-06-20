// ✈️ Sky Racer — fly a jet through glowing rings with satisfying banking turns.
import * as THREE from 'three';
import { createEngine, addLights, makeHUD, makeBanner, damp } from '../engine.js';

const { scene, camera, input, setUpdate } = createEngine({
  background: 0x9fd4ff,
  fog: { color: 0x9fd4ff, near: 200, far: 2200 },
  fov: 70,
  far: 6000,
});
addLights(scene, { shadowSize: 240 });

// ---- World: terrain far below + a few clouds -----------------------------
// The jet cruises high up; the ground reads as "down there" so altitude is felt.
const GROUND_Y = -120;
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2f6b46, roughness: 1, flatShading: true });
const groundGeo = new THREE.PlaneGeometry(8000, 8000, 80, 80);
// Gently displace the plane into low-poly hills so the terrain isn't dead flat.
const gp = groundGeo.attributes.position;
for (let i = 0; i < gp.count; i++) {
  const x = gp.getX(i), y = gp.getY(i);
  gp.setZ(i, Math.sin(x * 0.004) * 18 + Math.cos(y * 0.003) * 22 + Math.sin((x + y) * 0.002) * 14);
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
ground.receiveShadow = true;
scene.add(ground);

// A handful of flattened, low-opacity spheres make soft cloud blobs.
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 1 });
for (let i = 0; i < 40; i++) {
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(14 + Math.random() * 26, 8, 6), cloudMat);
  cloud.position.set((Math.random() - 0.5) * 3000, 20 + Math.random() * 260, (Math.random() - 0.5) * 3000);
  cloud.scale.set(1, 0.35, 1);
  scene.add(cloud);
}

// ---- The jet (primitives only) -------------------------------------------
function buildJet() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, metalness: 0.6, roughness: 0.3 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, metalness: 0.4, roughness: 0.4 });
  // Fuselage: an elongated cylinder pointing down -Z (the nose / forward axis).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 8, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2; fuselage.castShadow = true;
  // Pointed nose cone out front.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.4, 12), bodyMat);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -5.2; nose.castShadow = true;
  // Swept wings: a wide thin box, sheared back along the trailing edge.
  const wingGeo = new THREE.BoxGeometry(11, 0.25, 3);
  const wp = wingGeo.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    // push wing tips backward to give a swept look
    wp.setZ(i, wp.getZ(i) + Math.abs(wp.getX(i)) * 0.35);
  }
  wingGeo.computeVertexNormals();
  const wings = new THREE.Mesh(wingGeo, accentMat);
  wings.position.set(0, 0, 0.4); wings.castShadow = true;
  // Vertical tail fin + small horizontal stabilizers at the rear.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 1.8), accentMat);
  fin.position.set(0, 1.1, 3.4); fin.castShadow = true;
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 1.2), accentMat);
  stab.position.set(0, 0, 3.6); stab.castShadow = true;
  // Glowing engine exhaust at the tail (emissive so it pops).
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x33aaff, emissiveIntensity: 2 });
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 0.6, 12), engineMat);
  engine.rotation.x = Math.PI / 2; engine.position.z = 4.2;
  g.add(fuselage, nose, wings, fin, stab, engine);
  return { group: g, engineMat };
}
const { group: jet, engineMat } = buildJet();
scene.add(jet);

// "rig" is an invisible Object3D we rotate on its local axes (pitch/roll/yaw)
// to avoid gimbal weirdness. The visible jet copies the rig's orientation, with
// a little extra cosmetic bank for drama. We read the rig's forward via
// getWorldDirection to advance position each frame.
const rig = new THREE.Object3D();
scene.add(rig);

// ---- Course: glowing torus rings along a flowing path --------------------
const RING_RADIUS = 9, RING_TUBE = 1.1;
const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 10, 32);
const rings = [];
// Hand-stepped waypoints: gentle turns + altitude changes across the sky.
const path = [
  [0, 60, -120], [40, 90, -300], [120, 70, -470], [120, 110, -650],
  [40, 130, -820], [-80, 100, -980], [-180, 80, -1160], [-160, 130, -1340],
  [-40, 150, -1500], [110, 120, -1660], [220, 90, -1840], [200, 140, -2040],
];
for (let i = 0; i < path.length; i++) {
  const [x, y, z] = path[i];
  const mat = new THREE.MeshStandardMaterial({ color: 0x16324f, emissive: 0x2266aa, emissiveIntensity: 1, roughness: 0.5 });
  const ring = new THREE.Mesh(ringGeo, mat);
  ring.position.set(x, y, z);
  // Orient each ring to roughly face the previous waypoint so you fly through it.
  const prev = i > 0 ? new THREE.Vector3(...path[i - 1]) : new THREE.Vector3(0, 60, 0);
  ring.lookAt(prev);
  scene.add(ring);
  rings.push({ mesh: ring, mat, center: new THREE.Vector3(x, y, z), pulse: 0 });
}

// ---- HUD / banner / help -------------------------------------------------
const hud = makeHUD();
const banner = makeBanner();
const help = document.createElement('div');
help.className = 'help';
help.innerHTML = '<kbd>W</kbd>/<kbd>S</kbd> throttle · <kbd>↑</kbd>/<kbd>↓</kbd> pitch · <kbd>A</kbd>/<kbd>D</kbd> roll/bank · <kbd>R</kbd> reset';
document.body.appendChild(help);

// ---- Flight state --------------------------------------------------------
const MIN_SPEED = 45, MAX_SPEED = 160, START_SPEED = 80;
const s = {
  speed: START_SPEED,
  roll: 0,         // bank angle (radians) — drives the carving turn
  next: 0,         // index of the ring we're currently chasing
  score: 0,
  time: 0,
  done: false,
};

function reset() {
  rig.position.set(0, 60, 0);
  rig.quaternion.identity();
  s.speed = START_SPEED; s.roll = 0; s.next = 0; s.score = 0; s.time = 0; s.done = false;
  rings.forEach((r) => { r.pulse = 0; r.mesh.scale.setScalar(1); });
  banner.hide(); bannerTimer = 0;
}

let bannerTimer = 0;
const fwd = new THREE.Vector3();
reset();

// ---- Update loop ---------------------------------------------------------
setUpdate((dt, elapsed) => {
  if (input.wasPressed('KeyR')) reset();

  if (!s.done) {
    s.time += dt;

    // Throttle: W/S nudge cruise speed, clamped so we never stall to zero.
    if (input.isDown('KeyW')) s.speed += 60 * dt;
    if (input.isDown('KeyS')) s.speed -= 60 * dt;
    s.speed = THREE.MathUtils.clamp(s.speed, MIN_SPEED, MAX_SPEED);

    // Roll (A/D): build a bank angle that auto-levels when released.
    const rollInput = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    if (rollInput !== 0) s.roll += rollInput * 2.4 * dt;
    else s.roll = damp(s.roll, 0, 3, dt); // gently level the wings
    s.roll = THREE.MathUtils.clamp(s.roll, -1.2, 1.2);

    // Pitch (↑/↓): rotate the rig about its local X axis (nose up / down).
    const pitchInput = (input.isDown('ArrowDown') ? 1 : 0) - (input.isDown('ArrowUp') ? 1 : 0);
    rig.rotateX(pitchInput * 1.4 * dt);

    // Banking turn: a rolled plane carves — yaw the heading proportional to the
    // bank angle (like gravity pulling the lift vector). Rotate about WORLD up so
    // the turn reads as a real heading change, not just spinning in place.
    rig.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -s.roll * 0.9 * dt);

    // Advance along the nose (rig's local -Z, read via getWorldDirection).
    rig.getWorldDirection(fwd); // points along local +Z; our nose is -Z, so negate
    fwd.negate();
    rig.position.addScaledVector(fwd, s.speed * dt);

    // Keep the jet above the terrain (soft floor so you can't fly underground).
    if (rig.position.y < GROUND_Y + 12) rig.position.y = GROUND_Y + 12;

    // ---- Ring detection: did we pass through the next ring? --------------
    if (s.next < rings.length) {
      const target = rings[s.next];
      const d = rig.position.distanceTo(target.center);
      if (d < RING_RADIUS) {
        s.score += 100 + Math.round(s.speed); // faster pass = more points
        target.pulse = 1;                      // kick off a scale-pulse
        s.next++;
        if (s.next >= rings.length) {
          s.done = true;
          banner.show(`COURSE COMPLETE<small>${s.time.toFixed(1)}s · ${s.score} pts</small>`);
        } else {
          banner.show(`RING ${s.next}/${rings.length}<small>+${100 + Math.round(s.speed)}</small>`);
          bannerTimer = 0.9;
        }
      }
    }
  }

  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0 && !s.done) banner.hide(); }

  // ---- Ring visuals: next ring pulses bright, passed rings dim ----------
  rings.forEach((r, i) => {
    if (r.pulse > 0) {
      r.pulse = Math.max(0, r.pulse - dt * 2.5);
      r.mesh.scale.setScalar(1 + r.pulse * 0.4); // quick scale-pulse on pass
    }
    if (i < s.next) {
      r.mat.emissive.setHex(0x224433); r.mat.emissiveIntensity = 0.4; // passed: dim
    } else if (i === s.next) {
      // active target: bright, pulsing glow so it's obvious where to head
      r.mat.emissive.setHex(0x44ddff);
      r.mat.emissiveIntensity = 1.6 + Math.sin(elapsed * 6) * 0.6;
    } else {
      r.mat.emissive.setHex(0x2266aa); r.mat.emissiveIntensity = 0.9; // upcoming
    }
  });
  engineMat.emissiveIntensity = 1.6 + Math.sin(elapsed * 20) * 0.4; // exhaust flicker

  // ---- Apply orientation to the visible jet ----------------------------
  // Copy the rig's pitch/yaw, then add a cosmetic bank (roll) for drama.
  jet.quaternion.copy(rig.quaternion);
  jet.rotateZ(-s.roll);
  jet.position.copy(rig.position);

  // ---- Chase camera: trails behind & above, looks ahead ----------------
  // Build the ideal cam point in the rig's frame, then damp the camera to it.
  const back = fwd.clone().multiplyScalar(-26);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.quaternion).multiplyScalar(8);
  const camTarget = rig.position.clone().add(back).add(up);
  camera.position.x = damp(camera.position.x, camTarget.x, 4, dt);
  camera.position.y = damp(camera.position.y, camTarget.y, 4, dt);
  camera.position.z = damp(camera.position.z, camTarget.z, 4, dt);
  // Look a little ahead of the nose so you can read the upcoming course.
  const lookAt = rig.position.clone().addScaledVector(fwd, 20);
  camera.up.set(0, 1, 0); // stable horizon; a touch of roll comes from the jet only
  camera.lookAt(lookAt);

  // ---- HUD: speed, rings, time, distance + arrow to next ring ----------
  let nextInfo = '';
  if (s.next < rings.length) {
    const dist = rig.position.distanceTo(rings[s.next].center);
    // small heading arrow: is the next ring left/right/above/below the nose?
    const toRing = rings[s.next].center.clone().sub(rig.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.quaternion);
    const upV = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.quaternion);
    const ax = toRing.dot(right), ay = toRing.dot(upV);
    const arrow = (Math.abs(ax) > Math.abs(ay))
      ? (ax > 0.12 ? '▶' : ax < -0.12 ? '◀' : '◆')
      : (ay > 0.12 ? '▲' : ay < -0.12 ? '▼' : '◆');
    nextInfo = `<div><span class="label">Next ring</span> <b>${Math.round(dist)}m</b> <span style="font-size:20px">${arrow}</span></div>`;
  }
  hud.innerHTML =
    `<div class="label">✈️ Sky Racer</div>` +
    `<div class="big">${Math.round(s.speed)} <span style="font-size:14px">kts</span></div>` +
    `<div><span class="label">Rings</span> <b>${Math.min(s.next, rings.length)}/${rings.length}</b></div>` +
    `<div><span class="label">Time</span> <b>${s.time.toFixed(1)}s</b></div>` +
    `<div><span class="label">Score</span> <b>${s.score}</b></div>` +
    nextInfo +
    (s.done ? `<div style="color:#7CFC9A">🏁 COURSE COMPLETE — press R</div>` : '');
});
