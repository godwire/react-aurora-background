# react-aurora-background

[![npm version](https://img.shields.io/npm/v/react-aurora-background.svg)](https://www.npmjs.com/package/react-aurora-background)
[![CI](https://github.com/godwire/react-aurora-background/actions/workflows/ci.yml/badge.svg)](https://github.com/godwire/react-aurora-background/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/react-aurora-background)](https://bundlephobia.com/package/react-aurora-background)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A dependency-free, animated WebGL aurora/gradient background for React —
**hand-written GLSL, no three.js, no shader library**. A single `<canvas>`,
one WebGL1 program, and simplex noise driving an organic, flowing color
field in real time.

**🔗 Live demo:** _coming soon — see "Deploying the demo" below_

![demo](demo.gif)

> Record your own demo: run the example locally (see below), then use
> something like [ScreenToGif](https://www.screentogif.com/) or Windows'
> built-in Clipchamp (export → GIF) and save it as `demo.gif` in the
> project root.

## Why

Most animated gradient/aurora backgrounds for React pull in three.js (a
~600KB dependency) just to draw a full-screen quad and run a fragment
shader — which is all three.js is doing here anyway, under a lot of
abstraction. This component skips the abstraction: it talks to WebGL1
directly.

- 📦 **Zero runtime dependencies** — only `react`/`react-dom` as peers, no three.js, no shader library
- 🎨 **Real GLSL** — 3D simplex noise (Ashima Arts' reference implementation) + fractal Brownian motion, not a canvas-2D approximation
- 🖱️ **Cursor-reactive** — subtly distorts the flow field, toggleable
- 🎛️ **Fully themeable** — 3 colors, speed, and noise scale are all props
- 🧹 **Clean lifecycle** — compiles/links on mount, tears down the GL context (program, buffers, listeners) on unmount; no leaks across route changes
- 🛟 **Fails safe** — if WebGL isn't available, it logs a warning and renders nothing rather than crashing, so you can style a static fallback behind it
- 📐 **TypeScript** — full type definitions included

## Install

```bash
npm install react-aurora-background
```

## Usage

The component renders a `<canvas>` that fills its container via CSS
(`width: 100%; height: 100%`) — give it a positioned parent to control its
size, e.g. as an absolutely-positioned background layer:

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
|---|---|---|---|
| `className` | `string` | `''` | Extra class name(s) on the canvas |
| `style` | `CSSProperties` | — | Inline styles on the canvas |
| `colorA` | `[number, number, number]` | `[0.05, 0.02, 0.15]` | First gradient color, RGB in the 0-1 range |
| `colorB` | `[number, number, number]` | `[0.4, 0.1, 0.6]` | Second gradient color |
| `colorC` | `[number, number, number]` | `[0.1, 0.6, 0.9]` | Third gradient color |
| `speed` | `number` | `0.06` | Animation speed |
| `scale` | `number` | `0.8` | Noise scale — higher values produce smaller, denser cloud shapes |
| `interactive` | `boolean` | `true` | Whether the flow visibly swirls around the cursor |
| `swirlRadius` | `number` | `0.55` | How far the swirl reaches from the cursor, in UV units |
| `swirlStrength` | `number` | `2.4` | How tightly the flow twists around the cursor, in radians at the center |

Colors are RGB triples in the **0-1** range (WebGL convention), not 0-255
— e.g. pure red is `[1, 0, 0]`, not `[255, 0, 0]`.

### ⚠️ Performance note

`colorA`/`colorB`/`colorC` (and any array/object prop) are effect
dependencies: passing a new array literal on every render (e.g.
`colorA={[0.1, 0.2, 0.3]}` written inline in JSX) tears down and rebuilds
the entire WebGL context every time that component re-renders. Define
your palettes as module-level constants or memoize them with `useMemo`:

```tsx
const COLOR_A: [number, number, number] = [0.05, 0.02, 0.15] // outside the component

// or, if it needs to be dynamic:
const colorA = useMemo<[number, number, number]>(() => [r, g, b], [r, g, b])
```

## Browser support

Requires WebGL1, which is available in effectively all browsers released
in the last decade. On the rare browser/device where it isn't (or where
it's disabled), the component logs a warning to the console and renders
an empty canvas rather than throwing — style a fallback background behind
it if you need one.

## Development

```bash
git clone https://github.com/godwire/react-aurora-background.git
cd react-aurora-background

npm install
npm run dev          # launches the example app at http://localhost:5173,
                      # importing the component straight from src/
```

Other useful scripts:

```bash
npm run typecheck    # tsc --noEmit
npm run build         # builds dist/ (ESM + CJS + .d.ts)
```

The `example/` app aliases `react-aurora-background` to `../src/index.ts`,
so it always reflects whatever is currently in `src/` — no build/link step
needed while iterating.

## Deploying the demo

```bash
cd example
npm run build
```

Deploy `example/dist` anywhere static (Vercel, Netlify, GitHub Pages). On
Vercel: import this repo, set **Root Directory** to `example`, framework
preset **Vite**.

## Publishing to npm

```bash
npm run build
npm login
npm publish
```

`files: ["dist"]` in `package.json` means only the built output ships, not
the source or the example app.

## How it works, briefly

- The vertex shader is a no-op passthrough; a single 2-triangle quad
  covers the whole canvas in clip space.
- All the actual work happens per-pixel in the fragment shader:
  `gl_FragCoord` gives screen position directly (no varying needed to pass
  UVs from the vertex stage).
- 3D simplex noise (`snoise`) is sampled with `(x, y, time)`, so animating
  is just advancing the third dimension — this is what makes the motion
  continuous and organic instead of looking like a scrolling texture.
- Three octaves of that noise are layered (fractal Brownian motion) for
  soft cloud-like structure, then the result is remapped to `[0, 1]` and
  used to blend between the three configured colors with wide `smoothstep`
  ranges for gentle, non-banded transitions.
- The cursor interaction rotates the noise sample point around the cursor
  by an angle that falls off smoothly with distance — strong right at the
  cursor, zero a bit further out. That's what makes the flow itself
  visibly swirl and follow the cursor, rather than just placing a
  highlight on top of an unchanged pattern. A smaller, subtler glow is
  layered on top of that to reinforce where the interaction is centered.

## License

MIT — see [LICENSE](LICENSE).
