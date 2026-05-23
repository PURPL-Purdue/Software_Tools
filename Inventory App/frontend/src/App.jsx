import { useState, useEffect } from 'react'

export default function App() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ name: '', quantity: 0, description: '' })

  const fetchItems = () =>
    fetch('/items').then(r => r.json()).then(setItems)

  useEffect(() => { fetchItems() }, [])

  const addItem = async (e) => {
    e.preventDefault()
    await fetch('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
    })
    setForm({ name: '', quantity: 0, description: '' })
    fetchItems()
  }

  const deleteItem = async (id) => {
    await fetch(`/items/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Inventory</h1>

      <form onSubmit={addItem} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <input placeholder="Name" required value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input placeholder="Qty" type="number" required value={form.quantity}
          onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={{ width: 60 }} />
        <input placeholder="Description" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <button type="submit">Add</button>
      </form>

      <table width="100%" cellPadding={8} style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th>Name</th><th>Qty</th><th>Description</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{item.description}</td>
              <td><button onClick={() => deleteItem(item.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
