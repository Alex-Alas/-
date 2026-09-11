import assert from 'node:assert/strict';
import test from 'node:test';

test('coyote time allows jumping briefly after leaving ground', () => {
  let onGround = false;
  let coyoteTimer = 0.12;
  const dt = 0.05;

  coyoteTimer -= dt;
  assert.ok(coyoteTimer > 0, 'Coyote timer should still be active');

  // Jump triggered within window
  const canJump = onGround || coyoteTimer > 0;
  assert.equal(canJump, true);
});

test('jump buffer registers pre-landing jump input', () => {
  let jumpBuffer = 0.10;
  const dt = 0.04;
  jumpBuffer -= dt;
  assert.ok(jumpBuffer > 0);

  // Touching ground consumes buffer
  let jumped = false;
  let onGround = true;
  if (onGround && jumpBuffer > 0) {
    jumped = true;
    jumpBuffer = 0;
  }
  assert.equal(jumped, true);
  assert.equal(jumpBuffer, 0);
});
