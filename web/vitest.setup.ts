import { expect } from 'vitest'
import { toHaveNoViolations } from 'jest-axe'

// jest-axe exports an object shaped for expect.extend already
// so pass it directly instead of wrapping.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect.extend(toHaveNoViolations as any)
