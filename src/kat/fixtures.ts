/**
 * Pinned KpqC known-answer-test vectors, record 0 of each `.rsp` file.
 *
 * `kat.test.ts` does not compare against a transcription of these files. It
 * seeds the reference WASM's own NIST DRBG with `KAT_SEED_HEX`, runs keygen /
 * sign and keygen / encapsulate through the C entry points, and digests the
 * raw output buffers — so a passing run means the shipped WASM reproduces the
 * upstream vector byte for byte, not that two copies of a number agree.
 *
 * The digests below are SHA-256 over the KAT artefacts, recorded rather than
 * derived: nothing in this repo can regenerate them, which is the point. They
 * are the fixture.
 */
export const KAT_SOURCE_COMMIT = '9886cfb59fac204fdf2947bfab5ac4964c7f3fea'

/**
 * The seed `PQCgenKAT_*.c` draws for record 0 after `randombytes_init` is given
 * the standard entropy input 0x00, 0x01, ... 0x2F. It is identical across NIST
 * and KpqC submission packages because it is a property of the shared KAT
 * generator, not of either algorithm — which is why the same 48 bytes seed both
 * the AIMer and the NTRU+ record below.
 */
export const KAT_SEED_HEX =
  '061550234D158C5EC95595FE04EF7A25767F2E24CC2BC479D09D86DC9ABCFDE7056A8C266F9EF97ED08541DBD2E1FFA1'

export const AIMER_128F_KAT = {
  count: 0,
  source: 'vendor/AIMer/KAT/aimer-128f/PQCsignKAT_48.rsp',
  messageHex:
    'D81C4D8D734FCBFBEADE3D3F8A039FAA2A2C9957E835AD55B22E75BF57BB556AC8',
  signedMessageBytes: 5921,
  sha256: {
    publicKey: 'f6b9c5c1f8c2fff98cfb090c745a58a7761fcedd3d6690fb49d322b1fa433905',
    secretKey: '692f73f7285533379856658fc43b9a131e4ae7d743e79e95e1ac62e87b9a0058',
    signedMessage: '6685e3c25ae8590991b7116dd90a84774433e638eab14f45d31f40de3121832d',
  },
} as const

export const NTRUPLUS_768_KAT = {
  count: 0,
  source: 'vendor/NTRUplus/KAT/NTRU+768/PQCkemKAT_2336.rsp',
  sha256: {
    publicKey: 'f8543b8967ddef23d3bf36b923ead9e18305879b653d8eab3d804a9b415ee3d1',
    secretKey: 'a53c35eefbf6e217d414bbeadd9e914b32c36b7ec5f2e88b883cca9d699b0af8',
    ciphertext: 'b63d68b34ac6576b3d13105584a75ac5259b3ba8d7be3c30f4c162728f1f5722',
    sharedSecret: 'fded88362c48e68a2d19e48577f30985d18c71086ebce137c5fc56b136c1a982',
  },
} as const