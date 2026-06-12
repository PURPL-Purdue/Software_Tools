import { useState, useEffect } from 'react'

const LOCATIONS = [
  { field: 'storage_quantity', label: 'Storage' },
  { field: 'biggie_k_quantity', label: 'Biggie K' },
  { field: 'airbreathing_quantity', label: 'Airbreathing' },
  { field: 'tachyon_quantity', label: 'Tachyon' },
  { field: 'damaged_quantity', label: 'Damaged' },
]

const NON_DAMAGED_LOCATIONS = LOCATIONS.filter(l => l.field !== 'damaged_quantity')
const LOCATION_LABEL = Object.fromEntries(LOCATIONS.map(l => [l.field, l.label]))

const ICON_PATHS = {
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></>,
}

function Icon({ name, size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

function CategoryPicker({ selected, categories, onChange, compact = false }) {
  const available = categories.filter(c => !selected.includes(c.name))
  return (
    <div className={`cat-picker${compact ? ' compact' : ''}`}>
      {selected.length === 0 && <span className="cat-picker-empty">—</span>}
      {selected.map(name => (
        <span key={name} className="mini-chip">
          {name}
          <button
            type="button"
            className="mini-chip-x"
            aria-label={`Remove ${name}`}
            onClick={() => onChange(selected.filter(n => n !== name))}
          >×</button>
        </span>
      ))}
      {available.length > 0 && (
        <select
          className="cat-picker-add"
          value=""
          onChange={e => {
            if (e.target.value) onChange([...selected, e.target.value])
          }}
        >
          <option value="">+</option>
          {available.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function ConnectionBanner({ error }) {
  if (!error) return null
  const message = error === 'backend'
    ? 'Servers are currently down. Trying to reconnect…'
    : 'Database is unreachable. Some features may not work.'
  return (
    <div className="banner banner-error" role="status">
      <span className="banner-dot" />
      <span>{message}</span>
    </div>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type}`} role="status">
      {toast.message}
    </div>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-purpl">PURPL</span>
      <span className="brand-logo">
        <img src="/favicon.svg" alt="" className="brand-icon" />
        WrapDrive
      </span>
    </div>
  )
}

const DEFAULT_MOVE = {
  from_location: 'storage_quantity',
  to_location: 'biggie_k_quantity',
  quantity: 1,
  serial: '',
  description: '',
}

export default function App() {
  const [page, setPage] = useState('list')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState({ name: '', quantity: 0, description: '', categories: [] })
  const [newCategory, setNewCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [hiddenCategories, setHiddenCategories] = useState(() => new Set())

  const [connectionError, setConnectionError] = useState(null) // 'backend' | 'database' | null
  const [toast, setToast] = useState(null) // { type: 'success'|'error', message: string }

  const showToast = (type, message, ms = 2500) => {
    setToast({ type, message })
    if (ms) setTimeout(() => setToast(t => (t && t.message === message ? null : t)), ms)
  }

  const api = async (url, options) => {
    try {
      const res = await fetch(url, options)
      if (res.status === 503) {
        setConnectionError('database')
      } else {
        setConnectionError(prev => prev ? null : prev)
      }
      return res
    } catch {
      setConnectionError('backend')
      return {
        ok: false,
        status: 0,
        json: async () => ({ detail: 'Servers are currently down.' }),
      }
    }
  }

  const toggleFilter = (name) => {
    setHiddenCategories(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const [moveModal, setMoveModal] = useState(false)
  const [moveForm, setMoveForm] = useState(DEFAULT_MOVE)
  const [moveError, setMoveError] = useState('')

  const [addItemId, setAddItemId] = useState(null)
  const [addQty, setAddQty] = useState(1)
  const [addError, setAddError] = useState('')

  const [removeModal, setRemoveModal] = useState(false)
  const [removeForm, setRemoveForm] = useState({ location: 'storage_quantity', quantity: 1 })
  const [removeError, setRemoveError] = useState('')

  const [damagedMoveSerial, setDamagedMoveSerial] = useState(null)
  const [damagedMoveLocation, setDamagedMoveLocation] = useState('storage_quantity')
  const [damagedMoveError, setDamagedMoveError] = useState('')

  const fetchItems = () => api('/items').then(r => r.json()).then(setItems)
  const fetchCategories = () => api('/categories').then(r => r.json()).then(setCategories)

  const refreshSelected = async (id) => {
    const fresh = await api(`/items/${id}`).then(r => r.json())
    setSelectedItem(fresh)
    return fresh
  }

  useEffect(() => { fetchItems(); fetchCategories() }, [])

  useEffect(() => {
    if (!connectionError) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/health')
        if (res.ok) {
          setConnectionError(null)
          fetchItems()
          fetchCategories()
        } else if (res.status === 503) {
          setConnectionError('database')
        }
      } catch {
        // still disconnected
      }
    }, 4000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionError])

  const createItem = async (e) => {
    e.preventDefault()
    const name = form.name
    const res = await api('/create_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        storage_quantity: Number(form.quantity),
        total_quantity: Number(form.quantity),
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      showToast('error', data.detail ?? 'Failed to add item.')
      return
    }
    setForm({ name: '', quantity: 0, description: '', categories: [] })
    fetchItems()
    showToast('success', `"${name}" added successfully`)
  }

  const createCategory = async (e) => {
    e.preventDefault()
    setCategoryError('')
    const name = newCategory.trim()
    if (!name) return
    const res = await api('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const data = await res.json()
      setCategoryError(data.detail ?? 'Failed to create category.')
      return
    }
    setNewCategory('')
    fetchCategories()
  }

  const deleteCategory = async (name) => {
    if (!window.confirm(`Delete category "${name}"? Items in it will be moved to Uncategorized.`)) return
    const res = await api(`/categories/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.detail ?? 'Failed to delete category.')
      return
    }
    fetchCategories()
    fetchItems()
  }

  const setItemCategories = async (id, categoriesList) => {
    const res = await api(`/items/${id}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: categoriesList }),
    })
    if (!res.ok) {
      const data = await res.json()
      alert(data.detail ?? 'Failed to change categories.')
      return
    }
    fetchItems()
    if (selectedItem && selectedItem.id === id) {
      await refreshSelected(id)
    }
  }

  const deleteItem = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    await api(`/items/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  const openInfo = async (item) => {
    const fresh = await api(`/items/${item.id}`).then(r => r.json())
    setSelectedItem(fresh)
    setPage('info')
  }

  const openAddModal = (id) => {
    setAddItemId(id)
    setAddQty(1)
    setAddError('')
  }

  const closeAddModal = () => {
    setAddItemId(null)
    setAddQty(1)
    setAddError('')
  }

  const submitAdd = async (e) => {
    e.preventDefault()
    setAddError('')
    const res = await api(`/items/${addItemId}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: Number(addQty) }),
    })
    if (!res.ok) {
      const data = await res.json()
      setAddError(data.detail ?? 'Failed to add items.')
      return
    }
    fetchItems()
    if (selectedItem && selectedItem.id === addItemId) {
      await refreshSelected(addItemId)
    }
    closeAddModal()
  }

  const submitRemove = async (e) => {
    e.preventDefault()
    setRemoveError('')
    const res = await api(`/items/${selectedItem.id}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...removeForm, quantity: Number(removeForm.quantity) }),
    })
    if (!res.ok) {
      const data = await res.json()
      setRemoveError(data.detail ?? 'Remove failed.')
      return
    }
    await refreshSelected(selectedItem.id)
    fetchItems()
    setRemoveModal(false)
    setRemoveForm({ location: 'storage_quantity', quantity: 1 })
  }

  const submitMove = async (e) => {
    e.preventDefault()
    setMoveError('')

    const isDamage = moveForm.to_location === 'damaged_quantity'

    let res
    if (isDamage) {
      if (!moveForm.serial.trim()) {
        setMoveError('Serial number is required.')
        return
      }
      res = await api(`/items/${selectedItem.id}/damage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: moveForm.serial.trim(),
          location: moveForm.from_location,
          description: moveForm.description,
        }),
      })
    } else {
      if (moveForm.from_location === moveForm.to_location) {
        setMoveError('Source and destination must be different.')
        return
      }
      res = await api(`/items/${selectedItem.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_location: moveForm.from_location,
          to_location: moveForm.to_location,
          quantity: Number(moveForm.quantity),
        }),
      })
    }

    if (!res.ok) {
      const data = await res.json()
      setMoveError(data.detail ?? 'Move failed.')
      return
    }
    await refreshSelected(selectedItem.id)
    fetchItems()
    setMoveModal(false)
    setMoveForm(DEFAULT_MOVE)
  }

  const openDamagedMove = (serial, currentLocation) => {
    setDamagedMoveSerial(serial)
    setDamagedMoveLocation(currentLocation)
    setDamagedMoveError('')
  }

  const submitDamagedMove = async (e) => {
    e.preventDefault()
    setDamagedMoveError('')
    const res = await api(
      `/items/${selectedItem.id}/damaged/${encodeURIComponent(damagedMoveSerial)}/move`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: damagedMoveLocation }),
      }
    )
    if (!res.ok) {
      const data = await res.json()
      setDamagedMoveError(data.detail ?? 'Move failed.')
      return
    }
    await refreshSelected(selectedItem.id)
    setDamagedMoveSerial(null)
  }

  const restoreDamaged = async (serial) => {
    if (!window.confirm(`Unmark damaged item "${serial}"? It will be returned to its location.`)) return
    const res = await api(
      `/items/${selectedItem.id}/damaged/${encodeURIComponent(serial)}/restore`,
      { method: 'POST' }
    )
    if (!res.ok) {
      const data = await res.json()
      alert(data.detail ?? 'Restore failed.')
      return
    }
    await refreshSelected(selectedItem.id)
    fetchItems()
  }

  const deleteDamaged = async (serial) => {
    if (!window.confirm(`Delete damaged item "${serial}"? This cannot be undone.`)) return
    const res = await api(
      `/items/${selectedItem.id}/damaged/${encodeURIComponent(serial)}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const data = await res.json()
      alert(data.detail ?? 'Delete failed.')
      return
    }
    await refreshSelected(selectedItem.id)
    fetchItems()
  }

  const addModal = addItemId !== null && (
    <div className="overlay" onClick={closeAddModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add Items to Storage</div>
        </div>
        <form onSubmit={submitAdd}>
          <div className="modal-body">
            <div className="field">
              <label className="field-label">Quantity to Add</label>
              <input
                type="number"
                min={1}
                required
                className="input"
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
              />
            </div>
            {addError && <div className="error">{addError}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={closeAddModal}>Cancel</button>
            <button type="submit" className="btn btn-soft">Add</button>
          </div>
        </form>
      </div>
    </div>
  )

  if (page === 'info' && selectedItem) {
    const damagedList = Object.values(selectedItem.damaged_objects || {})
    const isDamageMove = moveForm.to_location === 'damaged_quantity'

    return (
      <div className="page">
        <ConnectionBanner error={connectionError} />
        <Toast toast={toast} />
        <div className="page-header">
          <button className="btn btn-ghost" onClick={() => { setPage('list'); setSelectedItem(null) }}>
            ← Back to inventory
          </button>
          <Brand />
        </div>

        <div className="summary">
          <h1 className="summary-name">{selectedItem.name}</h1>
        </div>
        {selectedItem.description && <p className="summary-desc">{selectedItem.description}</p>}

        <div className="total-card">
          <span className="label">Total Quantity</span>
          <span className="value">{selectedItem.total_quantity}</span>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Inventory by Location</h3></div>
          <table className="table">
            <colgroup>
              {LOCATIONS.map(({ field }) => <col key={field} style={{ width: '20%' }} />)}
            </colgroup>
            <thead>
              <tr>
                {LOCATIONS.map(({ field, label }) => (
                  <th key={field} className="center">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {LOCATIONS.map(({ field }) => (
                  <td key={field} className="center num" style={{ fontSize: 16, fontWeight: 600 }}>
                    {selectedItem[field] ?? 0}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3>Damaged Objects</h3>
            <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>
              {damagedList.length} {damagedList.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          {damagedList.length === 0 ? (
            <div className="table-empty">No damaged items recorded.</div>
          ) : (
            <table className="table">
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Location</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {damagedList.map(obj => (
                  <tr key={obj.serial}>
                    <td>{obj.serial}</td>
                    <td>{LOCATION_LABEL[obj.location] ?? obj.location}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{obj.description}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-sm btn-outline-soft" onClick={() => restoreDamaged(obj.serial)}>Unmark</button>
                        <button className="btn btn-sm btn-outline-primary" onClick={() => openDamagedMove(obj.serial, obj.location)}>Move</button>
                        <button className="btn btn-sm btn-outline-rose" onClick={() => deleteDamaged(obj.serial)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="btn-row">
          <button className="btn btn-outline-soft" onClick={() => openAddModal(selectedItem.id)}>+ Add Items</button>
          <button className="btn btn-outline-primary" onClick={() => { setMoveModal(true); setMoveError('') }}>Move Items</button>
          <button className="btn btn-outline-rose" onClick={() => { setRemoveModal(true); setRemoveError('') }}>Remove Items</button>
        </div>

        {removeModal && (
          <div className="overlay" onClick={() => { setRemoveModal(false); setRemoveError('') }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header"><div className="modal-title">Remove Items</div></div>
              <form onSubmit={submitRemove}>
                <div className="modal-body">
                  <div className="field">
                    <label className="field-label">Location</label>
                    <select
                      className="select"
                      value={removeForm.location}
                      onChange={e => setRemoveForm(f => ({ ...f, location: e.target.value }))}
                    >
                      {LOCATIONS.map(({ field, label }) => (
                        <option key={field} value={field}>{label} ({selectedItem[field] ?? 0})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">Quantity to Remove</label>
                    <input
                      type="number"
                      min={1}
                      required
                      className="input"
                      value={removeForm.quantity}
                      onChange={e => setRemoveForm(f => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                  {removeError && <div className="error">{removeError}</div>}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setRemoveModal(false); setRemoveForm({ location: 'storage_quantity', quantity: 1 }); setRemoveError('') }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-rose">Remove</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {moveModal && (
          <div className="overlay" onClick={() => { setMoveModal(false); setMoveForm(DEFAULT_MOVE); setMoveError('') }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">{isDamageMove ? 'Mark as Damaged' : 'Move Item'}</div>
              </div>
              <form onSubmit={submitMove}>
                <div className="modal-body">
                  <div className="field">
                    <label className="field-label">{isDamageMove ? 'Location' : 'From'}</label>
                    <select
                      className="select"
                      value={moveForm.from_location}
                      onChange={e => setMoveForm(f => ({ ...f, from_location: e.target.value }))}
                    >
                      {NON_DAMAGED_LOCATIONS.map(({ field, label }) => (
                        <option key={field} value={field}>{label} ({selectedItem[field] ?? 0})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">To</label>
                    <select
                      className="select"
                      value={moveForm.to_location}
                      onChange={e => setMoveForm(f => ({ ...f, to_location: e.target.value }))}
                    >
                      {LOCATIONS.map(({ field, label }) => (
                        <option key={field} value={field}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {isDamageMove ? (
                    <>
                      <div className="field">
                        <label className="field-label">Serial Number</label>
                        <input
                          type="text"
                          required
                          className="input"
                          value={moveForm.serial}
                          onChange={e => setMoveForm(f => ({ ...f, serial: e.target.value }))}
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">Description</label>
                        <input
                          type="text"
                          className="input"
                          value={moveForm.description}
                          onChange={e => setMoveForm(f => ({ ...f, description: e.target.value }))}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="field">
                      <label className="field-label">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        required
                        className="input"
                        value={moveForm.quantity}
                        onChange={e => setMoveForm(f => ({ ...f, quantity: e.target.value }))}
                      />
                    </div>
                  )}

                  {moveError && <div className="error">{moveError}</div>}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setMoveModal(false); setMoveForm(DEFAULT_MOVE); setMoveError('') }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">Submit</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {damagedMoveSerial !== null && (
          <div className="overlay" onClick={() => { setDamagedMoveSerial(null); setDamagedMoveError('') }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">Move Damaged Item</div>
                <div className="modal-sub">Serial: {damagedMoveSerial}</div>
              </div>
              <form onSubmit={submitDamagedMove}>
                <div className="modal-body">
                  <div className="field">
                    <label className="field-label">New Location</label>
                    <select
                      className="select"
                      value={damagedMoveLocation}
                      onChange={e => setDamagedMoveLocation(e.target.value)}
                    >
                      {NON_DAMAGED_LOCATIONS.map(({ field, label }) => (
                        <option key={field} value={field}>{label}</option>
                      ))}
                    </select>
                  </div>
                  {damagedMoveError && <div className="error">{damagedMoveError}</div>}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setDamagedMoveSerial(null); setDamagedMoveError('') }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">Move</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {addModal}
      </div>
    )
  }

  return (
    <div className="page">
      <ConnectionBanner error={connectionError} />
      <Toast toast={toast} />
      <div className="page-header">
        <h1>Inventory</h1>
        <Brand />
      </div>

      <form onSubmit={createItem} className="create-form">
        <input
          className="input"
          placeholder="Item name"
          required
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="input input-qty"
          placeholder="Qty"
          type="number"
          required
          value={form.quantity}
          onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
        />
        <input
          className="input"
          placeholder="Description (optional)"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
        <div className="input-cat">
          <CategoryPicker
            selected={form.categories}
            categories={categories}
            onChange={cats => setForm(f => ({ ...f, categories: cats }))}
          />
        </div>
        <button type="submit" className="btn btn-primary">+ Add New Item</button>
      </form>

      {(() => {
        const knownCategoryNames = categories.map(c => c.name)
        const groups = new Map()
        knownCategoryNames.forEach(name => groups.set(name, []))
        groups.set('Uncategorized', [])
        items.forEach(item => {
          const itemCats = (item.categories || []).filter(c => knownCategoryNames.includes(c))
          if (itemCats.length === 0) {
            groups.get('Uncategorized').push(item)
          } else {
            itemCats.forEach(cat => groups.get(cat).push(item))
          }
        })

        const allGroupNames = Array.from(groups.keys())
        const entries = Array.from(groups.entries()).filter(
          ([name, group]) => name !== 'Uncategorized' || group.length > 0
        )
        const visibleEntries = entries.filter(([name]) => !hiddenCategories.has(name))

        return (
          <div className="main-layout">
            <aside className="sidebar">
              <div className="card">
                <div className="card-header">
                  <h3>Categories</h3>
                </div>
                <div className="card-body cat-list vertical">
                  {categories.length === 0 ? (
                    <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>No categories yet.</span>
                  ) : categories.map(c => (
                    <span key={c.id} className="cat-chip">
                      <span className="cat-chip-name">{c.name}</span>
                      <button
                        className="cat-chip-x"
                        onClick={() => deleteCategory(c.name)}
                        aria-label={`Delete ${c.name}`}
                      >×</button>
                    </span>
                  ))}
                </div>
                <form onSubmit={createCategory} className="cat-create-footer">
                  <input
                    className="input"
                    placeholder="New category"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                  />
                  <button type="submit" className="btn btn-outline-primary btn-sm">+ Add</button>
                </form>
                {categoryError && <div className="error" style={{ margin: '0 16px 16px' }}>{categoryError}</div>}
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Filter</h3>
                  {hiddenCategories.size > 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setHiddenCategories(new Set())}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="card-body filter-list">
                  {allGroupNames.map(name => (
                    <label key={name} className="filter-row">
                      <input
                        type="checkbox"
                        checked={!hiddenCategories.has(name)}
                        onChange={() => toggleFilter(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </aside>

            <div className="main-content">
              {items.length === 0 && categories.length === 0 ? (
                <div className="card"><div className="table-empty">No items yet — add one above.</div></div>
              ) : visibleEntries.length === 0 ? (
                <div className="card"><div className="table-empty">All categories are filtered out.</div></div>
              ) : (
                visibleEntries.map(([catName, group]) => (
                  <div className="card category-card" key={catName}>
                    <div className="card-header">
                      <h3>{catName}</h3>
                      <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>
                        {group.length} {group.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <table className="table">
                      <colgroup>
                        <col style={{ width: '160px' }} />
                        <col style={{ width: '80px' }} />
                        <col style={{ width: '80px' }} />
                        <col />
                        <col />
                        <col style={{ width: '132px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th className="center">Total</th>
                          <th className="center">Avail</th>
                          <th>Description</th>
                          <th>Categories</th>
                          <th className="center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.length === 0 ? (
                          <tr><td colSpan={6} className="table-empty">No items in this category.</td></tr>
                        ) : group.map(item => (
                          <tr key={`${catName}-${item.id}`}>
                            <td className="cell-name">{item.name}</td>
                            <td className="center num">{item.total_quantity}</td>
                            <td className="center num">{item.storage_quantity ?? 0}</td>
                            <td className="cell-desc" title={item.description || ''}>{item.description}</td>
                            <td className="cell-cats">
                              <CategoryPicker
                                compact
                                selected={item.categories || []}
                                categories={categories}
                                onChange={cats => setItemCategories(item.id, cats)}
                              />
                            </td>
                            <td>
                              <div className="actions actions-center">
                                <button className="btn btn-icon btn-outline-soft" title="Add items" onClick={() => openAddModal(item.id)}><Icon name="plus" /></button>
                                <button className="btn btn-icon btn-outline-primary" title="View details" onClick={() => openInfo(item)}><Icon name="eye" /></button>
                                <button className="btn btn-icon btn-outline-rose" title="Delete item" onClick={() => deleteItem(item.id, item.name)}><Icon name="trash" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })()}

      {addModal}
    </div>
  )
}
