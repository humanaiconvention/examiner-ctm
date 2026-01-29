import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ChunkLoadBoundary from './ChunkLoadBoundary';

// Helper: lazy component that resolves next tick
const LazyComponent = React.lazy(async () => {
  return new Promise<{ default: React.FC }>(resolve => {
    setTimeout(() => resolve({ default: () => <div data-testid="lazy-content">Loaded content</div> }), 0);
  });
});

describe('ChunkLoadBoundary', () => {
  it('renders fallback with default label and then content', async () => {
    render(
      <ChunkLoadBoundary>
        <LazyComponent />
      </ChunkLoadBoundary>
    );

    const fallback = screen.getByRole('status', { name: /loading module/i });
    expect(fallback).not.toBeNull();

    const content = await screen.findByTestId('lazy-content');
    expect(content).not.toBeNull();
  });

  it('supports custom label override', async () => {
    // Slower lazy module to keep fallback visible briefly
    const SlowLazy = React.lazy(async () => {
      return new Promise<{ default: React.FC }>(resolve => {
        setTimeout(() => resolve({ default: () => <div data-testid="lazy-content">Late content</div> }), 40);
      });
    });
    render(
      <ChunkLoadBoundary label="Loading page">
        <SlowLazy />
      </ChunkLoadBoundary>
    );
    const fallback = await screen.findByRole('status', { name: /loading page/i });
    expect(fallback).not.toBeNull();
    const content = await screen.findByTestId('lazy-content');
    expect(content).not.toBeNull();
  });
});
