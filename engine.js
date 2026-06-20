// Shared mini-engine for all game prototypes.
// Built on Three.js (WebGL). Handles renderer, scene, camera, lights,
// the animation loop, window resize, keyboard/mouse input, and a HUD.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Input: tracks held keys + keys pressed once this frame, plus mouse buttons.
// ---------------------------------------------------------------------------
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // keys that went down this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this._clickPressed = false;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      // stop the page from scrolling on arrows/space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this._clickPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }
  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // call once per frame, at the end
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this._clickPressed = false; }
}

// ---------------------------------------------------------------------------
// createEngine: returns { renderer, scene, camera, clock, input, setUpdate }
// ---------------------------------------------------------------------------
export function createEngine({ background = 0x87ceeb, fog = null, fov = 60, far = 4000 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(fog.color ?? background, fog.near ?? 60, fog.far ?? 600);

  const camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, far);
  camera.position.set(0, 8, 16);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const clock = new THREE.Clock();
  const input = new Input();
  let updateFn = () => {};

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05); // clamp so tab-outs don't explode physics
    updateFn(dt, clock.elapsedTime);
    input.endFrame();
    renderer.render(scene, camera);
  }
  loop();

  return { renderer, scene, camera, clock, input, setUpdate: (fn) => { updateFn = fn; } };
}

// ---------------------------------------------------------------------------
// addLights: a flattering hemisphere + shadow-casting sun. Returns the lights.
// ---------------------------------------------------------------------------
export function addLights(scene, { sun = 0xfff3e0, sunIntensity = 2.4, shadowSize = 200 } = {}) {
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a4032, 1.1);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(sun, sunIntensity);
  dir.position.set(120, 200, 80);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  const s = shadowSize;
  Object.assign(dir.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 800 });
  dir.shadow.bias = -0.0004;
  scene.add(dir);
  scene.add(dir.target);
  return { hemi, dir };
}

// ---------------------------------------------------------------------------
// HUD helpers — a styled overlay div you fill with HTML.
// ---------------------------------------------------------------------------
export function makeHUD(html = '') {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

// A centered banner (for "GET READY", countdowns, "CRASHED" etc.)
export function makeBanner() {
  const el = document.createElement('div');
  el.className = 'banner';
  document.body.appendChild(el);
  return {
    show(html) { el.innerHTML = html; el.style.opacity = '1'; },
    hide() { el.style.opacity = '0'; },
  };
}

// Small helper: lerp a value toward target (frame-rate aware-ish).
export const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
