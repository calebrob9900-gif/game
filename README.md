# 🎮 Game Lab — 5 Playable Prototypes

Five rough-draft browser games built to help pick which one to take all the way.
All are **3D, keyboard + mouse, no install** — built on [Three.js](https://threejs.org/)
(WebGL) with a tiny shared engine. Play each, then we polish your favorite into the
"big build."

---

## ▶️ How to run

ES modules need to be served over HTTP (not opened as `file://`). Pick any one:

```bash
# Option A — Python (already on most machines)
python3 -m http.server 8000

# Option B — Node
npx serve .            # or:  npx http-server -p 8000
```

Then open **http://localhost:8000/** and click a game from the hub.

> Requires an internet connection the first time (Three.js loads from a CDN).
> We can "vendor" Three.js into the repo later for fully offline play.

---

## 🕹️ The five prototypes

| | Game | What it is | Controls |
|---|------|------------|----------|
| 🏎️ | **Driving + Stunt** | Arcade car with drift, jump ramps, flips & airtime score. Toggle to a dirt bike. | `W/S` drive · `A/D` steer · `Space` handbrake · `↑/↓` flip in air · `V` car/bike · `R` reset |
| 🔫 | **Arcade FPS Shooter** | Mouse-look arena; shoot drifting neon bots, build a combo, beat the 60s clock. | Click to lock mouse · `WASD` move · mouse look · `Shift` sprint · click to shoot · `Esc` release |
| 🏍️ | **Motocross / Dirt Bike** | Dirt bike over a rolling heightfield; crest jumps, flip & whip, stick the landing. | `W/S` throttle · `A/D` steer/whip · `↑/↓` flip in air · `R` reset |
| ✈️ | **Sky Racer** | Fly a jet through 12 glowing rings with real banking turns. Beat the course. | `W/S` throttle · `↑/↓` pitch · `A/D` roll/bank · `R` reset |
| 🌊 | **Jet-Ski Wave Rider** | Carve a living ocean, launch off wave crests, slalom the buoy gates. | `W/S` throttle · `A/D` steer · `↑/↓` flip in air · `R` reset |

---

## 🧱 How it's built

```
index.html        ← the hub (pick a game)
styles.css        ← shared UI + HUD styling
engine.js         ← shared mini-engine: renderer, camera, lights, loop, input, HUD
games/
  driving.js      ← 🏎️ reference implementation
  fps.js          ← 🔫
  motocross.js    ← 🏍️
  skyracer.js     ← ✈️
  jetski.js       ← 🌊
  *.html          ← one thin loader page per game
```

- **Three.js + WebGL** with ACES tone mapping, soft shadows and fog for a clean,
  modern look.
- Each game shares `engine.js` (renderer/camera/lights/loop/input/HUD) and hand-rolled
  **arcade physics** so the prototypes are dependency-light and run instantly.

## 🚀 Where this goes next (the "big build")

Once you pick a favorite, the upgrade path is: **Rapier** physics (real vehicle
dynamics / ragdolls), **WebGPU** renderer for 2–10× perf + better lighting,
PBR-textured assets (Kenney / Sketchfab CC0), audio, menus, and progression.
