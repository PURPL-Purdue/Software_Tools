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
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState({ name: '', quantity: 0, description: '' })

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

  const fetchItems = () => fetch('/items').then(r => r.json()).then(setItems)

  const refreshSelected = async (id) => {
    const fresh = await fetch(`/items/${id}`).then(r => r.json())
    setSelectedItem(fresh)
    return fresh
  }

  useEffect(() => { fetchItems() }, [])

  const createItem = async (e) => {
    e.preventDefault()
    await fetch('/create_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        storage_quantity: Number(form.quantity),
        total_quantity: Number(form.quantity),
      }),
    })
    setForm({ name: '', quantity: 0, description: '' })
    fetchItems()
  }

  const deleteItem = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    await fetch(`/items/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  const openInfo = async (item) => {
    const fresh = await fetch(`/items/${item.id}`).then(r => r.json())
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
    const res = await fetch(`/items/${addItemId}/add`, {
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
    const res = await fetch(`/items/${selectedItem.id}/remove`, {
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
      res = await fetch(`/items/${selectedItem.id}/damage`, {
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
      res = await fetch(`/items/${selectedItem.id}/move`, {
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
    const res = await fetch(
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
    const res = await fetch(
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
    const res = await fetch(
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
        <button type="submit" className="btn btn-primary">+ Add New Item</button>
      </form>

      <div className="card">
        <table className="table">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '24%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th className="center">Quantity</th>
              <th className="center">Available</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="table-empty">No items yet — add one above.</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 500 }}>{item.name}</td>
                <td className="center num">{item.total_quantity}</td>
                <td className="center num">{item.storage_quantity ?? 0}</td>
                <td style={{ color: 'var(--text-dim)' }}>{item.description}</td>
                <td>
                  <div className="actions">
                    <button className="btn btn-sm btn-outline-soft" onClick={() => openAddModal(item.id)}>Add</button>
                    <button className="btn btn-sm btn-outline-primary" onClick={() => openInfo(item)}>Info</button>
                    <button className="btn btn-sm btn-outline-rose" onClick={() => deleteItem(item.id, item.name)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addModal}
    </div>
  )
}
