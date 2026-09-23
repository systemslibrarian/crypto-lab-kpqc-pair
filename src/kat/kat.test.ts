import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  AIMER_128F_KAT,
  KAT_SEED_HEX,
  NTRUPLUS_768_KAT,
} from './fixtures'

interface KatWasmModule {
  HEAPU8: Uint8Array
  _malloc(size: number): number
  _free(pointer: number): void
  _randombytes_init(entropy: number, personalization: number, strength: number): void
  getValue(pointer: number, type: 'i32'): number
  [name: string]: unknown
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function exportedFunction(
  module: KatWasmModule,
  name: string,
): (...arguments_: number[]) => number {
  const exported = module[name]
  if (typeof exported !== 'function') throw new Error(`Missing WASM export ${name}`)
  return exported as (...arguments_: number[]) => number
}

async function loadKatModule(
  packageEntry: string,
  wasmFilename: string,
): Promise<KatWasmModule> {
  const entryUrl = import.meta.resolve(packageEntry)
  const wasmUrl = new URL(`../wasm/${wasmFilename}`, entryUrl)
  const imported = (await import(wasmUrl.href)) as {
    default: () => Promise<KatWasmModule>
  }
  return imported.default()
}

type PointerTuple<Sizes extends readonly number[]> = {
  [Index in keyof Sizes]: number
}

function allocate<const Sizes extends readonly number[]>(
  module: KatWasmModule,
  sizes: Sizes,
): PointerTuple<Sizes> {
  return sizes.map((size) => module._malloc(Math.max(1, size))) as PointerTuple<Sizes>
}

describe('official KpqC KAT record 0', () => {
  it('reproduces AIMer-128f key and signed-message bytes', async () => {
    const module = await loadKatModule('@killd21/kpqc/aimer', 'aimer.mjs')
    const seed = hexToBytes(KAT_SEED_HEX)
    const message = hexToBytes(AIMER_128F_KAT.messageHex)
    const [seedPointer, publicKeyPointer, secretKeyPointer, messagePointer, signedPointer, lengthPointer] =
      allocate(module, [48, 32, 48, message.length, AIMER_128F_KAT.signedMessageBytes, 4])

    try {
      module.HEAPU8.set(seed, seedPointer)
      module._randombytes_init(seedPointer, 0, 256)
      expect(
        exportedFunction(
          module,
          '_samsungsds_aimer_128f_ref_crypto_sign_keypair',
        )(publicKeyPointer, secretKeyPointer),
      ).toBe(0)

      module.HEAPU8.set(message, messagePointer)
      expect(
        exportedFunction(
          module,
          '_samsungsds_aimer_128f_ref_crypto_sign',
        )(
          signedPointer,
          lengthPointer,
          messagePointer,
          message.length,
          0,
          0,
          secretKeyPointer,
        ),
      ).toBe(0)

      const signedLength = module.getValue(lengthPointer, 'i32')
      expect(signedLength).toBe(AIMER_128F_KAT.signedMessageBytes)
      expect(digest(module.HEAPU8.slice(publicKeyPointer, publicKeyPointer + 32))).toBe(
        AIMER_128F_KAT.sha256.publicKey,
      )
      expect(digest(module.HEAPU8.slice(secretKeyPointer, secretKeyPointer + 48))).toBe(
        AIMER_128F_KAT.sha256.secretKey,
      )
      expect(digest(module.HEAPU8.slice(signedPointer, signedPointer + signedLength))).toBe(
        AIMER_128F_KAT.sha256.signedMessage,
      )
    } finally {
      for (const pointer of [
        seedPointer,
        publicKeyPointer,
        secretKeyPointer,
        messagePointer,
        signedPointer,
        lengthPointer,
      ]) {
        module._free(pointer)
      }
    }
  })

  it('reproduces NTRU+768 key, ciphertext, and shared-secret bytes', async () => {
    const module = await loadKatModule('@killd21/kpqc/ntruplus', 'ntruplus.mjs')
    const seed = hexToBytes(KAT_SEED_HEX)
    const [seedPointer, publicKeyPointer, secretKeyPointer, ciphertextPointer, secretPointer] =
      allocate(module, [48, 1152, 2336, 1152, 32])

    try {
      module.HEAPU8.set(seed, seedPointer)
      module._randombytes_init(seedPointer, 0, 256)
      expect(
        exportedFunction(module, '_ntruplus768_crypto_kem_keypair')(
          publicKeyPointer,
          secretKeyPointer,
        ),
      ).toBe(0)
      expect(
        exportedFunction(module, '_ntruplus768_crypto_kem_enc')(
          ciphertextPointer,
          secretPointer,
          publicKeyPointer,
        ),
      ).toBe(0)

      expect(digest(module.HEAPU8.slice(publicKeyPointer, publicKeyPointer + 1152))).toBe(
        NTRUPLUS_768_KAT.sha256.publicKey,
      )
      expect(digest(module.HEAPU8.slice(secretKeyPointer, secretKeyPointer + 2336))).toBe(
        NTRUPLUS_768_KAT.sha256.secretKey,
      )
      expect(digest(module.HEAPU8.slice(ciphertextPointer, ciphertextPointer + 1152))).toBe(
        NTRUPLUS_768_KAT.sha256.ciphertext,
      )
      expect(digest(module.HEAPU8.slice(secretPointer, secretPointer + 32))).toBe(
        NTRUPLUS_768_KAT.sha256.sharedSecret,
      )
    } finally {
      for (const pointer of [
        seedPointer,
        publicKeyPointer,
        secretKeyPointer,
        ciphertextPointer,
        secretPointer,
      ]) {
        module._free(pointer)
      }
    }
  })
})