import { useEffect, useState } from "react";

/* Input que guarda al salir del campo (o con Enter), como el "change" del HTML original.
   Evita crear clientes a medio escribir y re-renderizar toda la ruta en cada tecla. */
export default function CommitInput({ value, onCommit, className = "inp", ...props }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  const commit = () => { if (String(v) !== String(value ?? "")) onCommit(v); };
  return (
    <input
      {...props}
      className={className}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}
