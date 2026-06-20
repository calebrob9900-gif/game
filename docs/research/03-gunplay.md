# 03 — Gunplay & Game Feel Spec

**Status:** Research-backed implementation spec
**Date:** 2026-06-20
**Scope:** Browser FPS (Three.js / WebGL today, WebGPU later). Single-player now, MP-aware.
**Goal:** "Headline-shooter feel" — CoD/Valorant/CS2-caliber gunplay that is web-feasible.

This document is written so an engineer can implement directly. Every system has
recommended parameter ranges with **actual numbers**, a recommended default, and the
reasoning + sources behind it. Numbers are starting points; the last section is a tuning
methodology because *feel is found by iteration, not by spec*.

> **Unit conventions used throughout.** Angles in **degrees**. Time in **seconds** unless
> a value is suffixed `ms`. Distances in **meters** (assume 1 world unit = 1 m). Mouse
> deltas are raw pixels scaled to degrees. Where a real game's native units matter (CS2
> "Hammer units": 1 unit ≈ 0.019 m) it is called out explicitly.

---

## 0. Design pillars (decide these first, everything flows from them)

The three reference games are *deliberately different*, and you cannot blend them blindly —
each is internally consistent. Pick a lane per pillar:

| Pillar | CS2 | Valorant | Call of Duty (MW/BO) | **Our recommendation** |
|---|---|---|---|---|
| Recoil | Fixed learnable pattern + small random spread | Deterministic head + pseudo-random tail | Pattern + bloom + heavy *visual* kick, controller-friendly | **Fixed pattern, light spread** (skill-expressive, learnable, fair on M+KB) |
| First-shot | Pinpoint when still | Small first-shot error (Vandal 0.25) | Bloom-based | **Pinpoint when still** (rewards stopping) |
| Movement penalty | Severe (must stop to shoot) | Severe | Moderate | **Moderate-severe** (stopping rewarded, not mandatory) |
| TTK | Very low (~0.2–0.4s rifle) | Very low | Low-moderate (~0.3–0.8s) | **Moderate** (~0.35–0.7s) — readable, less punishing online |
| Movement tech | Counter-strafe | Counter-strafe | Slide/sprint/mantle/omni | **Slide + sprint + mantle**, no bunnyhop accel |

**Why moderate TTK:** lower TTK rewards first-shot/positioning, higher TTK rewards tracking
and gives reaction time; for a browser game with imperfect netcode later, a *moderate* TTK
is more forgiving of latency and reads better to new players. (Sources: [MitchCactus TTK](https://mitchcactus.co/blog/call-of-duty/bo7-time-to-kill-analysis/), [TTK meaning](https://www.gameslearningsociety.org/wiki/what-is-the-meaning-of-ttk/))

---

## 1. Recoil systems

### 1.1 The model: two independent components

Every reference shooter separates **two things that designers conflate at their peril**:

1. **Aim recoil (kick)** — the gun's *actual* point-of-aim moves. This changes where bullets
   go. In CS2/Valorant this follows a per-weapon **pattern**.
2. **Visual recoil (gun kick / camera punch)** — the *camera and viewmodel* shake/punch for
   feel, but recover to the true aim. Does **not** (or only partly) affect bullet direction.

CoD leans heavily on visual recoil for "punch"; players complained it obscured targets, and
recent CoD patches *reduced visual recoil, idle sway, and gun kick* while keeping aim recoil
— proof that these are separable knobs. (Sources: [CoD Recoil wiki summary](https://callofduty.fandom.com/wiki/Recoil), [ONE Esports — reduce visual recoil](https://www.oneesports.gg/call-of-duty/reduce-visual-recoil-warzone-2/))

> **Decision:** Implement both as separate systems. Bullet direction uses **aim recoil +
> spread only**. Camera/viewmodel get an *additional* visual punch that recovers fully and
> contributes ~25–40% to perceived kick but ~0% (or a small fraction) to bullet direction.
> This gives "juice" without making the gun feel uncontrollable.

### 1.2 Aim recoil = per-weapon pattern (recommended over pure random)

CS2 uses a **fixed spray pattern** (AK climbs ~8 shots up, drifts left, compensates right —
*the path never changes*), plus a small random spread layered on top. This is learnable and
skill-expressive. Valorant uses a **hybrid**: first ~5–7 shots deterministic, then the tail
goes pseudo-random to *reward adaptation over pure memorization*. (Sources: [Refrag spray science (search summary)](https://refrag.gg/blog/spray-science-how-does-weapon-recoil-function-in-cs2/), [CS2 shooting mechanics](https://cs2guide.net/gameplay-mechanics/shooting-accuracy-spread/), [Valorant dev tracker — first-shot/RNG spray](https://devtrackers.gg/valorant/p/0642c4d6-why-is-there-rifle-first-shot-deviation-and-rng-spray-patterns-not-a-rant-thread), [Dignitas spraying vs tapping](https://dignitas.gg/articles/a-guide-to-gunplay-in-valorant-spraying-vs-tapping))

**Recommended: CS2-style fixed pattern + light random spread.** It is the most skill-expressive
and the fairest on mouse+keyboard (controller players need bloom/aim-assist crutches that
M+KB doesn't).

**Data structure** — per weapon, a recoil pattern is an array of 2D offsets in degrees,
indexed by shot number:

```js
// Example: AR pattern. Each entry = {pitch:+up, yaw:+right} kick applied to AIM for shot i.
// Mostly-vertical early, then horizontal "S" so it's controllable but distinctive.
recoilPattern: [
  {p: 0.0, y: 0.0},   // shot 1: first shot, no kick (fires before kick applied)
  {p: 0.45, y: 0.05},
  {p: 0.55, y: -0.10},
  {p: 0.60, y: -0.15},
  {p: 0.62, y: 0.10},
  {p: 0.62, y: 0.25},  // begins drifting right
  {p: 0.55, y: 0.30},
  {p: 0.50, y: 0.20},
  // ... index beyond array length => repeat last entry * randomTailMultiplier
],
recoilTailRandom: 0.35,  // after pattern ends, add ±this (deg) random per axis (Valorant-style tail)
```

**Tunable parameter ranges (per weapon class):**

| Param | Pistol (semi) | SMG | Assault Rifle | LMG | Sniper |
|---|---|---|---|---|---|
| Per-shot vertical kick (deg) | 0.6–1.0 | 0.25–0.45 | 0.40–0.65 | 0.5–0.8 | 2.5–5.0 |
| Per-shot horizontal kick (deg, ±) | 0.1–0.3 | 0.15–0.35 | 0.10–0.30 | 0.20–0.45 | 0.5–1.0 |
| Pattern length (deterministic shots) | n/a (semi) | 6–9 | 7–10 | 8–12 | n/a |
| Visual-kick multiplier on aim | apply ×0.25–0.40 to camera as recoverable punch | | | | |

### 1.3 Recoil recovery

After firing stops, the *aim* should recover toward the pre-spray point (CS2: spread resets to
standing value the moment you stop / come to rest). Two recovery behaviors to implement:

- **Visual/camera punch recovery:** fast, springy. Exponential return to zero with a critically-
  damped spring. **Recommended:** recover ~60–80% within **100–150 ms**, fully within ~250 ms.
- **Aim recoil recovery (the accumulated pattern offset):** This is the part that, in real CS,
  *you* compensate for by pulling down. For a more accessible browser game, add a **partial
  auto-recovery**: after `recoilRecoveryDelay` of not firing, lerp the accumulated aim offset
  back toward origin.

```
recoilRecoveryDelay   : 0.05–0.12 s   (grace before recovery starts; ~1–2 shots of fire gap)
recoilRecoverySpeed   : 6–14 (1/s exp rate)   // higher = snappier return
autoRecoverFraction   : 0.0 (pure CS, full skill) … 1.0 (full assist).  Recommend 0.5–0.7 for accessibility
```

> **Tip:** Expose `autoRecoverFraction` as a difficulty/accessibility setting. Competitive
> mode = 0–0.3; casual = 0.6–0.8.

### 1.4 Per-weapon recoil reductions (modifiers)

Recoil/spread is reduced by ADS, crouch, and (later) attachments. CoD recoil control and gun
kick are reduced by ADS and stance; idle sway shrinks with higher FOV. (Source: [CoD Recoil wiki summary](https://callofduty.fandom.com/wiki/Recoil))

| Condition | Aim recoil multiplier | Spread multiplier |
|---|---|---|
| Hipfire, standing | 1.0 | 1.0 |
| ADS, standing | 0.45–0.60 | ~0.05–0.10 (near-zero) |
| Crouch (adds to above) | ×0.80 | ×0.70 |
| Moving (adds) | ×1.15–1.4 | ×2–6 (see §2) |
| In-air / jumping (adds) | ×1.5–2.0 | ×5–10 |

---

## 2. Accuracy model (spread / bloom)

### 2.1 Two paradigms — pick "first-shot accuracy"

- **Bloom (CoD):** a spread cone that *grows* per shot and with movement; bullets land randomly
  in the cone. Forgiving, controller-friendly, less skill-expressive. (Source: [CoD Recoil wiki summary](https://callofduty.fandom.com/wiki/Recoil))
- **First-shot accuracy / inaccuracy (CS2/Valorant):** the **first bullet while standing still
  is pinpoint** (CS2) or nearly so (Valorant first-shot error: Vandal **0.25**, Phantom **0.20**);
  spread is added by *movement, jumping, and consecutive fire*, and resets when you stop. This
  rewards stopping/counter-strafing and tapping. (Sources: [CS2 shooting mechanics](https://cs2guide.net/gameplay-mechanics/shooting-accuracy-spread/), [Valorant data drop search summary](https://playvalorant.com/en-us/news/dev/valorant-data-drop-phantom-vs-vandal/), [zilliongamer Phantom stats](https://zilliongamer.com/valorant/c/weapon-guide/phantom-stats-guides-skins/))

> **Decision:** First-shot accuracy model. Total bullet deviation =
> `baseInaccuracy + movementInaccuracy + stanceInaccuracy + spreadFromConsecutiveFire`,
> all expressed as a **cone half-angle in degrees**, then a random point sampled in the cone.

### 2.2 Spread cone — composition and numbers

```
finalSpreadDeg = base + move + jump + recoilBloom    // then clamp to a max
sample: pick random angle in [0,2π), random radius r = maxR * sqrt(rand)  // uniform in disk
        rotate the bullet ray by (finalSpreadDeg * r) around a random in-plane axis
```

**Recommended cone half-angles (degrees) by state, AR example:**

| State | Hipfire | ADS |
|---|---|---|
| Standing still (first shot) | 1.5–3.0 | 0.0–0.15 |
| Walking | +1.0–2.0 | +0.10–0.30 |
| Sprinting | +3.0–6.0 (huge) | n/a (can't ADS-sprint) |
| Crouched still | hip ×0.6 | 0.0 |
| Jumping / airborne | +5.0–10.0 | +2.0–4.0 |
| Per consecutive shot (bloom add) | +0.10–0.25/shot, decays when not firing | +0.02–0.06/shot |
| Max spread clamp | 8–12 | 3–4 |

**Sprint-to-fire delay:** disallow firing for **100–250 ms** after sprint ends (CoD "sprint-out
time"), or apply max spread during that window. (Source: [CoD ADS/sprint search summary](https://hone.gg/blog/ads-in-call-of-duty/))

### 2.3 Crosshair must reflect the cone (this is the player's only feedback)

The dynamic crosshair gap should be a *direct visual mapping* of `finalSpreadDeg` (plus a
contribution from current visual kick). CS2/CoD do exactly this; it teaches the model without
a tutorial. Map gap pixels linearly from spread degrees with a small floor so the crosshair is
never fully closed except at true pinpoint.

```
gapPx = floor + k * finalSpreadDeg     // k ≈ 6–12 px/deg, floor ≈ 2–4 px
```

---

## 3. Aiming: ADS, FOV, sensitivity, mouse feel

### 3.1 ADS mechanics

- ADS lerps base FOV → weapon zoom FOV, tightens spread to ~near-zero (§1.4/§2.2), reduces aim
  recoil, and slows move speed. ADS-in time defines snappiness.
- **ADS-in time:** **150–300 ms** (pistol/SMG fast ~150–200, AR ~220–260, sniper ~350–450).
- **Move-speed penalty while ADS:** ×0.45–0.70 of base.
- Pull the **viewmodel** to the sight line during ADS (procedural lerp of weapon local pos/rot
  to an "aim socket"), and lower idle sway/bob (§6.7). (Source: [Karl Lewis — procedural ADS (search summary)](https://karllewisdesign.com/unreal-immersive-fps-part3/))

### 3.2 FOV and the zoom illusion

- **Base FOV:** make it a setting; default **90–103° horizontal**. Competitive players favor
  **100–110°**; higher FOV = more awareness but smaller targets, and *reduces perceived visual
  recoil and idle sway*. (Sources: [Aimlabs sensitivity guide](https://support.aimlabs.com/hc/en-us/articles/38493112353815-PC-Sensitivity-Guide), [CoD Recoil wiki summary](https://callofduty.fandom.com/wiki/Recoil))
- ADS FOV = base / magnification. 1.25× iron sights ≈ FOV×0.8; 4× scope ≈ FOV/4.
- **Critical pitfall:** if you naively lower FOV on ADS without scaling sensitivity, the player's
  mouse-to-onscreen-angular-speed changes and aim feels "heavy/floaty." Scale ADS sensitivity to
  preserve feel (§3.4).

### 3.3 Sensitivity & raw input (M+KB feel — get this right or nothing else matters)

- **Use raw mouse input. No OS/engine mouse acceleration. No mouse smoothing.** Pros universally
  demand 1:1 raw input; acceleration/smoothing destroy muscle memory. In the browser, use the
  **Pointer Lock API** and read `movementX/movementY`; do **not** low-pass/average them. (Source: [recharge — pro mouse settings (search summary)](https://www.recharge.com/blog/en-gb/mouse-sensitivity-converter-calculator-for-23-fps-games), [Aimlabs sensitivity guide](https://support.aimlabs.com/hc/en-us/articles/38493112353815-PC-Sensitivity-Guide))
- Express sensitivity so players can port muscle memory: support **DPI + in-game sens**, and show
  the derived **cm/360** and **eDPI**. Pros cluster at **400–800 DPI**, **~28–40 cm/360** in
  tactical shooters (some up to ~50). (Source: [recharge / sensitivity converter search summary](https://www.recharge.com/blog/en-gb/mouse-sensitivity-converter-calculator-for-23-fps-games))

```
yawDelta(deg)   = movementX * (sens * 0.022)   // 0.022 ≈ Source/CS yaw constant per count-ish; tune
pitchDelta(deg) = movementY * (sens * 0.022) * (invertY ? -1 : 1)
// cm/360 = (360 / (yawDeltaPerCount)) / (DPI / 2.54)
```

- Clamp pitch to ±89°. Apply yaw to player body, pitch to camera only.

### 3.4 ADS sensitivity scaling (the part everyone gets wrong)

When zoomed, scale sensitivity so on-screen feel is consistent. Three industry methods —
implement **Monitor-Distance / 0% ("MDH")** as the default, expose the others as options:

- **0% / Monitor Distance (Horizontal):** matches the speed of a target at the center; the most
  common "consistent feel" default. ADS multiplier ≈ `tan(adsFOV/2) / tan(baseFOV/2)`.
- **Coefficient / "ADS multiplier":** a flat scalar the player sets (e.g. **0.8–1.0**); CoD-style.
- **Focal-length / viewspeed:** scales by focal length; preferred by some scope users for high mag.

(Sources: [Kovaak sens-scaling (search summary)](https://www.kovaak.com/sens-scaling/), [Plutonium FOV vs FOV scale](https://forum.plutonium.pw/topic/11380/fov-vs-fov-scale-ads-accuracy-sens), [mouse-sensitivity.com ADS thread](https://www.mouse-sensitivity.com/forums/topic/7173-how-does-the-ads-value-work-in-the-process-of-zooming-in/))

```
adsSensMultiplier = tan(deg2rad(adsFOV/2)) / tan(deg2rad(baseFOV/2))   // 0% MDH default
effectiveSens_ADS = baseSens * adsSensMultiplier * userAdsCoefficient   // userAdsCoefficient default 1.0
```

### 3.5 Frame-rate independence

Recoil decay, spread decay, ADS lerp, sway, and bob must all be **dt-scaled** so feel is identical
at 60 vs 144 Hz. Use `value += (target - value) * (1 - exp(-rate*dt))` for exponential approaches
(frame-rate-correct), not `value = lerp(value, target, k)` with a fixed `k`.

---

## 4. Hit registration & hitboxes

### 4.1 Hitscan vs projectile

- **Hitscan** (instant ray): default for bullets. Instant, simplest, what CS2/Valorant/most CoD
  guns use; ideal for moderate ranges and low latency. (Source: [Hitscan — Wikipedia](https://en.wikipedia.org/wiki/Hitscan), [Boost2rank hitscan guide](https://boost2rank.co.uk/hit-scan/))
- **Projectile** (simulated travel + optional gravity/drop): for snipers, rockets, grenades, and
  any "skill-shot" weapon; rewards leading targets and adds depth. Apex and Halo use travel-time
  bullets. (Source: [Netcode series — projectiles](https://medium.com/@geretti/netcode-series-part-4-projectiles-96427ac53633))

> **Decision:** Hitscan for pistols/SMG/AR/LMG; projectile (with travel time, optional drop) for
> snipers, launchers, thrown equipment. Hybrid is industry-standard. (Source: [Quora hitreg vs projectiles](https://www.quora.com/In-video-games-what-is-the-difference-between-Hitreg-and-projectiles))

### 4.2 Hitboxes

- Use **simplified capsule/box hitboxes** attached to bones, not the render mesh (cheaper, fairer).
  Our existing prototype already drives gameplay with invisible box hitboxes over a GLTF model —
  keep that pattern.
- Hit *regions* with damage multipliers (see §5): head, chest/torso, stomach, arms, legs.
- Headbox should be generous-but-fair; align it tightly to the visible head so "looked like a
  headshot" desync is minimized. (Source: [The Science of Hit Registration](https://risxntweaks.com/blogs/blog-posts/the-science-of-hit-registration-why-your-shots-miss-in-fps-games))

### 4.3 Penetration / wallbang

CS2 model is a great template: each weapon has a **penetration power** (100% pistols/SMG/shotgun,
200% rifles/Deagle/Revolver), and each surface has a **material penetration value**; damage through
a wall = `damage × materialValue × (penPower/100)`, also reduced by thickness/distance traveled
through the material. Example: Deagle through brick = `43 × 0.2 × 2 = 17.2`. (Sources: [cs.money wallbangs](https://cs.money/blog/news/everything-you-need-to-know-about-wallbangs-in-cs2/), [Counter-Strike wiki bullet penetration](https://counterstrike.fandom.com/wiki/Bullet_Penetration))

```
penPower:   {pistol:1.0, smg:1.0, shotgun:1.0, rifle:2.0, deagle:2.0, sniper:2.5}
material:   {wood:0.5–0.8, drywall/thinMetal:0.4–0.7, concrete:0.1–0.3, metal:0.05–0.15}
maxPenetrations: 1–2 surfaces (raycast continues, accumulate thickness, stop when dmg≈0)
```

### 4.4 Networking notes (for future MP — design for it now)

- **Server-authoritative** hit detection. Clients predict; server validates. (Source: [SnapNet — lag comp in UE5](https://snapnet.dev/blog/performing-lag-compensation-in-unreal-engine-5/))
- **Lag compensation / backward reconciliation:** the server rewinds all players' hitboxes to the
  shooter's view-time (≈ `serverTime − shooterRTT/2 − interpDelay`) before testing the ray. This is
  how CS, Valorant, Overwatch, CoD make hitscan feel fair. Keep a ring buffer of recent hitbox
  transforms (last ~1s). (Sources: [Source Multiplayer Networking — Valve wiki](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking), [SnapNet lag comp](https://snapnet.dev/blog/performing-lag-compensation-in-unreal-engine-5/))
- **Tick/update rate:** CS2 runs **64 Hz** server but uses a **sub-tick** scheme that timestamps the
  exact moment of each input (fire/move) between ticks for precise resolution. Target a fixed sim
  tick (**30–64 Hz**) and timestamp inputs; interpolate remote entities with a small delay
  (~2 ticks, `cl_interp`-style). (Sources: [CS2 sub-tick (search summary)](https://xplay.gg/blog/cs2-tick-rate-subtick-system/), [G2A tick rate explainer](https://www.g2a.com/news/glossary/what-is-tick-rate-in-gaming-how-server-updates-affect-hit-registration-and-online-play/))
- **Client-side prediction + reconciliation** for the local player's movement and shots so input
  feels instant; reconcile against server state. Reference implementation: [minism/fps-netcode](https://github.com/minism/fps-netcode).
- Failure mode to watch: "shot that should've hit but didn't" from desync, bad hitbox alignment,
  packet loss, or tickrate. Budget for visual confirmation (hitmarker only on server-confirmed hit
  in MP). (Source: [The art of Hit Registration (search summary)](https://danieljimenezmorales.github.io/2023-10-29-the-art-of-hit-registration/))

---

## 5. Damage & TTK design

### 5.1 TTK math

`TTK = (shotsToKill − 1) / (fireRate_perSec)`  (time between first and killing shot).
`shotsToKill = ceil(targetHP / damagePerHit)` for the relevant body part and range bracket.

**Target TTKs (moderate, readable):**

| Class | Target TTK (optimal range, body) | Notes |
|---|---|---|
| Pistol | 0.5–0.9 s | Secondary; rewards headshots |
| SMG | 0.30–0.55 s | Fast, close-range king |
| Assault Rifle | 0.35–0.60 s | The all-rounder baseline |
| LMG | 0.45–0.75 s | High mag/sustain, slow handling |
| Shotgun | one-shot ≤ ~8 m, else fast multi | pellet model |
| Sniper | one-shot head/chest, slow handling | high risk/reward |

### 5.2 Reference numbers to anchor against

- **CS2 AK-47:** 36 body dmg, **4× headshot** (=144), 600 RPM, armor-pen 77.5%, tiny falloff
  (2% @ ~12.7 m). One-shot headshot through helmet at close range. (Sources: [csdb AK-47](https://csdb.gg/weapon/ak-47/), [cs2damage AK-47](https://cs2damage.com/weapon/ak-47/))
- **Valorant Vandal:** 40 body / **160 head** (always one-shot head), **no falloff**, ~9.75 rps.
  **Phantom:** 39 body / 156 head close, head drops to 140 beyond ~15 m (not always a one-shot at
  range); higher fire rate (~11 rps) and lower spread. The two are balanced *range vs fire-rate*.
  (Sources: [Valorant data drop (search summary)](https://playvalorant.com/en-us/news/dev/valorant-data-drop-phantom-vs-vandal/), [zilliongamer Vandal](https://zilliongamer.com/valorant/c/weapon-guide/vandal-stats-guides-skins/), [Hotspawn Phantom vs Vandal](https://www.hotspawn.com/valorant/guide/phantom-vs-vandal))
- **CoD BO6 AK-74 (AR):** max 45 dmg ≤ 43.1 m, 35 mid (43.1–55.8 m), 31 min beyond; **1.2×
  headshot**; ~4 torso shots close. CoD ARs cluster around **1.2–1.5× headshot**. (Sources: [game8 BO6 ARs](https://game8.co/games/Call-of-Duty-Black-Ops-6/archives/468631), [codmunity AK-74](https://codmunity.gg/weapon/bo6/ak-74), [TheGamer BO6 ARs](https://www.thegamer.com/call-of-duty-black-ops-6-cod-bo6-best-assault-rifles/))

### 5.3 Recommended damage profile (player HP = 100; pick one HP and tune around it)

| Weapon | Dmg (close) | Headshot ×  | Limb × | Fire rate (RPM) | STK body (close) | TTK body |
|---|---|---|---|---|---|---|
| AR (baseline) | 25 | 1.5 (→ chest 1.1) | 0.85 | 600 (10/s) | 4 | ~0.30 s |
| SMG | 22 | 1.4 | 0.9 | 800 (13.3/s) | 5 | ~0.30 s |
| Pistol (semi) | 30 | 1.6 | 0.85 | ~400 cap by clicks | 4 | input-bound |
| LMG | 30 | 1.4 | 0.9 | 550 (9.2/s) | 4 | ~0.33 s |
| Shotgun | 10×9 pellets | 1.5 | 1.0 | pump | 1 (≤8 m) | one-shot close |
| Sniper | 110 chest / 250 head | one-shot | 0.5 | bolt | 1 | one-shot vital |

> Body multipliers: **head > chest > stomach > limbs**. Typical: head 1.4–1.6×, chest 1.0–1.1×,
> stomach 1.0×, limbs 0.8–0.9×. Mixing 1–2 headshots into a body spray meaningfully cuts STK —
> this is the core skill reward. (Sources: [MitchCactus BO7 TTK](https://mitchcactus.co/blog/call-of-duty/bo7-time-to-kill-analysis/), [leprestore TTK/damage profiles](https://leprestore.com/guides/cod-guides/bo7-ttk/))

### 5.4 Damage falloff

Define per weapon: `dmgClose` up to `rangeNear`, linearly (or stepwise like CoD) interpolate down
to `dmgFar` at `rangeFar`, flat beyond.

```
falloff: { near: 18 m → 25 dmg,  far: 45 m → 16 dmg,  min beyond: 16 }
```

CoD uses **stepwise brackets** (max/mid/min); CS2 uses gentle continuous falloff; Valorant rifles
have **none**. Stepwise is the most readable for players and easiest to balance — recommended.
(Sources: [game8 BO6 ARs](https://game8.co/games/Call-of-Duty-Black-Ops-6/archives/468631), [cs2damage AK-47](https://cs2damage.com/weapon/ak-47/))

### 5.5 Balancing TTK for *fun*

- Keep STK low enough that fights are decisive but high enough that one mistake isn't instant
  death at all ranges. **4–5 STK body for the baseline AR** is the sweet spot.
- Make headshots *rewarding but not mandatory* — aim for a ~1-shot reduction in STK from 1–2 heads.
- Avoid one-shot-body autos (frustrating); reserve one-shots for snipers and close shotguns.
- Use **falloff + handling** (ADS time, recoil, mobility) — not just raw damage — to differentiate
  weapons so every gun has a niche. (Source: [TTK design tradeoffs](https://www.gameslearningsociety.org/wiki/what-is-the-meaning-of-ttk/))

---

## 6. "Juice" / game feel

Canonical references: **Vlambeer — "The Art of Screenshake" (Jan Willem Nijman)** and
**"Juice it or lose it" (Jonasson & Purho)**. Core lessons applied below: more, bigger, faster
feedback; hitstop; permanence; camera that reacts. (Sources: [Art of Screenshake — YouTube](https://www.youtube.com/watch?v=SkgkIXZ_13Y), [Art of Screenshake notes](https://victorweidar.wordpress.com/2016/10/06/the-art-of-screenshake/), [Juice It — RPG Playground research](https://rpgplayground.com/research-making-a-juicy-game/))

### 6.1 Hitmarkers
- Show a small X-flash at crosshair on confirmed hit. **Variants:** normal (white), **headshot
  (different color + distinct pitch sound)**, **kill (X with thicker/red + "thunk" + brief
  hitstop)**. In MP, only show on *server-confirmed* hit. (Source: [The art of Hit Registration (search summary)](https://danieljimenezmorales.github.io/2023-10-29-the-art-of-hit-registration/))
- Lifetime **80–150 ms**, scale-in then fade.

### 6.2 Damage numbers (optional, style choice)
- Floating numbers are an **RPG-shooter** convention (Destiny/Division/Borderlands), *not* classic
  CoD/CS/Valorant. Make it a **toggle**, default **off** for "tactical" feel, on for "arcade."
- If on: bigger number for bigger hit (scale **0.6×–2.0×**), distinct color/size for crits/headshots,
  float up + fade ~**0.6–0.9 s**, and **pool the objects** (don't instantiate/destroy per hit — major
  perf trap). (Sources: [FCT design/perf (Medium)](https://christopherhilton88.medium.com/creating-floating-combat-text-for-my-fps-in-unity-part-01-8ac384991f06), [Floating Combat Text feature set](https://steamcommunity.com/sharedfiles/filedetails/?id=3684509954))

### 6.3 Screenshake & camera kick
- **Camera kick on fire:** small upward pitch punch + tiny random roll/yaw, recovers springily
  (§1.3). This is the *visual recoil* layer. Keep it readable — over-shake hides targets (CoD's
  own lesson). (Source: [ONE Esports — visual recoil](https://www.oneesports.gg/call-of-duty/reduce-visual-recoil-warzone-2/))
- **Trauma-based shake** (Squirrel Eiserloh model): accumulate a `trauma` 0–1; shake amount =
  `trauma²` (or ³) so it's perceptual; decay trauma linearly (~1–1.5/s); drive offsets from
  *coherent noise* (Perlin), not pure `random()`, so it's smooth not jittery. Add trauma on:
  firing (small), taking damage (medium), explosions/nearby (large). (Source: [Juice/camera shake (Medium)](https://gt3000.medium.com/juice-it-adding-camera-shake-to-your-game-e63e1a16f0a6))
```
trauma:     fire +0.05–0.10,  hit-taken +0.25–0.4,  explosion +0.5–1.0  (clamp 1.0)
shakeAngle: maxAngle(3–6°) * trauma^2 * perlin(t)   // for pitch/yaw/roll
decay:      trauma -= 1.0/s * dt
```

### 6.4 Hitstop / hit-pause
- Freeze (or 10–20% time-scale) for **30–80 ms** on impactful events (kill, big hit, your own hit
  taken). Stay *below* conscious perception (~1–3 frames) so it reads as "punch," not lag. (Source: [Art of Screenshake — hitstop notes](https://victorweidar.wordpress.com/2016/10/06/the-art-of-screenshake/))

### 6.5 Muzzle flash, tracers, impacts
- **Muzzle flash:** additive sprite + short **point light** (range ~3–6 m, life 30–50 ms). Randomize
  scale/rotation per shot so it doesn't look static.
- **Tracers:** a stretched billboard/line from muzzle to hit point; show on ~1/2–1/3 of shots (not
  every one) for readability; life ~40–80 ms.
- **Impacts:** spark/dust particle burst + **decal** at hit point (bullet hole) oriented to surface
  normal; blood/hit-flash for flesh. Pool decals and cap count (e.g. 64–128 alive, recycle oldest).
- These collectively are CoD's "muzzle flash, dynamic light, tracers, impacts" feedback stack — our
  prototype already has the basics; formalize lifetimes and pooling.

### 6.6 Audio feedback (huge share of "feel")
- **Layered shot SFX:** transient "crack" + body + tail; pitch-vary ±3–5% per shot to avoid
  machine-gun sameness. Distinct sounds for **suppressed vs not**, **first round vs sustained**.
- **Confirmation sounds:** hitmarker tick (pitch up for headshot), kill confirm, low-ammo click,
  empty-mag dry-fire.
- Web Audio: synthesize or stream short samples; **one-shot pooled AudioBufferSourceNodes**; respect
  autoplay policy (start AudioContext on first user gesture / pointer-lock). Our prototype already
  uses Web Audio with no asset files — extend with layering and pitch variance.
- Spatialize enemy fire/footsteps with `PannerNode` for directional awareness.

### 6.7 Weapon viewmodel animation (idle sway, bob, ADS, reload, inspect)
Mostly *procedural* (cheap, responsive) plus a few baked anims (reload/inspect). (Sources: [Karl Lewis procedural FPS (search summary)](https://karllewisdesign.com/unreal-immersive-fps-part3/), [m-ansley FPS perspective notes](https://m-ansley.medium.com/quick-read-two-notes-on-setting-up-an-fps-perspective-in-unity-8dafaecaf08c), [FPS Animation Framework](https://saram2021.gumroad.com/l/FPSAnimationFramework))

- **Idle sway (look sway):** offset weapon opposite to recent mouse delta, spring back. Amplitude
  small (pos ~0.01–0.03 m, rot ~1–3°), smoothed. Reduce ~50–70% while ADS (and with higher FOV, per
  CoD). (Source: [CoD idle sway/FOV (wiki summary)](https://callofduty.fandom.com/wiki/Recoil))
- **Idle breathing:** tiny continuous sine on pos/rot (amp ~0.003 m / ~0.3°, ~0.4–0.8 Hz).
- **Weapon bob (walk/run):** sinusoidal pos+rot driven by horizontal speed; frequency scales with
  speed, amplitude scales with speed and is reduced hard during ADS. Typical bob amp at run ~0.02–
  0.05 m. (Source: [m-ansley bob/sway notes](https://m-ansley.medium.com/quick-read-two-notes-on-setting-up-an-fps-perspective-in-unity-8dafaecaf08c))
- **ADS transition:** lerp weapon local pos/rot from "hip socket" to "aim socket" over the §3.1 ADS
  time using an ease curve (easeOutQuad / smoothstep). Disable bob, reduce sway during ADS.
- **Fire animation:** a quick procedural recoil kick on the viewmodel (back + up + random roll),
  recovers springily — separate from the camera kick so the *gun* moves more than the camera.
- **Reload / inspect / draw:** baked clips (or procedural for prototype). Block firing during reload;
  allow reload-cancel on weapon swap. Inspect interruptible by any action.
- Animate the **weapon** with arms parented to it (industry convention — simpler than rigging arms to
  hold the gun). (Source: [FPS animation framework / parenting](https://kinemation.itch.io/fps-animation-framework))

---

## 7. Movement feel

Decide the *lane* (§0). Recommendation: **CoD-leaning accessible movement** (sprint, slide, mantle)
with **predictable acceleration**, *not* Quake air-strafe acceleration (too niche/unfair for a broad
browser audience), but with a **high skill ceiling** via slide timing and tight strafing.

### 7.1 Ground movement & acceleration
- Model: target velocity from input, accelerate toward it with finite accel, apply friction when no
  input. (Quake/Source pattern: `accelerate()` limits the *projection* of velocity onto wishdir,
  which is what enables air-strafing; we keep the ground form, restrict air accel — see 7.4.)
  (Sources: [Bunnyhopping from the Programmer's Perspective](https://adrianb.io/2015/02/14/bunnyhop.html), [Replicating Source air strafing (thesis PDF)](https://www.theseus.fi/bitstream/handle/10024/507593/Peltola_Mikko.pdf))
```
maxRunSpeed     : 5.0–7.0 m/s     (CS AK ≈ 215 u/s ≈ 4.1 m/s; CoD a bit faster — pick ~6 m/s)
groundAccel     : 50–90 m/s^2     (snappy starts; CS-like is high)
friction        : 6–10 (1/s)      (stop quickly when keys released; enables counter-strafe feel)
maxAirSpeed     : 0.8–1.2 m/s of *added* control (small) — see 7.4
airAccel        : 10–30 (low, so no bunny-hop speed gain) OR Source-style capped for skill ceiling
```
- **Per-weapon move speed** (CS does this): heavier guns slow you. Knife/empty ≈ 1.0×, AR ≈ 0.85×,
  LMG/sniper ≈ 0.75×, ADS ≈ 0.5–0.7×. (Source: [CS movement speed by weapon](https://counterstrike.fandom.com/wiki/Movement))
- **Counter-strafe:** because friction stops you fast and first-shot accuracy resets on near-stop,
  tapping the opposite key to brake → shoot accurately is a natural emergent skill. (Source: [CS2 shooting mechanics](https://cs2guide.net/gameplay-mechanics/shooting-accuracy-spread/))

### 7.2 Sprint & tac-sprint
- **Sprint:** ×1.3–1.5 run speed; can't fire/ADS while sprinting; **sprint-out time** (delay before
  fire/ADS after sprint) **100–250 ms**. **Tac-sprint:** ×1.6–1.8 for a limited duration / stamina,
  with a *longer* ready time. (Source: [Tactical Sprint — CoD wiki](https://callofduty.fandom.com/wiki/Tactical_Sprint))

### 7.3 Slide, crouch, mantle/vault
- **Slide:** from sprint + crouch; gives a short forward boost (~1.3–1.6× for ~0.4–0.7 s), lowers
  profile, decelerates to crouch; small accuracy/recoil consideration. Optional slide-cancel as a
  skill expression (be aware it can dominate the meta — CoD has repeatedly retuned it). (Sources: [CoD MW movement guide](https://www.callofduty.com/guides/training/call-of-duty-modern-warfare-III-play-guides-multiplayer-movement), [Dexerto slide cancel](https://www.dexerto.com/call-of-duty/how-to-slide-cancel-in-modern-warfare-3-2332662/))
- **Crouch:** ×0.4–0.5 speed, lower camera/hitbox, tighter spread/recoil (§1.4). (No prone for v1.)
- **Mantle / vault:** auto-climb low ledges when moving into them with clearance above; keep gun up
  while mantling (CoD MW does this). Define `maxMantleHeight ~1.0–1.3 m`, mantle time ~0.3–0.5 s.
  (Source: [CoD MW movement basics](https://blog.activision.com/call-of-duty/2019-10/The-Basics-of-Call-of-Duty-Modern-Warfare-Movement))

### 7.4 Air control & bunny-hop stance
- **Decision: NO speed-gaining bunny-hop.** Allow *small* air control (steer mid-jump) but cap added
  air speed so repeated jumps don't accelerate you. If you *want* a skill ceiling, implement
  Source-style capped air accel (limit projection of velocity onto wishdir to a tiny `maxAirSpeed`),
  which permits subtle air-strafing without runaway speed. Otherwise keep air accel low and simple.
  (Sources: [Bunnyhopping programmer's perspective](https://adrianb.io/2015/02/14/bunnyhop.html), [men_mamiy bunnyhop/source movement](https://note.com/men_mamiy_ko/n/nbea3e198f9a7?hl=en))
- Apply gravity ~**18–25 m/s²** (snappier than real 9.8 feels better in FPS); jump impulse for
  ~1.0–1.2 m apex.

---

## 8. Implementation priority & per-weapon data schema

### 8.1 Suggested build order
1. Raw-input look + frame-rate-independent camera (§3.3, §3.5) — *get feel right first*.
2. Hitscan fire + hitboxes + damage/headshot multipliers + TTK (§4, §5).
3. First-shot-accuracy spread model + dynamic crosshair (§2).
4. Per-weapon recoil pattern + dual (aim vs visual) recoil + recovery (§1).
5. ADS (FOV + sens scaling + viewmodel aim pose + reduced spread/recoil) (§3).
6. Juice pass: hitmarkers, camera kick/trauma shake, muzzle/tracer/impact/decal pooling, audio
   layering, viewmodel sway/bob/fire anim (§6).
7. Movement: accel/friction, sprint, slide, crouch, mantle (§7).
8. Projectile weapons (sniper/launcher) + penetration (§4).
9. MP scaffolding: server-authoritative tick, prediction/reconciliation, lag comp (§4.4).

### 8.2 Per-weapon data block (single source of truth)
```js
const WEAPON = {
  id: "ar_baseline",
  class: "rifle",
  fireMode: "auto",            // auto | semi | burst | pump | bolt
  rpm: 600,                    // → fireInterval = 60/rpm
  damageClose: 25,
  falloff: [{range: 18, dmg: 25}, {range: 45, dmg: 16}],   // stepwise/linear
  mult: { head: 1.5, chest: 1.1, stomach: 1.0, limb: 0.85 },
  magSize: 30, reserve: 120, reloadTime: 2.1, drawTime: 0.5, swapTime: 0.4,
  // accuracy
  spread: { hipStand: 2.0, ads: 0.05, walkAdd: 1.5, sprintAdd: 4.0, jumpAdd: 7.0,
            perShotAdd: 0.15, decay: 8, max: 10 },
  firstShotAccurate: true,
  // recoil
  recoilPattern: [ /* {p,y} per shot */ ],
  recoilTailRandom: 0.35,
  recoilRecoveryDelay: 0.08, recoilRecoverySpeed: 10, autoRecoverFraction: 0.6,
  visualKickMult: 0.30,
  // ads / handling
  adsTime: 0.24, adsFovScale: 0.80, adsMoveMult: 0.6, adsRecoilMult: 0.5, adsSpreadMult: 0.03,
  // hit model
  hitType: "hitscan",          // hitscan | projectile
  projectile: null,            // {speed, gravity, lifetime} if projectile
  penPower: 2.0,
  // move
  moveMult: 0.85,
  // feel
  shakeOnFire: 0.06, tracerEvery: 2,
};
```

---

## 9. Tuning methodology (feel is iterated, not specified)

- Build a **debug overlay**: live spread cone (deg), current recoil offset, STK/TTK readout,
  cm/360, FOV, ADS sens multiplier. Make every number in this doc a hot-reloadable variable.
- Validate TTK with a **TTK calculator** mindset (`STK = ceil(HP/dmg)`, `TTK = (STK-1)/rps`) before
  playtesting. (Source: [TTK calculator concept](https://keyboardtester.click/ttk-calculator.php))
- Playtest the **30-tips checklist** from Art of Screenshake: add feedback until it feels good, then
  pull back ~10–20%. (Source: [Art of Screenshake](https://www.youtube.com/watch?v=SkgkIXZ_13Y))
- Re-check on 60 Hz *and* 144 Hz, low-DPI and high-DPI mice, and a controller if supported (controller
  needs aim-assist: slowdown bubble near targets + light rotational pull — out of scope for v1 but
  design hitboxes/spread to allow it).

---

## 10. Source index (authoritative & reference)

**Recoil / accuracy**
- CS2 shooting/accuracy mechanics — https://cs2guide.net/gameplay-mechanics/shooting-accuracy-spread/
- Refrag — Spray Science (how CS2 recoil works) — https://refrag.gg/blog/spray-science-how-does-weapon-recoil-function-in-cs2/
- Valorant dev tracker — first-shot deviation & RNG spray rationale — https://devtrackers.gg/valorant/p/0642c4d6-why-is-there-rifle-first-shot-deviation-and-rng-spray-patterns-not-a-rant-thread
- Dignitas — Valorant spraying vs tapping — https://dignitas.gg/articles/a-guide-to-gunplay-in-valorant-spraying-vs-tapping
- CoD Recoil (gun kick vs aim climb, idle sway, visual recoil) — https://callofduty.fandom.com/wiki/Recoil
- ONE Esports — reducing visual recoil (visual vs aim separability) — https://www.oneesports.gg/call-of-duty/reduce-visual-recoil-warzone-2/

**Aiming / FOV / sensitivity**
- Aimlabs PC Sensitivity Guide — https://support.aimlabs.com/hc/en-us/articles/38493112353815-PC-Sensitivity-Guide
- Kovaak — sensitivity scaling methods (MDH/focal length) — https://www.kovaak.com/sens-scaling/
- Plutonium — FOV vs FOV scale & ADS sens — https://forum.plutonium.pw/topic/11380/fov-vs-fov-scale-ads-accuracy-sens
- mouse-sensitivity.com — ADS zoom sens math — https://www.mouse-sensitivity.com/forums/topic/7173-how-does-the-ads-value-work-in-the-process-of-zooming-in/
- Mouse sensitivity converter / cm-360 / eDPI / raw input — https://www.recharge.com/blog/en-gb/mouse-sensitivity-converter-calculator-for-23-fps-games

**Hit registration / netcode**
- Hitscan — Wikipedia — https://en.wikipedia.org/wiki/Hitscan
- Source Multiplayer Networking — Valve Developer Wiki — https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
- SnapNet — Lag compensation in UE5 — https://snapnet.dev/blog/performing-lag-compensation-in-unreal-engine-5/
- Netcode series: projectiles (prediction/lag comp) — https://medium.com/@geretti/netcode-series-part-4-projectiles-96427ac53633
- minism/fps-netcode (reference implementation) — https://github.com/minism/fps-netcode
- The art of Hit Registration — https://danieljimenezmorales.github.io/2023-10-29-the-art-of-hit-registration/
- CS2 sub-tick & tick rate — https://xplay.gg/blog/cs2-tick-rate-subtick-system/
- Tick rate explainer — https://www.g2a.com/news/glossary/what-is-tick-rate-in-gaming-how-server-updates-affect-hit-registration-and-online-play/
- CS2 wallbangs / penetration — https://cs.money/blog/news/everything-you-need-to-know-about-wallbangs-in-cs2/
- Counter-Strike bullet penetration (wiki) — https://counterstrike.fandom.com/wiki/Bullet_Penetration

**Damage / TTK**
- MitchCactus — BO7 TTK analysis — https://mitchcactus.co/blog/call-of-duty/bo7-time-to-kill-analysis/
- leprestore — BO7 TTK / damage profiles — https://leprestore.com/guides/cod-guides/bo7-ttk/
- CS2 AK-47 stats — https://cs2damage.com/weapon/ak-47/ , https://csdb.gg/weapon/ak-47/
- Valorant data drop: Phantom vs Vandal (official) — https://playvalorant.com/en-us/news/dev/valorant-data-drop-phantom-vs-vandal/
- zilliongamer Vandal / Phantom stats — https://zilliongamer.com/valorant/c/weapon-guide/vandal-stats-guides-skins/
- BO6 assault rifle stats (game8) — https://game8.co/games/Call-of-Duty-Black-Ops-6/archives/468631
- TTK meaning / design tradeoffs — https://www.gameslearningsociety.org/wiki/what-is-the-meaning-of-ttk/

**Game feel / juice**
- Vlambeer — The Art of Screenshake (Jan Willem Nijman) — https://www.youtube.com/watch?v=SkgkIXZ_13Y
- Art of Screenshake — notes/summary — https://victorweidar.wordpress.com/2016/10/06/the-art-of-screenshake/
- Juice it or lose it (research summary) — https://rpgplayground.com/research-making-a-juicy-game/
- Camera shake (trauma model) — https://gt3000.medium.com/juice-it-adding-camera-shake-to-your-game-e63e1a16f0a6
- Floating combat text design & perf — https://christopherhilton88.medium.com/creating-floating-combat-text-for-my-fps-in-unity-part-01-8ac384991f06

**Viewmodel animation**
- Karl Lewis — procedural ADS/sway/bob (UE) — https://karllewisdesign.com/unreal-immersive-fps-part3/
- m-ansley — FPS perspective (bob/sway) — https://m-ansley.medium.com/quick-read-two-notes-on-setting-up-an-fps-perspective-in-unity-8dafaecaf08c
- FPS Animation Framework (industry-practice notes) — https://kinemation.itch.io/fps-animation-framework

**Movement**
- Bunnyhopping from the Programmer's Perspective (accel/friction math) — https://adrianb.io/2015/02/14/bunnyhop.html
- Replicating Source air strafing (thesis) — https://www.theseus.fi/bitstream/handle/10024/507593/Peltola_Mikko.pdf
- Bunnyhopping / Source movement evolution — https://note.com/men_mamiy_ko/n/nbea3e198f9a7?hl=en
- CS movement speeds by weapon (wiki) — https://counterstrike.fandom.com/wiki/Movement
- CoD MW movement guide — https://www.callofduty.com/guides/training/call-of-duty-modern-warfare-III-play-guides-multiplayer-movement
- Tactical Sprint (CoD wiki) — https://callofduty.fandom.com/wiki/Tactical_Sprint
- CoD MW movement basics (mantle/slide) — https://blog.activision.com/call-of-duty/2019-10/The-Basics-of-Call-of-Duty-Modern-Warfare-Movement
