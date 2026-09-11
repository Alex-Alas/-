/* =========================================================
   BUDDY MATERIALS
   Each material is a full physical description of the ragdoll: solver
   stiffness, restitution, drag, whether it shatters, whether it melts,
   plus its palette. They live in a Registry, so a new material is a
   register() call — the solver, the HUD swatches and the cinematic all
   read the list instead of naming materials.
   ========================================================= */
import { Registry } from '../../core/registry.js';
import { FL } from '../../physics/fluid.js';

const META = {
  plush:   { label: 'PLUSH',   dot: 0x7de3b8, hint: 'soft & floppy · drag him around · drag the void to orbit' },
  vase:    { label: 'VASE',    dot: 0xefecfa, hint: 'EXTREME PORCELAIN · hair-trigger fracture · shatters into dust' },
  liquid:  { label: 'LIQUID',  dot: 0x5fe8c8, hint: `REAL FLUID SIM · he liquefies into ${FL.max} SPH particles · poke the puddle` },
  balloon: { label: 'BALLOON', dot: 0xff7fa8, hint: 'buoyant · he floats up and bumps the sky' },
  rubber:  { label: 'RUBBER',  dot: 0xffc93c, hint: 'EXTRA RUBBERY · nearly perfect bounce · squeezes & stretches' },
};

const MATS = {
  plush: {
    stiffness: 1.0, damping: 0.992, iterations: 10,
    restitution: 0.28, friction: 0.72, gravityMul: 1.0,
    radiusMul: 1.0, breakStretch: 0, drag: 0.0, ceiling: 1e9,
    cohesion: 0, boneThickness: 1.0, meltDuration: 0,
    pal: { head:0x9ff2cd, body:0x7de3b8, limb:0x6fd3ab, belly:0xffe9a8,
           ear:0x8ae8c0, earIn:0xff9ec2, cheek:0xff9ec2, eyeW:0xf6fcff, eyeD:0x1a1226 },
  },
  // PORCELAIN — extreme brittleness, hair-trigger fracture
  vase: {
    stiffness: 1.0, damping: 0.9993, iterations: 40,
    restitution: 0.24, friction: 0.97, gravityMul: 1.0,
    radiusMul: 0.68, breakStretch: 1.10, drag: 0.0, ceiling: 1e9,
    cohesion: 0, boneThickness: 0.9, meltDuration: 0,
    pal: { head:0xfaf8ff, body:0xefecfa, limb:0xe2ddf2, belly:0xd3cbe9,
           ear:0xefecfa, earIn:0xd9d2ee, cheek:0xe6c9d8, eyeW:0xffffff, eyeD:0x2b2440 },
  },
  // LIQUID — the body softens, sags and then dissolves limb by limb into a
  // real SPH fluid (see the LIQUID section below). Nothing about the puddle
  // is faked: it is ~520 particles solving density constraints every frame.
  liquid: {
    stiffness: 0.62, damping: 0.9955, iterations: 9,
    restitution: 0.06, friction: 0.38, gravityMul: 1.0,
    radiusMul: 1.30, breakStretch: 0, drag: 0.22, ceiling: 1e9,
    cohesion: 11, boneThickness: 1.7,
    meltDuration: 6.0,      // seconds until the body is fully liquefied
    pal: { head:0x9ff5e0, body:0x5fe8c8, limb:0x4ed4b4, belly:0xc8fff0,
           ear:0x5fe8c8, earIn:0x9ff5e0, cheek:0xd8fff8, eyeW:0xffffff, eyeD:0x062a26 },
  },
  balloon: {
    stiffness: 0.72, damping: 0.955, iterations: 8,
    restitution: 0.60, friction: 0.50, gravityMul: -0.50,
    radiusMul: 1.18, breakStretch: 0, drag: 0.50, ceiling: 8.4,
    cohesion: 0, boneThickness: 1.0, meltDuration: 0,
    pal: { head:0xffa8c4, body:0xff7fa8, limb:0xff6f9c, belly:0xffd0dd,
           ear:0xff7fa8, earIn:0xffc2d4, cheek:0xff5f8f, eyeW:0xffffff, eyeD:0x3a1020 },
  },
  // RUBBER — EXTRA rubbery. Near-perfect restitution, almost no damping,
  // bulging squash-and-stretch on every bone.
  rubber: {
    stiffness: 1.0, damping: 0.9992, iterations: 18,
    restitution: 0.965, friction: 0.98, gravityMul: 1.0,
    radiusMul: 0.92, breakStretch: 0, drag: 0.0, ceiling: 14,
    cohesion: 0, boneThickness: 1.05, meltDuration: 0,
    pal: { head:0xffe066, body:0xffc93c, limb:0xffb703, belly:0xfff0a8,
           ear:0xffc93c, earIn:0xffe066, cheek:0xff9a3c, eyeW:0xffffff, eyeD:0x2a1a00 },
  },
};

export const BuddyMaterials = new Registry('buddyMaterial');
for (const id in MATS) BuddyMaterials.register({ id, ...META[id], ...MATS[id] });

export const matDef = (id) => BuddyMaterials.get(id) || BuddyMaterials.list()[0];
