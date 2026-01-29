import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PasswordGateProps } from './PasswordGate';
import React from 'react';

// Utility to mutate import.meta.env for test (vite injects at build; here we monkey patch)
describe('PasswordGate', () => {
  beforeEach(() => { try { localStorage.clear(); } catch {/* ignore */} });

  it('is transparent when no password or hash provided', async () => {
    const mod = await import('./PasswordGate');
    const PasswordGate = mod.default as React.ComponentType<PasswordGateProps>;
    render(<PasswordGate><div data-testid="content">Visible</div></PasswordGate>);
    // Use findBy to await effect-driven state stabilization to avoid act() warning
    expect(await screen.findByTestId('content')).toBeInTheDocument();
  });

  it('prompts for plain password and unlocks on correct entry', async () => {
    const mod = await import('./PasswordGate');
    const PasswordGate = mod.default as React.ComponentType<PasswordGateProps>;
    render(<PasswordGate testConfig={{ password: 'secret' }}><div data-testid="inner">Unlocked</div></PasswordGate>);
    expect(await screen.findByRole('dialog', { name: /access gate/i })).toBeInTheDocument();
    const input = await screen.findByLabelText(/password/i);
    fireEvent.change(input, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    await screen.findByTestId('inner');
  });

  it('rejects incorrect plain password', async () => {
    const mod = await import('./PasswordGate');
    const PasswordGate = mod.default as React.ComponentType<PasswordGateProps>;
    render(<PasswordGate testConfig={{ password: 'secret' }}><div data-testid="inner">Unlocked</div></PasswordGate>);
    const input = await screen.findByLabelText(/password/i);
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /enter/i }));
    const alertEl = await screen.findByRole('alert');
    expect(alertEl).toHaveTextContent(/incorrect/i);
    expect(screen.queryByTestId('inner')).not.toBeInTheDocument();
  });

  it('accepts hashed password (sha-256) and persists unlock', async () => {
    // Hash for 'open-sesame' (lowercase) precomputed using scripts/generate-password-hash.mjs
    // We'll compute it inline to avoid drift.
    const encoder = new TextEncoder();
    const data = encoder.encode('open-sesame');
    const digestBuf = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digestBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    const mod = await import('./PasswordGate');
  const PasswordGate = mod.default as React.ComponentType<PasswordGateProps>;
  const { unmount } = render(<PasswordGate testConfig={{ hash }}><div data-testid="hashContent">Hash OK</div></PasswordGate>);
  expect(await screen.findByRole('dialog', { name: /access gate/i })).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText(/password/i), { target: { value: 'open-sesame' } });
  fireEvent.click(screen.getByRole('button', { name: /enter/i }));
  await screen.findByTestId('hashContent');

    // Unmount & re-mount should auto-unlock due to localStorage flag
    unmount();
    const mod2 = await import('./PasswordGate');
  const PasswordGate2 = mod2.default as React.ComponentType<PasswordGateProps>;
  render(<PasswordGate2 testConfig={{ hash }}><div data-testid="hashContent">Hash OK</div></PasswordGate2>);
  await screen.findByTestId('hashContent');
  });
});
