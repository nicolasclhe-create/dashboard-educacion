/* ============================================================
 *  COMPONENTES REUTILIZABLES — Panel, KPI, Control, Tooltips
 *  Estilo editorial / institucional sobrio. Tipografía Spectral
 *  + IBM Plex Sans + IBM Plex Mono.
 * ============================================================ */

// ---------- Paleta semántica (justificable en sustentación) ----------
// Verde = meta cumplida | Ámbar = alerta | Rojo = crítico
// Azul institucional para series neutras.
const C = {
  ink: "#10212e",
  paper: "#f4f1ea",
  panel: "#fbfaf6",
  panelAlt: "#ffffff",
  azul: "#1b6ca8",
  azulD: "#0f4c75",
  teal: "#2a9d8f",
  ok: "#2e8b57",
  alerta: "#e0a83d",
  critico: "#c1453b",
  grid: "#dcd6c8",
  gridSoft: "#ebe6d8",
  sub: "#5b6b78",
  noData: "#c9c4b8",
};

// Helpers de formato
const fmt = (x, n = 1) => (x == null || isNaN(x) ? "—" : x.toFixed(n));
const fmtInt = (x) => (x == null ? "—" : x.toLocaleString("es-CO"));
const round = (x) => (x == null ? null : Math.round(x * 100) / 100);
const mean = (arr) => {
  const v = arr.filter((x) => x != null && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const delta = (a, b) => (a == null || b == null ? null : a - b);

// Normaliza nombres de departamento (para matching con GeoJSON)
const normDep = (s) => {
  if (!s) return "";
  const t = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Casos especiales por contenido (el GeoJSON usa nombres distintos a la base)
  if (t.includes("bogota")) return "bogota";          // "santafe de bogota d c" ↔ "bogota d c"
  if (t.includes("san andres")) return "san andres";  // archipiélago ↔ san andres
  if (t.includes("valle") && t.includes("cauca")) return "valle del cauca";
  return t;
};

// Nombre corto para ejes/etiquetas (los nombres oficiales son larguísimos)
const shortDep = (s) => {
  if (!s) return "";
  if (/archipi/i.test(s) || /san andr/i.test(s)) return "San Andrés";
  if (/bogot/i.test(s)) return "Bogotá D.C.";
  if (/norte de santander/i.test(s)) return "N. de Santander";
  return s;
};

// ============================================================
// KPI card — valor grande, delta vs año anterior con color
// ============================================================
function KPI({ label, val, unit, deltaV, good, color, hint }) {
  const up = deltaV != null && deltaV > 0;
  const isGood = deltaV == null ? null : good === "up" ? up : !up;
  return (
    <div className="kpi" data-comment-anchor={`kpi-${label}`}>
      <div className="kpi-bar" style={{ background: color }} />
      <div className="kpi-label">{label}</div>
      <div className="kpi-val">
        {val}
        <span className="kpi-unit">{unit}</span>
      </div>
      {deltaV != null && (
        <div
          className="kpi-delta"
          style={{ color: isGood ? C.ok : C.critico }}
        >
          {up ? "▲" : "▼"} {Math.abs(deltaV).toFixed(1)} pts vs año previo
        </div>
      )}
      <div className="kpi-hint">{hint}</div>
    </div>
  );
}

// ============================================================
// Panel — sección con título, nota y contenido
// ============================================================
function Panel({ title, note, right, children, accent }) {
  return (
    <section className="panel" data-comment-anchor={`panel-${title}`}>
      <div className="panel-head">
        <div>
          {accent && <div className="panel-kicker">{accent}</div>}
          <h2 className="panel-title">{title}</h2>
          {note && <div className="panel-note">{note}</div>}
        </div>
        {right && <div className="panel-right">{right}</div>}
      </div>
      {children}
    </section>
  );
}

// ============================================================
// Control — etiqueta tipográfica monoespaciada arriba del input
// ============================================================
function Control({ label, children }) {
  return (
    <div className="ctrl">
      <span className="ctrl-label">{label}</span>
      <div className="ctrl-body">{children}</div>
    </div>
  );
}

// ============================================================
// Insight box — caja en prosa para narrar el hallazgo
// ============================================================
function Insight({ children, tone = "azul" }) {
  const colors = { azul: C.azul, ok: C.ok, alerta: C.alerta, critico: C.critico };
  return (
    <div
      className="insight"
      style={{ borderLeftColor: colors[tone] || C.azul }}
    >
      {children}
    </div>
  );
}

// ============================================================
// Tooltips personalizados para Recharts
// ============================================================
const ttBox = {
  background: C.panelAlt,
  border: `1px solid ${C.grid}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 12,
  color: C.ink,
  boxShadow: "0 6px 18px rgba(16,33,46,.12)",
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
};

function TTLines({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={ttBox}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, lineHeight: 1.5 }}>
          {p.name}: <b>{fmt(p.value)}%</b>
        </div>
      ))}
    </div>
  );
}

function TTBar({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const v = payload[0].value;
  const meta = payload[0].dataKey;
  return (
    <div style={ttBox}>
      <div style={{ fontWeight: 700 }}>
        {d.dep}{" "}
        <span style={{ color: C.sub, fontWeight: 400 }}>· {d.reg}</span>
      </div>
      <div style={{ marginTop: 3 }}>
        <b>{fmt(v, meta === "pob" ? 0 : 1)}{meta === "pob" ? "" : "%"}</b>
      </div>
      <div style={{ color: C.sub, marginTop: 4, fontSize: 11 }}>
        Clic para filtrar →
      </div>
    </div>
  );
}

function TTScatter({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={ttBox}>
      <div style={{ fontWeight: 700 }}>
        {d.dep}{" "}
        <span style={{ color: C.sub, fontWeight: 400 }}>· {d.reg}</span>
      </div>
      <div style={{ marginTop: 3 }}>Cobertura neta: <b>{fmt(d.x)}%</b></div>
      <div>Deserción: <b>{fmt(d.y)}%</b></div>
      <div>Población 5–16: <b>{fmtInt(d.z)}</b></div>
    </div>
  );
}

function TTScatter2({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={ttBox}>
      <div style={{ fontWeight: 700 }}>{d.dep}</div>
      <div>Conectividad: <b>{fmt(d.x)}%</b></div>
      <div>Deserción: <b>{fmt(d.y)}%</b></div>
    </div>
  );
}

// Tooltip para gráfico apilado de eficiencia (3 series stacked)
function TTStack({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={ttBox}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, lineHeight: 1.5 }}>
          {p.name}: <b>{fmt(p.value)}%</b>
        </div>
      ))}
      <div
        style={{
          borderTop: `1px dashed ${C.grid}`,
          marginTop: 4,
          paddingTop: 3,
          color: C.sub,
        }}
      >
        Total: <b>{fmt(payload.reduce((s, p) => s + (p.value || 0), 0))}%</b>
      </div>
    </div>
  );
}

// ============================================================
// Etiquetas de valor sobre barras vía <Customized>.
// (En este build UMD de Recharts, <LabelList> y la prop `label`
//  de <Bar> se ignoran; <Customized> sí recibe la geometría ya
//  calculada de cada barra, así que dibujamos las etiquetas ahí.)
//
// makeValueLabels(config) → componente para <Customized component=…>
//   config = { [dataKey]: {
//      mode: "right" | "center" | "top",
//      color, fontSize, mono, minW,
//      total: { key, color, fontSize }   // opcional: total al final (apiladas)
//   } }
// ============================================================
function makeValueLabels(config) {
  return function ValueLabels(props) {
    const items = props.formattedGraphicalItems || [];
    const out = [];
    items.forEach((it, ii) => {
      const data = (it && it.props && it.props.data) || [];
      const dk = data[0] && data[0].tooltipPayload && data[0].tooltipPayload[0]
        ? data[0].tooltipPayload[0].dataKey : null;
      const cfg = config[dk];
      if (!cfg) return;
      const mono = cfg.mono
        ? "'IBM Plex Mono', monospace" : "'IBM Plex Sans', sans-serif";
      data.forEach((d, i) => {
        const { x, y, width, height } = d;
        // En barras apiladas, d.value es un arreglo [base, tope]; el valor
        // real del segmento está en el payload bajo su dataKey.
        const value = (d.payload && d.payload[dk] != null) ? d.payload[dk] : d.value;
        if (value == null || x == null) return;
        if (cfg.mode === "right") {
          out.push(
            <text key={`${ii}-${i}-v`} x={x + width + 5} y={y + height / 2}
              fontSize={cfg.fontSize || 9} fill={cfg.color || C.sub}
              dominantBaseline="central" fontWeight="600" fontFamily={mono}>
              {fmt(value)}
            </text>
          );
        } else if (cfg.mode === "center") {
          if (width >= (cfg.minW || 22)) {
            out.push(
              <text key={`${ii}-${i}-v`} x={x + width / 2} y={y + height / 2}
                textAnchor="middle" dominantBaseline="central"
                fill={cfg.color || "#fff"} fontSize={cfg.fontSize || 10} fontWeight="700">
                {fmt(value)}
              </text>
            );
          }
        } else if (cfg.mode === "top") {
          out.push(
            <text key={`${ii}-${i}-v`} x={x + width / 2} y={y - 7}
              textAnchor="middle" fill={cfg.color || C.ink}
              fontSize={cfg.fontSize || 12} fontWeight="600">
              {fmt(value)}
            </text>
          );
        }
        if (cfg.total && d.payload) {
          const tv = d.payload[cfg.total.key];
          if (tv != null) {
            out.push(
              <text key={`${ii}-${i}-t`} x={x + width + 6} y={y + height / 2}
                dominantBaseline="central" fill={cfg.total.color || C.ink}
                fontSize={cfg.total.fontSize || 10} fontWeight="700">
                {fmt(tv)}
              </text>
            );
          }
        }
      });
    });
    return <g className="custom-value-labels">{out}</g>;
  };
}

// ============================================================
// Leyenda de semáforo — explica los umbrales de color
// stops: [{ color, label }]
// ============================================================
function SemaforoLegend({ titulo, stops }) {
  return (
    <div className="semaforo">
      <span className="semaforo-titulo">{titulo}</span>
      {stops.map((s, i) => (
        <span className="semaforo-item" key={i}>
          <span className="semaforo-sw" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// Exportar al scope global para que dashboard.jsx pueda usarlos
Object.assign(window, {
  C, fmt, fmtInt, round, mean, delta, normDep, shortDep,
  KPI, Panel, Control, Insight, SemaforoLegend,
  TTLines, TTBar, TTScatter, TTScatter2, TTStack,
  makeValueLabels,
});
