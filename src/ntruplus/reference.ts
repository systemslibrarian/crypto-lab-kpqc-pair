import { ntruplus768 } from '@killd21/kpqc/ntruplus'

import { bytesEqual } from '../shared/bytes'

export const NTRUPLUS_PARAMETER_SET = 'NTRU+768'

export interface NtruplusRun {
  publicKey: Uint8Array
  secretKey: Uint8Array
  ciphertext: Uint8Array
  senderSecret: Uint8Array
  recipientSecret: Uint8Array
  matched: boolean
}

export interface DecapsulationResult {
  accepted: boolean
  sharedSecret: Uint8Array | null
  reason: 'accepted' | 'malformed-ciphertext'
}

export async function runNtruplus(): Promise<NtruplusRun> {
  const { publicKey, secretKey } = await ntruplus768.keygen()
  const { ciphertext, sharedSecret: senderSecret } =
    await ntruplus768.encapsulate(publicKey)
  const recipientSecret = await ntruplus768.decapsulate(ciphertext, secretKey)

  return {
    publicKey,
    secretKey,
    ciphertext,
    senderSecret,
    recipientSecret,
    matched: bytesEqual(senderSecret, recipientSecret),
  }
}

export async function decapsulateNtruplus(
  ciphertext: Uint8Array,
  secretKey: Uint8Array,
): Promise<DecapsulationResult> {
  try {
    return {
      accepted: true,
      sharedSecret: await ntruplus768.decapsulate(ciphertext, secretKey),
      reason: 'accepted',
    }
  } catch (error) {
    // The pinned wrapper turns the C decoder's explicit failure (rc=1) into
    // this error. A length error, loading failure, or WASM trap is not evidence
    // that the decoder ran and rejected a ciphertext.
    if (!(error instanceof Error) || error.message !== 'decapsulate failed (rc=1)') {
      throw error
    }
    return {
      accepted: false,
      sharedSecret: null,
      reason: 'malformed-ciphertext',
    }
  }
}
