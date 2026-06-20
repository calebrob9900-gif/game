import * as THREE from 'three/webgpu';

/**
 * Renderer bootstrap: WebGPU first, automatic WebGL2 fallback (WebGPURenderer
 * selects the backend; on headless SwiftShader it lands on WebGL2). Owns the
 * scene, camera and a small lit "hello" cityscape for Phase 0. Presentation
 * only — never imported by src/sim.
 */
export class GameRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGPURenderer;
  private readonly canvas: HTMLCanvasElement;
  backend: 'webgpu' | 'webgl2' | 'unknown' = 'unknown';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 20, 120);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
    this.camera.position.set(0, 1.7, 0);

    this.buildHelloScene();
  }

  async init(): Promise<void> {
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    await this.renderer.init();
    // WebGPURenderer exposes the chosen backend after init.
    const backend = this.renderer.backend as unknown as { isWebGPUBackend?: boolean };
    this.backend = backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
    this.resize();
  }

  private buildHelloScene(): void {
    const hemi = new THREE.HemisphereLight(0x8090ff, 0x101018, 1.1);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(8, 16, 6);
    this.scene.add(sun);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.95, metalness: 0.0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // a small grid of neon blocks so the scene is non-blank and lit
    const blockGeo = new THREE.BoxGeometry(2, 4, 2);
    const neon = [0x38e1ff, 0xff3ca6, 0x9b5cff, 0x37ffa0];
    for (let i = 0; i < 16; i++) {
      const c = neon[i % neon.length] ?? 0x38e1ff;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x202430,
        emissive: new THREE.Color(c),
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.3,
      });
      const block = new THREE.Mesh(blockGeo, mat);
      const ring = 1 + Math.floor(i / 4);
      const ang = (i % 4) * (Math.PI / 2) + ring * 0.4;
      block.position.set(Math.cos(ang) * ring * 8, 2, Math.sin(ang) * ring * 8 - 18);
      this.scene.add(block);
    }
  }

  /** Place the camera from an (already interpolated) eye transform. */
  setCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.canvas.clientWidth || globalThis.innerWidth || 1280;
    const h = this.canvas.clientHeight || globalThis.innerHeight || 720;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
