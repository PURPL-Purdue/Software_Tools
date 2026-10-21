import { useMemo, useState } from 'react'
import { idOf, nameOf } from '../lib/api'

const empty = { name:'', description:'', manufacturer_part_number:'', purpl_part_number:'', category_id:'', stock_unit:'each', tags:[], specifications:[] }

export default function PartForm({ initial, categories, onSubmit, submitLabel='Save Part' }) {
  const seed = useMemo(() => ({...empty, ...initial, category_id: initial?.category_id || idOf(initial?.category) || '', specifications: initial?.specifications || initial?.specs || [], tags: initial?.tags || []}), [initial])
  const [form, setForm] = useState(seed)
  const [tagText, setTagText] = useState('')
  const set = (key, value) => setForm((f) => ({...f, [key]:value}))
  const addSpec = () => set('specifications', [...form.specifications, {key:'', value:'', unit:''}])
  const updateSpec = (i,k,v) => set('specifications', form.specifications.map((s,n)=>n===i?{...s,[k]:v}:s))
  const removeSpec = (i) => set('specifications', form.specifications.filter((_,n)=>n!==i))
  const addTag = () => { const t=tagText.trim(); if(t && !form.tags.includes(t)) set('tags',[...form.tags,t]); setTagText('') }
  return <form className="stack" onSubmit={(e)=>{e.preventDefault(); onSubmit({...form, specifications:form.specifications.filter(s=>s.key.trim() && String(s.value).trim())})}}>
    <div className="form-grid">
      <label>Part name<input required value={form.name} onChange={e=>set('name',e.target.value)} placeholder="ESB03137" /></label>
      <label>Category<select value={form.category_id} onChange={e=>set('category_id',e.target.value)}><option value="">Uncategorized</option>{categories.map(c=><option key={idOf(c)} value={idOf(c)}>{nameOf(c)}</option>)}</select></label>
      <label className="span-2">Description<textarea value={form.description || ''} onChange={e=>set('description',e.target.value)} placeholder="What is this part?" /></label>
      <label>Manufacturer part #<input value={form.manufacturer_part_number || ''} onChange={e=>set('manufacturer_part_number',e.target.value)} /></label>
      <label>PURPL part #<input value={form.purpl_part_number || ''} onChange={e=>set('purpl_part_number',e.target.value)} /></label>
      <label>Stock unit<input required value={form.stock_unit || 'each'} onChange={e=>set('stock_unit',e.target.value)} placeholder="each, ft, m..." /></label>
    </div>
    <div><div className="section-label">Tags</div><div className="chips">{form.tags.map(t=><button type="button" className="chip removable" key={t} onClick={()=>set('tags',form.tags.filter(x=>x!==t))}>{t} ×</button>)}</div><div className="inline"><input value={tagText} onChange={e=>setTagText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag()}}} placeholder="Type to add tag"/><button type="button" className="secondary" onClick={addTag}>Add</button></div></div>
    <div><div className="section-heading"><div className="section-label">Specifications</div><button type="button" className="text-btn" onClick={addSpec}>+ Add specification</button></div>{form.specifications.map((s,i)=><div className="spec-row" key={i}><input value={s.key || ''} onChange={e=>updateSpec(i,'key',e.target.value)} placeholder="Size"/><input value={s.value ?? ''} onChange={e=>updateSpec(i,'value',e.target.value)} placeholder='3/8"'/><input value={s.unit || ''} onChange={e=>updateSpec(i,'unit',e.target.value)} placeholder="unit (optional)"/><button type="button" className="icon-btn" onClick={()=>removeSpec(i)}>×</button></div>)}</div>
    <div className="actions"><button className="primary" type="submit">{submitLabel}</button></div>
  </form>
}
