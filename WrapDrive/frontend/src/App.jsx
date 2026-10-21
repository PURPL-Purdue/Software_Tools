import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, idOf, listFrom, nameOf } from './lib/api'
import Modal from './components/Modal'
import PartForm from './components/PartForm'

const tabs = [
  ['details','Part Details'], ['allocations','Allocations'], ['history','Stock History'],
  ['tracked','Track a Part'], ['relations','Related Parts'], ['attachments','Attachments']
]
const blankStock = {total:0,available:0,in_use:0,unavailable:0}
const fmt = (n) => Number(n || 0).toLocaleString(undefined,{maximumFractionDigits:6})
const date = (x) => x ? new Date(x).toLocaleString() : '—'

function Toast({toast,onClose}) { if(!toast)return null; return <div className={`toast ${toast.type||''}`} onClick={onClose}>{toast.message}</div> }
function Loading(){return <div className="loading"><div className="spinner"/>Loading…</div>}
function Empty({children}){return <div className="empty">{children}</div>}

export default function App(){
  const [parts,setParts]=useState([]), [categories,setCategories]=useState([]), [locations,setLocations]=useState([]), [tags,setTags]=useState([])
  const [selectedId,setSelectedId]=useState(null), [part,setPart]=useState(null), [stock,setStock]=useState(blankStock)
  const [tab,setTab]=useState('details'), [loading,setLoading]=useState(true), [detailLoading,setDetailLoading]=useState(false)
  const [query,setQuery]=useState(''), [category,setCategory]=useState(''), [tag,setTag]=useState(''), [location,setLocation]=useState('')
  const [modal,setModal]=useState(null), [toast,setToast]=useState(null)

  const notify=(message,type='success')=>{setToast({message,type});setTimeout(()=>setToast(null),3500)}
  const fail=(e)=>notify(e?.message || 'Something went wrong','error')

  const loadMeta=useCallback(async()=>{
    const [c,l,t]=await Promise.all([api.categories(),api.locations(),api.tags()])
    setCategories(listFrom(c)); setLocations(listFrom(l)); setTags(listFrom(t).map(nameOf).filter(Boolean))
  },[])
  const loadParts=useCallback(async()=>{
    const data=await api.listParts({q:query,category_id:category,tag,location_id:location,limit:200})
    setParts(listFrom(data))
  },[query,category,tag,location])
  const loadPart=useCallback(async(id)=>{
    if(!id){setPart(null);return}
    setDetailLoading(true)
    try{const [p,s]=await Promise.all([api.getPart(id),api.stock(id)]);setPart(p);setStock(s?.summary || s || blankStock)}catch(e){fail(e)}finally{setDetailLoading(false)}
  },[])

  useEffect(()=>{(async()=>{try{await Promise.all([loadMeta(),loadParts()])}catch(e){fail(e)}finally{setLoading(false)}})()},[])
  useEffect(()=>{const timer=setTimeout(()=>loadParts().catch(fail),250);return()=>clearTimeout(timer)},[loadParts])
  useEffect(()=>{loadPart(selectedId)},[selectedId,loadPart])

  const categoryName=(p)=>nameOf(p?.category)||nameOf(categories.find(c=>idOf(c)===(p?.category_id||'')))||'Uncategorized'
  const unit=part?.stock_unit || 'units'
  const allocations=part?.allocations || stock?.allocations || []
  const locationMap=useMemo(()=>Object.fromEntries(locations.map(l=>[idOf(l),l])),[locations])

  async function refresh(){await Promise.all([loadMeta(),loadParts()]); if(selectedId) await loadPart(selectedId)}
  async function createPart(body){try{const created=await api.createPart(body);setModal(null);await refresh();setSelectedId(idOf(created));notify('Part created')}catch(e){fail(e)}}
  async function updatePart(body){try{await api.updatePart(selectedId,body);setModal(null);await refresh();notify('Part updated')}catch(e){fail(e)}}

  if(loading) return <div className="app-shell"><Header/><Loading/></div>
  return <div className="app-shell">
    <Header/>
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><div><span className="eyebrow">Inventory</span><h1>Parts</h1></div><button className="primary compact" onClick={()=>setModal('addPart')}>+ Add Part</button></div>
        <div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search part name or number"/></div>
        <div className="filters">
          <select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c=><option key={idOf(c)} value={idOf(c)}>{nameOf(c)}</option>)}</select>
          <select value={tag} onChange={e=>setTag(e.target.value)}><option value="">All tags</option>{tags.map(t=><option key={t}>{t}</option>)}</select>
          <select value={location} onChange={e=>setLocation(e.target.value)}><option value="">All locations</option>{locations.map(l=><option key={idOf(l)} value={idOf(l)}>{nameOf(l)}</option>)}</select>
        </div>
        <div className="list-head"><span>{parts.length} parts</span><button className="text-btn" onClick={()=>setModal('categories')}>Edit categories</button></div>
        <div className="part-list">{parts.length?parts.map(p=><button key={idOf(p)} className={`part-row ${selectedId===idOf(p)?'active':''}`} onClick={()=>{setSelectedId(idOf(p));setTab('details')}}><div className="part-icon">{(categoryName(p)[0]||'P').toUpperCase()}</div><div><strong>{p.name}</strong><small>{p.description||p.purpl_part_number||categoryName(p)}</small><span>{categoryName(p)}</span></div></button>):<Empty>No parts match these filters.</Empty>}</div>
      </aside>

      <section className="content">
        {!selectedId?<Welcome onAdd={()=>setModal('addPart')}/>:detailLoading?<Loading/>:part?<>
          <div className="breadcrumb">Home <b>›</b> Parts <b>›</b> {categoryName(part)} <b>›</b> {part.name}</div>
          <div className="part-header"><div><span className="eyebrow">{categoryName(part)}</span><h2>{part.name}</h2><p>{part.description||'No description yet.'}</p></div><button className="secondary" onClick={()=>setModal('editPart')}>Edit part</button></div>
          <div className="summary-grid"><Stat label="In Stock" value={fmt(stock.total ?? stock.total_quantity)} unit={unit}/><Stat label="Available" value={fmt(stock.available ?? stock.available_quantity)} unit={unit}/><Stat label="In Use" value={fmt(stock.in_use ?? stock.in_use_quantity)} unit={unit}/><Stat label="Unavailable" value={fmt(stock.unavailable ?? stock.unavailable_quantity)} unit={unit}/></div>
          <nav className="tabs">{tabs.map(([k,label])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{label}</button>)}</nav>
          <div className="detail-grid"><section className="panel main-panel">
            {tab==='details'&&<Details part={part} category={categoryName(part)}/>} 
            {tab==='allocations'&&<Allocations part={part} allocations={allocations} locations={locations} onSaved={refresh} notify={notify} fail={fail}/>} 
            {tab==='history'&&<History partId={selectedId} locations={locationMap}/>} 
            {tab==='tracked'&&<Tracked partId={selectedId} locations={locations} refresh={refresh} notify={notify} fail={fail}/>} 
            {tab==='relations'&&<Relations part={part} allParts={parts} refresh={refresh} notify={notify} fail={fail}/>} 
            {tab==='attachments'&&<Attachments partId={selectedId} notify={notify} fail={fail}/>} 
          </section><aside className="right-rail"><TagsNotes part={part} refresh={refresh} notify={notify} fail={fail}/></aside></div>
        </>:<Empty>Part not found.</Empty>}
      </section>
    </main>
    {modal==='addPart'&&<Modal title="Add a Part" wide onClose={()=>setModal(null)}><PartForm categories={categories} onSubmit={createPart}/></Modal>}
    {modal==='editPart'&&<Modal title={`Edit ${part.name}`} wide onClose={()=>setModal(null)}><PartForm initial={part} categories={categories} onSubmit={updatePart} submitLabel="Finish Editing"/></Modal>}
    {modal==='categories'&&<Modal title="Edit Categories" onClose={()=>setModal(null)}><CategoryManager categories={categories} refresh={refresh} notify={notify} fail={fail}/></Modal>}
    <Toast toast={toast} onClose={()=>setToast(null)}/>
  </div>
}

function Header(){return <header className="topbar"><div className="brand"><div className="brand-mark">W</div><div><strong>WrapDrive</strong><small>PURPL Inventory</small></div></div><div className="top-status"><span className="status-dot"/> Inventory workspace</div></header>}
function Welcome({onAdd}){return <div className="welcome"><div className="welcome-icon">⌁</div><h2>Inventory, without the spreadsheet archaeology.</h2><p>Search for a part on the left or add the first one. Engineering details, stock allocations, serialized units, related parts, and documents stay together.</p><button className="primary" onClick={onAdd}>+ Add a Part</button></div>}
function Stat({label,value,unit}){return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>}
function Details({part,category}){const specs=part.specifications||part.specs||[];return <><div className="panel-title"><div><span className="eyebrow">Engineering</span><h3>Part Details</h3></div></div><dl className="details"><div><dt>Name</dt><dd>{part.name}</dd></div><div><dt>Description</dt><dd>{part.description||'—'}</dd></div><div><dt>Manufacturer Part Number</dt><dd>{part.manufacturer_part_number||'—'}</dd></div><div><dt>PURPL Part Number</dt><dd>{part.purpl_part_number||'—'}</dd></div><div><dt>Category</dt><dd>{category}</dd></div><div><dt>Stock Unit</dt><dd>{part.stock_unit||'each'}</dd></div></dl><div className="subsection"><h4>Specifications</h4>{specs.length?<dl className="spec-list">{specs.map((s,i)=><div key={i}><dt>{s.key||s.name}</dt><dd>{s.value}{s.unit?` ${s.unit}`:''}</dd></div>)}</dl>:<Empty>No specifications have been added.</Empty>}</div></>}

function Allocations({part,allocations,locations,onSaved,notify,fail}){
  const current=useMemo(()=>Object.fromEntries(allocations.map(a=>[a.location_id||idOf(a.location),Number(a.quantity||0)])),[allocations])
  const [editing,setEditing]=useState(false), [values,setValues]=useState(current), [notes,setNotes]=useState({}), [actor,setActor]=useState('')
  useEffect(()=>setValues(current),[current])
  const rows=locations.filter(l=>l.active!==false)
  async function save(){const edits=rows.filter(l=>Number(values[idOf(l)]||0)!==Number(current[idOf(l)]||0)).map(l=>({location_id:idOf(l),new_quantity:Number(values[idOf(l)]||0),note:(notes[idOf(l)]||'').trim()}));if(!edits.length){setEditing(false);return}if(!actor.trim())return fail(new Error('Enter your name for the stock history.'));if(edits.some(e=>!e.note))return fail(new Error('Add a short note for every changed location.'));try{await api.reconcileStock(idOf(part),{actor:actor.trim(),edits});setEditing(false);setNotes({});await onSaved();notify('Stock updated and recorded in history')}catch(e){fail(e)}}
  return <><div className="panel-title"><div><span className="eyebrow">Inventory</span><h3>Allocations</h3></div><button className={editing?'primary':'secondary'} onClick={()=>editing?save():setEditing(true)}>{editing?'Finish Updating Stock':'Update Stock'}</button></div>{editing&&<div className="callout"><label>Your name<input value={actor} onChange={e=>setActor(e.target.value)} placeholder="Who is making this update?"/></label><p>Change quantities below. Each changed row needs its own note so the history remains useful.</p></div>}<div className="allocation-list">{rows.map(l=>{const lid=idOf(l), changed=Number(values[lid]||0)!==Number(current[lid]||0);return <div className={`allocation ${changed?'changed':''}`} key={lid}><div><strong>{nameOf(l)}</strong><small>{l.state?.replace('_',' ')||'available'}</small></div>{editing?<><input className="qty" type="number" min="0" step="any" value={values[lid]??0} onChange={e=>setValues(v=>({...v,[lid]:e.target.value}))}/><input className="note-input" value={notes[lid]||''} disabled={!changed} onChange={e=>setNotes(n=>({...n,[lid]:e.target.value}))} placeholder={changed?'Required note for this change':'No change'}/></>:<strong>{fmt(current[lid])} {part.stock_unit||'units'}</strong>}</div>})}</div></>
}

function History({partId,locations}){const [items,setItems]=useState(null);useEffect(()=>{api.stockHistory(partId).then(x=>setItems(listFrom(x))).catch(()=>setItems([]))},[partId]);if(!items)return <Loading/>;return <><div className="panel-title"><div><span className="eyebrow">Audit trail</span><h3>Stock History</h3></div></div>{items.length?<div className="timeline">{items.map((e,i)=><div className="event" key={idOf(e)||i}><div className="event-dot"/><div><strong>{eventText(e,locations)}</strong><p>{e.note||'No note provided'}</p><small>{e.actor||'Unknown'} · {date(e.created_at||e.timestamp)}</small></div></div>)}</div>:<Empty>No stock changes recorded yet.</Empty>}</>}
function eventText(e,locations){const q=fmt(e.quantity);const from=nameOf(locations[e.from_location_id])||'stock';const to=nameOf(locations[e.to_location_id])||'stock';if(e.operation==='move'||e.operation==='move_tracked_unit')return `${q} moved from ${from} to ${to}`;if(e.operation==='receive')return `${q} received into ${to}`;if(e.operation==='remove')return `${q} removed from ${from}`;if(e.operation==='serialize')return `Serialized ${q} unit`;return `${e.operation?.replaceAll('_',' ')||'Stock updated'} · ${q}`}

function Tracked({partId,locations,refresh,notify,fail}){const [units,setUnits]=useState(null),[show,setShow]=useState(false);const load=()=>api.trackedUnits(partId).then(x=>setUnits(listFrom(x))).catch(e=>{setUnits([]);fail(e)});useEffect(load,[partId]);async function add(e){e.preventDefault();const f=new FormData(e.currentTarget);try{await api.createTrackedUnit(partId,{serial:f.get('serial'),location_id:f.get('location_id'),description:f.get('description'),kit:f.get('kit')||null,actor:f.get('actor')});setShow(false);await Promise.all([load(),refresh()]);notify('Tracked unit created')}catch(err){fail(err)}}return <><div className="panel-title"><div><span className="eyebrow">Serialized inventory</span><h3>Track a Part</h3></div><button className="primary compact" onClick={()=>setShow(true)}>+ Track unit</button></div>{!units?<Loading/>:units.length?<div className="card-list">{units.map(u=><div className="unit-card" key={idOf(u)}><div><strong>{u.serial||u.name}</strong><span className={`badge ${u.status||''}`}>{u.status||'active'}</span></div><p>{u.description||'No identifying notes.'}</p><small>{nameOf(locations.find(l=>idOf(l)===u.location_id))||'Unknown location'}{u.kit?` · Kit: ${u.kit}`:''} · Added {date(u.created_at)}</small></div>)}</div>:<Empty>No individually tracked units.</Empty>}{show&&<Modal title="Track a Part" onClose={()=>setShow(false)}><form className="stack" onSubmit={add}><label>Serial / tracking name<input name="serial" required placeholder="ESB03137-1"/></label><label>Location<select name="location_id" required><option value="">Choose location</option>{locations.filter(l=>l.active!==false).map(l=><option value={idOf(l)} key={idOf(l)}>{nameOf(l)}</option>)}</select></label><label>Description<textarea name="description" placeholder="Sharpie dot, loose lever…"/></label><label>Kit<input name="kit" placeholder="Optional"/></label><label>Your name<input name="actor" required/></label><button className="primary">Add tracked unit</button></form></Modal>}</>}

function Relations({part,allParts,refresh,notify,fail}){const [show,setShow]=useState(false);const rels=part.relations||[];async function add(e){e.preventDefault();const f=new FormData(e.currentTarget);try{await api.addRelation(idOf(part),{related_part_id:f.get('related_part_id'),note:f.get('note')||''});setShow(false);await refresh();notify('Related part added')}catch(err){fail(err)}}return <><div className="panel-title"><div><span className="eyebrow">Engineering context</span><h3>Related Parts</h3></div><button className="primary compact" onClick={()=>setShow(true)}>+ Add a Part</button></div>{rels.length?<div className="card-list">{rels.map((r,i)=>{const rp=r.related_part||allParts.find(p=>idOf(p)===(r.related_part_id||r.part_id));return <div className="relation-card" key={idOf(r)||i}><strong>{rp?.name||r.name||r.related_part_id}</strong><p>{rp?.description||r.note||'Related part'}</p></div>})}</div>:<Empty>No related parts yet.</Empty>}{show&&<Modal title="Add Related Part" onClose={()=>setShow(false)}><form className="stack" onSubmit={add}><label>Part<select name="related_part_id" required><option value="">Choose a part</option>{allParts.filter(p=>idOf(p)!==idOf(part)).map(p=><option value={idOf(p)} key={idOf(p)}>{p.name} — {p.description}</option>)}</select></label><label>Relationship note<input name="note" placeholder="Mating fitting, mounting hardware…"/></label><button className="primary">Add relation</button></form></Modal>}</>}

function Attachments({partId,notify,fail}){const [items,setItems]=useState(null);const load=()=>api.attachments(partId).then(x=>setItems(listFrom(x))).catch(e=>{setItems([]);fail(e)});useEffect(load,[partId]);async function upload(e){e.preventDefault();const form=e.currentTarget;const raw=new FormData(form);const data=new FormData();data.append('file',raw.get('file'));data.append('kind',raw.get('kind'));data.append('note',raw.get('note'));data.append('uploaded_by',raw.get('uploaded_by'));try{await api.uploadAttachment(partId,data);form.reset();await load();notify('Attachment uploaded')}catch(err){fail(err)}}return <><div className="panel-title"><div><span className="eyebrow">Documents</span><h3>Attachments</h3></div></div><form className="upload" onSubmit={upload}><input name="file" type="file" required/><select name="kind" defaultValue="datasheet"><option value="datasheet">Datasheet</option><option value="manual">Manual</option><option value="drawing">Engineering drawing</option><option value="other">Other</option></select><input name="note" placeholder="Description"/><input name="uploaded_by" placeholder="Your name" required/><button className="primary compact">Attach file</button></form>{!items?<Loading/>:items.length?<div className="card-list">{items.map(a=><a className="attachment-card" key={idOf(a)} href={api.attachmentUrl(partId,idOf(a))} target="_blank" rel="noreferrer"><div className="file-icon">↗</div><div><strong>{a.filename||a.name}</strong><p>{a.note||a.kind||'Attachment'}</p><small>{a.uploaded_by||'Unknown'} · {date(a.created_at)}</small></div></a>)}</div>:<Empty>No files attached yet.</Empty>}</>}

function TagsNotes({part,refresh,notify,fail}){const [note,setNote]=useState(''),[author,setAuthor]=useState('');async function add(){if(!note.trim()||!author.trim())return;try{await api.addNote(idOf(part),{text:note.trim(),author:author.trim()});setNote('');await refresh();notify('Note added')}catch(e){fail(e)}}return <><section className="rail-card"><h4>All Tags</h4><div className="chips">{part.tags?.length?part.tags.map(t=><span className="chip" key={t}>{t}</span>):<span className="muted">No tags</span>}</div></section><section className="rail-card"><h4>Notes</h4><div className="notes">{part.notes?.length?part.notes.map((n,i)=><article key={n.id||i}><p>{n.text||n.note}</p><small>{n.author||n.actor||'Unknown'} · {date(n.created_at||n.timestamp)}</small></article>):<span className="muted">There are no comments on this part.</span>}</div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note…"/><div className="inline"><input value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Your name"/><button className="secondary compact" onClick={add}>Add</button></div></section><section className="rail-card"><h4>Record</h4><dl className="mini"><div><dt>Updated</dt><dd>{date(part.updated_at)}</dd></div><div><dt>Stock version</dt><dd>{part.stock_version??'—'}</dd></div></dl></section></>}

function CategoryManager({categories,refresh,notify,fail}){const [name,setName]=useState('');async function add(){if(!name.trim())return;try{await api.createCategory(name.trim());setName('');await refresh();notify('Category added')}catch(e){fail(e)}}async function del(c){if(!confirm(`Delete category “${nameOf(c)}”?`))return;try{await api.deleteCategory(idOf(c));await refresh();notify('Category deleted')}catch(e){fail(e)}}return <div className="stack"><div className="inline"><input value={name} onChange={e=>setName(e.target.value)} placeholder="New category"/><button className="primary compact" onClick={add}>Add</button></div><div className="manage-list">{categories.map(c=><div key={idOf(c)}><span>{nameOf(c)}</span><button className="danger-text" onClick={()=>del(c)}>Delete</button></div>)}</div></div>}
