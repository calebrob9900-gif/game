# 05 — Realistic Assets & Content Pipeline (Browser FPS)

> Research date: **June 2026**. Target stack: **Three.js / WebGL** browser FPS (see `shooter.html`).
> Goal: source realistic characters, weapons (FPS arms + guns), environments/props, textures,
> HDRIs/skyboxes **legally**, and stand up a repeatable authoring → optimize → load pipeline,
> including animation retargeting for enemies and first-person arms.

This document is the canonical reference for "where do assets come from and how do we get them
into the game." Every source below has an explicit **commercial-use license note**. When in
doubt, the rule is: **prefer CC0** (no attribution, no strings), keep a per-asset license ledger,
and never ship anything whose license you can't quote.

---

## 0. TL;DR recommendations for our FPS

- **Base everything on CC0.** Poly Haven (HDRIs/skies, PBR materials, props), ambientCG
  (materials/HDRIs), Quaternius (characters/weapons/props), Kenney (props/kits), Poly Pizza
  (CC0 model search). Zero attribution, full commercial use, no legal review per asset.
- **Enemies + animations:** Mixamo (Adobe) — free, royalty-free for commercial games, auto-rig
  + huge mocap library (walk/run/idle/attack/death). The one rule: don't redistribute the raw
  files as an asset pack. Retarget through Blender, bake to GLB.
- **First-person arms + weapons:** mix of CC0 weapon meshes (Quaternius/Sketchfab CC0) + a
  rigged FP-arms base (Blend Swap / itch.io / Sketchfab — **check each license**, many are CC-BY,
  one is CC0). Author the FP view-model animations ourselves in Blender (idle/fire/reload/sprint).
- **Format:** ship **`.glb`** only. Compress geometry with **meshopt** (preferred for web) or
  **Draco**, textures with **KTX2 / Basis Universal**. Run everything through **gltf-transform**
  (or **gltfpack**) before it touches the repo.
- **Loaders:** `GLTFLoader` + `MeshoptDecoder` (+ `KTX2Loader`, + `DRACOLoader` if we use Draco).
- **AI 3D (Meshy / Tripo / Rodin):** useful for greyboxing, hero props, and concept-to-mesh, but
  **read the plan-tier license** (commercial rights are gated to paid tiers) and always retopo/clean
  before shipping. Don't put AI output on the critical path for hero characters yet.
- **Avoid / watch:** Ready Player Me (public service shut down Jan 2026 after Netflix acquisition).
  Quixel/Megascans free era ended; it now lives on Fab under the Fab Standard License.

---

## 1. Asset sources (with commercial-license notes)

### 1.1 CC0 — the safe core (no attribution, full commercial use)

CC0 = Creative Commons Zero = public-domain dedication. You can use it for anything, including
commercial, modify it, and you owe **no credit** (credit is appreciated but not required). This is
the tier we standardize on.

| Source | What it has | Best for our FPS | License | URL |
|---|---|---|---|---|
| **Poly Haven** | 500+ AAA PBR models, materials, **HDRIs incl. sky HDRIs** | Skyboxes/IBL lighting, props, ground/wall materials | **CC0** | https://polyhaven.com/ · license: https://polyhaven.com/license · skies: https://polyhaven.com/hdris/skies |
| **ambientCG** | 2,000+ PBR materials, HDRIs, some 3D models (albedo/normal/roughness/metallic/height/AO) | Tiling environment textures, decals, HDRIs | **CC0** | https://ambientcg.com/ |
| **Quaternius** | Thousands of low/mid-poly models: characters, **weapons**, vehicles, environments, animals | Enemies, weapon meshes, modular environment kits | **CC0** | https://quaternius.com/ |
| **Kenney** | 40,000+ assets, 3D kits, props, audio, UI | Prototyping, modular level kits, props, UI/crosshairs | **CC0** | https://kenney.nl/ |
| **Poly Pizza** | CC0 model search/aggregator (no login) | Quick CC0 prop hunting | **CC0** (filter) | https://poly.pizza/search/CC0 |
| **Sketchfab (CC0 filter)** | Huge library; use the **license filter** set to CC0 | One-off hero props, scanned objects | **CC0 only when filtered** — most Sketchfab CC models are **CC-BY (attribution required)** | https://sketchfab.com/ · filters blog: https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters/ |
| **Khronos glTF Sample Assets** | Reference/test/showcase glTF models | Pipeline test fixtures, loader validation, not production | **Repo CC-BY 4.0; per-model licenses vary** — read each model's `README.md` | https://github.com/KhronosGroup/glTF-Sample-Assets |

**Curated CC0 meta-lists** (good for discovery): `awesome-cc0`
(https://github.com/madjin/awesome-cc0) and `game-assets-cc0`
(https://github.com/mattmezzomo1/game-assets-cc0).

### 1.2 Attribution / mixed licenses (usable, but track the credit)

| Source | License reality | Notes for commercial use |
|---|---|---|
| **Sketchfab (general CC)** | 700k+ downloadable; **most are CC-BY** (credit author + "Sketchfab"); some CC-BY-NC (**NO commercial use**), some CC0 | Always open the model page and confirm. **Reject CC-BY-NC / CC-*-NC for our shipping game.** License intro: https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses/ |
| **OpenGameArt.org** | Per-asset: CC0, CC-BY, CC-BY-SA, GPL, etc. **3D content is thinner than 2D** | Fine for textures/props; **CC-BY-SA and GPL are "viral"** — avoid for proprietary code/asset bundling unless you accept share-alike. https://opengameart.org/ |
| **itch.io asset packs** | **Per-creator** — ranges from CC0 to "free, commercial OK, no resale" to paid Standard License | Read each pack's page. Good for FPS arms/hand packs and animation libraries. Browse: https://itch.io/game-assets/tag-commercial-license |
| **Blend Swap** | Per-blend, commonly **CC-BY** (credit required), some CC0 | Source of the classic rigged FP-shooter hands blend (CC-BY): https://blendswap.com/blend/5152 |
| **Fab (Epic)** | **Fab Standard License** (commercial OK, both Personal & Pro tiers grant same rights) or **CC-BY**; free and paid | This is where **Quixel/Megascans now lives**. https://www.fab.com/eula · docs: https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab |

### 1.3 Characters & animations (the enemy/NPC pipeline)

| Source | License (2026) | Use |
|---|---|---|
| **Mixamo (Adobe)** | **Free, royalty-free for personal + commercial + non-profit.** Auto-rigger + characters + animations usable in any project. **Restriction:** you may NOT redistribute the raw character/animation files as a standalone asset pack / stock / ML training set — they must be *incorporated into a project*. | **Primary source of enemy animations** (walk/run/idle/attack/hit/death) and auto-rigging. FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html |
| **Quaternius characters** | CC0 | Stylized/low-poly enemy bases, riggable | 
| **RancidMilk free 3D character animations** (itch.io) | Free, modify + redistribute allowed | Extra mocap clips: https://rancidmilk.itch.io/free-character-animations |
| **Hormelz free animations** (itch.io) | **CC0** | 30+ clips: see itch.io |
| **Rodin (DeepMesh/ByteDance)** | Paid-tier commercial rights | AI hyper-realistic human characters (see §5) |

> **Ready Player Me — DO NOT rely on it.** Avatars were CC-BY-4.0 for non-commercial / dev-signup
> for commercial, but RPM was acquired by Netflix (Dec 2025) and **shut down its public service on
> 2026-01-31**. Treat as dead for new work. (Wikipedia: https://en.wikipedia.org/wiki/Ready_Player_Me)

### 1.4 First-person arms & weapons (FPS view-model)

There is no single great CC0 FP-arms pack; assemble it:

- **Blend Swap — "The First Person Shooter Hands"** — rigged, IK, test anims. **CC-BY** (credit). https://blendswap.com/blend/5152
- **Sketchfab "First Person arms" (DJMaesen)** / **"Animated FPS hands (rifle animation pack)" (Cransh)** / **"First Person hands rigged" (David Fischer)** — rigged FP arms; **check each model's CC license** (CC-BY vs CC0) on its page. Tag: https://sketchfab.com/tags/fps-arm
- **itch.io — "Retro PSX Rigged First Person Arms" (Comp-3 Interactive)** — fully rigged, IK elbows/hands, rolling fingers. License on page. https://comp3interactive.itch.io/retro-first-person-arms
- **Weapons (guns):** Quaternius weapon packs (CC0) and Sketchfab CC0-filtered gun models. Author
  the **fire/reload/draw/sprint** view-model animations ourselves in Blender — generic packs rarely
  match a specific weapon's mechanics and timing.

---

## 2. Formats & optimization

### 2.1 Format decision: ship `.glb` only

- **glTF 2.0 / GLB** is the runtime delivery format for the web ("the JPEG of 3D"). GLB = single
  binary bundle (mesh + materials + textures + animations). Use it for everything.
  https://www.khronos.org/gltf/
- Author in Blender / DCC tools → export glTF → **optimize** → load in Three.js.

### 2.2 Geometry compression: meshopt (preferred) or Draco

| | **meshopt** (`EXT_meshopt_compression`) | **Draco** (`KHR_draco_mesh_compression`) |
|---|---|---|
| Compresses | geometry, **morph targets, keyframe animation** | geometry only |
| Decode speed | **Faster** (lighter on client) | Slower |
| Ratio | Close to Draco when combined with gzip/brotli | Slightly higher raw ratio |
| Recommendation | **Default for our FPS** (animation-heavy, web target) | Use if a tool/asset already ships Draco |

Sources: meshoptimizer/gltfpack https://meshoptimizer.org/gltf/ ; three.js perf notes
https://www.utsubo.com/blog/threejs-best-practices-100-tips

### 2.3 Texture compression: KTX2 / Basis Universal

- **KTX2 + Basis Universal stays GPU-compressed** (lower VRAM, faster upload) vs decoding PNG/JPG
  to raw RGBA.
- **UASTC** = higher quality → **normal maps & hero textures**. **ETC1S** = smaller → environment
  / secondary textures. Requires the `KHR_texture_basisu` extension + `KTX2Loader` on the client.
- As of early 2026, gltf-transform/gltfpack can convert **all** textures to KTX2/BasisU in one pass.

### 2.4 LODs, atlasing, instancing

- **Texture atlasing:** bake/pack multiple materials into one atlas so a model = 1 geometry + 1
  texture → fewer draw calls and fewer files. Do it in Blender (UV pack / bake) or via tooling.
- **LODs:** generate decimated levels for distant geometry; Three.js `LOD` object swaps by distance.
  gltf-transform/gltfpack can simplify meshes (`weld` + `simplify`).
- **Instancing:** for repeated props (crates, barrels, lamps) use `EXT_mesh_gpu_instancing` /
  `InstancedMesh` — gltf-transform has an `instance` transform.
- **Bake static lighting / AO** in Blender for static level geometry to cut runtime shading cost.

### 2.5 Tooling

| Tool | Role | Notes / URL |
|---|---|---|
| **gltf-transform** | Programmatic + CLI glTF optimizer: dedup, weld, prune, simplify (LOD), instance, Draco, meshopt, **KTX2** texture compress, resize | MIT. https://gltf-transform.dev/ |
| **gltfpack** (meshoptimizer) | One-shot CLI: meshopt compress, KTX2/WebP textures, quantization | https://meshoptimizer.org/gltf/ · npm: `gltfpack` |
| **CesiumGS gltf-pipeline** | Draco-focused glTF↔glb pipeline | https://github.com/CesiumGS/gltf-pipeline |
| **Blender 4.x glTF exporter** | Authoring + export (built in) | bake textures first; all maps must be image textures |
| **glTF Viewer (donmccurdy)** | QA each asset before committing | https://gltf-viewer.donmccurdy.com/ |
| **toktx / Basis encoder** | Manual KTX2 encoding when needed | part of KTX-Software |

**Canonical optimize commands** (drop into a build script):

```bash
# gltf-transform: full optimize — meshopt geometry + KTX2 textures + dedup/prune
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress meshopt \
  --texture-compress ktx2 \
  --texture-size 2048

# alternative: Draco geometry instead of meshopt
npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-compress ktx2

# gltfpack equivalent: meshopt + KTX2 textures (-cc = high compression, -tc = texture compress)
npx gltfpack -i in.glb -o out.glb -cc -tc
```

---

## 3. Authoring tools (free)

- **Blender** (free, GPL) — central hub: import (FBX/glTF/OBJ), retarget, retopo, UV/bake, decimate,
  export glTF. Everything funnels through Blender.
- **gltf-transform / gltfpack** — optimization (see §2.5).
- **Material/texture authoring (free):** **Materialize** (height/normal/AO from a photo),
  **Material Maker** (node-based PBR, open source), GIMP/Krita for albedo touch-ups.
- **AI texture (free/freemium):** AITextured (https://aitextured.com/), Poly, Meshy texture
  generator — generate tileable PBR base maps (see §5).
- **QA:** donmccurdy glTF Viewer; Three.js own examples for animation/material sanity checks.

---

## 4. Animation: rigging, retargeting, and getting clips onto enemies

### 4.1 Mixamo → GLB enemy workflow (the main path)

Goal: take a character mesh and apply walk/run/idle/attack/death so the same skeleton plays
multiple clips in Three.js.

**Recommended (Blender) workflow:**
1. **Rig:** Upload the character mesh (FBX/OBJ) to **Mixamo** → **Auto-Rigger** produces a
   standard Mixamo skeleton. (Quaternius/CC0 meshes work; for non-Mixamo rigs, retarget in Blender.)
2. **Grab clips:** Download each animation (walk, run, idle, attack, hit, death) as **FBX**.
   Use **"Without Skin"** for additional clips after the first to keep files small. Keep all clips
   from the **same base character/skeleton** so bone names match.
3. **Combine in Blender:** Import the skinned mesh + import each FBX action; assign actions to the
   one armature via the Dope Sheet / NLA. Each action becomes a named clip.
4. **Export `.glb`** with animations. In Three.js the clips arrive in `gltf.animations`.
5. **Optimize** the GLB (§2) — meshopt compresses keyframe animation too.

**Faster path (no Blender):** online mergers convert multiple Mixamo FBX → one web-ready GLB with
all clips, e.g. https://mixamo2gltf.com/ and `enomie/Mixamo2GLBAnimationMerger`
(https://github.com/enomie/Mixamo2GLBAnimationMerger). Good for prototyping; verify license/output.

### 4.2 Retargeting to a non-Mixamo / custom rig

If a character already has its own armature (e.g., a Sketchfab model or our FP arms), retarget
Mixamo motion onto it in Blender using **Auto-Rig Pro** (paid) or the free **Rokoko Blender add-on**
/ Blender's built-in retarget. Match the rest pose (T/A-pose), map bones, bake, export GLB. Three.js
also has a `SkeletonUtils.retargetClip()` helper for runtime/offline bone-name remapping when
skeletons are close.

### 4.3 First-person arms + weapon animations

- FP arms are a **separate view-model** rendered on top of the world (own camera/layer, no shadow
  casting onto the world, slight FOV).
- Author **idle / fire / reload / draw / sprint / inspect** as clips on the arms+weapon rig in
  Blender; export as a single GLB with named actions; drive with `AnimationMixer` and cross-fade.
- Keep the weapon parented to the hand bone so one rig animates both.

### 4.4 Playing clips in Three.js

```js
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }   from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader }    from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');          // only if Draco used
const ktx2  = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);

const loader = new GLTFLoader()
  .setDRACOLoader(draco)
  .setKTX2Loader(ktx2)
  .setMeshoptDecoder(MeshoptDecoder);

loader.load('/enemy.glb', (gltf) => {
  scene.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const run   = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'Run'));
  run.play();
  // in the render loop: mixer.update(delta);
});
```

Reuse a **single** `DRACOLoader`/`KTX2Loader` instance across all loads. Host the decoder/transcoder
WASM files locally (`/draco/`, `/basis/`). Docs: https://threejs.org/docs/pages/GLTFLoader.html

---

## 5. AI-generated assets (2026): feasibility & cautions

State of the art mid-2026 — useful, not magic:

| Tool | Strength | Commercial license | URL |
|---|---|---|---|
| **Meshy** | Best all-round text/image→3D; built-in **auto-rig + 500+ animation presets**; exports FBX/OBJ/**GLB**/USDZ/STL/BLEND; generates albedo/roughness/metallic/normal | **Commercial rights on Pro+ paid tiers** (verify current plan terms) | https://www.meshy.ai/ |
| **Tripo** | **Fastest** (usable mesh ~8s); auto-optimizes topology for game engines; built-in rigging | **Commercial use on paid tiers** | https://www.tripo3d.ai/ |
| **Rodin (ByteDance)** | **Hyper-realistic human characters** | Paid-tier commercial rights | (Hyper3D / Rodin) https://hyper3d.ai/ |
| **AITextured / Poly / Meshy texture** | Text→tileable **PBR maps** in 10–60s | Plan-dependent | https://aitextured.com/ |

**Cautions (read before relying on AI assets):**
- **Licensing is plan-gated.** Free tiers often grant only non-commercial / limited rights;
  commercial rights typically require a paid tier. **Read the exact plan terms and screenshot them**
  at time of generation. Terms also change frequently.
- **Quality/topology:** raw AI meshes often have messy topology, baked-in lighting, non-manifold
  geometry, and oversized textures. **Budget retopo + re-bake + reUV time** before shipping; treat
  AI output as a *starting mesh*, not a final asset.
- **Provenance risk:** generative models may have trained on copyrighted data; legal status of AI
  output is still unsettled in 2026. For **hero characters and anything brand-facing**, prefer
  CC0/hand-authored. AI is best for **greyboxing, background props, texture base maps, and concepting**.
- **Best fit for us:** texture base maps (then clean in Material Maker/Materialize) and one-off
  environment props — not the player FP arms or primary enemies.

---

## 6. Recommended pipeline for our FPS (end to end)

```
                AUTHORING                         OPTIMIZE                    LOAD (Three.js)
  ┌───────────────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────┐
  │ Source CC0 (PolyHaven, ambient│   │ gltf-transform optimize  │   │ GLTFLoader +           │
  │ CG, Quaternius, Kenney) /      │   │  • meshopt (geo+anim)    │   │  MeshoptDecoder        │
  │ Mixamo (rig+anim) / AI (props) │──▶│  • KTX2/Basis textures   │──▶│  + KTX2Loader          │
  │   ↓ assemble + retarget in     │   │  • dedup/prune/weld      │   │  (+ DRACOLoader if used)│
  │   Blender → export .glb        │   │  • simplify → LODs       │   │ AnimationMixer / LOD   │
  │ (FP arms anims authored here)  │   │  • instance repeats      │   │ InstancedMesh          │
  └───────────────────────────────┘   └──────────────────────────┘   └────────────────────────┘
        QA: donmccurdy glTF Viewer at each handoff · per-asset LICENSE ledger committed to repo
```

**Conventions to adopt:**
1. **`.glb` only**, meshopt geometry, KTX2 textures, 2K cap on most textures (1K for secondary).
2. **One optimize script** (gltf-transform CLI) run on every asset before commit; raw source files
   stored outside the shipped bundle (or in a `/raw` dir excluded from build).
3. **License ledger:** `docs/research/asset-licenses.md` (or a CSV) — one row per asset: name,
   source URL, license, author, attribution-required (Y/N), commercial-OK (Y/N), date acquired.
   This is non-negotiable for a shippable commercial game.
4. **Default to CC0.** Allow CC-BY only with a tracked credit in an in-game/credits file. **Reject
   any NC (non-commercial), SA (share-alike) where it would force us to open our work, and GPL.**
5. **Decoder WASM hosted locally** (`/draco/`, `/basis/`); reuse single loader instances.
6. **Enemies:** Quaternius/CC0 mesh → Mixamo rig + clips → Blender combine → GLB → optimize.
7. **FP arms/weapons:** rigged arms base + CC0 gun meshes → author view-model clips in Blender → GLB.
8. **AI** only for prototyping, background props, and texture base maps — never the critical path
   for hero characters, and always with paid-tier commercial license + retopo.

---

## 7. License cheat-sheet (commercial shipping game)

| License | Commercial OK? | Attribution? | Gotchas | Verdict |
|---|---|---|---|---|
| **CC0** | ✅ | ❌ none | — | **Preferred** |
| **CC-BY** | ✅ | ✅ required | Must credit author (+ platform e.g. Sketchfab) | OK with credits file |
| **CC-BY-SA** | ✅ | ✅ required | **Share-alike** — derivatives must use same license | Avoid (viral) |
| **CC-BY-NC / *-NC** | ❌ | — | Non-commercial only | **Reject** |
| **GPL** | ⚠️ | — | Copyleft can infect bundled work | Avoid for assets |
| **Mixamo terms** | ✅ royalty-free | ❌ | No redistributing raw files as a pack | OK in-project |
| **Fab Standard License** | ✅ | per asset | Personal & Pro tiers grant same rights | OK |
| **itch.io / per-creator** | ⚠️ varies | varies | Read each pack | Case-by-case |

---

## Sources

- Poly Haven license — https://polyhaven.com/license · skies — https://polyhaven.com/hdris/skies
- ambientCG — https://ambientcg.com/
- Quaternius — https://quaternius.com/
- Kenney — https://kenney.nl/
- Poly Pizza (CC0) — https://poly.pizza/search/CC0
- Sketchfab license filters — https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters/
- Sketchfab CC intro — https://sketchfab.com/blogs/community/an-introduction-to-creative-commons-licenses/
- Sketchfab licenses — https://sketchfab.com/licenses
- Khronos glTF Sample Assets — https://github.com/KhronosGroup/glTF-Sample-Assets
- glTF overview (Khronos) — https://www.khronos.org/gltf/
- Mixamo FAQ — https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Mixamo license guide — https://www.licenseorg.com/guide/3d-assets/mixamo
- Mixamo→GLB merger (web) — https://mixamo2gltf.com/ · (repo) https://github.com/enomie/Mixamo2GLBAnimationMerger
- Blender→three.js export guide — https://github.com/funwithtriangles/blender-to-threejs-export-guide
- RPM + Mixamo in three.js — https://robesantoro.medium.com/three-js-blender-mixamo-52304823046
- Ready Player Me (status) — https://en.wikipedia.org/wiki/Ready_Player_Me · terms https://docs.readyplayer.me/ready-player-me/support/terms-of-use
- FP arms (Blend Swap, CC-BY) — https://blendswap.com/blend/5152
- FP arms (itch.io, Comp-3) — https://comp3interactive.itch.io/retro-first-person-arms
- FP arms tag (Sketchfab) — https://sketchfab.com/tags/fps-arm
- RancidMilk free animations — https://rancidmilk.itch.io/free-character-animations
- gltf-transform — https://gltf-transform.dev/
- gltfpack / meshoptimizer — https://meshoptimizer.org/gltf/ · https://www.npmjs.com/package/gltfpack
- CesiumGS gltf-pipeline — https://github.com/CesiumGS/gltf-pipeline
- Three.js perf (2026) — https://www.utsubo.com/blog/threejs-best-practices-100-tips
- GLTFLoader docs — https://threejs.org/docs/pages/GLTFLoader.html · DRACOLoader — https://threejs.org/docs/pages/DRACOLoader.html
- glTF Viewer (QA) — https://gltf-viewer.donmccurdy.com/
- Fab EULA — https://www.fab.com/eula · Fab licenses/pricing — https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab
- Quixel→Fab transition FAQ — https://support.fab.com/s/article/Fab-Transition-FAQs
- Meshy (AI 3D / texture) — https://www.meshy.ai/ · best AI tools for 3D game assets — https://www.meshy.ai/blog/best-ai-tools-for-3d-game-assets
- Tripo — https://www.tripo3d.ai/ · Rodin/Hyper3D — https://hyper3d.ai/
- AI texture (2026) — https://www.aimagicx.com/blog/ai-texture-generator-game-development-2026 · AITextured — https://aitextured.com/
- Text-to-3D honest comparison — https://nhance-school.com/articles/best-ai-3d-generators-2026
- CC0 meta-lists — https://github.com/madjin/awesome-cc0 · https://github.com/mattmezzomo1/game-assets-cc0
- Free game assets guide (2026) — https://app.cinevva.com/guides/game-assets-guide.html
- OpenGameArt — https://opengameart.org/ · itch.io commercial-license assets — https://itch.io/game-assets/tag-commercial-license
