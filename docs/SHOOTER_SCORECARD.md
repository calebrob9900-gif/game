# shooter.html — quantified comparison vs Call of Duty (verification by comparison)

> The "verify by comparing" deliverable, made objective. Applies the 9-criterion weighted rubric
> from `docs/COMPETITORS.md` (derived from `research/01`) to the **current single-file prototype
> `shooter.html`**, scored 1–5 against two anchors: **AAA (CoD) = 5.0** and **best web FPS
> (≈Krunker) ≈ 3.7**. Scores are deliberately conservative and evidence-based; this is the
> prototype, not the planned NEON BREACH build.

## Scorecard

| # | Criterion | Weight | AAA | Best-web | **shooter.html** | Evidence / gap |
|---|---|---|---|---|---|---|
| 1 | Gunplay feel | 0.18 | 5 | 3.8 | **3.0** | Has ADS, visual recoil kick, hipfire/ADS spread, headshots, reload, weapon swap. Missing: fixed per-weapon recoil *patterns*, first-shot-accuracy model, projectile ballistics (`research/03`) |
| 2 | Movement | 0.14 | 5 | 3.7 | **2.5** | WASD + sprint + crouch + jump + cover collision. Missing: accel/friction tuning, slide, mantle, counter-strafe |
| 3 | Feedback / juice | 0.12 | 5 | 3.6 | **3.5** | Hitmarkers, screenshake, muzzle flash, tracers, particles, bloom, kill feed, directional damage — strong for the medium |
| 4 | Audio | 0.12 | 5 | 3.3 | **2.5** | Synthesized SFX only; minimal spatialization. Missing: layered weapons, HRTF spatial, footstep surfaces, mix/ducking (`research/06`) |
| 5 | Performance | 0.12 | 5 | 4.0 | **3.8** | Lightweight single file, ~60fps; no budget instrumentation/LOD/instancing |
| 6 | Enemy AI | 0.10 | 5 | 3.0 | **2.5** | Chase + ranged-with-LOS-cover. Missing: navmesh, perception states, flanking, squad (`research/04`) |
| 7 | Visual fidelity (vs web ceiling) | 0.10 | 5 | 3.7 | **2.5** | Box art + bloom + gradient sky + one GLTF enemy. Below Krunker polish; no PBR/IBL/post stack (`research/02`) |
| 8 | Content & variety | 0.06 | 5 | 3.5 | **2.5** | 3 weapons, ~4 enemy types, 1 arena, wave loop |
| 9 | Polish & UX | 0.06 | 5 | 3.6 | **2.5** | HUD, minimap, start/death screens; no settings/keybinds/accessibility |

## Result (weighted total = Σ score×weight)
- **AAA (CoD): 5.00**
- **Best web FPS (≈Krunker): ≈3.66**
- **shooter.html: ≈2.87 / 5.00**

Computation: 0.54 + 0.35 + 0.42 + 0.30 + 0.456 + 0.25 + 0.25 + 0.15 + 0.15 = **2.866**.

## Interpretation (the honest "how close to CoD" answer)
- The prototype sits at **~57% of the AAA bar** and **~78% of the best-web-FPS bar** on this
  feel-weighted rubric.
- Its relative strengths are **juice (3.5)** and **performance (3.8)** — the categories the web can
  win. Its biggest gaps vs CoD are **movement, audio, AI, and fidelity**.
- **"Exact" is not reachable** for a single self-contained file: even a perfect single file caps
  out near the best-web anchor (~3.7), not the AAA 5.0 — the remaining gap is photoreal PBR art,
  mocap animation, and netcode, which require the planned real build (`docs/MASTER_PLAN.md`), not
  a single HTML file. This is the quantified version of the conclusion in `COD_COMPARISON.md`.

## How to raise the score (maps to the plan)
Each gap maps to phases in `docs/TASKS.md`: gunplay→P1 (`research/03`), movement→P1, audio→P1/P3
(`research/06`), AI→P2 (`research/04`), fidelity→P3 (`research/02`), content→P3, polish→P3/P4.
Re-score after each phase exit in `docs/COMPETITORS.md §3`. v1 target: **> 3.7 overall, feel
pillars ≥ 4.0** — i.e., beat the best web FPS and approach AAA on feel, which is the achievable
interpretation of "as realistic as the headline shooters."
