import assert from 'node:assert/strict';
import test from 'node:test';

test('wheel cycles weapons when tool does not consume scroll', () => {
  let cycled = 0;
  function cycleTool(dir) { cycled += dir; }

  const toolHolding = {
    scroll(dir) {
      const holding = true;
      if (holding) return true;
      return false;
    }
  };

  const toolIdle = {
    scroll(dir) {
      const holding = false;
      if (holding) return true;
      return false;
    }
  };

  // When holding, tool consumes scroll
  let consumed = toolHolding.scroll(1);
  if (!consumed) cycleTool(1);
  assert.equal(consumed, true);
  assert.equal(cycled, 0);

  // When idle, tool does not consume scroll -> cycles weapon
  consumed = toolIdle.scroll(1);
  if (!consumed) cycleTool(1);
  assert.equal(consumed, false);
  assert.equal(cycled, 1);
});
