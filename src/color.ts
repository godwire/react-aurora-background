/**
 * Color parsing for the `colorA`/`colorB`/`colorC` props.
 *
 * The shader wants colors as [r, g, b] with each channel in the 0-1 range,
 * which is what GLSL works in. That was the only accepted format
 * originally, and it stays fully supported -- but it forces anyone using
 * this component to convert their design tokens by hand ("#6633aa" ->
 * [0.4, 0.2, 0.667]), which is exactly the kind of friction that makes a
 * component annoying to try out. So strings in the usual CSS notations are
 * accepted too and converted here.
 */

export type RGB = [number, number, number]

/** A color accepted by the props: a 0-1 RGB triple, or a CSS color string. */
export type ColorInput = RGB | string

const HEX_SHORT = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_LONG = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
// Tolerates both the legacy comma syntax and the modern space syntax, with
// or without an alpha component. Alpha is parsed but ignored: the shader
// blends the three colors itself, so a per-color alpha has no meaning
// here -- accepting it and dropping it is friendlier than rejecting a
// string the user reasonably expected to work.
const RGB_FUNC = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*[\d.%]+\s*)?\)$/i

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * Converts a color prop into the [r, g, b] 0-1 triple the shader expects.
 *
 * Accepts:
 *   - `[0.4, 0.1, 0.6]`  -- already normalized, passed through (clamped)
 *   - `'#6633aa'` / `'#63a'` -- hex, with or without the leading `#`
 *   - `'rgb(102, 51, 170)'` / `'rgb(102 51 170)'` / `rgba(...)` -- 0-255
 *
 * Falls back to `fallback` (and warns) on anything unrecognized rather
 * than throwing: a typo'd color should not blank out someone's whole
 * background in production.
 */
export function parseColor(input: ColorInput, fallback: RGB): RGB {
  if (Array.isArray(input)) {
    return [clamp01(input[0]), clamp01(input[1]), clamp01(input[2])]
  }

  if (typeof input === 'string') {
    const value = input.trim()

    const short = HEX_SHORT.exec(value)
    if (short) {
      // #63a is shorthand for #6633aa -- each digit doubled.
      return [
        parseInt(short[1] + short[1], 16) / 255,
        parseInt(short[2] + short[2], 16) / 255,
        parseInt(short[3] + short[3], 16) / 255,
      ]
    }

    const long = HEX_LONG.exec(value)
    if (long) {
      return [
        parseInt(long[1], 16) / 255,
        parseInt(long[2], 16) / 255,
        parseInt(long[3], 16) / 255,
      ]
    }

    const rgb = RGB_FUNC.exec(value)
    if (rgb) {
      return [
        clamp01(parseFloat(rgb[1]) / 255),
        clamp01(parseFloat(rgb[2]) / 255),
        clamp01(parseFloat(rgb[3]) / 255),
      ]
    }
  }

  console.warn(
    `[AuroraBackground] could not parse color ${JSON.stringify(input)}; ` +
      'expected a hex string, an rgb()/rgba() string, or an [r, g, b] ' +
      'array with channels in the 0-1 range. Falling back to the default.',
  )
  return fallback
}