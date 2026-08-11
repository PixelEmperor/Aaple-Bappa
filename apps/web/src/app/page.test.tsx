import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Home from './page'

describe('Home', () => {
  it('renders a clear notice when Supabase is not configured', async () => {
    // Outside a real Next.js request (as in this test environment), cookies()
    // throws before Supabase credentials even come into it — either way, no
    // live Supabase project is reachable here, so this exercises the same
    // fallback path Milestone 1 leaves us in today.
    const jsx = await Home()
    render(jsx)
    expect(
      screen.getByRole('heading', { name: /directory not available yet/i })
    ).toBeInTheDocument()
  })
})
