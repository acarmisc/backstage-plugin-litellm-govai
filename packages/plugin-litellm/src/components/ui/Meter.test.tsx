import '../../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen } from '@testing-library/react';
import { Meter } from './Meter';

afterEach(() => cleanup());

describe('Meter', () => {
  test('exposes meter semantics with a clamped value', () => {
    render(<Meter value={42} ariaLabel="Key budget used: 42%" />);
    const m = screen.getByRole('meter', { name: 'Key budget used: 42%' });
    assert.strictEqual(m.getAttribute('aria-valuenow'), '42');
    assert.strictEqual(m.getAttribute('aria-valuemin'), '0');
    assert.strictEqual(m.getAttribute('aria-valuemax'), '100');
    assert.strictEqual(screen.queryByText('Over cap'), null);
  });

  test('over 100% clamps the value and shows visible Over cap text', () => {
    render(<Meter value={130} ariaLabel="Team budget" />);
    const m = screen.getByRole('meter', { name: 'Team budget' });
    assert.strictEqual(m.getAttribute('aria-valuenow'), '100');
    assert.strictEqual(m.getAttribute('aria-valuetext'), '130% — over cap');
    assert.ok(screen.getByText('Over cap'));
  });
});
