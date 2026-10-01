import type { CustomerDraft, CustomerRecord } from './model'

async function expectOk(response: Response) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Zákazníky se nepodařilo načíst nebo uložit (${response.status}).`)
  }
  return response
}

export async function listCustomers(): Promise<CustomerRecord[]> {
  return (await expectOk(await fetch('/api/customers'))).json()
}

export async function saveCustomer(draft: CustomerDraft): Promise<CustomerRecord> {
  const url = draft.id ? `/api/customers/${draft.id}` : '/api/customers'
  return (await expectOk(await fetch(url, { method: draft.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
  }))).json()
}

export async function deleteCustomer(customer: CustomerRecord): Promise<void> {
  await expectOk(await fetch(`/api/customers/${customer.id}?version=${customer.version}`, { method: 'DELETE' }))
}
