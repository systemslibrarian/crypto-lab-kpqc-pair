export const NTRUPLUS_N = 768
export const NTRUPLUS_Q = 3457
export const NTRUPLUS_HALF_N = NTRUPLUS_N / 2
export const NTRUPLUS_RING_LABEL =
  'Z_3457[X] / (X^768 - X^384 + 1)'

function modulo(value: number, modulus: number): number {
  const reduced = value % modulus
  return reduced < 0 ? reduced + modulus : reduced
}

function assertPolynomial(label: string, polynomial: readonly number[]): void {
  if (polynomial.length > NTRUPLUS_N) {
    throw new Error(`${label} has ${polynomial.length} coefficients; maximum is ${NTRUPLUS_N}`)
  }
  if (!polynomial.every(Number.isSafeInteger)) {
    throw new Error(`${label} coefficients must be safe integers`)
  }
}

export function multiplyNtruplusRing(
  left: readonly number[],
  right: readonly number[],
): number[] {
  assertPolynomial('Left polynomial', left)
  assertPolynomial('Right polynomial', right)

  const product = Array.from(
    { length: Math.max(1, left.length + right.length - 1) },
    () => 0,
  )

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftCoefficient = left[leftIndex]!
    if (leftCoefficient === 0) continue

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightCoefficient = right[rightIndex]!
      if (rightCoefficient === 0) continue
      product[leftIndex + rightIndex]! += leftCoefficient * rightCoefficient
    }
  }

  for (let degree = product.length - 1; degree >= NTRUPLUS_N; degree -= 1) {
    const coefficient = product[degree]!
    if (coefficient === 0) continue

    product[degree - NTRUPLUS_HALF_N]! += coefficient
    product[degree - NTRUPLUS_N]! -= coefficient
  }

  return Array.from({ length: NTRUPLUS_N }, (_, index) =>
    modulo(product[index] ?? 0, NTRUPLUS_Q),
  )
}

export interface PolynomialTerm {
  degree: number
  coefficient: number
}

export function nonzeroTerms(polynomial: readonly number[]): PolynomialTerm[] {
  return polynomial.flatMap((coefficient, degree) =>
    coefficient === 0 ? [] : [{ coefficient, degree }],
  )
}

export function polynomialFromTerms(terms: readonly PolynomialTerm[]): number[] {
  const polynomial = Array.from({ length: NTRUPLUS_N }, () => 0)
  for (const { coefficient, degree } of terms) {
    if (!Number.isInteger(degree) || degree < 0 || degree >= NTRUPLUS_N) {
      throw new RangeError(`Degree ${degree} is outside the NTRU+768 ring`)
    }
    if (!Number.isSafeInteger(coefficient)) {
      throw new Error(`Coefficient at degree ${degree} must be a safe integer`)
    }
    polynomial[degree] = modulo(polynomial[degree]! + coefficient, NTRUPLUS_Q)
  }
  return polynomial
}