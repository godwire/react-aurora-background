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
}: AuroraBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef<[number, number]>([0.5, 0.5])

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

    function handlePointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      mouseRef.current = [
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      ]
    }

    if (interactive) {
      // Deliberately listening on `window`, not `canvas`: anything
      // overlaid on top of the canvas (a settings panel, buttons, text)
      // needs its own pointer-events to stay clickable, which means the
      // canvas itself stops receiving pointermove while the cursor is
      // over that content. Tracking at the window level and computing
      // position relative to the canvas's rect keeps the effect following
      // the cursor everywhere on screen, regardless of what's on top.
      window.addEventListener('pointermove', handlePointerMove)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    function render(now: number) {
      resize()
      const elapsed = (now - startTime) / 1000

      gl!.useProgram(program)

      gl!.enableVertexAttribArray(positionLocation)
      gl!.bindBuffer(gl!.ARRAY_BUFFER, positionBuffer)
      gl!.vertexAttribPointer(positionLocation, 2, gl!.FLOAT, false, 0, 0)

      gl!.uniform2f(resolutionLocation, canvas!.width, canvas!.height)
      gl!.uniform1f(timeLocation, elapsed)
      gl!.uniform2f(mouseLocation, mouseRef.current[0], mouseRef.current[1])
      gl!.uniform3f(colorALocation, colorA[0], colorA[1], colorA[2])
      gl!.uniform3f(colorBLocation, colorB[0], colorB[1], colorB[2])
      gl!.uniform3f(colorCLocation, colorC[0], colorC[1], colorC[2])
      gl!.uniform1f(speedLocation, speed)
      gl!.uniform1f(scaleLocation, scale)
      gl!.uniform1f(interactiveLocation, interactive ? 1 : 0)
      gl!.uniform1f(swirlRadiusLocation, swirlRadius)
      gl!.uniform1f(swirlStrengthLocation, swirlStrength)

      gl!.drawArrays(gl!.TRIANGLES, 0, 6)

      animationFrame = requestAnimationFrame(render)
    }

    animationFrame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      if (interactive) {
        window.removeEventListener('pointermove', handlePointerMove)
      }
      gl.deleteProgram(program)
      gl.deleteBuffer(positionBuffer)
    }
    // Re-running this effect tears down and recreates the whole WebGL
    // context, so keep color/speed/scale props referentially stable
    // (module-level constants, or memoized) rather than passing new
    // array/object literals on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorA, colorB, colorC, speed, scale, interactive, swirlRadius, swirlStrength])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  )
}
