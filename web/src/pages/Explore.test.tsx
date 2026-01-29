import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
// Vitest provides global describe/it/expect; no explicit import needed.
import Explore from './Explore';
import { PRESERVED_INTRO_QUESTIONS, PUBLIC_CONVENE_LABEL } from '../config/conveneQuestions';

// Minimal test to assert scaffold renders expected headings and list items.

describe('Explore route scaffold', () => {
  it('renders primary heading and preserved questions', () => {
    render(
      <MemoryRouter initialEntries={['/explore']}>
        <Routes>
          <Route path="/explore" element={<Explore />} />
        </Routes>
      </MemoryRouter>
    );

    // h1 heading
    const h1 = screen.getByRole('heading', { level: 1, name: PUBLIC_CONVENE_LABEL });
  expect(h1).not.toBeNull();

    // preserved questions section heading
    const preservedHeading = screen.getByRole('heading', { level: 2, name: /preserved inception questions/i });
  expect(preservedHeading).not.toBeNull();

    // list items count
    const items = screen.getAllByRole('listitem');
    // Ensure at least as many items as preserved questions (future expansions won't break the test)
    expect(items.length).toBeGreaterThanOrEqual(PRESERVED_INTRO_QUESTIONS.length);
  });
});
