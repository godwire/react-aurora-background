import { useState } from 'react'
import { AuroraBackground } from 'react-aurora-background'
import type { RGB } from 'react-aurora-background'

// Defined once at module scope (not recreated per render) -- AuroraBackground
// tears down and rebuilds its WebGL context whenever these arrays change
// identity, so stable references matter here.
const PRESETS: { name: string; colorA: RGB; colorB: RGB; colorC: RGB }[] = [
  { name: 'Aurora', colorA: [0.05, 0.02, 0.15], colorB: [0.4, 0.1, 0.6], colorC: [0.1, 0.6, 0.9] },
  { name: 'Sunset', colorA: [0.15, 0.02, 0.05], colorB: [0.8, 0.25, 0.1], colorC: [0.95, 0.7, 0.2] },
  { name: 'Emerald', colorA: [0.02, 0.1, 0.08], colorB: [0.05, 0.5, 0.35], colorC: [0.6, 0.9, 0.5] },
  { name: 'Monochrome', colorA: [0.02, 0.02, 0.03], colorB: [0.3, 0.3, 0.35], colorC: [0.85, 0.85, 0.9] },
]

export default function App() {
  const [presetIndex, setPresetIndex] = useState(0)
  const [speed, setSpeed] = useState(0.06)
  const [scale, setScale] = useState(0.8)
  // Starts at 0 so the demo opens on the plain, unwarped look. Drag it
  // up to see the flow fold into ribbons.
  const [warp, setWarp] = useState(0)
  const [quality, setQuality] = useState<'auto' | 'high' | 'medium' | 'low'>('auto')
  const [swirlRadius, setSwirlRadius] = useState(0.55)
  const [swirlStrength, setSwirlStrength] = useState(2.4)

  const preset = PRESETS[presetIndex]

  return (
    <div className="page">
      <AuroraBackground
        className="aurora-canvas"
        colorA={preset.colorA}
        colorB={preset.colorB}
        colorC={preset.colorC}
        speed={speed}
        scale={scale}
        warp={warp}
        quality={quality}
        swirlRadius={swirlRadius}
        swirlStrength={swirlStrength}
      />

      <div className="overlay">
        <header className="hero">
          <h1>react-aurora-background</h1>
          <p>
            A dependency-free animated WebGL background for React. Hand-written GLSL simplex
            noise, no three.js. Move your cursor around.
          </p>
        </header>

        <div className="panel">
          <div className="control-group">
            <span className="control-label control-name">Palette</span>
            <div className="chips">
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  className={`chip ${i === presetIndex ? 'active' : ''}`}
                  onClick={() => setPresetIndex(i)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label className="control-label control-head" htmlFor="speed">
              <span className="control-name">Speed</span>
              <span className="control-value">{speed.toFixed(2)}</span>
            </label>
            <input
              id="speed"
              type="range"
              min={0.02}
              max={0.5}
              step={0.01}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label className="control-label control-head" htmlFor="scale">
              <span className="control-name">Scale</span>
              <span className="control-value">{scale.toFixed(2)}</span>
            </label>
            <input
              id="scale"
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label className="control-label control-head" htmlFor="warp">
              <span className="control-name">Warp</span>
              <span className="control-value">{warp.toFixed(2)}</span>
            </label>
            <input
              id="warp"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={warp}
              onChange={(e) => setWarp(Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <span className="control-label control-name">Quality</span>
            <div className="chips">
              {(['auto', 'high', 'medium', 'low'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`chip ${q === quality ? 'active' : ''}`}
                  onClick={() => setQuality(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label className="control-label control-head" htmlFor="swirl-radius">
              <span className="control-name">Swirl radius</span>
              <span className="control-value">{swirlRadius.toFixed(2)}</span>
            </label>
            <input
              id="swirl-radius"
              type="range"
              min={0.1}
              max={1.5}
              step={0.05}
              value={swirlRadius}
              onChange={(e) => setSwirlRadius(Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label className="control-label control-head" htmlFor="swirl-strength">
              <span className="control-name">Swirl strength</span>
              <span className="control-value">{swirlStrength.toFixed(2)}</span>
            </label>
            <input
              id="swirl-strength"
              type="range"
              min={0}
              max={6}
              step={0.1}
              value={swirlStrength}
              onChange={(e) => setSwirlStrength(Number(e.target.value))}
            />
          </div>
        </div>

        <footer>
          <a href="https://github.com/godwire/react-aurora-background" target="_blank" rel="noreferrer">
            github.com/godwire/react-aurora-background
          </a>
        </footer>
      </div>
    </div>
  )
}