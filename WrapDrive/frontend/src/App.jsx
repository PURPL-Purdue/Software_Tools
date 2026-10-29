import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, idOf, listFrom, nameOf } from './lib/api'
import Modal from './components/Modal'
import PartForm from './components/PartForm'
import purplLogo from './PURPL_Logo.png'

const tabs = [
  ['details','Part Details'], ['allocations','Allocations'], ['history','Stock History'],
  ['tracked','Track a Part'], ['relations','Related Parts'], ['attachments','Attachments']
]
const blankStock = {total:0,available:0,unavailable:0}
const fmt = (n) => Number(n || 0).toLocaleString(undefined,{maximumFractionDigits:6})
const date = (x) => {
  if(!x)return '—'
  const timestamp=typeof x==='string'&&x.includes('T')&&!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(x)?`${x}Z`:x
  return new Date(timestamp).toLocaleString(undefined,{timeZone:'America/New_York'})
}
const displayUnit = (unit) => !unit?.trim() || unit.trim().toLowerCase()==='each' ? 'units' : unit.trim()

function Toast({toast,onClose}) { if(!toast)return null; return <div className={`toast ${toast.type||''}`} onClick={onClose}>{toast.message}</div> }
function Loading(){return <div className="loading"><div className="spinner"/>Loading…</div>}
function Empty({children}){return <div className="empty">{children}</div>}

export default function App(){
  const [parts,setParts]=useState([]), [categories,setCategories]=useState([]), [locations,setLocations]=useState([]), [tags,setTags]=useState([])
  const [selectedId,setSelectedId]=useState(()=>{const route=window.location.hash.split('/');return route[1]==='parts'?route[2]||null:null}), [part,setPart]=useState(null), [stock,setStock]=useState(blankStock)
  const [tab,setTab]=useState(()=>{const routeTab=window.location.hash.split('/')[3];return tabs.some(([key])=>key===routeTab)?routeTab:'details'}), [loading,setLoading]=useState(true), [detailLoading,setDetailLoading]=useState(false)
  const [query,setQuery]=useState(''), [category,setCategory]=useState(''), [tag,setTag]=useState(''), [location,setLocation]=useState('')
  const [sortBy,setSortBy]=useState('name')
  const [modal,setModal]=useState(null), [toast,setToast]=useState(null)

  const navigate=(id=selectedId,nextTab='details')=>{
    const hash=id?`#/parts/${id}/${nextTab}`:'#/'
    window.history.pushState({id,tab:nextTab},'',hash)
    setSelectedId(id)
    setTab(nextTab)
  }
  const goHome=()=>{
    setQuery('')
    setCategory('')
    setTag('')
    setLocation('')
    setSortBy('name')
    navigate(null)
  }
  const returnToFilters=(crumbs,index)=>{
    const filters={category:'',tag:'',location:''}
    crumbs.slice(0,index+1).forEach(({type,value})=>{filters[type]=value})
    setQuery('');setCategory(filters.category);setTag(filters.tag);setLocation(filters.location);navigate(null)
  }

  const notify=useCallback((message,type='success')=>{setToast({message,type});setTimeout(()=>setToast(null),3500)},[])
  const fail=useCallback((e)=>notify(e?.message || 'Something went wrong','error'),[notify])

  const loadMeta=useCallback(async()=>{
    const [c,l,t]=await Promise.all([api.categories(),api.locations(),api.tags()])
    setCategories(listFrom(c)); setLocations(listFrom(l)); setTags(listFrom(t).map(nameOf).filter(Boolean))
  },[])
  const loadParts=useCallback(async()=>{
    const data=await api.listParts({q:query,category_id:category,tags:tag,location_id:location,limit:200})
    setParts(listFrom(data))
  },[query,category,tag,location])
  const loadPart=useCallback(async(id)=>{
    if(!id){setPart(null);return}
    setDetailLoading(true)
    try{const [p,s]=await Promise.all([api.getPart(id),api.stock(id)]);setPart(p);setStock(s?.summary || s || blankStock)}catch(e){fail(e)}finally{setDetailLoading(false)}
  },[fail])

  useEffect(()=>{void (async()=>{try{await Promise.all([loadMeta(),loadParts()])}catch(e){fail(e)}finally{setLoading(false)}})()},[loadMeta,loadParts,fail])
  useEffect(()=>{const timer=setTimeout(()=>loadParts().catch(fail),250);return()=>clearTimeout(timer)},[loadParts,fail])
  useEffect(()=>{void Promise.resolve().then(()=>loadPart(selectedId))},[selectedId,loadPart])
  useEffect(()=>{
    const restore=()=>{
      const [,route,id,routeTab]=window.location.hash.split('/')
      setSelectedId(route==='parts'?id||null:null)
      setTab(tabs.some(([key])=>key===routeTab)?routeTab:'details')
    }
    window.addEventListener('popstate',restore)
    return()=>window.removeEventListener('popstate',restore)
  },[])

  const categoryName=(p)=>nameOf(p?.category)||nameOf(categories.find(c=>idOf(c)===(p?.category_id||'')))||'Uncategorized'
  const unit=displayUnit(part?.stock_unit)
  const allocations=part?.allocations || stock?.allocations || []
  const locationMap=useMemo(()=>Object.fromEntries(locations.map(l=>[idOf(l),l])),[locations])
  const filterCrumbs=[]
  if(category)filterCrumbs.push({type:'category',value:category,label:nameOf(categories.find(c=>idOf(c)===category))||'Category'})
  if(tag)filterCrumbs.push({type:'tag',value:tag,label:`Tag: ${tag}`})
  if(location)filterCrumbs.push({type:'location',value:location,label:`Location: ${nameOf(locations.find(l=>idOf(l)===location))||'Location'}`})
  if(part&&!filterCrumbs.length)filterCrumbs.push({type:'category',value:part.category_id||'',label:categoryName(part)})

  async function refresh(){await Promise.all([loadMeta(),loadParts()]); if(selectedId) await loadPart(selectedId)}
  async function saveImage(partId,file){
    if(!file)return null
    const data=new FormData();data.append('file',file);data.append('kind','photo');data.append('note','Part image');data.append('uploaded_by','Shulker')
    const attachment=await api.uploadAttachment(partId,data)
    return api.attachmentUrl(partId,idOf(attachment),true)
  }
  async function createPart(body){try{const {image_file,...values}=body;const created=await api.createPart(values);if(image_file){const image_url=await saveImage(idOf(created),image_file);await api.updatePart(idOf(created),{image_url})}setModal(null);await refresh();navigate(idOf(created));notify('Part created')}catch(e){fail(e)}}
  async function updatePart(body){try{const {image_file,...values}=body;await api.updatePart(selectedId,values);if(image_file){const image_url=await saveImage(selectedId,image_file);await api.updatePart(selectedId,{image_url})}setModal(null);await refresh();notify('Part updated')}catch(e){fail(e)}}
  async function deletePart(){
    if(!confirm(`Are you sure you wish to delete ${part.name}?`))return
    try{
      try{await api.deletePart(selectedId)}catch(error){if(error.status===409&&error.message.includes('cannot be hard-deleted'))await api.updatePart(selectedId,{archived:true});else throw error}
      setModal(null);navigate(null);setPart(null);await Promise.all([loadMeta(),loadParts()]);notify('Part deleted')
    }catch(error){fail(error)}
  }

  if(loading) return <div className="app-shell"><Header onHome={goHome}/><main className="workspace"><section className="content"><Loading/><AppFooter/></section></main></div>
  return <div className="app-shell">
    <Header onHome={goHome}/>
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-title"><div><span className="eyebrow">Inventory</span><h1>Parts</h1></div><button className="primary compact" onClick={()=>setModal('addPart')}>+ Add Part</button></div>
        <div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search part name or number"/></div>
        <div className="filters">
          <select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c=><option key={idOf(c)} value={idOf(c)}>{nameOf(c)}</option>)}</select>
          <select value={tag} onChange={e=>setTag(e.target.value)}><option value="">All tags</option>{tags.map(t=><option key={t}>{t}</option>)}</select>
          <select value={location} onChange={e=>setLocation(e.target.value)}><option value="">All locations</option>{locations.filter(l=>l.active!==false).map(l=><option key={idOf(l)} value={idOf(l)}>{nameOf(l)}</option>)}</select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} aria-label="Sort parts"><option value="name">Sort: name</option><option value="category">Sort: category</option><option value="tag">Sort: tag</option></select>
        </div>
        <div className="list-head"><span>{parts.length} parts</span><div className="list-management"><button className="text-btn" onClick={()=>setModal('tags')}>Edit tags</button><button className="text-btn" onClick={()=>setModal('categories')}>Edit categories</button></div></div>
        <div className="part-list">{parts.length?[...parts].sort((a,b)=>{const value=(part)=>sortBy==='category'?categoryName(part):sortBy==='tag'?(part.tags||[]).join(', '):part.name||'';return value(a).localeCompare(value(b),undefined,{sensitivity:'base'})}).map(p=><button key={idOf(p)} className={`part-row ${selectedId===idOf(p)?'active':''}`} onClick={()=>navigate(idOf(p))}>{p.image_url?<img className="part-thumb" src={p.image_url} alt=""/>:<div className="part-icon">{(categoryName(p)[0]||'P').toUpperCase()}</div>}<div><strong>{p.name}</strong><small>{p.description||p.purpl_part_number||categoryName(p)}</small><span>{categoryName(p)}</span>{p.tags?.length>0&&<span className="part-tags">{p.tags.join(' · ')}</span>}</div></button>):<Empty>No parts match these filters.</Empty>}</div>
      </aside>

      <section className="content">
        {!selectedId?<Welcome parts={parts} categoryName={categoryName} filterCrumbs={filterCrumbs} onHome={goHome} onCrumb={(index)=>returnToFilters(filterCrumbs,index)} onSelect={(id)=>navigate(id)} onAdd={()=>setModal('addPart')}/>:detailLoading?<Loading/>:part?<>
          <div className="breadcrumb"><button onClick={goHome}>Home</button><b>›</b><button onClick={goHome}>Parts</button>{filterCrumbs.map((crumb,index)=><span className="breadcrumb-filter" key={`${crumb.type}-${crumb.value}`}><b>›</b><button onClick={()=>returnToFilters(filterCrumbs,index)}>{crumb.label}</button></span>)}<b>›</b><span>{part.name}</span></div>
          <div className="part-header"><div><span className="eyebrow">{categoryName(part)}</span><h2>{part.name}</h2><p>{part.description||'No description yet.'}</p></div><div className="part-header-actions"><button className="secondary" onClick={()=>setModal('editPart')}>Edit part</button><small>Last updated: {date(part.updated_at)}</small></div></div>
          <div className="summary-grid"><Stat label="In Stock" value={fmt(stock.total ?? stock.total_quantity)} unit={unit}/><Stat label="Available" value={fmt(stock.available ?? stock.available_quantity)} unit={unit}/><Stat label="Unavailable" value={fmt(stock.unavailable ?? stock.unavailable_quantity)} unit={unit}/></div>
          <nav className="tabs">{tabs.map(([k,label])=><button key={k} className={tab===k?'active':''} onClick={()=>navigate(selectedId,k)}>{label}</button>)}</nav>
          <div className="detail-grid"><section className="panel main-panel">
            {tab==='details'&&<Details part={part} category={categoryName(part)}/>} 
            {tab==='allocations'&&<Allocations part={part} allocations={allocations} locations={locations} onSaved={refresh} notify={notify} fail={fail}/>} 
            {tab==='history'&&<History partId={selectedId} locations={locationMap} unit={unit}/>}
            {tab==='tracked'&&<Tracked partId={selectedId} locations={locations} refresh={refresh} notify={notify} fail={fail}/>} 
            {tab==='relations'&&<Relations part={part} allParts={parts} refresh={refresh} notify={notify} fail={fail} onNavigate={(id)=>navigate(id)}/>}
            {tab==='attachments'&&<Attachments partId={selectedId} part={part} notify={notify} fail={fail}/>}
          </section><aside className="right-rail"><TagsNotes part={part} refresh={refresh} notify={notify} fail={fail}/></aside></div>
        </>:<Empty>Part not found.</Empty>}
        <AppFooter/>
      </section>
    </main>
    {modal==='addPart'&&<Modal title="Add a Part" wide onClose={()=>setModal(null)}><PartForm categories={categories} tags={tags} onSubmit={createPart}/></Modal>}
    {modal==='editPart'&&<Modal title={`Edit ${part.name}`} wide onClose={()=>setModal(null)}><PartForm initial={part} categories={categories} tags={tags} onSubmit={updatePart} onCancel={()=>setModal(null)} onDelete={deletePart} submitLabel="Finish Editing"/></Modal>}
    {modal==='categories'&&<Modal title="Edit Categories" onClose={()=>setModal(null)}><CategoryManager categories={categories} refresh={refresh} notify={notify} fail={fail}/></Modal>}
    {modal==='tags'&&<Modal title="Manage Tags" onClose={()=>setModal(null)}><TagManager tags={tags} refresh={refresh} notify={notify} fail={fail}/></Modal>}
    <Toast toast={toast} onClose={()=>setToast(null)}/>
  </div>
}

function Header({onHome}){return <header className="topbar"><button className="brand brand-home" onClick={onHome} aria-label="Go to Shulker home"><img className="brand-logo" src={purplLogo} alt="PURPL logo"/><div><strong>Shulker</strong><small>PURPL Inventory</small></div></button><div className="top-status"><span className="status-dot"/> Inventory workspace</div></header>}
function AppFooter(){const [version]=useState(()=>date(new Date()));return <footer className="app-footer"><div className="footer-info"><strong>Purdue Undergraduate Rocket Propulsion Lab</strong><span>For use by PURPL affiliates</span><span>Version {version}</span></div></footer>}
function Welcome({parts,categoryName,filterCrumbs,onHome,onCrumb,onSelect,onAdd}){return <section className="home-catalog"><div className="breadcrumb"><button onClick={onHome}>Home</button><b>›</b><button onClick={onHome}>Parts</button>{filterCrumbs.map((crumb,index)=><span className="breadcrumb-filter" key={`${crumb.type}-${crumb.value}`}><b>›</b><button onClick={()=>onCrumb(index)}>{crumb.label}</button></span>)}</div><header className="home-catalog-head"><div><span className="eyebrow">Inventory</span><h2>Parts</h2></div><button className="primary" onClick={onAdd}>+ Add a Part</button></header>{parts.length?<div className="part-gallery">{parts.map((part)=><button type="button" className="part-gallery-card" key={idOf(part)} onClick={()=>onSelect(idOf(part))}>{part.image_url?<img src={part.image_url} alt={part.name}/>:<div className="part-gallery-placeholder">{(categoryName(part)[0]||'P').toUpperCase()}</div>}<div className="part-gallery-copy"><strong>{part.name}</strong><span className="part-gallery-category">{categoryName(part)}</span><p>{part.description||'No description yet.'}</p></div></button>)}</div>:<div className="empty home-empty">No parts yet. Add the first part to begin.</div>}</section>}
function Stat({label,value,unit}){return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>}
function Details({part,category}){const specs=part.specifications||part.specs||[];return <><div className="panel-title"><h3>Part Details</h3></div><div className="engineering-layout"><div className="engineering-copy"><dl className="details"><div><dt>Name</dt><dd>{part.name}</dd></div><div><dt>Description</dt><dd>{part.description||'—'}</dd></div><div><dt>Manufacturer Part Number</dt><dd>{part.manufacturer_part_number||'—'}</dd></div><div><dt>PURPL Part Number</dt><dd>{part.purpl_part_number||'—'}</dd></div><div><dt>Category</dt><dd>{category}</dd></div><div><dt>Stock Unit</dt><dd>{displayUnit(part.stock_unit)}</dd></div></dl><div className="subsection"><h4>Specifications</h4>{specs.length?<dl className="spec-list">{specs.map((s,i)=><div key={i}><dt>{s.key||s.name}</dt><dd>{s.value}{s.unit?` ${s.unit}`:''}</dd></div>)}</dl>:<Empty>No specifications have been added.</Empty>}</div></div>{part.image_url&&<figure className="engineering-image"><img src={part.image_url} alt={`${part.name} part`}/></figure>}</div></>}

function Allocations({part,allocations,locations,onSaved,notify,fail}){
  const current=useMemo(()=>Object.fromEntries(allocations.map(a=>[a.location_id||idOf(a.location),Number(a.quantity||0)])),[allocations])
  const [editing,setEditing]=useState(false), [values,setValues]=useState(null), [notes,setNotes]=useState({}), [actor,setActor]=useState('')
  const [states,setStates]=useState(null), [newLocation,setNewLocation]=useState(''), [newLocationState,setNewLocationState]=useState('available')
  const rows=locations
  const startEditing=()=>{setValues({...current});setStates(Object.fromEntries(locations.map((location)=>[idOf(location),location.state||'available'])));setEditing(true)}
  const cancel=()=>{setEditing(false);setValues(null);setNotes({});setActor('');setStates(null)}
  async function addLocation(){
    if(!newLocation.trim())return
    try{await api.createLocation({name:newLocation.trim(),state:newLocationState});setNewLocation('');await onSaved();notify('Stock location added')}
    catch(error){fail(error)}
  }
  async function renameLocation(location){
    const name=prompt('Edit location name',nameOf(location))
    if(!name?.trim()||name.trim()===nameOf(location))return
    try{await api.updateLocation(idOf(location),{name:name.trim()});await onSaved();notify('Location updated')}
    catch(error){fail(error)}
  }
  async function deleteLocation(location){
    if(!confirm(`Delete location "${nameOf(location)}"?`))return
    try{await api.deleteLocation(idOf(location));await onSaved();notify('Location deleted')}
    catch(error){fail(error)}
  }
  async function save(){
    const edits=rows.filter((location)=>Number(values?.[idOf(location)]??current[idOf(location)]??0)!==Number(current[idOf(location)]||0)).map((location)=>({location_id:idOf(location),new_quantity:Number(values?.[idOf(location)]??current[idOf(location)]??0),note:(notes[idOf(location)]||'').trim()}))
    const changedStates=rows.filter((location)=>(states?.[idOf(location)]||location.state||'available')!==(location.state||'available'))
    if(!edits.length&&!changedStates.length){cancel();return}
    if(edits.length&&!actor.trim())return fail(new Error('Enter your name for the stock history.'))
    if(edits.some((edit)=>!edit.note))return fail(new Error('Add a short note for every changed location.'))
    try{
      for(const location of changedStates)await api.updateLocation(idOf(location),{state:states[idOf(location)]})
      if(edits.length)await api.reconcileStock(idOf(part),{actor:actor.trim(),edits})
      setEditing(false);setValues(null);setStates(null);setNotes({});await onSaved();notify('Stock updated')
    }catch(error){fail(error)}
  }
  return <>
    <div className="panel-title"><div><span className="eyebrow">Inventory</span><h3>Allocations</h3></div><div className="inline-actions">{editing&&<button className="secondary" onClick={cancel}>Cancel stock update</button>}<button className={editing?'primary':'secondary'} onClick={()=>editing?save():startEditing()}>{editing?'Finish Updating Stock':'Update Stock'}</button></div></div>
    {editing&&<div className="callout stock-editor"><label>Your name<input value={actor} onChange={e=>setActor(e.target.value)} placeholder="Who is making this update?"/></label><p>Enter quantities below. Add a note for each quantity change.</p></div>}
    <div className="allocation-list">{rows.length?rows.map((location)=>{const lid=idOf(location), quantity=values?.[lid]??current[lid]??0, changed=Number(quantity)!==Number(current[lid]||0);return <div className={`allocation ${changed?'changed':''}`} key={lid}><div><div className="location-heading"><strong>{nameOf(location)}</strong>{editing&&<div className="location-actions"><button className="text-btn" type="button" onClick={()=>renameLocation(location)}>Edit name</button><button className="danger-text" type="button" onClick={()=>deleteLocation(location)}>Delete</button></div>}</div>{editing?<select aria-label={`${nameOf(location)} usage state`} value={states?.[lid]||location.state||'available'} onChange={e=>setStates(value=>({...value,[lid]:e.target.value}))}><option value="available">Storage / available</option><option value="unavailable">Unavailable</option></select>:<small>{(location.state||'available').replace('_',' ')}</small>}</div>{editing?<><input aria-label={`${nameOf(location)} quantity`} className="qty" type="number" min="0" max="10000" step="any" disabled={location.active===false} value={quantity} onChange={e=>setValues(value=>({...value,[lid]:e.target.value}))}/><input aria-label={`${nameOf(location)} change note`} className="note-input" value={notes[lid]||''} disabled={!changed||location.active===false} onChange={e=>setNotes(value=>({...value,[lid]:e.target.value}))} placeholder={changed?'Required note for this change':'No quantity change'}/></>:<strong>{fmt(current[lid])} {displayUnit(part.stock_unit)}</strong>}</div>}):<Empty>No stock locations have been added.</Empty>}</div>
    {editing&&<div className="stock-location-add"><div className="inline"><label>New stock location<input value={newLocation} onChange={e=>setNewLocation(e.target.value)} placeholder="Location name"/></label><label>Location type<select value={newLocationState} onChange={e=>setNewLocationState(e.target.value)}><option value="available">Storage / available</option><option value="unavailable">Unavailable</option></select></label><button className="secondary compact" onClick={addLocation}>Add location</button></div></div>}
  </>
}

function History({partId,locations,unit}){const [items,setItems]=useState(null);useEffect(()=>{api.stockHistory(partId).then(x=>setItems(listFrom(x))).catch(()=>setItems([]))},[partId]);if(!items)return <Loading/>;return <><div className="panel-title"><h3>Stock History</h3></div>{items.length?<div className="timeline">{items.map((e,i)=><div className="event" key={idOf(e)||i}><div className="event-dot"/><div><strong>{eventText(e,locations,unit)}</strong><p>{e.note||'No note provided'}</p><small>{e.actor||'Unknown'} · {date(e.created_at||e.timestamp)}</small></div></div>)}</div>:<Empty>No stock changes recorded yet.</Empty>}</>}
function eventText(e,locations,unit='units'){const q=fmt(e.quantity),label=displayUnit(unit);const from=nameOf(locations[e.from_location_id])||'stock';const to=nameOf(locations[e.to_location_id])||'stock';if(e.operation==='move'||e.operation==='move_tracked_unit')return `${q} ${label} moved from ${from} to ${to}`;if(e.operation==='adjust'||e.operation==='receive')return `${q} ${label} added to ${to}`;if(e.operation==='remove')return `${q} ${label} removed from ${from}`;if(e.operation==='serialize')return `Serialized ${q} ${label}`;return `${e.operation?.replaceAll('_',' ')||'Stock updated'} · ${q} ${label}`}

function Tracked({partId,locations,refresh,notify,fail}){
  const [units,setUnits]=useState(null),[show,setShow]=useState(false),[editingUnit,setEditingUnit]=useState(null),[viewImage,setViewImage]=useState(null)
  const load=useCallback(async()=>{try{setUnits(listFrom(await api.trackedUnits(partId)))}catch(error){setUnits([]);fail(error)}},[partId,fail])
  useEffect(()=>{void api.trackedUnits(partId).then(result=>setUnits(listFrom(result))).catch(error=>{setUnits([]);fail(error)})},[partId,fail])

  async function uploadImage(file,serial,actor){
    if(!file?.name)return null
    const data=new FormData();data.append('file',file);data.append('kind','photo');data.append('note',`Tracked unit ${serial}`);data.append('uploaded_by',actor||'Shulker')
    const attachment=await api.uploadAttachment(partId,data)
    return api.attachmentUrl(partId,idOf(attachment),true)
  }
  async function add(e){
    e.preventDefault();const form=new FormData(e.currentTarget);const actor=String(form.get('actor')||'').trim();const serial=String(form.get('serial')||'').trim()
    try{
      const created=await api.createTrackedUnit(partId,{serial,location_id:form.get('location_id'),description:form.get('description'),actor})
      const image_url=await uploadImage(form.get('image'),serial,actor)
      if(image_url)await api.updateTrackedUnit(partId,idOf(created),{image_url,actor,note:'Tracked unit image added'})
      setShow(false);await Promise.all([load(),refresh()]);notify('Tracked unit created')
    }catch(error){fail(error)}
  }
  async function update(e){
    e.preventDefault();const form=new FormData(e.currentTarget);const actor=String(form.get('actor')||'').trim();const serial=String(form.get('serial')||'').trim()
    const newLocationId=String(form.get('location_id')||'')
    const oldLocation=nameOf(locations.find(location=>idOf(location)===editingUnit.location_id))||'Unknown location'
    const newLocation=nameOf(locations.find(location=>idOf(location)===newLocationId))||'Unknown location'
    const moved=newLocationId!==editingUnit.location_id
    const changes={serial,location_id:newLocationId,status:form.get('status'),description:form.get('description'),actor,note:moved?`${editingUnit.serial} moved from ${oldLocation} to ${newLocation}`:'Tracked unit details updated'}
    try{
      const image_url=await uploadImage(form.get('image'),serial,actor)
      if(image_url)changes.image_url=image_url
      await api.updateTrackedUnit(partId,idOf(editingUnit),changes)
      setEditingUnit(null);await Promise.all([load(),refresh()]);notify('Tracked unit updated')
    }catch(error){fail(error)}
  }
  async function remove(unit){
    if(!confirm(`Delete tracked unit ${unit.serial}? This also removes one unit from stock.`))return
    try{await api.retireTrackedUnit(partId,idOf(unit),{actor:'Shulker',note:`Tracked unit ${unit.serial} deleted`});await Promise.all([load(),refresh()]);notify('Tracked unit deleted')}
    catch(error){fail(error)}
  }
  function unitForm(unit,onSubmit){return <form className="stack" onSubmit={onSubmit}>
    <label>Serial / tracking name<input name="serial" defaultValue={unit?.serial||''} required/></label>
    <label>Location<select name="location_id" defaultValue={unit?.location_id||''} required><option value="">Choose location</option>{locations.filter(location=>location.active!==false).map(location=><option value={idOf(location)} key={idOf(location)}>{nameOf(location)}</option>)}</select></label>
    {unit&&<label>Status<select name="status" defaultValue={unit.status||'active'}><option value="active">Active</option><option value="damaged">Damaged</option><option value="lost">Lost</option></select></label>}
    <label>Description<textarea name="description" maxLength={240} defaultValue={unit?.description||''} placeholder="Add identifying details"/></label>
    <label>Image<input name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"/></label>
    {unit?.image_url&&<button type="button" className="tracked-image-button" onClick={()=>setViewImage({src:unit.image_url,title:unit.serial})}><img src={unit.image_url} alt={`${unit.serial} tracked unit`}/><span>View current image</span></button>}
    <label>Your name<input name="actor" required/></label><button className="primary">{unit?'Save changes':'Add tracked unit'}</button>
  </form>}
  return <>
    <div className="panel-title"><h3>Track a Part</h3><button className="primary compact" onClick={()=>setShow(true)}>+ Track unit</button></div>
    {!units?<Loading/>:units.length?<div className="card-list">{units.map(unit=><article className="unit-card tracked-unit-card" key={idOf(unit)}>
      {unit.image_url?<button type="button" className="tracked-unit-image" onClick={()=>setViewImage({src:unit.image_url,title:unit.serial})}><img src={unit.image_url} alt={`${unit.serial} tracked unit`}/></button>:<div className="tracked-unit-placeholder">{(unit.serial||unit.name||'?')[0].toUpperCase()}</div>}
      <div className="tracked-unit-info"><strong className="tracked-unit-name">{unit.serial||unit.name}</strong><small className="tracked-unit-location">{nameOf(locations.find(location=>idOf(location)===unit.location_id))||'Unknown location'}</small><p className="tracked-unit-description">{unit.description||'No identifying notes.'}</p></div>
      <div className="tracked-unit-meta"><small>Last modified {date(unit.updated_at||unit.created_at)} by {unit.updated_by||'Unknown'}</small><div className="tracked-unit-actions"><button className="text-btn" onClick={()=>setEditingUnit(unit)}>Edit</button><button className="danger-text" onClick={()=>remove(unit)}>Delete</button></div></div>
    </article>)}</div>:<Empty>No individually tracked units.</Empty>}
    {show&&<Modal title="Track a Part" onClose={()=>setShow(false)}>{unitForm(null,add)}</Modal>}
    {editingUnit&&<Modal title={`Edit ${editingUnit.serial}`} onClose={()=>setEditingUnit(null)}>{unitForm(editingUnit,update)}</Modal>}
    {viewImage&&<Modal title={viewImage.title} onClose={()=>setViewImage(null)}><img className="tracked-image-enlarged" src={viewImage.src} alt={`${viewImage.title} tracked unit`}/></Modal>}
  </>
}

function Relations({part,allParts,refresh,notify,fail,onNavigate}){const [show,setShow]=useState(false);const rels=part.relations||[];async function add(e){e.preventDefault();const f=new FormData(e.currentTarget);try{await api.addRelation(idOf(part),{related_part_id:f.get('related_part_id'),relationship:f.get('relationship')});setShow(false);await refresh();notify('Related part added')}catch(err){fail(err)}}return <><div className="panel-title"><h3>Related Parts</h3><button className="primary compact" onClick={()=>setShow(true)}>+ Add a Part</button></div>{rels.length?<div className="card-list">{rels.map((r,i)=>{const relatedId=r.related_part_id||r.part_id;const rp=r.related_part||allParts.find(p=>idOf(p)===relatedId);return <button type="button" className="relation-card relation-link" key={relatedId||i} onClick={()=>onNavigate(relatedId)}><strong>{rp?.name||r.name||relatedId}</strong><p>{r.relationship||r.note||'Related part'}{rp?.description?` · ${rp.description}`:''}</p></button>})}</div>:<Empty>No related parts yet.</Empty>}{show&&<Modal title="Add Related Part" onClose={()=>setShow(false)}><form className="stack" onSubmit={add}><label>Part<select name="related_part_id" required><option value="">Choose a part</option>{allParts.filter(p=>idOf(p)!==idOf(part)).map(p=><option value={idOf(p)} key={idOf(p)}>{p.name} — {p.description}</option>)}</select></label><label>Relationship<input name="relationship" required placeholder="Mates with, mounts to, replacement for…"/></label><button className="primary">Add relation</button></form></Modal>}</>}

function Attachments({partId,part,notify,fail}){
  const [items,setItems]=useState(null)
  const load=useCallback(async()=>{try{setItems(listFrom(await api.attachments(partId)))}catch(error){setItems([]);fail(error)}},[partId,fail])
  useEffect(()=>{void api.attachments(partId).then(result=>setItems(listFrom(result))).catch(error=>{setItems([]);fail(error)})},[partId,fail])
  const primaryImageId=part?.image_url?.match(/\/attachments\/([^/]+)\/download/)?.[1]
  async function upload(e){e.preventDefault();const form=e.currentTarget;const raw=new FormData(form);const data=new FormData();data.append('file',raw.get('file'));data.append('note',raw.get('note')||'');try{await api.uploadAttachment(partId,data);form.reset();await load();notify('Attachment uploaded')}catch(error){fail(error)}}
  async function remove(attachment){
    if(!confirm(`Delete ${attachment.filename||'this attachment'}?`))return
    try{
      const units=listFrom(await api.trackedUnits(partId))
      const linked=units.filter(unit=>unit.image_url===api.attachmentUrl(partId,idOf(attachment),true))
      for(const unit of linked)await api.updateTrackedUnit(partId,idOf(unit),{image_url:null,actor:'Shulker',note:'Tracked unit image attachment deleted'})
      await api.deleteAttachment(partId,idOf(attachment));await load();notify('Attachment deleted')
    }catch(error){fail(error)}
  }
  return <>
    <div className="panel-title"><h3>Attachments</h3></div>
    <form className="upload" onSubmit={upload}><label>Choose file<input name="file" type="file" required/></label><label>Description<input name="note" placeholder="Description"/></label><button className="primary compact">Attach file</button></form>
    {!items?<Loading/>:items.length?<div className="attachment-list">{items.map(attachment=><div className="attachment-item" key={idOf(attachment)}>
      <a className="attachment-card" href={api.attachmentUrl(partId,idOf(attachment),String(attachment.content_type||'').startsWith('image/'))} target="_blank" rel="noreferrer">{String(attachment.content_type||'').startsWith('image/')?<img className="attachment-preview" src={api.attachmentUrl(partId,idOf(attachment),true)} alt={attachment.filename||'Part attachment'}/>:<div className="file-icon">↗</div>}<div><strong>{attachment.filename||attachment.name}</strong><p>{attachment.note||attachment.kind||'Attachment'}</p><small>{attachment.uploaded_by||'Unknown'} · {date(attachment.created_at)}</small></div></a>
      {idOf(attachment)!==primaryImageId&&<button className="danger-text" type="button" onClick={()=>remove(attachment)}>Delete</button>}
    </div>)}</div>:<Empty>No files attached yet.</Empty>}
  </>
}

function TagsNotes({part,refresh,notify,fail}){
  const [note,setNote]=useState(''),[author,setAuthor]=useState('')
  async function add(){if(!note.trim()||!author.trim())return;try{await api.addNote(idOf(part),{text:note.trim(),author:author.trim()});setNote('');await refresh();notify('Note added')}catch(error){fail(error)}}
  async function remove(noteId){if(!confirm('Delete this comment?'))return;try{await api.deleteNote(idOf(part),noteId);await refresh();notify('Comment deleted')}catch(error){fail(error)}}
  return <>
    <section className="rail-card"><h4>All Tags</h4><div className="chips">{part.tags?.length?part.tags.map(tag=><span className="chip" key={tag}>{tag}</span>):<span className="muted">No tags</span>}</div></section>
    <section className="rail-card"><h4>Notes</h4><div className="notes">{part.notes?.length?part.notes.map((item,index)=><article className="note-comment" key={item.id||index}><p>{item.text||item.note}</p><div className="note-footer"><small>{item.author||item.actor||'Unknown'} · {date(item.created_at||item.timestamp)}</small>{item.id&&<button className="note-delete" type="button" title="Delete comment" aria-label="Delete comment" onClick={()=>remove(item.id)}>Delete</button>}</div></article>):<span className="muted">There are no comments on this part.</span>}</div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note…"/><div className="inline"><input value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Your name"/><button className="secondary compact" onClick={add}>Add</button></div></section>
  </>
}

function CategoryManager({categories,refresh,notify,fail}){const [name,setName]=useState('');async function add(){if(!name.trim())return;try{await api.createCategory(name.trim());setName('');await refresh();notify('Category added')}catch(e){fail(e)}}async function rename(category){const next=prompt('Edit category name',nameOf(category));if(!next?.trim()||next.trim()===nameOf(category))return;try{await api.updateCategory(idOf(category),next.trim());await refresh();notify('Category updated')}catch(e){fail(e)}}async function del(category){if(!confirm(`Delete category "${nameOf(category)}"?`))return;try{await api.deleteCategory(idOf(category));await refresh();notify('Category deleted')}catch(e){fail(e)}}return <div className="stack"><div className="inline"><input value={name} onChange={e=>setName(e.target.value)} placeholder="New category"/><button className="primary compact" onClick={add}>Add</button></div><div className="manage-list">{categories.map(category=><div key={idOf(category)}><span>{nameOf(category)}</span><div className="inline-actions"><button className="text-btn" onClick={()=>rename(category)}>Edit</button><button className="danger-text" onClick={()=>del(category)}>Delete</button></div></div>)}</div></div>}

function TagManager({tags,refresh,notify,fail}){const [name,setName]=useState('');async function add(){if(!name.trim())return;try{await api.createTag(name.trim());setName('');await refresh();notify('Tag added')}catch(e){fail(e)}}async function rename(tag){const next=prompt('Edit tag name',tag);if(!next?.trim()||next.trim()===tag)return;try{await api.updateTag(tag,next.trim());await refresh();notify('Tag updated')}catch(e){fail(e)}}async function del(tag){if(!confirm(`Delete tag "${tag}" from all parts?`))return;try{await api.deleteTag(tag);await refresh();notify('Tag deleted from all parts')}catch(e){fail(e)}}return <div className="stack"><div className="inline"><input value={name} onChange={e=>setName(e.target.value)} placeholder="New tag"/><button className="primary compact" onClick={add}>Add tag</button></div><div className="manage-list">{tags.map(tag=><div key={tag}><span>{tag}</span><div className="inline-actions"><button className="text-btn" onClick={()=>rename(tag)}>Edit</button><button className="danger-text" onClick={()=>del(tag)}>Delete</button></div></div>)}</div></div>}
