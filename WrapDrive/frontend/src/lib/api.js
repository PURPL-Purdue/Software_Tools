const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const isForm = options.body instanceof FormData
  if (options.body && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    let data
    try { data = await response.json() } catch { data = null }
    const detail = data?.detail
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((x) => x.msg).join(', ')
        : `Request failed (${response.status})`
    throw new ApiError(message, response.status, data)
  }
  if (response.status === 204) return null
  const type = response.headers.get('content-type') || ''
  return type.includes('application/json') ? response.json() : response.blob()
}

function qs(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v))
    else search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  health: () => request('/health'),
  listParts: (filters = {}) => request(`/parts${qs(filters)}`),
  getPart: (id) => request(`/parts/${id}`),
  createPart: (body) => request('/parts', { method: 'POST', body: JSON.stringify(body) }),
  updatePart: (id, body) => request(`/parts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePart: (id) => request(`/parts/${id}`, { method: 'DELETE' }),
  categories: () => request('/categories'),
  createCategory: (name) => request('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  locations: () => request('/locations'),
  createLocation: (body) => request('/locations', { method: 'POST', body: JSON.stringify(body) }),
  updateLocation: (id, body) => request(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  tags: () => request('/tags'),
  stock: (partId) => request(`/parts/${partId}/stock`),
  reconcileStock: (partId, body) => request(`/parts/${partId}/stock/reconcile`, { method: 'POST', body: JSON.stringify(body) }),
  stockHistory: (partId) => request(`/parts/${partId}/stock/history`),
  trackedUnits: (partId) => request(`/parts/${partId}/tracked-units`),
  createTrackedUnit: (partId, body) => request(`/parts/${partId}/tracked-units`, { method: 'POST', body: JSON.stringify(body) }),
  updateTrackedUnit: (partId, unitId, body) => request(`/parts/${partId}/tracked-units/${unitId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  retireTrackedUnit: (partId, unitId, body) => request(`/parts/${partId}/tracked-units/${unitId}/retire`, { method: 'POST', body: JSON.stringify(body) }),
  addNote: (partId, body) => request(`/parts/${partId}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  deleteNote: (partId, noteId) => request(`/parts/${partId}/notes/${noteId}`, { method: 'DELETE' }),
  addRelation: (partId, body) => request(`/parts/${partId}/relations`, { method: 'POST', body: JSON.stringify(body) }),
  deleteRelation: (partId, relationId) => request(`/parts/${partId}/relations/${relationId}`, { method: 'DELETE' }),
  attachments: (partId) => request(`/parts/${partId}/attachments`),
  uploadAttachment: (partId, formData) => request(`/parts/${partId}/attachments`, { method: 'POST', body: formData }),
  deleteAttachment: (partId, attachmentId) => request(`/parts/${partId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  attachmentUrl: (partId, attachmentId) => `${API_BASE}/parts/${partId}/attachments/${attachmentId}/download`,
}

export function listFrom(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.parts || payload?.results || payload?.data || []
}

export function idOf(value) { return value?.id || value?._id || '' }
export function nameOf(value) { return typeof value === 'string' ? value : value?.name || '' }
