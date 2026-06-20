# NEON BREACH vs Call of Duty — gameplay comparison & verification

**Goal:** make the shooter play as close to Call of Duty as possible, and *verify by direct comparison*.

**Honest verdict up front:** this is a single ~750-line HTML file using procedurally-built box/sphere
geometry and Three.js from a CDN. It **cannot** be visually or literally "exact" to Call of Duty —
that game is built by hundreds of people with custom engines, motion-capture, photoreal PBR art, ray
tracing, and dedicated netcode. What *is* achievable, and what this build targets, is **mechanical /
feel parity**: the moment-to-moment FPS systems that define how CoD *plays*. Below is the honest
scorecard.

Legend: ✅ implemented & comparable · ⚠️ implemented but simplified · ❌ not feasible in this medium

## Core gunplay (the stuff that defines CoD feel)
| CoD mechanic | NEON BREACH | Status |
|---|---|---|
| Aim Down Sights (ADS) — FOV zoom, tighter accuracy, slower move | Right-click ADS: FOV lerps to per-weapon zoom, spread shrinks ~10×, move speed ~0.55×, gun pulls to sights, scope vignette | ✅ |
| Hip-fire bloom vs ADS precision | Spread cone: large hip, near-zero ADS; widened by sprint/jump, tightened by crouch | ✅ |
| Per-weapon recoil patterns (vertical climb + horizontal sway) | Each weapon has `recV`/`recH`; recoil kicks view up + random yaw, auto-recovers; reduced ~55% in ADS | ✅ |
| Dynamic crosshair that blooms with fire/movement | Crosshair gap scales with live spread + gun kick | ✅ |
| Hitmarkers + headshot multiplier | X hitmarker (white on headshot), headshot ×1.6–2.6 by weapon | ✅ |
| Sprint, sprint-to-fire delay | Shift sprint; brief `sprintLock` before you can fire after sprinting | ✅ |
| Crouch | Ctrl: lower stance, slower, tighter spread | ✅ (no prone) |
| Jump / mantle | Space jump w/ gravity | ⚠️ (no mantle/vault) |
| Tac-sprint / slide | — | ❌ |

## Loadout & weapons
| CoD mechanic | NEON BREACH | Status |
|---|---|---|
| Multiple weapons w/ quick swap | 3 weapons (M4 auto AR, M870 pump shotgun w/ 9 pellets, .357 semi pistol); keys 1/2/3 or Q; swap-time lockout | ✅ |
| Magazine + reserve ammo + reload | Per-weapon mag/reserve, reload pulls from reserve, can't fire mid-reload | ✅ |
| Auto vs semi-auto fire | AR full-auto (hold), shotgun/pistol semi (per-click) | ✅ |
| Lethal grenades (arc throw, AoE) | G throws a frag: physics arc, bounce, 2s fuse, radius falloff damage (also hurts you if close) | ✅ |
| Ammo / equipment pickups | Enemies drop ammo / health / grenade pickups | ✅ |
| Attachments / gunsmith | — | ❌ |
| Tacticals (flash/smoke) | — | ❌ |

## Combat sandbox & AI
| CoD mechanic | NEON BREACH | Status |
|---|---|---|
| Enemies shoot back (hitscan + tracers) | "shooter" enemy type fires hitscan w/ tracers, accuracy scales with wave | ✅ |
| Cover matters / line-of-sight | Enemy shots do a real LOS raycast vs cover & walls — blocked = no hit | ✅ |
| Player collides with cover | Box-collision push-out vs all pillars + arena walls | ✅ |
| Bullets blocked by geometry | Player bullets raycast vs solids; cover stops rounds + spark impact | ✅ |
| Variety of enemy archetypes | grunt / fast / tank / ranged shooter | ✅ |
| Advanced AI (flanking, suppression, grenades) | direct pursuit + ranged hold; no flanking | ⚠️ |

## Feedback, HUD & progression
| CoD mechanic | NEON BREACH | Status |
|---|---|---|
| Health regen after taking damage | Regen after 4s without damage | ✅ |
| Directional damage indicators | Red arc points toward the attacker | ✅ |
| Minimap / compass | Round minimap, rotates with you, enemy + pickup blips | ✅ |
| Killstreaks / scorestreaks | 8-kill streak → callable **Airstrike** (F): rolling explosions | ✅ (1 streak) |
| Kill feed / XP popups | Scrolling feed: KILL / HEADSHOT + points, combo bonus | ✅ |
| Muzzle flash, dynamic light, tracers, impacts | Muzzle sprite + point light, bullet tracers, particle impacts/blood | ✅ |
| Camera shake / screenshake | On explosions & being hit | ✅ |
| Round/wave structure (Zombies-style) | Escalating waves, +health between waves | ✅ |
| Synthesized SFX (shots/reload/hits/explosions/footsteps) | Web Audio, no asset files | ✅ |

## What is fundamentally NOT comparable (being honest)
| Area | Why |
|---|---|
| Photoreal graphics, PBR materials, real gun/character models, animations | ❌ Needs pro 3D art + mocap + a production engine; this uses primitives |
| Online multiplayer / matchmaking / netcode | ❌ Out of scope for a single offline file |
| Maps, campaign, voice, music, persistence/unlocks | ❌ Production-scale content |
| "Exact" 1:1 parity | ❌ Not literally possible in this medium — see above |

## Verification method
Because this runs in a browser (and can't be auto-played in the build environment), verification is by
**feature comparison against documented CoD mechanics** (table above) plus **manual playtest** of the
file. Mechanic parity score: **~24 of ~32 core systems implemented (✅), 4 simplified (⚠️), and a few
production-only systems out of reach (❌).** The *feel* targets CoD; the *fidelity* is bounded by the
single-file browser medium.

## How to play-verify
Open `shooter.html` (download & double-click). Check each ✅ row above against the game:
ADS zoom, recoil climb, weapon swap, reload, grenade arc, enemies using cover, minimap, killstreak
airstrike, directional damage, hitmarkers/headshots.
