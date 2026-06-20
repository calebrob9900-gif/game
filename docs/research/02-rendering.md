# 02 — Rendering Tech Plan (Browser-based AAA-aspiring FPS)

**Date:** June 2026
**Author:** Real-time graphics engineering
**Scope:** Engine selection, in-browser realism techniques, WebGPU vs WebGL2, performance budgets, and profiling for a high-fidelity browser FPS.

---

## 0. Executive summary (TL;DR)

- **Engine recommendation: Three.js (r180+ WebGPURenderer + TSL), built either as vanilla Three.js or React Three Fiber (R3F).** It has by far the largest ecosystem, production-ready WebGPU since r171, a node-based shader/post-processing pipeline (TSL + RenderPipeline), and the deepest pool of examples, hires, and third-party tooling. **Babylon.js 9.0 is a very strong runner-up** (clustered lighting, Frame Graph, batteries-included physics/audio/XR) and is the safer pick if you want a fuller engine out of the box. **PlayCanvas** is the best choice if you want an editor-driven, collaborative team workflow. **Unity/Unreal-to-web is not recommended for the core runtime** — Unity WebGPU export is viable but heavy; Unreal is download-export-impractical and only realistic via Pixel Streaming (cloud GPU per user), which we treat as a fallback, not the primary plan.
- **Target WebGPU first, with automatic WebGL2 fallback.** In June 2026 WebGPU is shipping in Chrome, Edge, Firefox (Win + Apple-Silicon macOS), and Safari 26 (macOS/iOS/iPadOS), covering roughly the large majority of users; the rest fall back to WebGL2 automatically in Three.js/Babylon/PlayCanvas. WebGPU gives the draw-call and compute headroom an FPS needs.
- **Realistic visual ceiling:** With WebGPU you can credibly hit *late-PS4 / "console-quality" stylized-realism* in the browser — PBR + IBL, cascaded shadows, GTAO, bloom, TAA, SSR, decals, tonemapping/LUT. You will **not** match a 2026 native AAA flagship (full hardware ray tracing, Nanite-class virtualized geometry, Lumen-class GI, 8+ GB of streamed assets). The browser's hard constraints — ~2–4 GB WASM/heap memory (much less on iOS), single main thread for JS, download-size budgets, no low-level driver access — set the ceiling. Aim for "looks great in a tab," not "indistinguishable from native AAA."

---

## 1. Engine comparison

### 1.1 Comparison table

| Criterion | **Three.js (r180+, WebGPU/TSL)** | **Babylon.js 9.0** | **PlayCanvas** | **Unity → Web (Unity 6/7)** | **Unreal → Web (Pixel Streaming)** |
|---|---|---|---|---|---|
| **Type** | Low-level rendering library + huge ecosystem | Full game engine (physics, audio, XR, GUI) | Cloud game engine + browser editor | Full native engine, WASM/WebGPU export | Native engine, **server-rendered video stream** |
| **WebGPU status (2026)** | Production since r171; zero-config, auto WebGL2 fallback | Mature; all core shaders in WGSL+GLSL; render bundles (~10x faster scene render) | Production WebGPU incl. compute shaders; WebGL2 fallback | WebGPU is default web target in Unity 7 LTS, WebGL2 fallback | N/A (renders on GPU server, streams H.264/AV1) |
| **Realistic FPS fit** | Excellent (full control of pipeline) | Excellent (clustered lighting → hundreds of lights) | Very good (clustered forward, mobile-strong) | Good visuals, but heavy runtime/startup | Best raw fidelity (native UE5), but cloud-bound |
| **Shaders** | TSL (compiles to WGSL/GLSL), node + raw | NME (node editor) + WGSL/GLSL | Shader graph + GLSL/WGSL | ShaderLab/HLSL (transpiled) | Full UE material graph (native) |
| **Post-processing** | RenderPipeline (TSL) for WebGPU; EffectComposer (WebGL); pmndrs `postprocessing` | Built-in pipelines + Frame Graph v1 | Built-in post + custom | Built-in URP/HDRP-lite post | Full native post (it's native UE) |
| **Editor / tooling** | None first-party (use R3F + editors, Theatre, etc.) | Playground, Sandbox, Node Material Editor, Inspector | **Best-in-class browser editor, real-time collab** | Full Unity Editor (desktop) | Full Unreal Editor (desktop) |
| **Ecosystem / community** | **Dominant** (~5M weekly npm downloads; ~300x Babylon/PlayCanvas) | Strong, Microsoft-backed, great docs | Smaller but game-focused | Massive (native), smaller for web specifically | Massive (native), niche for web |
| **Physics** | BYO (Rapier/`@react-three/rapier`, cannon, Jolt-wasm) | Built-in (Havok, Cannon, Ammo) | Built-in (Ammo) | Built-in (PhysX) | Built-in (Chaos) |
| **Build size / startup** | Lean; tree-shakeable; fast TTI | Moderate | Moderate | **Heavy** (~8 MB minimum even empty; large WASM) | Tiny client (just a video player) |
| **Cost model** | Free/MIT, client-side compute | Free/Apache, client-side compute | Free engine (MIT); editor has paid tiers | Free/paid tiers; client-side compute | **$$$ per-concurrent-user cloud GPU** (always-on cost) |
| **Latency** | Local (instant input) | Local | Local | Local | **Network-bound** (~16ms+ frame buffer @60fps + RTT) |
| **Best for** | Custom, ecosystem-rich, max control | Batteries-included engine | Team/editor workflow, mobile | Porting existing Unity titles | Showcasing an existing UE5 title, short demos |

### 1.2 Per-engine notes

**Three.js (recommendation).** Since r171 (Sept 2025) `WebGPURenderer` imports with zero config and automatically falls back to WebGL2, so you can target WebGPU for the whole audience today. **TSL (Three Shader Language)** is a higher-level node language that compiles to WGSL or GLSL ES 3.00, letting you write shaders once for both backends. **RenderPipeline** (introduced around r183) is the node-based, TSL-built post-processing stack for WebGPU (the old `EffectComposer` is WebGL-only). Caveat: the new TSL post stack does **not yet** have the full library of ready-made passes the old system had — bloom, SSAO/GTAO, DOF, and color grading often need to be re-checked or rewritten against the new pipeline. For an FPS we'd likely use the pmndrs `postprocessing` library and/or hand-authored TSL passes. The PBR/IBL story is mature: `MeshStandardMaterial`/`MeshPhysicalMaterial`, PMREM-prefiltered HDRI IBL, `HDRLoader` (renamed from `RGBELoader` in r179), `scene.environmentIntensity` (r163). Cascaded shadow maps exist via the built-in CSM module (use `CSMShadowNode` on WebGPU).

**React Three Fiber (R3F) — recommended authoring layer on top of Three.js.** In 2026 the game-relevant ecosystem has matured: R3F v9.5+, `@react-three/drei` v9.116+, `@react-three/rapier` v2+ (Rapier physics as JSX), and `ecctrl` (ready-made FPS/character controller with walk/jump/camera). React's component model maps cleanly onto game entities and UI overlays. Use **vanilla Three.js** instead if you need extremely tight render-pipeline control, aggressive memory pooling, or raw WebGL/WebGPU access in hot paths. A pragmatic plan: R3F for scene/entity/UI orchestration, drop to vanilla Three.js/TSL for the render loop hot paths.

**Babylon.js 9.0 (strong runner-up).** v8.0 (Mar 2025) shipped all core shaders in both GLSL and WGSL and IBL shadows (Adobe contribution) plus full render-pipeline control and Gaussian Splatting materials. v9.0 (Mar 2026) added **Clustered Lighting** (group lights into screen-space tiles + depth slices → hundreds/thousands of dynamic lights at smooth framerates on both WebGPU and WebGL2) and a fully realized **Frame Graph v1** (node-based control over culling → post). Babylon reports ~10x faster scene rendering with WebGPU render bundles. Pick Babylon if you want physics/audio/XR/GUI built-in and excellent docs without assembling third-party packages.

**PlayCanvas.** Clustered Forward renderer (clustered lighting on by default since engine v1.56) gives many dynamic lights cheaply; full WebGPU support including **compute shaders** while keeping WebGL2 fallback; experimenting with froxel-based volumetric lighting via WebGPU compute. Its differentiator is the **browser-based, real-time collaborative editor** ("Figma for 3D") — best if artists/designers/devs work together. Historically strong on mobile framerate. Smaller ecosystem than Three.js.

**Unity → Web.** Unity 7 LTS makes WebGPU the default web target with WebGL2 fallback, and Unity's web tooling is its differentiator — it's the path of least resistance for porting an *existing* Unity project. Downsides for a from-scratch web FPS: large WASM/heap footprint (~8 MB minimum even for an empty project, much more real), longer startup/TTI, and the WASM 4 GB memory ceiling (far lower in practice, and **iOS Safari frequently OOM-crashes** above ~256–500 MB, especially with threads). Not our pick for a new, lean, fast-loading web FPS.

**Unreal → Web (Pixel Streaming).** There is no practical direct UE5-to-WebGPU export for a full title. The web path is **Pixel Streaming**: UE5 runs on a cloud GPU server and streams encoded video to the browser; input is sent back. Pros: full native UE5 fidelity (Nanite/Lumen/ray tracing) in any browser, tiny client. Cons that make it a *fallback only*: **per-concurrent-user cloud GPU cost** (each player needs a GPU instance; expensive and hard to scale, pay-as-you-go on Arcware/StreamPixel/Vagon), and **network latency** on top of render time (60fps adds ~16 ms frame-buffer delay vs ~33 ms at 30fps, *plus* RTT and any SFU/media-server hop). Good for a short marketing demo of an existing UE title; bad as the production runtime for a real-time competitive FPS.

### 1.3 Recommendation & reasoning

**Build the FPS on Three.js (r180+) with the WebGPURenderer + TSL, authored via React Three Fiber, with WebGL2 as the automatic fallback. Use Rapier (`@react-three/rapier`) for physics.**

Reasoning:
1. **Control + ceiling.** An FPS lives or dies on the render loop (shadows, post, culling, instancing). Three.js gives the most direct, low-level control and the WebGPU path gives the draw-call/compute headroom we need.
2. **Ecosystem & hiring.** ~5M weekly downloads (~300x Babylon/PlayCanvas) means more examples, more answered questions, more hireable engineers, and more battle-tested third-party libs (drei, postprocessing, Rapier, ecctrl).
3. **Cost & latency.** Client-side rendering = no per-user GPU cloud bill and zero network render latency — both decisive for a real-time shooter vs Pixel Streaming.
4. **Lean delivery.** Tree-shakeable, fast TTI, no multi-MB engine WASM baseline like Unity.
5. **Fallback safety.** Auto WebGL2 fallback means the ~minority without WebGPU still get a playable game.

**When to choose differently:** pick **Babylon.js 9.0** if you'd rather have one batteries-included engine (physics/audio/XR/GUI + clustered lighting + Frame Graph) than assemble libraries; pick **PlayCanvas** if a collaborative browser editor for a mixed art/dev team is a hard requirement; use **Unreal Pixel Streaming** only for a short, low-CCU marketing demo of an already-built UE title.

---

## 2. In-browser realism techniques (2026 feasibility checklist)

Legend: ✅ practical at 60fps on desktop WebGPU · 🟡 feasible with care/budget · 🔴 expensive / avoid on web.

| Technique | Feasibility | How / notes |
|---|---|---|
| **PBR materials** (albedo/metalness/roughness/normal/AO) | ✅ | `MeshStandardMaterial`/`MeshPhysicalMaterial`. Core, cheap. Add anisotropy/clearcoat/sheen via PhysicalMaterial where it matters (weapons, glass) — budget those. |
| **Image-based lighting / HDRI** | ✅ | PMREM-prefiltered runtime mipmaps for diffuse + specular IBL. Use `HDRLoader` (formerly `RGBELoader`); tune `scene.environmentIntensity`. **FastHDR** loads ~10x faster than EXR and uses ~95% less GPU memory — prefer it for env maps. |
| **Real-time shadows — Cascaded Shadow Maps (CSM)** | ✅ | Built-in CSM module; higher-res cascades near camera, lower far. Use `CSMShadowNode` on WebGPU. Budget: 1 directional (sun) CSM with 3–4 cascades; keep extra shadow-casting lights few. |
| **Bloom** | ✅ | Standard pass (pmndrs `postprocessing` / TSL). Keep threshold/iterations modest. |
| **Ambient occlusion — GTAO** (preferred over SSAO) | ✅/🟡 | GTAO is horizon-based, more physically accurate than classic SSAO; on WebGPU it can run higher sample counts at comparable/better cost than the WebGL SSAO. Half-res + denoise to stay in budget. |
| **TAA (temporal anti-aliasing)** | ✅ | Jittered samples accumulated across frames; high quality when static. **An FPS has constant motion**, so pair TAA with motion vectors or use FXAA/SMAA fallback to avoid ghosting; many ship TAA + sharpen. |
| **Tonemapping / HDR pipeline** | ✅ | ACES/AgX tonemapping on the final pass; render in linear, tonemap to display. Cheap and high-impact for "filmic" look. Safari 26 even supports HDR canvas in WebGPU. |
| **Color grading / LUT** | ✅ | 3D LUT in the final post pass; negligible cost, huge art-direction value. |
| **Motion blur** | 🟡 | Per-object/camera motion blur via velocity buffer; adds a pass + motion vectors. Budget carefully; often per-weapon or camera-only. |
| **Screen-space reflections (SSR)** | 🟡 | Doable (and SSGI/TRAA are emerging on WebGPU/TSL) but multi-pass and noisy at grazing angles. Use selectively (wet floors, glass), half-res, with fallback to IBL/reflection probes. |
| **Decals** (bullet holes, blood, scorch) | ✅/🟡 | Mesh decals (`DecalGeometry`) for low counts; for FPS impact volume prefer a **deferred/clustered decal or texture-atlas pooled system** with a hard cap + recycling to control draw calls. |
| **Particles / VFX** (muzzle flash, smoke, sparks) | ✅/🟡 | GPU-instanced particles; WebGPU **compute shaders** enable large GPU-driven particle systems cheaply. Cap overdraw (transparent fill rate is the killer on mobile). |
| **Normal mapping** | ✅ | Standard, cheap, essential for surface detail. |
| **Parallax / parallax-occlusion mapping** | 🟡 | POM adds per-pixel ray-march cost; use on hero surfaces only. Simple parallax is cheap. |
| **Reflection probes / planar reflections** | 🟡 | Baked/box-projected cubemap probes are cheap and reliable; planar reflections (mirrors) cost an extra scene render — limit count. |
| **Clustered/many lights** | ✅ (Babylon/PlayCanvas), 🟡 (Three.js) | Babylon 9 clustered lighting and PlayCanvas clustered-forward give hundreds of dynamic lights; in Three.js plan light counts more conservatively or implement clustered/froxel forward yourself (WebGPU compute). |
| **Hardware ray tracing / path-traced GI (Lumen-class)** | 🔴 | Not a web primitive in 2026. Use baked lightmaps + IBL + SSR/SSGI approximations instead. |
| **Virtualized geometry (Nanite-class)** | 🔴 | Not available; rely on LODs + meshopt + instancing. |

**Practical "looks-AAA-ish at 60fps" stack for the FPS (desktop WebGPU):** PBR + HDRI IBL + ACES/AgX tonemap + 3D-LUT grade + sun CSM shadows + GTAO + bloom + TAA(+sharpen) + selective SSR + pooled decals + GPU particles. Drop SSR, motion blur, and GTAO sample count first when scaling down to WebGL2 / mobile.

---

## 3. WebGPU vs WebGL2 decision (2026)

### 3.1 Browser support snapshot (June 2026)
- **Chrome/Edge:** WebGPU since Chrome 113 (2023); Android since Chrome 121 (Android 12+, Qualcomm/ARM GPUs); **Linux still rolling out** (Chrome 144 Beta enabling Intel Gen12+, broader support coming).
- **Firefox:** Windows since FF 141; macOS (Apple Silicon, macOS Tahoe 26) since FF 145; **Linux & Android in progress** (Mozilla targeting Android sometime in 2026).
- **Safari:** Safari 26 ships WebGPU on macOS Tahoe 26, iOS 26, iPadOS 26, visionOS 26; includes HDR images in WebGPU canvas and (26.2) WebXR+WebGPU on Vision Pro.
- **Net:** All four major engines ship WebGPU; coverage is the large majority of users (sources cite figures from ~70% up to ~95% depending on methodology). The gap is mainly Linux Chrome/Firefox and older OSes — exactly what WebGL2 fallback covers.

### 3.2 Performance gains (why WebGPU for an FPS)
- **Draw calls:** lower per-call CPU overhead. Benchmarks: at ~10,000 draw calls WebGL drops to ~30 fps while WebGPU holds ~50 fps. Babylon reports ~10x faster scene rendering via render bundles (pre-recorded command reuse). Draw calls are a CPU problem, and an FPS is draw-call-heavy.
- **Compute shaders:** WebGPU exposes compute (15–30x on compute-heavy workloads in cited benchmarks) — enables GPU particles, GPU culling, clustered/froxel lighting, skinning.
- **Power:** lower CPU overhead → better battery (cited: a workload draining a phone in 2h on WebGL runs ~3h on WebGPU).

### 3.3 Gotchas
- **Linux desktop** WebGPU is incomplete (Chrome/Firefox) → fallback matters.
- **TSL post-processing maturity:** the WebGPU node post stack lacks some ready-made passes; budget time to port/author passes.
- **iOS memory:** WebGPU doesn't lift the WASM/heap memory ceiling; iOS Safari still OOM-crashes on large allocations (see §4.4).
- **Shader compilation hitches:** compile pipelines up front / warm them to avoid first-use stalls (true for both APIs).

### 3.4 Decision
**Target WebGPU as the primary path; ship automatic WebGL2 fallback.** All three candidate engines (Three.js, Babylon, PlayCanvas) do this for you. Author shaders in TSL (or Babylon NME) so a single source compiles to WGSL and GLSL. Feature-detect and **scale the post stack by backend**: full effects on WebGPU; reduced (drop SSR, lower GTAO, FXAA/SMAA instead of heavy TAA) on WebGL2/mobile.

---

## 4. Performance budgets for a smooth web FPS

> Web budgets are tighter than native. Treat these as **per-frame on-screen** targets, profile continuously, and scale per device tier.

### 4.1 Frame & frametime
- **Target 60 fps (16.6 ms/frame)** on desktop; **120 fps** stretch on flagships; **30–60 fps** floor on mid mobile.
- Leave headroom: aim for ~10–12 ms of GPU+CPU work to absorb spikes.

### 4.2 Draw calls (the #1 lever)
- **< 100 draw calls:** smooth 60fps on most devices (ideal).
- **~100–500:** workable on desktop with batching; watch the CPU.
- **> 500:** even strong GPUs struggle (CPU-bound) on WebGL; WebGPU buys headroom but still keep it controlled.
- Cut draw calls with **InstancedMesh** (many copies of one mesh), **BatchedMesh** (many meshes sharing a material), texture atlases, and merged static geometry. WebGPU render bundles further reduce per-call cost.

### 4.3 Triangles (secondary to draw calls)
- Rough on-screen budgets from 2026 web guidance: **mid mobile ~50k tris; flagship Android ~120k; iPhone 14 ~150k.** Desktop comfortably handles more (hundreds of k to low millions) if draw calls stay low.
- Use **LODs** (swap lower-poly meshes by distance) aggressively for an FPS's long sightlines.

### 4.4 Memory / VRAM (the hard ceiling)
- **WASM/heap memory:** WebAssembly caps at 4 GB but you can't use that much in practice; **iOS Safari OOM-crashes** around ~256–500 MB, worse with threads. Keep total memory lean, especially for mobile.
- **Texture memory is the big VRAM consumer:** an uncompressed 200 KB PNG can occupy **20+ MB of VRAM**; **KTX2/Basis stays GPU-compressed → ~4–10x less VRAM.** Always ship **KTX2** (UASTC for normal/hero maps, ETC1S for size-sensitive textures).
- Set explicit **texture memory budgets per tier** (e.g., desktop ~1–1.5 GB textures, mobile a few hundred MB) and dispose unused GPU resources.

### 4.5 Asset pipeline / download budget
- **Geometry compression:** **Meshopt** (similar ratio to Draco, faster decode, lighter client; pairs well with gzip) is generally preferred for real-time; Draco (60–90% vertex reduction) where max compression matters more than decode speed.
- **Textures:** KTX2/Basis via `KHR_texture_basisu`; FastHDR for environments.
- Tooling: **glTF-Transform** and Khronos **glTF-Compressor** (KTX2/Draco/Meshopt/quantization) in the build pipeline. Wire `KTX2Loader` + `DRACOLoader`/Meshopt decoder paths correctly.
- Keep initial download small; **stream/lazy-load** levels and high-res textures.

### 4.6 Other levers
- **Frustum culling** (on by default) + **occlusion culling** (HZB / WebGPU compute, or engine-provided) for indoor FPS maps.
- **Cap dynamic shadow casters** (ideally 1 sun CSM + a few); use baked lightmaps for static geometry.
- **Pool & cap** decals, particles, and tracers; recycle rather than allocate per shot.
- **Control transparent overdraw** (fill-rate is the mobile killer for smoke/VFX).

### 4.7 Suggested device-tier presets
| Tier | Backend | AA / Post | Shadows | Notes |
|---|---|---|---|---|
| **High (desktop, dGPU)** | WebGPU | TAA + GTAO(high) + bloom + SSR + LUT | Sun CSM 4 cascades + few point shadows | Full stack, 60–120 fps |
| **Mid (laptop / iGPU)** | WebGPU | TAA + GTAO(low) + bloom + LUT, no SSR | Sun CSM 3 cascades | Drop SSR/motion blur |
| **Low (mobile / WebGL2)** | WebGL2 | FXAA/SMAA + bloom + LUT | Sun shadow (low-res) | Fewer lights, lower-res textures, reduced tri budget |

---

## 5. Profiling methods

| Tool | What it gives you | Use for |
|---|---|---|
| **`renderer.info`** (Three.js) | `render.calls`, `render.triangles`, geometry/texture counts, programs | Quick draw-call/triangle/memory sanity checks in code/HUD |
| **stats.js** | Live FPS, frame ms, draw-call overlay | First-line frametime spotting during play |
| **Three.js first-party Performance API** (since ~r160) | Per-frame draw calls, texture memory, vertex count, shader compile time, **GPU frame time** — unified across WebGL & WebGPU | Standardized, renderer-agnostic per-frame metrics (replaces patchwork) |
| **Spector.js** (Chrome ext.) | Full WebGL/WebGL2 frame capture: every command, state, resources; increasingly useful for WebGPU | Deep "why is this frame slow / wrong" debugging |
| **Chrome DevTools — Performance panel** | JS execution, GC, main-thread stalls, flame charts | CPU-side bottlenecks, jank, GC pauses |
| **Chrome DevTools — Memory panel** | Heap snapshots, leaks | Hunting JS/GPU resource leaks over a session |
| **WebGPU timestamp queries / browser GPU profilers** (Dawn/wgpu tooling, PIX/Xcode/RenderDoc on native backends) | GPU pass timings | Per-pass GPU cost on the WebGPU path |
| **`about:gpu` / `chrome://gpu`** | Backend, adapter, fallback status | Confirm WebGPU is actually active vs WebGL2 fallback |

**Method:** profile on **representative low-end + flagship + iOS** hardware (not just your dev box); watch draw calls and GPU frame time first; capture a problem frame with Spector.js / DevTools; verify WebGPU is active via `chrome://gpu`; track texture VRAM with `renderer.info`/Performance API to stay under the iOS ceiling.

---

## 6. Honest assessment: web ceiling vs native AAA

**What web (WebGPU, 2026) can credibly deliver:** PBR + HDRI IBL, cascaded shadows, GTAO, bloom, TAA, tonemapping + LUT, selective SSR, decals, GPU particles, hundreds of clustered lights (Babylon/PlayCanvas) — i.e., **"console-quality" stylized realism, roughly late-PS4 era**, at 60 fps on desktop. The Web-vs-native gap has genuinely narrowed because WebGPU exposes low-level GPU control and compute.

**What it still cannot match:**
- **No hardware ray tracing / Lumen-class real-time GI** as a web primitive → rely on baked GI + IBL + SSR/SSGI approximations.
- **No Nanite-class virtualized geometry** → manual LODs + meshopt + instancing; lower effective on-screen triangle ceilings.
- **Memory wall:** practical heap/VRAM far below native (and iOS Safari OOM-crashes at a few hundred MB), so no 8+ GB streamed asset sets; aggressive KTX2/streaming required.
- **Threading & CPU:** JS main thread is single-threaded with GC; SIMD parallelism is limited; workers help but it's not native multithreading.
- **Download budget:** players won't wait for a 50 GB install; assets must be lean and streamed.
- **Pixel Streaming** *can* deliver true native UE5 visuals in a browser, but at per-user cloud-GPU cost and added network latency — viable for short demos, not a scalable competitive FPS runtime.

**Bottom line:** Set art direction for **stylized/PBR realism that flatters the web's strengths** (strong materials, IBL, filmic tonemapping, tight LODs, clever baked lighting) rather than chasing 1:1 parity with a 2026 native AAA flagship. With Three.js + WebGPU + TSL and disciplined budgets, "looks stunning in a browser tab at 60 fps" is fully achievable.

---

## Sources

**Engines / Three.js / WebGPU & TSL**
- What's New in Three.js (2026): WebGPU, New Workflows & Beyond — https://www.utsubo.com/blog/threejs-2026-what-changed
- Migrate Three.js to WebGPU (2026) — The Complete Checklist — https://www.utsubo.com/blog/webgpu-threejs-migration-guide
- Getting started with Three.js on WebGPU — ICS MEDIA — https://ics.media/en/entry/250501/
- Three.js vs Babylon.js vs PlayCanvas comparison — https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison
- Web game engines in 2026: PlayCanvas vs Three.js vs Babylon.js vs Unity WebGL (Cinevva) — https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison.html
- 11 Best Web Game Engines for 2026 (Cinevva) — https://app.cinevva.com/guides/web-game-engines-comparison.html
- Three.js (Wikipedia) — https://en.wikipedia.org/wiki/Three.js
- The Complete Guide to Three.js Post-Processing in 2026 — https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026
- React Three Fiber vs Three.js (2026) — https://www.creativedevjobs.com/blog/react-three-fiber-vs-threejs
- Three.js vs R3F vs Babylon.js 2026 (PkgPulse) — https://www.pkgpulse.com/guides/threejs-vs-react-three-fiber-vs-babylonjs-3d-webgl-2026
- react-three-fiber (GitHub) — https://github.com/pmndrs/react-three-fiber

**Babylon.js**
- Announcing Babylon.js 9.0 (Windows Developer Blog, Mar 2026) — https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/
- Announcing Babylon.js 8.0 (Windows Developer Blog, Mar 2025) — https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/
- Babylon.js WebGPU Support (docs) — https://doc.babylonjs.com/setup/support/webGPU
- Babylon.js (Wikipedia) — https://en.wikipedia.org/wiki/Babylon.js

**PlayCanvas**
- PlayCanvas — Open Source WebGL & WebGPU Game Engine — https://playcanvas.com/
- Clustered Lighting (PlayCanvas docs) — https://developer.playcanvas.com/user-manual/graphics/lighting/clustered-lighting/
- Initial WebGPU support in PlayCanvas Engine 1.62 — https://blog.playcanvas.com/initial-webgpu-support-lands-in-playcanvas-engine-1-62/
- PlayCanvas vs Babylon.js (Slant, 2026) — https://www.slant.co/versus/5149/11077/~playcanvas_vs_babylon-js

**WebGPU status & performance**
- WebGPU is now supported in major browsers (web.dev) — https://web.dev/blog/webgpu-supported-major-browsers
- Overview of WebGPU (Chrome for Developers) — https://developer.chrome.com/docs/web-platform/webgpu/overview
- WebGPU Implementation Status (gpuweb wiki) — https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- WebGPU is now supported by all major browsers (VideoCardz) — https://videocardz.com/newz/webgpu-is-now-supported-by-all-major-browsers
- WebGPU 2026: 70% Browser Support, 15x Performance Gains (byteiota) — https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/
- WebGL vs WebGPU: The Performance Gap (Medium) — https://gjgalante.medium.com/webgl-vs-webgpu-the-performance-gap-fbd121fb221a
- WebGPU transforms web 3D (RAVE.SPACE) — https://ravespace.io/blog/webgpu-in-three-js

**Unreal / Unity to web**
- Pixel Streaming vs WebGL vs WebGPU (Vagon) — https://vagon.io/blog/pixel-streaming-vs-webgl-vs-webgpu-the-best-solution-for-unreal-engine-web-deployment
- Pixel Streaming in 2026 (StraySpark) — https://www.strayspark.studio/blog/pixel-streaming-ue5-cloud-gaming-demo
- UE5 Stream Tuning Guide (Epic) — https://dev.epicgames.com/documentation/unreal-engine/stream-tuning-guide
- How to profile and optimize a Unity web build — https://unity.com/how-to/profile-optimize-web-build
- Unity Manual — Web performance considerations — https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-performance.html
- WebGPU and the Return of Browser-Based Indie Games in 2026 (StraySpark) — https://www.strayspark.studio/blog/webgpu-browser-indie-games-2026

**Realism techniques (PBR/IBL/shadows/post)**
- Mastering PBR and IBL in Three.js (Medium) — https://medium.com/@althafkhanbecse/elevating-realism-mastering-physically-based-rendering-pbr-and-image-based-lighting-ibl-in-e17c287aa9e1
- Three.js HDR environment mapping example — https://threejs.org/examples/webgl_materials_envmaps_hdr.html
- FastHDR environment maps (Needle) — https://cloud.needle.tools/articles/fasthdr-environment-maps
- CSM (Three.js docs) — https://threejs.org/docs/pages/CSM.html
- Three.js CSM example — https://threejs.org/examples/webgl_shadowmap_csm.html
- CSM on WebGPU (Three.js forum) — https://discourse.threejs.org/t/cascaded-shadow-maps-csm-on-webgpu/84235
- GTAO post-processing example (Three.js) — https://threejs.org/examples/webgl_postprocessing_material_ao.html
- TAA/SSAA post-processing example (Three.js) — https://threejs.org/examples/webgl_postprocessing_taa.html

**Performance budgets, assets & profiling**
- 100 Three.js Tips That Actually Improve Performance (2026) — https://www.utsubo.com/blog/threejs-best-practices-100-tips
- Building Efficient Three.js Scenes (Codrops) — https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/
- Performance tips (Three.js Journey) — https://threejs-journey.com/lessons/performance-tips
- Polygon Count for 3D Game Assets (Neural4D) — https://blog.neural4d.com/user-guide/polygon-count-for-3d-game-assets-printing-and-webar/
- What Is a Draw Call (game-developers.org) — https://www.game-developers.org/what-is-a-draw-call-in-games-the-complete-developers-guide-to-rendering-performance
- Khronos KTX 2.0 textures for glTF — https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets
- glTF-Transform — https://gltf-transform.dev/
- Khronos glTF-Compressor — https://github.com/khronosgroup/gltf-compressor
- Optimizing 3D Models with Draco (Axel Cuevas) — https://www.axl-devhub.me/en/blog/optimizing-3d-models
- The Basics of 3D in the Browser (VIVERSE docs) — https://docs.viverse.com/optimization/the-basics-of-3d-in-the-browser
- Spector.js (Chrome Web Store) — https://chromewebstore.google.com/detail/spectorjs/denbgaamihkadbghdceggmchnflmhpmk
- WebAssembly 2GB OOM on iOS Safari (Godot issue) — https://github.com/godotengine/godot/issues/70621
- Memory in Unity Web (manual) — https://docs.unity3d.com/Manual/webgl-memory.html
