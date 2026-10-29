import { useMemo, useState } from 'react'
import { idOf, nameOf } from '../lib/api'

const empty = { name:'', description:'', manufacturer_part_number:'', purpl_part_number:'', category_id:'', stock_unit:'each', tags:[], specifications:[] }

export default function PartForm({ initial, categories, tags=[], onSubmit, onCancel, onDelete, submitLabel='Save Part' }) {
  const seed = useMemo(() => ({...empty, ...initial, category_id: initial?.category_id || idOf(initial?.category) || '', stock_unit:initial?.stock_unit ?? 'each', specifications: initial?.specifications || initial?.specs || [], tags: initial?.tags || []}), [initial])
  const [form, setForm] = useState(seed)
  const [imageFile, setImageFile] = useState(null)
  const set = (key, value) => setForm((f) => ({...f, [key]:value}))
  const addSpec = () => set('specifications', [...form.specifications, {key:'', value:'', unit:''}])
  const updateSpec = (i,k,v) => set('specifications', form.specifications.map((s,n)=>n===i?{...s,[k]:v}:s))
  const removeSpec = (i) => set('specifications', form.specifications.filter((_,n)=>n!==i))
  const toggleTag = (tag) => set('tags', form.tags.some((item)=>item.toLocaleLowerCase()===tag.toLocaleLowerCase()) ? form.tags.filter((item)=>item.toLocaleLowerCase()!==tag.toLocaleLowerCase()) : [...form.tags,tag])
  const payload = () => ({
    name:form.name,
    description:form.description || '',
    manufacturer_part_number:form.manufacturer_part_number || null,
    purpl_part_number:form.purpl_part_number || null,
    category_id:form.category_id || null,
    stock_unit:form.stock_unit,
    tags:form.tags,
    specifications:form.specifications.filter((s)=>s.key.trim() && String(s.value).trim()),
    ...(imageFile ? {image_file:imageFile} : {}),
  })
  const normalized = (value) => JSON.stringify({
    name:value.name,
    description:value.description||'',
    manufacturer_part_number:value.manufacturer_part_number||null,
    purpl_part_number:value.purpl_part_number||null,
    category_id:value.category_id||null,
    stock_unit:value.stock_unit,
    tags:value.tags,
    specifications:value.specifications.filter((s)=>s.key.trim() && String(s.value).trim()).map((s)=>({key:s.key,value:String(s.value),unit:s.unit||null})),
  })
  return <form className="stack" onSubmit={(e)=>{e.preventDefault(); const values=payload(); if(initial && !imageFile && normalized(values)===normalized({...seed,manufacturer_part_number:seed.manufacturer_part_number||null,purpl_part_number:seed.purpl_part_number||null,category_id:seed.category_id||null})) return onCancel?.(); onSubmit(values)}}>
    <div className="form-grid">
      <label>Part name<input required value={form.name} onChange={e=>set('name',e.target.value)} placeholder="ESB03137" /></label>
      <label>Category<select value={form.category_id} onChange={e=>set('category_id',e.target.value)}><option value="">Uncategorized</option>{categories.map(c=><option key={idOf(c)} value={idOf(c)}>{nameOf(c)}</option>)}</select></label>
      <label className="span-2">Description<textarea value={form.description || ''} onChange={e=>set('description',e.target.value)} placeholder="What is this part?" /></label>
      <label>Manufacturer part #<input value={form.manufacturer_part_number || ''} onChange={e=>set('manufacturer_part_number',e.target.value)} /></label>
      <label>PURPL part #<input value={form.purpl_part_number || ''} onChange={e=>set('purpl_part_number',e.target.value)} /></label>
      <label>Stock unit<input required value={form.stock_unit} onChange={e=>set('stock_unit',e.target.value)} placeholder="each, ft, m..." /></label>
    </div>
    <div><div className="section-label">Tags</div><div className="chips">{form.tags.map(t=><button type="button" className="chip removable" key={t} onClick={()=>toggleTag(t)}>{t} ×</button>)}</div><div className="inline"><select value="" onChange={e=>{if(e.target.value)toggleTag(e.target.value)}}><option value="">Choose an existing tag</option>{tags.filter((t)=>!form.tags.some((selected)=>selected.toLocaleLowerCase()===t.toLocaleLowerCase())).map((t)=><option key={t} value={t}>{t}</option>)}</select></div></div>
    <label>Part image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" onChange={e=>setImageFile(e.target.files?.[0]||null)}/>{imageFile&&<small>{imageFile.name}</small>}{initial?.image_url&&!imageFile&&<img className="form-image-preview" src={initial.image_url} alt={`${initial.name} part`}/>}</label>
    <div><div className="section-heading"><div className="section-label">Specifications</div><button type="button" className="text-btn" onClick={addSpec}>+ Add specification</button></div>{form.specifications.map((s,i)=><div className="spec-row" key={i}><input value={s.key || ''} onChange={e=>updateSpec(i,'key',e.target.value)} placeholder="Specification name"/><input value={s.value ?? ''} onChange={e=>updateSpec(i,'value',e.target.value)} placeholder='3/8"'/><input value={s.unit || ''} onChange={e=>updateSpec(i,'unit',e.target.value)} placeholder="unit (optional)"/><button type="button" className="icon-btn" onClick={()=>removeSpec(i)}>×</button></div>)}</div>
    <div className="actions">{onDelete&&<button className="danger" type="button" onClick={onDelete}>Delete part</button>}<span className="action-spacer"/>{onCancel&&<button className="secondary" type="button" onClick={onCancel}>Cancel editing</button>}<button className="primary" type="submit">{submitLabel}</button></div>
  </form>
}
