import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { RouteConfigEntry } from '@react-router/dev/routes'
import routes from '../app/routes.ts'

const registry = JSON.parse(readFileSync(new URL('../deploy/surfaces.json', import.meta.url), 'utf8'))
const ignoredPaths = ['/dashboard/sign-out', '/staff/sign-out', '/ops/sign-out']

test('surface registry satisfies the deployment contract', () => {
  assert.equal(registry.app, 'inview')
  assert.equal(registry.baseUrl, 'https://inview.moshes.io')
  const groups = new Set<string>()
  for (const group of registry.groups) {
    assert.ok(!groups.has(group.id), `Duplicate group: ${group.id}`)
    groups.add(group.id)
    assert.ok(group.label && group.labelFa)
  }
  const ids = new Set<string>()
  const usedGroups = new Set<string>()
  for (const surface of registry.surfaces) {
    assert.match(surface.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(!ids.has(surface.id), `Duplicate surface: ${surface.id}`)
    ids.add(surface.id)
    assert.ok(groups.has(surface.group), `Unknown group: ${surface.group}`)
    usedGroups.add(surface.group)
    assert.ok(surface.label && surface.labelFa)
    const hasPath = Object.hasOwn(surface, 'path')
    const hasUrl = Object.hasOwn(surface, 'url')
    assert.notEqual(hasPath, hasUrl, surface.id)
    if (hasPath) {
      assert.equal(typeof surface.path, 'string')
      assert.ok(surface.path.startsWith('/') && !surface.path.startsWith('//'), surface.id)
      assert.equal(new URL(surface.path, registry.baseUrl).origin, registry.baseUrl)
    }
    if (hasUrl) assert.equal(new URL(surface.url).protocol, 'https:')
    assert.ok(['public', 'staff', 'operator', 'internal'].includes(surface.access), surface.id)
    assert.equal(typeof surface.screenshot, 'boolean')
    if (surface.screenshot) {
      assert.equal(surface.access, 'public', surface.id)
      assert.ok(hasPath, surface.id)
    }
  }
  assert.deepEqual([...usedGroups].sort(), [...groups].sort())
})

function staticPaths(entries: RouteConfigEntry[], parent = ''): string[] {
  return entries.flatMap((entry) => {
    const path = [parent, entry.path].filter(Boolean).join('/').replace(/\/+/g, '/')
    if (path.split('/').some((segment) => segment.startsWith(':') || segment === '*')) return []
    const absolute = `/${path}`
    const own = entry.path !== undefined || entry.index ? [absolute] : []
    return [...own, ...staticPaths(entry.children ?? [], path)]
  })
}

test('every static non-API route is registered or explicitly ignored', async () => {
  const paths = new Set(registry.surfaces.map((surface: { path?: string }) => surface.path))
  for (const path of staticPaths(await routes)) {
    if (path === '/api' || path.startsWith('/api/') || ignoredPaths.includes(path)) continue
    assert.ok(paths.has(path), `Missing surface for ${path}`)
  }
})
