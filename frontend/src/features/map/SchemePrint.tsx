import type { Scheme } from './networkSchematic'
import { paginateScheme, wrapSchemeText } from './schemePrintLayout'

export function SchemePrint({ scheme }: { scheme: Scheme }) {
  const { pages, references, width } = paginateScheme(scheme)
  if (!pages.length) return <p className="network-export-empty">Pro tento pohled nejsou evidované prvky.</p>
  const description = (id: string) => {
    const node = scheme.nodes.find(n => n.id === id), ref = references.get(id)!
    return `${ref.code} · list ${ref.page} · ${node?.label} · ${node?.detail}`
  }
  return <div className="scheme-print-pages">{pages.map((page, index) => {
    const local = scheme.edges.filter(e => page.positions.has(e.from) && page.positions.has(e.to))
    const external = scheme.edges.filter(e => page.positions.has(e.from) !== page.positions.has(e.to))
    return <section className="scheme-print-page" key={index} aria-label={`List schématu ${index + 1}`}>
      <h4>List {index + 1} / {pages.length}</h4>
      <svg viewBox={`0 0 ${width} 350`} role="img" aria-label={`Schéma, list ${index + 1}`}>
        {local.map(edge => {
          const a = page.positions.get(edge.from)!, b = page.positions.get(edge.to)!
          const vertical = a.x === b.x, forward = b.x > a.x
          const x1 = a.x + (vertical ? 125 : forward ? 250 : 0), x2 = b.x + (vertical ? 125 : forward ? 0 : 250)
          const y1 = a.y + (vertical ? b.y > a.y ? 130 : 0 : 65), y2 = b.y + (vertical ? b.y > a.y ? 0 : 130 : 65)
          const d = vertical ? `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
            : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`
          return <path key={edge.id} d={d} className="scheme-print-edge"><title>{edge.label}</title></path>
        })}
        {page.nodes.map(node => {
          const pos = page.positions.get(node.id)!, ref = references.get(node.id)!
          return <g key={node.id} transform={`translate(${pos.x},${pos.y})`}>
            <rect width="250" height="130" rx="10" className="scheme-print-card" />
            <text x="12" y="20" className="scheme-print-ref">{ref.code}</text>
            {wrapSchemeText(node.label, 32).slice(0, 2).map((line, i) => <text key={i} x="12" y={40 + i * 16} className="scheme-print-title">{line}</text>)}
            {wrapSchemeText(node.detail, 39).slice(0, 3).map((line, i) => <text key={i} x="12" y={76 + i * 14} className="scheme-print-detail">{line}</text>)}
            {node.usage && <text x="12" y="121" className={`scheme-print-usage usage-${node.usage.status}`}>{node.usage.status === 'used' ? 'Obsazeno službou' : 'Rezervováno'} · viz seznam</text>}
          </g>
        })}
      </svg>
      <dl className="scheme-print-index">{page.nodes.map(node => <div key={node.id}><dt>{references.get(node.id)?.code}</dt><dd><strong>{node.label}</strong> · {node.detail}
        {node.id.startsWith('fiber:') && <span className={`scheme-print-index-usage usage-${node.usage?.status ?? 'none'}`}>{node.usage ? `${node.usage.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${node.usage.label}` : 'Bez evidované služby'}</span>}</dd></div>)}</dl>
      <table className="network-export-table scheme-print-links"><thead><tr><th>Od</th><th>Propojení / trasa</th><th>Do</th></tr></thead><tbody>
        {[...local, ...external].map(edge => <tr key={edge.id}><td>{description(edge.from)}</td><td>{edge.label}</td><td>{description(edge.to)}</td></tr>)}
      </tbody></table>
      <p className="scheme-print-key">N = označení prvku. Spoj na jiném listu dohledáte podle označení a čísla listu. Úplné názvy jsou v tabulce. Bez evidované služby neznamená ověřeně volné vlákno.</p>
    </section>
  })}</div>
}
