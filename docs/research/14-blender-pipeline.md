# 14 — Blender → glTF/GLB → Three.js Pipeline

> Companion to `05-assets.md` / `11-level-design.md`. Condensed from nested research.
> (Several docs 403'd the fetcher; numeric defaults + CLI corroborated against GitHub
> primary sources — verify flag names against your installed tool versions.)

## Blockout / greybox in Blender
- Build levels from named primitives (Cube/Plane/Cylinder), one neutral grey material, snap to grid (coarse first e.g. 1 m, refine 0.5/0.25 m). Keep each piece a separate, meaningfully-named object → maps to glTF node names / `userData`.
- **Drop a 1.8 m reference capsule + camera at ~1.65 m eye height early** and build to it. Metrics: player box ≈ 1.0 × 1.8 m, eye 1.5–1.7 m, step 0.2–0.4 m; hallway ≥ 2× player width; stairs ~30–35°.
- Validate gameplay/scale/sightlines, **lock the blockout** (move to its own collection, keep as non-exported reference) **before** the art pass. Refs: book.leveldesignbook.com/process/blockout(/metrics).

## Units & axes (critical)
- Blender Scene Properties → **Metric, Length = Meters, Unit Scale = 1.0** → 1 Blender unit = 1 m = glTF/Three.js unit (glTF is defined in meters). A 2 m wall arrives as 2 units, no conversion.
- Blender is Z-up; glTF/Three.js Y-up → keep exporter **+Y Up ON**.
- Before export: **Object → Apply → All Transforms** (bake pos/rot/scale); eliminate non-uniform scale (causes shear/bad normals/broken colliders). **Do NOT apply-scale on rigged/armatured characters** (wrecks skinning) — static geometry/colliders only.

## glTF vs GLB
- **GLB (binary, single file)** for shipping to the browser — one request, atomic, smallest friction. **Separate .gltf** for authoring/debugging or sharing textures. Avoid embedded base64 (largest).

## Compression: Draco vs Meshopt
- **Draco** (`KHR_draco_mesh_compression`): smallest geometry (~7× smaller), slower decode, needs `DRACOLoader`. Best for static high-poly + bandwidth-constrained.
- **Meshopt** (`EXT_meshopt_compression`): slightly larger than Draco, **much faster decode**, compresses **animation/morphs** too, needs `setMeshoptDecoder`. **Often the better default for interactive games.**
- **KTX2/Basis** textures (`KHR_texture_basisu`): GPU-compressed → far less VRAM + smaller download; needs `KTX2Loader`.

## Blender glTF export panel (baseline for a static level)
- Format: **glTF Binary (.glb)**; Transform: **+Y Up ON**; Data: **Apply Modifiers ON** (if no shape keys), Normals ON, UVs ON, Tangents ON only with normal maps; Include: **Custom Properties ON** (Blender custom props → glTF `extras` → Three.js `userData`), Cameras/Punctual Lights as needed.
- Prefer exporting **uncompressed** from Blender and compressing in a **separate, controllable post-step** (gltf-transform / gltfpack) for better results.

## Collision meshes (no glTF-native standard — by convention)
- Put collision geometry in a dedicated `Collision` collection or prefix names (`COL_*`); at load `traverse()` the scene, pull them for physics (rapier/three-mesh-bvh/navmesh) and set invisible. Or tag with a custom prop (`collision=true`) read from `mesh.userData`.

## Optimize step (CLI)
```bash
npm i -g @gltf-transform/cli
gltf-transform inspect input.glb
# aggressive optimize (dedup/weld/join/prune/instance…) + textures; add compression flags explicitly:
gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp
gltf-transform meshopt  input.glb output.glb --level medium
gltf-transform uastc    in.glb out.glb --slots "{normalTexture,metallicRoughnessTexture}" --level 4 --rdo --zstd 18

# gltfpack (meshopt + KTX2), keep names/extras:
npm i -g gltfpack
gltfpack -i scene.gltf -o scene.glb -cc -tc -kn -km -ke   # -cc meshopt, -tc KTX2, -si R simplify
```
Note: `optimize` flattens hierarchy + joins meshes (100 → 1) and can drop a 2nd UV set — inspect first.

## Three.js loader (match your compression; reuse single decoder instances)
```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const draco = new DRACOLoader().setDecoderPath('/jsm/libs/draco/gltf/');
const ktx2  = new KTX2Loader().setTranscoderPath('/jsm/libs/basis/');
const loader = new GLTFLoader()
  .setDRACOLoader(draco)
  .setKTX2Loader(ktx2.detectSupport(renderer))   // must be set before loading KTX2
  .setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('models/level.glb');
```

## Recommended pipeline (synthesis)
1. Blender metric (1 u = 1 m); blockout named primitives + 1.8 m reference capsule.
2. Validate + lock blockout before art.
3. Apply All Transforms; remove non-uniform scale.
4. Export GLB, +Y Up, Apply Modifiers, Custom Properties ON.
5. Optimize separately (gltf-transform/gltfpack; Draco for static, Meshopt for animated).
6. Three.js GLTFLoader + matching decoders (reuse instances).

### Sources
Blender glTF exporter manual + export_scene API; Khronos glTF; three.js GLTFLoader/DRACOLoader docs; donmccurdy glTF-Transform (+CLI) & three-gltf-viewer; zeux/meshoptimizer gltf README; CesiumGS gltf-pipeline; leveldesignbook blockout/metrics; anvilinteractivesolutions units/scale/axes guide; glTF-Blender-IO axis/scale issues.
