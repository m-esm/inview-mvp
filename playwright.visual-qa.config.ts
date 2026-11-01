import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'visual-qa',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'visual-qa-report/diffs',
  snapshotPathTemplate: 'visual-qa/baselines/{arg}{ext}',
  use: {
    baseURL: process.env.QA_BASE_URL || 'https://inview.moshes.io',
  },
})
