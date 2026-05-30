/* ============================================================
 *  MAPA COROPLÉTICO DE COLOMBIA
 *  - Carga GeoJSON de departamentos en runtime (con fallbacks).
 *  - Proyección simple Mercator (Colombia es chica, distorsión OK).
 *  - Color = semáforo según indicador y umbrales.
 *  - Tooltip con valor + nombre.
 *  - Cross-filtering: clic en departamento selecciona/desselecciona.
 * ============================================================ */

const { useState, useEffect, useMemo, useRef } = React;

// URLs de GeoJSON de departamentos de Colombia (CORS-enabled).
// El primero que responda gana. Fallback en cascada.
// Si la página fue empaquetada como standalone, usa el recurso inline.
const GEO_URLS = [
  ...(window.__resources && window.__resources.colombiaGeo ? [window.__resources.colombiaGeo] : []),
  "https://gist.githubusercontent.com/john-guerra/43c7656821069d00dcbc/raw/be6a6e239cd5b5b803c6e7c2ec405b793a9064dd/Colombia.geo.json",
  "https://cdn.jsdelivr.net/gh/john-guerra/colombia_geojson@master/colombia.geo.json",
  "https://raw.githubusercontent.com/santiblanko/colombia.geojson/main/colombia.geojson",
];

// Cache global para evitar recargar
let GEO_CACHE = null;
let GEO_PROMISE = null;

async function loadColombiaGeo() {
  if (GEO_CACHE) return GEO_CACHE;
  if (GEO_PROMISE) return GEO_PROMISE;
  GEO_PROMISE = (async () => {
    for (const url of GEO_URLS) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.features && j.features.length) {
          GEO_CACHE = j;
          return j;
        }
      } catch (e) {
        // probar siguiente URL
      }
    }
    throw new Error("No se pudo cargar el GeoJSON de Colombia.");
  })();
  return GEO_PROMISE;
}

// Bounding box global de un GeoJSON (lng,lat)
function geoBounds(geo) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    } else {
      for (const c of coords) walk(c);
    }
  };
  for (const f of geo.features) walk(f.geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

// Convierte un anillo de coords (lng,lat) en cadena SVG "M x y L x y ..."
function ringToPath(ring, project) {
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i]);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return d + "Z";
}

function featureToPath(f, project) {
  const g = f.geometry;
  if (g.type === "Polygon") {
    return g.coordinates.map((r) => ringToPath(r, project)).join(" ");
  }
  if (g.type === "MultiPolygon") {
    return g.coordinates
      .map((poly) => poly.map((r) => ringToPath(r, project)).join(" "))
      .join(" ");
  }
  return "";
}

// Centroide aproximado (promedio simple de vértices del primer anillo)
function featureCentroid(f, project) {
  const g = f.geometry;
  let coords;
  if (g.type === "Polygon") coords = g.coordinates[0];
  else if (g.type === "MultiPolygon") {
    // anillo del polígono más grande (por número de vértices)
    let best = g.coordinates[0][0];
    for (const poly of g.coordinates) {
      if (poly[0].length > best.length) best = poly[0];
    }
    coords = best;
  } else return null;
  let sx = 0, sy = 0;
  for (const c of coords) {
    const [x, y] = project(c);
    sx += x; sy += y;
  }
  return [sx / coords.length, sy / coords.length];
}

// Devuelve la clave de nombre del departamento dentro del feature.
// Los GeoJSON varían: NOMBRE_DPT, NOMBRE_DPTO, name, dpt, etc.
function featureName(f) {
  const p = f.properties || {};
  return (
    p.NOMBRE_DPT ||
    p.NOMBRE_DPTO ||
    p.NOMBRE_DEP ||
    p.dpto_cnmbr ||
    p.DPTO_CNMBR ||
    p.departamento ||
    p.name ||
    p.NAME_1 ||
    p.NOMBRE ||
    ""
  );
}

// ============================================================
// Componente principal
// ============================================================
function ColombiaMap({
  values,         // Map<normDep, { value, raw, dep }>
  colorFn,        // (value) => "#hex"
  unit = "%",
  selected,       // dep seleccionado (string original)
  onSelect,       // fn(dep|null)
  width = 520,
  height = 580,
  legend,         // {label, stops: [{color,label}]}
}) {
  const [geo, setGeo] = useState(GEO_CACHE);
  const [err, setErr] = useState(null);
  const [hover, setHover] = useState(null); // {dep, value, x, y}
  const svgRef = useRef(null);

  useEffect(() => {
    if (geo) return;
    loadColombiaGeo().then(setGeo).catch((e) => setErr(e.message));
  }, []);

  const { paths, labels } = useMemo(() => {
    if (!geo) return { paths: [], labels: [] };
    const [minX, minY, maxX, maxY] = geoBounds(geo);
    // Mercator-ish: con Colombia tan cerca del ecuador, la deformación es leve.
    // Compensamos el aspecto: 1° lat ≈ 1° lng cos(lat_med). Usamos lat_media ~ 4°.
    const latMed = (minY + maxY) / 2;
    const kx = Math.cos((latMed * Math.PI) / 180);
    const dataW = (maxX - minX) * kx;
    const dataH = maxY - minY;
    const pad = 14;
    const aW = width - pad * 2;
    const aH = height - pad * 2;
    const scale = Math.min(aW / dataW, aH / dataH);
    const offX = pad + (aW - dataW * scale) / 2;
    const offY = pad + (aH - dataH * scale) / 2;
    const project = ([lng, lat]) => {
      const x = (lng - minX) * kx * scale + offX;
      // y se invierte (en pantalla, +y baja; en lat, +lat sube)
      const y = (maxY - lat) * scale + offY;
      return [x, y];
    };

    const paths = geo.features.map((f, i) => {
      const name = featureName(f);
      const key = normDep(name);
      const entry = values.get(key);
      return {
        i,
        name,
        key,
        d: featureToPath(f, project),
        value: entry?.value ?? null,
        raw: entry?.raw ?? null,
        dep: entry?.dep ?? name,
      };
    });

    // Etiquetas para deptos pequeños o relevantes — limitamos a los más grandes
    // y los con valor para no saturar; aquí mostramos sólo el centroide del seleccionado.
    const labels = paths.map((p, i) => {
      const c = featureCentroid(geo.features[i], project);
      return { ...p, cx: c?.[0] ?? 0, cy: c?.[1] ?? 0 };
    });

    return { paths, labels };
  }, [geo, values, width, height]);

  if (err) {
    return (
      <div className="map-error">
        <div className="map-error-title">No se pudo cargar el mapa</div>
        <div className="map-error-body">
          {err}. Verifica la conexión a internet. (El mapa requiere descargar
          el GeoJSON de departamentos de Colombia desde GitHub.)
        </div>
      </div>
    );
  }

  if (!geo) {
    return (
      <div className="map-loading">
        <div className="spinner" />
        <div>Cargando geografía de Colombia…</div>
      </div>
    );
  }

  const selKey = selected ? normDep(selected) : null;

  // ¿Hay territorios del mapa sin dato para el indicador/año actual?
  // Sólo así mostramos el ítem "sin dato" en la leyenda.
  const haySinDato = paths.some((p) => p.value == null);

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="map-svg"
        onMouseLeave={() => setHover(null)}
      >
        {/* Fondo papel */}
        <rect width={width} height={height} fill={C.paper} />

        {paths.map((p) => {
          const fill = p.value == null ? C.noData : colorFn(p.value);
          const isSel = selKey === p.key;
          const isDim = selKey && !isSel;
          return (
            <path
              key={p.i}
              d={p.d}
              fill={fill}
              stroke={isSel ? C.ink : "#fff"}
              strokeWidth={isSel ? 1.6 : 0.5}
              opacity={isDim ? 0.35 : 1}
              style={{ cursor: p.value != null ? "pointer" : "default", transition: "opacity .15s" }}
              onMouseEnter={(e) => {
                const rect = svgRef.current.getBoundingClientRect();
                setHover({
                  dep: p.dep,
                  value: p.value,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseMove={(e) => {
                const rect = svgRef.current.getBoundingClientRect();
                setHover((h) =>
                  h
                    ? { ...h, x: e.clientX - rect.left, y: e.clientY - rect.top }
                    : h
                );
              }}
              onClick={() => {
                if (p.value == null) return;
                onSelect(selKey === p.key ? null : p.dep);
              }}
            >
              <title>{p.dep}: {p.value == null ? "sin dato" : fmt(p.value) + unit}</title>
            </path>
          );
        })}

        {/* Etiqueta sólo para el depto seleccionado */}
        {selKey &&
          labels
            .filter((l) => l.key === selKey)
            .map((l) => (
              <g key={"lbl-" + l.i}>
                <text
                  x={l.cx}
                  y={l.cy - 4}
                  textAnchor="middle"
                  className="map-label-name"
                >
                  {l.dep}
                </text>
                <text
                  x={l.cx}
                  y={l.cy + 10}
                  textAnchor="middle"
                  className="map-label-val"
                >
                  {l.value == null ? "sin dato" : fmt(l.value) + unit}
                </text>
              </g>
            ))}
      </svg>

      {/* Tooltip flotante */}
      {hover && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(hover.x + 14, width - 180),
            top: Math.max(hover.y - 10, 0),
          }}
        >
          <div className="map-tooltip-dep">{hover.dep}</div>
          <div className="map-tooltip-val">
            {hover.value == null ? "sin dato" : fmt(hover.value) + unit}
          </div>
        </div>
      )}

      {/* Leyenda */}
      {legend && (
        <div className="map-legend">
          <div className="map-legend-label">{legend.label}</div>
          <div className="map-legend-stops">
            {legend.stops.map((s, i) => (
              <div className="map-legend-stop" key={i}>
                <span className="swatch" style={{ background: s.color }} />
                <span>{s.label}</span>
              </div>
            ))}
            {haySinDato && (
              <div className="map-legend-stop">
                <span className="swatch" style={{ background: C.noData }} />
                <span>sin dato</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ColombiaMap });
