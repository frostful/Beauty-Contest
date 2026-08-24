# UI, Animation & Performance Architecture
## KOD: The Beauty Contest (King of Diamonds)

---

## 1. Executive Vision: The Brutalist Courtroom Aesthetic

The King of Diamonds game in *Alice in Borderland* is set inside the Supreme Court of Japan—a somber, high-stakes arena where the Scales of Lady Justice measure life and death via sulfuric acid ($H_2SO_4$).

The visual design should reflect:
- **Kinetic Weight & Physicality:** Mechanical gears, heavy stamped brass tokens, tilting beams with real inertia, and sloshing liquid.
- **Tension & Atmospheric Dread:** Overhead acid tubes filling with every point lost, pulsing crisis vignettes under low time, and harsh industrial lighting.
- **Precision & Clarity:** Crisp laser scanners, holographic foil finishes, and high-contrast digital-analog hybrid readouts.

---

## 2. The 12-Player Radial Courtroom: Layout Blueprints

A common question is: **"We have 12 players max—do we need to reduce the count to fit a radial perspective?"**

**Answer: No.** Keeping 12 players max is ideal for multiplayer lobbies, Discord groups, and streaming rooms. With the right layout architecture, 12 seats fit cleanly and look even more cinematic than a small room.

```
                      DESIGN 1: THE TWO-TIERED AMPHITHEATER
 
                             [ JUDGE / SCALE PODIUM ]
 
       [07]       [08]       [09]       [10]       [11]       [12]   <-- Upper Tier (6)
          [01]       [02]       [03]       [04]       [05]       [06]      <-- Lower Tier (6)
                                 
                                [ YOU / DIAL ]
```

### Design 1: The Two-Tiered Amphitheater (Recommended)
* **How it works:** Splits the 12 seats into two concentric curved rows (6 in front, 6 elevated behind).
* **3D Depth:** The back row is slightly scaled down ($85\%$) and positioned higher on the Z-axis, creating realistic parliamentary/courtroom perspective.
* **Clarity:** Generous horizontal space for avatar badges, nameplates, desk lamps, and status indicators without crowding.

---

```
                       DESIGN 2: ADAPTIVE 180° HORSESHOE ARC
 
                                [ SCALE / PODIUM ]
 
            [01]                                           [12]
               [02]                                     [11]
                 [03]                                 [10]
                   [04]                             [09]
                      [05]                       [08]
                          [06]               [07]
 
                                [ YOU / DIAL ]
```

### Design 2: Adaptive 180° Horseshoe Arc
* **How it works:** All players sit along a continuous semi-circular arc around the central arena.
* **Dynamic Scaling:**
  * **5 Players (Canon size):** Desks automatically spread out with wide gaps and large prominent badges.
  * **12 Players (Grand Chamber):** Desks scale down slightly and distribute evenly along the curve.

---

```
                       DESIGN 3: MOBILE-RESPONSIVE CURVED WINGS
 
                    ┌───────────────────────────────────┐
                    │       OVERHEAD SCALE / TIMER      │
                    │                                   │
                    │   [01]                     [07]   │
                    │   [02]     [ SELECTION ]   [08]   │
                    │   [03]     [   VAULT   ]   [09]   │
                    │   [04]     [   DIAL    ]   [10]   │
                    │   [05]                     [11]   │
                    │   [06]                     [12]   │
                    │                                   │
                    │         [ LOCK SELECTION ]        │
                    └───────────────────────────────────┘
```

### Design 3: Mobile Responsive Layout (< 600px viewports)
* On narrow mobile screens, seats organize into **two curved flanking wings** (6 left, 6 right) with the central column dedicated to the Rotary Dial, Timer, and Scale.

---

## 3. The Next-Gen Balance Scale: Kinetic Dual-Pan Physics

Currently, the balance scale is represented as an abstract background graphic and a single tilting bar. Evolving this into a full **physics-driven mechanical centerpiece** creates an unforgettable visual climax every round.

```
                       PHYSICAL DUAL-PAN REVOLUTION
 
           [ Beam tilts dynamically based on Left vs Right Weight ]
                      ┌───────────────▲───────────────┐
                      │               │               │
            Chain ─── │               │               │ ─── Chain
                      ▼                               ▼
               ┌─────────────┐                 ┌─────────────┐
               │  LEFT PAN   │                 │  RIGHT PAN  │
               │ (Raw Picks) │                 │  (AVG ×0.8) │
               │   [40][25]  │                 │  [Target]   │
               └─────────────┘                 └─────────────┘
                      ▲                               ▲
                      └──── Liquid sloshes in pans ───┘
```

### Key Visual & Motion Mechanics:
1. **Weighted Brass Tokens:**
   - Instead of abstract number chips, player picks drop into the left pan as heavy stamped brass weights.
   - Larger numbers produce physically larger weights (e.g. a `90` is massive compared to a `15`).
2. **Kinetic Pan Impacts & Damped Oscillations:**
   - As each token drops into the pan, the pan dips with a spring rebound.
   - The central balance beam tilts in real time with slight rotational overshoot before settling into equilibrium.
3. **Sloshing Sulfuric Acid Reservoirs:**
   - The underside of each pan features a translucent glass cylinder filled with glowing neon-green acid.
   - As the beam tilts, the liquid level remains horizontal while surface waves slosh against the glass.
4. **Morphing "Scale-to-Ruler" Transformation:**
   - **Stage 1 (Sum & Average):** The dual-pan scale finds the group's physical center of mass.
   - **Stage 2 (Target & Comparison):** The horizontal beam smoothly detaches its chains and expands into a laser-etched precision number ruler ($0\text{--}100$) where player markers land.

---

## 4. Arena & Player Input: The Mechanical Vault Dial

Moving away from generic web sliders toward tactile, analog-inspired controls that evoke heavy vault combinations and secret lock-ins.

```
+─────────────────────────────────────────────────────────────────────────────+
│                           THE ROTARY VAULT DIAL                             │
│                                                                             │
│                                  ╭───────╮                                  │
│                                ╱    40   ╲                                  │
│                               │  39 ◈ 41  │                                 │
│                                ╲    42   ╱                                  │
│                                  ╰───────╯                                  │
│                    [  DRAG ROTARY DIAL OR FLIP CARD  ]                      │
│                                                                             │
│         [ 🔒 SEALED NUMBERS: 24 · 50 wrapped in caution hazard tape ]       │
+─────────────────────────────────────────────────────────────────────────────+
```

### Key UI Features:
1. **Rotary Vault Combination Wheel:**
   - A 3D-beveled brass tumbler wheel with smooth inertial momentum when dragged or scrolled.
   - Distinct mechanical click notches on every integer tick.
2. **Heavy Steel Shutter Lock-In:**
   - Upon pressing Lock Selection, a heavy steel shutter slams shut over the dial with mechanical locking bolts, permanently sealing the pick for that round.
3. **Scorched & Hazard-Taped Sealed Numbers:**
   - Deadlocked/banned numbers appear wrapped in glowing red caution hazard tape and scorched glass cracks. Dragging across a sealed number provides magnetic resistance or visual spark friction.
4. **Heartbeat Crisis Vignette:**
   - When under 10 seconds remain, the screen borders pulse with a blood-red vignette, the timer dial leaks green vapor, and a low-frequency heartbeat pulse accelerates each second.

---

## 5. Cinematic Results & Calculation Flow

```
                      STEP-BY-STEP CALCULATION ARC
 
   [1. Influx]          [2. Equilibrium]        [3. Laser Target]       [4. Distance Radar]
Numbers drop into ──► Scale finds group ──► Red laser slices ──► Radar ripple expands;
left balance pan       average point          at Target (0.8x)      winner glows gold!
```

### Key Animation Stages:
1. **Laser-Cut Target Slicing:**
   - Once the average is determined, a glowing red laser scanner sweeps vertically down the number track, slicing at the exact decimal target position with smoke and light flare effects.
2. **Distance Radar & Proximity Waves:**
   - Expanding circular radar waves pulse outward from the laser target mark.
   - The first player marker touched by the wave illuminates in brilliant gold, while outlying markers dim into dark graphite.
3. **Duplicate Collisions (Rule 1 VFX):**
   - If two players choose the same number, their markers violently collide on the track, emitting electrical arcs and cracking into shattered pieces to visually explain why both were voided.

---

## 6. Acid Elimination ($H_2SO_4$) Upgrade

Transforming the elimination sequence from a basic card animation into a visceral set-piece.

```
+─────────────────────────────────────────────────────────────────────────────+
│                        CITIZEN FILE CORROSION                               │
│                                                                             │
│    1. Overhead tube drains: Acid level rises in player's chamber           │
│    2. Dynamic bubbling liquid surfaces with undulating fluid displacement  │
│    3. Citizen ID card dissolves into ash particles with rising vapor       │
+─────────────────────────────────────────────────────────────────────────────+
```

### Key Atmospheric Enhancements:
1. **Overhead Acid Vials in Live Roster:**
   - Every player has a personal glass vial above their avatar in the side feed.
   - As a player's score drops from $0 \to -9$, acid visibly rises in their tube. At $-9$, the acid trembles at the very brim.
2. **Organic Fluid Shader & Corrosive Vapor:**
   - Liquid surfaces feature organic bubbling displacement, undulating waves, and rising toxic steam clouds as the victim's card sinks and corrodes away into black ash.

---

## 7. Winner Coronation: Holographic 3D Card Showcase

* **Holographic Card Shimmer:** The champion’s victory card flips in full 3D with dynamic iridescent foil reflections that shimmer based on mouse/touch movement.
* **Obsidian Table Scattering:** Defeated player cards scatter across a dark polished marble floor with soft shadows and glowing point totals.
* **Golden Balance Crown:** A golden miniature balance scale descends from above to crown the victor's avatar emblem.

---

## 8. Web Performance & GPU Optimization Architecture

### "Won't all these animations make the web game heavy or laggy?"

**No, if built with GPU-composited primitives.** The reason web games become laggy is usually due to heavy 3D rendering engines (e.g. Three.js / WebGL loading 50MB+ models), unoptimized canvas loops, or DOM layout thrashing (triggering browser CPU reflows).

By adhering to the following **Zero-Reflow Performance Architecture**, the entire visual suite runs at **constant 60–120 FPS with a bundle footprint under 50KB**:

```
+─────────────────────────────────────────────────────────────────────────────+
│                  THE GPU-COMPOSITOR PIPELINE (60-120 FPS)                   │
│                                                                             │
│   ❌ CPU Layout Thrashing (Laggy)      ✅ GPU Composited Layers (Silky)     │
│   - top / left / width / height        - transform: translate3d(x, y, z)    │
│   - margin / padding adjustments       - transform: rotate() / scale()      │
│   - box-shadow re-renders              - opacity transitions                │
│   - continuous DOM style reads         - will-change: transform             │
+─────────────────────────────────────────────────────────────────────────────+
```

### Performance Golden Rules for this Codebase:

1. **Hardware-Accelerated Composite Only (`transform` & `opacity`):**
   - Every animation (balance scale tilting, flying brass tokens, dial rotation, radar waves) strictly animates `transform: translate3d()` and `opacity`.
   - These properties are handled directly on the graphics card compositor thread, never interrupting JavaScript execution or triggering browser layout recalculations.

2. **Zero Heavy 3D Engines — Pure Lightweight Vector SVGs:**
   - The entire visual suite uses lightweight SVG vectors, CSS gradients, and math curves.
   - No external 3D engine libraries (Three.js/Babylon) or heavy 3D GLTF asset downloads.
   - Procedural Web Audio API oscillator synthesis means **zero MP3 audio downloads**.

3. **SVG Filter Scoping:**
   - Complex SVG filters (like `feTurbulence` for bubbling acid) are mounted **only during the 4-second elimination sequence** and unmounted immediately after, preventing background GPU idle overhead.

4. **Dynamic Tiering & Battery Saver Mode:**
   - **`prefers-reduced-motion`:** Instantly disables complex spring oscillations and presents instant static transitions for accessibility or low-power modes.
   - **Mobile Frame-Rate Protection:** On mobile viewports ($<600\text{px}$), particle counts (acid bubbles, background embers) automatically scale down from $18 \to 6$ via CSS variables.

---

## 9. Prioritized UI & Animation Roadmap

| Tier | Feature Area | Key Visual Upgrades | Perf Cost |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Quick Wins)** | **Results Screen Polish** | Laser-cut target scanner, expanding distance radar wave, duplicate marker collision sparks. | ⚡ Minimal (< 1% GPU) |
| **Tier 2 (High Impact)** | **Tactile Arena Controls** | Rotary combination vault dial, hazard-taped sealed numbers, heartbeat crisis vignette. | ⚡ Minimal (< 2% GPU) |
| **Tier 3 (Atmosphere)** | **Live Status & Acid** | Overhead filling acid vials on player feed, organic fluid shaders during elimination. | ⚡ Scoped (Active 4s only) |
| **Tier 4 (Showstopper)** | **Kinetic Balance Scale** | Full dual-pan brass weight dropping, damped beam spring physics, morphing scale-to-ruler. | ⚡ Pure CSS GPU transforms |
