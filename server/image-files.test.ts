import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*'(\.[^']+)'/g

function runtimeModules(entry: string): string[] {
  const found = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift() as string
    if (found.has(file)) continue
    found.add(file)
    const source = readFileSync(join(root, file), 'utf8')
    for (const [, spec] of source.matchAll(RELATIVE_IMPORT)) {
      queue.push(normalize(join(dirname(file), spec)))
    }
  }
  return [...found]
}

function imageSources(): RegExp[] {
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
  // Only the last stage builds the image that ha3 runs.
  const stage = dockerfile.split(/^FROM .*$/m).pop() ?? ''
  return stage
    .split('\n')
    .filter((line) => line.startsWith('COPY ') && !line.includes('--from'))
    .flatMap((line) => line.slice('COPY '.length).trim().split(/\s+/).slice(0, -1))
    .map(
      (source) =>
        new RegExp(`^${source.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}(/|$)`),
    )
}

test('the image carries every module that server.js imports', () => {
  const sources = imageSources()
  for (const file of runtimeModules('server.js')) {
    assert.ok(
      sources.some((source) => source.test(file)),
      `${file} runs in production but no COPY in the Dockerfile puts it in the image`,
    )
  }
})
