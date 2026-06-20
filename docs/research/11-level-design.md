# 11 — Level Design for a Browser FPS (Wave-Survival vs AI)

Research findings + actionable spec for the level designer.
Project context: a Three.js / WebGL browser FPS (`shooter.html`), CoD-style gunplay, **first
mode = round-based wave survival vs AI bots**. Current "map" is a 190×190-unit square arena
(`ARENA = 95` half-extent) with 18 randomly placed box pillars, perimeter walls, and ring-spawned
enemies. This document is the reference for turning that into a deliberately designed map and a
repeatable level-building pipeline.

> **Sourcing note.** Many authoritative level-design sites (Valve Developer Community,
> The Level Design Book, worldofleveldesign, critpoints.net, Medium) intermittently block
> automated fetching, and web.archive.org was unreachable during research. Facts below were drawn
> from those exact pages via search indexing plus corroborating community references; URLs are
> cited inline. The two "soft" numbers worth re-checking against the live page before hard-coding
> are the crouch-hull height (54 vs 36 units) and published CS map square-meterage — both are
> flagged where they appear.

---

## 0. TL;DR — what to build first

- **Our first map is a wave-survival ARENA, not a competitive 3-lane map.** Design it around
  **kiting loops + cover islands + perimeter spawns**, not around symmetric attacker/defender lanes.
- Build a **single connected arena ≈ 40×40 m to 50×50 m** (our current 190u square ≈ ~48 m if we
  treat 1 unit ≈ 0.25 m — see scale section; keep roughly this footprint) with a **central
  full-cover landmark**, a ring of **cover islands** with real no-man's-land between them, **at least
  one full loop** the player can run to kite, and **no dead-ends that trap the player**.
- Use the **metrics cheat sheet (§4)** for concrete dimensions: cover heights, doorway/corridor
  widths, jump/step heights, player capsule.
- Pipeline: **Blockout in Blender at 1 unit = 1 m → export glTF/GLB → collision via three-mesh-bvh
  (static) or Three.js Octree → art pass later.** Author cover/spawn placement as a **data-driven
  JSON level descriptor** the game instantiates, so maps are swappable without code changes.
- Replace the 18 *random* pillars with a **handcrafted layout + optional seeded scatter** so the
  space is readable and fair.

---

## 1. Core FPS level-design principles

### 1.1 Flow (movement, loops vs dead-ends, pacing)
- **Flow** is guiding the player through the space — layout *plus* pacing. It can only be verified by
  blocking out and playtesting, not on paper.
  ([Level Design Book — flow](https://book.leveldesignbook.com/process/layout/flow))
- **Loops beat hallways.** A single hallway gives one line of sight and no options. **Loops**
  (circular routes) always give a player ≥2 options at any moment: flank, re-angle, or retreat. The
  popular Counter-Strike pattern is **three big overlapping loops with a few small loops between** —
  the sweet spot between "too few paths" (stalemate hallways) and "too many paths" (the Quake
  community's **"guess maps,"** where enemies appear from any angle and no position is holdable).
  ([critpoints — Good FPS Map Design](https://critpoints.net/2018/02/18/good-fps-map-design/))
- **Dead-ends are only acceptable if they pay off** (a pickup, a one-way drop, a power position).
  Otherwise loop the level back on itself.
- **Pacing** is the rhythm of beats. Cover systems shift combat "from fluid motion to a tactical
  rhythm of advance, entrenchment, and repositioning" — the **move → shoot → cover → reposition**
  loop. Deathmatch-flow consensus: a player should reach anywhere they want **without stopping to
  rethink the route**, and should **never be forced into a 180° turn** (it kills flow).
  ([Level Design Book — pacing](https://book.leveldesignbook.com/process/preproduction/pacing);
  [Game Developer — Deathmatch Map Design: The Architecture of Flow](https://www.gamedeveloper.com/design/deathmatch-map-design-the-architecture-of-flow))

### 1.2 Sightlines
- A **sightline** is an uninterrupted line from the camera to an important point. *Your position
  determines your line of sight to other players; a line of sight is the capability to attack them.*
  Using cover to break it is "like blocking/dodging in a fighting game" — survivability is largely a
  property of the level, not just aim.
  ([Level Design Book — sightline](https://book.leveldesignbook.com/process/combat/sightline))
- **Match sightline length to weapon range:** short (rooms, tight corners) → shotguns/SMGs; medium
  (lanes) → ARs; long (open lanes across the map) → snipers. A long open lane *is* a sniper lane
  whether intended or not.
- **The #1 mistake is a long, uncontested sightline** — it creates an unassailable position. The fix:
  shorten it, add staggered cover, add a flank to close distance, or add a counter-angle. Riot hit
  exactly this on Valorant's Sunset (a sightline cutting two-thirds across the map) and fixed it by
  **adding cover and removing some long sightlines.**
  ([oneEsports — Valorant map design](https://www.oneesports.gg/valorant/valorant-map-design-explained-riot-devs/))

### 1.3 Cover
- **Cover = any object that blocks a sightline and/or combat.** Taxonomy
  ([Level Design Book — cover](https://book.leveldesignbook.com/process/combat/cover)):
  - **Hard vs soft** — hard cover stops projectiles and usually sight (walls, crates, concrete);
    **soft cover** blocks sight but *not* bullets (foliage, smoke, grates) → concealment, not safety.
  - **Full vs half (chest/waist-high)** — full hides a standing player; **half cover** is the
    peek-and-fire staple (crouch, pop up to shoot).
  - Plus width (narrow = one angle only), facing (freestanding = fightable from all sides),
    verticality, corners, and permanence (static vs destructible).
- **A single piece of full cover in a small open area produces a "spinning/circling" duel** — players
  dance around the central pillar. This is the classic fast-arena pattern (and is exactly what our
  central landmark should be).
- **Cover-to-cover spacing / leapfrogging.** For an attacker (or the player advancing on a horde) to
  move up, cover must be spaced so the **next piece is reachable without it being suicidal to cross**
  — the level analogue of military **bounding overwatch** (fire-and-movement). A wide gap with no
  intermediate cover recreates the long-uncontested-sightline failure and freezes movement.
  ([Bounding overwatch](https://en.wikipedia.org/wiki/Bounding_overwatch))
- Balance: **cover everywhere** = no risk/no commitment (camping); **cover nowhere** = open killing
  field. Stagger it.

### 1.4 Chokepoints
- A **chokepoint** concentrates conflict (doorway, bridge, narrow gap). Deliberate chokepoints
  control pacing and create attack/defend hotspots.
- **Too few paths** → trivial defense or meat-grinder stalemate; **too many** → impossible to defend
  / "guess map." Calibrate count and width so each choke is *contestable*, not an auto-stalemate.
- **Pair every hard choke with an alternate route or flank.** Dust2 is the model: it has *no
  absolute chokepoints* — mid always offers multiple options.
  ([worldofleveldesign — 6 Principles of Choke Point Level Design](https://www.worldofleveldesign.com/categories/csgo-tutorials/csgo-principles-choke-point-level-design.php))

### 1.5 Flanking routes / multiple paths
- Positioning is the core FPS skill, so the level must offer **many routes to/from every major area**.
  Good players constantly vary their route to shake pursuers or grab pickups — loops provide this.
- **No single route should be strictly best** (else the map collapses onto it). Multiple comparable
  routes force defenders to split attention and let attackers pincer.
- Optional hard/slow flank routes should follow **risk/reward**: harder route → bigger payoff.
  ([On Game Design — Designing FPS Multiplayer Maps](https://www.ongamedesign.net/designing-fps-multiplayer-maps-part-1/))

### 1.6 Verticality
- Verticality = vertical flow (stairs, ramps, ladders, platforms, drop-downs). It adds a whole new
  axis of sightlines, cover and flanks (a catwalk over a room = overlook + drop-flank).
  ([Level Design Book — verticality](https://book.leveldesignbook.com/process/layout/flow/verticality))
- **High ground is strong** (better sightlines, grenade arcs, harder-to-hit angles). Therefore
  **counter every overlook**: limited cover up top, multiple access routes so it's contestable, a
  second angle that exposes it, or a draw (power weapon) that adds risk.
- **Use restraint** — many mechanics just need big flat floors; don't add height for its own sake.
  Raised mid-platforms are "high risk, high reward" (you see all, all see you).

### 1.7 Power positions
- A **power position** = high ground / overlook / fortified spot with good cover and escape.
- **Treyarch's rule: "every lane needs a purpose" — counter a power position with an opposing power
  position.** Plus: multiple access routes in, a counter-overlook, and limited safe cover so holding
  it carries risk.
  ([Xbox Wire — How Treyarch crafts multiplayer maps (Black Ops 7)](https://news.xbox.com/en-us/2025/10/27/how-treyarch-crafts-multiplayer-maps-call-of-duty-black-ops-7/))

### 1.8 Readability & wayfinding
- **Wayfinding** aligns space with the player's goals. Coarse wayfinding leans on familiarity with
  level conventions; **fine wayfinding uses explicit cues**: landmarks, leading lines, lighting.
  ([Level Design Book — wayfinding](https://book.leveldesignbook.com/process/blockout/wayfinding))
- **Landmarks** tell the player where they are and where to go; they also create **callouts** for
  multiplayer ("the building," "mid").
- **The Disneyland "weenie"** (Walt Disney's term): a prominent visual landmark on the horizon pulls
  guests through space — aimless environments make anxious visitors. A good weenie (1) attracts the
  eye, (2) is a navigation waypoint, (3) builds anticipation, via staging/size/form/color/motion.
  ([Level Design Book — Disneyland study](https://book.leveldesignbook.com/studies/irl/disneyland);
  [The "Weenie" — Disney's design idea](https://disneyblog.com/blog/the-weenie-walt-disneys-most-important-design-idea/))
- **Leading lines** (pipes, hedges, floor/material changes that converge) subliminally point the way.
  Players don't look up unless something draws the eye, look where they move, and are pulled by
  contrast in color/shape/light/motion — design around those tendencies.
  ([Level Design Book — critical path](https://book.leveldesignbook.com/process/layout/criticalpath))

### 1.9 Lighting to guide players
- "Player guidance is what lighting is all about." Humans **seek light**, so brightness is a pull.
  ([Level Design Book — lighting](https://book.leveldesignbook.com/process/lighting);
  [worldofleveldesign — Alan Wake: guiding the player](https://www.worldofleveldesign.com/categories/level_design_tutorials/alan-wake-guide-the-player.php))
- **Light = "go here"**: keep the forward path lit, flanks/irrelevant areas darker. **Light valuable
  items** (a brighter contrast color catches the eye). It is **contrast**, not absolute brightness,
  that reads.
- **MP/PvE caveat:** keep combat lighting **fairly even and readable** so enemies aren't lost in
  shadow; use strong directional lighting mostly for guidance/landmarks, not for hiding hostiles.

### 1.10 Common mistakes to avoid
1. **Long, uncontested sightlines** (unassailable positions) — add cover/flank/counter-angle.
2. **Single line of sight / hallway combat** — add loops.
3. **Pure dead-ends with no payoff** — loop the map back on itself.
4. **Linear single-path layouts** — give multiple routes to/from every area.
5. **"Guess maps" (too many paths)** — keep to the ~3-loops readable sweet spot.
6. **Too many/too few chokepoints** — pair chokes with alternates; no absolute chokes.
7. **Forced 180° turns** — they break flow.
8. **Random/excessive verticality** — counter every overlook; keep flat floors for mechanics.
9. **Bad spawns/timing** — spawn placement sets balance and where fights form.
10. **Hidden power pickups** — make powerful items visible focal points.
11. **No landmarks / samey geometry** — give each area a distinct identity.
12. **Cover everywhere or nowhere** — stagger for the move-shoot rhythm.

([critpoints](https://critpoints.net/2018/02/18/good-fps-map-design/);
[fat-studios — What makes a good multiplayer level](https://fat-studios.medium.com/what-makes-a-good-multiplayer-level-d604de3385dd))

---

## 2. Map archetypes

### 2.1 Arena / deathmatch (small, 2–8 players)
Tight, highly-connected, loop-heavy spaces tuned so they stay fun the 300th time. Careful item
placement, **minimal dead-ends and chokepoints**, and continuous circulation. Quake/Doom/Halo small
arenas (e.g., Halo's *Chill Out*) are the reference.
([Game Developer — Architecture of Flow](https://www.gamedeveloper.com/design/deathmatch-map-design-the-architecture-of-flow);
[Level Design Book — Chill Out study](https://book.leveldesignbook.com/studies/mp/chill-out))

### 2.2 The 3-lane archetype (Call of Duty)
- **Two outer lanes + one central lane** connecting the two spawns, **cross-connected** so players
  rotate between lanes. Standard since *Black Ops II* (2012).
- **Why it endures:** predictable, learnable flow; constant decisions without chaos; symmetric and
  easy to balance; "every lane needs a purpose" (mirror power positions).
- **The key trick is lane-mixing of weapon ranges:** the **central lane** is usually longer/open
  (ARs/snipers) while **side lanes** are tighter with rooms/corners (SMGs/shotguns), and connectors
  create mid-range fights. One map thus serves close/mid/long playstyles at once — the player picks
  range by picking a lane.
- **Criticism:** predictability also makes maps feel "samey"; some MW-era devs deliberately moved
  away from strict symmetry. Treat 3-lane as a reliable *starting skeleton* that still needs varied
  geometry, asymmetry, verticality, and distinct landmarks.
  ([SuperJump — Why Three-Lane Maps Endured in CoD](https://medium.com/super-jump/why-have-three-lane-maps-endured-in-call-of-duty-9d3d2837efc9);
  [Xbox Wire — Treyarch BO7](https://news.xbox.com/en-us/2025/10/27/how-treyarch-crafts-multiplayer-maps-call-of-duty-black-ops-7/);
  [Dexerto — MW dev on ditching 3-lane symmetry](https://www.dexerto.com/call-of-duty/modern-warfare-dev-explains-why-ditching-3-lane-symmetrical-maps-924699/))

### 2.3 Objective maps
Spawn placement and **rotation timing** (how long each side takes to reach contested points) are the
balance levers; sites need ≥2 contestable approaches so they can be both attacked and held.
(Same sources as §1.4–1.5.)

### 2.4 PvE wave-survival / horde map design (OUR FIRST MODE)
This is the most important section for us. Distilled from CoD Zombies, Left 4 Dead, Gears Horde,
Killing Floor, and FPS encounter-design theory.

**A. CoD Zombies — kiting, training, progressive unlock.**
- **Kiting / "training":** the core skill is leading the horde in **loops** to bunch them up and buy
  time. Good Zombies maps provide **wide main floors with central obstacles** that force zombies onto
  predictable **circular paths** the player runs ("training spots"); players "reload only in long
  lanes." → *Design open kiting loops with central obstacles.*
- **Barriers / windows:** zombies breach **boarded-up windows/barriers**; players re-board to slow
  them; the *Carpenter* power-up rebuilds all barriers. → *Breach points the player can reinforce add
  tactical texture.*
- **Progressive map unlock:** the map starts small; players spend points to **buy open doors / clear
  debris**, expanding the playable area over rounds. This is a great pacing tool. → *Gate-open the
  arena in stages.*
- **Spawn logic + concrete numbers:** zombies spawn **just outside the map or from inaccessible
  areas** (risers from the ground, roof drops, off-screen edges), **only from the zone the player
  currently occupies**, and **near the player** so they don't run all the way across. Barriers have
  **6 boards**; re-boarding gives +10 pts/board, the *Carpenter* power-up re-boards all (+200).
  Concurrent-alive cap ≈ **24 solo (+6 per extra player)**; spawning pauses at the cap. Round totals
  ramp gently rounds 1–4, then linear, then accelerate after ~round 10; spawn interval shrinks from
  ~2 s toward ~0.1 s by very high rounds; HP is flat early then compounds ×1.1/round; the last
  straggler sprints from round 4 so rounds never stall.
  ([CoD Wiki — Treyarch Zombies](https://callofduty.fandom.com/wiki/Zombies_(Treyarch));
  [Nazi Zombies Wiki — Barriers](https://nazizombies.fandom.com/wiki/Barriers);
  [CoD Wiki — Zombie](https://callofduty.fandom.com/wiki/Zombie))

**B. Left 4 Dead — the AI Director & pacing.**
- The **AI Director** is "procedural narrative," not random spawning: it reads how well players are
  doing and adjusts **spawns, item placement, and even re-paths the level** (e.g., gravestones force
  longer routes when players are doing well).
- It runs a **per-survivor intensity model (0→1)** — rises on damage taken, incapacitation, and
  *nearby* infected deaths (weighted by inverse distance), decays only when *not* in combat — driving
  a four-phase loop: **Build-Up** (full population until intensity crosses the peak threshold) →
  **Sustain Peak** (hold full population ~**3–5 s** so peaks aren't abrupt) → **Peak Fade** (stop
  spawning, wait for a natural break) → **Relax** (minimal population ~**30–45 s** or until the team
  advances enough), then loop. *This is the model we should adopt instead of a pure fixed timer.*
- **Crescendo events / finales** are scripted holdout peaks (button/alarm/door triggers) that
  manufacture a guaranteed peak and double as regroup beats; the Director pauses normal spawns during
  them while survivors are in the event area. The "Gauntlet" variant *doesn't* stop spawning — you
  must keep moving. Spawning is **off-screen, distance-banded, and position-bucketed** (ahead/behind/
  above the team), never in visible ("wet") areas, via two delivery modes: **wanderers** (low-rate
  drip for ambient tension) and **mob/horde bursts** (~10–30 commons on a ~1–4 min cadence). Valve's
  spatial vocabulary worth adopting — **Funnel** (channels horde into a killable stream = a good
  holdout), **Narrow Flow** (coverable front/back = manageable), **Wide Flow** (too wide to cover =
  forces commitment, raises stress), **Capillaries** (small dead-end pockets = spawn closets + item
  caches + dodge spots). The level is a **critical path** with safe rooms (warm palette = safe).
  → *Even with a fixed wave script, build an intensity curve: bursts, then lulls; cap "max alive."*
  ([Valve — The AI Systems of Left 4 Dead (Mike Booth, GDC)](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf);
  [L4D Wiki — The Director](https://left4dead.fandom.com/wiki/The_Director);
  [Game Developer — The Discomfort Zone: Valve's AI Director](https://www.gamedeveloper.com/design/the-discomfort-zone-the-hidden-potential-of-valve-s-ai-director))

**C. Gears of War Horde — defensible holdout + fallback lines.**
- A movable **Fabricator** anchors a defended zone; players build **fortifications (barriers,
  turrets)**. Maps are designed so **portions are more defensible than others** (good sightlines,
  limited approaches).
- The Fabricator **suppresses spawns near it**, so its placement defines the defensive footprint
  (edge = one direction to watch; center = 360°). Build **outward in successive defensive lines** for
  **fallback positions**; space turrets so one explosion can't wipe them all.
- **The "no perfect corner" rule (explicit design law):** no position should have high tactical value
  with *no obvious weakness* — that's a camping spot and a design failure. No cover should be hittable
  from only one side; strong spots must have a back-door flank or a sightline blind to one lane.
- **Force movement with relocating objectives:** Gears 5 Power Taps spawn *away* from the Fabricator,
  reward a split-and-defend, and **relocate after ~10 waves** so no setup is permanent. Rotating the
  kill-zone *angle* each wave is the active mechanism against static camping.
  → *Provide a strong-but-not-perfect holdout with a fallback; converge multiple lanes on it; rotate
  the threatened direction and relocate the objective so no corner stays solved.*
  ([GamesRadar — Gears 4 Horde is hyper-violent tower defense](https://www.gamesradar.com/gears-of-war-4s-horde-mode-is-a-hyper-violent-take-on-tower-defense/);
  [Gears Wiki — Horde](https://gearsofwar.fandom.com/wiki/Horde);
  [TechRaptor — Gears 5 Horde guide](https://techraptor.net/gaming/guides/gears-5-horde-guide);
  [Level Design Book — balance](https://book.leveldesignbook.com/process/combat/balance))

**D. Killing Floor / Vermintide — kiting space vs choke risk.**
- **Sightlines vs vulnerability define tempo:** open sightlines feel safe *until a group spawns
  behind you*. **Circular paths let you kite** when you can't hold a choke.
- **Chokes (stairs, doorways, narrow halls) limit how many enemies attack at once — but relying on
  one choke is disastrous when a big enemy breaks it and you have nowhere to fall back.** Some maps
  let you **weld doors closed** to redirect the horde down other corridors.
- **Max-alive cap matters:** KF caps concurrent enemies; while you kite that many behind you, none
  new spawn until you kill one. Spawn into a **ring around the player that moves inward**, only where
  there's **no line of sight**. KF2's per-volume tunables are a copyable spec: **Min Distance to
  Player** (no point-blank spawns), **Max Distance to Player** (controls warning time), **Max Height
  Diff**, **Desirability Mod**, and an **Out-of-Sight** override. Crucially, **a player standing in a
  spawn volume disables it** (with a reactivation cooldown) — this prevents spawn-on-top AND defeats
  spawn-camping at once; use *solid* occluders (not see-through fences) or enemies pop into view while
  technically "out of sight." Between waves, only the **nearest trader pod opens** (~60–90 s window)
  and rotates each wave — never a single trader — explicitly to prevent room-camping.
  → *Use a max-alive cap; ring spawns with min/max distance bands behind solid occluders; disable
  spawn volumes the player occupies; rotate the resupply point; ensure kiting space; never make a
  single choke the only viable strategy.*
  ([KF2 Wiki — Setting Up Spawns](https://wiki.killingfloor2.com/index.php?title=Setting_Up_Spawns_(Killing_Floor_2));
  [KF2 Wiki — Setting Up Traders](https://wiki.killingfloor2.com/index.php?title=Setting_Up_Traders_(Killing_Floor_2));
  [Killing Floor — Maps & Environments](https://www.killingfloorthegame.com/maps-and-environments))
- **Vermintide's director = the same intensity loop as L4D** (Build-up → Sustain Peak → Peak Fade
  ~3–5 s → Relax); high threat *suppresses* new hordes so pressure never double-stacks; hordes arrive
  in 3 waves that **alternate sides** to keep the party turning; ambushes skip the audio telegraph.
  ([Vermintide 2 Wiki — Inner Systems](https://vermintide2.fandom.com/wiki/Inner_Systems);
  [Vermintide 2 Wiki — Hordes](https://vermintide2.fandom.com/wiki/Hordes))

**E. Encounter / combat-space design for AI fights (Halo, F.E.A.R., Far Cry).**
- **Arena sizing (concrete):** the Level Design Book's *Classic Combat* project caps a combat arena
  at **~1024 units wide** with feeder hallways **128+ units** wide — one central area with multiple
  in/out passages, non-linear, with legible perimeter borders. For PvE (vs AI) **err toward more
  cover** (more player options); for PvP, less.
  ([Level Design Book — Classic Combat](https://book.leveldesignbook.com/learning/projects/classic-combat))
- **Halo's "30 seconds of fun" — nested timescales:** a recyclable feedback loop of challenge +
  multiple ways to beat it in ≤30 s. Three nested loops: **3-second** (moment-to-moment) inside
  **30-second** (the *AI's* job: where to stand, when to shoot, when to dive from a grenade) inside
  **3-minute** (the *designer's* job: reinforcements, retreats, tactics). AI are given **territories
  to occupy** so the room doesn't dogpile the player; Halo 3 authored fights as **task-trees**
  (prioritized tasks with activation conditions that phase the fight: opening → player gains control →
  last stand).
  ([Game Developer — Combat Evolved: Encounter Design of Halo 3](https://www.gamedeveloper.com/design/combat-evolved-the-encounter-design-of-halo-3);
  [Engadget — Half-Minute Halo (Griesemer interview)](https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html))
- **The combat-box rule (F.E.A.R.):** the best combat space is **arena-like and varied with flanking
  opportunities; the closer it drifts to a hallway, the less interesting it is.** Cover should be
  **discrete clustered islands** (not even scatter — that creates visual noise + AI pathing problems
  + player snagging), with the **most-useful cover in a mid-orbital ring** that pulls the player in
  and the **center left as a no-man's-land**, adjacent cover **within one sprint distance**, the space
  **circularly navigable**, and interiors with **>2 entry points**. Vocabulary: *enfilade* (fired on
  along the long axis = bad) vs *defilade* (shielded = good). Notably, F.E.A.R.'s acclaimed AI used
  simple **GOAP** ("Goto / Animate / UseSmartObject") and **flanking was an emergent side-effect of
  cover placement**, not hardcoded — so good geometry literally *makes the AI look smart*. AI needs
  space to flank.
  ([Fullbright — Basics of effective FPS encounter design (F.E.A.R.)](http://www.fullbrightdesign.com/2009/02/basics-of-effective-fps-encounter.html);
  [Game Developer — Building the AI of F.E.A.R. with GOAP](https://www.gamedeveloper.com/design/building-the-ai-of-f-e-a-r-with-goal-oriented-action-planning);
  [Level Design Book — encounter](https://book.leveldesignbook.com/process/combat/encounter))
- **Encounter openers & Far Cry's "360 / approach-zones":** proven openers — start enemies *unaware*
  (recon then strike), trigger spawns on crossing a **midfield threshold**, or a one-way "airlock"
  entry that commits the player; make the entry double as an elevated **vantage** for planning.
  Ubisoft's formal method (Bergeron, GDC 2016): define **multiple approach zones** around an objective,
  each tuned to a playstyle (stealth / sniper / assault / grenadier / melee), then "distribute the
  ingredients" across them — a Far Cry outpost holds ~5–10 mixed-role enemies and disabling the alarm
  stops reinforcements.
  ([GDC Vault — Level Design Workshop: 360 / Approach](https://www.gdcvault.com/play/1023550/Level-Design-Workshop-360-Approach);
  [Far Cry Wiki — Outposts (FC3)](https://farcry.fandom.com/wiki/Outposts/FC3))

**F. Spawn-system design for waves (the cross-game consensus, made concrete).**
- **Placement rules:** spawn in a **ring/band around the player** with a hard **min distance**
  (no point-blank/telefrag) and a **max distance** (warning time); **never in line of sight** (exclude
  visible areas, disguise origins as vents/risers/broken walls, use *solid* occluders); **bucket by
  position** (ahead / behind / above) and **rotate the active side each wave** (behind reads as an
  ambush); a **player standing on a spawn point disables it** (cooldown) to stop spawn-on-top and
  defeat camping; keep spawns **off the main kiting lane**; let far enemies speed up rather than
  teleport onto the player.
- **Timing — run two systems:** a low-rate **wanderer trickle** for constant ambient tension
  (suppressed during the relief beat) + **horde bursts** (groups with recovery pauses) gated by the
  pacing state machine, plus capped, position-aware **specials/elites** on a cooldown.
- **Per-wave parameter schema (copyable):** each wave = `{ spawnRate, duration, maxAlive,
  maxTotal, killTarget }`; a wave ends when *killTarget hit* OR *duration elapsed* OR
  *(maxTotal reached AND none alive)*. Escalation: count ~doubles per wave up to a performance cap;
  speed ramps gently; HP scales (flat early, exponential later). **A max-alive cap is essential for
  web performance** (≳20 concurrent enemies hurts) — queue the rest and pause at the cap.
- **Prefer an intensity-driven director over a fixed timer:** track per-player intensity 0–1 (rise on
  damage/near-death/close kills, decay out of combat) and ramp below peak → hold ~3–5 s at peak →
  hard-stop and let the fight end → guaranteed ~30–45 s lull → next cycle with escalated caps. Make
  **difficulty shrink the lull and raise caps**, not just inflate HP.
- **Keep the action moving (anti-turtle toolbox):** rotate the threatened direction; **relocate the
  objective/resupply** away from the hold; **open/close areas** over time (buy-to-open gating, or
  peak-time doors that convert a safe space into a panic space); and an **aggression-rewarding
  economy** (DOOM "push-forward combat" — health/ammo gained by aggressive play) so camping loses.
  ([CraftMyGame — Wave & Spawn System](https://craftmygame.com/features/wave-spawn);
  [Valve — AI Systems of L4D (Mike Booth)](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf);
  [KF2 Wiki — Setting Up Spawns](https://wiki.killingfloor2.com/index.php?title=Setting_Up_Spawns_(Killing_Floor_2));
  [Game Developer — Pushing Push-Forward Combat](https://www.gamedeveloper.com/blogs/pushing-push-forward-combat-with-gameplay))

---

## 3. Metrics & scale — concrete numbers a level builder can use

### 3.1 Engine scale conversions (so we can borrow pro numbers)
| Engine / game | Native unit | Real-world scale |
|---|---|---|
| **Source / GoldSrc** (Half-Life, Counter-Strike) | Hammer unit | **1 u = 1 inch = 2.54 cm**; 16 u = 1 ft; **~40 u = 1 m**; player ≈ 6 ft |
| **Quake 1/2/3** | Quake unit | ~1 u ≈ 1 inch (loose); community 64 u ≈ 1.7 m (~37.6 u/m) |
| **Doom** | map unit | 16 horizontal u = 1 ft (~52 u/m); vertical squashed (10 u = 1 ft) |
| **Call of Duty** | unit | **1 u = 1 inch = 2.54 cm** (same as Source) |
| **Unreal Engine 4/5** | Unreal Unit | **1 UU = 1 cm**; 100 UU = 1 m; default character = 180 UU ≈ 6 ft |
| **Unity / Three.js** | meter | **1 unit = 1 m** (our project should adopt this) |

([worldofleveldesign UE5 scale](https://www.worldofleveldesign.com/categories/ue5/guide-to-scale-dimensions-proportions.php);
[Quake Wiki — unit](https://quakewiki.org/wiki/unit);
[eev.ee — Doom scale](https://eev.ee/blog/2016/10/10/doom-scale/);
[VDC — Dimensions (HL2 & CS:S)](https://developer.valvesoftware.com/wiki/Dimensions_(Half-Life_2_and_Counter-Strike:_Source)))

> **Our project's unit decision:** **adopt 1 Three.js unit = 1 meter** (matches glTF/Blender/Rapier
> conventions). The metric column below is what we type into the game. The current `shooter.html`
> uses an abstract unit where the player capsule is ~1.35 tall, so it's already roughly 1 unit ≈ 1 m;
> formalize that.

### 3.2 The numbers, normalized to METERS (with the engine each came from)

| Metric | Recommended (meters) | Source value | Notes |
|---|---|---|---|
| Player capsule radius | **0.30–0.40 m** | three.js fps = 0.35; UE = 0.34; Source hull = 0.41 (16 u) | three.js `games_fps` uses radius 0.35 |
| Player height (standing) | **1.8 m** | Source 72 u (1.83 m); UE 1.8 m | ≈ 6 ft |
| Player height (crouched) | **0.9–1.4 m** | Source 36 u (HL2) / 54 u CS:GO; CS uses 1.37 m | crouch number is the soft one |
| Eye height (standing / crouched) | **1.6 m / 0.7 m** | Source 64 u / 28 u | |
| Walk speed | **~3–4 m/s** | CoD4 ~4.8 m/s base; Apex walk 3.8 | |
| Run / sprint speed | **~6–8 m/s** | CS 6.35; HL2/Quake ~8; Apex sprint 5.7; OW 5.5 | |
| Jump height (clearance) | **~0.5–1.0 m** | Source +0.53 m; OW peak 0.98 m | three.js fps jump velocity = 15, GRAVITY = 30 |
| Crouch-jump reach (Source) | **~1.6 m** | Source ~62 u | only if we add crouch-jump |
| Max auto-step height | **~0.3–0.45 m** | Source/Quake/CoD 18 u = 0.46 m; UE 45 cm | climb without jumping |
| Max walkable slope | **~45°** | Source ~45.57°; UE 44.77° | three.js fps uses normal.y ≥ 0.15 |
| **Low (chest/waist) cover height** | **1.0–1.2 m** | must hide crouched player; real chest-high ~1.0 m | peek-and-fire |
| **Full (standing) cover height** | **≥ 1.8 m (use 2.0–2.5 m)** | must hide standing hull (≥72 u) | go taller to block jump-peeks |
| Doorway opening (W × H) | **1.2–2.4 m × 2.0–2.85 m** | Source 48–96 u × 80–112 u | wider than reality feels better |
| Corridor width | **min 1.6 / typical 2.4–3.3 / generous 4–6 m** | Source 64 / 96–128 / 160–256 u | min ≥ 2× player width |
| Wall / ceiling (one storey) | **3.0–3.3 m** | Source 128 u; UE 3–4 m | |
| Stair rise / run (comfortable) | **0.2 m / 0.3–0.4 m** | CoD/Source design ~8 u rise | auto-step covers up to 0.46 m |
| Safe fall (no damage) | **≤ ~5 m** | Source ~210 u | velocity-based in Source |
| Fatal fall (kills 100 HP) | **≥ ~16 m** | Source ~655 u | design lethal pits at this depth |

(Per-row sources consolidated:
[VDC — Dimensions (HL2 & CS:S)](https://developer.valvesoftware.com/wiki/Dimensions_(Half-Life_2_and_Counter-Strike:_Source));
[VDC — CS:GO Mapper's Reference](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive/Mapper's_Reference);
[Counter-Strike Wiki — Movement](https://counterstrike.fandom.com/wiki/Movement);
[Level Design Book — cover](https://book.leveldesignbook.com/process/combat/cover) &
[metrics](https://book.leveldesignbook.com/process/blockout/metrics);
[Overwatch Wiki — Movement speed](https://overwatch.fandom.com/wiki/Movement_speed);
[Apex Wiki — Movement](https://apexlegends.fandom.com/wiki/Movement);
[Source vs GoldSrc slopes](https://www.ryanliptak.com/blog/source-vs-goldsrc-movement-slopes/);
[three.js `games_fps` source](https://github.com/mrdoob/three.js/blob/dev/examples/games_fps.html).)

> **Critical cover rule:** make low cover tall enough to **fully** hide the *crouched* player and
> full cover tall enough to hide the *standing* player **plus jump-peek margin**. Cover slightly
> shorter than the pose it's meant to protect is worthless.

### 3.3 Playable area sizes & player counts
| Map type | Footprint (meters) | Players |
|---|---|---|
| Small DM / arena | **~30×30 to 60×60 m** | 2–8 |
| 3-lane competitive (CS / Valorant style) | **~80×80 to 120×120 m** (Dust ≈ 115×110 m) | 5v5 (10) |
| Larger objective | **150 m+ per side** | 16–32+ |
| **Our wave-survival arena (recommended)** | **~40×40 to 50×50 m** single connected space | 1 player vs many AI |

(Concrete reference: a real-world Dust replica was proposed at **115 × 110 × 15 m** ≈ 1.2 ha.
[Kotaku — life-size Dust replica](https://kotaku.com/artist-wants-to-make-a-life-size-replica-of-counter-str-5817257);
[Counter-Strike Wiki — Dust II](https://counterstrike.fandom.com/wiki/Dust_II).)

> Our current arena is 190 units square. If we standardize on **1 unit = 0.25 m** it's ~48×48 m
> (good wave-survival size); if **1 unit = 1 m** it's a 190×190 m field (too big/empty for one
> player). **Recommendation: shrink the arena to ~45 m square in 1-unit-=-1-m terms** and fill it
> with deliberate cover islands rather than 18 random pillars.

---

## 4. Level-building workflow for a Three.js game

### 4.1 Blockout / greybox in Blender
- **Set scale to 1 Blender unit = 1 meter** (Blender's default; glTF preserves it). Drop a **player
  reference cube ~0.4 × 0.4 × 1.8 m** in the scene so all geometry is sized against the real player.
- Block out with simple boxes/planes, **snap to a grid** (Blender: hold Ctrl; set grid to 1 m, snap
  increments to 0.25 m). Greybox first, validate flow by importing and walking it, **then** art pass.
- Apply all transforms (`Ctrl+A → All Transforms`) before export so scale/rotation bake in.
  ([Blender glTF 2.0 manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html);
  [Level Design Book — blockout](https://book.leveldesignbook.com/process/blockout))

### 4.2 Modular kit-bashing
- Build a **modular kit** (walls, floors, doorways, cover pieces, ramps) on a consistent grid so
  pieces snap together. Standard grid = **1 m**, with snap to **0.25 m** for detail; keep dimensions
  to clean fractions. Use **trim sheets** to texture many pieces from one atlas.
  ([Level Design Book — modular kit design](https://book.leveldesignbook.com/process/blockout/metrics/modular))
- **Free CC0 kits usable in a web FPS:** **Kenney** (kenney.nl — modular environment/shooter kits,
  fully CC0) and **Quaternius** (quaternius.com — CC0 modular packs). Low-poly, browser-friendly.
  ([Kenney assets](https://kenney.nl/assets))

### 4.3 glTF / GLB export → Three.js
- **glTF/GLB is the Three.js-recommended format** ("the JPEG of 3D"). Use **`.glb`** (single binary
  file, bundles geometry + textures). Add **Draco** (geometry) or **meshopt** compression as a
  **final step only** (Draco is lossy — keep the uncompressed master).
- Export gotchas: **apply transforms**, watch **Y-up** (glTF is Y-up — matches Three.js, good),
  use **clear object names** (the game can find cover/spawns by name), and **export collision meshes
  as separate, named, low-poly objects** (e.g., a `*_collider` convention) rather than colliding
  against render meshes.
  ([Blender glTF manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html);
  [glTF-Transform — Draco compression](https://github.com/donmccurdy/glTF-Transform/discussions/347);
  [funwithtriangles — Blender→Three.js export guide](https://github.com/funwithtriangles/blender-to-threejs-export-guide))

### 4.4 Collision generation for Three.js FPS
Three solid options; we should pick by complexity:

1. **Three.js `Octree` + `Capsule`** (what the official `games_fps` example uses). Build
   `worldOctree.fromGraphNode(level.scene)` once from the level GLB; resolve player movement with
   `worldOctree.capsuleIntersect(playerCollider)`. Constants from the example: **player capsule
   radius 0.35, segment 0.35→1.0; `GRAVITY = 30`; jump velocity `15`; grounded speed factor `25`,
   air `8`; on-floor test `result.normal.y >= 0.15`.** Zero dependencies, simplest path.
   ([three.js `games_fps`](https://github.com/mrdoob/three.js/blob/dev/examples/games_fps.html))
2. **three-mesh-bvh** for static-level collision: build a BVH on a merged level mesh and use
   `shapecast` for triangle-accurate **capsule** collision + raycasts (also great for **bullet
   raycasts** against the level). Fast (broad-phase box test, then narrow-phase triangle test),
   60 fps against complex meshes. Best when we want one robust system for both movement and shooting.
   ([three-mesh-bvh (gkjohnson)](https://github.com/gkjohnson/three-mesh-bvh);
   [BVH collision how-to](https://medium.com/@pablobandinopla/collision-detection-in-threejs-made-easy-using-bvh-1ce6012199e8))
3. **Rapier** (`@dimforge/rapier3d`, WASM) — full physics: trimesh static colliders + a built-in
   **kinematic character controller** (capsule recommended). Use only if we want real physics
   (ragdolls, dynamic debris, grenades pushing objects). Heavier than needed for a static arena.
   ([Rapier — character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/);
   [doppl3r — Rapier+Three.js kinematic controller example](https://github.com/doppl3r/kinematic-character-controller-example))

**Recommendation for our wave-survival arena:** the geometry is mostly **axis-aligned boxes**, so we
can keep the *current* fast box-collision push-out for the player and **box/sphere raycasts for
bullets** — it's already working in `shooter.html`. When we move to glTF art passes, adopt **Octree +
Capsule** (matches the canonical example and our box geometry) or **three-mesh-bvh** if we want one
system for movement + bullets. Defer Rapier until we want dynamic physics objects.

### 4.5 In-engine / editor & data-driven levels
- **Author levels as data, not code.** Keep a **JSON level descriptor** the game instantiates at load
  time (arena bounds, cover list, spawn points, player start, lights). This makes maps **swappable
  without touching game logic** and supports multiple maps + a future editor.
- Tooling options to *produce* that JSON: the **three.js editor** (threejs.org/editor) for scene
  layout, or lightweight browser level editors that export plain JSON
  ([Three.js Level Creator](https://defacci.itch.io/threejs-level-creator)). Three.js also has a
  native **Object/Scene JSON format**, but a **custom, game-specific schema** (below) is easier to
  hand-edit and to drive gameplay (typed cover, spawn metadata).
  ([three.js JSON Scene format](https://github.com/mrdoob/three.js/wiki/JSON-Object-Scene-format-4))

### 4.6 Web performance
- **Target < 100 draw calls/frame** (≥500 = optimize).
- **`InstancedMesh`** for repeated identical cover (all pillars in one draw call); **`BatchedMesh`**
  (r156+) if instances need differing geometry; **`BufferGeometryUtils.mergeGeometries`** to merge
  static, non-moving geometry into single draws.
- **Atlas textures**, keep triangle counts low (low-poly CC0 kits), and add **LOD** for distant
  detail. Build the **collision mesh from merged low-poly geometry**, separate from render meshes.
  ([three.js InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html);
  [100 Three.js performance tips (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips);
  [Draw Calls: The Silent Killer](https://threejsroadmap.com/blog/draw-calls-the-silent-killer))

---

## 5. Procedural vs handcrafted, and our level-data structure

### 5.1 Procedural vs handcrafted
- **Handcrafted** = readable, fair, memorable, callout-able — but authoring cost per map.
- **Procedural** = infinite variety + replay, but risks unreadable/unfair layouts (long uncontested
  sightlines, blocked paths, enemies spawning in your face).
- **Recommended hybrid for wave survival:** **handcraft the arena shell** (bounds, loops, the central
  landmark, fixed spawn nodes, the holdout + fallback) and **optionally seed-scatter the smaller
  cover** within designer-set constraints (min spacing = leapfrog distance; never block a loop; keep
  one full-cover island per quadrant). This keeps fairness/readability while giving run-to-run
  variety. (Mirrors L4D's "fixed critical path, Director varies the details.")

> Our current map *randomizes* all 18 pillars every load — that's the unreadable extreme. Replace it
> with a **handcrafted base layout** plus a **seeded** (reproducible) optional scatter.

### 5.2 Recommended level-data schema (data-driven JSON)
Store each map as a descriptor the game reads; keep heavy art in a referenced GLB.

```jsonc
{
  "name": "arena_01_neon",
  "units": "meters",                 // 1 three.js unit = 1 m
  "bounds": { "type": "box", "min": [-22, 0, -22], "max": [22, 8, 22] },
  "playerStart": { "pos": [0, 1.6, 18], "yaw": 180 },

  "geometry": {                      // option A: reference an art GLB...
    "gltf": "maps/arena_01.glb",     //   render + named *_collider meshes baked in
    "collider": "octree"             //   "octree" | "bvh" | "boxes"
  },

  "cover": [                         // ...option B: data-driven primitive cover (current style)
    { "type": "full",  "pos": [0, 1.25, 0],  "size": [3, 2.5, 3], "rot": 0, "tag": "landmark" },
    { "type": "low",   "pos": [8, 0.55, 6],  "size": [3, 1.1, 1.5], "rot": 0.4 },
    { "type": "low",   "pos": [-8, 0.55, 6], "size": [3, 1.1, 1.5], "rot": -0.4 }
    // type drives gameplay: "full" blocks sight+bullets, "low" = peek-and-fire, "soft" = sight only
  ],

  "loops": [ [ [0,12],[14,0],[0,-14],[-14,0] ] ],   // polyline hints for kiting/wayfinding

  "spawns": [                        // perimeter nodes, used out of player view
    { "pos": [20, 0, 20], "minDistToPlayer": 12, "group": "ring" },
    { "pos": [-20, 0, 20], "minDistToPlayer": 12, "group": "ring" }
  ],
  "spawnRules": { "maxAlive": 18, "dripSeconds": [0.5, 1.0], "spawnOutOfView": true },

  "holdout": { "pos": [-16, 0, -16], "fallback": [0, 0, 0] },

  "lights": [
    { "type": "hemi", "intensity": 0.5 },
    { "type": "point", "pos": [0, 6, 0], "color": "#1de9ff", "intensity": 1.2, "marksLandmark": true }
  ]
}
```

- **Pros (data-driven JSON):** hand-editable, hot-swappable, multiple maps trivially, gameplay
  metadata (cover *type*, spawn *minDistToPlayer*) lives with the layout, tiny file. Matches how the
  game already builds boxes procedurally — minimal refactor.
- **Pros (bake into GLB):** richer art, authored in Blender/editor visually, one asset to load.
- **Recommendation:** **JSON descriptor as the source of truth**, optionally pointing at a GLB for
  art. Start with primitive `cover[]` (current box style, just deliberate not random); add the GLB
  path when we do the art pass. Cover `type` strings drive both rendering and the LOS/collision rules
  the game already has.

---

## 6. Recommendations for our first map(s)

**Map 1 — "Arena 01" (wave survival, the one to build now):**
1. **Footprint ~40–50 m square** (matches the Level Design Book's ~1024-unit combat-arena cap and a
   small-arena footprint), single connected **loopable** space, ceiling/walls ~6–8 m (current `ARENA`
   shrunk and formalized at 1 unit = 1 m). Legible perimeter borders the player reads on entry.
2. **Central full-cover landmark** (a tall lit structure ~3 m wide, ≥2.5 m tall) — doubles as the
   Disneyland "weenie" (lit point light, `marksLandmark`) and the circle-strafe duel pillar.
3. **8–12 cover islands** (not 18 random pillars), mixing **low cover (1.0–1.2 m)** and **full cover
   (≥2.0 m)**, placed as discrete islands with **real no-man's-land** between, spaced at **leapfrog
   distance (~4–8 m)** so the player can advance/retreat. One full-cover island per quadrant.
4. **At least one clear kiting loop** around the central landmark and along the perimeter; **no
   dead-ends** that trap the player.
5. **A "holdout" corner** with good cover but **one open flank**, plus a **fallback** toward center —
   so camping works briefly but the player is forced to rotate.
6. **Perimeter spawn nodes out of view**, distance-banded (`minDistToPlayer ≥ 12 m`, a max for
   warning time), **bucketed and rotated** (alternate the active side each wave), with **a node
   disabled when the player stands on it**. **Drip-feed** (wanderer trickle + horde bursts) with a
   **max-alive cap (~18)** and escalate per wave; prefer an **intensity-driven director** (build →
   peak ~3–5 s → fade → ~30–45 s lull) over a fixed timer; difficulty shrinks the lull, not just HP.
7. **Anti-turtle:** rotate the threatened direction; **relocate the resupply/objective** so the
   player must leave any corner; reward aggression (health/ammo on the offensive). No "perfect corner."
8. **Even, readable lighting** for combat clarity; reserve bright contrast for the landmark and
   pickups. Keep enemy materials/heads readable against the floor.
9. **Mild verticality only** (one low platform/ramp with two access routes and a counter-angle) — not
   oppressive; lots of flat floor for the AI to fight (and flank) on.

**Map 2 — "Lanes" (later, when we add PvP or varied PvE):** a compact **3-lane** layout (central
long lane for ARs, tight side lanes for close range, cross-connectors) using the same kit + JSON
schema, to validate the pipeline on a second archetype.

**Process:** greybox in Blender at 1 u = 1 m with a player-reference cube → walk it in-engine →
iterate flow/spawns (the things you can't get right on paper) → art pass with a CC0 modular kit →
keep everything driven by the JSON descriptor.

---

## 7. Source list (grouped)

**Principles / map design**
- The Level Design Book — [flow](https://book.leveldesignbook.com/process/layout/flow),
  [pacing](https://book.leveldesignbook.com/process/preproduction/pacing),
  [sightline](https://book.leveldesignbook.com/process/combat/sightline),
  [cover](https://book.leveldesignbook.com/process/combat/cover),
  [encounter](https://book.leveldesignbook.com/process/combat/encounter),
  [verticality](https://book.leveldesignbook.com/process/layout/flow/verticality),
  [wayfinding](https://book.leveldesignbook.com/process/blockout/wayfinding),
  [critical path](https://book.leveldesignbook.com/process/layout/criticalpath),
  [lighting](https://book.leveldesignbook.com/process/lighting),
  [Disneyland study](https://book.leveldesignbook.com/studies/irl/disneyland)
- [critpoints — Good FPS Map Design](https://critpoints.net/2018/02/18/good-fps-map-design/)
- [Game Developer — Deathmatch Map Design: The Architecture of Flow](https://www.gamedeveloper.com/design/deathmatch-map-design-the-architecture-of-flow)
- [SuperJump — Why Three-Lane Maps Endured in CoD](https://medium.com/super-jump/why-have-three-lane-maps-endured-in-call-of-duty-9d3d2837efc9)
- [Xbox Wire — How Treyarch crafts BO7 maps](https://news.xbox.com/en-us/2025/10/27/how-treyarch-crafts-multiplayer-maps-call-of-duty-black-ops-7/)
- [oneEsports — Valorant map design (Riot devs)](https://www.oneesports.gg/valorant/valorant-map-design-explained-riot-devs/)
- [worldofleveldesign — Choke Point principles](https://www.worldofleveldesign.com/categories/csgo-tutorials/csgo-principles-choke-point-level-design.php)
- [On Game Design — Designing FPS Multiplayer Maps](https://www.ongamedesign.net/designing-fps-multiplayer-maps-part-1/)
- [The "Weenie" — Walt Disney's design idea](https://disneyblog.com/blog/the-weenie-walt-disneys-most-important-design-idea/)

**PvE / wave-survival / encounter design**
- [Valve — The AI Systems of Left 4 Dead (Mike Booth)](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)
- [Game Developer — The Discomfort Zone: Valve's AI Director](https://www.gamedeveloper.com/design/the-discomfort-zone-the-hidden-potential-of-valve-s-ai-director)
- [L4D Wiki — The Director](https://left4dead.fandom.com/wiki/The_Director) · [VDC — Left 4 Dictionary (spatial grammar)](https://developer.valvesoftware.com/wiki/Left_4_Dictionary) · [VDC — L4D2 Director Scripts](https://developer.valvesoftware.com/wiki/L4D2_Director_Scripts)
- [CoD Wiki — Treyarch Zombies](https://callofduty.fandom.com/wiki/Zombies_(Treyarch)) · [Nazi Zombies Wiki — Barriers](https://nazizombies.fandom.com/wiki/Barriers) · [CoD Wiki — Zombie](https://callofduty.fandom.com/wiki/Zombie)
- [GamesRadar — Gears 4 Horde](https://www.gamesradar.com/gears-of-war-4s-horde-mode-is-a-hyper-violent-take-on-tower-defense/) · [Gears Wiki — Horde](https://gearsofwar.fandom.com/wiki/Horde) · [TechRaptor — Gears 5 Horde guide](https://techraptor.net/gaming/guides/gears-5-horde-guide)
- [KF2 Wiki — Setting Up Spawns](https://wiki.killingfloor2.com/index.php?title=Setting_Up_Spawns_(Killing_Floor_2)) · [KF2 Wiki — Setting Up Traders](https://wiki.killingfloor2.com/index.php?title=Setting_Up_Traders_(Killing_Floor_2)) · [Killing Floor — Maps & Environments](https://www.killingfloorthegame.com/maps-and-environments)
- [Vermintide 2 Wiki — Inner Systems](https://vermintide2.fandom.com/wiki/Inner_Systems) · [Vermintide 2 Wiki — Hordes](https://vermintide2.fandom.com/wiki/Hordes)
- [Game Developer — Combat Evolved: Encounter Design of Halo 3](https://www.gamedeveloper.com/design/combat-evolved-the-encounter-design-of-halo-3) · [Engadget — Half-Minute Halo (Griesemer)](https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html)
- [Fullbright — Basics of effective FPS encounter design (F.E.A.R.)](http://www.fullbrightdesign.com/2009/02/basics-of-effective-fps-encounter.html) · [Game Developer — Building the AI of F.E.A.R. (GOAP)](https://www.gamedeveloper.com/design/building-the-ai-of-f-e-a-r-with-goal-oriented-action-planning)
- [GDC Vault — Level Design Workshop: 360 / Approach (Far Cry)](https://www.gdcvault.com/play/1023550/Level-Design-Workshop-360-Approach) · [Far Cry Wiki — Outposts (FC3)](https://farcry.fandom.com/wiki/Outposts/FC3)
- [Level Design Book — Classic Combat project](https://book.leveldesignbook.com/learning/projects/classic-combat) · [Game Developer — Pushing Push-Forward Combat](https://www.gamedeveloper.com/blogs/pushing-push-forward-combat-with-gameplay)
- [CraftMyGame — Wave & Spawn System](https://craftmygame.com/features/wave-spawn)

**Metrics / dimensions**
- [VDC — Dimensions (HL2 & CS:S)](https://developer.valvesoftware.com/wiki/Dimensions_(Half-Life_2_and_Counter-Strike:_Source)) · [VDC — CS:GO Mapper's Reference](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive/Mapper's_Reference)
- [Level Design Book — metrics](https://book.leveldesignbook.com/process/blockout/metrics) · [Doom metrics](https://book.leveldesignbook.com/process/blockout/metrics/doom) · [Quake metrics](https://book.leveldesignbook.com/process/blockout/metrics/quake)
- [Counter-Strike Wiki — Movement](https://counterstrike.fandom.com/wiki/Movement)
- [worldofleveldesign — UE5 scale & dimensions](https://www.worldofleveldesign.com/categories/ue5/guide-to-scale-dimensions-proportions.php) · [Hammer player scale](https://www.worldofleveldesign.com/categories/sourcesdk-authoringtools/hammer-source-player-scale-world-dimensions.php)
- [Overwatch Wiki — Movement speed](https://overwatch.fandom.com/wiki/Movement_speed) · [Apex Wiki — Movement](https://apexlegends.fandom.com/wiki/Movement)
- [Source vs GoldSrc movement/slopes](https://www.ryanliptak.com/blog/source-vs-goldsrc-movement-slopes/) · [Quake Wiki — unit](https://quakewiki.org/wiki/unit) · [eev.ee — Doom scale](https://eev.ee/blog/2016/10/10/doom-scale/)
- [Kotaku — life-size Dust replica (115×110×15 m)](https://kotaku.com/artist-wants-to-make-a-life-size-replica-of-counter-str-5817257)

**Three.js workflow / collision / performance**
- [three.js `games_fps` example (Octree + Capsule)](https://github.com/mrdoob/three.js/blob/dev/examples/games_fps.html)
- [three-mesh-bvh (gkjohnson)](https://github.com/gkjohnson/three-mesh-bvh) · [BVH collision how-to](https://medium.com/@pablobandinopla/collision-detection-in-threejs-made-easy-using-bvh-1ce6012199e8)
- [Rapier — JS character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/) · [doppl3r — Rapier+Three.js example](https://github.com/doppl3r/kinematic-character-controller-example)
- [Blender glTF 2.0 manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) · [glTF-Transform — Draco](https://github.com/donmccurdy/glTF-Transform/discussions/347) · [Blender→Three.js export guide](https://github.com/funwithtriangles/blender-to-threejs-export-guide)
- [Level Design Book — modular kit](https://book.leveldesignbook.com/process/blockout/metrics/modular) · [Kenney CC0 assets](https://kenney.nl/assets)
- [three.js InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html) · [100 Three.js performance tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips) · [Draw Calls: The Silent Killer](https://threejsroadmap.com/blog/draw-calls-the-silent-killer)
- [three.js JSON Scene format](https://github.com/mrdoob/three.js/wiki/JSON-Object-Scene-format-4) · [Three.js Level Creator (JSON export)](https://defacci.itch.io/threejs-level-creator)
