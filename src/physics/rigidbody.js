/* =========================================================
   RIGID BODY
   A body carries linear and angular momentum for real: impulses applied
   off-centre produce spin, a heavy crate shrugs off a light one, and a
   long plank is harder to tumble end-over-end than to spin flat. That is
   what makes every tool in the sandbox a force tool rather than an
   animation.
   ========================================================= */
import * as THREE from 'three';

export const SHAPE = { BOX: 'box', SPHERE: 'sphere' };

let nextId = 1;

const _r = new THREE.Vector3();
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _spin = new THREE.Quaternion();

export class RigidBody {
  constructor(opts = {}) {
    this.id = nextId++;
    this.type = opts.type || 'prop';       // which prop definition built it
    this.shape = opts.shape || SHAPE.BOX;

    /* Box: half extents. Sphere: radius (half.x mirrors it so the
       broadphase can treat both the same way). */
    this.half = new THREE.Vector3(...(opts.half || [0.5, 0.5, 0.5]));
    this.radius = opts.radius !== undefined ? opts.radius : this.half.x;
    if (this.shape === SHAPE.SPHERE) this.half.setScalar(this.radius);

    this.pos = new THREE.Vector3(...(opts.pos || [0, 0, 0]));
    this.quat = new THREE.Quaternion();
    if (opts.quat) this.quat.copy(opts.quat);
    this.vel = new THREE.Vector3(...(opts.vel || [0, 0, 0]));
    this.angVel = new THREE.Vector3(...(opts.angVel || [0, 0, 0]));

    this.restitution = opts.restitution !== undefined ? opts.restitution : 0.22;
    this.friction = opts.friction !== undefined ? opts.friction : 0.55;
    this.linDamp = opts.linDamp !== undefined ? opts.linDamp : 0.06;
    this.angDamp = opts.angDamp !== undefined ? opts.angDamp : 0.10;
    this.gravityScale = opts.gravityScale !== undefined ? opts.gravityScale : 1;

    this.isStatic = !!opts.isStatic;
    this.frozen = false;                   // physgun freeze — reversible
    this.sleeping = false;
    this.sleepTimer = 0;
    this.removed = false;

    this.mesh = opts.mesh || null;
    this.force = new THREE.Vector3();       // accumulated for this step
    this.torque = new THREE.Vector3();
    /* Pseudo velocities: penetration is pushed out with these instead of
       with a Baumgarte term on the real velocity, so resolving overlap
       never adds energy to the system. Tall stacks live or die on this. */
    this.pvel = new THREE.Vector3();
    this.pang = new THREE.Vector3();
    this.invInertiaWorld = new THREE.Matrix3();
    this.rmat = new THREE.Matrix3();       // orientation, cached for the solver
    this.aabb = { min: new THREE.Vector3(), max: new THREE.Vector3() };

    this.setMass(this.isStatic ? 0 : (opts.mass !== undefined ? opts.mass : 8));
    this.updateTransforms();
  }

  setMass(mass) {
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;

    const invI = new THREE.Vector3();
    if (mass > 0) {
      if (this.shape === SHAPE.SPHERE) {
        const i = 0.4 * mass * this.radius * this.radius;
        invI.set(1 / i, 1 / i, 1 / i);
      } else {
        const x = this.half.x * 2, y = this.half.y * 2, z = this.half.z * 2;
        const k = mass / 12;
        invI.set(1 / (k * (y * y + z * z)), 1 / (k * (x * x + z * z)), 1 / (k * (x * x + y * y)));
      }
    }
    this.invInertiaLocal = invI;
    return this;
  }

  /** True when the solver must treat the body as immovable this step. */
  get immovable() { return this.invMass === 0 || this.isStatic || this.frozen; }

  /** Refresh everything derived from pos/quat: rotation matrix, inertia, AABB. */
  updateTransforms() {
    _m4.makeRotationFromQuaternion(this.quat);
    this.rmat.setFromMatrix4(_m4);
    this.updateInertiaWorld();
    this.updateAABB();
  }

  /** R * diag(invI) * R^T — the inertia tensor in world space. */
  updateInertiaWorld() {
    if (this.immovable) { this.invInertiaWorld.set(0, 0, 0, 0, 0, 0, 0, 0, 0); return; }
    const r = this.rmat.elements, o = this.invInertiaWorld.elements;
    const ix = this.invInertiaLocal.x, iy = this.invInertiaLocal.y, iz = this.invInertiaLocal.z;
    // columns of r are the body axes
    for (let c = 0; c < 3; c++) {
      for (let rw = 0; rw < 3; rw++) {
        o[c * 3 + rw] =
          r[0 + rw] * ix * r[0 + c] +
          r[3 + rw] * iy * r[3 + c] +
          r[6 + rw] * iz * r[6 + c];
      }
    }
  }

  updateAABB() {
    if (this.shape === SHAPE.SPHERE) {
      this.aabb.min.set(this.pos.x - this.radius, this.pos.y - this.radius, this.pos.z - this.radius);
      this.aabb.max.set(this.pos.x + this.radius, this.pos.y + this.radius, this.pos.z + this.radius);
      return;
    }
    const m = this.rmat.elements;
    const ex = Math.abs(m[0]) * this.half.x + Math.abs(m[3]) * this.half.y + Math.abs(m[6]) * this.half.z;
    const ey = Math.abs(m[1]) * this.half.x + Math.abs(m[4]) * this.half.y + Math.abs(m[7]) * this.half.z;
    const ez = Math.abs(m[2]) * this.half.x + Math.abs(m[5]) * this.half.y + Math.abs(m[8]) * this.half.z;
    this.aabb.min.set(this.pos.x - ex, this.pos.y - ey, this.pos.z - ez);
    this.aabb.max.set(this.pos.x + ex, this.pos.y + ey, this.pos.z + ez);
  }

  /** Velocity of the world-space point p on this body. */
  pointVelocity(p, out = new THREE.Vector3()) {
    _r.copy(p).sub(this.pos);
    return out.copy(this.angVel).cross(_r).add(this.vel);
  }

  /** The impulse that makes momentum real: off-centre hits spin things. */
  applyImpulse(impulse, point) {
    if (this.immovable) return;
    this.wake();
    this.vel.addScaledVector(impulse, this.invMass);
    if (point) {
      _r.copy(point).sub(this.pos).cross(impulse);
      _r.applyMatrix3(this.invInertiaWorld);
      this.angVel.add(_r);
    }
  }

  applyForce(f, point) {
    if (this.immovable) return;
    this.wake();
    this.force.add(f);
    if (point) {
      _t.copy(point).sub(this.pos).cross(f);
      this.torque.add(_t);
    }
  }

  applyTorque(t) {
    if (this.immovable) return;
    this.wake();
    this.torque.add(t);
  }

  wake() {
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  /** Push the solver state into the mesh. */
  syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
  }

  /** World-space corners of a box body, written into an array of Vector3. */
  corners(out) {
    const m = this.rmat.elements;
    let i = 0;
    for (let sx = -1; sx <= 1; sx += 2)
      for (let sy = -1; sy <= 1; sy += 2)
        for (let sz = -1; sz <= 1; sz += 2) {
          const x = sx * this.half.x, y = sy * this.half.y, z = sz * this.half.z;
          out[i++].set(
            this.pos.x + m[0] * x + m[3] * y + m[6] * z,
            this.pos.y + m[1] * x + m[4] * y + m[7] * z,
            this.pos.z + m[2] * x + m[5] * y + m[8] * z
          );
        }
    return out;
  }

  integrateVelocity(dt, gravity) {
    if (this.immovable || this.sleeping) return;
    this.vel.y += gravity * this.gravityScale * dt;
    this.vel.addScaledVector(this.force, this.invMass * dt);
    _t.copy(this.torque).applyMatrix3(this.invInertiaWorld).multiplyScalar(dt);
    this.angVel.add(_t);
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);

    const ld = Math.max(0, 1 - this.linDamp * dt);
    const ad = Math.max(0, 1 - this.angDamp * dt);
    this.vel.multiplyScalar(ld);
    this.angVel.multiplyScalar(ad);

    const MAXV = 220, MAXW = 26;
    if (this.vel.lengthSq() > MAXV * MAXV) this.vel.setLength(MAXV);
    if (this.angVel.lengthSq() > MAXW * MAXW) this.angVel.setLength(MAXW);
  }

  integratePosition(dt) {
    if (this.immovable || this.sleeping) {
      this.force.set(0, 0, 0);
      this.torque.set(0, 0, 0);
      this.pvel.set(0, 0, 0);
      this.pang.set(0, 0, 0);
      return;
    }
    this.pos.addScaledVector(this.vel, dt).addScaledVector(this.pvel, dt);
    _v.copy(this.angVel).addScaledVector(this.pang, 1).multiplyScalar(dt * 0.5);
    _spin.set(_v.x, _v.y, _v.z, 0).multiply(this.quat);
    this.quat.x += _spin.x; this.quat.y += _spin.y; this.quat.z += _spin.z; this.quat.w += _spin.w;
    this.quat.normalize();
    this.pvel.set(0, 0, 0);
    this.pang.set(0, 0, 0);
    this.updateTransforms();
  }
}
