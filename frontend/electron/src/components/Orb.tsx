import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSage } from '../lib/store';
import type { OrbState } from '../lib/events';

import vertexShader from '../shaders/orb.vert.glsl?raw';
import fragmentShader from '../shaders/orb.frag.glsl?raw';

// Vite HMR for raw shader imports — full reload when the .glsl files change.
if (import.meta.hot) {
  import.meta.hot.accept(
    ['@/shaders/orb.vert.glsl?raw', '@/shaders/orb.frag.glsl?raw'],
    () => location.reload(),
  );
}

/**
 * Per-state shader & motion targets. Lerped each frame.
 *
 * Displacement personality:
 *   idle      — perfectly smooth (very faint baseline so it's never frozen)
 *   listening — slow gentle ripples, low amp ("I'm receiving you")
 *   thinking  — fast roiling churn, medium amp ("computing")
 *   speaking  — SPIKES — sharp icicle peaks, fast ("vocal life")
 *   complete  — settles to a tiny gentle wave
 */
const STATE_TARGETS: Record<
  OrbState,
  {
    noiseSpeed: number;     // interior color noise
    noiseScale: number;
    noiseAmp: number;
    rimPower: number;
    intensity: number;
    breath: { period: number; amp: number };
    // vertex displacement
    dispAmp: number;
    dispStyle: number;      // 0 = ripple, 1 = spike
    dispFreq: number;
    dispSpeed: number;
  }
> = {
  // Surface-level displacement only. With pow-clamped shader, displacement
  // amplitude maps directly to "% of radius," so 0.04 = 4% bumps max.
  // Higher dispSpeed across the board so the surface visibly drifts.
  idle:      { noiseSpeed: 0.18, noiseScale: 1.6, noiseAmp: 0.55, rimPower: 2.4, intensity: 1.00, breath: { period: 3.2, amp: 0.022 },
               dispAmp: 0.014, dispStyle: 0.10, dispFreq: 1.3, dispSpeed: 0.55 },
  listening: { noiseSpeed: 0.30, noiseScale: 1.8, noiseAmp: 0.70, rimPower: 2.2, intensity: 1.04, breath: { period: 2.4, amp: 0.030 },
               dispAmp: 0.022, dispStyle: 0.10, dispFreq: 1.5, dispSpeed: 0.85 },
  thinking:  { noiseSpeed: 0.65, noiseScale: 2.6, noiseAmp: 0.85, rimPower: 2.6, intensity: 1.02, breath: { period: 3.2, amp: 0.020 },
               dispAmp: 0.030, dispStyle: 0.20, dispFreq: 2.0, dispSpeed: 1.55 },
  speaking:  { noiseSpeed: 0.40, noiseScale: 2.0, noiseAmp: 0.75, rimPower: 1.9, intensity: 1.10, breath: { period: 1.0, amp: 0.055 },
               dispAmp: 0.040, dispStyle: 0.30, dispFreq: 2.2, dispSpeed: 1.30 },
  complete:  { noiseSpeed: 0.20, noiseScale: 1.7, noiseAmp: 0.55, rimPower: 2.2, intensity: 1.06, breath: { period: 3.2, amp: 0.024 },
               dispAmp: 0.016, dispStyle: 0.10, dispFreq: 1.3, dispSpeed: 0.55 },
};

function readCssColor(varName: string, fallback: string): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color(fallback);
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return new THREE.Color(v || fallback);
}

function OrbMesh() {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);
  const state = useSage((s) => s.orb);
  const speakerLevel = useSage((s) => s.speakerLevel);
  const speechScaleRef = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime:       { value: 0 },
      uCore:       { value: readCssColor('--orb-core', '#ffd89b') },
      uRim:        { value: readCssColor('--orb-rim', '#c8841c') },
      uGlow:       { value: readCssColor('--orb-glow', '#ffe6b8') },
      uNoiseSpeed: { value: STATE_TARGETS.idle.noiseSpeed },
      uNoiseScale: { value: STATE_TARGETS.idle.noiseScale },
      uNoiseAmp:   { value: STATE_TARGETS.idle.noiseAmp },
      uRimPower:   { value: STATE_TARGETS.idle.rimPower },
      uIntensity:  { value: STATE_TARGETS.idle.intensity },
      uHueShift:   { value: 0 },
      uDispAmp:    { value: STATE_TARGETS.idle.dispAmp },
      uDispStyle:  { value: STATE_TARGETS.idle.dispStyle },
      uDispFreq:   { value: STATE_TARGETS.idle.dispFreq },
      uDispSpeed:  { value: STATE_TARGETS.idle.dispSpeed },
    }),
    [],
  );

  useEffect(() => {
    const refresh = () => {
      uniforms.uCore.value = readCssColor('--orb-core', '#ffd89b');
      uniforms.uRim.value = readCssColor('--orb-rim', '#c8841c');
      uniforms.uGlow.value = readCssColor('--orb-glow', '#ffe6b8');
    };
    window.addEventListener('sage:colors-changed', refresh);
    return () => window.removeEventListener('sage:colors-changed', refresh);
  }, [uniforms]);

  useFrame((_, dt) => {
    const t = STATE_TARGETS[state];
    const u = matRef.current.uniforms;
    const k = 1 - Math.exp(-dt * 4.5);

    u.uNoiseSpeed.value += (t.noiseSpeed - u.uNoiseSpeed.value) * k;
    u.uNoiseScale.value += (t.noiseScale - u.uNoiseScale.value) * k;
    u.uNoiseAmp.value   += (t.noiseAmp   - u.uNoiseAmp.value) * k;
    u.uRimPower.value   += (t.rimPower   - u.uRimPower.value) * k;
    u.uIntensity.value  += (t.intensity  - u.uIntensity.value) * k;

    u.uDispAmp.value   += (t.dispAmp   - u.uDispAmp.value)   * k;
    u.uDispStyle.value += (t.dispStyle - u.uDispStyle.value) * k;
    u.uDispFreq.value  += (t.dispFreq  - u.uDispFreq.value)  * k;
    u.uDispSpeed.value += (t.dispSpeed - u.uDispSpeed.value) * k;

    u.uTime.value += dt;

    if (state === 'speaking') {
      const speechK = 1 - Math.exp(-dt * 11);
      speechScaleRef.current += (speakerLevel - speechScaleRef.current) * speechK;
      const targetScale = 1.015 + Math.min(0.085, speechScaleRef.current * 0.11);
      const nextScale =
        meshRef.current.scale.x + (targetScale - meshRef.current.scale.x) * (1 - Math.exp(-dt * 14));
      meshRef.current.scale.setScalar(nextScale);
      return;
    }

    speechScaleRef.current += (0 - speechScaleRef.current) * (1 - Math.exp(-dt * 9));
    const phase = (u.uTime.value % t.breath.period) / t.breath.period;
    const scale = 1 + Math.sin(phase * Math.PI * 2) * t.breath.amp;
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export function Orb({ size = 350 }: { size?: number }) {
  // Content-hash key — using actual shader content (not just length) so ANY
  // character change forces remount → fresh GPU program. Without this,
  // ShaderMaterial caches the old program through HMR and edits to .glsl
  // files never reach the GPU.
  const shaderKey = vertexShader + '|' + fragmentShader;

  // Wrapper is the same size as the canvas so it doesn't eat layout space.
  // Drop-shadow on the wrapper (not the canvas element) lets the bloom
  // render OUTSIDE the wrapper bounds — and avoids a WebGL+CSS-filter
  // compositing quirk that produced visible square edges when the filter
  // was applied directly to the canvas.
  return (
    <div
      className="relative grid place-items-center"
      style={{
        width: size,
        height: size,
        filter:
          'drop-shadow(0 0 16px var(--orb-rim)) drop-shadow(0 0 48px var(--orb-glow))',
      }}
    >
      {/* CSS halo — sits behind the canvas for "lit room" presence */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: size * 1.35,
          height: size * 1.35,
          background:
            'radial-gradient(circle at 50% 50%, var(--orb-glow) 0%, transparent 62%)',
          opacity: 0.5,
          filter: 'blur(24px)',
        }}
      />
      {/* Ground shadow */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          bottom: -18,
          width: size * 0.62,
          height: 22,
          background:
            'radial-gradient(ellipse at center, var(--orb-shadow), transparent 70%)',
          filter: 'blur(9px)',
        }}
      />

      <Canvas
        key={shaderKey}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: true }}
        dpr={[1, 1.6]}
        camera={{ position: [0, 0, 5.6], fov: 28 }}
        style={{ width: size, height: size, background: 'transparent' }}
      >
        <OrbMesh />
      </Canvas>
    </div>
  );
}
