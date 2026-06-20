# NEON BREACH — Game Design Spec (locked v1 vision)

> The authoritative description of the game we are building, captured from the design Q&A.
> `MASTER_PLAN.md` (tech/roadmap), `TASKS.md` (backlog), and `VERIFICATION.md` (quality) all
> serve this spec. Where this spec and an older doc disagree, **this spec wins**.

## 1. Elevator pitch
A fast, arcade-feel **competitive shooter** with **Call-of-Duty gunplay** in **GTA-flavored urban
maps**, playable in **first- or third-person**, across multiple PvP **game modes** — fought
against **smart bots** that play like real opponents, and **architected so real online multiplayer
can be added later**. Free/CC0 assets. Built and **verified** to a finished v1.

## 2. Locked decisions (from the design Q&A)
| Question | Decision |
|---|---|
| Opponents | **Human enemies (bots) that play the modes like real players**; team-based. Online vs real people is a **later phase** (architected for, not built in v1). |
| Setting / look | **Modern urban, GTA-flavored** city districts (streets, buildings, lots) + **CoD-style gunplay**. Realistic-leaning, stylized via CC0. |
| Camera | **First- and third-person, switchable** (FP primary; TP requires a full animated player body). |
| Feel / pacing | **Arcade-fast (CoD MP)** — fast TTK, highly responsive. |
| Movement | **Full arcade kit:** sprint, tactical sprint, **slide**, **vault/mantle**, crouch, jump (+ sprint-to-fire delay). |
| GTA element | **Urban setting + tone AND drivable vehicles inside maps** (drive + shoot). **NOT** open-world/free-roam (explicitly out of scope). |
| Modes (v1) | **Free-for-all, Team Deathmatch, Domination/Hardpoint, Search & Destroy.** Build order: FFA → TDM → Domination → S&D. |
| Loadouts | **Preset class loadouts** (pick on spawn) for v1; **full create-a-class + XP/unlocks deferred** to a later phase. |
| Scope | **Go big** — large weapon/map/vehicle roster + all modes — **and verified done** (the full thing, proven complete via `verify.sh` + rubric). |
| Assets | **Free / CC0 only** (Kenney/Quaternius/KayKit, Poly Haven/ambientCG, Mixamo). No paid/AI-gen in v1. |

## 3. Core gameplay
- **Perspective:** seamless FP↔TP toggle. FP viewmodel arms+weapon; TP a full Mixamo-animated
  character (locomotion blend, aim/strafe, weapon poses). Hitboxes identical in both.
- **Movement:** accel/friction ground control, sprint + tac-sprint (with sprint-to-fire delay),
  slide (momentum), vault/mantle (auto over ~1–1.3 m), crouch, jump. Per-weapon move multipliers.
- **Gunplay (CoD feel, from `research/03`):** two-layer recoil (fixed pattern + recovering visual
  kick), first-shot accuracy + movement/stance bloom, ADS with correct sens scaling, hitscan
  (projectile for snipers/launchers), headshot/limb multipliers, fast readable TTK, reload, swap.
- **Loadouts:** several **preset classes** (e.g., Assault/SMG/Sniper/Shotgun/LMG) chosen at spawn;
  each = primary + secondary + lethal/tactical + perk slot (perks simple in v1). Unlock/XP later.
- **Vehicles:** drivable cars/bikes spawned in maps; enter/exit; drive + shoot (driver/passenger);
  vehicle health + destruction; used for rotations and map control. Not required to win.

## 4. Game modes (v1)
All playable **vs bots** with team management, spawning, scoring, and win conditions.
- **Free-for-all (FFA):** everyone vs everyone; first to kill target / highest at time limit. (First mode built — simplest.)
- **Team Deathmatch (TDM):** two teams race to a kill target.
- **Domination / Hardpoint:** capture & hold objective point(s) for score over time.
- **Search & Destroy (S&D):** round-based, **no respawns**; attackers plant a bomb at a site,
  defenders prevent/defuse; first to N rounds. The most tactical mode (built last).
- **Bots** must understand each mode's objective (chase kills / push or hold points / plant or
  defuse / play the round), use cover, flank, rotate (incl. vehicles), with fair, scalable
  difficulty (reaction time + converging aim, never aimbot) — see `research/04`.

## 5. Maps
- Multiple **urban arenas** (street blocks, interiors, rooftops, parking lots) with **3-lane-style
  flow + flank routes + verticality + vehicle lanes** (`research/11`). Data-driven `*.level.json`
  (bounds, cover, spawns per team/mode, objective/bombsite/hardpoint markers, vehicle spawns).
- Built from **CC0 modular kits** (Kenney/Quaternius/KayKit) greybox → art pass (`research/13/14`).

## 6. Presentation
- **Rendering:** Three.js WebGPU (WebGL2 fallback), PBR + HDRI IBL + CSM shadows + post stack
  (bloom/GTAO/TAA/tonemap/LUT), GPU particles, instancing/LOD (`research/02`). Honest ceiling:
  console-quality stylized realism, not native-AAA photoreal.
- **Audio:** spatial (Howler + Web Audio), layered weapons, footsteps, vehicles, callouts,
  ambience, dynamic music, mix/ducking (`research/06`).
- **UI:** main menu + mode select + class select + settings (sensitivity/graphics/audio/keybinds,
  FP/TP toggle), in-match HUD per mode (objective, scores, timer), scoreboard, killfeed,
  hitmarkers, minimap.

## 7. Definition of "done" (v1)
All four modes are playable and fun **vs bots**, in **first and third person**, with **vehicles**,
**preset loadouts**, and the **full movement kit**, across **multiple urban maps**, AND:
`scripts/verify.sh` green (V1–V5), perf budgets met, and `COMPETITORS.md` weighted total **> 3.7**
with feel pillars (gunplay/movement/juice/audio) each **≥ 4.0**. (See `GOAL.md`.)

## 8. Explicitly deferred / out of scope for v1
- **Real online multiplayer** (servers, netcode, matchmaking, anti-cheat) — a defined later phase;
  v1 architecture (deterministic sim + command model + `Transport` interface) makes it additive,
  not a rewrite (`research/08`).
- **Full create-a-class + XP/unlock progression** — later phase (preset loadouts in v1).
- **Open-world free-roam / missions** — out of scope (arena/objective maps only).
- **Paid or AI-generated assets** — CC0 only in v1.

## 9. Honest scope note
This is a large build (FP+TP, four modes, bot AI, vehicles, big content). It is sequenced so a
**playable competitive game vs bots exists by end of Phase 3**, then expands (TP, vehicles,
content, polish). "Go big + verified done" means we don't stop until the v1 definition (§7) is met
and proven — across many committed, verified tasks (`TASKS.md`), likely over days of agentic build.
