import { aimer128f } from '@killd21/kpqc/aimer'

export const AIMER_PARAMETER_SET = 'AIMer-128f'

export interface AimerRun {
  publicKey: Uint8Array
  secretKey: Uint8Array
  signature: Uint8Array
  verified: boolean
}

export async function signWithAimer(message: Uint8Array): Promise<AimerRun> {
  const { publicKey, secretKey } = await aimer128f.keygen()
  const signature = await aimer128f.sign(message, secretKey)
  const verified = await aimer128f.verify(message, signature, publicKey)

  return { publicKey, secretKey, signature, verified }
}

export async function verifyAimer(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    return await aimer128f.verify(message, signature, publicKey)
  } catch {
    return false
  }
}