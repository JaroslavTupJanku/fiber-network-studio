import assert from 'node:assert/strict'
import { tracePremisePath } from '../frontend/src/features/map/traceOpticalPath.ts'

const url = process.env.FNS_DEMO_URL ?? 'http://127.0.0.1:8080'
const load = async path => {
  const response = await fetch(`${url}/api/${path}`)
  assert.ok(response.ok, `${path}: ${response.status}`)
  return response.json()
}
const [mode, points, routes, installations, equipment, distribution, splices, customers, allocations] = await Promise.all(
  ['demo', 'network-points', 'underground-routes', 'route-installations', 'building-equipment',
    'building-distribution', 'optical-splices', 'customers', 'fiber-allocations'].map(load))
assert.equal(mode.enabled, true)
assert.ok(points.length >= 5)
assert.ok(routes.some(route => route.kind === 'aerial') && routes.some(route => route.kind === 'underground'))
assert.ok(customers.length >= 2)
assert.ok(Array.isArray(allocations.allocations))
for (const document of distribution) for (const premise of document.premises.filter(item => item.status === 'connected')) {
  assert.equal(tracePremisePath(premise.id, equipment, routes, installations, splices, distribution).status, 'connected')
}
const guide = await fetch(`${url}/demo.html`)
assert.ok(guide.ok)
assert.match(await guide.text(), /Vyzkoušejte připojení domu/)
console.log('Demo API, guide and all connected premise paths verified.')
