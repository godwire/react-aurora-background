export const vertexShaderSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Fragment shader: a flowing, aurora-like gradient driven by 3D simplex
// noise (time is the third dimension, which is what makes it animate
// smoothly instead of just scrolling). The simplex noise implementation
// below is Ashima Arts' widely-used reference implementation
// (https://github.com/ashima/webgl-noise) -- a standard, well-tested
// building block rather than something written from scratch here.
export const fragmentShaderSource = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform float u_scale;
uniform float u_interactive;
uniform float u_swirlRadius;
uniform float u_swirlStrength;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Fractal Brownian Motion: layers a few octaves of noise at increasing
// frequency and decreasing amplitude for organic, cloud-like structure.
// Kept to 3 octaves on purpose -- more octaves add fine high-frequency
// detail that reads as "busy" rather than "flowing" at this scale.
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * snoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Rotates point p around center by an angle that falls off smoothly with
// distance -- strong right at the center, fading to zero by radius. This
// is what makes the flow field itself visibly swirl around the cursor,
// rather than just placing a highlight on top of an unchanged pattern.
vec2 swirl(vec2 p, vec2 center, float radius, float maxAngle) {
  vec2 offset = p - center;
  float dist = length(offset);
  float falloff = smoothstep(radius, 0.0, dist);
  float angle = falloff * maxAngle;
  float s = sin(angle);
  float c = cos(angle);
  mat2 rotation = mat2(c, -s, s, c);
  return center + rotation * offset;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv.x *= u_resolution.x / u_resolution.y;

  vec2 sampleUv = uv;
  vec2 aspectMouse = u_mouse;
  aspectMouse.x *= u_resolution.x / u_resolution.y;

  if (u_interactive > 0.5) {
    sampleUv = swirl(uv, aspectMouse, u_swirlRadius, u_swirlStrength);
  }

  // u_time arrives already scaled by speed and accumulated frame-by-frame
  // on the JS side, not raw elapsed seconds -- see the phase comment in
  // AuroraBackground.tsx. That's what lets speed change mid-animation
  // without the noise field jumping to a different point.
  float t = u_time;
  float n1 = fbm(vec3(sampleUv * u_scale, t));
  float n2 = fbm(vec3(sampleUv * u_scale + 4.2, t + 5.0));

  float mixValue = clamp((n1 + n2) * 0.5 + 0.5, 0.0, 1.0);

  // Wider smoothstep ranges than a plain 0-0.5/0.5-1 split -- softer,
  // more overlapping color transitions read as calmer and less banded.
  vec3 color = mix(u_colorA, u_colorB, smoothstep(0.15, 0.55, mixValue));
  color = mix(color, u_colorC, smoothstep(0.45, 0.85, mixValue));

  // A subtle secondary glow right at the cursor, on top of the swirl --
  // reinforces where the interaction is centered without doing the whole
  // job by itself.
  if (u_interactive > 0.5) {
    float dist = distance(uv, aspectMouse);
    float glow = smoothstep(u_swirlRadius * 0.7, 0.0, dist) * 0.12;
    color += glow;
  }

  gl_FragColor = vec4(color, 1.0);
}
`