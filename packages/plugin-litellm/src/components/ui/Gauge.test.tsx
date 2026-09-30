import '../../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { render, cleanup, screen } from '@testing-library/react';
import { Gauge } from './Gauge';

afterEach(() => cleanup());

describe('Gauge', () => {
  test('exposes meter semantics and the rounded percentage', () => {
    render(<Gauge value={87.4} label="87%" ariaLabel="Key budget used: 87%" />);
    const m = screen.getByRole('meter', { name: 'Key budget used: 87%' });
    assert.strictEqual(m.getAttribute('aria-valuenow'), '87.4');
    assert.strictEqual(m.getAttribute('aria-valuemin'), '0');
    assert.strictEqual(m.getAttribute('aria-valuemax'), '100');
    assert.ok(screen.getByText('87%'));
    assert.strictEqual(screen.queryByText('Over cap'), null);
  });

  test('over 100% clamps the arc but keeps the real number in the centre', () => {
    render(<Gauge value={124} label="124%" ariaLabel="Key budget used: 124%" />);
    const m = screen.getByRole('meter', { name: 'Key budget used: 124%' });
    assert.strictEqual(m.getAttribute('aria-valuenow'), '100');
    assert.strictEqual(m.getAttribute('aria-valuetext'), '124% — over cap');
    // The percentage stays visible: a wide word in a small ring both
    // overflows and collides with the stroke, so the status is spelled out
    // by the row that owns the gauge instead.
    assert.ok(screen.getByText('124%'));
    assert.strictEqual(screen.queryByText('Over cap'), null);
    assert.ok(!m.textContent?.includes('Over cap'));
  });

  test('a caller-supplied caption renders under the value', () => {
    render(<Gauge value={124} label="124%" caption="of $200" />);
    assert.ok(screen.getByText('of $200'));
    assert.strictEqual(screen.queryByText('Over cap'), null);
  });

  test('a gauge with no cap renders an em dash rather than a number', () => {
    render(<Gauge value={0} label="—" ariaLabel="Team — no cap" />);
    const m = screen.getByRole('meter', { name: 'Team — no cap' });
    assert.strictEqual(m.getAttribute('aria-valuenow'), '0');
    assert.ok(screen.getByText('—'));
    assert.strictEqual(screen.queryByText('Over cap'), null);
  });
});
