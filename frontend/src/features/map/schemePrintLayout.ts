import { layoutScheme, type Scheme } from './networkSchematic.ts'

// Keep complete node rows together. Cross-page connections are explicit references,
// never clipped lines or invented connections between neighbouring cards.
export function paginateScheme(scheme: Scheme) {
  const layout = layoutScheme(scheme)
  const rows = new Map<number, string[]>()
  for (const node of scheme.nodes) {
    const pos = layout.positions.get(node.id)!
    rows.set(pos.y, [...(rows.get(pos.y) ?? []), node.id])
  }
  const ordered = [...rows.entries()].sort(([a], [b]) => a - b)
  const pages = []
  for (let i = 0; i < ordered.length; i += 2) {
    const positions = new Map<string, { x: number; y: number }>()
    ordered.slice(i, i + 2).forEach(([, ids], row) => ids.forEach(id => positions.set(id, { x: layout.positions.get(id)!.x, y: 25 + row * 170 })))
    pages.push({ positions, nodes: scheme.nodes.filter(n => positions.has(n.id)) })
  }
  const references = new Map(pages.flatMap((page, index) => page.nodes.map(node => [node.id,
    { page: index + 1, code: `N${String(scheme.nodes.findIndex(n => n.id === node.id) + 1).padStart(3, '0')}` }] as const)))
  return { pages, references, width: Math.max(1010, layout.width) }
}

export function wrapSchemeText(text: string, limit = 36): string[] {
  const lines: string[] = []
  let rest = text.trim()
  while (rest.length > limit) {
    const space = rest.lastIndexOf(' ', limit)
    const end = space > limit / 2 ? space : limit
    lines.push(rest.slice(0, end)); rest = rest.slice(end).trimStart()
  }
  if (rest) lines.push(rest)
  return lines
}
