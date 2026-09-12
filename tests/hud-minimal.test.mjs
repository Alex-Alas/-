import assert from 'node:assert/strict';
import test from 'node:test';
import { createHUDState } from '../src/ui/hud-state.js';

test('HUD starts in collapsed state by default', () => {
  const hud = createHUDState();
  assert.equal(hud.isExpanded(), false);
});

test('HUD expands on weapon switch and auto-collapses after duration', async () => {
  let timerMs = 0;
  let scheduledCallback = null;
  const mockScheduler = {
    setTimeout: (cb, ms) => {
      timerMs = ms;
      scheduledCallback = cb;
      return 123;
    },
    clearTimeout: () => {
      scheduledCallback = null;
    }
  };

  const hud = createHUDState({ scheduler: mockScheduler });
  hud.expand(2000);

  assert.equal(hud.isExpanded(), true);
  assert.equal(timerMs, 2000);

  // Trigger timer
  scheduledCallback();
  assert.equal(hud.isExpanded(), false);
});

test('rapid weapon switching resets the collapse timer', () => {
  let clearedCount = 0;
  let activeCallback = null;
  const mockScheduler = {
    setTimeout: (cb) => {
      activeCallback = cb;
      return 456;
    },
    clearTimeout: () => {
      clearedCount++;
      activeCallback = null;
    }
  };

  const hud = createHUDState({ scheduler: mockScheduler });
  hud.expand(2000);
  assert.equal(hud.isExpanded(), true);

  hud.expand(2000);
  assert.equal(clearedCount, 1);
  assert.equal(hud.isExpanded(), true);

  activeCallback();
  assert.equal(hud.isExpanded(), false);
});

test('hovering keeps HUD expanded until mouse leaves', () => {
  let activeCallback = null;
  const mockScheduler = {
    setTimeout: (cb) => {
      activeCallback = cb;
      return 789;
    },
    clearTimeout: () => {
      activeCallback = null;
    }
  };

  const hud = createHUDState({ scheduler: mockScheduler });
  hud.expand(2000);
  hud.setHovered(true);

  // Timer attempts to collapse while hovered
  activeCallback();
  assert.equal(hud.isExpanded(), true, 'Should stay expanded while hovered');

  // Mouse leaves
  hud.setHovered(false);
  assert.equal(hud.isExpanded(), false, 'Should collapse once hover ends');
});
