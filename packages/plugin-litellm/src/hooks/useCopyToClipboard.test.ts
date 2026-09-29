import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isClipboardApiAvailable, startCopiedTimer } from './useCopyToClipboard';

describe('useCopyToClipboard helpers', () => {
  describe('isClipboardApiAvailable', () => {
    it('should return a boolean', () => {
      const result = isClipboardApiAvailable();
      // In node --test environment, navigator is undefined, so this should be false
      assert.strictEqual(typeof result, 'boolean');
      // In Node.js, this should be false
      assert.strictEqual(result, false);
    });
  });

  describe('startCopiedTimer', () => {
    it('should return a timer ID', async () => {
      const changes: boolean[] = [];
      const onCopiedChange = (copied: boolean) => {
        changes.push(copied);
      };

      const timerId = startCopiedTimer(onCopiedChange, 50);
      assert.ok(timerId); // Timer ID should be truthy

      // Wait for timer to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      // The callback should have been called with false
      assert.deepStrictEqual(changes, [false]);
    });

    it('should allow clearing the timer', async () => {
      const changes: boolean[] = [];
      const onCopiedChange = (copied: boolean) => {
        changes.push(copied);
      };

      const timerId = startCopiedTimer(onCopiedChange, 50);

      // Clear the timer immediately
      clearTimeout(timerId);

      // Wait longer than the timer duration
      await new Promise(resolve => setTimeout(resolve, 100));

      // The callback should NOT have been called
      assert.deepStrictEqual(changes, []);
    });

    it('should respect custom duration', async () => {
      let callCount = 0;
      const onCopiedChange = () => {
        callCount++;
      };

      startCopiedTimer(onCopiedChange, 30);

      // After 15ms, still no call
      await new Promise(resolve => setTimeout(resolve, 15));
      assert.strictEqual(callCount, 0);

      // After 50ms total, should have fired
      await new Promise(resolve => setTimeout(resolve, 40));
      assert.strictEqual(callCount, 1);
    });
  });
});
