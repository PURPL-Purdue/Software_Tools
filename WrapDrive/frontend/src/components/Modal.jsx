export default function Modal({ title, children, onClose, wide = false }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>
}
