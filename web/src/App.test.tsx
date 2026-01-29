import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders new primary tagline heading', async () => {
    render(<App />);
    // Use async findByRole to wait for any effect-driven updates
    expect(await screen.findByRole('heading', { name: /we will know/i })).toBeInTheDocument();
  });
})
