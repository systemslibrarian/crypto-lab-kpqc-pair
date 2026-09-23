import { shake128 } from '@noble/hashes/sha3.js'

const FIELD_BITS = 128
const FIELD_BYTES = FIELD_BITS / 8
const FIELD_MASK = (1n << 128n) - 1n
const REDUCTION_TAIL = 0x87n
const INPUT_SBOXES = 2

const AIM2_CONSTANTS = [
  0x243f6a8885a308d313198a2e03707344n,
  0xa4093822299f31d0082efa98ec4e6c89n,
] as const

const AIM2_SBOX_EXPONENTS = [
  0xb6b6d6d6dadb5b5b6b6b6d6dadadb5b5n,
  0xb6db5b6dadb6dadb6d6db6d6db6b6db5n,
] as const

const OUTER_SBOX_EXPONENT = 7n
const MATRIX_ROWS = INPUT_SBOXES * FIELD_BITS
const AFFINE_STREAM_BYTES = (MATRIX_ROWS + 1) * FIELD_BYTES

export const AIMER_PARTIES = 16
export const AIMER_REPETITIONS = 33
export const AIMER_SIGNATURE_BYTES = 5888

export const AIMER_SALT_BYTES = 16
export const AIMER_COMMITMENT_BYTES = 32
export const AIMER_HEADER_BYTES = AIMER_SALT_BYTES + 2 * AIMER_COMMITMENT_BYTES
export const AIMER_REPETITION_BYTES =
  (AIMER_SIGNATURE_BYTES - AIMER_HEADER_BYTES) / AIMER_REPETITIONS

export interface AimTrace {
  input: Uint8Array
  iv: Uint8Array
  constantAdded: [Uint8Array, Uint8Array]
  sboxOutputs: [Uint8Array, Uint8Array]
  affineOutputs: [Uint8Array, Uint8Array]
  affineVector: Uint8Array
  combined: Uint8Array
  outerSbox: Uint8Array
  output: Uint8Array
}

export interface MpcithTranscript {
  salt: Uint8Array
  phaseOneCommitment: Uint8Array
  phaseThreeCommitment: Uint8Array
  /** The τ equal-width per-repetition proof blocks, in signature order. */
  repetitions: Uint8Array[]
  repetitionBytes: number
  parties: number
}

function assertLength(label: string, value: Uint8Array, expected: number): void {
  if (value.length !== expected) {
    throw new Error(`${label} must be ${expected} bytes; received ${value.length}`)
  }
}

function fromLittleEndian(bytes: Uint8Array): bigint {
  let value = 0n
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]!)
  }
  return value
}

function toLittleEndian(value: bigint): Uint8Array {
  const output = new Uint8Array(FIELD_BYTES)
  let remaining = value & FIELD_MASK
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return output
}

function multiply(left: bigint, right: bigint): bigint {
  let result = 0n
  let multiplicand = left & FIELD_MASK
  let multiplier = right & FIELD_MASK

  for (let bit = 0; bit < FIELD_BITS; bit += 1) {
    if ((multiplier & 1n) !== 0n) result ^= multiplicand
    multiplier >>= 1n

    const overflowed = (multiplicand & (1n << 127n)) !== 0n
    multiplicand = (multiplicand << 1n) & FIELD_MASK
    if (overflowed) multiplicand ^= REDUCTION_TAIL
  }

  return result
}

function exponentiate(value: bigint, exponent: bigint): bigint {
  let result = 1n
  let base = value & FIELD_MASK
  let remaining = exponent

  while (remaining > 0n) {
    if ((remaining & 1n) !== 0n) result = multiply(result, base)
    remaining >>= 1n
    if (remaining > 0n) base = multiply(base, base)
  }

  return result
}

function multiplyMatrix(vector: bigint, rows: readonly bigint[]): bigint {
  let result = 0n
  let bits = vector
  for (let row = 0; row < FIELD_BITS; row += 1) {
    if ((bits & 1n) !== 0n) result ^= rows[row]!
    bits >>= 1n
  }
  return result
}

interface AffineLayer {
  lower: [bigint[], bigint[]]
  upper: [bigint[], bigint[]]
  vector: bigint
}

function generateAffineLayer(iv: Uint8Array): AffineLayer {
  const stream = shake128(iv, { dkLen: AFFINE_STREAM_BYTES })
  const lower: [bigint[], bigint[]] = [[], []]
  const upper: [bigint[], bigint[]] = [[], []]
  let offset = 0

  for (let layer = 0; layer < INPUT_SBOXES; layer += 1) {
    const lowerRows = lower[layer]!
    const upperRows = upper[layer]!
    for (let row = 0; row < FIELD_BITS; row += 1) {
      const randomRow = fromLittleEndian(stream.subarray(offset, offset + FIELD_BYTES))
      offset += FIELD_BYTES

      const diagonal = 1n << BigInt(row)
      const belowDiagonal = diagonal - 1n
      const throughDiagonal = (diagonal << 1n) - 1n
      lowerRows.push((randomRow & (FIELD_MASK ^ belowDiagonal)) | diagonal)
      upperRows.push((randomRow & throughDiagonal) | diagonal)
    }
  }

  return {
    lower,
    upper,
    vector: fromLittleEndian(stream.subarray(offset, offset + FIELD_BYTES)),
  }
}

export function evaluateAim2(input: Uint8Array, iv: Uint8Array): AimTrace {
  assertLength('AIM2 input', input, FIELD_BYTES)
  assertLength('AIM2 IV', iv, FIELD_BYTES)

  const inputField = fromLittleEndian(input)
  const affine = generateAffineLayer(iv)
  const constantFields = AIM2_CONSTANTS.map((constant) => inputField ^ constant) as [
    bigint,
    bigint,
  ]
  const sboxFields = constantFields.map((state, index) =>
    exponentiate(state, AIM2_SBOX_EXPONENTS[index]!),
  ) as [bigint, bigint]
  const affineFields: [bigint, bigint] = [
    multiplyMatrix(multiplyMatrix(sboxFields[0], affine.upper[0]), affine.lower[0]),
    multiplyMatrix(multiplyMatrix(sboxFields[1], affine.upper[1]), affine.lower[1]),
  ]
  const combined = affineFields[0] ^ affineFields[1] ^ affine.vector
  const outerSbox = exponentiate(combined, OUTER_SBOX_EXPONENT)
  const output = outerSbox ^ inputField

  return {
    input: input.slice(),
    iv: iv.slice(),
    constantAdded: constantFields.map(toLittleEndian) as [Uint8Array, Uint8Array],
    sboxOutputs: sboxFields.map(toLittleEndian) as [Uint8Array, Uint8Array],
    affineOutputs: affineFields.map(toLittleEndian) as [Uint8Array, Uint8Array],
    affineVector: toLittleEndian(affine.vector),
    combined: toLittleEndian(combined),
    outerSbox: toLittleEndian(outerSbox),
    output: toLittleEndian(output),
  }
}

/**
 * Split a real AIMer-128f signature into its salt, its two commitment hashes,
 * and one proof block per MPC repetition.
 *
 * The split is arithmetic, not guesswork: a 16-byte salt and two 32-byte
 * commitments leave 5808 bytes, and 5808 / 33 repetitions is exactly 176 bytes
 * each. `AIMER_REPETITION_BYTES` computes that rather than hard-coding it, so a
 * wrong constant anywhere in this file produces a non-integer stride and the
 * assertion below throws instead of silently slicing at the wrong offsets.
 *
 * What this DOES NOT do is decode which party is hidden in each repetition.
 * That index comes from the verifier's Fiat-Shamir expansion of the phase-three
 * commitment, and the reference package ships only WASM binaries — no source to
 * confirm the expansion against. Rather than print a plausible-looking index
 * this lab cannot stand behind, the view reports the structure it can prove and
 * says plainly that the hidden index is not decoded here. `reference.test.ts`
 * measures that every block is load-bearing by flipping a bit inside one and
 * watching the real verifier reject.
 */
export function inspectMpcithTranscript(signature: Uint8Array): MpcithTranscript {
  assertLength('AIMer-128f signature', signature, AIMER_SIGNATURE_BYTES)

  if (!Number.isInteger(AIMER_REPETITION_BYTES)) {
    throw new Error(
      `AIMer-128f layout does not divide: ${AIMER_SIGNATURE_BYTES} bytes minus a ` +
        `${AIMER_HEADER_BYTES}-byte header is not a multiple of ${AIMER_REPETITIONS}`,
    )
  }

  return {
    salt: signature.slice(0, AIMER_SALT_BYTES),
    phaseOneCommitment: signature.slice(
      AIMER_SALT_BYTES,
      AIMER_SALT_BYTES + AIMER_COMMITMENT_BYTES,
    ),
    phaseThreeCommitment: signature.slice(
      AIMER_SALT_BYTES + AIMER_COMMITMENT_BYTES,
      AIMER_HEADER_BYTES,
    ),
    repetitions: Array.from({ length: AIMER_REPETITIONS }, (_, index) =>
      signature.slice(
        AIMER_HEADER_BYTES + index * AIMER_REPETITION_BYTES,
        AIMER_HEADER_BYTES + (index + 1) * AIMER_REPETITION_BYTES,
      ),
    ),
    repetitionBytes: AIMER_REPETITION_BYTES,
    parties: AIMER_PARTIES,
  }
}

/**
 * The byte offset of a given repetition's proof block, for tamper targeting.
 */
export function repetitionByteOffset(repetition: number): number {
  if (!Number.isInteger(repetition) || repetition < 0 || repetition >= AIMER_REPETITIONS) {
    throw new RangeError(`Repetition ${repetition} is outside 0..${AIMER_REPETITIONS - 1}`)
  }
  return AIMER_HEADER_BYTES + repetition * AIMER_REPETITION_BYTES
}