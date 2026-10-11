import type { ConnectionEnd, OpticalConnection } from './opticalConnections'

function End({ end }: { end: ConnectionEnd | null }) {
  return <div className={`connection-end${end ? '' : ' unconnected'}`}>
    {end?.color && <i style={{ backgroundColor: end.color }} aria-label={`Barva vlákna ${end.color}`} />}
    <strong>{end?.label ?? 'Nezapojeno'}</strong>
    {end?.fiber !== undefined && <span>Tuba {end.tube} · vlákno {end.fiber}</span>}
    {end?.allocation && <small>{end.allocation}</small>}
    {end?.incomplete && <small>Údaje konce nebyly nalezeny</small>}
  </div>
}
export function ConnectionDiagram({ connections }: { connections: OpticalConnection[] }) {
  return connections.length ? <div className="connection-diagram" aria-label="Jednotlivá propojení vláken">
    {connections.map(c => <div key={c.id} className="connection-row"><End end={c.left} />
      <div className="connection-kind"><span aria-hidden="true">{c.left && c.right ? '↔' : '—'}</span>{c.kind}</div><End end={c.right} /></div>)}
  </div> : <p className="network-export-empty">Ve spojce zatím nejsou evidované spoje ani splittery.</p>
}
