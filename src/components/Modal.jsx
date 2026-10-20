export default function Modal({ open, title, onClose, children, actions, wide }) {
  if (!open) return null;
  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal-box" + (wide ? " wide" : "")} role="dialog" aria-modal="true">
        {title && <h3>{title}</h3>}
        {children}
        <div className="modal-actions">
          {actions}
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
