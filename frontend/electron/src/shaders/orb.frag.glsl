// Sage orb — fragment shader
// Goal: warm, candle-like, alive without being flashy.
// Three layers from front to back of the look:
//   1) radial core gradient   (uCore  → uRim)
//   2) drifting simplex noise (subtle interior motion)
//   3) fresnel halo           (uRim   → uGlow at silhouette)

precision highp float;

varying vec3  vNormal;
varying vec3  vViewDir;
varying vec3  vObjectPos;
varying vec2  vUv;
varying float vDisp;

uniform float uTime;
uniform vec3  uCore;     // bright center
uniform vec3  uRim;      // amber edge
uniform vec3  uGlow;     // silhouette glow
uniform float uNoiseSpeed;
uniform float uNoiseScale;
uniform float uNoiseAmp;   // 0..1 strength of interior noise
uniform float uRimPower;   // fresnel exponent (lower = softer rim)
uniform float uHueShift;   // small rotation in HSL applied to all colors
uniform float uIntensity;  // overall energy, drives slight saturation lift

// ───── classic 3D simplex noise (Ashima / Stefan Gustavson) ─────
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
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
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ───── tiny rgb<->hsl for hue shifts ─────
vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float h = 0.0, s = 0.0, l = (mx + mn) * 0.5;
  if (mx != mn) {
    float d = mx - mn;
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r)      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else                h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s == 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0/3.0),
              hue2rgb(p, q, h),
              hue2rgb(p, q, h - 1.0/3.0));
}
vec3 shiftHue(vec3 rgb, float delta) {
  vec3 hsl = rgb2hsl(rgb);
  hsl.x = fract(hsl.x + delta);
  return hsl2rgb(hsl);
}

void main() {
  // Radial position inside the sphere (object space, sphere has unit radius).
  float r = length(vObjectPos);

  // ───── interior noise: two octaves, slow drift ─────
  vec3 q = vObjectPos * uNoiseScale + vec3(0.0, 0.0, uTime * uNoiseSpeed);
  float n  = snoise(q);
  float n2 = snoise(q * 1.9 + vec3(uTime * uNoiseSpeed * 0.6));
  float noise = (n * 0.65 + n2 * 0.35) * 0.5 + 0.5; // [0..1]

  // Slight bias toward center so noise reads as "interior life", not surface speckle.
  float depthMask = smoothstep(0.95, 0.45, r);
  float life = mix(0.5, noise, uNoiseAmp * depthMask);

  // ───── radial core gradient ─────
  // Hot spot offset slightly up-left, like a candle reflection.
  vec3 hotPos = normalize(vec3(-0.35, 0.45, 0.7));
  float hot   = max(0.0, dot(normalize(vObjectPos), hotPos));
  hot = pow(hot, 2.4);

  vec3 core = shiftHue(uCore, uHueShift);
  vec3 rim  = shiftHue(uRim,  uHueShift);
  vec3 glow = shiftHue(uGlow, uHueShift);

  vec3 baseColor = mix(rim, core, hot * 0.85 + life * 0.25);

  // ───── fresnel rim ─────
  float fres = pow(1.0 - max(0.0, dot(vNormal, vViewDir)), uRimPower);
  vec3 rimColor = mix(rim, glow, fres);
  vec3 col = mix(baseColor, rimColor, fres * 0.85);

  // Lift saturation a hair when intensity is high (speaking).
  col = mix(col, col * 1.06, clamp(uIntensity - 1.0, 0.0, 1.0));

  // Spike highlight — peaks glow hotter toward the core color, valleys deepen.
  // vDisp ∈ [-1..1]; we want positive peaks to brighten.
  float peak = max(vDisp, 0.0);
  col = mix(col, core, peak * 0.55);
  col = mix(col, col * 0.88, max(-vDisp, 0.0) * 0.4);

  // Edge alpha — soften the silhouette so it blends into the cream bg.
  float edge = smoothstep(0.0, 0.18, fres);
  float alpha = mix(1.0, 0.96, edge * 0.4);

  gl_FragColor = vec4(col, alpha);
}
