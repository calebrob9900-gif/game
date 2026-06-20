// 🏎️ Driving + Stunt — arcade car physics, drift, jump ramps, flips & airtime.
import * as THREE from 'three';
import { createEngine, addLights, makeHUD, makeBanner, damp } from '../engine.js';

const { scene, camera, input, setUpdate } = createEngine({
  background: 0x8fc4ff,
  fog: { color: 0x8fc4ff, near: 120, far: 900 },
  fov: 65,
});
addLights(scene, { shadowSize: 160 });

// ---- Ground ------------------------------------------------------------
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3c6b3a, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A subtle grid so you can read speed.
const grid = new THREE.GridHelper(4000, 200, 0x2c4f2b, 0x2c4f2b);
grid.position.y = 0.02;
scene.add(grid);

// Scatter some trees & rocks for a sense of speed.
function scatterDecor() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x808890, roughness: 1 });
  for (let i = 0; i < 220; i++) {
    const r = 120 + Math.random() * 1400;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.random() < 0.7) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 5, 6), trunkMat);
      trunk.position.y = 2.5; trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 7), leafMat);
      leaves.position.y = 9; leaves.castShadow = true;
      tree.add(trunk, leaves);
      tree.position.set(x, 0, z);
      tree.scale.setScalar(0.6 + Math.random());
      scene.add(tree);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 2), rockMat);
      rock.position.set(x, 0.6, z); rock.castShadow = true;
      scene.add(rock);
    }
  }
}
scatterDecor();

// ---- Jump ramps --------------------------------------------------------
// Each ramp is a wedge; we also store a launch trigger zone in front of it.
const ramps = [];
function makeRamp(x, z, yaw, scale = 1) {
  const w = 14 * scale, h = 6 * scale, len = 22 * scale;
  const geo = new THREE.BoxGeometry(w, h, len);
  // shear the top to make a wedge (raise the front edge vertices)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const zz = pos.getZ(i), yy = pos.getY(i);
    if (zz > 0) pos.setY(i, yy + h / 2);        // front gets tall
    else pos.setY(i, yy - h / 2);               // back stays low
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd64545, roughness: 0.8 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.rotation.y = yaw;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  ramps.push({ x, z, yaw, scale });
}
makeRamp(0, 90, 0, 1.4);
makeRamp(120, -60, Math.PI / 2, 1);
makeRamp(-150, 40, -Math.PI / 4, 1.2);
makeRamp(60, 240, Math.PI, 1.6);
makeRamp(-90, -200, Math.PI / 6, 1);

// ---- Vehicle (car + bike skins) ---------------------------------------
function buildCar() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a7fff, metalness: 0.4, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 8), bodyMat);
  body.position.y = 1.1; body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x10243f }));
  cabin.position.set(0, 2.1, -0.3); cabin.castShadow = true;
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 1), bodyMat);
  spoiler.position.set(0, 2.0, -3.6);
  g.add(body, cabin, spoiler);
  return g;
}
function buildBike() {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, metalness: 0.3, roughness: 0.4 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 5), frameMat);
  frame.position.y = 1.6; frame.castShadow = true;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.4), new THREE.MeshStandardMaterial({ color: 0x111 }));
  seat.position.set(0, 2.4, -0.5);
  g.add(frame, seat);
  return g;
}
const wheelGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.7, 16);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.9 });
function addWheels(group) {
  const wheels = [];
  const offs = [[-1.9, 3.0], [1.9, 3.0], [-1.9, -3.0], [1.9, -3.0]];
  for (const [x, z] of offs) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 1.1, z); w.castShadow = true;
    group.add(w); wheels.push(w);
  }
  return wheels;
}

const car = new THREE.Group();
let skin = buildCar();
car.add(skin);
let wheels = addWheels(car);
scene.add(car);

// ---- Vehicle state -----------------------------------------------------
const v = {
  pos: new THREE.Vector3(0, 0, -20),
  yaw: 0,
  speed: 0,        // forward speed (units/s)
  vy: 0,           // vertical velocity
  airborne: false,
  pitch: 0,        // flip rotation while airborne
  roll: 0,
  isBike: false,
};
const GRAVITY = 55;
let airtime = 0, flips = 0, score = 0, bestAir = 0;

function swapVehicle() {
  car.remove(skin);
  v.isBike = !v.isBike;
  skin = v.isBike ? buildBike() : buildCar();
  car.add(skin);
}

// ---- HUD ---------------------------------------------------------------
const hud = makeHUD();
const banner = makeBanner();
const help = document.createElement('div');
help.className = 'help';
help.innerHTML = '<kbd>W</kbd>/<kbd>S</kbd> drive · <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>Space</kbd> handbrake · <kbd>↑</kbd>/<kbd>↓</kbd> flip in air · <kbd>V</kbd> car/bike · <kbd>R</kbd> reset';
document.body.appendChild(help);

// ---- Update loop -------------------------------------------------------
let bannerTimer = 0;
setUpdate((dt) => {
  const maxFwd = v.isBike ? 95 : 80;
  const accel = v.isBike ? 55 : 45;
  const turnRate = v.isBike ? 1.8 : 1.5;

  // throttle / brake
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) v.speed += accel * dt;
  else if (input.isDown('KeyS') || input.isDown('ArrowDown')) v.speed -= accel * 1.1 * dt;
  else v.speed *= (1 - 0.6 * dt); // rolling drag
  v.speed = THREE.MathUtils.clamp(v.speed, -28, maxFwd);

  // steering (only meaningful on the ground, scales with speed)
  const handbrake = input.isDown('Space');
  if (!v.airborne) {
    const steer = (input.isDown('KeyA') ? 1 : 0) - (input.isDown('KeyD') ? 1 : 0);
    const grip = handbrake ? 1.9 : 1.0;
    v.yaw += steer * turnRate * grip * dt * THREE.MathUtils.clamp(v.speed / 25, -1, 1);
    if (handbrake) v.speed *= (1 - 1.2 * dt); // scrub speed in a drift
  }

  // move along heading
  const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  v.pos.addScaledVector(fwd, v.speed * dt);

  // ramp launch detection
  if (!v.airborne && v.speed > 28) {
    for (const r of ramps) {
      const dx = v.pos.x - r.x, dz = v.pos.z - r.z;
      if (dx * dx + dz * dz < (16 * r.scale) ** 2) {
        v.airborne = true;
        v.vy = v.speed * 0.55 + 12 * r.scale;
        airtime = 0; flips = 0;
        break;
      }
    }
  }

  // air physics + flips
  if (v.airborne) {
    v.vy -= GRAVITY * dt;
    v.pos.y += v.vy * dt;
    airtime += dt;
    const flipInput = (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    v.pitch += flipInput * 4 * dt;
    if (v.pos.y <= 0) {
      v.pos.y = 0;
      // landed — score it
      const newFlips = Math.floor(Math.abs(v.pitch) / (Math.PI * 2));
      const clean = Math.abs(((v.pitch % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) < 0.8 ||
                    Math.abs(((v.pitch % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) > Math.PI * 2 - 0.8;
      const gained = Math.round(airtime * 50 + newFlips * 250 + (clean ? 100 : 0));
      score += gained;
      bestAir = Math.max(bestAir, airtime);
      if (airtime > 0.6) {
        banner.show(`+${gained}<small>${newFlips ? newFlips + 'x FLIP! ' : ''}${airtime.toFixed(1)}s air${clean ? ' · clean!' : ''}</small>`);
        bannerTimer = 1.2;
      }
      v.airborne = false; v.vy = 0; v.pitch = 0;
    }
  }

  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) banner.hide(); }
  if (input.wasPressed('KeyV')) swapVehicle();
  if (input.wasPressed('KeyR')) { v.pos.set(0, 0, -20); v.yaw = 0; v.speed = 0; v.airborne = false; v.pitch = 0; }

  // apply to mesh
  car.position.copy(v.pos);
  car.rotation.set(v.pitch, v.yaw, 0);
  // spin wheels + steer fronts
  const steerVis = (input.isDown('KeyA') ? 0.4 : 0) - (input.isDown('KeyD') ? 0.4 : 0);
  wheels.forEach((w, i) => {
    w.rotation.x += v.speed * dt * 0.5;
    if (i < 2) w.rotation.y = steerVis;
  });

  // chase camera
  const camTarget = new THREE.Vector3(
    v.pos.x - Math.sin(v.yaw) * 22,
    v.pos.y + 11,
    v.pos.z - Math.cos(v.yaw) * 22
  );
  camera.position.x = damp(camera.position.x, camTarget.x, 6, dt);
  camera.position.y = damp(camera.position.y, camTarget.y, 6, dt);
  camera.position.z = damp(camera.position.z, camTarget.z, 6, dt);
  camera.lookAt(v.pos.x, v.pos.y + 2, v.pos.z);

  // HUD
  const kmh = Math.abs(Math.round(v.speed * 3.6));
  hud.innerHTML =
    `<div class="label">${v.isBike ? '🏍️ Dirt Bike' : '🏎️ Car'}</div>` +
    `<div class="big">${kmh} <span style="font-size:14px">km/h</span></div>` +
    `<div><span class="label">Score</span> <b>${score}</b></div>` +
    `<div><span class="label">Best air</span> <b>${bestAir.toFixed(1)}s</b></div>` +
    (v.airborne ? `<div style="color:#ffd36e">✈ AIRBORNE ${airtime.toFixed(1)}s</div>` : '');
});
