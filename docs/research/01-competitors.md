# 01 — Competitor Research & "AAA Shooter Feel" Benchmark

**Project:** NEON BREACH (browser-based, AAA-aspiring first-person shooter, web tech)
**Author:** Games-industry analyst
**Date:** June 2026
**Purpose:** Establish what makes headline AAA shooters *feel* great, distill the universal "feel pillars," benchmark the best browser / open-source FPS, and provide a scoreable rubric for objectively measuring NEON BREACH against both groups.

> **Honesty note up front.** A single-file or small browser build can reach *high mechanical/feel parity* with AAA shooters (gunplay, recoil, TTK, movement, feedback). It cannot match *production scale*: photoreal PBR art, mocap animation, server-authoritative anti-cheat netcode at scale, and hundreds of hours of content. Throughout this doc, criteria are flagged where the medium (browser) — not effort — is the binding constraint. See the "What web can vs cannot realistically match" section.

---

## 1. Headline AAA Shooters — what makes each feel great

For each title: signature gunplay traits, time-to-kill (TTK) norms, movement model, gameplay loop, and what reviewers/pros say defines its "feel."

### 1.1 Call of Duty: Modern Warfare series (Infinity Ward)
- **Signature gunplay:** Fast, lethal, "claustrophobic" close-quarters combat that rewards precision + speed. Punchy per-shot feedback built from camera/view kick, muzzle flash, smoke, hitmarkers, and tight audio. The "feel" is the sum of hundreds of small VFX/SFX/animation decisions, not one mechanic.
- **TTK norms:** Among the fastest of the headline shooters. Concrete numbers: MW2 (2022) M16 burst ≈ **148 ms** TTK to ~48 m; Lachmann-556 AR ≈ **249 ms**; MW (2019) SMGs could kill in ~**175 ms**. MW3 (2023) deliberately *slowed* TTK vs MW2 after player complaints — TTK tuning is a recurring, contentious dial. Fast TTK was an intentional accessibility choice (lower-skill players still get kills) but is criticized for lowering the skill ceiling (less time to react under fire) and encouraging camping.
- **Movement:** Ground-based with sprint, tactical sprint, slide, mantle/vault, crouch, prone. "Visual recoil" (camera shake separate from true bullet recoil) is a key feel lever — too much hurts visibility, so it's carefully tuned.
- **Loop:** Short respawn TDM/objective rounds; loadout + attachment ("gunsmith") progression; killstreaks.
- **What defines its feel (sources):** Reviewers/community: "fluid gunplay set the standard for fast-paced FPS"; the satisfying "punch" comes from camera kick + muzzle flash + VFX + sound coming together; visual-recoil debates show how sensitive the feel is to small tuning.
- Sources: https://www.gamerevolution.com/guides/612217-modern-warfare-time-to-kill-ttk-too-fast · https://www.dexerto.com/call-of-duty/modern-warfare-2-expert-reveals-which-hard-hitting-weapon-has-fastest-ttk-1979259/ · https://www.dexerto.com/call-of-duty/modern-warfare-3-players-rejoice-as-time-to-kill-is-slower-than-mw2-2327434/ · https://www.sportskeeda.com/esports/what-makes-call-duty-game-great-analyzing-game-mechanics-gunplay · https://callofduty.fandom.com/wiki/Recoil · https://www.oneesports.gg/call-of-duty/reduce-visual-recoil-warzone-2/

### 1.2 Battlefield (DICE) — 2042 as reference point
- **Signature gunplay:** Punchy, responsive weapons; "every trigger pull unleashes a powerful blast of recoil that needs controlling." Range matters: close fights are scrambles for the first accurate burst; long fights require accounting for **bullet velocity** (true projectile ballistics, drop) and recoil. Large-scale combined-arms (vehicles, large maps, destruction) is the franchise signature.
- **TTK norms:** Generally moderate; varies heavily by class/weapon and is balanced for large-map engagements. 2042's reduced bullet velocity on some weapons (esp. snipers) was widely criticized as making them feel unsatisfying.
- **Movement:** Ground infantry + vehicles; sprint, slide, vault; larger maps demand more traversal.
- **Loop:** Large-scale Conquest/Breakthrough objective warfare; class/specialist system; vehicles; environmental destruction.
- **What defines its feel:** Scale + destruction + ballistic realism. Pain points: hit-registration consistency tied to netcode (players reported 100–300 ms perceived bullet delay), showing how netcode quality directly governs perceived gunplay.
- Sources: https://www.superjumpmagazine.com/battlefield-2042-is-playing-it-dangerous/ · https://battlefield.fandom.com/wiki/Projectile_mechanics · https://www.techradar.com/how-to/battlefield-2042-best-weapons-top-guns-for-beginners · https://sportskeeda.com/esports/battlefield-2042-patch-3-1-improvements-bullet-hit-registry-consistency-balancing-changes

### 1.3 Valorant (Riot)
- **Signature gunplay:** Tactical, CS-derived: standing-still accuracy, heavy **running/strafing inaccuracy**, and **first-shot inaccuracy** (Vandal first-bullet spread 0.25, Phantom 0.20 — controversial RNG that some pros want removed). Abilities layer on top of pure aim. Rewards both aim and ability use.
- **TTK norms:** Very fast on headshots (Vandal one-taps to the head at most ranges); the game is built around precise, low-bullet kills and crisp peeks.
- **Movement:** Slow, deliberate, counter-strafing; no advanced mobility. Accuracy is gated by being stopped.
- **Loop:** Round-based 5v5 attack/defend, buy economy, abilities, best-of-X.
- **What defines its feel (the netcode story):** Riot engineered the feel deliberately. **128-tick servers at launch (industry first)**, Riot Direct routing, and a stated goal of ~40 ms peeker's-advantage improvement. At top play, win/loss comes down to 20–50 ms differences. Client tuned for 60 FPS minimum, minimal buffering. This is the canonical example that *perceived gunplay quality is mostly a netcode + responsiveness problem*, not just animation.
- Sources: https://technology.riotgames.com/news/peeking-valorants-netcode · https://www.techradar.com/news/valorant-interview-talking-the-tech-behind-one-of-pcs-most-competitive-shooters · https://www.zleague.gg/theportal/why-valorant-players-want-to-scrap-first-shot-inaccuracy/ · https://biggo.com/news/202510070716_Valorant_128_Tick_vs_CS2_Sub_Tick

### 1.4 Counter-Strike 2 (Valve)
- **Signature gunplay:** The benchmark for *learnable* gunplay. **Deterministic spray patterns** — after the first shot, bullets follow a fixed per-weapon pattern that's identical every time, so it can be memorized and counter-compensated. Standing/counter-strafe accuracy; movement inaccuracy. No abilities — pure utility (nades) + aim.
- **TTK norms:** Extremely fast on good shots (rifle headshots often one/two-tap). Skill expression is in spray control and crosshair placement.
- **Movement:** Slow, precise, counter-strafing; movement is a skill expression (jiggle-peek, bunny-hop remnants).
- **Loop:** Round-based 5v5 bomb defuse, buy economy.
- **What defines its feel:** **Sub-tick** architecture — shots register at the exact instant fired, removing tick-quantization of CS:GO, making spray control feel more responsive/consistent. CS2 unified on 128-tick spray patterns. Note: CS2 matchmaking servers default to 64-tick + sub-tick, which is *contested* vs Valorant's true 128-tick — community debate over which "feels" better is ongoing and instructive.
- Sources: https://blog.cs2.ad/cs2-spray-patterns/ · https://escorenews.com/en/csgo/article/50737-cs2-vs-cs-go-weapon-stats-difference-recoil-spray-pattern-accuracy-how-guns-changed-in-cs2 · https://esportsinsider.com/2025/09/cs2-september-19-update-spray-pattern-fix · https://biggo.com/news/202510070716_Valorant_128_Tick_vs_CS2_Sub_Tick

### 1.5 Apex Legends (Respawn)
- **Signature gunplay:** "Razor-sharp," inherited from Titanfall 2 — tight, responsive, competitive-ready. Recoil patterns are learnable; weapons feel distinct. Reviewers credit Titanfall's gunplay as doing the heavy lifting.
- **TTK norms:** Longer than CoD/CS because of the **shield system** (white/blue/purple/red armor stack on top of health; realistic mid-fight target ~225 HP). TTK = (shots-to-kill − 1) / (RPM/60) at body, ≤25 m. Balance patches constantly retune (e.g., P2020 buffed to R-99-level TTK in S24). Longer TTK + shields = more comeback/positioning depth.
- **Movement (the standout):** Best-in-class. Slide (momentum-preserving), tap-strafe (controversial, nerfed S12), bunny-hop, wall-traversal, mantling. Players say Apex's movement "ruined other shooters" — once you learn it, other FPS feel sluggish. Movement is a primary skill-expression and identity.
- **Loop:** 3-player-squad battle royale; ping system; legend abilities; looting + ring.
- **What defines its feel:** Titanfall gunplay + smooth, fluid, momentum-based movement + squad tactics. The combination, not any single piece.
- Sources: https://www.dexerto.com/apex-legends/apex-legends-smooth-movement-has-ruined-other-shooters-players-say-2152997/ · https://www.trustedreviews.com/reviews/apex-legends · https://apexlegends.fandom.com/wiki/Weapon · https://esports.gg/guides/apex-legends/apex-ttk-season-10-time-to-kill-by-bears-say-meow/ · https://www.sportskeeda.com/esports/tap-strafe-changes-arriving-season-12-frustrate-professional-apex-legends-players-content-creators

### 1.6 DOOM Eternal (id Software)
- **Signature gunplay / loop — "Push-Forward Combat":** The whole game is designed so the player *must always be aggressive*. Anything that slows the player or forces retreat was removed (notably **reloading is gone**). Resources are recovered *through aggression*: **glory kills → health**, **chainsaw → ammo**, **flame belch → armor**. The player becomes their own resupply, so disengaging is punished and the loop self-sustains.
- **TTK norms:** N/A in the PvP sense — it's PvE "rip and tear." Combat is a resource-management/target-prioritization puzzle at high speed; weak-point destruction stops enemy attacks.
- **Movement:** Extremely fast — dash (two quick horizontal bursts, ground or air), double-jump, monkey-bars, wall-climb, launchpads. Movement is mandatory survival, weaving through projectiles while farming resources.
- **What defines its feel:** Relentless aggressive flow; speed + pinpoint accuracy + adapting to changing demon composition. Some reviewers note Eternal is *more demanding/rule-bound* than 2016, which some find less free-form. id presented "Embracing Push-Forward Combat" at GDC — the canonical PvE-feel design talk.
- Sources: https://www.gamedeveloper.com/design/how-doom-s-push-forward-design-cured-my-hoarder-syndrome · https://www.gamedeveloper.com/game-platforms/pushing-push-forward-combat-with-gameplay · https://www.gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in · https://www.giantbomb.com/reviews/doom-eternal-review/1900-797/

### 1.7 Halo Infinite (343 Industries)
- **Signature gunplay:** "30-second-of-fun" sandbox loop — guns + grenades + melee + equipment. Longer engagements than CoD: shields must be stripped before health, so kills are multi-stage. Weapon-specific kill counts (e.g., Mangler retuned 4-shot → 3-shot). AR bullets land anywhere inside the reticle to reward accurate aim. Strong **bullet magnetism + aim assist** (controller-biased; aim assist on controller is very strong, M&K gets magnetism but not aim assist) — a recurring balance complaint.
- **TTK norms:** Relatively slow/deliberate by design (shield + health two-stage). More time-to-react = more skill expression in strafing/positioning, but also frustration when shots feel like they don't register.
- **Movement:** Classic Halo base movement + sprint, slide, clamber, grappleshot (sandbox equipment). Deliberate, weighty "Spartan" feel.
- **Loop:** Arena + BTB; pick-up power weapons/equipment on map; equality-of-start sandbox.
- **What defines its feel:** Sandbox depth + the shield/health two-stage TTK + signature weight. Pain points: aim-assist/input-parity and hit-registration feel complaints.
- Sources: https://www.halowaypoint.com/news/sandbox-update-halo-infinite · https://steamcommunity.com/app/1240440/discussions/0/4635987888980477779/

### 1.8 F.E.A.R. (Monolith) — the AI benchmark (single-player)
Included because it remains the *gold standard for shooter combat AI*, relevant to NEON BREACH's enemy design.
- **AI:** GOAP (goal-oriented action planning) producing emergent **squad tactics**: flanking, suppressing, coordinated advances, using cover/vaulting windows, retreating, and (the famous trick) **combat barks** that *narrate* their planning so the player perceives intelligence ("He's flanking!"). Enemies use environment (jump obstacles, break windows) and adapt to repeated player strategy.
- **Why it matters:** Reviewers still call it unmatched 20 years on. The lesson for us: perceived AI intelligence = readable behavior + audio communication + environmental use, *not* raw decision complexity. Cheap to fake convincingly.
- Sources: https://www.vice.com/en/article/shooters-never-matched-fears-legendary-ai/ · https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter02_Combat_Dialogue_in_FEAR_The_Illusion_of_Communication.pdf · https://www.thegamer.com/best-enemy-ai-video-games/

---

## 2. AAA Comparison Matrix

| Title | TTK band | Movement | Recoil model | Combat loop | "Feel" signature |
|---|---|---|---|---|---|
| CoD: MW | **Very fast** (~150–250 ms) | Ground + slide/mantle/tac-sprint | Hybrid pattern + view kick | Short respawn TDM/obj, loadouts, streaks | Punchy juice; accessibility-tuned lethality |
| Battlefield | Moderate (class/weapon-dependent) | Ground + vehicles; large maps | Pattern + true ballistics (velocity/drop) | Large-scale combined arms + destruction | Scale, destruction, ballistic realism |
| Valorant | Fast on headshots | Slow, counter-strafe; no mobility | First-shot inaccuracy + spray; stand-still accuracy | Round-based 5v5, economy, abilities | Tactical precision + best-in-class netcode (128-tick) |
| CS2 | Fast on good shots | Slow, counter-strafe | **Deterministic learnable spray** | Round-based 5v5 bomb, economy | Pure, learnable mastery; sub-tick registration |
| Apex | **Longer** (shields ~225 HP) | **Best-in-class** (slide/tap-strafe/wall) | Learnable patterns | 3-squad battle royale, ping, abilities | Titanfall gunplay + fluid momentum movement |
| DOOM Eternal | N/A (PvE) | Extremely fast (dash/double-jump) | No reload; resource-recovery loop | PvE push-forward arena combat | Relentless aggressive flow; you are your own resupply |
| Halo Infinite | Slow/deliberate (shield+health) | Weighty + sprint/slide/clamber/grapple | Reticle-fill + magnetism/aim-assist | Arena/BTB equal-start sandbox | Sandbox depth + two-stage TTK + weight |

**Cross-cutting TTK lesson:** TTK is the single most consequential tuning dial and the most contested. Faster (CoD/CS) = twitch + accessibility but lower reaction skill ceiling and camping risk; slower (Apex/Halo) = positioning/comeback depth. There is no "correct" value — it must match the intended loop. For NEON BREACH, pick a band on purpose and tune relentlessly.

---

## 3. The Universal Pillars of "AAA Shooter Feel"

Distilled across all titles + game-feel literature. These are the levers that produce "feel."

1. **Gunplay & game feel ("juice").** Feel is the sum of hundreds of micro-decisions: screen-shake intensity, recoil recovery speed, hitmarker duration (~50–100 ms flash), and the **audio delay between shot and impact**. Every step must feel instantaneous and connected — delay anywhere breaks the feedback loop. Components: hit feedback (hitmarker 50–100 ms, hit flash, damage numbers), recoil (hybrid: deterministic base pattern + small variance; tune recovery speed = arcade vs tactical), weapon-specific screen-shake (pistol ~1–2 px/50 ms; AR ~2–3 px/40 ms), and "view kick" *separate* from true recoil. Juice = excessive feedback relative to input; superfluous mechanically but makes every action feel significant.
   - https://www.strayspark.studio/blog/fps-game-design-fundamentals-ue5 · https://arxiv.org/pdf/2011.09201

2. **Movement model.** Responsiveness + momentum. The best-felt games (Apex, DOOM, Titanfall) make movement a *skill-expression and identity*, not just locomotion. Slides preserve momentum; air-control and chaining matter; "clunkiness" is the enemy. Even tactical games (CS/Valorant) treat movement (counter-strafe, peeks) as core skill.
   - https://www.dexerto.com/apex-legends/apex-legends-smooth-movement-has-ruined-other-shooters-players-say-2152997/

3. **Feedback / juice / VFX.** Muzzle flash, smoke, tracers, impact decals, blood/spark hit FX, kill confirmation, killstreak/score popups, controller rumble. "It really comes together once VFX and sound are added." Balance against visibility (CoD's visual-recoil saga).
   - https://callofduty.fandom.com/wiki/Recoil

4. **Audio.** Arguably tied with gunplay for "feel." Weapon shots are layered: **transient (sharp attack ≤10 ms) + body + sub/LFE + mechanical + tail**. Sharp transients sell immediacy/precision. Tactical audio is gameplay: footstep/reload/ability localization frequently decides rounds; enforce a **volume hierarchy** (enemy footsteps louder than your own). Spatialization + occlusion = situational awareness.
   - https://blog.prosoundeffects.com/how-to-sound-design-first-person-shooter-gunshot-sound-effects-with-mark-kilborn · https://www.thegameaudioco.com/the-psychology-of-weapon-sound-design-engaging-players-through-audio · https://attackshark.com/blogs/knowledges/audio-tuning-frequency-response-esports

5. **Enemy AI (single-player / PvE).** Perceived intelligence = readable, communicated behavior (F.E.A.R. barks), squad coordination, cover/environment use, and adaptation — *not* raw algorithmic depth. Cheap to fake convincingly; expensive to do "really."
   - https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter02_Combat_Dialogue_in_FEAR_The_Illusion_of_Communication.pdf

6. **Pacing & gameplay loop.** A tight, self-reinforcing core loop: CoD's short-respawn loadout churn; DOOM's resource-through-aggression "push-forward"; Apex's loot→fight→rotate; CS/Valorant's economy rounds. The loop dictates correct TTK, movement, and resource design — design the loop first, tune everything to serve it.
   - https://www.gamedeveloper.com/game-platforms/pushing-push-forward-combat-with-gameplay

7. **Visual fidelity.** PBR materials, lighting/GI, post-processing (bloom, motion blur, AO), high-poly + mocap animation, hi-res textures. This is where AAA budget shows most — and where the web medium is most constrained (see §5). Strong **art direction can substitute for raw fidelity** (Apex's stylization, Shell Shockers' cartoon shading holding 60 FPS).

8. **Performance & responsiveness (netcode).** The hidden pillar. Valorant proves "feels good to play" is largely an *input-to-photon latency + hit-registration* problem: 128-tick, low buffering, optimized routing, 60+ FPS. Battlefield 2042 proves bad netcode reads as "bad gunplay" (perceived 100–300 ms bullet delay). For competitive feel, framerate stability + tick rate + server-authoritative hit-reg > shader quality.
   - https://technology.riotgames.com/news/peeking-valorants-netcode

---

## 4. Browser & Open-Source FPS Benchmark

### 4.1 Best browser FPS (commercial / live)
| Game | Tech | Quality reached | Gets right | Gets wrong / limits |
|---|---|---|---|---|
| **Krunker.io** | Custom WebGL engine; KrunkScript map editor | Genre leader in-browser. 144+ FPS on standard HW, runs on low-end/Chromebooks/mobile; 100,000+ community maps; unified cross-platform servers | Performance (minimalist art → low GPU load), high tick-rate competitive feel, huge UGC ecosystem, cross-platform | Deliberately low-fidelity blocky art (not AAA look); arcade not realistic; anti-cheat is a perennial browser problem |
| **Shell Shockers** | **Babylon.js** (WebGL); HTML5 | Full multiplayer FPS in a tab, **holds 60 FPS on a Chromebook** | Aggressive asset budgets + cartoon shading instead of chasing photoreal; strong art direction; accessible | Stylized egg aesthetic by design; not a fidelity benchmark |
| **Mini Royale: Nations** | Unity WebGL | "Aesthetic of modern tactical shooters" in-browser; blocky-but-detailed | Smooth movement, precise aiming, custom crosshairs, minimap | Unity WebGL load/size + perf overhead vs hand-rolled engines |

- Sources: https://frvr.com/blog/guides/lists/best-fps-browser-games/ · https://www.webgpu.com/showcase/shell-shockers-babylonjs-browser-fps/ · https://en.wikipedia.org/wiki/Shell_Shockers

### 4.2 Best open-source FPS on GitHub (web-relevant)
| Repo | Tech | ~Stars | Quality / what it proves |
|---|---|---|---|
| **cfoust/sour** ("Sauerbraten for the web") | C++ → Emscripten/WASM, TypeScript, Go | ~209 | A *full real FPS engine* (Cube 2/Sauerbraten) compiled to the browser — multiplayer arena FPS in a tab. Proof a complete native FPS can run on the web via WASM. |
| **GMH-Code/Qwasm** | C/WebGL | ~52 | Quake engine in the browser (WebGL + software fallback), mods, mission packs — classic-AAA-of-its-era gameplay runs natively in-browser. |
| **mohsenheydari/three-fps** | **three.js** + ammo.js + three-pathfinding | ~226 | The most instructive *modern web-stack* reference: entity/component system, ammo.js rigidbody physics FPS controller, NPC root-motion animation + basic AI pathfinding, weapon system, HDRI lighting. Marked "under development" with a live demo. This is roughly the modern three.js FPS ceiling for a small project. |
| **TiagoSilvaPereira/simple-3d-fps** | **Babylon.js** | ~61 | Clean-code Babylon FPS reference; good architecture demo, simple gameplay. |
| **felixgren/three-arena** | three.js + socket.io | (smaller) | Multiplayer arena shooter with socket.io netcode — shows the basic web multiplayer stack. |
| **OpenTournament** | Unreal Engine (C++) | ~198 | Not web, but the open-source bar for "real" arena FPS feel/content if ever ported. |
| **mtrebi/AI_FPS** | UE4, Behavior Trees | ~188 | Reference for FPS combat AI architecture (behavior trees) — useful for our enemy design even if not web. |

- Sources: https://github.com/topics/first-person-shooter?o=desc&s=stars · https://github.com/mohsenheydari/three-fps · https://github.com/cfoust/sour · https://github.com/TiagoSilvaPereira/simple-3d-fps

### 4.3 What web FPS get right / wrong (synthesis)
- **Right:** Accessibility (zero install, cross-platform, instant play); performance via *art-direction discipline* (low/stylized art holding 60–144 FPS); proven feasibility of full FPS mechanics (collision, weapons, multiplayer) in WebGL/WASM (Quake/Sauerbraten ports); thriving UGC (Krunker).
- **Wrong / unsolved:** Visual fidelity gap vs AAA (most lean stylized to survive perf); **anti-cheat is fundamentally harder** in a client-readable browser environment; netcode quality is uneven (most use basic socket.io, not 128-tick server-authoritative); content depth + animation/asset quality far below AAA; bundle size / load times for Unity WebGL.

### 4.4 The 2026 web-tech ceiling has moved up
- **WebGPU** is now a stable, cross-browser standard (Chrome/Edge/Safari 18/Firefox 130+ desktop; mobile gap closed ~March 2026). It exposes compute shaders, explicit pipelines, bindless-style binding, and a low-overhead draw-call model like DX12/Vulkan — cutting the driver overhead that throttled WebGL. Commentary frames the ceiling moving from "basic 2D + WebGL hacks" toward "Unreal-levels at 60 FPS in a tab," with 3–5× gains in some GPU-heavy workloads and steadier frame pacing on repeated scenes (no shader-compile hitches).
- **Implication for NEON BREACH:** WebGPU + WASM meaningfully narrows (not closes) the fidelity/perf gap. Photoreal AAA art + scaled server-authoritative anti-cheat netcode remain the irreducible gaps. Bet on disciplined art direction + responsiveness, not chasing photoreal.
- Sources: https://www.strayspark.studio/blog/webgpu-browser-indie-games-2026 · https://hardwaretimes.com/webgpu-vs-webgl-performance-for-browser-games-what-changes-and-how-to-test-it/ · https://cybermaxia.com/en/blog/webgpu-vs-webgl-browser-2026-render-game-konsol

---

## 5. What a web game can vs cannot realistically match

| Pillar | Web can match? | Notes |
|---|---|---|
| Gunplay feel (recoil, hitmarkers, spread, ADS) | ✅ Yes (high parity) | Pure logic + VFX/SFX; fully reproducible in JS/WebGL. |
| Movement model (sprint/slide/jump/momentum) | ✅ Yes | Math + input handling; Apex-grade feel is achievable in code. |
| Feedback / juice (shake, muzzle, tracers, decals, bloom) | ✅ Mostly | WebGL/WebGPU post-FX cover most of it; particle/decal budgets are the limit. |
| Audio (layered shots, spatialization, hierarchy) | ✅ Yes | Web Audio API supports layering, spatial panning, filtering. |
| Enemy AI (readable, communicated, squad-ish) | ✅ Yes (perceived) | F.E.A.R. lesson: fakeable convincingly; behavior trees/GOAP run fine in JS. |
| Pacing / loop | ✅ Yes | Design problem, medium-agnostic. |
| Visual fidelity (PBR, GI, mocap, hi-res assets) | ⚠️ Partial | WebGPU narrows it; photoreal AAA art + mocap pipelines are budget/medium-bound. Use strong art direction. |
| Performance (60+ FPS) | ✅ Yes with discipline | Achievable via art-budget discipline (Krunker 144+, Shell Shockers 60 on Chromebook). |
| Netcode / anti-cheat at AAA scale | ❌ Hardest gap | Server-authoritative 128-tick + robust anti-cheat in a client-readable browser is the genuine ceiling. |
| Content volume / production scale | ❌ No | Hundreds of artists / hours of content = studio production, not a small web build. |

---

## 6. Competitor Comparison Rubric (scoreable)

Use this to score NEON BREACH objectively against (a) headline AAA shooters and (b) web/open-source FPS. **Scale 1–5** per criterion (1 = broken/absent, 3 = competent/serviceable, 5 = best-in-class AAA). Weighted total = Σ(score × weight); **max weighted = 5.00**. Keep two separate target columns: "AAA bar" (what a headline title scores) and "Web bar" (what the best browser FPS scores) so we measure against the right ceiling.

| # | Criterion | Weight | What 1 looks like | What 3 looks like | What 5 looks like (AAA) |
|---|---|---|---|---|---|
| 1 | **Gunplay feel** (recoil, spread, ADS, hitmarkers, weapon distinctiveness) | **0.18** | Floaty, no feedback, undifferentiated guns | Responsive, hitmarkers, basic recoil, guns differ | CoD/CS-tier: tuned hybrid recoil, crisp hit-reg feel, every gun has identity |
| 2 | **Movement model** (responsiveness, momentum, slide/jump, skill expression) | **0.14** | Stiff, laggy, binary | Smooth sprint/crouch/jump, slide | Apex/DOOM-tier momentum + chainable skill movement |
| 3 | **Feedback / juice** (screen-shake, muzzle/tracers/decals, kill confirms, VFX) | **0.12** | None / flat | Muzzle flash, hit FX, basic shake | Layered VFX that "sells the punch," tuned, not noisy |
| 4 | **Audio** (layered weapon sounds, spatialization, footstep/cue hierarchy) | **0.12** | Single flat sample / silence | Distinct shots, basic 3D pan | Transient+body+tail layers, spatial occlusion, gameplay-relevant hierarchy |
| 5 | **Enemy AI** (readability, squad behavior, cover/environment use, adaptation) | **0.10** | Charge straight / stand still | Take cover, flank sometimes, react | F.E.A.R.-tier readable + communicated squad tactics |
| 6 | **Visual fidelity** (materials, lighting, post-FX, animation quality, art direction) | **0.10** | Untextured / broken lighting | Coherent style, basic lighting + post | Cohesive high-fidelity OR standout art direction (stylized counts) |
| 7 | **Performance** (stable FPS, frame pacing, netcode responsiveness, load time) | **0.12** | <30 FPS / hitchy / laggy net | Stable 60 FPS, basic netcode | 60–144 FPS, smooth pacing, responsive (server-auth / low-latency) hit-reg |
| 8 | **Content & variety** (weapons, maps, modes, enemies, progression) | **0.06** | 1 gun, 1 map | Several guns/maps, a mode or two | Deep arsenal, many maps/modes, progression |
| 9 | **Polish & UX** (menus, settings, onboarding, HUD clarity, accessibility, bugs) | **0.06** | Broken/confusing, bugs | Clean HUD, settings, few bugs | Console-grade UX, full settings, accessibility, robust |
| | **TOTAL** | **1.00** | | | **/ 5.00** |

**Scoring template (fill per target):**

| Criterion | Weight | NEON BREACH | AAA bar (e.g. CoD/Apex) | Best Web FPS (e.g. Krunker) |
|---|---|---|---|---|
| Gunplay feel | 0.18 | _ | 5 | 4 |
| Movement | 0.14 | _ | 5 | 4 |
| Feedback/juice | 0.12 | _ | 5 | 3 |
| Audio | 0.12 | _ | 5 | 3 |
| Enemy AI | 0.10 | _ | 5 (PvE) | 2 |
| Visual fidelity | 0.10 | _ | 5 | 3 |
| Performance | 0.12 | _ | 5 | 5 |
| Content/variety | 0.06 | _ | 5 | 4 |
| Polish/UX | 0.06 | _ | 5 | 4 |
| **Weighted total** | **1.00** | **_** | **5.00** | **~3.7** |

> Reference bars above are analyst estimates to anchor scoring (AAA = the headline ceiling; Krunker ≈ the realistic best-web ceiling). Re-score NEON BREACH each milestone. **Target:** beat the "Best Web FPS" column outright on 1–4 and 7 (the things web *can* win), and accept that 6/8 are medium-bounded.

### Weighting rationale
- **Gunplay (0.18) + Movement (0.14) + Feedback (0.12) + Audio (0.12) = 0.56** of the score sits on the four pillars that *define "feel"* and that the web medium can fully match. This is deliberately where we can win.
- **Performance (0.12)** is weighted high because (a) it's a hidden "feel" pillar (Valorant lesson) and (b) it's a web strength to exploit.
- **Visual fidelity (0.10)** and **Content (0.06)** are weighted *lower* on purpose — they're the medium-bounded categories where chasing AAA parity has the worst ROI; art direction is the lever, not raw fidelity.
- **AI (0.10)** matters for a single-player/PvE-leaning web FPS and is cheaply fakeable to high perceived quality.

---

## 7. Key takeaways for NEON BREACH
1. **"Feel" is 56% of the rubric and fully achievable on the web** — gunplay, movement, juice, audio. Win here; this is the strategy.
2. **Pick a TTK band on purpose** and tune it relentlessly — it's the most consequential and contested dial. Fast (CoD/CS) = twitch/accessibility; slower (Apex/Halo shields) = positioning/comeback depth. Match it to the chosen loop.
3. **Responsiveness/netcode is a hidden feel pillar** — Valorant proves "feels good" ≈ low input-to-photon latency + good hit-reg, not shaders. On web, prioritize stable 60+ FPS and the best hit-reg model you can ship.
4. **Bet on art direction, not photoreal** — Shell Shockers/Apex prove cohesive style beats chasing fidelity, especially with browser perf budgets; WebGPU (2026) raises the ceiling but doesn't close the AAA-asset gap.
5. **AI intelligence is fakeable** — F.E.A.R.'s lesson: readable behavior + combat barks + cover/environment use reads as "smart" without heavy compute.
6. **The realistic web ceiling exists and is beatable** — Krunker (144+ FPS, huge UGC), Shell Shockers (60 on a Chromebook), three-fps (physics + AI + animation in three.js), and sour/Qwasm (full native engines via WASM) define the bar. Out-feel them on the four feel pillars.
7. **Be honest about the two irreducible gaps** — photoreal AAA art/mocap and scaled server-authoritative anti-cheat netcode. Don't burn budget pretending the medium can erase them; weight the rubric to reflect it.

---

### Source index (primary URLs cited inline above)
CoD/TTK/feel — gamerevolution.com, dexerto.com, sportskeeda.com, callofduty.fandom.com, oneesports.gg · Battlefield — superjumpmagazine.com, battlefield.fandom.com, techradar.com · Valorant — technology.riotgames.com, techradar.com, zleague.gg, biggo.com · CS2 — blog.cs2.ad, escorenews.com, esportsinsider.com · Apex — dexerto.com, trustedreviews.com, apexlegends.fandom.com, esports.gg · DOOM — gamedeveloper.com, gdcvault.com, giantbomb.com · Halo — halowaypoint.com, steamcommunity.com · F.E.A.R./AI — vice.com, gameaipro.com, thegamer.com · Game feel/audio — strayspark.studio, arxiv.org/pdf/2011.09201, prosoundeffects.com, thegameaudioco.com, attackshark.com · Web/OSS FPS — frvr.com, webgpu.com, en.wikipedia.org, github.com (topics, three-fps, sour, simple-3d-fps) · WebGPU 2026 — strayspark.studio, hardwaretimes.com, cybermaxia.com
