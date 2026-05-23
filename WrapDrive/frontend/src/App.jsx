import { useState, useEffect, Fragment } from 'react'

export default function App() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ name: '', quantity: 0, description: '' })
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails] = useState({})
  const [updateStatus, setUpdateStatus] = useState({})

  const fetchItems = () =>
    fetch('/items').then(r => r.json()).then(setItems)

  useEffect(() => { fetchItems() }, [])

  const createItem = async (e) => {
    e.preventDefault()
    await fetch('http://localhost:8000/create_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, storage_quantity: Number(form.quantity), total_quantity: Number(form.quantity) }),
    })
    setForm({ name: '', quantity: 0, description: '' })
    fetchItems()
  }

  const deleteItem = async (id) => {
    await fetch(`http://localhost:8000/items/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  const openInfo = async (id) => {

    // collapse if already open
    if (expandedId === id) {
      setExpandedId(null)
      return
    }

    // only fetch once
    if (!details[id]) {
      const item = await fetch(
        `http://localhost:8000/items/${id}`
      ).then(r => r.json())

      setDetails(prev => ({
        ...prev,
        [id]: item
      }))
    }

    setExpandedId(id)
  }

  const updateQuantity = async (id) => {
    setUpdateStatus(prev => ({
      ...prev,
      [id]: "loading"
    }));

    try {
      const itemDetails = details[id];

      await fetch(`http://localhost:8000/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...itemDetails,
          total_quantity:
            (itemDetails.storage_quantity ?? 0) +
            (itemDetails.biggie_k_quantity ?? 0) +
            (itemDetails.airbreathing_quantity ?? 0) +
            (itemDetails.tachyon_quantity ?? 0) +
            (itemDetails.damaged_quantity ?? 0)
        }),
      });

      setUpdateStatus(prev => ({
        ...prev,
        [id]: "success"
      }));

      fetchItems();

      // optional: clear success after delay
      setTimeout(() => {
        setUpdateStatus(prev => ({
          ...prev,
          [id]: "idle"
        }));
      }, 1500);

    } catch (err) {
      setUpdateStatus(prev => ({
        ...prev,
        [id]: "error"
      }));
    }
  };

  const moveItem = (id, field, delta) => {
    setDetails(prev => {
      const item = prev[id];
      if (!item) return prev;

      const storage = item.storage_quantity ?? 0;
      const current = item[field] ?? 0;

      // If moving INTO a category (delta > 0), require storage
      if (delta > 0 && storage <= 0) return prev;

      const newStorage = storage - delta;
      const newField = current + delta;

      // prevent invalid states
      if (newStorage < 0 || newField < 0) return prev;

      return {
        ...prev,
        [id]: {
          ...item,
          storage_quantity: newStorage,
          [field]: newField
        }
      };
    });
  };

  const changeQuantity = (id, field, delta) => {
    setDetails(prev => {
      const item = prev[id];
      if (!item) return prev;

      const current = item[field] ?? 0;
      const next = Math.max(0, current + delta);

      return {
        ...prev,
        [id]: {
          ...item,
          [field]: next
        }
      };
    });
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Inventory</h1>

      <form onSubmit={createItem} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
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
            <Fragment key={item.id}>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td>{item.name}</td>
                <td>{item.total_quantity}</td>
                <td>{item.description}</td>
                <td><button onClick={() => openInfo(item.id)}>Info</button></td>
                <td><button onClick={() => deleteItem(item.id)}>Delete</button></td>
              </tr>

              {expandedId === item.id && (
                <tr style={{ background: '#161319', border: '1px solid #52067b', borderRadius: 4 }}>
                  <td colSpan={5}>
                    <div style={{
                      padding: 12
                    }}>
                      <table width="100%" cellPadding={8} style={{ borderCollapse: 'collapse', marginTop: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                            <th>Storage</th><th style={{ color: 'purple' }}>Biggie K</th><th style={{ color: 'blue' }}>Airbreathing</th><th style={{ color: 'green' }}>Tachyon</th><th style={{ color: 'red' }}>Damaged</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #eee' }}>
                            <td>
                              <button onClick={() => changeQuantity(item.id, "storage_quantity", 1)}>
                                ▲
                              </button>

                              <div style={{ textAlign: "center" }}>
                                {details[item.id]?.storage_quantity ?? 0}
                              </div>

                              <button onClick={() => changeQuantity(item.id, "storage_quantity", -1)}>
                                ▼
                              </button>
                            </td>
                            <td>
                              <button onClick={() => moveItem(item.id, "biggie_k_quantity", 1)}>
                                ▲
                              </button>

                              <div style={{ textAlign: "center" }}>
                                {details[item.id]?.biggie_k_quantity ?? 0}
                              </div>

                              <button onClick={() => moveItem(item.id, "biggie_k_quantity", -1)}>
                                ▼
                              </button>
                            </td>
                            <td>
                              <button onClick={() => moveItem(item.id, "airbreathing_quantity", 1)}>
                                ▲
                              </button>
                              <div style={{ textAlign: "center" }}>
                                {details[item.id]?.airbreathing_quantity ?? 0}
                              </div>
                              <button onClick={() => moveItem(item.id, "airbreathing_quantity", -1)}>
                                ▼
                              </button>
                            </td>
                            <td>
                              <button onClick={() => moveItem(item.id, "tachyon_quantity", 1)}>
                                ▲
                              </button>
                              <div style={{ textAlign: "center" }}>
                                {details[item.id]?.tachyon_quantity ?? 0}
                              </div>
                              <button onClick={() => moveItem(item.id, "tachyon_quantity", -1)}>
                                ▼
                              </button>
                            </td>
                            <td>
                              <button onClick={() => moveItem(item.id, "damaged_quantity", 1)}>
                                ▲
                              </button>
                              <div style={{ textAlign: "center" }}>
                                {details[item.id]?.damaged_quantity ?? 0}
                              </div>
                              <button onClick={() => moveItem(item.id, "damaged_quantity", -1)}>
                                ▼
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <button
                        onClick={() => updateQuantity(item.id)}
                        style={{
                          marginTop: 12,
                          background:
                            updateStatus[item.id] === "success"
                              ? "#22c55e"
                              : updateStatus[item.id] === "error"
                              ? "#ef4444"
                              : "#9100ff",
                          color: "white",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          transition: "0.2s"
                        }}
                      >
                        {updateStatus[item.id] === "loading"
                          ? "Updating..."
                          : updateStatus[item.id] === "success"
                          ? "Saved ✓"
                          : updateStatus[item.id] === "error"
                          ? "Failed ✕"
                          : "Update"}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
