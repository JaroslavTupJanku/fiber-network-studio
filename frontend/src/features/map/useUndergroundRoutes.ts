import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Coordinates, NetworkPoint } from './networkPoints'
import { crossingBuildingFootprints, findBuildingFootprints, routeWithinFootprintCoverage,
  type BuildingFootprint } from './buildingFootprints'
import { deleteUndergroundRoute, listUndergroundRoutes, saveUndergroundRoute,
  routeCoordinates, undoRouteStep, type RouteDraft, type UndergroundRoute } from './undergroundRoutes'

const copyRoute = (route: UndergroundRoute): RouteDraft => ({ ...route,
  waypoints: route.waypoints.map(point => ({ ...point })) })

export function useUndergroundRoutes(points: NetworkPoint[], drawingPaused = false) {
  const [routes, setRoutes] = useState<UndergroundRoute[]>([])
  const [draft, setDraft] = useState<RouteDraft | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [continuationSourceId, setContinuationSourceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkingBuildings, setCheckingBuildings] = useState(false)
  const [crossingResult, setCrossingResult] = useState<{ signature: string, footprints: BuildingFootprint[] } | null>(null)
  const [nearbyResult, setNearbyResult] = useState<{ coordinates: Coordinates[], footprints: BuildingFootprint[] } | null>(null)
  const [nearbyRevision, setNearbyRevision] = useState(0)
  const nearbyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nearbyFetching = useRef(false)
  const nearbyLastRequest = useRef(0)
  const nearbySession = useRef(0)
  const nearbyFailedGeometry = useRef<string | null>(null)
  const latestCoordinates = useRef<Coordinates[]>([])
  const drawingActive = useRef(drawing)
  const checkedGeometry = useRef<string | null>(null)
  const geometryRevision = useRef(0)
  const [reloadVersion, setReloadVersion] = useState(0)
  const insertedWaypoints = useRef<number[]>([])
  const coordinates = useMemo(() => draft ? routeCoordinates(draft, points) : [], [draft, points])
  const geometrySignature = useMemo(() => draft ? JSON.stringify(coordinates) : null, [draft, coordinates])
  useEffect(() => { latestCoordinates.current = coordinates }, [coordinates])
  useEffect(() => { drawingActive.current = drawing }, [drawing])
  const buildingCrossings = useMemo(() => drawing && draft
    ? crossingResult?.signature === geometrySignature ? crossingResult.footprints
      : nearbyResult ? crossingBuildingFootprints(draft, points, nearbyResult.footprints) : []
    : [], [drawing, draft, points, nearbyResult, crossingResult, geometrySignature])

  useEffect(() => {
    if (!drawing || coordinates.length < 2) {
      if (nearbyTimer.current) clearTimeout(nearbyTimer.current)
      nearbyTimer.current = null
      return
    }
    if (nearbyResult && routeWithinFootprintCoverage(coordinates, nearbyResult.coordinates)) {
      if (nearbyTimer.current) clearTimeout(nearbyTimer.current)
      nearbyTimer.current = null
      return
    }
    if (nearbyFetching.current || nearbyTimer.current || nearbyFailedGeometry.current === geometrySignature) return
    const delay = Math.max(0, 700 - (Date.now() - nearbyLastRequest.current))
    nearbyTimer.current = setTimeout(() => {
      nearbyTimer.current = null
      const requested = latestCoordinates.current.map(point => ({ latitude: point.latitude, longitude: point.longitude }))
      if (!drawingActive.current || requested.length < 2) return
      const signature = JSON.stringify(requested)
      const session = nearbySession.current
      nearbyFetching.current = true
      nearbyLastRequest.current = Date.now()
      void findBuildingFootprints(requested, 40).then(footprints => {
        if (session !== nearbySession.current) return
        nearbyFailedGeometry.current = null
        setNearbyResult({ coordinates: requested, footprints })
      }).catch(() => {
        if (session === nearbySession.current) nearbyFailedGeometry.current = signature
      }).finally(() => {
        if (session !== nearbySession.current) return
        nearbyFetching.current = false
        setNearbyRevision(revision => revision + 1)
      })
    }, delay)
  }, [drawing, coordinates, geometrySignature, nearbyResult, nearbyRevision])

  useEffect(() => () => {
    nearbySession.current += 1
    if (nearbyTimer.current) clearTimeout(nearbyTimer.current)
  }, [])

  const resetNearby = () => {
    nearbySession.current += 1
    nearbyFetching.current = false
    nearbyFailedGeometry.current = null
    if (nearbyTimer.current) clearTimeout(nearbyTimer.current)
    nearbyTimer.current = null
    setNearbyResult(null)
  }

  useEffect(() => {
    geometryRevision.current += 1
    checkedGeometry.current = null
  }, [geometrySignature])

  const checkBuildings = async (candidate: RouteDraft, signature: string, revision: number) => {
    if (checkedGeometry.current === signature) return true
    try {
      const footprints = await findBuildingFootprints(routeCoordinates(candidate, points))
      if (geometryRevision.current !== revision) return false
      const crossings = crossingBuildingFootprints(candidate, points, footprints)
      setCrossingResult({ signature, footprints: crossings })
      if (crossings.length) {
        setError(`Trasa prochází ${crossings.length === 1 ? 'půdorysem budovy' : `půdorysy ${crossings.length} budov`}. Upravte její průběh lomovým bodem mimo budovu.`)
        return false
      }
      checkedGeometry.current = signature
      return true
    } catch (reason) {
      if (geometryRevision.current === revision)
        setError(reason instanceof Error ? reason.message : 'Půdorysy budov se nepodařilo ověřit.')
      return false
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    listUndergroundRoutes(controller.signal)
      .then(data => { setRoutes(data); setLoadError(false) })
      .catch((reason: unknown) => {
        if (!(reason instanceof Error && reason.name === 'AbortError')) setLoadError(true)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reloadVersion])

  const cancel = useCallback(() => {
    resetNearby()
    insertedWaypoints.current = []
    setDraft(null)
    setDrawing(false)
    setContinuationSourceId(null)
    setError('')
  }, [])

  const cancelDrawing = useCallback(() => {
    resetNearby()
    insertedWaypoints.current = []
    setDrawing(false)
    setDraft(current => {
      const saved = routes.find(route => route.id === (current?.id ?? continuationSourceId))
      return saved ? copyRoute(saved) : null
    })
    setContinuationSourceId(null)
    setError('')
  }, [routes, continuationSourceId])

  const startDrawing = () => {
    resetNearby()
    insertedWaypoints.current = []
    setDraft({ name: '', startPointId: null, endPointId: null, waypoints: [] })
    setDrawing(true)
    setContinuationSourceId(null)
    setError('')
  }

  const selectRoute = (id: string, edit = false) => {
    resetNearby()
    insertedWaypoints.current = []
    const route = routes.find(item => item.id === id)
    if (!route) return
    setDraft(copyRoute(route))
    setDrawing(edit)
    setContinuationSourceId(null)
    setError('')
  }

  const editRoute = (id: string) => selectRoute(id, true)

  const startEditing = () => {
    if (!draft) return
    insertedWaypoints.current = []
    setDrawing(true)
    setError('')
  }

  const continueFrom = (pointId: string) => {
    if (!draft?.id || drawing || saving || !points.some(point => point.id === pointId)) return false
    const saved = routes.find(route => route.id === draft.id)
    if (!saved || (pointId !== saved.startPointId && pointId !== saved.endPointId)) return false
    if (draft.name !== saved.name || draft.startPointId !== saved.startPointId
      || draft.endPointId !== saved.endPointId
      || JSON.stringify(draft.waypoints) !== JSON.stringify(saved.waypoints)) {
      setError('Nejdřív uložte změny této trasy, potom z ní můžete navázat.')
      return false
    }
    resetNearby()
    insertedWaypoints.current = []
    setDraft({ name: '', startPointId: pointId, endPointId: null, waypoints: [] })
    setDrawing(true)
    setContinuationSourceId(saved.id)
    setError('')
    return true
  }

  const addPoint = (id: string) => {
    if (!drawing) return
    if (draft?.endPointId) {
      setError('Tento úsek už má konec. Dokončete a uložte ho; další úsek pak navážete od vybraného objektu.')
      return
    }
    if (draft?.startPointId === id) {
      setError('Konec trasy musí být jiný objekt než začátek.')
      return
    }
    setDraft(current => {
      if (!current) return current
      if (!current.startPointId) return { ...current, startPointId: id }
      return { ...current, endPointId: id }
    })
    setError('')
  }

  const setEndpoint = (endpoint: 'startPointId' | 'endPointId', id: string | null) => {
    if (!drawing) return
    if (id && !points.some(point => point.id === id)) return
    const other = endpoint === 'startPointId' ? 'endPointId' : 'startPointId'
    if (id && draft?.[other] === id) {
      setError('Začátek a konec musí být různé objekty.')
      return
    }
    insertedWaypoints.current = []
    setDraft(current => current ? { ...current, [endpoint]: id } : current)
    setError('')
  }

  const addWaypoint = (location: Coordinates) => {
    if (!drawing) return
    if (!draft?.startPointId) { setError('Nejdřív klikněte na výchozí budovu nebo šachtu.'); return }
    setDraft(current => current ? { ...current, waypoints: [...current.waypoints, location] } : current)
    setError('')
  }

  const insertWaypoint = (segmentIndex: number, location: Coordinates) => {
    if (!drawing || !draft?.startPointId || !draft.endPointId
      || segmentIndex < 0 || segmentIndex > draft.waypoints.length) return
    insertedWaypoints.current.push(segmentIndex)
    setDraft(current => current && segmentIndex >= 0 && segmentIndex <= current.waypoints.length
      ? { ...current, waypoints: [
        ...current.waypoints.slice(0, segmentIndex), location, ...current.waypoints.slice(segmentIndex),
      ] } : current)
    setError('')
  }

  const moveWaypoint = (index: number, location: Coordinates) => {
    if (!drawing) return
    setDraft(current => current && current.waypoints[index]
      ? { ...current, waypoints: current.waypoints.map((point, position) => position === index ? location : point) }
      : current)
    setError('')
  }

  const removeWaypoint = (index: number) => {
    insertedWaypoints.current = []
    setDraft(current => current
      ? { ...current, waypoints: current.waypoints.filter((_, position) => position !== index) }
      : current)
    setError('')
  }

  const undo = () => {
    const insertedIndex = insertedWaypoints.current.pop()
    setDraft(current => current ? undoRouteStep(current, insertedIndex) : current)
    setError('')
  }

  const resetGeometry = () => {
    resetNearby()
    insertedWaypoints.current = []
    setDraft(current => current
      ? { ...current, startPointId: null, endPointId: null, waypoints: [] }
      : current)
    setError('')
  }

  const finish = async () => {
    if (checkingBuildings) return
    if (!draft?.startPointId || !draft.endPointId || draft.startPointId === draft.endPointId) {
      setError('Vyberte dva různé koncové body sítě.')
      return
    }
    if (!points.some(point => point.id === draft.startPointId)
      || !points.some(point => point.id === draft.endPointId)) {
      setError('Koncový bod již neexistuje.')
      return
    }
    setCheckingBuildings(true)
    setError('')
    const revision = geometryRevision.current
    const signature = JSON.stringify(routeCoordinates(draft, points))
    const clear = await checkBuildings(draft, signature, revision)
    setCheckingBuildings(false)
    if (!clear || geometryRevision.current !== revision) return
    setDrawing(false)
    insertedWaypoints.current = []
    setError('')
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft || drawing || saving || checkingBuildings) return
    if (!draft.name.trim() || !draft.startPointId || !draft.endPointId) {
      setError('Vyplňte název a oba koncové body.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const revision = geometryRevision.current
      const signature = JSON.stringify(routeCoordinates(draft, points))
      if (!await checkBuildings(draft, signature, revision) || geometryRevision.current !== revision) return
      const saved = await saveUndergroundRoute(draft)
      setRoutes(current => draft.id
        ? current.map(route => route.id === saved.id ? saved : route)
        : [...current, saved])
      setDraft(copyRoute(saved))
      setContinuationSourceId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Trasu se nepodařilo uložit.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id || saving || !window.confirm(`Smazat trasu "${draft.name}"?`)) return
    setSaving(true)
    setError('')
    try {
      await deleteUndergroundRoute(draft.id)
      setRoutes(current => current.filter(route => route.id !== draft.id))
      cancel()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Trasu se nepodařilo smazat.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!drawing || drawingPaused) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancelDrawing()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawing, drawingPaused, cancelDrawing])

  const original = routes.find(route => route.id === draft?.id)
  const preview = draft && (drawing || !draft.id || !original
    || draft.startPointId !== original.startPointId || draft.endPointId !== original.endPointId
    || JSON.stringify(draft.waypoints) !== JSON.stringify(original.waypoints)) ? draft : null
  const visibleRoutes = useMemo(() => routes.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs')), [routes])

  return { routes, visibleRoutes, draft, drawing, loading, loadError, error, saving, checkingBuildings,
    buildingCrossings, nearbyBuildings: nearbyResult?.footprints ?? [], preview,
    setRoutes, setDraft, setLoading, setReloadVersion, cancel, cancelDrawing, startDrawing, selectRoute, editRoute, startEditing, continueFrom,
    addPoint, setEndpoint, addWaypoint, insertWaypoint, moveWaypoint, removeWaypoint, undo, resetGeometry, finish, save, remove }
}
