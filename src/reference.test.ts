import { describe, expect, it } from 'vitest'

import {
  AIMER_HEADER_BYTES,
  AIMER_PARTIES,
  AIMER_REPETITION_BYTES,
  AIMER_REPETITIONS,
  evaluateAim2,
  inspectMpcithTranscript,
  repetitionByteOffset,
} from './aimer/aim'
import { signWithAimer, verifyAimer } from './aimer/reference'
import { decapsulateNtruplus, runNtruplus } from './ntruplus/reference'
import { bytesEqual, tamperByte } from './shared/bytes'

const message = new TextEncoder().encode('KpqC Pair reference-engine check')

describe('AIMer-128f reference WASM', () => {
  it('signs, verifies, and rejects a tampered signature', async () => {
    const run = await signWithAimer(message)

    expect(run.publicKey).toHaveLength(32)
    expect(run.secretKey).toHaveLength(48)
    expect(run.signature).toHaveLength(5888)
    expect(run.verified).toBe(true)

    const trace = evaluateAim2(
      run.secretKey.subarray(0, 16),
      run.publicKey.subarray(0, 16),
    )
    expect(bytesEqual(trace.output, run.publicKey.subarray(16, 32))).toBe(true)

    const transcript = inspectMpcithTranscript(run.signature)
    expect(transcript.parties).toBe(AIMER_PARTIES)
    expect(transcript.repetitions).toHaveLength(AIMER_REPETITIONS)
    expect(transcript.repetitionBytes).toBe(AIMER_REPETITION_BYTES)

    // The split accounts for every byte, so no offset can drift unnoticed.
    expect(
      AIMER_HEADER_BYTES + AIMER_REPETITIONS * AIMER_REPETITION_BYTES,
    ).toBe(run.signature.length)
    const reassembled = new Uint8Array(run.signature.length)
    reassembled.set(transcript.salt, 0)
    reassembled.set(transcript.phaseOneCommitment, transcript.salt.length)
    reassembled.set(
      transcript.phaseThreeCommitment,
      transcript.salt.length + transcript.phaseOneCommitment.length,
    )
    transcript.repetitions.forEach((block, index) => {
      expect(block).toHaveLength(AIMER_REPETITION_BYTES)
      reassembled.set(block, repetitionByteOffset(index))
    })
    expect(bytesEqual(reassembled, run.signature)).toBe(true)

    expect(
      await verifyAimer(message, tamperByte(run.signature), run.publicKey),
    ).toBe(false)
  })

  // INV-4 for the transcript view: the per-repetition blocks the pane draws are
  // load-bearing signature material, not decoration. A bit flipped inside any
  // one of them has to make the REAL verifier reject — otherwise the view is
  // slicing at offsets that mean nothing.
  it('rejects a bit flipped inside any per-repetition proof block', async () => {
    const run = await signWithAimer(message)
    expect(run.verified).toBe(true)

    for (const repetition of [0, 1, 16, AIMER_REPETITIONS - 1]) {
      const offset = repetitionByteOffset(repetition)
      expect(offset).toBeGreaterThanOrEqual(AIMER_HEADER_BYTES)
      expect(offset + AIMER_REPETITION_BYTES).toBeLessThanOrEqual(run.signature.length)
      expect(
        await verifyAimer(message, tamperByte(run.signature, offset), run.publicKey),
        `repetition ${repetition} block at byte ${offset} must be load-bearing`,
      ).toBe(false)
    }
  })
})

describe('NTRU+768 reference WASM', () => {
  it('round-trips and rejects a tampered ciphertext', async () => {
    const run = await runNtruplus()

    expect(run.publicKey).toHaveLength(1152)
    expect(run.secretKey).toHaveLength(2336)
    expect(run.ciphertext).toHaveLength(1152)
    expect(run.senderSecret).toHaveLength(32)
    expect(run.matched).toBe(true)

    const rejected = await decapsulateNtruplus(
      tamperByte(run.ciphertext),
      run.secretKey,
    )
    expect(rejected).toEqual({
      accepted: false,
      sharedSecret: null,
      reason: 'malformed-ciphertext',
    })
  })
})