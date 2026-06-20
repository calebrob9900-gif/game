// 🏍️ Motocross / Dirt Bike — heightfield terrain, slope-following physics, jumps & flips.
import * as THREE from 'three';
import { createEngine, addLights, makeHUD, makeBanner, damp } from '../engine.js';

const { scene, camera, input, setUpdate } = createEngine({
  background: 0x9ad0ff,
  fog: { color: 0xcfe3f2, near: 120, far: 720 },
  fov: 68,
});
addLights(scene, { sun: 0xfff0d0, sunIntensity: 2.6, shadowSize: 180 });

// ---- Terrain heightfield -----------------------------------------------
// CRITICAL: H(x,z) is the single source of truth for the ground surface.
// The mesh is displaced with it once, AND we sample it analytically every
// frame to plant/orient the bike. Keep these in lockstep.
const SIZE = 600, SEG = 120;
// A few "tabletop" jump bumps scattered around the course (gaussian humps).
const BUMPS = [
  { x: 0, z: -70, h: 11, r: 26 },
  { x: 80, z: 40, h: 9, r: 22 },
  { x: -90, z: 90, h: 13, r: 30 },
  { x: 140, z: -130, h: 10, r: 24 },
  { x: -150, z: -40, h: 12, r: 28 },
  { x: 40, z: 180, h: 14, r: 32 },
];
function H(x, z) {
  // Rolling hills: summed sines at a few frequencies.
  let h = Math.sin(x * 0.018) * 6 + Math.cos(z * 0.021) * 5.5;
  h += Math.sin((x + z) * 0.012) * 4 + Math.cos((x - z) * 0.03) * 2.5;
  h += Math.sin(x * 0.06 + z * 0.05) * 1.4;
  // Tabletop jump bumps (smooth gaussians).
  for (const b of BUMPS) {
    const dx = x - b.x, dz = z - b.z;
    h += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r));
  }
  return h;
}

const groundMat = new THREE.MeshStandardMaterial({ color: 0xc2914f, roughness: 1, flatShading: true });
const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
groundGeo.rotateX(-Math.PI / 2); // lay flat so geometry x/z map to world x/z
const gpos = groundGeo.attributes.position;
for (let i = 0; i < gpos.count; i++) {
  gpos.setY(i, H(gpos.getX(i), gpos.getZ(i)));
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// Scatter cacti & rocks for a desert feel and a sense of speed.
function scatterDecor() {
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8c74, roughness: 1, flatShading: true });
  for (let i = 0; i < 160; i++) {
    const x = (Math.random() - 0.5) * SIZE * 0.9;
    const z = (Math.random() - 0.5) * SIZE * 0.9;
    const y = H(x, z);
    if (Math.random() < 0.45) {
      const cactus = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 6), cactusMat);
      body.position.y = 2.5; body.castShadow = true;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 5), cactusMat);
      arm.position.set(0.9, 3, 0); arm.rotation.z = -0.6; arm.castShadow = true;
      cactus.add(body, arm);
      cactus.position.set(x, y, z);
      cactus.scale.setScalar(0.7 + Math.random() * 0.8);
      scene.add(cactus);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random() * 2.2), rockMat);
      rock.position.set(x, y + 0.4, z); rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
    }
  }
}
scatterDecor();

// ---- Dirt bike (low-poly primitives) -----------------------------------
function buildBike() {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, metalness: 0.3, roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.95 });

  // Frame + tank slung along +Z (forward).
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 3.2), frameMat);
  frame.position.y = 1.4; frame.castShadow = true;
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 1.4), frameMat);
  tank.position.set(0, 1.9, 0.4); tank.castShadow = true;
  // Seat.
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.6), darkMat);
  seat.position.set(0, 1.95, -0.9); seat.castShadow = true;
  // Handlebars.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), darkMat);
  post.position.set(0, 2.1, 1.5); post.rotation.x = 0.35;
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), darkMat);
  bars.position.set(0, 2.5, 1.7); bars.rotation.z = Math.PI / 2;
  // Wheels (cylinders, rolled to face X so they spin around X).
  const wheelGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.4, 18);
  const front = new THREE.Mesh(wheelGeo, wheelMat);
  front.rotation.z = Math.PI / 2; front.position.set(0, 1.1, 1.9); front.castShadow = true;
  const rear = new THREE.Mesh(wheelGeo, wheelMat);
  rear.rotation.z = Math.PI / 2; rear.position.set(0, 1.1, -1.9); rear.castShadow = true;

  g.add(frame, tank, seat, post, bars, front, rear);
  return { group: g, wheels: [front, rear] };
}

const START = new THREE.Vector3(0, 0, 0);
const bike = new THREE.Group();
const { group: bikeMesh, wheels } = buildBike();
bike.add(bikeMesh);
scene.add(bike);

// ---- Bike state --------------------------------------------------------
const v = {
  pos: new THREE.Vector3(START.x, H(START.x, START.z), START.z),
  yaw: 0,
  speed: 0,        // forward speed (units/s)
  vy: 0,           // vertical velocity (air)
  airborne: false,
  pitch: 0,        // local pitch (slope on ground, flip in air)
  roll: 0,         // whip roll for style
};
const GRAVITY = 60;
const MAX_FWD = 100, ACCEL = 60, TURN = 2.0;
let airtime = 0, flips = 0, score = 0, bestAir = 0, launchYaw = 0;

// ---- HUD ---------------------------------------------------------------
const hud = makeHUD();
const banner = makeBanner();
const help = document.createElement('div');
help.className = 'help';
help.innerHTML = '<kbd>W</kbd>/<kbd>S</kbd> throttle · <kbd>A</kbd>/<kbd>D</kbd> steer/whip · <kbd>↑</kbd>/<kbd>↓</kbd> flip in air · <kbd>R</kbd> reset';
document.body.appendChild(help);

function reset() {
  v.pos.set(START.x, H(START.x, START.z), START.z);
  v.yaw = 0; v.speed = 0; v.vy = 0; v.pitch = 0; v.roll = 0; v.airborne = false;
  airtime = 0; flips = 0;
}

// ---- Update loop -------------------------------------------------------
let bannerTimer = 0;
setUpdate((dt) => {
  // throttle / brake
  if (input.isDown('KeyW')) v.speed += ACCEL * dt;
  else if (input.isDown('KeyS')) v.speed -= ACCEL * 1.1 * dt;
  else v.speed *= (1 - 0.7 * dt); // engine/rolling drag
  v.speed = THREE.MathUtils.clamp(v.speed, -24, MAX_FWD);

  // steering — only meaningful on the ground, scales with speed
  const steer = (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0);
  if (!v.airborne) {
    v.yaw += steer * TURN * dt * THREE.MathUtils.clamp(v.speed / 22, -1, 1);
  }

  // move along heading
  const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  v.pos.x += fwd.x * v.speed * dt;
  v.pos.z += fwd.z * v.speed * dt;

  // sample terrain under the bike + slope along the heading (ahead/behind)
  const groundY = H(v.pos.x, v.pos.z);
  const ahead = H(v.pos.x + fwd.x * 3, v.pos.z + fwd.z * 3);
  const behind = H(v.pos.x - fwd.x * 3, v.pos.z - fwd.z * 3);
  const slopePitch = Math.atan2(ahead - behind, 6); // +ve going uphill

  if (!v.airborne) {
    // Stick to the surface and lean with the slope.
    v.pos.y = groundY;
    v.pitch = damp(v.pitch, -slopePitch, 8, dt);
    v.roll = damp(v.roll, steer * 0.25 * THREE.MathUtils.clamp(v.speed / 40, 0, 1), 6, dt);

    // Launch when cresting a rise at speed: the ground ahead drops away.
    const drop = ahead - groundY; // negative = downhill ahead
    if (v.speed > 26 && slopePitch > 0.18 && drop < -0.4) {
      v.airborne = true;
      v.vy = v.speed * 0.5 * Math.sin(slopePitch) + slopePitch * 22 + 6;
      airtime = 0; flips = 0; launchYaw = v.yaw;
    }
  } else {
    // Air physics + trick input.
    v.vy -= GRAVITY * dt;
    v.pos.y += v.vy * dt;
    airtime += dt;
    const flipInput = (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    v.pitch += flipInput * 4.2 * dt;
    v.roll += steer * 3.0 * dt; // A/D adds a whip roll for style

    // Land when we sink back to the terrain surface.
    const land = H(v.pos.x, v.pos.z);
    if (v.pos.y <= land) {
      v.pos.y = land;
      const flipsDone = Math.floor(Math.abs(v.pitch) / (Math.PI * 2));
      const pitchMod = ((v.pitch % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const rollMod = ((v.roll % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const upright = (pitchMod < 0.9 || pitchMod > Math.PI * 2 - 0.9) &&
                      (rollMod < 1.1 || rollMod > Math.PI * 2 - 1.1);
      bestAir = Math.max(bestAir, airtime);
      if (!upright && airtime > 0.5) {
        // Crash the landing: scrub most of the speed, no points.
        v.speed *= 0.25;
        banner.show(`WIPEOUT!<small>keep it upright next time</small>`);
        bannerTimer = 1.2;
      } else {
        const gained = Math.round(airtime * 50 + flipsDone * 250 + (upright ? 100 : 0));
        score += gained;
        if (airtime > 0.45) {
          banner.show(`+${gained}<small>${flipsDone ? flipsDone + 'x FLIP! ' : ''}${airtime.toFixed(1)}s air${upright ? ' · clean!' : ''}</small>`);
          bannerTimer = 1.2;
        }
      }
      v.airborne = false; v.vy = 0; v.pitch = 0; v.roll = 0;
    }
  }

  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) banner.hide(); }
  if (input.wasPressed('KeyR')) reset();

  // apply to mesh
  bike.position.copy(v.pos);
  bike.rotation.set(v.pitch, v.yaw, v.roll);
  // spin wheels with speed
  for (const w of wheels) w.rotation.x += v.speed * dt * 0.9;

  // chase camera — behind & above, raised over local terrain so it never clips
  const camDist = 18, camHeight = 9;
  const camX = v.pos.x - Math.sin(v.yaw) * camDist;
  const camZ = v.pos.z - Math.cos(v.yaw) * camDist;
  const camY = Math.max(v.pos.y, H(camX, camZ)) + camHeight;
  camera.position.x = damp(camera.position.x, camX, 6, dt);
  camera.position.y = damp(camera.position.y, camY, 5, dt);
  camera.position.z = damp(camera.position.z, camZ, 6, dt);
  camera.lookAt(v.pos.x, v.pos.y + 2.5, v.pos.z);

  // HUD
  const kmh = Math.abs(Math.round(v.speed * 3.6));
  hud.innerHTML =
    `<div class="label">🏍️ Motocross</div>` +
    `<div class="big">${kmh} <span style="font-size:14px">km/h</span></div>` +
    `<div><span class="label">Score</span> <b>${score}</b></div>` +
    `<div><span class="label">Best air</span> <b>${bestAir.toFixed(1)}s</b></div>` +
    (v.airborne ? `<div style="color:#ffd36e">✈ AIRBORNE ${airtime.toFixed(1)}s</div>` : '');
});
