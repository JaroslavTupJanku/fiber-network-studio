import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileSpreadsheet, Printer, RefreshCw, X } from 'lucide-react'
import type { NetworkPoint } from './networkPoints'
import type { OpticalSpliceDocument } from './opticalSplices'
import type { RouteInstallationDocument } from './routeInstallations'
import type { OpticalPath } from './traceOpticalPath'
import { routeKindLabel, type UndergroundRoute } from './undergroundRoutes'
import type { MapSnapshot } from './MapCanvas'
import { downloadMapPng } from './exportMapPng'
import { pathExportRows, routeExportRows, spliceExportRows, toCzechCsv, type ExportRow } from './networkExports'
import './networkExports.css'
import { useOpticalSnapshot } from './useOpticalSnapshot'
import { opticalConnections, connectionExportRows } from './opticalConnections'

type Output = 'map' | 'infrastructure' | 'splices' | 'report'
type Report = 'connections' | 'route' | 'splices' | 'path'

function download(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function TablePreview({ rows }: { rows: ExportRow[] }) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
  return rows.length ? <div className="network-export-table-wrap"><table className="network-export-table">
    <thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>
      {row[column] == null ? '—' : typeof row[column] === 'number' ? (row[column] as number).toLocaleString('cs-CZ') : row[column]}
    </td>)}</tr>)}</tbody>
  </table></div> : <p className="network-export-empty">Pro tento výstup zatím nejsou evidované údaje.</p>
}

function SpliceDiagram({ splice, installations, routes }: { splice: OpticalSpliceDocument;
  installations: RouteInstallationDocument[]; routes: UndergroundRoute[] }) {
  const routeNames = new Map(routes.map(route => [route.id, route.name]))
  const cableNames = new Map(installations.flatMap(document => document.items.filter(item => item.cable)
    .map(item => [item.id, `${item.label} · ${routeNames.get(document.routeId) ?? 'Úsek'}`] as const)))
  const groups = new Map<string, { left: string; right: string; count: number }>()
  for (const connection of splice.connections) {
    const left = cableNames.get(connection.left.itemId) ?? 'Neznámý kabel'
    const right = cableNames.get(connection.right.itemId) ?? 'Neznámý kabel'
    const key = [connection.left.itemId, connection.right.itemId].sort().join(':')
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { left, right, count: 1 })
  }
  return groups.size ? <div className="network-export-splice-diagram" aria-label="Přehled propojených kabelů">
    {[...groups.values()].map((group, index) => <div key={index} className="network-export-splice-link">
      <span>{group.left}</span><strong>↔<small>{group.count} {group.count === 1 ? 'spoj' : group.count < 5 ? 'spoje' : 'spojů'}</small></strong><span>{group.right}</span>
    </div>)}
  </div> : null
}

export function NetworkExportDialog({ onClose, onRefreshMap, snapshot, points, routes, installations: initialInstallations,
  splices: initialSplices, tracedPath, initialRouteId, initialPointId }: {
  onClose: () => void; onRefreshMap: () => void; snapshot: MapSnapshot | null
  points: NetworkPoint[]; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  splices: OpticalSpliceDocument[]; tracedPath: OpticalPath | null
  initialRouteId: string | null; initialPointId: string | null
}) {
  const { snapshot: optical, error: opticalError, retry: retryOptical } = useOpticalSnapshot(true)
  const installations = optical?.installations ?? initialInstallations
  const splices = optical?.splices ?? initialSplices
  const connections = useMemo(() => optical ? opticalConnections(points, routes, optical.installations, optical.equipment,
    optical.splices, optical.distributions, optical.allocations) : [], [points, routes, optical])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [output, setOutput] = useState<Output>('map')
  const [report, setReport] = useState<Report>('connections')
  const [routeId, setRouteId] = useState(initialRouteId ?? routes[0]?.id ?? '')
  const [pointId, setPointId] = useState(initialPointId && splices.some(item => item.pointId === initialPointId)
    ? initialPointId : splices[0]?.pointId ?? '')
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const route = routes.find(item => item.id === routeId)
  const splice = splices.find(item => item.pointId === pointId)
  const names = new Map(points.map(point => [point.id, point.name]))
  const rows = useMemo(() => report === 'connections' ? connectionExportRows(connections) : report === 'route' && route ? routeExportRows(route, points, installations)
    : report === 'splices' && splice ? spliceExportRows(splice, installations, routes)
      : report === 'path' && tracedPath ? pathExportRows(tracedPath) : [],
  [report, route, splice, tracedPath, points, installations, routes, connections])
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const currentName = output === 'map' ? 'Aktuální mapa' : output === 'infrastructure' ? 'Schéma infrastruktury'
    : output === 'splices' ? 'Schéma spojky' : 'Přehled sítě'
  const canPrint = output === 'map' ? !!snapshot && 'image' in snapshot : !!optical && !opticalError
  const exportCsv = () => download(toCzechCsv(rows, columns), `sit-${report}-${new Date().toISOString().slice(0, 10)}.csv`,
    'text/csv;charset=utf-8')
  const exportPng = () => { if (snapshot && 'image' in snapshot) void downloadMapPng(snapshot) }

  return createPortal(<dialog ref={dialogRef} className="network-export-dialog" aria-labelledby="network-export-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="network-export-header"><div><small>Výstupy sítě</small><h2 id="network-export-title">Tisk a export</h2>
      <p>Nejdřív zkontrolujte náhled. Tisk lze v prohlížeči uložit jako PDF.</p></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít výstupy"><X size={20} /></button></header>
    <nav className="network-export-tabs" aria-label="Typ výstupu">
      {([['map', 'Mapa'], ['infrastructure', 'Infrastruktura'], ['splices', 'Spojka'], ['report', 'Tabulka']] as const)
        .map(([id, label]) => <button key={id} type="button" aria-pressed={output === id} onClick={() => setOutput(id)}>{label}</button>)}
    </nav>
    <div className="network-export-body">
      <div className="network-export-options">
        {output === 'map' ? <><strong>Aktuální výřez mapy</strong><p>Výstup zachytí právě zobrazené vrstvy a polohu. Nastavení mapy můžete změnit po zavření tohoto okna.</p>
          <button type="button" className="move-button" onClick={onRefreshMap}><RefreshCw size={15} /> Obnovit snímek</button></>
        : output === 'infrastructure' || output === 'report' && report === 'route' ? <label>Trasa sítě
          <select value={routeId} onChange={event => setRouteId(event.target.value)}>
            {routes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
        : output === 'splices' || output === 'report' && report === 'splices' ? <label>Optická spojka
          <select value={pointId} onChange={event => setPointId(event.target.value)}>
            {splices.map(item => <option key={item.pointId} value={item.pointId}>{item.name || names.get(item.pointId) || 'Spojka'}</option>)}
          </select></label> : null}
        {output === 'report' && <label>Obsah tabulky<select value={report} onChange={event => setReport(event.target.value as Report)}>
          <option value="connections">Propojení celé sítě</option><option value="route">Osazení vybrané trasy</option><option value="splices">Spoje a vlákna</option>
          <option value="path" disabled={!tracedPath}>Sledovaná optická cesta{tracedPath ? '' : ' · nejdřív ji vyhledejte'}</option>
        </select></label>}
        <p className="network-export-note">Podklady vycházejí z evidence v aplikaci. Chybějící údaje zůstávají neznámé; výstup není projektovou dokumentací.</p>
      </div>
      {output !== 'map' && (opticalError ? <div className="panel-error" role="alert">{opticalError}<button type="button" onClick={retryOptical}>Načíst znovu</button></div> : !optical ? <p role="status">Načítám uložené zapojení…</p> : null)}
      <article className="network-export-sheet" aria-label={`Náhled: ${currentName}`}>
        <div className="network-export-sheet-head"><div><small>FIBER NETWORK STUDIO · NÁHLED</small><h3>{currentName}</h3></div>
          <span>{new Date().toLocaleString('cs-CZ')}</span></div>
        {output === 'map' && (snapshot && 'image' in snapshot ? <>
          <div className="network-export-map-frame"><img className="network-export-map-image" src={snapshot.image} alt="Aktuální výřez mapy s objekty a trasami" />
            <div className="network-export-north" aria-label={`Směr severu; natočení mapy ${Math.round(snapshot.bearing)} stupňů`}>
              <b style={{ transform: `rotate(${-snapshot.bearing}deg)` }}>↑</b><span>S</span></div>
            <div className="network-export-scale" style={{ width: `${Math.min(60, 10000 / snapshot.widthCss)}%` }}>
              <i />{Math.round(snapshot.scaleMeters)} m</div></div>
          <div className="network-export-map-meta"><span>Podklad: {snapshot.baseMap}{snapshot.cadastre ? ' + katastr' : ''}</span>
            <span>Střed: {snapshot.center}</span><span>100 px ≈ {Math.round(snapshot.scaleMeters)} m při zobrazené velikosti</span></div>
          <div className="network-export-legend"><strong>Legenda</strong><span><i className="point-key building" /> Budova</span>
            <span><i className="point-key chamber" /> Šachta</span><span><i className="point-key pole" /> Sloup</span><span><i className="route-key empty" /> Neosazená trasa</span><span>Plná: podzemní · přerušovaná: nadzemní</span>
            <span><i className="route-key ducts" /> Chránička</span><span><i className="route-key cables" /> Kabel</span></div>
          <small>Snímek {snapshot.capturedAt} · Podklad: {snapshot.baseMap === 'Uliční mapa' ? 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap' : '© ČÚZK – Ortofoto ČR'}{snapshot.cadastre ? ' · Katastr: ČÚZK' : ''}.
            Měřítko a délky jsou orientační.</small>
        </> : <p className="network-export-empty">{snapshot && 'error' in snapshot ? snapshot.error : 'Připravuji snímek mapy…'}</p>)}
        {output === 'infrastructure' && (route ? <>
          <p className="network-export-diagram-intro">Fyzický úsek mezi evidovanými body. Obsah osazení je uveden v pořadí podle evidence.</p>
          <div className="network-export-route-diagram"><span>{names.get(route.startPointId) ?? 'Neznámý bod'}</span>
            <div><i /><strong>{route.name}</strong><small>{routeKindLabel(route)}</small></div>
            <span>{names.get(route.endPointId) ?? 'Neznámý bod'}</span></div>
          <TablePreview rows={routeExportRows(route, points, installations)} />
        </> : <p className="network-export-empty">Zatím není evidována žádná trasa.</p>)}
        {output === 'splices' && (splice ? <><p className="network-export-diagram-intro">{splice.name} · {names.get(splice.pointId) ?? 'Šachta'}.
          Spojení vláken v evidované optické spojce.</p>
          <SpliceDiagram splice={splice} installations={installations} routes={routes} />
          <TablePreview rows={spliceExportRows(splice, installations, routes)} />
          {splice.splitters.length > 0 && <p>Pasivní splittery: {splice.splitters.map(item => `${item.name} (1:${item.outputCount})`).join(', ')}</p>}
        </> : <p className="network-export-empty">Zatím není evidována žádná optická spojka.</p>)}
        {output === 'report' && <><p className="network-export-diagram-intro">{report === 'connections' ? 'Všechny uzly · svary, ODF, propojky, splittery, přípojná místa a průchozí kabely' : report === 'route' ? route?.name ?? 'Trasa není vybrána'
          : report === 'splices' ? splice?.name ?? 'Spojka není vybrána' : tracedPath?.message ?? 'Cesta není vybrána'}</p>
          <TablePreview rows={rows} /></>}
        <footer className="network-export-sheet-foot">Zdroj: evidence Fiber Network Studio · {new Date().toLocaleDateString('cs-CZ')}</footer>
      </article>
    </div>
    <footer className="network-export-actions"><span>Náhled před exportem</span><div>
      {output === 'map' && <button type="button" className="move-button" disabled={!canPrint} onClick={exportPng}><Download size={16} /> PNG s legendou</button>}
      {output === 'report' && <button type="button" className="move-button" disabled={!optical || !!opticalError || !rows.length} onClick={exportCsv}><FileSpreadsheet size={16} /> CSV</button>}
      <button type="button" className="primary-button" disabled={!canPrint} onClick={() => window.print()}><Printer size={16} /> Tisk / PDF</button>
    </div></footer>
  </dialog>, document.body)
}
