/* =========================================================
   RETRO SHADER
   Flat-shaded, vertex-snapped, colour-quantised, distance-fogged: one
   material for the entire sandbox. Every mesh in the world — props,
   weapons, the buddy, debris — goes through makeMaterial() so a new
   entity inherits the look for free.
   ========================================================= */
import * as THREE from 'three';
import './three-config.js';
import { FOG_COLOR } from './scene.js';
import { view } from './renderer.js';
import { events } from '../core/events.js';

const VERT = `
uniform vec2 uSnap;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mvPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 clip = projectionMatrix * mvPosition;
  vec2 g = uSnap;
  vec2 ndc = clip.xy / clip.w;
  ndc = floor(ndc * g + 0.5) / g;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
}
`;

const FRAG = `
uniform vec3  uColor;
uniform sampler2D uMap;
uniform float uUseMap;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uLightDir;
uniform float uAlpha;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 base = uColor;
  if (uUseMap > 0.5) base *= texture2D(uMap, vUv).rgb;
  vec3 col = base * (0.60 + 0.65 * lambert);
  col = floor(col * 24.0 + 0.5) / 24.0;
  float d = length(vViewPos);
  float f = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, uAlpha);
}
`;

export const WHITE_TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE_TEX.needsUpdate = true;

export const shared = {
  uFogColor: { value: FOG_COLOR },
  uFogNear:  { value: 11.0 },
  uFogFar:   { value: 40.0 },
  uLightDir: { value: new THREE.Vector3(0.45, 0.92, 0.55).normalize() },
  uSnap:     { value: new THREE.Vector2(view.w * 0.5, view.h * 0.5) },
};

export function makeMaterial(color, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:    { value: new THREE.Color(color) },
      uMap:      { value: opts.map || WHITE_TEX },
      uUseMap:   { value: opts.map ? 1 : 0 },
      uAlpha:    { value: opts.alpha !== undefined ? opts.alpha : 1 },
      uFogColor: shared.uFogColor,
      uFogNear:  shared.uFogNear,
      uFogFar:   shared.uFogFar,
      uLightDir: shared.uLightDir,
      uSnap:     shared.uSnap,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: !!opts.alpha && opts.alpha < 1,
    depthWrite: opts.alpha === undefined || opts.alpha >= 1,
  });
}

export function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

export function makeCheckerTexture(c1, c2) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 2;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c1; ctx.fillRect(0, 0, 1, 1); ctx.fillRect(1, 1, 1, 1);
  ctx.fillStyle = c2; ctx.fillRect(1, 0, 1, 1); ctx.fillRect(0, 1, 1, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  return tex;
}

/* The snap grid is in buffer pixels, so it has to follow the resolution. */
events.on('view:resize', (v) => shared.uSnap.value.set(v.w * 0.5, v.h * 0.5));
