import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const allowed = [
  /\.test\.[cm]?[jt]sx?$/,
  /^app\/data\/.+-seed\.json$/,
  /^app\/lib\/galleries\.ts$/,
  /^app\/routes\.ts$/,
  /^app\/routes\/dashboard\.o-gallery(?:\..+)?\.tsx?$/,
  /^server\/gallery-bootstrap\.ts$/,
]

async function scan(directory) {
  const hits = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'e2e') hits.push(...await scan(file))
    } else if (entry.isFile() && !allowed.some((pattern) => pattern.test(file))) {
      const lines = (await readFile(file, 'utf8')).split('\n')
      for (const [index, line] of lines.entries()) {
        if (/o-gallery|ensureOGalleryTenant/.test(line)) hits.push(`${file}:${index + 1}:${line.trim()}`)
      }
    }
  }
  return hits
}

const hits = (await Promise.all(['app', 'server'].map(scan))).flat()
if (hits.length) {
  console.error(hits.join('\n'))
  process.exitCode = 1
} else {
  console.log('Tenant literal check passed.')
}
