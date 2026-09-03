'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { fragmentShaderSource, vertexShaderSource } from './shaders'
import { parseColor } from './color'
import type { ColorInput, RGB } from './color'
import { createProgram } from './webgl'

export type { ColorInput, RGB }

export type AuroraQuality = 'auto' | 'high' | 'medium' | 'low'

export interface AuroraBackgroundProps {
  /** Extra class name(s) on the canvas element. */
  className?: string
  /** Inline styles on the canvas element. */
  style?: CSSProperties
  /**
   * First gradient color -- the darkest of the three, used as the base the
   * other two are blended over.
   *
   * Accepts a CSS color string (`'#0d0526'`, `'#123'`, `'rgb(13, 5, 38)'`)
   * or an `[r, g, b]` array with channels already in the 0-1 range.
   */
  colorA?: ColorInput
  /** Second gradient color. Same formats as {@link AuroraBackgroundProps.colorA}. */
  colorB?: ColorInput
  /** Third gradient color. Same formats as {@link AuroraBackgroundProps.colorA}. */
  colorC?: ColorInput
  /** Animation speed. Higher is faster. */
  speed?: number
  /** Noise scale -- higher values produce smaller, denser cloud shapes. */
  scale?: number
  /** Whether the flow visibly swirls around the cursor. */
  interactive?: boolean
  /** Rendering quality. `auto` adapts to the measured frame rate. */
  quality?: AuroraQuality
  /** How far the swirl reaches from the cursor, in UV units. Bigger = wider effect. */
  swirlRadius?: number
  /** How tightly the flow twists around the cursor, in radians at the center. */
  swirlStrength?: number
  /**
   * Domain warping strength -- how much the noise field distorts its own
   * coordinates before the final lookup.
   *
   * At `0` the flow is soft and cloud-like (and identical to versions of
   * this component from before the prop existed). Raising it stretches
   * those clouds into ribbons and folds: around `0.4` it reads as aurora
   * curtains, and past `1` it goes liquid, closer to oil-on-water than
   * to sky.
   *
   * Costs one extra noise lookup per pixel per frame when non-zero, so
   * `0` is genuinely cheaper rather than just visually plainer.
   */
  warp?: number
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
  quality = 'auto',
  swirlRadius = 0.55,
  swirlStrength = 2.4,
  warp = 0.4,
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
  // Colors are parsed here, during render, rather than inside the draw
  // loop: the loop runs up to 60 times a second and the props change at
  // most once per render, so parsing per frame would be pure waste. What
  // reaches the refs is always the normalized 0-1 triple the shader
  // wants, whatever notation the caller passed in.
  const colorARef = useRef<RGB>(DEFAULT_COLOR_A)
  const colorBRef = useRef<RGB>(DEFAULT_COLOR_B)
  const colorCRef = useRef<RGB>(DEFAULT_COLOR_C)
  const speedRef = useRef(speed)
  const scaleRef = useRef(scale)
  const interactiveRef = useRef(interactive)
  const qualityRef = useRef(quality)
  const swirlRadiusRef = useRef(swirlRadius)
  const swirlStrengthRef = useRef(swirlStrength)
  const warpRef = useRef(warp)
  const respectReducedMotionRef = useRef(respectReducedMotion)

  colorARef.current = parseColor(colorA, DEFAULT_COLOR_A)
  colorBRef.current = parseColor(colorB, DEFAULT_COLOR_B)
  colorCRef.current = parseColor(colorC, DEFAULT_COLOR_C)
  speedRef.current = speed
  scaleRef.current = scale
  interactiveRef.current = interactive
  qualityRef.current = quality
  swirlRadiusRef.current = swirlRadius
  swirlStrengthRef.current = swirlStrength
  warpRef.current = warp
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

    // Everything below lives in `let`s rather than `const`s, and is built
    // by `createResources` rather than inline, because a lost WebGL
    // context invalidates all of it at once: the program, the buffer and
    // every uniform location have to be recreated against the restored
    // context. Keeping creation in one callable place is what makes
    // `webglcontextrestored` recoverable instead of terminal.
    let program: WebGLProgram | null = null
    let positionBuffer: WebGLBuffer | null = null
    let positionLocation = -1
    let resolutionLocation: WebGLUniformLocation | null = null
    let timeLocation: WebGLUniformLocation | null = null
    let mouseLocation: WebGLUniformLocation | null = null
    let colorALocation: WebGLUniformLocation | null = null
    let colorBLocation: WebGLUniformLocation | null = null
    let colorCLocation: WebGLUniformLocation | null = null
    let scaleLocation: WebGLUniformLocation | null = null
    let interactiveLocation: WebGLUniformLocation | null = null
    let swirlRadiusLocation: WebGLUniformLocation | null = null
    let swirlStrengthLocation: WebGLUniformLocation | null = null
    let octavesLocation: WebGLUniformLocation | null = null
    let warpLocation: WebGLUniformLocation | null = null

    /** Builds the GL program and quad. Returns false if that failed. */
    function createResources(): boolean {
      try {
        program = createProgram(gl!, vertexShaderSource, fragmentShaderSource)
      } catch (error) {
        console.error('[AuroraBackground] failed to compile/link shaders:', error)
        program = null
        return false
      }

      // A single fullscreen quad (two triangles, clip-space corners) --
      // the fragment shader does all the actual work per-pixel.
      positionBuffer = gl!.createBuffer()
      gl!.bindBuffer(gl!.ARRAY_BUFFER, positionBuffer)
      gl!.bufferData(
        gl!.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl!.STATIC_DRAW,
      )

      positionLocation = gl!.getAttribLocation(program, 'a_position')
      resolutionLocation = gl!.getUniformLocation(program, 'u_resolution')
      timeLocation = gl!.getUniformLocation(program, 'u_time')
      mouseLocation = gl!.getUniformLocation(program, 'u_mouse')
      colorALocation = gl!.getUniformLocation(program, 'u_colorA')
      colorBLocation = gl!.getUniformLocation(program, 'u_colorB')
      colorCLocation = gl!.getUniformLocation(program, 'u_colorC')
      scaleLocation = gl!.getUniformLocation(program, 'u_scale')
      interactiveLocation = gl!.getUniformLocation(program, 'u_interactive')
      swirlRadiusLocation = gl!.getUniformLocation(program, 'u_swirlRadius')
      swirlStrengthLocation = gl!.getUniformLocation(program, 'u_swirlStrength')
      octavesLocation = gl!.getUniformLocation(program, 'u_octaves')
      warpLocation = gl!.getUniformLocation(program, 'u_warp')
      return true
    }

    if (!createResources()) return

    // `phase` is the value actually sent to the shader as u_time. It is
    // NOT wall-clock elapsed time -- it's elapsed time already scaled by
    // speed, accumulated incrementally frame by frame:
    //
    //   phase += (time since last frame) * current speed
    //
    // The alternative -- computing phase fresh every frame as
    // `elapsedSinceMount * speed` -- applies whatever the *current* speed
    // is to the *entire* history since mount, so the moment speed changes,
    // phase jumps to wherever that new speed "would have had it" all
    // along. Accumulating instead means a speed change only affects how
    // fast phase grows from that point on -- nothing before it moves.
    let phase = 0
    let lastFrameTime = performance.now()
    let animating = false
    let animationFrame = 0
    let activeQuality: Exclude<AuroraQuality, 'auto'> = qualityRef.current === 'auto'
      ? 'high'
      : qualityRef.current
    let averageFrameTime = 1000 / 60
    let qualitySampleTime = performance.now()
    const adaptiveStartTime = qualitySampleTime + 1500
    const qualitySettings = {
      high: { maxDpr: 2, octaves: 3 },
      medium: { maxDpr: 1.5, octaves: 2 },
      low: { maxDpr: 1, octaves: 1 },
    } as const

    function selectAdaptiveQuality(fps: number): Exclude<AuroraQuality, 'auto'> {
      if (activeQuality === 'high') {
        return fps < 42 ? 'medium' : 'high'
      }
      if (activeQuality === 'medium') {
        if (fps < 32) return 'low'
        if (fps >= 52) return 'high'
        return 'medium'
      }
      return fps >= 48 ? 'medium' : 'low'
    }

    function updateQuality(now: number, frameTime: number) {
      averageFrameTime = averageFrameTime * 0.9 + frameTime * 0.1
      const configuredQuality = qualityRef.current
      if (configuredQuality === 'auto' && now < adaptiveStartTime) return
      if (now < qualitySampleTime + 500) return

      const nextQuality = configuredQuality === 'auto'
        ? selectAdaptiveQuality(1000 / averageFrameTime)
        : configuredQuality
      qualitySampleTime = now
      if (nextQuality !== activeQuality) {
        activeQuality = nextQuality
        resize()
      }
    }

    function resize() {
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        qualitySettings[activeQuality].maxDpr,
      )
      const width = Math.max(1, Math.floor(canvas!.clientWidth * dpr))
      const height = Math.max(1, Math.floor(canvas!.clientHeight * dpr))
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width
        canvas!.height = height
        gl!.viewport(0, 0, width, height)
      }
    }

    function drawFrame() {
      // No program means the context was lost and hasn't been restored
      // yet. Every GL call below would be a no-op against a dead context,
      // and `useProgram(null)` throws in some browsers -- so bail before
      // touching anything.
      if (!program) return

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
      gl!.uniform1f(timeLocation, phase)
      gl!.uniform2f(mouseLocation, mouseRef.current[0], mouseRef.current[1])
      gl!.uniform3f(colorALocation, colorA[0], colorA[1], colorA[2])
      gl!.uniform3f(colorBLocation, colorB[0], colorB[1], colorB[2])
      gl!.uniform3f(colorCLocation, colorC[0], colorC[1], colorC[2])
      gl!.uniform1f(scaleLocation, scaleRef.current)
      gl!.uniform1f(interactiveLocation, swirlActive ? 1 : 0)
      gl!.uniform1f(swirlRadiusLocation, swirlRadiusRef.current)
      gl!.uniform1f(swirlStrengthLocation, swirlStrengthRef.current)
      gl!.uniform1f(octavesLocation, qualitySettings[activeQuality].octaves)
      gl!.uniform1f(warpLocation, warpRef.current)

      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
    }

    // Longest frame gap that is treated as real elapsed time. Anything
    // above this is not a slow frame, it's a gap where the loop wasn't
    // running at all: browsers stop firing rAF entirely for backgrounded
    // tabs and minimized windows, so the first callback after coming back
    // reports however long the user was away.
    //
    // That raw value would do damage twice over. It would be integrated
    // into `phase` in one step, snapping the aurora to a completely
    // different point in its flow instead of resuming where it stopped;
    // and it would land in `averageFrameTime` as a single enormous
    // sample, which reads as "this device can barely render" and drops
    // adaptive quality to `low` on a machine that was doing fine.
    // Clamping to ~3 frames keeps both honest: a genuinely slow frame
    // still counts, an absence doesn't.
    const MAX_FRAME_DELTA = 0.05

    function loop(now: number) {
      const delta = Math.min((now - lastFrameTime) / 1000, MAX_FRAME_DELTA)
      lastFrameTime = now
      updateQuality(now, delta * 1000)
      phase += delta * speedRef.current
      drawFrame()
      animationFrame = requestAnimationFrame(loop)
    }

    function startAnimating() {
      if (animating) return
      animating = true
      // Reset the clock here, not just in `loop`: time spent stopped
      // (reduced motion, tab backgrounded, whatever paused it) must not
      // be integrated into `phase` as one giant `delta` on the first
      // resumed frame.
      lastFrameTime = performance.now()
      animationFrame = requestAnimationFrame(loop)
    }

    // Stops the rAF loop and leaves exactly one frame drawn at the current
    // phase, so reduced motion means "stopped", not "invisible". Always
    // draws, even if called before the loop ever started (e.g. reduced
    // motion is already active on mount) -- there needs to be a first
    // frame on screen either way.
    function stopAnimating() {
      animating = false
      cancelAnimationFrame(animationFrame)
      drawFrame()
    }

    // Three independent reasons the loop may be stopped. They're tracked
    // separately rather than as one boolean because they change at
    // different times and for different reasons -- scrolling the canvas
    // back into view must not restart the animation if the user also has
    // reduced motion on, and neither should resume anything while the GL
    // context is gone.
    let reducedMotion = false
    let inViewport = true
    let contextLost = false

    function shouldAnimate() {
      return !reducedMotion && inViewport && !contextLost
    }

    // The single place that decides whether the loop runs. Every input
    // that can change the answer (reduced-motion preference, viewport
    // visibility, context loss/restore) calls this instead of starting or
    // stopping the loop directly, so the reasons can't fight each other.
    function syncAnimationState() {
      if (shouldAnimate()) {
        startAnimating()
      } else {
        stopAnimating()
      }
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
        drawFrame()
      } else {
        resize()
      }
    })
    resizeObserver.observe(canvas)

    // A background that has scrolled off screen still costs a full-screen
    // fragment shader every frame if nothing stops it. On a long page
    // that's the common case rather than the exception, so the loop is
    // suspended whenever the canvas leaves the viewport and resumed when
    // it comes back. `stopAnimating` leaves the last frame painted, so
    // scrolling back to it shows the aurora immediately rather than a
    // blank canvas waiting for the first frame.
    //
    // A small rootMargin starts the animation slightly before the canvas
    // is actually visible, so it's already moving by the time it scrolls
    // into view instead of visibly kicking into motion.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        inViewport = entry.isIntersecting
        syncAnimationState()
      },
      { rootMargin: '100px' },
    )
    intersectionObserver.observe(canvas)

    // The browser can take the WebGL context away at any point -- GPU
    // driver resets, laptops switching between integrated and discrete
    // graphics, waking from sleep, or simply too many live contexts on
    // the page. Without handling it, the canvas goes permanently blank
    // and stays that way until remount.
    //
    // Calling preventDefault() on the loss event is what makes the
    // context restorable at all; without it the browser never fires
    // `webglcontextrestored`.
    function handleContextLost(event: Event) {
      event.preventDefault()
      contextLost = true
      // Not via syncAnimationState: stopAnimating() draws a final frame,
      // and drawing into a lost context is exactly what must not happen
      // here.
      animating = false
      cancelAnimationFrame(animationFrame)
    }

    function handleContextRestored() {
      // Everything created against the old context is gone -- program,
      // buffer and uniform locations all have to be built again from
      // scratch. `phase` deliberately survives, so the aurora comes back
      // where it left off rather than restarting.
      if (!createResources()) return
      contextLost = false
      lastFrameTime = performance.now()
      resize()
      // `resize` only touches the viewport when the canvas dimensions
      // actually changed, and a restore usually happens at the same size
      // -- but the restored context starts with a default viewport
      // regardless, so it has to be set explicitly here or the first
      // frames render into the wrong rectangle.
      gl!.viewport(0, 0, canvas!.width, canvas!.height)
      syncAnimationState()
    }

    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function evaluateReducedMotion() {
      reducedMotion = respectReducedMotionRef.current && reducedMotionQuery.matches
      syncAnimationState()
    }

    reevaluateReducedMotionRef.current = evaluateReducedMotion

    reducedMotionQuery.addEventListener('change', evaluateReducedMotion)
    evaluateReducedMotion()

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      reducedMotionQuery.removeEventListener('change', evaluateReducedMotion)
      reevaluateReducedMotionRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      if (program) gl.deleteProgram(program)
      if (positionBuffer) gl.deleteBuffer(positionBuffer)
    }
    // Deliberately empty: this effect creates the WebGL context exactly
    // once, on mount, and tears it down exactly once, on unmount. All the
    // props that used to sit in this array (colors, speed, scale,
    // interactive, quality, swirl settings) are read live from refs inside
    // `drawFrame` instead, so changing them updates the next frame in
    // place rather than recompiling the shader program and resetting the
    // animation clock.
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