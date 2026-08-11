import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { fragmentShaderSource, vertexShaderSource } from './shaders'
import { createProgram } from './webgl'

export type RGB = [number, number, number]

export interface AuroraBackgroundProps {
  /** Extra class name(s) on the canvas element. */
  className?: string
  /** Inline styles on the canvas element. */
  style?: CSSProperties
  /** First gradient color, as [r, g, b] in the 0-1 range. */
  colorA?: RGB
  /** Second gradient color, as [r, g, b] in the 0-1 range. */
  colorB?: RGB
  /** Third gradient color, as [r, g, b] in the 0-1 range. */
  colorC?: RGB
  /** Animation speed. Higher is faster. */
  speed?: number
  /** Noise scale -- higher values produce smaller, denser cloud shapes. */
  scale?: number
  /** Whether the flow visibly swirls around the cursor. */
  interactive?: boolean
  /** How far the swirl reaches from the cursor, in UV units. Bigger = wider effect. */
  swirlRadius?: number
  /** How tightly the flow twists around the cursor, in radians at the center. */
  swirlStrength?: number
  /**
   * Whether to honor the user's OS-level `prefers-reduced-motion: reduce`
   * setting. When true (the default) and that preference is active, the
   * animation stops on a single static frame and the cursor swirl is
   * disabled, instead of running the full effect regardless of what the
   * user asked their system for. The component keeps listening for the
   * setting to change while mounted, so toggling it in the OS takes
   * effect immediately without a remount.
   */
  respectReducedMotion?: boolean
}

const DEFAULT_COLOR_A: RGB = [0.05, 0.02, 0.15]
const DEFAULT_COLOR_B: RGB = [0.4, 0.1, 0.6]
const DEFAULT_COLOR_C: RGB = [0.1, 0.6, 0.9]

/**
 * A fullscreen (or fills its parent) animated WebGL gradient, in the style
 * of an aurora / mesh-gradient background. Pure WebGL1 + hand-written GLSL
 * -- no three.js, no other rendering dependency.
 *
 * Renders a `<canvas>` that fills its container via CSS (width/height:
 * 100%), so size it by wrapping it in a positioned container rather than
 * passing width/height props.
 */
export function AuroraBackground({
  className = '',
  style,
  colorA = DEFAULT_COLOR_A,
  colorB = DEFAULT_COLOR_B,
  colorC = DEFAULT_COLOR_C,
  speed = 0.06,
  scale = 0.8,
  interactive = true,
  swirlRadius = 0.55,
  swirlStrength = 2.4,
  respectReducedMotion = true,
}: AuroraBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef<[number, number]>([0.5, 0.5])

  // Latest prop values, mirrored into refs and read every frame inside the
  // render loop below. This is what lets props change on every render --
  // dragging a color or speed slider, for instance -- without tearing
  // down and recompiling the WebGL context on each change. The GL setup
  // effect runs once, on mount; these refs are how new values reach it
  // afterwards. Assigning directly during render (not inside an effect)
  // is intentional: it needs to happen before the render loop's next
  // frame runs, and a `useEffect` would only fire after paint, one tick
  // too late to avoid a stale frame.
  const colorARef = useRef(colorA)
  const colorBRef = useRef(colorB)
  const colorCRef = useRef(colorC)
  const speedRef = useRef(speed)
  const scaleRef = useRef(scale)
  const interactiveRef = useRef(interactive)
  const swirlRadiusRef = useRef(swirlRadius)
  const swirlStrengthRef = useRef(swirlStrength)
  const respectReducedMotionRef = useRef(respectReducedMotion)

  colorARef.current = colorA
  colorBRef.current = colorB
  colorCRef.current = colorC
  speedRef.current = speed
  scaleRef.current = scale
  interactiveRef.current = interactive
  swirlRadiusRef.current = swirlRadius
  swirlStrengthRef.current = swirlStrength
  respectReducedMotionRef.current = respectReducedMotion

  // Exposes the reduced-motion re-check from the setup effect below to the
  // small effect further down that reacts to `respectReducedMotion`
  // changing -- without putting that prop in the setup effect's own
  // dependency array (which would rebuild the GL context just to flip a
  // boolean).
  const reevaluateReducedMotionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl')
    if (!gl) {
      // No WebGL support: leave the canvas empty. Consumers can style a
      // static fallback background behind it via `className`/`style`.
      console.warn('[AuroraBackground] WebGL is not available in this browser.')
      return
    }

    let program: WebGLProgram
    try {
      program = createProgram(gl, vertexShaderSource, fragmentShaderSource)
    } catch (error) {
      console.error('[AuroraBackground] failed to compile/link shaders:', error)
      return
    }

    // A single fullscreen quad (two triangles, clip-space corners) -- the
    // fragment shader does all the actual work per-pixel.
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse')
    const colorALocation = gl.getUniformLocation(program, 'u_colorA')
    const colorBLocation = gl.getUniformLocation(program, 'u_colorB')
    const colorCLocation = gl.getUniformLocation(program, 'u_colorC')
    const speedLocation = gl.getUniformLocation(program, 'u_speed')
    const scaleLocation = gl.getUniformLocation(program, 'u_scale')
    const interactiveLocation = gl.getUniformLocation(program, 'u_interactive')
    const swirlRadiusLocation = gl.getUniformLocation(program, 'u_swirlRadius')
    const swirlStrengthLocation = gl.getUniformLocation(program, 'u_swirlStrength')

    const startTime = performance.now()

    // Reduced-motion state lives outside React state on purpose: it's read
    // every frame inside the render loop, and putting it in state would
    // mean re-running this whole effect (recompiling the shader program)
    // every time it changes. A plain mutable flag is enough.
    let reducedMotion = false
    let frozenElapsed = 0
    let animating = false
    let animationFrame = 0

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.floor(canvas!.clientWidth * dpr))
      const height = Math.max(1, Math.floor(canvas!.clientHeight * dpr))
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width
        canvas!.height = height
        gl!.viewport(0, 0, width, height)
      }
    }

    function drawFrame(elapsed: number) {
      resize()
      gl!.useProgram(program)

      gl!.enableVertexAttribArray(positionLocation)
      gl!.bindBuffer(gl!.ARRAY_BUFFER, positionBuffer)
      gl!.vertexAttribPointer(positionLocation, 2, gl!.FLOAT, false, 0, 0)

      // Swirl is itself an animation -- it moves as the cursor moves and
      // it's part of what "motion" means here, so it's suppressed along
      // with the flow field rather than left running on a frozen backdrop.
      const swirlActive = interactiveRef.current && !reducedMotion

      const colorA = colorARef.current
      const colorB = colorBRef.current
      const colorC = colorCRef.current

      gl!.uniform2f(resolutionLocation, canvas!.width, canvas!.height)
      gl!.uniform1f(timeLocation, elapsed)
      gl!.uniform2f(mouseLocation, mouseRef.current[0], mouseRef.current[1])
      gl!.uniform3f(colorALocation, colorA[0], colorA[1], colorA[2])
      gl!.uniform3f(colorBLocation, colorB[0], colorB[1], colorB[2])
      gl!.uniform3f(colorCLocation, colorC[0], colorC[1], colorC[2])
      gl!.uniform1f(speedLocation, speedRef.current)
      gl!.uniform1f(scaleLocation, scaleRef.current)
      gl!.uniform1f(interactiveLocation, swirlActive ? 1 : 0)
      gl!.uniform1f(swirlRadiusLocation, swirlRadiusRef.current)
      gl!.uniform1f(swirlStrengthLocation, swirlStrengthRef.current)

      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
    }

    function loop(now: number) {
      drawFrame((now - startTime) / 1000)
      animationFrame = requestAnimationFrame(loop)
    }

    function startAnimating() {
      if (animating) return
      animating = true
      animationFrame = requestAnimationFrame(loop)
    }

    // Stops the rAF loop and leaves exactly one frame drawn, at a pinned
    // point in time, so reduced motion means "stopped", not "invisible".
    function stopAnimating() {
      if (!animating) return
      animating = false
      cancelAnimationFrame(animationFrame)
      frozenElapsed = (performance.now() - startTime) / 1000
      drawFrame(frozenElapsed)
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      mouseRef.current = [
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      ]
    }

    // Always tracked, regardless of the current `interactive` value --
    // `interactive` is read from a ref at draw time instead (see
    // `swirlActive` above), so toggling it doesn't need this listener
    // added or removed. The cost of tracking pointer position when it
    // isn't being used is negligible.
    //
    // Deliberately listening on `window`, not `canvas`: anything overlaid
    // on top of the canvas (a settings panel, buttons, text) needs its
    // own pointer-events to stay clickable, which means the canvas itself
    // stops receiving pointermove while the cursor is over that content.
    // Tracking at the window level and computing position relative to the
    // canvas's rect keeps the effect following the cursor everywhere on
    // screen, regardless of what's on top.
    window.addEventListener('pointermove', handlePointerMove)

    const resizeObserver = new ResizeObserver(() => {
      // While frozen, the animation loop isn't running to pick up the new
      // size on its own, so redraw once immediately on resize.
      if (!animating) {
        drawFrame(frozenElapsed)
      } else {
        resize()
      }
    })
    resizeObserver.observe(canvas)

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function evaluateReducedMotion() {
      reducedMotion = respectReducedMotionRef.current && reducedMotionQuery.matches
      if (reducedMotion) {
        stopAnimating()
      } else {
        startAnimating()
      }
    }

    reevaluateReducedMotionRef.current = evaluateReducedMotion

    reducedMotionQuery.addEventListener('change', evaluateReducedMotion)
    evaluateReducedMotion()

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      reducedMotionQuery.removeEventListener('change', evaluateReducedMotion)
      reevaluateReducedMotionRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      gl.deleteProgram(program)
      gl.deleteBuffer(positionBuffer)
    }
    // Deliberately empty: this effect creates the WebGL context exactly
    // once, on mount, and tears it down exactly once, on unmount. All the
    // props that used to sit in this array (colors, speed, scale,
    // interactive, swirl settings) are read live from refs inside
    // `drawFrame` instead, so changing them updates the next frame in
    // place rather than recompiling the shader program and restarting
    // `startTime` -- which is what used to make the animation visibly
    // jump on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reacts to `respectReducedMotion` changing without touching the GL
  // context: just re-checks whether the animation should currently be
  // running. Runs once on mount too (harmless -- `evaluateReducedMotion`
  // is idempotent), and again on every mount after the setup effect above
  // has already assigned `reevaluateReducedMotionRef.current`, since
  // effects run in declaration order within one component.
  useEffect(() => {
    reevaluateReducedMotionRef.current?.()
  }, [respectReducedMotion])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  )
}