/* Gráficas SVG sencillas (sin librerías) */
export const COLORS = ["#2f6bff", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#94a3b8"];

export function AreaChart({ data, height = 190, color = "#2f6bff", label = "entregas" }) {
  if (!data.length) return <div className="empty">Sin datos en el período</div>;
  const w = 560, h = height, pad = { l: 34, r: 10, t: 14, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.v));
  const x = (i) => pad.l + (data.length === 1 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (data.length - 1));
  const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const pts = data.map((d, i) => [x(i), y(d.v)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  const area = line + ` L${pts[pts.length - 1][0]} ${h - pad.b} L${pts[0][0]} ${h - pad.b} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[0, 0.5, 1].map((t) => { const v = Math.round(max * t); return <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#e8edfb" /><text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="ax">{v}</text></g>; })}
      <path d={area} fill="url(#ag)" />
      <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke={color} strokeWidth="2.5"><title>{data[i].l}: {data[i].v} {label}</title></circle>)}
      {data.map((d, i) => (data.length <= 10 || i % Math.ceil(data.length / 8) === 0) && <text key={i} x={x(i)} y={h - 8} textAnchor="middle" className="ax">{d.l}</text>)}
    </svg>
  );
}

export function BarChart({ data, height = 190 }) { // data: [{l, a, b}]
  if (!data.length) return <div className="empty">Sin datos en el período</div>;
  const w = 560, h = height, pad = { l: 34, r: 10, t: 14, b: 26 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const gw = (w - pad.l - pad.r) / data.length;
  const bw = Math.min(16, gw / 3);
  const y = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart">
      {[0, 0.5, 1].map((t) => { const v = Math.round(max * t); return <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#e8edfb" /><text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="ax">{v}</text></g>; })}
      {data.map((d, i) => {
        const cx = pad.l + gw * i + gw / 2;
        return (
          <g key={i}>
            <rect x={cx - bw - 1} y={y(d.a)} width={bw} height={h - pad.b - y(d.a)} rx="5" fill="#2f6bff"><title>{d.l}: {d.a} entregas</title></rect>
            <rect x={cx + 1} y={y(d.b)} width={bw} height={h - pad.b - y(d.b)} rx="5" fill="#f59e0b"><title>{d.l}: {d.b} devoluciones</title></rect>
            {(data.length <= 10 || i % Math.ceil(data.length / 8) === 0) && <text x={cx} y={h - 8} textAnchor="middle" className="ax">{d.l}</text>}
          </g>
        );
      })}
    </svg>
  );
}

const ESTADO_COLOR = { OK: "#22c55e", "Dev Parcial": "#f59e0b", "Dev Total": "#ef4444", "Reenvío": "#8b5cf6", Pendiente: "#94a3b8" };
const colorOf = (p, i) => ESTADO_COLOR[p.l] || COLORS[i % COLORS.length];

export function Donut({ parts, total }) { // parts: [{l, v}]
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  const sum = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2fd" strokeWidth="18" />
        {parts.map((p, i) => {
          const len = (p.v / sum) * c;
          const el = <circle key={p.l} cx="70" cy="70" r={r} fill="none" stroke={colorOf(p, i)} strokeWidth="18"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{p.l}: {p.v}</title></circle>;
          off += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="donut-n">{total}</text>
        <text x="70" y="86" textAnchor="middle" className="donut-l">Facturas</text>
      </svg>
      <ul className="legend">
        {parts.map((p, i) => <li key={p.l}><i style={{ background: colorOf(p, i) }} />{p.l}<b>{Math.round((p.v / sum) * 100)}%</b></li>)}
      </ul>
    </div>
  );
}

export function Progress({ pct, color = "#2f6bff" }) {
  return <div className="prog"><div style={{ width: Math.min(100, pct) + "%", background: color }} /></div>;
}
