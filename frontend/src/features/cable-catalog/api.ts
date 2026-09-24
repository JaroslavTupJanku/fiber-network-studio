import { normalizeCable, type CableInput, type CableSpecification, type ColorCodeData } from './model'

async function request<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/cable-catalog${path}`, options).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new Error('Katalog není dostupný. Zkontrolujte připojení a zkuste to znovu.')
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.detail || (problem?.errors ? Object.values(problem.errors).flat().join(' ') : null)
      || (response.status === 404 ? 'Kabel již neexistuje. Načtěte katalog znovu.' : 'Katalog není dostupný. Zkuste to znovu.'))
  }
  return response.status === 204 ? undefined as T : response.json()
}

export const listCables = async (signal?: AbortSignal) => (await request<CableSpecification[]>('', { signal })).map(normalizeCable)
export const listColorCodes = (signal?: AbortSignal) => request<ColorCodeData>('/color-codes', { signal })
export const saveCable = (input: CableInput, id?: string) => request<CableSpecification>(id ? `/${id}` : '', {
  method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
export const deleteCable = (cable: CableSpecification) => request<void>(`/${cable.id}?version=${cable.version}`, { method: 'DELETE' })
