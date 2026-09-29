import { describe, test } from 'node:test';
import assert from 'node:assert';
import { widgetViewState, isUnprovisionedError, USAGE_UNAVAILABLE_MSG } from './widgetState';
import { ApiError } from './api';

describe('widgetViewState', () => {
  test('returns loading when loading is true', () => {
    const state = widgetViewState({
      loading: true,
      error: null,
      userInfo: null,
      usageError: null,
    });
    assert.deepStrictEqual(state, { kind: 'loading' });
  });

  test('returns unprovisioned when error is an unprovisioned error', () => {
    const error = new ApiError('User not found in LiteLLM', 404, { error: 'User not found in LiteLLM' });
    const state = widgetViewState({
      loading: false,
      error,
      userInfo: null,
      usageError: null,
    });
    assert.deepStrictEqual(state, { kind: 'unprovisioned' });
  });

  test('returns error when error is not unprovisioned', () => {
    const error = new ApiError('Some other error', 500, { error: 'Internal server error' });
    const state = widgetViewState({
      loading: false,
      error,
      userInfo: null,
      usageError: null,
    });
    assert.deepStrictEqual(state, { kind: 'error', message: USAGE_UNAVAILABLE_MSG });
  });

  test('returns ready without usage unavailable when all data loaded successfully', () => {
    const state = widgetViewState({
      loading: false,
      error: null,
      userInfo: { max_budget: 100 },
      usageError: null,
    });
    assert.deepStrictEqual(state, { kind: 'ready', usageUnavailable: false });
  });

  test('returns ready with usage unavailable when usage fetch fails', () => {
    const state = widgetViewState({
      loading: false,
      error: null,
      userInfo: { max_budget: 100 },
      usageError: new Error('Failed to fetch usage'),
    });
    assert.deepStrictEqual(state, { kind: 'ready', usageUnavailable: true });
  });

  test('ignores hasKeys parameter in state determination', () => {
    const state1 = widgetViewState({
      loading: false,
      error: null,
      userInfo: {},
      usageError: null,
      hasKeys: true,
    });
    const state2 = widgetViewState({
      loading: false,
      error: null,
      userInfo: {},
      usageError: null,
      hasKeys: false,
    });
    assert.deepStrictEqual(state1, state2);
  });
});

describe('isUnprovisionedError', () => {
  test('returns true for 404 ApiError with "User not found in LiteLLM" message', () => {
    const error = new ApiError('User not found in LiteLLM', 404, { error: 'User not found in LiteLLM' });
    assert.strictEqual(isUnprovisionedError(error), true);
  });

  test('returns false for 404 ApiError with different message', () => {
    const error = new ApiError('Not found', 404, { error: 'Resource not found' });
    assert.strictEqual(isUnprovisionedError(error), false);
  });

  test('returns false for non-404 status', () => {
    const error = new ApiError('User not found in LiteLLM', 500, { error: 'User not found in LiteLLM' });
    assert.strictEqual(isUnprovisionedError(error), false);
  });

  test('returns false for non-ApiError types', () => {
    const error = new Error('Generic error');
    assert.strictEqual(isUnprovisionedError(error), false);
  });

  test('returns false for null body', () => {
    const error = new ApiError('User not found in LiteLLM', 404, null);
    assert.strictEqual(isUnprovisionedError(error), false);
  });

  test('returns false for non-object body', () => {
    const error = new ApiError('User not found in LiteLLM', 404, 'string body');
    assert.strictEqual(isUnprovisionedError(error), false);
  });
});
