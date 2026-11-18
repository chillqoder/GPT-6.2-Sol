# Prompt for Creating a 3D Orc Shaman with Three Spells in Three.js

## Objective
Create a single-file `index.html` web application using **Three.js** (loaded via CDN, e.g., `https://unpkg.com/three@0.160.0/build/three.module.js` with an import map) that renders a stylized **3D orc shaman** holding a **totem staff** in his right hand. The scene must include **three UI buttons at the bottom of the screen**, each casting a different spell with its own body animation and visual effect:

1. **Chain Lightning** (blue / electric)
2. **Fireball** (orange / fire)
3. **Earthquake Totem** (green-brown / earth)

A simple **target** (a wooden training dummy) stands in front of the shaman so the spells have something to hit.

---

## Technical Requirements

### 1. File Structure
- **One single file:** `index.html`
- No external assets (no images, no GLTF models, no textures, no audio files) — everything must be **procedurally generated using Three.js primitives** (`BoxGeometry`, `SphereGeometry`, `CylinderGeometry`, `ConeGeometry`, `CapsuleGeometry`, `TorusGeometry`, `IcosahedronGeometry`, `LatheGeometry`, `ExtrudeGeometry`, custom `BufferGeometry`, etc.).
- Include all CSS and JavaScript inline inside the HTML file.
- Use **ES modules** via `<script type="importmap">` and `<script type="module">`.
- Do **not** use any build tools, bundlers, npm, or animation libraries (no GSAP).

### 2. Renderer / Scene Setup
- `WebGLRenderer` with `antialias: true`, `shadowMap.enabled = true`, `shadowMap.type = THREE.PCFSoftShadowMap`, and `ACESFilmicToneMapping`.
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`.
- `PerspectiveCamera` framing the shaman from a front-left three-quarter view (e.g., position `(4, 3, 7)`, looking at `(0.8, 1.2, 0)`), with the training dummy visible to the right/front of the orc.
- `OrbitControls` (from `three/addons/controls/OrbitControls.js`) with damping enabled and limited polar angle (camera must not go under the ground).
- Scene background: dark night-sky color (e.g., `#12141c`) with `FogExp2` for atmosphere.
- Ground: large `CircleGeometry`, dark mossy green/brown, receiving shadows. Optionally scatter a few low-poly rocks and a ring of small stones around the shaman (a ritual circle).
- Lighting:
  - `HemisphereLight` for ambient fill (cool sky, warm ground).
  - `DirectionalLight` (moonlight, slightly blue) casting shadows.
  - A `PointLight` attached to the **staff crystal** — its color and intensity change depending on the spell being cast (blue / orange / green). In idle it pulses softly.
  - A warm `PointLight` from a small procedural **campfire** behind the orc (optional but recommended, flickering intensity).

### 3. Orc Shaman Character (Procedural, Low-Poly / Stylized)
Build the shaman as a **hierarchical group** (`THREE.Group`) named `shaman`, made of nested child groups with pivots at the joints so limbs can be animated naturally.

**Anatomy (skin color `#4a7c3a` with slight variation, `MeshStandardMaterial`):**

- **Head** — slightly elongated sphere; add:
  - Two glowing eyes (small emissive spheres, color matches the current spell, default pale yellow).
  - Heavy brow ridge (flattened box).
  - Two **tusks** (cones pointing up from the lower jaw), off-white.
  - Two long **pointed ears** (cones rotated outward), with small ring earrings (`TorusGeometry`).
  - **Shamanic headdress:** a bone/horn crown — two curved horns (stacked rotated cones or a `TubeGeometry` along a curve) plus 3–5 feathers (thin flattened cones/planes in red, white, teal).
  - War paint: thin white or blue emissive stripes on the face (thin boxes/planes).
- **Torso** — hunched, broad shoulders, slightly thinner than a warrior. Wear:
  - A **fur mantle / cape** over the shoulders (flattened sphere segments or a cone, brown-grey).
  - A **bone necklace** (a ring of small cones/spheres around the neck).
  - A rope belt (`TorusGeometry`) with a few hanging pouches (small spheres/boxes).
  - A long **robe / loincloth** reaching the knees (open cone or box, dark leather color).
- **Arms** — each arm is a nested group:
  - `leftArmGroup` (shoulder pivot) → upper arm → `leftForearmGroup` (elbow pivot) → forearm → `leftHand` (open palm, used for casting gestures).
  - `rightArmGroup` → upper arm → `rightForearmGroup` → forearm → `rightHand` holding the staff.
  - Leather bracers on forearms (cylinders), bead bracelets (small tori).
- **Legs** — hips → thigh → `kneeGroup` → shin → wrapped foot (box). Bare feet or fur boots.

**Proportions:** stylized — big hands, long arms, slightly hunched posture, shorter legs, oversized head decoration.

### 4. Totem Staff (Procedural)
Attach the staff as a child of the **right hand group** so it moves with the arm.

- **Shaft** — slightly bent wooden pole (several short cylinders with small rotation offsets, or a `TubeGeometry` along a `CatmullRomCurve3`), ~1.8 units long, dark wood color.
- **Top** — a carved wooden fork/claw (2–3 cones curving inward) holding a floating **crystal** (`OctahedronGeometry` or `IcosahedronGeometry`, `MeshStandardMaterial` with `emissive` + `emissiveIntensity`, slowly rotating and bobbing).
- **Decorations** — a small animal skull (sphere + cones), hanging feathers and bead strings (thin cylinders + small spheres) that sway gently with the idle animation.
- Expose a helper `getStaffTipWorldPosition()` that returns the crystal's world position (used as the spell origin).

### 5. Training Dummy (Target)
- Positioned ~4 units in front of the shaman (e.g., `(3.5, 0, 2.5)`), facing him.
- Built from a wooden post (cylinder), a straw-sack body (capsule, beige), cross-bar arms (box), and a sack head (sphere) with stitched X eyes (thin boxes).
- When hit, the dummy **wobbles** (damped spring rotation around its base) and briefly **flashes** in the spell color (temporarily raise `emissive`).
- Expose `getTargetPosition()` returning the dummy's chest world position.

### 6. UI / Controls
- **Bottom-center spell bar** — a horizontal row of **three square ability buttons** (MMO/MOBA action-bar style), each ~80×80 px, with:
  - A big emoji or inline SVG icon: ⚡ Chain Lightning, 🔥 Fireball, 🪨 Earthquake.
  - The spell name below the icon (small caps).
  - A **hotkey label** in the corner: `1`, `2`, `3` (keyboard keys `1`/`2`/`3` and `Q`/`W`/`E` also cast the spells).
  - A themed border and glow: blue for lightning, orange for fire, green for earth; brighter glow on hover, a press/scale-down animation on click.
  - A **cooldown overlay**: after casting, the button darkens and a radial "clock-wipe" sweep (CSS `conic-gradient` driven by a CSS variable updated from JS) shows the remaining cooldown, with the remaining seconds as a number in the middle.
    - Cooldowns: Lightning 2 s, Fireball 3 s, Earthquake 5 s.
- **Mana bar** above the spell buttons (blue gradient bar, 100 max). Costs: Lightning 20, Fireball 30, Earthquake 45. Mana regenerates at ~8/s. If mana is insufficient, the button shakes and shows a short red tint, and the spell is not cast.
- A small on-screen title in the top-left: "Orc Shaman — Spirits of the Storm", and a hint: "Drag to rotate · Scroll to zoom · 1/2/3 to cast".
- Optional: floating damage numbers (HTML elements projected from 3D to screen coordinates) above the dummy on hit.
- Button listeners call `castSpell('lightning' | 'fireball' | 'earthquake')`.

### 7. Spell Animations & Effects
Implement a small **keyframe/tween system** manually (keyframes + easing functions such as `easeOutCubic`, `easeInCubic`, `easeInOutCubic`, `easeOutBack`) driven by `THREE.Clock` in the render loop.

**General rules:**
- Store each animated group's **rest rotation/position** as a base state; spell animations are offsets from it.
- Only **one spell casting animation at a time**: while `isCasting` is true, new casts are ignored (button press is not consumed, no cooldown triggered).
- Every spell has three phases: **channel (wind-up) → release → recovery**, and the staff crystal light/emissive transitions to the spell color during channel and back to idle afterwards.
- Effects (particles, bolts, projectiles) live independently of the casting animation and are cleaned up (geometry/material `dispose()`) when finished.
- Each spell plays a short procedural sound via the **Web Audio API** (oscillators, filtered noise buffers, gain envelopes — no audio files). Create the `AudioContext` lazily on the first user interaction.

#### 7.1 ⚡ Chain Lightning (≈ 1.1 s)
- **Channel (0.0 → 0.45 s):** shaman raises the staff high above the head with the right arm, the left arm extends toward the sky with open palm, torso leans back slightly. Small blue sparks (`THREE.Points`) crackle around the crystal; the crystal light flickers bright blue (`#5ab4ff`).
- **Release (0.45 s):** a jagged **lightning bolt** is drawn from the sky above the dummy down to it, plus a second bolt from the staff tip to the dummy:
  - Generate bolts procedurally with **midpoint displacement** (recursive subdivision with random perpendicular offsets), rendered as `Line`/`LineSegments` with additive blending or as thin `TubeGeometry`, with a wider faint "glow" copy behind it.
  - Re-randomize the bolt shape 3–4 times over ~0.25 s for a flickering effect, then fade out.
  - A brief white-blue **screen flash** (full-screen `div` overlay, CSS opacity tween) and a camera shake (~120 ms).
  - Sound: sharp noise burst through a high-pass filter + a descending "zap" oscillator.
- **Recovery (0.45 → 1.1 s):** arms return to rest with `easeInOutCubic`.

#### 7.2 🔥 Fireball (≈ 1.2 s)
- **Channel (0.0 → 0.5 s):** shaman pulls the left hand back to the hip, the staff points forward, torso twists away from the target. A growing **fire orb** forms in front of the left palm: an emissive sphere (orange/yellow core) + a swirling `THREE.Points` cloud orbiting it. Crystal light turns orange (`#ff7a1a`).
- **Release (0.5 s):** a forward "throw" — left arm snaps toward the dummy (`easeOutBack`), torso twists toward it. The orb flies to the target along a slight arc (quadratic Bézier) in ~0.4 s, leaving a **trail** of fading ember particles (spawn particles each frame at the orb's position, shrinking and rising, color fading yellow → orange → dark red).
  - The orb carries its own `PointLight` so it lights the ground as it flies.
- **Impact:** explosion at the dummy — a quickly expanding, fading sphere (additive), a burst of ~150 ember particles with gravity, an expanding ground scorch ring (`RingGeometry` lying flat, fading), dummy wobble + orange flash, camera shake.
  - Sound: low "whoosh" (filtered noise sweep) on release + a deep boom (low sine with fast pitch drop + noise) on impact.
- **Recovery (0.6 → 1.2 s):** return to rest pose.

#### 7.3 🪨 Earthquake Totem (≈ 1.6 s)
- **Channel (0.0 → 0.6 s):** shaman lifts the staff with both hands (left hand moves to grip the shaft), crouches slightly (knees bend, `shaman` group lowers by ~0.15). Crystal light turns green (`#6dff6a`). Small dust particles rise from the ground around the ritual circle.
- **Release (0.6 s):** the shaman **slams the staff into the ground** (fast `easeInCubic` downward motion):
  - A shockwave ring (flat `RingGeometry`, green-brown emissive) expands from the staff along the ground toward and past the dummy.
  - A line of **rock spikes** erupts from the ground from the shaman toward the dummy: 6–10 low-poly rocks (`DodecahedronGeometry`/`ConeGeometry` with flat shading, randomized scale/rotation), each one popping up with a small delay after the previous one (`easeOutBack`), lingering ~0.6 s, then sinking back into the ground.
  - A small **totem** (stacked carved cylinders with a face and wings made of boxes) rises from the ground next to the shaman and stays for ~3 s, pulsing with green light, then sinks and disappears.
  - Strong camera shake (~300 ms), dust burst particles, dummy gets knocked (bigger wobble) + green flash.
  - Sound: deep rumbling (low-pass filtered noise with a slow amplitude envelope) + a low thud.
- **Recovery (0.6 → 1.6 s):** shaman stands back up, left hand returns to rest.

### 8. Idle Animation
When not casting, the shaman should feel alive:
- Gentle breathing (sin wave on torso scale Y / slight rotation).
- Slow sway of the head and arms; occasional head tilt.
- Staff crystal rotates and bobs; its light pulses softly.
- Feathers and bead strings sway (small sin-based rotations with different phases).
- A few slow floating **spirit wisps** (small emissive spheres or points) drifting around the shaman.
- Campfire flicker (light intensity noise + a small flame particle system).

### 9. Polish
- Handle window `resize` (camera aspect + renderer size).
- Use `MeshStandardMaterial` for all parts with sensible `color`, `metalness`, `roughness`; use `flatShading: true` on rocks for a low-poly look.
- Use **additive blending** and `depthWrite: false` for all glowing effects and particles.
- Use a soft round particle sprite generated at runtime with a `CanvasTexture` (radial gradient) — no image files.
- Keep a reusable **particle system helper** (e.g., `createParticleBurst({ position, count, color, speed, gravity, life, size })`) shared by all spells.
- The page must look good at 60 fps on a mid-range laptop: cap particle counts, dispose finished effects.

### 10. Code Quality
- Keep the code **modular in functions**: `createShaman()`, `createStaff()`, `createDummy()`, `createEnvironment()`, `setupLights()`, `setupUI()`, `castSpell(type)`, `castLightning()`, `castFireball()`, `castEarthquake()`, `updateCasting(dt)`, `updateEffects(dt)`, `updateIdle(t)`, `updateUI(dt)`, `animate()`.
- Keep spell configs (cost, cooldown, color, duration) in a single `SPELLS` object.
- Add short comments for each section.
- Keep everything self-contained and copy-paste runnable — opening `index.html` in a browser must work immediately.

---

## Deliverable
A single `index.html` file, ready to run in any modern browser, showing a stylized 3D orc shaman with a glowing totem staff and a training dummy, orbit controls, a bottom action bar with three spell buttons (Chain Lightning, Fireball, Earthquake Totem) featuring hotkeys, mana costs and cooldown sweeps, and a distinct channel → release → impact → recovery animation with procedural VFX and sound for each spell.
