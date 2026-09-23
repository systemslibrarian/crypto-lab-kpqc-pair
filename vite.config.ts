import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/crypto-lab-kpqc-pair/',
  test: {
    include: ['src/**/*.test.ts'],
  },
})