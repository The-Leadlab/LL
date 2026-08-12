import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from './apiError'

describe('getApiErrorMessage', () => {
  it('extracts msg from FastAPI validation detail array (React #31 source)', () => {
    const error = {
      response: {
        data: {
          detail: [
            {
              type: 'missing',
              loc: ['body', 'new_password'],
              msg: 'Field required',
              input: { token: 'x', password: 'y' },
            },
          ],
        },
      },
    }
    expect(getApiErrorMessage(error)).toBe('Field required')
  })

  it('handles string detail', () => {
    const error = { response: { data: { detail: 'Invalid or expired reset token' } } }
    expect(getApiErrorMessage(error)).toBe('Invalid or expired reset token')
  })

  it('falls back safely', () => {
    expect(getApiErrorMessage({}, 'Failed to reset password')).toBe('Failed to reset password')
  })
})
