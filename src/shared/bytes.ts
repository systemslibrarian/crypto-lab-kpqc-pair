export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!
  }

  return difference === 0
}

export function tamperByte(input: Uint8Array, index = 0): Uint8Array {
  if (input.length === 0) throw new Error('Cannot tamper with an empty byte array')
  if (!Number.isInteger(index) || index < 0 || index >= input.length) {
    throw new RangeError(`Byte index ${index} is outside a ${input.length}-byte value`)
  }

  const tampered = input.slice()
  tampered[index] = tampered[index]! ^ 0x01
  return tampered
}

export function toHex(input: Uint8Array, visibleBytes = input.length): string {
  const shown = input.subarray(0, Math.max(0, visibleBytes))
  const hex = Array.from(shown, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return shown.length < input.length ? `${hex}…` : hex
}