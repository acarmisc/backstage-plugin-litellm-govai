import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  getUnprovisionedTitle,
  getUnprovisionedMessage,
  getAdminDetailsTitle,
  getAdminDetailsMessage,
} from './unprovisionedCopy';

describe('unprovisionedCopy', () => {
  test('getUnprovisionedTitle returns correct title', () => {
    const result = getUnprovisionedTitle();
    assert.strictEqual(result, 'Your LiteLLM account isn\'t set up yet');
  });

  test('getUnprovisionedMessage with supportContact', () => {
    const result = getUnprovisionedMessage('admin@example.com');
    assert.strictEqual(result, 'Contact admin@example.com');
  });

  test('getUnprovisionedMessage without supportContact', () => {
    const result = getUnprovisionedMessage();
    assert.strictEqual(result, 'Contact your administrator');
  });

  test('getUnprovisionedMessage with empty supportContact treats as no contact', () => {
    const result = getUnprovisionedMessage('');
    assert.strictEqual(result, 'Contact your administrator');
  });

  test('getAdminDetailsTitle returns correct title', () => {
    const result = getAdminDetailsTitle();
    assert.strictEqual(result, 'Details for administrators');
  });

  test('getAdminDetailsMessage returns correct message', () => {
    const result = getAdminDetailsMessage();
    assert(result.includes('litellm.provisioning.enabled'));
    assert(result.includes('app-config.yaml'));
  });
});
