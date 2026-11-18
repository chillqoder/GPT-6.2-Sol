# DEEPWAKE

Guide ILO through the Buried Workshop, Crystal Reservoir, and Silent Foundry. Restore three resonance relays, power the ascent shaft, and take the lift to the surface.

## Play locally

From this directory, run the static server and open [http://127.0.0.1:8768/](http://127.0.0.1:8768/).

```sh
python3 -m http.server 8768 --bind 127.0.0.1
```

The playable entry point is [index.html](index.html). Three.js 0.160.1 and the fonts are bundled with their licenses in `vendor/`. The game runs offline with JavaScript and a local server. A Canvas renderer supports play when WebGL is unavailable.

## Controls

| Action | Keyboard |
| --- | --- |
| Move | **A / D** or **← / →** |
| Jump | **Space** or **Z**. Hold for more height. While airborne, hold toward a wall to slide and press Jump to rebound. |
| Dash | **Shift** or **X**. Break cracked amber crystal or disable a stunned machine. |
| Echo pulse | **Q**. Reveal nearby clues, stun vulnerable machines, or activate a powered relay. |
| Interact | **E**. Handle cells, use switches and stations, or recover discoveries. |
| Pause or resume | **P** or **Esc** |
| Retry from checkpoint | **R** |
| Confirm the main overlay action | **Enter** |

Touch controls appear on touch devices. The toolbar includes pause and mute, and reduced motion is available in the pause menu. Echo costs 35 resonance. The emergency shield automatically spends 50 to absorb an ordinary hit. A carried cell slows ILO and suspends dash, echo, and wall movement.

## Checkpoints and records

A relay activation commits its nearby reboot station. Interacting with another station also repairs ILO, refills resonance, and commits the current world, including cell and route changes and discoveries. Retry restores the most recent checkpoint and adds one recovery while preserving the expedition clock. **Restart Expedition** in the pause menu starts a fresh run. Checkpoints live for the current session. Completed records and settings persist locally when browser storage is available.

## Validation

```sh
npm test
node tests/browser.mjs
```

The first command runs the fixed-step simulation tests with Node.js. The browser command requires a running local server, Playwright CLI, and Chromium. It sends keyboard input through the rendered main and archive routes, exercises the live frame loop, and checks simulated mobile touch input. Screenshots and scripts are written to the temporary directory printed by the runner. Set `DEEPWAKE_URL` to test a different local address.

See [FEATURE_AUDIT.md](FEATURE_AUDIT.md) for the improvement pass, test results, and verification limits.
