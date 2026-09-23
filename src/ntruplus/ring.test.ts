import { describe, expect, it } from 'vitest'

import {
  NTRUPLUS_N,
  NTRUPLUS_Q,
  multiplyNtruplusRing,
  nonzeroTerms,
  polynomialFromTerms,
} from './ring'

describe('NTRU+768 ring parameters', () => {
  // Pinned as literals on purpose. The reduction tests below phrase a negative
  // coefficient as `NTRUPLUS_Q - 1`, which is derived from the constant under
  // test and therefore cannot detect a wrong modulus — a mutation from 3457 to
  // 3449 survived the suite until this test existed.
  it('pins the published NTRU+768 parameters', () => {
    expect(NTRUPLUS_N).toBe(768)
    expect(NTRUPLUS_Q).toBe(3457)
  })

  // An independent cross-check against the reference implementation rather than
  // against this file's own constants: a coefficient mod 3457 needs 12 bits, so
  // a packed 768-coefficient polynomial occupies 768 * 12 / 8 = 1152 bytes —
  // exactly the public-key and ciphertext width the KpqC WASM emits and the
  // width `reference.test.ts` asserts against the official KAT.
  it('agrees with the reference implementation key width', () => {
    const bitsPerCoefficient = (NTRUPLUS_Q - 1).toString(2).length
    expect(bitsPerCoefficient).toBe(12)
    expect((NTRUPLUS_N * bitsPerCoefficient) / 8).toBe(1152)
  })
})

describe('NTRU+768 ring multiplication', () => {
  it('reduces X^768 to X^384 - 1', () => {
    const left = polynomialFromTerms([{ coefficient: 1, degree: NTRUPLUS_N - 1 }])
    const right = polynomialFromTerms([{ coefficient: 1, degree: 1 }])

    expect(nonzeroTerms(multiplyNtruplusRing(left, right))).toEqual([
      { coefficient: NTRUPLUS_Q - 1, degree: 0 },
      { coefficient: 1, degree: NTRUPLUS_N / 2 },
    ])
  })

  it('performs repeated reduction for terms above degree 1151', () => {
    const left = polynomialFromTerms([{ coefficient: 1, degree: 700 }])
    const right = polynomialFromTerms([{ coefficient: 1, degree: 500 }])

    expect(nonzeroTerms(multiplyNtruplusRing(left, right))).toEqual([
      { coefficient: NTRUPLUS_Q - 1, degree: 48 },
    ])
  })

  it('rejects polynomials outside the ring dimension', () => {
    expect(() => multiplyNtruplusRing(new Array(NTRUPLUS_N + 1).fill(0), [1])).toThrow(
      /maximum is 768/,
    )
  })
})