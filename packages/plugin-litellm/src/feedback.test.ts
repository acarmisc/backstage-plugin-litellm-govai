import { describe, test } from 'node:test';
import assert from 'node:assert';
import { toastFor } from './feedback';

describe('toastFor', () => {
  test('returns success message for generateSuccess', () => {
    const result = toastFor('generateSuccess');
    assert.deepStrictEqual(result, {
      message: 'Key generated successfully',
      severity: 'success',
    });
  });

  test('returns error message for generateError', () => {
    const result = toastFor('generateError', 'API error');
    assert.deepStrictEqual(result, {
      message: 'Failed to generate key: API error',
      severity: 'error',
    });
  });

  test('returns warning message for blockSuccess', () => {
    const result = toastFor('blockSuccess');
    assert.deepStrictEqual(result, {
      message: 'Key blocked — requests will be rejected until unblocked',
      severity: 'warning',
    });
  });

  test('returns warning message for deleteAlreadyDeleted', () => {
    const result = toastFor('deleteAlreadyDeleted');
    assert.strictEqual(result?.severity, 'warning');
  });

  test('returns partial message for prunePartial', () => {
    const result = toastFor('prunePartial');
    assert.strictEqual(result?.severity, 'warning');
    assert(result?.message.includes('some failed'));
  });

  test('returns success for knowledgeBaseSuccess', () => {
    const result = toastFor('knowledgeBaseSuccess');
    assert.strictEqual(result?.severity, 'success');
  });

  test('returns success for mcpServerSuccess', () => {
    const result = toastFor('mcpServerSuccess');
    assert.strictEqual(result?.severity, 'success');
  });
});
