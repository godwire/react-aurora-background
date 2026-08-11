# react-aurora-background

A lightweight animated aurora background for React, rendered directly with WebGL and hand-written GLSL.

The component is intentionally small: it renders one `<canvas>`, compiles one WebGL1 program, and lets the fragment shader do the visual work. There is no Three.js layer and no shader framework between React and WebGL.

## Demo

![react-aurora-background demo](demo.gif)

The included example app exposes the main visual controls so you can try different palettes, animation speeds, noise scales, and cursor swirl settings.

## What this package is for

`react-aurora-background` is meant for cases where you want an animated gradient or aurora-style surface behind a hero section, landing page, dashboard, sign-in screen, or other UI without bringing a full 3D rendering library into the project.

It is a background component rather than a layout component. You decide how large its parent is and what content sits above it.

## Highlights

- Direct WebGL1 rendering
- Hand-written GLSL shaders
- 3D simplex noise with layered fractal Brownian motion
- Three configurable gradient colors
- Adjustable animation speed and noise scale
- Optional cursor-driven swirl interaction
- TypeScript types included
- Responsive canvas sizing through `ResizeObserver`
- Device pixel ratio capped internally to avoid unnecessary rendering cost on very high-DPI displays
- WebGL resources and event listeners are cleaned up when the component unmounts
- No Three.js or external shader library

React and React DOM are peer dependencies.

## Installation

```bash
npm install react-aurora-background
```

The package expects React 17 or newer.

## Quick start

```tsx
import { AuroraBackground } from 'react-aurora-background'

const COLOR_A: [number, number, number] = [0.05, 0.02, 0.15]
const COLOR_B: [number, number, number] = [0.4, 0.1, 0.6]
const COLOR_C: [number, number, number] = [0.1, 0.6, 0.9]

export default function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      <AuroraBackground
        colorA={COLOR_A}
        colorB={COLOR_B}
        colorC={COLOR_C}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        <h1>Your content goes here</h1>
      </div>
    </section>
  )
}
```

The canvas always uses `width: 100%` and `height: 100%`, so its size comes from the parent container. In most layouts, the simplest setup is a positioned parent with the aurora canvas absolutely positioned behind the content.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className` | `string` | `''` | Extra class name or class names applied to the canvas |
| `style` | `CSSProperties` | — | Inline styles applied to the canvas |
| `colorA` | `[number, number, number]` | `[0.05, 0.02, 0.15]` | First gradient color |
| `colorB` | `[number, number, number]` | `[0.4, 0.1, 0.6]` | Second gradient color |
| `colorC` | `[number, number, number]` | `[0.1, 0.6, 0.9]` | Third gradient color |
| `speed` | `number` | `0.06` | Animation speed |
| `scale` | `number` | `0.8` | Noise scale. Higher values create smaller, denser structures |
| `interactive` | `boolean` | `true` | Enables or disables cursor interaction |
| `swirlRadius` | `number` | `0.55` | Radius of the cursor-driven swirl in UV space |
| `swirlStrength` | `number` | `2.4` | Strength of the swirl, in radians near its center |

## Colors

Colors use normalized WebGL RGB values from `0` to `1`, not the usual `0` to `255`.

```tsx
const red: [number, number, number] = [1, 0, 0]
const white: [number, number, number] = [1, 1, 1]
const darkBlue: [number, number, number] = [0.02, 0.05, 0.2]
```

A practical way to convert a regular RGB color is to divide each channel by `255`.

For example, `rgb(64, 128, 255)` becomes approximately:

```ts
[0.251, 0.502, 1]
```

## Customization example

```tsx
import { AuroraBackground } from 'react-aurora-background'
import type { RGB } from 'react-aurora-background'

const SUNSET_A: RGB = [0.15, 0.02, 0.05]
const SUNSET_B: RGB = [0.8, 0.25, 0.1]
const SUNSET_C: RGB = [0.95, 0.7, 0.2]

export function SunsetBackground() {
  return (
    <AuroraBackground
      colorA={SUNSET_A}
      colorB={SUNSET_B}
      colorC={SUNSET_C}
      speed={0.08}
      scale={1.2}
      swirlRadius={0.7}
      swirlStrength={2.8}
    />
  )
}
```

The example application in this repository contains Aurora, Sunset, Emerald, and Monochrome palettes and lets you adjust the main animation parameters interactively.

## Using CSS classes

The component accepts a normal `className`, so it can be positioned and styled without inline styles.

```tsx
<div className="hero">
  <AuroraBackground className="hero__aurora" />

  <div className="hero__content">
    <h1>Product title</h1>
  </div>
</div>
```

```css
.hero {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: #05030b;
}

.hero__aurora {
  position: absolute;
  inset: 0;
}

.hero__content {
  position: relative;
  z-index: 1;
}
```

The static `background` on the parent is useful as a fallback while the canvas initializes and on systems where WebGL is unavailable.

## Performance notes

The component creates and owns a WebGL context inside a React effect. Changes to its rendering props cause that effect to run again, which means the existing rendering resources are cleaned up and created again.

In particular, avoid creating new color arrays on every React render:

```tsx
// Avoid this in a component that re-renders often.
<AuroraBackground colorA={[0.05, 0.02, 0.15]} />
```

Prefer stable values declared outside the component:

```tsx
const COLOR_A: [number, number, number] = [0.05, 0.02, 0.15]

function Page() {
  return <AuroraBackground colorA={COLOR_A} />
}
```

If a color genuinely depends on component state or props, memoize it:

```tsx
import { useMemo } from 'react'

const colorA = useMemo<[number, number, number]>(
  () => [red, green, blue],
  [red, green, blue],
)
```

Changing `speed`, `scale`, `interactive`, `swirlRadius`, or `swirlStrength` also recreates the rendering effect. This is fine for normal UI controls, but these props are not intended to be updated every animation frame.

The canvas resolution follows the element size and the current device pixel ratio. The internal DPR is capped at `2`, which keeps the image sharp on high-density displays without rendering an unnecessarily large framebuffer.

## Cursor interaction

When `interactive` is enabled, pointer movement is tracked at the window level rather than only on the canvas.

This is deliberate. A background usually sits underneath headings, buttons, forms, and other interactive elements. Listening at the window level allows the shader effect to keep following the pointer even while the pointer is over content layered above the canvas.

Disable the interaction when you only want the ambient animation:

```tsx
<AuroraBackground interactive={false} />
```

## How it works

The rendering path is intentionally straightforward.

1. A full-screen quad made from two triangles is uploaded to WebGL.
2. The vertex shader passes that geometry through in clip space.
3. The fragment shader calculates the visual result for every pixel.
4. 3D simplex noise is sampled with screen position and time.
5. Several noise octaves are combined into fractal Brownian motion to create larger and smaller structures in the same field.
6. The resulting value is blended across the three configured colors with smooth transitions.
7. When interaction is enabled, the noise sampling coordinates are rotated around the cursor position. The rotation fades with distance, which produces the local swirl rather than adding a simple cursor highlight.
8. `requestAnimationFrame` advances time and draws the next frame.

There are no textures to load and no scene graph to maintain. The movement comes from continuously sampling the procedural noise field over time.

## WebGL lifecycle

On mount, the component:

- requests a WebGL1 context;
- compiles and links the shaders;
- creates the full-screen geometry buffer;
- resolves shader attribute and uniform locations;
- starts the animation loop;
- observes canvas resizing;
- registers pointer tracking when interaction is enabled.

On unmount, it:

- cancels the animation frame;
- disconnects the resize observer;
- removes the pointer listener;
- deletes the WebGL program;
- deletes the geometry buffer.

If WebGL cannot be created, the component logs a warning and leaves the canvas empty instead of throwing an application-level error. You can place a static background behind it to handle that case visually.

## Browser support

The component requires WebGL1.

WebGL1 is available in current desktop and mobile browsers, but it can still be unavailable when hardware acceleration is disabled, the browser blocks WebGL, or the device has an unsupported graphics configuration.

Because the component fails without crashing the surrounding React tree, a CSS fallback background is usually enough for these cases.

## Reduced motion

The component currently does not automatically read `prefers-reduced-motion`.

If your application needs to respect that preference, you can decide whether to render the animated background at the application level.

```tsx
import { useEffect, useState } from 'react'
import { AuroraBackground } from 'react-aurora-background'

function AccessibleAurora() {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const update = () => setReduceMotion(media.matches)
    update()

    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  if (reduceMotion) {
    return <div className="static-background" />
  }

  return <AuroraBackground />
}
```

## Project structure

```text
react-aurora-background/
├── .github/
│   └── workflows/
├── example/
│   └── src/
├── src/
│   ├── AuroraBackground.tsx
│   ├── index.ts
│   ├── shaders.ts
│   ├── vite-env.d.ts
│   └── webgl.ts
├── LICENSE
├── package.json
├── tsconfig.json
└── vite.config.ts
```

The package code lives in `src/`. The `example/` directory is a separate Vite application used to test and demonstrate the component.

During development, the example app resolves `react-aurora-background` directly to the source entry point, so you do not need to rebuild or link the package after every change.

## Local development

Clone the repository and install the root dependencies:

```bash
git clone https://github.com/godwire/react-aurora-background.git
cd react-aurora-background
npm install
```

Start the example application:

```bash
npm run dev
```

The Vite development server runs the interactive demo and imports the component directly from `src/`.

## Type checking

```bash
npm run typecheck
```

This runs TypeScript without emitting build files.

## Building the package

```bash
npm run build
```

The package build produces the distributable files in `dist/`, including ESM, CommonJS, and TypeScript declarations.

The package exports:

```text
dist/index.js
dist/index.cjs
dist/index.d.ts
```

Only `dist/` is included in the published package according to the `files` field in `package.json`.

## Building the example

```bash
cd example
npm install
npm run build
```

The static output is written to:

```text
example/dist/
```

It can be deployed to any static host.

For platforms such as Vercel, use `example` as the project root and Vite as the framework/build setup.

## Publishing

Before publishing a new version, run the type check and package build:

```bash
npm run typecheck
npm run build
```

Then publish through npm using your normal release workflow:

```bash
npm login
npm publish
```

Remember to update the package version before publishing a new release.

## Troubleshooting

### The canvas is visible but has no height

`AuroraBackground` fills its parent. Give the parent an explicit height, `min-height`, or a layout that otherwise resolves to a non-zero height.

```css
.hero {
  position: relative;
  min-height: 100vh;
}
```

### Content appears behind the background

Place the canvas in a lower stacking layer and the page content in a higher one.

```css
.aurora {
  position: absolute;
  inset: 0;
}

.content {
  position: relative;
  z-index: 1;
}
```

### The WebGL context keeps restarting

Check whether color props are being created as new array literals during every render. Move constant palettes outside the component or memoize dynamic arrays.

Also avoid continuously changing the numeric rendering props from a high-frequency React state update.

### Nothing renders on a particular browser or device

Check the browser console for the WebGL warning and verify that hardware acceleration and WebGL are enabled. Keep a static CSS background behind the canvas for a graceful fallback.

## Contributing

Issues and pull requests are welcome.

For changes to the rendering code, please test both the package build and the example application before opening a pull request:

```bash
npm run typecheck
npm run build
npm run dev
```

When changing shader behavior, include a short explanation of the visual or performance impact in the pull request description.

## License

MIT. See [LICENSE](./LICENSE).
