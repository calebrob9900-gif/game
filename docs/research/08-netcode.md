# 08 — Netcode & Multiplayer Research (Browser FPS)

**Date:** 2026-06-20
**Author:** Netcode/multiplayer engineering pass
**Status:** Research / recommendation. No MP code exists yet. This document is the
plan for *if/when* we add multiplayer, and — more importantly — how to build the
single-player game *now* so that adding MP later is an extension rather than a rewrite.

---

## TL;DR / Recommendation

- **Defer real multiplayer.** A networked, server-authoritative FPS with prediction,
  reconciliation, interpolation, and lag compensation is a large, separate project
  (realistically 2–4+ engineer-months for a credible v1, plus ongoing ops/anti-cheat).
  Ship single-player first. MP is a "likely later phase," so treat it as one.
- **But architect for it now, cheaply.** Adopt a **fixed-timestep, input/command-driven
  simulation** with a clear split between *simulation* (pure, deterministic-ish state
  update from inputs) and *rendering/presentation*. This is good single-player hygiene
  anyway and is the single highest-leverage thing we can do to avoid a future rewrite.
  Our current loop (`engine.js`) is variable-`dt` and mutates state directly from
  per-frame input — that must change. See [Phased plan](#5-phased-plan).
- **Transport, when we get there: WebSocket for v1, plan for WebTransport.**
  WebTransport reached **Baseline (all major browsers, incl. Safari 26.4) in March 2026**,
  giving us UDP-style unreliable datagrams in the browser without WebRTC's pain — but the
  **Node server story is still immature** (one main library). Start on WebSocket (trivial,
  universal, "good enough" for a small-scale FPS), keep the transport behind an interface,
  and migrate the hot path to WebTransport datagrams later.
- **Netcode model: client-server authoritative + client-side prediction + server
  reconciliation + entity interpolation + lag compensation.** This is the standard
  fast-FPS stack (Quake/Source/Valorant lineage). Do **not** use deterministic lockstep
  for an FPS (it's for RTS; it stalls on the worst ping and needs strict determinism).
- **Framework: Colyseus** (Node/TypeScript, authoritative, MIT, managed cloud available)
  is the best fit for a JS/TS web FPS *if* we want batteries-included rooms/matchmaking.
  **Geckos.io** is the option if we want UDP-now via WebRTC datagrams on Node. A
  hand-rolled WS/WebTransport server is viable too. Avoid Hathora (**shut down May 2026**).
- **Anti-cheat: server authority is the only real defense in a browser.** The client is
  fully untrusted and inspectable. Server simulates; client sends *intent* only. Accept
  that this is partial — even AAA anti-cheat is ~50% effective.

---

## 1. Web transport options

We send game data from a browser. Three realistic transports in 2026:

### WebSocket (TCP)
- **What:** Long-lived, full-duplex, ordered, reliable stream over TCP. Universal browser
  support, trivial server (`ws` on Node).
- **Latency problem:** TCP guarantees **in-order, reliable** delivery, which causes
  **head-of-line (HOL) blocking** — one lost packet stalls everything behind it until
  retransmitted. For a 60 Hz FPS where a 30ms-old position is *useless*, you'd rather drop
  it than wait. TCP can't drop. This is the fundamental ceiling for fast action over WS.
- **Verdict:** Fine for slower games, lobbies, chat, matchmaking, and **a small-scale FPS
  v1**. Many web games ship on WS and feel acceptable at low ping. It's the cheapest path
  to "two players shooting each other in a browser."

### WebRTC DataChannel (UDP)
- **What:** Peer connection that can run **unreliable + unordered** (UDP-like) data
  channels — exactly what fast games want. `geckos.io` wraps this in a client/server
  (not P2P) shape so a Node server is the authority.
- **Cost:** WebRTC is **operationally heavy**: signaling server, ICE/STUN, and **TURN
  relays** for clients behind strict NATs (TURN = you pay for relayed bandwidth). The
  handshake is complex and the API is large. Historically the only way to get UDP in a
  browser, so it was the default for serious web FPS.
- **Verdict:** Powerful but the most setup. Use via Geckos.io if we need UDP *before*
  WebTransport server tooling matures, or need true P2P.

### WebTransport (QUIC / HTTP/3) — the 2026 story
- **What:** Modern client↔server transport over **HTTP/3 (QUIC = UDP under the hood)**.
  Gives you **both** reliable ordered *streams* **and** unreliable unordered *datagrams*,
  multiplexed without TCP-style HOL blocking. Connection setup is ~1 RTT (merged transport
  + crypto handshake). This is "the right tool" for a web FPS: positions on datagrams at
  60 Hz, chat/scoreboard/control on reliable streams.
- **Browser support — the big 2026 change:** WebTransport reached **Baseline in
  March 2026**: Chrome/Edge (since M97, 2022), Firefox (since 114, 2023), and **Safari 26.4
  (March 2026)** all ship it without a flag. "Baseline" = safe to use across all major
  browsers in production.
- **The catch — server side:** This is the honest blocker. **Node has no native
  WebTransport server**, and as of mid-2026 the maturest library is
  **`@fails-components/webtransport`** — usable but not a turnkey ecosystem. You also need
  an **HTTP/3/QUIC endpoint with valid TLS certs** (WebTransport requires TLS; no
  self-signed shortcuts in production), which complicates the server/proxy/load-balancer
  story vs. a plain WS port. Cloudflare (Workers + Durable Objects) and others ship
  WebTransport at the edge, which is one way to offload the QUIC termination.

### Transport recommendation
| Transport | Latency for FPS | Browser support 2026 | Server effort | Use it for |
|---|---|---|---|---|
| WebSocket (TCP) | OK at low ping; HOL-blocking ceiling | Universal | Trivial | MP **v1**, lobby, chat, matchmaking |
| WebRTC DataChannel | Excellent (UDP) | Wide | High (signaling, STUN/**TURN**) | UDP-now (via Geckos.io), P2P |
| WebTransport (QUIC) | Excellent (datagrams) | **Baseline since Mar 2026** | Medium-high (HTTP/3, TLS, immature Node libs) | The **target** hot path |

**Plan:** Build the netcode against a small `Transport` interface (`send(channel, bytes)`,
`onMessage`). Ship on **WebSocket** first. Migrate the position/input hot path to
**WebTransport datagrams** once we either (a) commit to `@fails-components/webtransport`
or (b) host behind an edge that terminates QUIC for us. Keep WebRTC/Geckos.io as the
fallback if WebTransport server tooling disappoints.

---

## 2. Netcode architecture for a web FPS

The standard fast-shooter stack. Each piece exists to hide network latency while keeping
the **server authoritative** (the only defensible anti-cheat posture in a browser).

### 2.1 Client-server authoritative
- The **server owns the truth**: positions, health, hits, pickups. Clients send **inputs/
  intent** ("I'm holding W, looking at yaw θ, I fired at tick N"), never results ("I killed
  X"). The server simulates and broadcasts authoritative state. This is the foundation of
  both correctness and anti-cheat. (Do **not** ship the listen-server/host-migration shape
  for competitive play if avoidable; a neutral dedicated server is the authority.)

### 2.2 Fixed tick rate
- Server runs a **fixed-timestep simulation loop** (e.g. 30 or 60 Hz; competitive shooters
  go 64–128 Hz — Valorant runs 128-tick, Overwatch/CS historically 64). Higher tick =
  lower input latency + tighter hit-reg, but **linearly more CPU and bandwidth per player**,
  so it's a cost dial. **Start at 30 Hz** simulation with a **separate, lower snapshot/patch
  rate** (e.g. 20 Hz) to clients; raise later if the feel demands it.
- Tick rate also bounds **"peeker's advantage"** and hit-registration fairness — known FPS
  pain points tied to tick + ping.

### 2.3 Client-side prediction
- If the client waited for the server to acknowledge every input, movement would feel
  laggy by a full RTT. Instead the client **immediately applies its own inputs locally**
  using the *same simulation code* the server runs, so the local player moves with zero
  perceived delay. Each input is tagged with an **incrementing sequence number** and kept
  in a pending buffer.

### 2.4 Server reconciliation
- The server's authoritative state messages include **"last input sequence I processed."**
  When the client receives an authoritative snapshot, it **snaps to that state, then
  re-simulates ("replays") all still-unacknowledged inputs** on top of it. If the client's
  prediction was right, nothing visibly changes; if it was wrong (e.g. blocked by a wall it
  didn't know about), it smoothly corrects. **Caveat:** replaying many ticks per snapshot is
  CPU work — keep the sim step cheap, and the input buffer bounded.

### 2.5 Entity interpolation (other players)
- You **cannot** predict other players (you don't know their input). Instead, **buffer
  remote-entity snapshots and render them slightly in the past** (e.g. ~100ms / 2–3 snapshots
  behind), interpolating between the two surrounding snapshots. This trades a small, constant
  visual delay for smooth, non-jittery movement of everyone else. Extrapolate only as a
  fallback when packets are late.

### 2.6 Lag compensation (hit registration)
- When a player fires, their target was rendered **in the past** (interpolation delay +
  their ping). To make "I aimed at them and clicked" register fairly, the server
  **rewinds the world** to the state the shooter actually saw at their command time, runs
  the hit test there, then applies results to the present. This is what makes shots feel
  fair across ping — and it's the most subtle part to get right (it can create
  "I died behind cover" moments for the victim; that's the inherent tradeoff).

### 2.7 Snapshot / delta compression (bandwidth)
- Naively sending full world state every tick to every client is bandwidth-heavy. Standard
  optimizations:
  - **Delta compression:** send each snapshot relative to a baseline the client has
    acked ("snapshot 110 relative to 100") — only what changed.
  - **Quantization:** reduce precision (e.g. positions to cm, angles to a byte or two)
    before sending.
  - **Bit packing:** pack fields into minimal bits (health 0–100 = 7 bits, not 32).
  - **Area-of-interest / relevancy:** don't send entities a player can't see/affect.
- For a small-arena FPS at low player counts these are *optimizations, not v1 blockers* —
  but design messages as compact binary (e.g. an ArrayBuffer/`DataView` schema, or
  Colyseus's schema) from the start rather than JSON.

### Data flow (one tick)
```
client: sample input → apply locally (predict) → send {seq, input} to server
server: collect inputs → step sim at fixed dt → produce authoritative state
server: broadcast {state delta, lastProcessedSeq[player]}  (snapshot/patch rate)
client(local) : snap to authoritative → replay unacked inputs (reconcile)
client(remote): buffer snapshots → render ~100ms behind, interpolate
server(hit)   : rewind world to shooter's view-time → test → apply (lag comp)
```

---

## 3. Frameworks & services (2026)

> **Market churn warning (verified June 2026):** **Hathora shut down its game-server
> hosting on 2026-05-05** after acquisition by Fireworks AI — do **not** build on it.
> **Rivet** has repositioned around general "Actors" (stateful workloads / AI agents),
> Apache-2.0 and self-hostable, billed per "awake actor hour"; still usable for game
> backends but less game-specific than before. Re-verify any vendor before committing.

| Option | Lang / model | Transport | State sync | Hosting / pricing | Fit for web FPS |
|---|---|---|---|---|---|
| **Colyseus** | Node/**TypeScript**, room-based, authoritative | WebSocket | Built-in schema state sync, `setSimulationInterval` (fixed tick), patch rate | **MIT, self-host free**; Colyseus Cloud from ~$15/mo, 32 regions, scales 10→10k+ CCU, rolling deploys | **Strong.** Same language as our client; gives rooms/matchmaking/state out of the box. WS-only (no UDP) is the main FPS caveat. |
| **Geckos.io** | Node | **WebRTC DataChannels (UDP)** | You build it (ships a snapshot-interpolation lib) | Self-host (OSS); actively maintained (v3.x, 2026) | **Good for UDP-now.** You write the netcode yourself, but you get unreliable datagrams without waiting on WebTransport server tooling. |
| **WebTransport (DIY)** | Node + `@fails-components/webtransport` | **QUIC datagrams + streams** | You build it | Self-host; needs HTTP/3 + TLS | The future target; **server tooling still immature** in mid-2026. |
| **Photon (Fusion/Quantum)** | Unity-centric; WebGL support | Photon cloud | Engine-provided (Quantum = deterministic) | Free 100 CCU; ~$125/mo @500 CCU, ~$500/mo @2000 CCU; $0.50/CCU premium | Mature, but **Unity-oriented**. We're a Three.js/JS web game — poor fit unless we change engines. |
| **Nakama (Heroic Labs)** | **Go** server, embeds Lua/JS/Go logic | WS / rUDP | Authoritative match handler | OSS (self-host) + Heroic Cloud (paid) | Great **backend BaaS** (auth, leaderboards, social, matchmaking) + authoritative matches, but realtime loop is in Go — language mismatch with our JS sim. |
| **PlayFab (Microsoft)** | BaaS + multiplayer servers (Azure) | Your server binary | N/A (you bring the server) | Azure pricing | Heavy/enterprise; good LiveOps/economy, overkill for our stage. |
| **Playroom Kit** | JS, **serverless** | Auto WebRTC/WS | Shared room state, presence | Managed; persistence is a paid feature; state cleared when room empties | **Fast to prototype** casual MP; abstracts transport. Not aimed at competitive authoritative FPS netcode (no custom server tick/lag-comp). Good for a quick co-op/party experiment. |
| **Edgegap** (hosting, not a framework) | Any server binary | Any | N/A | **On-demand ~$0.069/vCPU-hr** ($0.00115/vCPU-min) + ~$0.10/GB egress, vCPU fractioning, free tier, 600+ edge locations | **Recommended host** for a custom dedicated server (Colyseus/Geckos/DIY) — pay only while matches run. |

### Framework recommendation
- **If we want speed-to-MP and stay in JS/TS:** **Colyseus**, self-hosted or on Colyseus
  Cloud. Use `setSimulationInterval` as the fixed server tick, run our authoritative sim in
  the room, and use the schema for delta-synced state. Accept WS for v1; add prediction/
  reconciliation/interpolation ourselves on top (Colyseus doesn't do FPS netcode for you).
- **If WS latency proves insufficient:** add **Geckos.io** (WebRTC/UDP) or migrate the hot
  path to **WebTransport** behind our `Transport` interface.
- **Host on Edgegap** (or Colyseus Cloud) so we don't pay for idle servers.
- **Serverless / dedicated:** truly serverless (Playroom, Cloudflare Durable Objects) is
  great for casual/low-rate sync; a **dedicated authoritative process per match** is the
  right shape for an FPS sim loop. Plan for dedicated.

---

## 4. Hosting, scaling & anti-cheat

### Hosting & scaling
- **Shape:** one **authoritative dedicated server process per match/room** (an arena of
  N players). Matches are short-lived; spin up on match start, tear down on end.
- **Orchestration:** use an allocator (Colyseus Cloud, **Edgegap**, or self-managed
  Kubernetes/Agones) to place a fresh server near the players and recycle it after. Pay
  **per-match** rather than for idle capacity (Edgegap's model).
- **Latency = geography.** Place servers close to players; this matters more than almost
  any code optimization. (Riot literally built Riot Direct, their own ISP backbone, for
  Valorant — we won't, but it shows latency is an infra problem first.)
- **Node authoritative sim caveats:** Node is single-threaded; one match = one event loop.
  Keep the per-tick sim cheap (no GC churn — reuse buffers, avoid per-tick allocations),
  and run **multiple matches as separate processes** (or `worker_threads`) to use all
  cores. Watch the cost of reconciliation replay and broadcast serialization per tick.
- **Matchmaking:** start with the framework's built-in lobby/room matchmaking (Colyseus,
  Nakama, Playroom all provide casual "find/create room with open slots"). Skill-based
  matchmaking is a later concern.

### Anti-cheat (browser reality check)
- **The client is fully untrusted and inspectable.** Anyone can read/modify our JS, the
  WASM, memory, and packets. There is **no client-side secret** and **no reliable
  browser anti-cheat** (no kernel driver like AAA PC anti-cheat). Be honest: cheating is
  *mitigable, not preventable*. Even top AAA anti-cheat is reportedly ~50% effective.
- **Therefore: server authority is the whole game.**
  - Server simulates movement/physics; **reject impossible inputs** (speed/teleport/
    fly-hack bounds checks).
  - Server does **all** hit detection, damage, line-of-sight, pickups, scoring — client
    sends *fire intent*, server decides hits (with lag comp).
  - **Validate input rates/ranges** (fire rate, look-delta sanity, input sequence sanity).
  - Server-side **statistical detection** (impossible accuracy, snap-aim, wallbang
    patterns) → flag/kick/ban out of band.
- **Aimbots/wallhacks specifically:** these read the legit client render data, so server
  authority doesn't stop them. Partial mitigations: **don't send entity data the player
  can't see** (server-side relevancy/occlusion culling) to starve wallhacks; behavioral
  detection for aim. Accept residual risk.

---

## 5. Phased plan

The goal: **make single-player decisions now that turn "add multiplayer" into an
extension, not a rewrite.** The two enemies of a clean MP retrofit are (1) game logic
tangled into the render loop, and (2) state mutated directly by per-frame input. Our
current `engine.js` has both (`dt = clock.getDelta()`, input mutates state inline). Fix
the *architecture* now; defer the *networking*.

### Phase 0 — Single-player, MP-ready architecture (DO NOW, low cost)
Refactor the game (not the network) around these principles:
1. **Fixed-timestep simulation loop.** Use an accumulator: render at display rate, but
   step the **simulation** in fixed `dt` increments (e.g. 1/60). Render interpolates
   between the last two sim states. This decouples sim from framerate (good SP hygiene) and
   is the exact substrate prediction/reconciliation needs.
2. **Input as commands, not direct mutation.** Each frame, sample input into a plain
   **command object** (`{moveX, moveZ, yaw, pitch, fire, jump, seq}`). The simulation
   step consumes commands; it never reads the DOM/`Input` directly. (Today input mutates
   `yaw`/`pitch`/position inline — move that into a `simulate(state, command, dt)` function.)
3. **Pure-ish simulation core.** `simulate(state, command, dt) → newState` with **no
   rendering, no Three.js objects, no globals** inside it. Game state is plain data
   (positions, velocities, health). Rendering reads state to update Three.js meshes. This
   single function is what the server will run later — unchanged.
4. **Deterministic-leaning core.** Avoid `Math.random()` in the sim (use a seeded PRNG),
   keep sim time off `Date.now()`/wall clock, and isolate float math. We don't need
   bit-exact cross-machine determinism (the FPS stack uses authoritative state, not
   lockstep), but a clean, side-effect-free, seeded core makes prediction/replay and
   tests far easier.
5. **Separate concerns into modules:** `sim/` (state + step, no rendering), `render/`
   (Three.js view of state), `input/` (sample → command), and later `net/` (transport +
   prediction/reconciliation). Keep a `Transport` interface stub even now (local "loopback"
   transport) so SP runs through the same plumbing MP will use.

> This phase is **single-player work with a multiplayer-shaped spine.** It pays off
> immediately (replays, deterministic tests, framerate independence) and is the thing that
> prevents a rewrite.

### Phase 1 — Local "fake network" loop
- Run the sim through a **loopback transport** with artificial latency/jitter/packet-loss
  injected. Add client-side prediction + reconciliation + entity interpolation against this
  fake net. **You can build and tune 90% of the netcode with zero server**, which de-risks
  the hard part early.

### Phase 2 — Authoritative server v1 (WebSocket)
- Stand up a Node authoritative server (Colyseus or a thin `ws` server) that runs the
  **same `simulate()`** at a fixed tick (start 30 Hz sim / 20 Hz snapshot). Wire the real
  WS transport behind the `Transport` interface. 2–8 players, one region. Add lag
  compensation for hit-reg. This is the first "real multiplayer" milestone — and the first
  big chunk of effort/cost.

### Phase 3 — Transport upgrade + scale + anti-cheat hardening
- Swap the hot path to **WebTransport datagrams** (or Geckos.io/WebRTC) for sub-100ms
  feel; keep reliable streams for control/chat.
- Add **delta/quantization/bit-packing** for bandwidth, **relevancy culling**.
- Add **orchestration** (Edgegap/Colyseus Cloud), multi-region, matchmaking.
- Harden **anti-cheat**: input validation bounds, statistical detection, occlusion-aware
  state sending.

### Honest scope assessment
- **Phase 0** is days, not weeks, and is worth doing regardless of MP.
- **Phases 1–2** are where real multiplayer lives: client-side prediction, reconciliation,
  interpolation, and lag compensation are individually subtle and collectively the hardest
  netcode to get *feeling right*. Budget **months**, not weeks, and expect significant
  tuning. This is why the recommendation is to **defer MP** but **pre-pay the architecture**.
- Multiplayer also adds **permanent ops cost**: servers, monitoring, matchmaking, and an
  anti-cheat treadmill you never fully win.

---

## Sources

Transport:
- WebSocket vs HTTP/SSE/MQTT/WebRTC/WebTransport (2026) — https://websocket.org/comparisons/
- DataChannel vs WebTransport vs WebSockets: When to Use Each — https://medium.com/@justin.edgewoods/datachannel-vs-webtransport-vs-websockets-when-to-use-each-63bb932821e5
- WebRTC vs WebSockets for multiplayer games (Rune) — https://developers.rune.ai/blog/webrtc-vs-websockets-for-multiplayer-games
- WebTransport Is Now Baseline (WebRTC.ventures, Apr 2026) — https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/
- WebTransport now in all browsers (AnhTu.dev, 2026) — https://anhtu.dev/webtransport-next-gen-realtime-protocol-2026-2228
- Frontier Web APIs 2026 (production-ready) — https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready
- WebTransport API — MDN — https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API
- Node.js WebTransport guide (VideoSDK, 2025) — https://www.videosdk.live/developer-hub/webtransport/nodejs-webtransport
- WebTransport browser support — https://www.testmuai.com/learning-hub/webtransport-browser-support/

Netcode models:
- Gabriel Gambetta — Client-Side Prediction & Server Reconciliation — https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
- Gabriel Gambetta — Entity Interpolation — https://www.gabrielgambetta.com/entity-interpolation.html
- Gaffer On Games — Snapshot Compression — https://gafferongames.com/post/snapshot_compression/
- SnapNet — Netcode Architectures (Lockstep / Snapshot Interpolation) — https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/ , https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/
- Deterministic vs State netcode — https://daposto.medium.com/game-networking-7-deterministic-vs-state-85f45ee582a4
- Unity Netcode — Data compression / ghost snapshots — https://docs.unity3d.com/Packages/com.unity.netcode@1.10/manual/optimization/compression.html
- Fixed timestep / deterministic core for MP — https://jakubtomsu.github.io/posts/fixed_timestep_without_interpolation/ , https://andreleite.com/posts/2025/game-loop/fixed-timestep-game-loop/

Tick rate:
- VALORANT's 128-Tick Servers (Riot Games) — https://www.riotgames.com/en/news/valorants-128-tick-servers
- Server tick rates compared — https://diamondlobby.com/server-tick-rates/

Frameworks & hosting:
- Colyseus — https://colyseus.io/ , scalability — https://docs.colyseus.io/scalability , pricing — https://colyseus.io/pricing/
- Geckos.io — https://github.com/geckosio/geckos.io , https://geckos.io/
- Photon Fusion/Quantum pricing — https://www.photonengine.com/fusion/pricing , WebGL — https://blog.photonengine.com/photon-multiplayer-webgl-for-game-jams/
- Nakama / Heroic Labs — https://heroiclabs.com/nakama/ , https://heroiclabs.com/pricing/
- Playroom Kit — https://joinplayroom.com/ , https://docs.joinplayroom.com/
- Rivet — https://rivet.dev/ , https://github.com/rivet-dev/rivet
- Hathora shutdown / acquisition — https://gameye.com/best-game-server-hosting/ , https://edgegap.com/comparison/edgegap-vs-hathora
- Edgegap pricing — https://edgegap.com/resources/pricing , https://edgegap.com/blog/announcement-offering-changes-for-2025
- Open-source game server comparison 2025 — https://medevel.com/game-server-2025/

Anti-cheat:
- Server-authoritative logic to prevent cheating (AccelByte) — https://accelbyte.io/blog/server-authoritative-logic-to-prevent-cheating
- Server- vs client-side anti-cheat (i3D.net) — https://www.i3d.net/ban-or-not-comparing-server-client-side-anti-cheat-solutions/
- Browser game server-side anti-cheat (Project Void devlog) — https://viddlerage.itch.io/project-void/devlog/1459124/patch-12-anti-cheat
