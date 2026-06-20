// 🌊 Jet-Ski Wave Rider — arcade jet-ski on a living ocean: ride swells, jump crests, slalom buoys.
import * as THREE from 'three';
import { createEngine, addLights, makeHUD, makeBanner, damp } from '../engine.js';

const { scene, camera, input, setUpdate } = createEngine({
  background: 0x6ec6ff,
  fog: { color: 0x9fdcff, near: 160, far: 700 },
  fov: 65,
});
addLights(scene, { sun: 0xfff6e0, sunIntensity: 2.6, shadowSize: 180 });

// ---- The wave field ----------------------------------------------------
// W(x,z,t) is the single source of truth for the ocean height. We deform the
// plane's vertices with it AND sample it under the ski each frame so the ride
// matches what you see. A small sum of travelling sines = rolling swell.
function W(x, z, t) {
  return (
    Math.sin(x * 0.018 + t * 0.9) * 2.2 +
    Math.cos(z * 0.022 - t * 0.7) * 1.9 +
    Math.sin((x + z) * 0.013 + t * 1.3) * 1.4 +
    Math.cos((x - z) * 0.03 - t * 1.6) * 0.7
  );
}

// ---- Ocean -------------------------------------------------------------
const OCEAN_SIZE = 800, OCEAN_SEG = 120;
const oceanGeo = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEG, OCEAN_SEG);
oceanGeo.rotateX(-Math.PI / 2); // lay it flat: now plane spans X/Z, Y is up
const oceanMat = new THREE.MeshStandardMaterial({
  color: 0x1f6fd0, metalness: 0.55, roughness: 0.25,
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.receiveShadow = true;
scene.add(ocean);
// Cache the flat (rest) X/Z of every vertex so we only rewrite Y each frame.
const oPos = oceanGeo.attributes.position;
const oBaseX = new Float32Array(oPos.count), oBaseZ = new Float32Array(oPos.count);
for (let i = 0; i < oPos.count; i++) { oBaseX[i] = oPos.getX(i); oBaseZ[i] = oPos.getZ(i); }

// ---- Jet-ski (built from primitives) -----------------------------------
function buildSki() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, metalness: 0.3, roughness: 0.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.3, roughness: 0.5 });
  // Tapered hull: a wide rear box + a narrower nose box pushed forward.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 5), hullMat);
  hull.position.y = 0.4; hull.castShadow = true;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 2.4), hullMat);
  nose.position.set(0, 0.6, 3); nose.castShadow = true;
  // Seat / rider deck.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.4), trimMat);
  deck.position.set(0, 1.1, -0.4); deck.castShadow = true;
  // Handlebar column + bars (thin cylinders).
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.3, 8), trimMat);
  column.position.set(0, 1.6, 1.4); column.rotation.x = -0.4; column.castShadow = true;
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x10243f }));
  bars.position.set(0, 2.1, 1.1); bars.rotation.z = Math.PI / 2; bars.castShadow = true;
  // Rider block.
  const rider = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 1),
    new THREE.MeshStandardMaterial({ color: 0x222a3a }));
  rider.position.set(0, 2, 0); rider.castShadow = true;
  g.add(hull, nose, deck, column, bars, rider);
  return g;
}
const ski = buildSki();
scene.add(ski);

// ---- Slalom gates (red/green buoy pairs) -------------------------------
const gates = [];
function makeBuoy(x, z, color) {
  const buoy = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 3, 12),
    new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 }));
  body.position.y = 1; body.castShadow = true;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
  ball.position.y = 2.6;
  buoy.add(body, ball);
  buoy.position.set(x, 0, z);
  scene.add(buoy);
  return buoy;
}
const GATE_COUNT = 8;
for (let i = 0; i < GATE_COUNT; i++) {
  // Snake the course forward (+Z) with a sideways wobble.
  const z = 60 + i * 70;
  const cx = Math.sin(i * 0.9) * 50;
  const half = 9; // half the gate width
  const left = makeBuoy(cx - half, z, 0xd62828);   // red = left/port
  const right = makeBuoy(cx + half, z, 0x2ecc71);  // green = right/starboard
  gates.push({ x: cx, z, half, left, right, passed: false });
}

// ---- Spray / wake particles --------------------------------------------
const SPRAY_MAX = 60;
const sprayGeo = new THREE.SphereGeometry(0.35, 6, 6);
const sprayMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
const spray = [];
for (let i = 0; i < SPRAY_MAX; i++) {
  const p = new THREE.Mesh(sprayGeo, sprayMat.clone());
  p.visible = false;
  scene.add(p);
  spray.push({ mesh: p, life: 0, vel: new THREE.Vector3() });
}
let sprayCursor = 0;
function emitSpray(x, y, z, back) {
  const s = spray[sprayCursor];
  sprayCursor = (sprayCursor + 1) % SPRAY_MAX;
  s.mesh.position.set(x + (Math.random() - 0.5) * 1.5, y + 0.3, z + (Math.random() - 0.5) * 1.5);
  s.vel.set(back.x * 4 + (Math.random() - 0.5) * 4, 3 + Math.random() * 3, back.z * 4 + (Math.random() - 0.5) * 4);
  s.life = 0.6;
  s.mesh.visible = true;
}

// ---- Ski state ---------------------------------------------------------
const s = {
  pos: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  speed: 0,    // forward speed (units/s)
  vy: 0,       // vertical velocity (air)
  airborne: false,
  pitch: 0,    // trick rotation while airborne
  bob: 0,      // phase for idle bobbing
};
const GRAVITY = 32;
let airtime = 0, score = 0, bestAir = 0, gatesPassed = 0, combo = 0;

function reset() {
  s.pos.set(0, 0, 0); s.yaw = 0; s.speed = 0; s.vy = 0;
  s.airborne = false; s.pitch = 0;
  airtime = 0; score = 0; bestAir = 0; gatesPassed = 0; combo = 0;
  for (const g of gates) g.passed = false;
}

// ---- HUD ---------------------------------------------------------------
const hud = makeHUD();
const banner = makeBanner();
const help = document.createElement('div');
help.className = 'help';
help.innerHTML = '<kbd>W</kbd>/<kbd>S</kbd> throttle · <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>↑</kbd>/<kbd>↓</kbd> flip in air · <kbd>R</kbd> reset';
document.body.appendChild(help);

// ---- Update loop -------------------------------------------------------
let bannerTimer = 0;
setUpdate((dt, elapsed) => {
  // -- Animate the ocean surface from W(x,z,t) ------------------------
  for (let i = 0; i < oPos.count; i++) {
    oPos.setY(i, W(oBaseX[i], oBaseZ[i], elapsed));
  }
  oPos.needsUpdate = true;
  oceanGeo.computeVertexNormals(); // recompute so the sun glints off swells
  // Drift the ocean with the camera so the world feels endless.
  ocean.position.x = camera.position.x;
  ocean.position.z = camera.position.z;

  // -- Throttle / brake / steer (arcade) ------------------------------
  const maxFwd = 70, accel = 42, turnRate = 1.6;
  if (input.isDown('KeyW')) s.speed += accel * dt;
  else if (input.isDown('KeyS')) s.speed -= accel * 1.1 * dt;
  else s.speed *= (1 - 0.5 * dt); // water drag
  s.speed = THREE.MathUtils.clamp(s.speed, -18, maxFwd);

  // Steering only bites on the water and scales with speed.
  if (!s.airborne) {
    const steer = (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0);
    s.yaw += steer * turnRate * dt * THREE.MathUtils.clamp(s.speed / 20, -1, 1);
  }

  // Move along heading (X/Z only; Y comes from the wave).
  const fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
  s.pos.addScaledVector(fwd, s.speed * dt);

  // -- Sample the wave under the ski + its local slope ----------------
  const wh = W(s.pos.x, s.pos.z, elapsed);
  const e = 2.2; // sample offset for finite-difference slope
  const dF = W(s.pos.x + fwd.x * e, s.pos.z + fwd.z * e, elapsed); // fore
  const dB = W(s.pos.x - fwd.x * e, s.pos.z - fwd.z * e, elapsed); // aft
  const rightV = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
  const dR = W(s.pos.x + rightV.x * e, s.pos.z + rightV.z * e, elapsed);
  const dL = W(s.pos.x - rightV.x * e, s.pos.z - rightV.z * e, elapsed);
  const slopeFore = (dF - dB) / (2 * e);   // + when nose points uphill
  const slopeSide = (dR - dL) / (2 * e);

  // -- Launch off a crest: riding fast UP a steep wave throws us airborne.
  if (!s.airborne && s.speed > 30 && slopeFore > 0.18) {
    s.airborne = true;
    s.vy = slopeFore * s.speed * 0.9 + 4; // steeper + faster = bigger air
    airtime = 0;
    s.pos.y = wh;
  }

  // -- Vertical: air physics, or ride the wave with a gentle bob ------
  if (s.airborne) {
    s.vy -= GRAVITY * dt;
    s.pos.y += s.vy * dt;
    airtime += dt;
    const flip = (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    s.pitch += flip * 3.5 * dt;
    if (s.pos.y <= wh) {
      // Splashdown — score the air.
      s.pos.y = wh;
      const flips = Math.floor(Math.abs(s.pitch) / (Math.PI * 2));
      const gained = Math.round(airtime * 60 + flips * 300);
      score += gained;
      bestAir = Math.max(bestAir, airtime);
      if (airtime > 0.5) {
        banner.show(`+${gained}<small>${flips ? flips + 'x FLIP! ' : ''}${airtime.toFixed(1)}s big air</small>`);
        bannerTimer = 1.2;
      }
      // Splash spray on landing.
      for (let k = 0; k < 6; k++) emitSpray(s.pos.x, s.pos.y, s.pos.z, fwd.clone().negate());
      s.airborne = false; s.vy = 0; s.pitch = 0;
    }
  } else {
    s.bob += dt * (2 + Math.abs(s.speed) * 0.05);
    s.pos.y = wh + Math.sin(s.bob) * 0.15;
  }

  // -- Slalom gate detection (pass between a red/green pair) ----------
  for (const g of gates) {
    if (g.passed) continue;
    // Close to the gate's Z line and between the two buoys in X.
    if (Math.abs(s.pos.z - g.z) < 4 && Math.abs(s.pos.x - g.x) < g.half) {
      g.passed = true; gatesPassed++; combo++;
      score += 100 * combo;
      banner.show(`GATE ${gatesPassed}/${GATE_COUNT}<small>combo x${combo} · +${100 * combo}</small>`);
      bannerTimer = 1.0;
    } else if (s.pos.z - g.z > 6 && combo > 0) {
      // Sailed past a gate's line without scoring it → combo broken.
      combo = 0;
    }
  }

  // -- Spray behind the ski while moving ------------------------------
  if (!s.airborne && Math.abs(s.speed) > 12 && Math.random() < 0.8) {
    emitSpray(s.pos.x - fwd.x * 3, s.pos.y, s.pos.z - fwd.z * 3, fwd.clone().negate());
  }
  for (const p of spray) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vel.y -= GRAVITY * 0.6 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.material.opacity = Math.max(0, p.life / 0.6) * 0.9;
    if (p.life <= 0) p.mesh.visible = false;
  }

  // -- Resets / banner timeout ---------------------------------------
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) banner.hide(); }
  if (input.wasPressed('KeyR')) reset();

  // -- Pose the ski: tip with wave slope (or trick pitch in air) -----
  ski.position.copy(s.pos);
  const ridePitch = s.airborne ? s.pitch : -Math.atan(slopeFore) * 1.2;
  const rideRoll = s.airborne ? 0 : Math.atan(slopeSide) * 1.2;
  ski.rotation.set(ridePitch, s.yaw, rideRoll, 'YXZ');

  // -- Chase camera (trails behind/above, stays above the swell) -----
  const camTarget = new THREE.Vector3(
    s.pos.x - Math.sin(s.yaw) * 18,
    s.pos.y + 9,
    s.pos.z - Math.cos(s.yaw) * 18
  );
  // Never let the camera dip under the wave at its own position.
  const camFloor = W(camTarget.x, camTarget.z, elapsed) + 3;
  camTarget.y = Math.max(camTarget.y, camFloor);
  camera.position.x = damp(camera.position.x, camTarget.x, 5, dt);
  camera.position.y = damp(camera.position.y, camTarget.y, 5, dt);
  camera.position.z = damp(camera.position.z, camTarget.z, 5, dt);
  camera.lookAt(s.pos.x + fwd.x * 6, s.pos.y + 2, s.pos.z + fwd.z * 6);

  // -- HUD ------------------------------------------------------------
  const kmh = Math.abs(Math.round(s.speed * 3.6));
  hud.innerHTML =
    `<div class="label">🌊 Jet-Ski Wave Rider</div>` +
    `<div class="big">${kmh} <span style="font-size:14px">km/h</span></div>` +
    `<div><span class="label">Gates</span> <b>${gatesPassed}/${GATE_COUNT}</b>${combo > 1 ? ` <span style="color:#ffd36e">x${combo}</span>` : ''}</div>` +
    `<div><span class="label">Score</span> <b>${score}</b></div>` +
    `<div><span class="label">Best air</span> <b>${bestAir.toFixed(1)}s</b></div>` +
    (s.airborne ? `<div style="color:#ffd36e">✈ AIRBORNE ${airtime.toFixed(1)}s</div>` : '');
});
