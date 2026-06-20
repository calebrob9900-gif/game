# 13 — Modular Level Design, Kit-Bashing & Free CC0 Modular Kits

> Companion to `11-level-design.md` and `05-assets.md`. Practical sourcing note:
> most authoritative sites (kenney.nl, polyhaven, ambientcg, syntystore, WoLD, 80.lv,
> leveldesignbook) are behind Cloudflare and 403'd the fetcher; findings come from
> cross-corroborated search indexing. URLs cited for in-browser verification.

## 1. Modular level-design principles
A **modular kit** = interchangeable, reusable, grid-snapping building components (walls, floors, corners, doorways, stairs, props) that recombine into many levels. Core principles: reusability, interchangeability, independent creation, performance, grid snapping.
- Why it matters for a **web** FPS: reuse → fast iteration; shared mesh+material → GPU caching + **instancing → far fewer draw calls** (critical for browser budgets); standardized sizes + shared trim/texel density → visual coherence.
- Refs: gamedesignskills.com/game-design/modular-level-design/ · worldofleveldesign.com (modular-environment-design-101) · gamedeveloper.com (Skyrim modular approach; "creating modular game art for fast level design") · beyondextent.com (balancing modularity & uniqueness).

### Grid snapping & sizes
- Historical **power-of-two** grid (16/32/64/128/256/512) so a 256-unit wall subdivides cleanly and mirrors PoT texture sizes.
- **Modern metric:** Unreal 100uu = 1 m; build set pieces at 1/2/4 m, snap 100 → 50 (0.5 m) → 10 (0.1 m).
- **Recommended for a metric web engine (Three.js, 1 unit = 1 m):** primary snap **1 m**, sub **0.5 m**, fine **0.25 m**. Walls at whole-meter widths (1/2/4 m), interior height ~3 m, doorways at sub-multiples.
- Grid alignment + pivots-on-grid eliminate seams, Z-fighting, light leaks. Refs: leveldesignbook.com/process/blockout/metrics · polycount UE4 modular breakdowns · strayspark.studio modular-kit-snapping-ue5-comparison-2026.

### Trim sheets & tiling textures
- **Trim sheet** = one atlas of reusable surface-detail strips; tiles along one axis; many meshes UV-map onto its rows. → one material textures the whole kit (huge texture-memory + draw-call savings) and adds detail without geometry (keeps tri counts low). Pair with seamless **tiling textures** for large flat surfaces.
- Refs: beyondextent.com/deep-dives/trimsheets · wiki.frozenbyte.com (tile textures & trimsheets) · 80.lv articles.

### Pivots & texel density
- Pivot at the **bottom grid corner** (commonly bottom-left) so pieces sit exactly on a grid cell and corners are 90° to neighbors. (UE: "Align → Move Actor to Grid".)
- **Uniform texel density** (texels per meter) across the whole kit so reused pieces look like they belong; pick a target px/m and author every mesh + texture to it. Refs: rebusfarm texel-density basics · polycount texel-density threads.

## 2. Free CC0 / permissive modular kits (commercial-safe)
- **Kenney.nl — CC0** (best starting point): glTF/OBJ/FBX, low-poly, consistent. Kits: Modular Buildings, **Modular Space Kit** (sci-fi corridors), Building Kit, City Kit (Industrial/Suburban), Tower Defense Kit (160+), **Mini Dungeon** (animated), **Prototype Kit + Prototype Textures** (greybox/checker — verify texel density), Blocky Characters. No attribution required.
- **Quaternius — CC0**: FBX/OBJ/glTF/.blend. **Modular Sci-Fi MegaKit** (great for FPS), Ultimate Modular Men/Women (modular characters), Ultimate Spaceships. (Some packs partly behind optional paid tier; released portions CC0.)
- **KayKit (Kay Lousberg) — CC0**: FBX/OBJ/DAE/glTF, cross-compatible packs. Dungeon Pack (Remastered), Platformer Pack, Adventurers/Skeletons characters. (Some "Mystery Monthly" packs paid.)
- **Poly Haven — CC0**: 1,700+ HDRIs + tiling PBR materials + scanned models (your IBL + texture source; downscale to 512/1K for web).
- **ambientCG — CC0**: 2,000+ PBR materials/HDRIs (tiling floors/walls + trim-sheet source material).
- **Sketchfab — mixed**: only with the **CC0 license filter** (vet topology/poly count; downloads as glTF).
- **itch.io — filter to CC0** (low-poly/3D); curated master list: github.com/madjin/awesome-cc0.

### NOT free (paid, proprietary EULA) — Synty POLYGON
High-quality cohesive low-poly, **paid, proprietary "One Time Purchase Licence" — NOT CC0.** Allowed: use purchased packs in your commercial games perpetually. **Prohibited:** reselling/redistributing assets, sharing outside your team (per-seat), NFTs/blockchain/metaverse UGC, AI-training datasets. Free "Starter Pack" is still under the EULA. Refs: syntystore.com/pages/licences-overview.

## Recommendation for NEON BREACH
- **Geometry:** greybox with Kenney **Prototype Kit + Prototype Textures**; build first arenas from Kenney **Modular Space Kit** / **Mini Dungeon** and/or Quaternius **Modular Sci-Fi MegaKit** and **KayKit Dungeon** — all CC0, glTF/GLB, low-poly.
- **Surfaces:** ambientCG / Poly Haven CC0 tiling materials; author **one trim sheet**; keep the kit on **one shared material** to minimize draw calls + VRAM.
- **Grid:** 1 m primary / 0.5 m / 0.25 m sub-snaps; pivots on bottom grid corner; uniform texel density.
- **Licensing discipline:** maintain a per-asset license ledger (see `05-assets.md`); CC0 needs no attribution but track CC-BY; never ship NonCommercial; Synty only if purchased + EULA respected.
