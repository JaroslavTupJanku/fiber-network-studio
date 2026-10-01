import { kindLabel, type DuctInput } from './model'

export function DuctDiagram({ item }: { item: DuctInput }) {
  const ratio = item.outerDiameterMm && item.innerDiameterMm ? Math.max(.15, Math.min(.9, item.innerDiameterMm / item.outerDiameterMm)) : .64
  const description = item.kind === 'conduit'
    ? 'Ochranná trubka pro kabel nebo další menší trubičky.'
    : item.kind === 'microduct'
      ? 'Menší kanálek pro zafukovaný optický kabel nebo vlákna.'
      : 'Více samostatných průchodů v jednom uspořádání.'
  return <div className={`dc-diagram dc-diagram-${item.kind}`}>
    <span className="dc-diagram-title">Schematický průřez</span>
    <div className="dc-diagram-visual" role="img" aria-label={item.kind === 'assembly'
      ? `Schematický průřez: ${item.rows} řad, ${item.columns} sloupců, ${item.slots.length} pozic`
      : `Schematický kruhový průřez: ${kindLabel(item.kind)}`}>
      {item.kind === 'assembly' ? <div className="dc-diagram-grid" style={{ gridTemplateColumns: `repeat(${item.columns}, minmax(0, 1fr))` }}>
        {item.slots.map((slot, index) => <div className="dc-slot" key={index} title={`${slot.name}: ${kindLabel(slot.kind)}`}>
          <span className="dc-ring" style={{ '--ring': slot.color,
            '--inner': slot.outerDiameterMm && slot.innerDiameterMm ? `${Math.max(18, Math.min(82, slot.innerDiameterMm / slot.outerDiameterMm * 100))}%` : '64%',
          } as React.CSSProperties} /><small>{index + 1}</small></div>)}
      </div> : <span className="dc-ring dc-ring-large" style={{ '--ring': item.color, '--inner': `${ratio * 100}%` } as React.CSSProperties} />}
    </div>
    <div className="dc-diagram-explanation"><strong>{kindLabel(item.kind)}</strong><span>{description}</span>
      {item.kind !== 'assembly' && <div className="dc-diagram-key"><span><i style={{ background: item.color }} /> Stěna</span><span><i className="dc-diagram-void" /> Volný průchod</span></div>}
      <small>Ilustrační velikost · {item.outerDiameterMm === null || item.kind === 'assembly' ? 'průměry nejsou v měřítku' : 'poměr vnitřního a vnějšího průměru podle údajů výše'}</small></div>
  </div>
}
