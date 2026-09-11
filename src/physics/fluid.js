/* =========================================================
   LIQUID — Position Based Fluids (Macklin & Muller, 2013)

   Not a shader trick: a few hundred particles solving a real density
   constraint every frame — spatial-hash neighbour search, per-particle
   lambdas, an artificial pressure term for surface tension, XSPH
   viscosity, a ground boundary that contributes density of its own, and
   a yield stress so a settled puddle behaves like slime rather than
   water.

   The solver knows nothing about what is displacing it. Obstacles arrive
   through addSolid() each step, so the melting buddy, a crate dropped in
   the puddle and the player wading through it all work the same way.
   ========================================================= */
import * as THREE from 'three';
import { scene } from '../render/scene.js';
import { flat, shared } from '../render/shader.js';
import { colliders } from './statics.js';
import { sim, wind, magnetTarget, gravityFor } from './sim.js';

export const FL = {
  max: 440,
  n: 0,
  h: 0.34,                       // smoothing radius
  h2: 0.34 * 0.34,
  rho0: 0,                       // rest density (filled in below)
  eps: 18,                       // CFM relaxation
  iters: 3,                      // solver iterations per step
  visc: 0.11,                    // XSPH viscosity
  coh: 80,                       // cohesion / surface tension
  yield: 2.0,                    // yield stress: slow creep is damped away
  wall: 0.35,                    // how much density the ground contributes
  corrK: 0.0012,                 // artificial pressure strength
  corrQ2: (0.21 * 0.34) * (0.21 * 0.34),
  rad: 0.075,                    // collision radius
  drawRad: 0.175,                // render radius
  maxN: 48,                      // neighbour cap
  maxSpeed: 26,
  maxPush: 0.05,                 // per-step push out of a *moving* solid
  cx: 0, cy: 1, cz: 0,           // centroid, for camera & pointer picking
};

const POLY6 = 315 / (64 * Math.PI * Math.pow(FL.h, 9));
const SPIKY = -45 / (Math.PI * Math.pow(FL.h, 6));

function kernW(r2) {
  const d = FL.h2 - r2;
  return d <= 0 ? 0 : POLY6 * d * d * d;
}

/* Rest density = the density a particle sees inside a regular lattice
   packed at the fluid's rest spacing. Derived instead of guessed so the
   solver stays stable if the kernel radius is ever retuned. */
(function () {
  const s = FL.h * 0.55;
  const R = Math.ceil(FL.h / s);
  let rho = 0;
  for (let i = -R; i <= R; i++)
    for (let j = -R; j <= R; j++)
      for (let k = -R; k <= R; k++) {
        const r2 = (i * i + j * j + k * k) * s * s;
        if (r2 < FL.h2) rho += kernW(r2);
      }
  FL.rho0 = rho;
  FL.spacing = s;
})();

/* ---- ground as a boundary, not just a clamp ----

   A kernel that only sees other fluid particles cannot tell "resting on the
   floor" from "floating in a thin sheet": once a puddle is one particle
   thick every neighbour is in the same plane, the pressure gradient is
   purely horizontal, and it creeps outwards forever instead of holding a
   depth. So the floor contributes density of its own, exactly as a packed
   half-space of ghost particles below it would, with a gradient that points
   straight up. Both tables are summed from the same lattice that defines the
   rest density, so they stay consistent if the kernel is ever retuned. */
const WALL_N = 32;
const wallRho = new Float32Array(WALL_N + 1);
const wallGrad = new Float32Array(WALL_N + 1);
(function () {
  const s = FL.spacing, h = FL.h, h2 = FL.h2, R = Math.ceil(h / s);
  for (let n = 0; n <= WALL_N; n++) {
    const t = (n / WALL_N) * h;
    let rho = 0, grad = 0;
    for (let j = 0; j <= R; j++) {
      const dy = t + s * 0.5 + j * s;
      if (dy >= h) break;
      for (let i = -R; i <= R; i++)
        for (let k = -R; k <= R; k++) {
          const r2 = (i * i + k * k) * s * s + dy * dy;
          if (r2 >= h2) continue;
          rho += kernW(r2);
          const r = Math.sqrt(r2);
          if (r > 1e-6) grad += dy * (SPIKY * (h - r) * (h - r) / (r * FL.rho0));
        }
    }
    wallRho[n] = rho;
    wallGrad[n] = grad;
  }
})();

function wallIndex(y) {
  const t = (y - FL.rad) / FL.h;
  if (t >= 1) return -1;
  return t <= 0 ? 0 : (t * WALL_N) | 0;
}

const fpX = new Float32Array(FL.max), fpY = new Float32Array(FL.max), fpZ = new Float32Array(FL.max);
const fvX = new Float32Array(FL.max), fvY = new Float32Array(FL.max), fvZ = new Float32Array(FL.max);
const fqX = new Float32Array(FL.max), fqY = new Float32Array(FL.max), fqZ = new Float32Array(FL.max);
const faX = new Float32Array(FL.max), faY = new Float32Array(FL.max), faZ = new Float32Array(FL.max);
const fSize = new Float32Array(FL.max);
const fLam = new Float32Array(FL.max);
const fRho = new Float32Array(FL.max);
const fNbr = new Int32Array(FL.max * FL.maxN);
const fNum = new Int32Array(FL.max);

const GRID = 4096, GMASK = GRID - 1;
const gCount = new Int32Array(GRID);
const gStart = new Int32Array(GRID);
const gFill  = new Int32Array(GRID);
const gEntry = new Int32Array(FL.max);
const gCell  = new Int32Array(FL.max);

function cellHash(ix, iy, iz) {
  return ((ix * 92837111) ^ (iy * 689287499) ^ (iz * 283923481)) & GMASK;
}

/* ---- solid obstacles the fluid must flow around ---- */
const fSolid = new Float32Array(4 * 96);   // x, y, z, r  per entry
let fSolidN = 0;

/* Obstacles are rebuilt every step by whoever owns them (the dissolving
   buddy, rigid props, the player's capsule). The fluid does not care who
   put them there. */
export function clearSolids() { fSolidN = 0; }
export function addSolid(x, y, z, r) {
  const o = fSolidN * 4;
  if (o + 3 >= fSolid.length) return false;
  fSolid[o] = x; fSolid[o + 1] = y; fSolid[o + 2] = z; fSolid[o + 3] = r;
  fSolidN++;
  return true;
}

export const finger = { on: false, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, r: 0.40 };

/* ---- rendering ---- */
const FLUID_VERT = `
uniform vec2 uSnap;
attribute vec3 aTint;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vTint = aTint;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
  #endif
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewPos = mv.xyz;
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  ndc = floor(ndc * uSnap + 0.5) / uSnap;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
}
`;

const FLUID_FRAG = `
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3  uLightDir;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vec3 n = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(L + V);
  float lambert = max(dot(n, L), 0.0);
  vec3 col = vTint * (0.42 + 0.72 * lambert);
  float spec = pow(max(dot(n, H), 0.0), 26.0);
  col += vec3(0.80, 1.00, 0.96) * spec * 0.85;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += vTint * fres * 0.55;
  col = floor(col * 26.0 + 0.5) / 26.0;
  float d = length(vViewPos);
  float f = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 1.0);
}
`;

const fluidMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uFogColor: shared.uFogColor,
    uFogNear:  shared.uFogNear,
    uFogFar:   shared.uFogFar,
    uLightDir: shared.uLightDir,
    uSnap:     shared.uSnap,
  },
  vertexShader: FLUID_VERT,
  fragmentShader: FLUID_FRAG,
});

const fluidGeo = flat(new THREE.IcosahedronGeometry(1, 0));
const fluidTint = new THREE.InstancedBufferAttribute(new Float32Array(FL.max * 3), 3);
fluidTint.setUsage(THREE.DynamicDrawUsage);
fluidGeo.setAttribute('aTint', fluidTint);

const fluidMesh = new THREE.InstancedMesh(fluidGeo, fluidMaterial, FL.max);
fluidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
fluidMesh.frustumCulled = false;
fluidMesh.count = 0;
fluidMesh.visible = false;
scene.add(fluidMesh);

const DEEP = new THREE.Color(0x1aa793);
const SURF = new THREE.Color(0x63ecd0);
const FOAM = new THREE.Color(0xdcfff6);

const _fUp = new THREE.Vector3(0, 1, 0);
const _fPos = new THREE.Vector3();
const _fDir = new THREE.Vector3();
const _fScale = new THREE.Vector3();
const _fQuat = new THREE.Quaternion();
const _fMat = new THREE.Matrix4();

export function fluidReset() {
  FL.n = 0;
  fluidMesh.count = 0;
  fluidMesh.visible = false;
  finger.on = false;
}

export function fluidSpawn(x, y, z, vx, vy, vz) {
  if (FL.n >= FL.max) return;

  /* Never let a particle start life inside the body: the collision pass
     would fire it out like a bullet on its very first step. Drops are
     born on the surface of whatever part they came off. */
  for (let s = 0; s < fSolidN; s++) {
    const o = s * 4;
    const rr = fSolid[o + 3] + FL.rad;
    let dx = x - fSolid[o], dy = y - fSolid[o + 1], dz = z - fSolid[o + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) continue;
    let d = Math.sqrt(d2);
    if (d < 1e-4) { dx = 0; dy = 1; dz = 0; d = 1; }
    const k = rr / d;
    x = fSolid[o] + dx * k;
    y = fSolid[o + 1] + dy * k;
    z = fSolid[o + 2] + dz * k;
  }
  if (y < FL.rad) y = FL.rad;

  const i = FL.n++;
  fpX[i] = x; fpY[i] = y; fpZ[i] = z;
  fvX[i] = vx; fvY[i] = vy; fvZ[i] = vz;
  fRho[i] = FL.rho0;
  fLam[i] = 0;
  fSize[i] = 0.82 + Math.random() * 0.36;
}


/* ---------------------------------------------------------
   Solver
   --------------------------------------------------------- */
function fluidCollide(i) {
  const r = FL.rad;
  let x = fqX[i], y = fqY[i], z = fqZ[i];

  if (y < r) y = r;

  for (let s = 0; s < colliders.length; s++) {
    const c = colliders[s];
    const nx = Math.max(c.min.x, Math.min(x, c.max.x));
    const ny = Math.max(c.min.y, Math.min(y, c.max.y));
    const nz = Math.max(c.min.z, Math.min(z, c.max.z));
    const dx = x - nx, dy = y - ny, dz = z - nz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      const k = (r - d) / d;
      x += dx * k; y += dy * k; z += dz * k;
    } else {
      y = c.max.y + r;   // deep inside: pop out the top
    }
  }

  /* Obstacles that move (the dissolving body, the pointer) only ever nudge
     the fluid: an unbounded positional shove would read as an explosion once
     the velocity is differenced back out of it. */
  const maxPush = FL.maxPush;

  for (let s = 0; s < fSolidN; s++) {
    const o = s * 4;
    const rr = fSolid[o + 3] + r;
    const dx = x - fSolid[o], dy = y - fSolid[o + 1], dz = z - fSolid[o + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > rr * rr || d2 < 1e-10) continue;
    const d = Math.sqrt(d2);
    const push = Math.min(rr - d, maxPush) / d;
    x += dx * push; y += dy * push; z += dz * push;
  }

  if (finger.on) {
    const rr = finger.r + r;
    const dx = x - finger.x, dy = y - finger.y, dz = z - finger.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < rr * rr && d2 > 1e-10) {
      const d = Math.sqrt(d2);
      const push = Math.min(rr - d, maxPush) / d;
      x += dx * push; y += dy * push; z += dz * push;
    }
  }

  const B = 29;
  if (x < -B) x = -B; else if (x > B) x = B;
  if (z < -B) z = -B; else if (z > B) z = B;
  if (y < r) y = r;

  fqX[i] = x; fqY[i] = y; fqZ[i] = z;
}

function fluidGrid() {
  const inv = 1 / FL.h;
  gCount.fill(0);
  for (let i = 0; i < FL.n; i++) {
    const c = cellHash(
      Math.floor(fqX[i] * inv),
      Math.floor(fqY[i] * inv),
      Math.floor(fqZ[i] * inv)
    );
    gCell[i] = c;
    gCount[c]++;
  }
  let acc = 0;
  for (let c = 0; c < GRID; c++) { gStart[c] = acc; acc += gCount[c]; gFill[c] = 0; }
  for (let i = 0; i < FL.n; i++) {
    const c = gCell[i];
    gEntry[gStart[c] + gFill[c]++] = i;
  }
}

function fluidNeighbours() {
  const inv = 1 / FL.h, h2 = FL.h2, maxN = FL.maxN;
  for (let i = 0; i < FL.n; i++) {
    const xi = fqX[i], yi = fqY[i], zi = fqZ[i];
    const ix = Math.floor(xi * inv), iy = Math.floor(yi * inv), iz = Math.floor(zi * inv);
    const base = i * maxN;
    let cnt = 0;

    scan:
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) {
          const cell = cellHash(ix + a, iy + b, iz + c);
          const s = gStart[cell], e = s + gCount[cell];
          for (let k = s; k < e; k++) {
            const j = gEntry[k];
            if (j === i) continue;
            const dx = xi - fqX[j], dy = yi - fqY[j], dz = zi - fqZ[j];
            if (dx * dx + dy * dy + dz * dz >= h2) continue;   // hash collisions filtered here
            fNbr[base + cnt] = j;
            if (++cnt >= maxN) break scan;
          }
        }

    fNum[i] = cnt;
  }
}

function fluidLambda() {
  const rho0 = FL.rho0, eps = FL.eps, maxN = FL.maxN, h = FL.h;
  const w0 = kernW(0);
  for (let i = 0; i < FL.n; i++) {
    const base = i * maxN, n = fNum[i];
    const xi = fqX[i], yi = fqY[i], zi = fqZ[i];
    let rho = w0, gx = 0, gy = 0, gz = 0, sumGrad2 = 0;

    for (let k = 0; k < n; k++) {
      const j = fNbr[base + k];
      const dx = xi - fqX[j], dy = yi - fqY[j], dz = zi - fqZ[j];
      const r2 = dx * dx + dy * dy + dz * dz;
      rho += kernW(r2);
      const r = Math.sqrt(r2);
      if (r < 1e-6) continue;
      const c = SPIKY * (h - r) * (h - r) / (r * rho0);
      const wx = dx * c, wy = dy * c, wz = dz * c;
      gx += wx; gy += wy; gz += wz;
      sumGrad2 += wx * wx + wy * wy + wz * wz;
    }

    const wi = wallIndex(yi);
    if (wi >= 0) {
      const wg = wallGrad[wi] * FL.wall;
      rho += wallRho[wi] * FL.wall;
      gy += wg;
      sumGrad2 += wg * wg;
    }

    fRho[i] = rho;
    sumGrad2 += gx * gx + gy * gy + gz * gz;
    fLam[i] = -(rho / rho0 - 1) / (sumGrad2 + eps);
  }
}

function fluidDelta() {
  const rho0 = FL.rho0, maxN = FL.maxN, h = FL.h;
  const wq = kernW(FL.corrQ2);
  for (let i = 0; i < FL.n; i++) {
    const base = i * maxN, n = fNum[i];
    const xi = fqX[i], yi = fqY[i], zi = fqZ[i], li = fLam[i];
    let ax = 0, ay = 0, az = 0;

    for (let k = 0; k < n; k++) {
      const j = fNbr[base + k];
      const dx = xi - fqX[j], dy = yi - fqY[j], dz = zi - fqZ[j];
      const r2 = dx * dx + dy * dy + dz * dz;
      const r = Math.sqrt(r2);
      if (r < 1e-6) continue;
      /* artificial pressure: stops particles clumping and gives the
         surface a bit of tension, so droplets stay round */
      const ratio = kernW(r2) / wq;
      const scorr = -FL.corrK * ratio * ratio * ratio * ratio;
      const c = SPIKY * (h - r) * (h - r) / (r * rho0);
      const f = (li + fLam[j] + scorr) * c;
      ax += dx * f; ay += dy * f; az += dz * f;
    }

    const wi = wallIndex(yi);
    if (wi >= 0) ay += 2 * li * wallGrad[wi] * FL.wall;

    faX[i] = ax; faY[i] = ay; faZ[i] = az;
  }

  for (let i = 0; i < FL.n; i++) {
    fqX[i] += faX[i]; fqY[i] += faY[i]; fqZ[i] += faZ[i];
    fluidCollide(i);
  }
}

export function fluidStep(dt, gravityMul = 1) {
  if (FL.n === 0 || sim.frozen) return;

  const g = gravityFor(gravityMul);
  const drag = Math.max(0, 1 - 0.45 * dt);
  const maxSp2 = FL.maxSpeed * FL.maxSpeed;

  /* ---- external forces & prediction ---- */
  for (let i = 0; i < FL.n; i++) {
    let vx = fvX[i], vy = fvY[i], vz = fvZ[i];

    vy += g * dt;
    if (sim.wind) { vx += wind.x * 9 * dt; vz += wind.z * 9 * dt; }

    if (sim.magnet && !finger.on) {
      const dx = magnetTarget.x - fpX[i];
      const dy = magnetTarget.y - fpY[i];
      const dz = magnetTarget.z - fpZ[i];
      const d2 = dx * dx + dy * dy + dz * dz + 0.25;
      let acc = 200 / d2;
      if (acc > 460) acc = 460;
      const s = (acc * dt) / Math.sqrt(d2);
      vx += dx * s; vy += dy * s; vz += dz * s;
    }

    if (finger.on) {
      const dx = fpX[i] - finger.x, dy = fpY[i] - finger.y, dz = fpZ[i] - finger.z;
      const rr = finger.r * 2.2;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < rr * rr) {
        const k = (1 - Math.sqrt(d2) / rr) * 0.55;
        vx += (finger.vx - vx) * k;
        vy += (finger.vy - vy) * k;
        vz += (finger.vz - vz) * k;
      }
    }

    vx *= drag; vy *= drag; vz *= drag;

    const sp2 = vx * vx + vy * vy + vz * vz;
    if (sp2 > maxSp2) {
      const k = FL.maxSpeed / Math.sqrt(sp2);
      vx *= k; vy *= k; vz *= k;
    }

    fvX[i] = vx; fvY[i] = vy; fvZ[i] = vz;
    fqX[i] = fpX[i] + vx * dt;
    fqY[i] = fpY[i] + vy * dt;
    fqZ[i] = fpZ[i] + vz * dt;
    fluidCollide(i);
  }

  /* ---- density constraint projection ---- */
  fluidGrid();
  fluidNeighbours();
  for (let it = 0; it < FL.iters; it++) {
    fluidLambda();
    fluidDelta();
  }

  /* ---- velocity from the corrected positions ---- */
  const inv = 1 / dt;
  for (let i = 0; i < FL.n; i++) {
    fvX[i] = (fqX[i] - fpX[i]) * inv;
    fvY[i] = (fqY[i] - fpY[i]) * inv;
    fvZ[i] = (fqZ[i] - fpZ[i]) * inv;
  }

  /* ---- XSPH viscosity + cohesion ----
     Viscosity: neighbours drag each other along, so the blob reads as one
     body of liquid instead of dry sand.
     Cohesion: every particle is pulled towards its neighbours. Inside the
     fluid those pulls cancel; on the surface they do not, which is exactly
     surface tension — it keeps drops round and stops the puddle from
     creeping out into a one-particle-thick film. ---- */
  const vk = FL.visc / FL.rho0;
  const ck = (FL.coh / FL.rho0) * dt;
  for (let i = 0; i < FL.n; i++) {
    const base = i * FL.maxN, n = fNum[i];
    const xi = fqX[i], yi = fqY[i], zi = fqZ[i];
    const vx = fvX[i], vy = fvY[i], vz = fvZ[i];
    let ax = 0, ay = 0, az = 0;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < n; k++) {
      const j = fNbr[base + k];
      const dx = xi - fqX[j], dy = yi - fqY[j], dz = zi - fqZ[j];
      const w = kernW(dx * dx + dy * dy + dz * dz);
      ax += (fvX[j] - vx) * w;
      ay += (fvY[j] - vy) * w;
      az += (fvZ[j] - vz) * w;
      cx -= dx * w; cy -= dy * w; cz -= dz * w;
    }
    faX[i] = vx + ax * vk + cx * ck;
    faY[i] = vy + ay * vk + cy * ck;
    faZ[i] = vz + az * vk + cz * ck;
  }

  let sx = 0, sy = 0, sz = 0;
  const floorY = FL.rad + 0.02;
  const yv2 = FL.yield * FL.yield;
  const yieldY = FL.rad + 0.45;
  for (let i = 0; i < FL.n; i++) {
    let vx = faX[i], vy = faY[i], vz = faZ[i];
    if (fqY[i] < floorY) { vx *= 0.93; vz *= 0.93; }   // floor friction

    /* Yield stress. A real slime is not a perfect liquid: below some shear it
       behaves like a solid, which is why mud holds a mound and water does not.
       Damping slow *lateral* motion in the settled layer quadratically kills
       the pressure creep that would otherwise spread the puddle into an
       infinitely thin film, and leaves falling, splashing and sloshing
       completely untouched. */
    if (fqY[i] < yieldY) {
      const hs2 = vx * vx + vz * vz;
      if (hs2 < yv2) {
        const k = hs2 / yv2;
        vx *= k; vz *= k;
      }
    }
    fvX[i] = vx; fvY[i] = vy; fvZ[i] = vz;
    fpX[i] = fqX[i]; fpY[i] = fqY[i]; fpZ[i] = fqZ[i];
    sx += fpX[i]; sy += fpY[i]; sz += fpZ[i];
  }
  FL.cx = sx / FL.n; FL.cy = sy / FL.n; FL.cz = sz / FL.n;
}

/* ---------------------------------------------------------
   Rendering — instanced blobs, stretched along their velocity,
   tinted by depth inside the fluid (deep = dark, surface = bright,
   fast = foamy).
   --------------------------------------------------------- */
export function fluidRender() {
  fluidMesh.count = FL.n;
  if (FL.n === 0) { fluidMesh.visible = false; return; }
  fluidMesh.visible = true;

  const tints = fluidTint.array;

  for (let i = 0; i < FL.n; i++) {
    const vx = fvX[i], vy = fvY[i], vz = fvZ[i];
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);

    let surf = 1 - fRho[i] / FL.rho0;
    if (surf < 0) surf = 0; else if (surf > 1) surf = 1;

    const r = FL.drawRad * fSize[i] * (1 - surf * 0.55);
    const st = Math.min(0.9, sp * 0.030);

    _fPos.set(fpX[i], fpY[i], fpZ[i]);
    if (st > 0.02 && sp > 1e-4) {
      _fDir.set(vx / sp, vy / sp, vz / sp);
      _fQuat.setFromUnitVectors(_fUp, _fDir);
      _fScale.set(r * (1 - st * 0.42), r * (1 + st), r * (1 - st * 0.42));
    } else {
      _fQuat.identity();
      _fScale.set(r, r, r);
    }
    _fMat.compose(_fPos, _fQuat, _fScale);
    fluidMesh.setMatrixAt(i, _fMat);

    const foam = Math.min(1, sp * 0.075) * 0.5;
    const o = i * 3;
    tints[o]     = (DEEP.r + (SURF.r - DEEP.r) * surf) * (1 - foam) + FOAM.r * foam;
    tints[o + 1] = (DEEP.g + (SURF.g - DEEP.g) * surf) * (1 - foam) + FOAM.g * foam;
    tints[o + 2] = (DEEP.b + (SURF.b - DEEP.b) * surf) * (1 - foam) + FOAM.b * foam;
  }

  fluidMesh.instanceMatrix.needsUpdate = true;
  fluidTint.needsUpdate = true;
}

/* Pointer velocity, so shoving the puddle actually throws it. */
export function updateFinger(dt) {
  if (!finger.on) return;
  const k = 1 / Math.max(dt, 0.008);
  finger.vx = (finger.x - finger.px) * k;
  finger.vy = (finger.y - finger.py) * k;
  finger.vz = (finger.z - finger.pz) * k;
  const sp2 = finger.vx * finger.vx + finger.vy * finger.vy + finger.vz * finger.vz;
  if (sp2 > 900) {
    const s = 30 / Math.sqrt(sp2);
    finger.vx *= s; finger.vy *= s; finger.vz *= s;
  }
  finger.px = finger.x; finger.py = finger.y; finger.pz = finger.z;
}
