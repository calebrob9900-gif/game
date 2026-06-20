# NEON BREACH — Competitor Comparison & Scorecard

> The objective "compare to headline shooters" instrument. Rubric + reference anchors from
> `research/01`. Re-score at each phase exit; record dated rows in §3. Scores require evidence
> (passing acceptance tests, perf numbers, captured clips) and a `reviewer` sanity check
> (`VERIFICATION.md §6`).

## 1. Reference anchors (what we measure against)

| Title | Stack | Why it's a benchmark |
|---|---|---|
| Call of Duty (MW/BO) | native AAA | Gunplay feel + juice gold standard; fast accessible TTK (~148–249 ms) |
| Valorant | native | Precision gunplay, first-shot accuracy, low input-to-photon latency, hit-reg |
| CS2 | native | Spray patterns/recoil mastery, counter-strafe, penetration |
| Apex Legends | native | Movement + longer TTK (shield stacks), audio |
| DOOM Eternal | native | PvE "push-forward" combat pacing |
| CoD MP (S&D/TDM/Dom) | native | Our exact modes — bot-match feel, spawns, objectives, round flow |
| **Krunker / Shell Shockers** | **web** | The current **best-web-FPS** ceiling (our nearest real competitors) |

**AAA bar = 5.0**, **Best Web FPS ≈ 3.7** (weighted total). Visual fidelity (criterion 7) is
scored vs the *web* ceiling — Krunker/WebGPU — not vs native, per the honest-ceiling policy.

## 2. Scoring template (1–5 per criterion; weighted to /5.00)

| # | Criterion | Weight | AAA (ref) | Best Web (ref) | **Ours (current)** | Evidence |
|---|---|---|---|---|---|---|
| 1 | Gunplay feel | 0.18 | 5 | 3.8 | _TBD_ | recoil/ADS/TTK match `research/03`; replay tests |
| 2 | Movement model | 0.14 | 5 | 3.7 | _TBD_ | accel/friction/slide/mantle params; E2E |
| 3 | Feedback / juice | 0.12 | 5 | 3.6 | _TBD_ | hitmarker/shake/hitstop/tracers/decals |
| 4 | Audio | 0.12 | 5 | 3.3 | _TBD_ | spatial HRTF, layered weapons, mix |
| 5 | Performance | 0.12 | 5 | 4.0 | _TBD_ | p95 frame ≤16.6ms; perf-budgets green |
| 6 | Enemy AI | 0.10 | 5 | 3.0 | _TBD_ | BT+nav+perception+cover+flank; AI replay |
| 7 | Visual fidelity (art dir) | 0.10 | 5 | 3.7 | _TBD_ | WebGPU PBR+post; scored vs web ceiling |
| 8 | Content & variety | 0.06 | 5 | 3.5 | _TBD_ | ≥5 weapons, ≥4 enemies, ≥3 maps |
| 9 | Polish & UX | 0.06 | 5 | 3.6 | _TBD_ | menus/settings/keybinds/accessibility |
| | **Weighted total** | 1.00 | **5.00** | **≈3.66** | **_TBD_** | |

**v1 ship target:** weighted total **> 3.7**, feel pillars (1–4) each **≥ 4.0**, none < 3.0.

Weighted total = Σ(score_i × weight_i). Fill "Ours" only with evidence; never raise a score
without a passing test / measurement / captured artifact.

## 3. Phase-exit score log (append-only)

| Date | Phase | Weighted total | Notes / biggest gaps |
|---|---|---|---|
| _e.g. 2026-07-01_ | P1 exit | _x.xx_ | _gunplay strong; AI/content pending_ |

(Builder appends a row at each phase exit with the justified score and links to evidence.)

## 4. Open-source / web FPS to study (don't reinvent)
- `mohsenheydari/three-fps` (three.js: physics + AI pathfinding + animation — modern web ceiling)
- `cfoust/sour` (Sauerbraten via WASM), Qwasm (Quake in-browser), `simple-3d-fps` (Babylon)
- Krunker, Shell Shockers (Babylon.js), Mini Royale (Unity WebGL) — commercial web FPS to benchmark feel/perf against.
