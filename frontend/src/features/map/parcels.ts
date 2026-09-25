import type { Coordinates } from './networkPoints'

export type ParcelGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export type Parcel = {
  id: number
  number: string
  cadastralAreaCode: number
  cadastralAreaName: string | null
  areaSquareMeters: number | null
  geometry: ParcelGeometry
}

export async function findParcelAt(location: Coordinates, signal?: AbortSignal): Promise<Parcel | null> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  })
  const response = await fetch(`/api/parcels/at?${params}`, { signal })
  if (response.status === 204) return null
  if (!response.ok) throw new Error(`Parcel lookup returned ${response.status}`)
  return response.json()
}
