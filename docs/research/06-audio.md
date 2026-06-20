# 06 — Audio: Architecture, FPS Sound Design, Free Assets & Implementation

> Research date: 2026-06-20. Target: a browser-based FPS that needs convincing, immersive,
> low-latency audio that runs well on desktop and is at least tolerable on mobile.
> All technical claims are sourced inline; URLs are collected at the bottom of each section.

---

## 0. TL;DR / Recommendations

- **Library:** Use **Howler.js** as the playback/3D spatialization workhorse (cross-browser
  format fallback, audio sprites, built-in HRTF spatial audio, autoplay unlocking, pooling).
  Keep a thin **raw Web Audio API** layer for anything Howler can't express cleanly:
  occlusion low-pass filters, convolver reverb zones, and dynamic music ducking. Reach for
  **Tone.js only** if/when we want generative/beat-synced music; skip it for SFX.
- **Spatialization:** `PannerNode` with `panningModel: 'HRTF'` for important diegetic sources
  (enemies, gunfire, footsteps); `equalpower` (cheaper) for non-critical/ambient sources.
  Resonance Audio Web SDK is the "premium" option (ambisonics + room model + occlusion) but
  is effectively unmaintained — treat it as optional, not the foundation.
- **Distance falloff:** `distanceModel: 'inverse'` (default, most natural) with tuned
  `refDistance` / `rolloffFactor` / `maxDistance` per sound category.
- **Sound asset strategy:** layer every weapon (transient + body + sub + mechanical + tail);
  surface-switched footsteps; distance-based gunfire variants (close vs. distant + tail);
  bullet whizz-by + crack as separate radius-driven cues; punchy hitmarker/UI; layered
  ambient beds + randomized spot effects.
- **Free sources (priority order):** **Sonniss GameAudioGDC** bundles (royalty-free, no
  attribution) → **Freesound** filtered to **CC0** → **Kenney** (CC0 UI/impacts) →
  **OpenGameArt** (CC0/CC-BY) → **Pixabay** (music) → **Kevin MacLeod / Incompetech** (music,
  CC-BY). Keep a license ledger; prefer CC0 to avoid attribution-tracking overhead.
- **Implementation must-dos:** single shared `AudioContext`; **unlock/resume on first user
  gesture** (`pointerdown`/`keydown`/`touchend`); **audio sprites** for many small one-shots;
  pre-decode buffers; reuse `AudioBuffer`s (a fresh `AudioBufferSourceNode` per play is
  expected and cheap, the buffer is shared); a master compressor/limiter; ducking bus for
  music under combat.

---

## 1. Web Audio Tech

### 1.1 Core model

- The **Web Audio API** is a node graph: source nodes → processing nodes → `destination`.
  It is built for "playing back sound from multiple, precisely timed sources simultaneously,"
  which is exactly the FPS gunfight case (tens of overlapping SFX). [web.dev, MDN]
- **Use one `AudioContext`.** "In most applications, a single AudioContext is sufficient and
  recommended. Creating multiple contexts increases resource usage and makes timing and
  synchronization harder to manage." [MDN Best practices]
- There is **no hard voice cap** in the spec: "there is no ceiling of 32 or 64 sound calls at
  one time, and some processors may be capable of playing more than 1,000 simultaneous sounds
  without stuttering." We still self-impose a budget (see §1.6). [MDN/W3C discussion]

### 1.2 Spatial / 3D positional audio

- **`PannerNode`** places a source anywhere in 3D space; the **`AudioListener`** represents
  the player's ears. Positions use a right-handed Cartesian system: `positionX/Y/Z` and
  source `orientationX/Y/Z`. [MDN PannerNode]
- **`panningModel`:**
  - `'HRTF'` — convolution with measured head-related impulse responses; simulates interaural
    time difference (ITD), interaural level difference (ILD), and pinna spectral cues so the
    brain localizes front/back/up/down over **headphones**. Higher quality, higher cost.
  - `'equalpower'` — cheap constant-power L/R pan; fine for ambient/non-critical sources.
  - MDN: "It is recommended to set the panningModel property to HRTF … renders a stereo
    output of higher quality than equalpower." [MDN panningModel]
- **`AudioListener`** modern API: `positionX/Y/Z`, `forwardX/Y/Z`, `upX/Y/Z` (all are
  `AudioParam`s). The legacy `setPosition()` / `setOrientation()` methods are **deprecated but
  still the only path on some Firefox versions** — feature-detect and fall back. We update
  these every frame from the camera transform. [MDN AudioListener]

### 1.3 Distance attenuation / falloff

`PannerNode.distanceModel` (default `'inverse'`) reduces gain with distance. Formulas: [MDN]

- **linear:** `1 - rolloffFactor * (distance - refDistance) / (maxDistance - refDistance)`
- **inverse (default):** `refDistance / (refDistance + rolloffFactor * (max(distance, refDistance) - refDistance))`
- **exponential:** `pow(max(distance, refDistance) / refDistance, -rolloffFactor)`

Key params: `refDistance` (gain = 1 here), `maxDistance` (gain constant beyond), `rolloffFactor`
(how fast it falls). Directional sources also support `coneInnerAngle` / `coneOuterAngle` /
`coneOuterGain`. We tune per-category (e.g., footsteps small `maxDistance`, gunfire large).

### 1.4 Reverb / room effect

- **`ConvolverNode`** performs linear convolution against an **impulse response (IR)** buffer
  to place a sound "in the room where the impulse response was recorded." We load a few IRs
  (small room, large hall, outdoor) and route sources through the matching one per zone.
  [MDN ConvolverNode, gskinner]
- IRs can be **recorded** real spaces or **synthetically generated**; `reverbGen` is a JS lib
  that generates IRs with fade-in and a gradually changing low-pass for natural tails. Good for
  shipping small (no big WAV IR files). [reverbGen / ITNEXT]
- Pattern: per-source `dry` gain → destination, plus a `send` gain → shared `ConvolverNode` →
  `wet` gain → destination (one convolver per active reverb zone, shared across sources).

### 1.5 Occlusion / obstruction (reverb zones)

- Cheap, effective approach: insert a **`BiquadFilterNode` (lowpass)** in the source chain and
  lower its cutoff when geometry occludes the source (walls muffle high frequencies). Combine
  with a small gain reduction. Game engines (OpenAL/FMOD/EAX) do the same conceptually.
  [Boris Smus Web Audio book ch.6, web.dev]
- Higher fidelity: **Resonance Audio** "can simulate how real sound waves traveling between a
  source and listener are blocked by objects … by treating high and low frequency components
  differently." (See §1.7.)
- "Reverb zones": raycast/trigger volumes set the active IR + occlusion cutoff. Real engines
  raycast the space and set reverb to match room size (e.g., enter a tunnel → enclosed reverb).
  [Game Audio Learning, GameDeveloper]

### 1.6 Performance / voice limits

- No spec cap, but uncontrolled stacking is a real problem: "multiple sounds stack on top of
  one another with no normalization, which can exceed your speaker's capability" — so we need
  level management + a master compressor/limiter (`DynamicsCompressorNode`). [MDN]
- **Self-imposed voice budget:** cap concurrent one-shots per category (e.g., ≤ N footsteps,
  ≤ M impacts) and **steal the oldest/quietest** voice when exceeded. Pool `PannerNode`s for
  active sources; for one-shots, create a fresh `AudioBufferSourceNode` each play (they are
  one-time-use by design) but **share the decoded `AudioBuffer`**.
- HRTF panning is **more expensive** than equalpower per voice — reserve HRTF for gameplay-
  critical sources and use equalpower or plain stereo for ambient/UI. [MDN, perf notes]
- Prefer **AudioWorklet** over the deprecated `ScriptProcessorNode` if we ever do custom DSP.

### 1.7 Libraries

| Library | Role | Notes |
|---|---|---|
| **Howler.js** | SFX + music playback, **3D spatial**, sprites | ~950k weekly downloads, ~25k stars. Handles format fallback, autoplay unlocking, audio sprites, 3D spatial audio, pooling, fades, rate/pitch. Best default for game SFX. [npmtrends, supadark, pkgpulse] |
| **Tone.js** | Synthesis / scheduling / generative music | ~317k weekly downloads. Use for generative/beat-synced music, FX chains, synths — **not** for plain SFX. Common pattern: Howler for assets, Tone for reactive layers. [pkgpulse] |
| **Resonance Audio (Web SDK)** | Ambisonic spatial audio + room model + occlusion | "Real-time JavaScript SDK … encode spatial audio dynamically into a scalable Ambisonic soundfield." First-order ambisonic scene, per-surface room materials, real-time reverb, frequency-dependent occlusion. **Caveat:** Google open-sourced it (2018) and it is effectively unmaintained — vet before depending on it. [resonance-audio.github.io, Google Dev Blog] |
| **SoundJS** | Older playback lib | Lower momentum than Howler; not recommended for a new project. [npmtrends] |

**Decision:** Howler.js primary; raw Web Audio for occlusion LPF, convolver reverb, ducking,
master compressor. Resonance Audio optional/experimental. Tone.js only if we go generative.

#### Sources — §1
- MDN — Web Audio API best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN — Using the Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API
- MDN — PannerNode.panningModel: https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/panningModel
- MDN — PannerNode.distanceModel: https://developer.mozilla.org/en-US/docs/Web/API/PannerNode/distanceModel
- MDN — AudioListener: https://developer.mozilla.org/en-US/docs/Web/API/AudioListener
- MDN — ConvolverNode: https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode
- web.dev — Developing game audio with the Web Audio API: https://web.dev/articles/webaudio-games
- Boris Smus — Web Audio API (book) ch.6 (game audio): https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch06.html
- Web Audio perf notes (Paul Adenot): https://padenot.github.io/web-audio-perf/
- reverbGen (JS IR generator): https://github.com/adelespinasse/reverbGen
- Convolution reverb walkthrough: https://itnext.io/convolution-reverb-and-web-audio-api-8ee65108f4ae
- gskinner — Making reverb with Web Audio: https://blog.gskinner.com/archives/2019/02/reverb-web-audio-api.html
- Resonance Audio Web — Getting started: https://resonance-audio.github.io/resonance-audio/develop/web/getting-started.html
- Resonance Audio — Concepts: https://resonance-audio.github.io/resonance-audio/discover/concepts.html
- Google Dev Blog — Open Sourcing Resonance Audio: https://developers.googleblog.com/open-sourcing-resonance-audio/
- npmtrends howler vs soundjs vs tone: https://npmtrends.com/howler-vs-soundjs-vs-tone
- Tone.js vs Howler.js (Supadark): https://supadark.com/notes/tone-js-vs-howler-js
- howler vs tone vs wavesurfer 2026 (PkgPulse): https://www.pkgpulse.com/guides/howler-vs-tone-js-vs-wavesurfer-web-audio-javascript-2026
- Howler.js: https://howlerjs.com/

---

## 2. FPS Sound Design

### 2.1 Weapon fire — layering

Industry practice (Mark Kilborn, Call of Duty; general SFX guides) builds each gunshot from
**3–5 layers** (battle scenes can stack 20+ across many weapons): [Pro Sound Effects, Playgama, Splice]

1. **Transient** — sharp initial crack/attack; defines the "snap" and read-through-the-mix.
2. **Body** — low-mid boom that gives the shot weight/character.
3. **Sub / LFE** — designed sub-bass for power and chest-thump.
4. **Mechanical** — foley matched to the weapon: bolt/slide cycling, casing tinkle, action
   clatter. "Adding more mechanical detail … enhances realism and impact."
5. **Tail** — environmental reflection/reverb that says *where* it was fired (room vs. open
   field). Often a separate sample swapped by reverb zone.

Production tips: layer recordings from **different mics** and even **different firearms** to
build a unique, larger-than-life shot; randomize layer selection/levels/pitch slightly per
shot to avoid the "machine-gun repetition" artifact. [Pro Sound Effects, Splice]

### 2.2 Distance-based gunfire (close vs. distant)

- Blend between distinct **distance-tier samples** rather than only attenuating one sample —
  near shots have full transient + body + mechanical; far shots become a dull thump + long
  **tail/echo**, with the crack arriving differently. [PUBG sound guide, PC Gamer]
- Suppressor attachments change `maxDistance`/attenuation profile. We model tiers as separate
  sprite entries chosen by listener distance, each routed through the zone's reverb.

### 2.3 Bullet whizz-by & crack

- A **crack** (bow shockwave) only triggers when a **supersonic round passes very close**;
  a **whizz** triggers over a **larger radius**. "If you hear a whizz and a crack, the bullet
  passed very close; if you only hear a whizz, it was close but not that close." [PUBG / Steam guide]
- Implement as **two radius checks** along the bullet's near-miss vector → spawn a positioned
  whizz (wider radius) and optionally a crack (tight radius), panned to the pass-by point.

### 2.4 Reloads & weapon handling

- Sequence of mechanical foley spot-effects: mag release, mag out, mag in, bolt/charging
  handle, slide release, tactical vs. empty-reload variants. Reuse the weapon's mechanical
  layer assets. Tie events to animation timing.

### 2.5 Footsteps — surface-based

- Switch the step sample set by the **surface material under the player** (wood, concrete,
  metal, gravel, grass, water). Engines do this via physical-material line-traces; in our web
  engine we look up the material of the floor tile/collider the player stands on. [FMOD,
  UE5 physical materials, Above Noise/Wwise]
- Per step: pick a **random variant** from the surface set, randomize pitch/volume slightly,
  and gate cadence by movement speed/state (walk/run/crouch). Optionally **procedural**: each
  step synthesized slightly differently to fight repetition. [emastered, web.dev]
- Add **distant enemy footsteps** as a key competitive cue — spatialized (HRTF), with their
  own attenuation so players can localize threats.

### 2.6 Impacts (bullet hits)

- Surface-switched impact set mirroring footsteps (concrete chip, metal ping/ricochet, wood
  splinter, dirt thud, flesh, glass shatter). Spatialize to impact point. Add occasional
  **ricochet whine** tail for metal/stone. Pool/limit voices (§1.6).

### 2.7 Explosions

- Layer like weapons but bigger: punchy transient + huge sub + debris/rumble tail + optional
  brief **muffle/duck** of everything else (combat shell-shock) via the ducking bus. Add a
  short low-pass + tinnitus tone for close blasts if desired.

### 2.8 Enemy vocals

- States: idle/alert/spotted-player/taking-damage/death. Spatialized (HRTF). Randomize
  variants; pitch/timbre variation per enemy to differentiate. Priority high (gameplay info).

### 2.9 UI / hitmarker / feedback

- **Hitmarker** = short, crisp click on a successful hit: "instant feedback, makes gameplay
  feel more responsive, adds satisfaction to every hit." Distinct headshot/kill confirm tone.
  These are core feedback, not polish — they "close the loop between player input and in-game
  response." [Voicy/itch feedback writeups]
- UI bed: menu hover/select, weapon switch, pickup, low-ammo warning, objective/round stinger.
  Play UI **non-spatialized** (direct to master), slightly ducking world audio if needed.

### 2.10 Ambience

- Build a **layered ambient bed**: a continuous base loop (room tone / wind) + randomized
  **spot effects** (distant gunfire, birds, drips, creaks) triggered at random intervals/pans
  to avoid obvious looping. "Layer ambience throughout all parts of your level to add depth."
  Use long beds + randomized layers to stay fresh. [Game Audio Learning, Splice, O'Reilly]
- Swap/blend ambient beds by zone; route through the zone's reverb where appropriate.

### 2.11 Dynamic music & stingers

- **Vertical layering** (stems: bass/perc/tension/combat blended at runtime by intensity)
  and/or **horizontal re-sequencing** (switch sections by state: explore → alert → combat).
  **Stingers** are "short bursts of music for a specific game event" used to mask transitions
  (kill, objective, round win/loss). [The Game Audio Co, Game Developer, CRI]
- Combat intensity (enemy count / recent damage / time-since-combat) drives layer gains and
  section transitions.

### 2.12 Mixing & ducking

- "Poor mixing is especially problematic … in first-person shooters where audio cues provide
  essential feedback." Define **priority/ducking rules** to prevent masking: music/ambience
  **duck under** gunfire, hitmarkers, and enemy vocals (sidechain-style). [Game Developer]
- Bus layout: `SFX`, `Ambience`, `Music`, `UI`, `Voice` → master `DynamicsCompressorNode`
  (limiter) → destination. Music/ambience buses have a duck-gain controlled by combat events.
- Per-category gain sliders + a master volume; persist user settings.

#### Sources — §2
- Pro Sound Effects — FPS gunshot SFX with Mark Kilborn: https://blog.prosoundeffects.com/how-to-sound-design-first-person-shooter-gunshot-sound-effects-with-mark-kilborn
- Playgama — realistic gunshot SFX techniques: https://playgama.com/blog/unity/what-techniques-can-i-use-to-create-realistic-gunshot-sound-effects-for-my-fps-games-audio-design/
- Splice — design a weapon sound for games: https://splice.com/blog/design-weapon-sound-video-games/
- Pixflow — gun & gunfire SFX guide: https://pixflow.net/blog/gun-gunfire-sound-effects/
- PC Gamer — how gunshots work in PUBG: https://www.pcgamer.com/how-gunshot-sounds-work-in-playerunknowns-battlegrounds/
- Steam — PUBG sound guide (whizz/crack/distance): https://steamcommunity.com/sharedfiles/filedetails/?id=895639122
- gamesounddesign.com — recording bullet/gun SFX: http://gamesounddesign.com/how-to-record-bullet-and-gun-sound-effects.html
- FMOD surface-based footsteps: https://atomikfalconstudios.com/creating-realistic-footstep-sounds-with-fmods-surface-based-audio-system/
- UE5 footsteps via physical materials: https://medium.com/@fulton_shaun/ue5-footstep-sounds-using-physical-materials-8a85bdccbdde
- Above Noise — footsteps in UE5 + Wwise: https://abovenoisestudios.com/blogeng/wwiseue5footstepseng
- Footstep synthesis paper (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S0003682X15001747
- Vertical layering vs horizontal resequencing (The Game Audio Co): https://www.thegameaudioco.com/making-your-game-s-music-more-dynamic-vertical-layering-vs-horizontal-resequencing
- Horizontal resequencing & transitions (Game Developer): https://www.gamedeveloper.com/audio/horizontal-resequencing-and-dynamic-transitions-for-game-music-composers
- CRI — Dynamic music vertical layering: https://blog.criware.com/index.php/2020/04/20/dynamic-music-with-adx2-part1-vertical-layering/
- Game Audio Learning — making ambiences: https://www.gameaudiolearning.com/knowledgebase/how-to-make-ambiences-for-games
- Splice — audio soundscape for games: https://splice.com/blog/audio-soundscape-for-video-games/
- itch.io — satisfying feedback with VFX & sound: https://itch.io/blog/1063213/satisfying-player-feedback-with-vfx-and-sound

---

## 3. Free / CC0 SFX & Music Sources

> **Licensing rule of thumb for us:** prefer **CC0** (public domain, no attribution) to avoid
> attribution bookkeeping. Where we use CC-BY assets, maintain a `CREDITS.md` with author +
> source + license per asset. Never use **NC (NonCommercial)** assets if the game might ever
> be monetized. Always re-verify license at download time (a sound's text description can
> override the license tag — see Freesound note).

### 3.1 Sound effects

- **Sonniss — GameAudioGDC bundle** (top pick for raw quality). Royalty-free, **no attribution
  required**, commercial use, "use them on an unlimited number of projects for the rest of your
  lifetime." Latest is the GDC 2026 bundle; the multi-year community archive is ~160–200 GB.
  Restriction to confirm at the license page: typically you may **use** sounds in projects but
  may **not redistribute/resell the raw sounds** or include them in a competing sample library.
  - Download: https://gdc.sonniss.com/  |  Archive: https://sonniss.com/gameaudiogdc/
  - License terms: https://sonniss.com/gdc-bundle-license/
- **Freesound** — 500k+ community sounds. **Filter to CC0** for no-attribution use; CC-BY
  requires credit; CC-BY-NC is off-limits for commercial. Has a **REST API** for programmatic
  search/download (useful for tooling). Caveat: "License is CC0 but description says to
  attribute" cases exist — read the description; honor it.
  - https://freesound.org/  |  FAQ/licenses: https://freesound.org/help/faq/
- **Kenney** — **CC0**, no sign-up/attribution. Great for **UI Audio** (50) and **Impact
  Sounds** (130), plus retro/space packs. Clean, consistent, game-ready.
  - https://kenney.nl/assets/category:Audio  (UI: https://kenney.nl/assets/ui-audio ,
    Impacts: https://kenney.nl/assets/impact-sounds )
- **OpenGameArt** — CC0/CC-BY/GPL mix; filter by license. Kenney's OGA uploads are all CC0.
  Good for SFX + simple loops.
  - https://opengameart.org/  |  Kenney CC0 on OGA: https://opengameart.org/content/all-cc0-uploader-kenney
  |  CC0 SFX listing: https://opengameart.org/content/cc0-sound-effects
- **GameSounds.xyz** — aggregator/mirror (incl. Kenney packs), browsable by folder.
  - https://gamesounds.xyz/

### 3.2 Music

- **Pixabay Music** — large pool of public-domain/no-attribution music; good for menu/combat
  beds. (Re-verify each track's terms.) — https://pixabay.com/music/
- **Kevin MacLeod / Incompetech** — 2,000+ tracks under **CC-BY 4.0** (attribution required);
  some CC0. Ubiquitous in indie games. — https://incompetech.com/music/royalty-free/
- **Free Music Archive** — mixed CC licenses; filter accordingly. — https://freemusicarchive.org/
- **OpenGameArt music** (CC0/CC-BY) and itch.io game-music packs (per-pack license).

### 3.3 Procedural / synth (no samples)

- The Web Audio API "can be used to fully generate sound procedurally, such as simulating a
  gun firing," by combining **noise buffers + oscillators + filters + gain envelopes**. Strong
  fit for **footsteps, whooshes, UI blips, laser/sci-fi**, and as a variation layer to fight
  repetition — "to get a slightly different footstep, whoosh, or gunshot each time." [web.dev,
  emastered, DEV]
- Good fallback/zero-asset path for prototyping and for procedurally varying sample playback
  (random pitch/filter/envelope per shot). Tone.js can host this if we want higher-level synth.
  - web.dev game audio: https://web.dev/articles/webaudio-games
  - Procedural audio guide: https://emastered.com/blog/procedural-audio
  - Zero-dependency browser synth: https://dev.to/hexshift/how-to-build-a-zero-dependency-audio-synth-in-the-browser-using-web-audio-api-1bp5

#### Sources — §3
- Sonniss GDC bundle: https://gdc.sonniss.com/ ; archive https://sonniss.com/gameaudiogdc/ ; license https://sonniss.com/gdc-bundle-license/
- Freesound: https://freesound.org/ ; FAQ https://freesound.org/help/faq/ ; CC license guide https://audiocommons.github.io/2019/01/04/cc-licenses.html
- Kenney audio: https://kenney.nl/assets/category:Audio
- OpenGameArt: https://opengameart.org/ ; Kenney CC0 https://opengameart.org/content/all-cc0-uploader-kenney
- Pixabay Music: https://pixabay.com/music/
- Incompetech (Kevin MacLeod): https://incompetech.com/music/royalty-free/
- Free Music Archive: https://freemusicarchive.org/
- Hackingtons free game audio roundup: https://www.hackingtons.com/free-game-audio.html

---

## 4. Implementation Best Practices (Web)

### 4.1 Unlocking the AudioContext (critical)

- Browsers **suspend new `AudioContext`s until a user gesture**. "Check `audioContext.state`
  and call `resume()` from a click or keypress handler." On iOS the context starts
  "locked"/suspended and must be resumed within the **first** user interaction. [MDN, Chromium,
  Matt Montag]
- On mobile, `touchstart` may be the start of a scroll, so **attempt the unlock on both
  `touchstart` and `touchend`** (and `pointerdown`/`keydown` for desktop). Unlock **once**,
  reuse the context. We'll wrap this in a one-time "click to start" / first-input handler.
  Howler does much of this automatically, but we still verify `Howler.ctx.state === 'running'`.
  [HackerNoon "Unlocking Web Audio the smarter way", Matt Montag]

### 4.2 Loading: preload, decode, stream

- **Pre-`decodeAudioData`** all gameplay-critical SFX into `AudioBuffer`s during a loading
  screen (decoding is CPU-heavy; do it up front, not mid-combat). [MDN, perf notes]
- **Stream** large/long music & ambience via HTML5 audio (`html5: true` in Howler) instead of
  fully decoding into memory; decode short one-shots into buffers.
- **Reuse `AudioBuffer`s**: a buffer is shared across plays; create a **new
  `AudioBufferSourceNode` per playback** (they are single-use by spec) — this is the intended,
  cheap pattern.

### 4.3 Audio sprites

- Pack many short one-shots (UI clicks, footstep variants, impacts) into a **single file +
  timing map** to cut HTTP requests and decode count and to dodge mobile concurrent-playback
  limits. Howler has first-class **sprite** support. [MDN, web.dev, Howler]

### 4.4 Latency

- Keep the graph shallow on the hot path; pre-decode; trigger one-shots immediately on input.
  Use `AudioContext.outputLatency` / playback stats to measure. Prefer the buffer-source path
  over HTML5 `<audio>` for latency-sensitive SFX (gunfire, hitmarker). [GeeksforGeeks, MDN]

### 4.5 Mobile considerations

- Expect: forced unlock-on-gesture; limited simultaneous HTML5 `<audio>` elements (favor Web
  Audio buffers + sprites); higher latency; constrained CPU (favor `equalpower` over HRTF for
  most sources, cap voices). Provide a **quality toggle** (HRTF on/off, reverb on/off, voice
  budget) for low-end devices.

### 4.6 Mixing / master chain

- Master bus = per-category gains → `DynamicsCompressorNode` (acts as limiter to prevent the
  "sounds stack with no normalization → clipping" problem) → `destination`. Music/ambience
  buses carry a **duck gain** lowered during combat. [MDN]

### 4.7 Proposed module shape (for the engine)

```
AudioManager
 ├─ ctx (single AudioContext)            // resume() on first gesture
 ├─ buses: sfx, ambience, music, ui, voice → master compressor → destination
 ├─ listener: sync position/forward/up from camera each frame
 ├─ buffers: Map<id, AudioBuffer>        // pre-decoded, shared
 ├─ sprites: { file, map } via Howler
 ├─ play(id, {pos, category, pitch, volume, occlusion}) -> voice
 │    └─ creates AudioBufferSourceNode → [lowpass?] → PannerNode → bus
 ├─ reverbZones: ConvolverNode per active IR (shared send)
 ├─ voicePool / budget per category (steal oldest on overflow)
 ├─ music: vertical-layer gains + section switch + stingers
 └─ duck(category, amount, attack, release)  // sidechain-style
```

#### Sources — §4
- MDN — Web Audio API best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN — AudioContext: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
- Chromium — Web Audio requires user gesture on Android: https://groups.google.com/a/chromium.org/g/blink-dev/c/vuYEHSeqonM/m/JpeLkiJABgAJ
- Matt Montag — Unlock Web Audio in Safari/Chrome: https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos
- HackerNoon — Unlocking Web Audio the smarter way: https://medium.com/hackernoon/unlocking-web-audio-the-smarter-way-8858218c0e09
- web.dev — Developing game audio: https://web.dev/articles/webaudio-games
- GeeksforGeeks — AudioContext.outputLatency: https://www.geeksforgeeks.org/web-tech/web-audio-api-audiocontext-outputlatency-property/
- Web Audio perf notes: https://padenot.github.io/web-audio-perf/

---

## 5. Open questions / next steps

- Confirm exact Sonniss redistribution clause from the license page (currently summarized).
- Decide whether to ship recorded IRs or generate them at runtime (`reverbGen`) to save bytes.
- Prototype the `AudioManager` against the existing `engine.js` / `shooter.html` and measure
  voice budget + latency on a mid-tier phone.
- Evaluate Resonance Audio Web SDK for one demo zone to judge maintenance risk vs. PannerNode.
