# react-aurora-background

[![npm](https://img.shields.io/npm/v/react-aurora-background)](https://www.npmjs.com/package/react-aurora-background)
[![Bundle size](https://img.shields.io/bundlejs/size/react-aurora-background)](https://bundlejs.com/?q=react-aurora-background)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://react-aurora-background.vercel.app/)
[![CI](https://github.com/godwire/react-aurora-background/actions/workflows/ci.yml/badge.svg)](https://github.com/godwire/react-aurora-background/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/godwire/react-aurora-background/blob/main/LICENSE)

An animated WebGL aurora background for React, written from scratch in GLSL. No three.js, no shader library, no dependencies beyond React itself — just a canvas, one compiled WebGL1 program, and simplex noise driving a slow, organic color field in real time.

<!--
  Absolute raw.githubusercontent.com URL, not a relative path: npm only
  ships dist/, so a relative ./demo_1.gif resolves to nothing on the npm
  package page. This has to stay absolute either way.
-->
![Demo of react-aurora-background](https://raw.githubusercontent.com/godwire/react-aurora-background/main/demo_1.gif)

## Why this exists

Every other animated gradient background for React that I could find pulls in three.js just to draw a full-screen quad and run a fragment shader on it. That's roughly 600KB of dependency for something WebGL1 can do directly in about 150 lines. So this component skips the abstraction layer entirely and talks to the GL context itself.

What you get for that:

- No runtime dependencies. `react` and `react-dom` are peers, nothing else ships.
- Actual GLSL under the hood — 3D simplex noise (Ashima Arts' reference implementation) layered with fractal Brownian motion, not a canvas-2D gradient pretending to be one.
- A flow field that reacts to the cursor, with the option to turn that off.
- Three colors, animation speed, and noise scale all exposed as props, so the look is yours to tune.
- A clean mount/unmount cycle — the program, buffers, and event listeners are torn down properly, so you can drop this into a router without leaking GL contexts on every navigation.
- A safe fallback: if WebGL isn't available for whatever reason, it logs a warning and renders nothing instead of throwing, so you can put a static background behind it and never worry about a crash.
- Full TypeScript definitions.

## Installation

```bash
npm install react-aurora-background
```

## Usage

The component renders a `<canvas>` that fills its container through CSS (`width: 100%; height: 100%`), so give it a positioned parent to control its size. The usual pattern is to use it as an absolutely positioned background layer behind your actual content:

```tsx
import { AuroraBackground } from 'react-aurora-background'

function Hero() {
  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <AuroraBackground
        style={{ position: 'absolute', inset: 0 }}
        colorA={[0.05, 0.02, 0.15]}
        colorB={[0.4, 0.1, 0.6]}
        colorC={[0.1, 0.6, 0.9]}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1>Your content on top</h1>
      </div>
    </div>
  )
}
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className` | `string` | `''` | Extra class name(s) applied to the canvas |
| `style` | `CSSProperties` | — | Inline styles applied to the canvas |
| `colorA` | `[number, number, number]` | `[0.05, 0.02, 0.15]` | First gradient color, RGB in the 0–1 range |
| `colorB` | `[number, number, number]` | `[0.4, 0.1, 0.6]` | Second gradient color |
| `colorC` | `[number, number, number]` | `[0.1, 0.6, 0.9]` | Third gradient color |
| `speed` | `number` | `0.06` | Animation speed |
| `scale` | `number` | `0.8` | Noise scale. Higher values produce smaller, denser cloud shapes |
| `interactive` | `boolean` | `true` | Whether the flow visibly swirls around the cursor |
| `swirlRadius` | `number` | `0.55` | How far the swirl reaches from the cursor, in UV units |
| `swirlStrength` | `number` | `2.4` | How tightly the flow twists around the cursor, in radians at the center |
| `respectReducedMotion` | `boolean` | `true` | Whether to honor the OS-level `prefers-reduced-motion: reduce` setting |

Colors are RGB triples in the 0–1 range, following WebGL convention, not 0–255. Pure red is `[1, 0, 0]`, not `[255, 0, 0]`.

### A note on live updates

`colorA`, `colorB`, `colorC`, `speed`, `scale`, `interactive`, `swirlRadius`, and `swirlStrength` can all change freely between renders — hook them up to sliders, theme toggles, whatever you need. The WebGL context is created once, on mount, and every prop change is picked up by the next drawn frame in place, so the animation keeps running continuously through it. There's no need to memoize color arrays or worry about passing a new literal on every render; that used to force a full context rebuild in earlier versions of this component, but it no longer does.

## Accessibility

By default the component checks `prefers-reduced-motion` and reacts to it. If the user has that setting turned on at the OS level, the flow field stops on a single still frame instead of animating continuously, and the cursor-driven swirl is disabled along with it — the swirl is itself a form of motion, so leaving it running on a frozen background would defeat the point. The check is live for as long as the component is mounted, so flipping the setting in the OS takes effect immediately, with no remount needed.

If you have a specific reason to opt out — a demo page built around the animation, for instance — set `respectReducedMotion={false}` and the component will animate unconditionally, the way it did before this setting existed.

## Browser support

Requires WebGL1, which is available in essentially every browser released in the last decade. On the rare device where it's missing or disabled, the component logs a warning to the console and renders an empty canvas instead of throwing — style a fallback background behind it if that matters for your use case.

## Development

```bash
git clone https://github.com/godwire/react-aurora-background.git
cd react-aurora-background

npm install
npm run dev          # starts the example app at http://localhost:5173,
                      # importing the component directly from src/
```

Other scripts worth knowing about:

```bash
npm run typecheck    # tsc --noEmit
npm run build         # builds dist/ (ESM + CJS + .d.ts)
```

The `example/` app aliases `react-aurora-background` to `../src/index.ts`, so it always reflects whatever's currently in `src/` — there's no build or link step to remember while you're iterating.

## Deploying the example

```bash
cd example
npm run build
```

Deploy `example/dist` anywhere that serves static files — Vercel, Netlify, GitHub Pages all work. On Vercel specifically: import the repo, set the root directory to `example`, and pick the Vite framework preset.

## Publishing to npm

```bash
npm run build
npm login
npm publish
```

`package.json` restricts the published files to `dist` (`"files": ["dist"]`), so only the built output ships — not the source or the example app.

## How it works

The vertex shader is a no-op passthrough. A single two-triangle quad covers the canvas in clip space, and all the real work happens per pixel in the fragment shader, which reads `gl_FragCoord` directly for screen position rather than passing UVs down from the vertex stage.

3D simplex noise (`snoise`) is sampled at `(x, y, time)`, so animating the field is just a matter of advancing the third coordinate — that's what keeps the motion continuous and organic instead of looking like a texture scrolling past. The time value the shader receives isn't raw elapsed seconds: it's accumulated frame by frame on the JavaScript side as `phase += delta * speed`, so a change to the `speed` prop only affects how fast the field moves from that moment on, rather than snapping the whole field to wherever a different constant speed would have put it since mount. Three octaves of that noise are stacked (fractal Brownian motion) to get the soft, cloud-like structure, then the result is remapped to `[0, 1]` and used to blend between the three configured colors with wide `smoothstep` ranges, which is what keeps the transitions gentle instead of banded.

The cursor interaction works by rotating the noise sample point around the cursor position, with the rotation angle falling off smoothly with distance — strong right at the cursor, gone a short distance out. That's what makes the flow field itself visibly swirl and track the cursor, rather than just placing a static highlight on top of an otherwise unchanged pattern. A smaller glow is layered on top to reinforce where the interaction is centered.

## License

MIT — see [LICENSE](https://github.com/godwire/react-aurora-background/blob/main/LICENSE).
