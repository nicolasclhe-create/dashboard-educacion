/* ============================================================
 *  DASHBOARD BI — Estadísticas de Educación Colombia 2011–2024
 *  Fuente: MEN. Audiencia: Ministerio + Secretarías Departamentales.
 *
 *  5 vistas:
 *    1. Visión General        → P1 (evolución temporal)
 *    2. Mapa Territorial      → P2 (brechas geográficas, mapa real + ranking + indicador)
 *    3. Eficiencia Interna    → eficiencia: aprob/reprob/repit
 *    4. Diagnóstico por Nivel → P3 (embudo Trans→Prim→Sec→Media)
 *    5. Focalización          → P4 + P5 (scatter + conectividad)
 * ============================================================ */

const {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Cell, ZAxis, Legend, LabelList, Customized,
} = Recharts;

// ============================================================
// CATÁLOGO DE INDICADORES (selector global de métrica)
// Cada indicador define:
//   - key:     campo en el registro
//   - label:   etiqueta visible
//   - unit:    "%" o ""
//   - mejor:   "alto" si más es mejor; "bajo" si menos es mejor
//   - umbrales:[verde, ámbar] — la lógica usa "mejor" para decidir el sentido
//   - hint:    descripción breve
// ============================================================
const INDICADORES = [
  { key: "cn",  label: "Cobertura neta",  unit: "%", mejor: "alto", umbrales: [90, 80], hint: "% de población 5–16 matriculada en su edad teórica" },
  { key: "cb",  label: "Cobertura bruta", unit: "%", mejor: "alto", umbrales: [100, 90], hint: "Matrícula total / población en edad teórica" },
  { key: "des", label: "Deserción",       unit: "%", mejor: "bajo", umbrales: [3, 5],   hint: "Abandono escolar intra-anual oficial" },
  { key: "apr", label: "Aprobación",      unit: "%", mejor: "alto", umbrales: [90, 85], hint: "Estudiantes que aprueban el año" },
  { key: "rep", label: "Reprobación",     unit: "%", mejor: "bajo", umbrales: [3, 6],   hint: "Estudiantes que pierden el año" },
  { key: "rpt", label: "Repitencia",      unit: "%", mejor: "bajo", umbrales: [3, 5],   hint: "Estudiantes repitiendo un grado" },
  { key: "brecha", label: "Brecha extraedad", unit: " pts", mejor: "bajo", umbrales: [10, 18], hint: "Cobertura bruta − neta (proxy de extraedad)" },
];
const IND_BY_KEY = Object.fromEntries(INDICADORES.map((i) => [i.key, i]));

// Devuelve color semáforo según indicador y valor
function colorByIndicador(ind, v) {
  if (v == null) return C.noData;
  const [g, a] = ind.umbrales;
  if (ind.mejor === "alto") {
    return v >= g ? C.ok : v >= a ? C.alerta : C.critico;
  } else {
    return v <= g ? C.ok : v <= a ? C.alerta : C.critico;
  }
}

// Stops para la leyenda
function legendStops(ind) {
  const [g, a] = ind.umbrales;
  if (ind.mejor === "alto") {
    return [
      { color: C.ok, label: `≥ ${g}${ind.unit}` },
      { color: C.alerta, label: `${a}–${g}${ind.unit}` },
      { color: C.critico, label: `< ${a}${ind.unit}` },
    ];
  }
  return [
    { color: C.ok, label: `≤ ${g}${ind.unit}` },
    { color: C.alerta, label: `${g}–${a}${ind.unit}` },
    { color: C.critico, label: `> ${a}${ind.unit}` },
  ];
}

const NIVELES = [
  { k: "cnT", d: "desT", aprK: "aprT", repK: "repT", rptK: "rptT", label: "Transición" },
  { k: "cnP", d: "desP", aprK: "aprP", repK: "repP", rptK: "rptP", label: "Primaria" },
  { k: "cnS", d: "desS", aprK: "aprS", repK: "repS", rptK: "rptS", label: "Secundaria" },
  { k: "cnM", d: "desM", aprK: "aprM", repK: "repM", rptK: "rptM", label: "Media" },
];

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard() {
  const [vista, setVista] = useState("general");
  const [anio, setAnio] = useState(2024);
  const [region, setRegion] = useState("Todas");
  const [depSel, setDepSel] = useState(null);
  const [indKey, setIndKey] = useState("cn"); // indicador del mapa+ranking

  const ind = IND_BY_KEY[indKey];
  const regiones = ["Todas", ...DATA.regiones];

  // Departamentos disponibles según la región elegida (para el subfiltro).
  const deptosDeRegion = useMemo(() => {
    const set = new Set(
      DATA.registros
        .filter((r) => region === "Todas" || r.reg === region)
        .map((r) => r.dep)
    );
    return [...set].sort((a, b) => shortDep(a).localeCompare(shortDep(b), "es"));
  }, [region]);

  // Filtro base por región
  const baseReg = useMemo(
    () => DATA.registros.filter((r) => region === "Todas" || r.reg === region),
    [region]
  );
  const delAnio = useMemo(
    () => baseReg.filter((r) => r.anio === anio),
    [baseReg, anio]
  );

  // KPIs nacionales del año
  const kpis = useMemo(() => ({
    cn:  mean(delAnio.map((r) => r.cn)),
    des: mean(delAnio.map((r) => r.des)),
    apr: mean(delAnio.map((r) => r.apr)),
    net: mean(delAnio.map((r) => r.net)),
    rep: mean(delAnio.map((r) => r.rep)),
    rpt: mean(delAnio.map((r) => r.rpt)),
  }), [delAnio]);

  const kpisPrev = useMemo(() => {
    const prev = baseReg.filter((r) => r.anio === anio - 1);
    return {
      cn:  mean(prev.map((r) => r.cn)),
      des: mean(prev.map((r) => r.des)),
      apr: mean(prev.map((r) => r.apr)),
      rpt: mean(prev.map((r) => r.rpt)),
    };
  }, [baseReg, anio]);

  // Serie temporal nacional
  const serie = useMemo(() => DATA.anios.map((a) => {
    const f = baseReg.filter((r) => r.anio === a);
    return {
      anio: a,
      cobertura:  round(mean(f.map((r) => r.cn))),
      desercion:  round(mean(f.map((r) => r.des))),
      aprobacion: round(mean(f.map((r) => r.apr))),
    };
  }), [baseReg]);

  // Ranking según indicador activo
  const ranking = useMemo(() => {
    const rs = delAnio
      .filter((r) => r[indKey] != null)
      .map((r) => ({
        dep: r.dep, depCorto: shortDep(r.dep), reg: r.reg, pob: r.pob,
        [indKey]: r[indKey], cn: r.cn, des: r.des,
      }));
    rs.sort((a, b) => ind.mejor === "alto" ? a[indKey] - b[indKey] : b[indKey] - a[indKey]);
    return rs;
  }, [delAnio, indKey, ind.mejor]);

  // Mapa: values keyed by normDep
  const mapValues = useMemo(() => {
    const m = new Map();
    for (const r of delAnio) {
      m.set(normDep(r.dep), { value: r[indKey], raw: r, dep: r.dep });
    }
    return m;
  }, [delAnio, indKey]);

  // Embudo por nivel (respeta dep seleccionado)
  const porNivel = useMemo(() => {
    const src = depSel ? delAnio.filter((r) => r.dep === depSel) : delAnio;
    return NIVELES.map((n) => ({
      nivel: n.label,
      cobertura: round(mean(src.map((r) => r[n.k]))),
      desercion: round(mean(src.map((r) => r[n.d]))),
    }));
  }, [delAnio, depSel]);

  // NOTA DE DATOS: las columnas por nivel de APROBACIÓN/REPROBACIÓN/REPITENCIA
  // (…_TRANSICIÓN/…_PRIMARIA/…_SECUNDARIA/…_MEDIA) vienen corruptas en la base
  // (p.ej. APROBACIÓN_PRIMARIA == REPROBACIÓN_PRIMARIA, APROBACIÓN_TRANSICIÓN≈0).
  // Por eso NO se grafican por nivel. Los totales nacionales por departamento
  // (apr/rep/rpt) y la cobertura/deserción por nivel SÍ son confiables.

  // Aprobación, reprobación y repitencia por departamento (totales confiables)
  const eficienciaDept = useMemo(() => {
    return delAnio
      .filter((r) => r.apr != null)
      .map((r) => ({
        dep: r.dep, depCorto: shortDep(r.dep), reg: r.reg,
        apr: r.apr, rep: r.rep, rpt: r.rpt,
      }))
      .sort((a, b) => a.apr - b.apr); // peor aprobación arriba (vertical bar)
  }, [delAnio]);

  // Serie temporal de eficiencia (apr/rep/rpt) nacional
  const eficienciaSerie = useMemo(() => DATA.anios.map((a) => {
    const f = baseReg.filter((r) => r.anio === a);
    return {
      anio: a,
      aprobacion: round(mean(f.map((r) => r.apr))),
      reprobacion: round(mean(f.map((r) => r.rep))),
      repitencia: round(mean(f.map((r) => r.rpt))),
    };
  }), [baseReg]);

  // Top 5 deptos con peor eficiencia (mayor reprobación + repitencia, año actual)
  const peoresEficiencia = useMemo(() => {
    return [...delAnio]
      .filter((r) => r.rep != null && r.rpt != null)
      .map((r) => ({ dep: r.dep, depCorto: shortDep(r.dep), reg: r.reg, rep: r.rep, rpt: r.rpt, apr: r.apr,
                     riesgo: round((r.rep || 0) + (r.rpt || 0)) }))
      .sort((a, b) => b.riesgo - a.riesgo)
      .slice(0, 8);
  }, [delAnio]);

  // Scatter focalización
  const focal = useMemo(() => delAnio
    .filter((r) => r.cn != null && r.des != null)
    .map((r) => ({ dep: r.dep, x: r.cn, y: r.des, z: r.pob || 50000, reg: r.reg })),
    [delAnio]
  );

  // Priorización territorial: índice de brecha compuesto para responder
  // "dónde focalizar para reducir deserción y ampliar cobertura".
  // brechaCob = distancia a la meta de 90% de cobertura neta (sólo si está por debajo)
  // sobreDes  = exceso de deserción sobre el umbral de 3%
  // índice    = brechaCob + 2×sobreDes  (la permanencia pesa el doble)
  const prioriza = useMemo(() => {
    return delAnio
      .filter((r) => r.cn != null && r.des != null)
      .map((r) => {
        const brechaCob = Math.max(0, 90 - r.cn);
        const sobreDes = Math.max(0, r.des - 3);
        // nivel con menor cobertura neta = cuello de botella de acceso
        const niveles = [
          ["Transición", r.cnT], ["Primaria", r.cnP],
          ["Secundaria", r.cnS], ["Media", r.cnM],
        ].filter((n) => n[1] != null);
        const critico = niveles.length
          ? niveles.reduce((a, b) => (b[1] < a[1] ? b : a))
          : ["—", null];
        return {
          dep: r.dep, depCorto: shortDep(r.dep), reg: r.reg, cn: r.cn, des: r.des,
          brechaCob: round(brechaCob), sobreDes: round(sobreDes),
          indice: round(brechaCob + 2 * sobreDes),
          nivelCritico: critico[0], nivelCobertura: critico[1],
        };
      })
      .sort((a, b) => b.indice - a.indice)
      .slice(0, 10);
  }, [delAnio]);

  // Conectividad: indicador descartado del análisis (la base sólo lo trae
  // 2011–2017 y queda vacío desde 2018), por eso no se grafica.

  const detalle = useMemo(
    () => (depSel ? delAnio.find((r) => r.dep === depSel) : null),
    [depSel, delAnio]
  );

  return (
    <div className="app">
      {/* ===== HEADER ===== */}
      <header className="header" data-screen-label="header">
        <div className="header-left">
          <div className="kicker">MINISTERIO DE EDUCACIÓN · PANEL TERRITORIAL</div>
          <h1 className="h1">Permanencia y cobertura escolar en Colombia</h1>
          <p className="sub">
            Niveles analizados: Transición · Primaria · Secundaria · Media<br />
            Cobertura nacional: 32 departamentos y Bogotá Distrito Capital · 2011–2024<br />
            <span className="audience">Audiencia: El Ministerio de Educación Nacional (MEN) y las Secretarías de Educación</span>
          </p>
        </div>
        <div className="header-right">
          <Control label="Año">
            <input
              type="range" min={2011} max={2024} step={1} value={anio}
              onChange={(e) => setAnio(+e.target.value)} className="slider"
            />
            <span className="anio-badge">{anio}</span>
          </Control>
          <Control label="Región">
            <select
              value={region}
              onChange={(e) => { setRegion(e.target.value); setDepSel(null); }}
              className="select"
            >
              {regiones.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Control>
          <Control label="Departamento">
            <select
              value={depSel || "Todos"}
              onChange={(e) => setDepSel(e.target.value === "Todos" ? null : e.target.value)}
              className="select"
            >
              <option value="Todos">
                {region === "Todas" ? "Todos los deptos." : "Toda la región"}
              </option>
              {deptosDeRegion.map((d) => (
                <option key={d} value={d}>{shortDep(d)}</option>
              ))}
            </select>
          </Control>
        </div>
      </header>

      {/* ===== TABS ===== */}
      <nav className="tabs">
        {[
          ["general",    "①", "Visión General"],
          ["mapa",       "②", "Mapa Territorial"],
          ["eficiencia", "③", "Eficiencia Interna"],
          ["nivel",      "④", "Diagnóstico por Nivel"],
          ["focal",      "⑤", "Estrategias"],
        ].map(([k, n, l]) => (
          <button key={k}
            onClick={() => setVista(k)}
            className={"tab" + (vista === k ? " tab-active" : "")}
          >
            <span className="tab-num">{n}</span>{l}
          </button>
        ))}
        {depSel && (
          <button onClick={() => setDepSel(null)} className="chip">
            Filtro: {depSel} <span className="chip-x">✕</span>
          </button>
        )}
      </nav>

      {/* ============ VISTA 1: VISIÓN GENERAL ============ */}
      {vista === "general" && (
        <div className="fade" data-screen-label="general">
          <div className="kpi-row">
            <KPI label="Cobertura Neta" val={fmt(kpis.cn)} unit="%"
              deltaV={delta(kpis.cn, kpisPrev.cn)} good="up"
              color={C.azulD}
              hint="% población 5–16 en edad teórica" />
            <KPI label="Deserción" val={fmt(kpis.des)} unit="%"
              deltaV={delta(kpis.des, kpisPrev.des)} good="down"
              color={C.azulD}
              hint="Abandono escolar intra-anual" />
            <KPI label="Aprobación" val={fmt(kpis.apr)} unit="%"
              deltaV={delta(kpis.apr, kpisPrev.apr)} good="up"
              color={C.azulD}
              hint="Eficiencia interna del sistema" />
            <KPI label="Repitencia" val={fmt(kpis.rpt)} unit="%"
              deltaV={delta(kpis.rpt, kpisPrev.rpt)} good="down"
              color={C.azulD}
              hint="Estudiantes repitiendo un grado" />
          </div>

          <Panel
            title="Evolución nacional 2011–2024"
            accent="P1 · MONITOREO TEMPORAL"
            note={
              <ul className="note-list">
                <li>
                  <span className="note-band" /> <b>Banda gris (2020–2021):</b>{" "}
                  pandemia — la caída de deserción es artificial (promoción flexibilizada),
                  no una mejora estructural.
                </li>
                <li>
                  <span className="note-amber" /> <b>Banda ámbar (2018):</b> salto
                  metodológico — cambio de proyecciones de población del Censo DANE.
                </li>
                <li>
                  <span className="note-dash" /> <b>Línea punteada vertical:</b> año seleccionado en el control.
                </li>
                <li>
                  <b>Proyecciones de población:</b> 2011–2017 con Censo 2005; 2018–2024 con Censo 2018.
                </li>
              </ul>
            }>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={serie} margin={{ top: 8, right: 28, left: 12, bottom: 24 }}>
                <CartesianGrid stroke={C.gridSoft} strokeDasharray="2 4" vertical={false} />
                <ReferenceArea x1={2020} x2={2021} fill={C.ink} fillOpacity={0.06} yAxisId="pct" label={{ value: "Pandemia", position: "insideTop", fill: C.sub, fontSize: 10 }} />
                <ReferenceArea x1={2017.5} x2={2018.5} fill={C.alerta} fillOpacity={0.05} yAxisId="pct" />
                <XAxis dataKey="anio" tick={{ fontSize: 12, fill: C.sub }}
                  label={{ value: "Año", position: "bottom", offset: 2, fontSize: 12, fill: C.sub }} />
                <YAxis yAxisId="pct" domain={[40, 100]} tick={{ fontSize: 12, fill: C.sub }}
                  label={{ value: "Cobertura / Aprobación (%)", angle: -90, position: "insideLeft", offset: 14, style: { textAnchor: "middle" }, fontSize: 11, fill: C.sub }} />
                <YAxis yAxisId="des" orientation="right" domain={[0, 12]} tick={{ fontSize: 12, fill: C.critico }}
                  label={{ value: "Deserción (%)", angle: 90, position: "insideRight", offset: 14, style: { textAnchor: "middle" }, fontSize: 11, fill: C.critico }} />
                <Tooltip content={<TTLines />} />
                <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 12, paddingBottom: 10 }} />
                <ReferenceLine x={anio} stroke={C.azulD} strokeDasharray="4 4" yAxisId="pct" />
                <Line yAxisId="pct" type="monotone" dataKey="cobertura"  name="Cobertura neta %" stroke={C.azul}    strokeWidth={2.5} dot={{ r: 2 }} />
                <Line yAxisId="pct" type="monotone" dataKey="aprobacion" name="Aprobación %"    stroke={C.teal}    strokeWidth={2}   dot={{ r: 2 }} />
                <Line yAxisId="des" type="monotone" dataKey="desercion"  name="Deserción %"     stroke={C.critico} strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Insight>
            <b>Lectura:</b> la cobertura neta nacional se sostiene en torno al
            83–89%, mientras la deserción ronda 3–5%. La caída de deserción en
            2020 coincide con la flexibilización de promoción durante la
            pandemia — <i>no</i> es una mejora estructural. Posterior a 2021 la
            deserción vuelve a niveles pre-pandemia.
          </Insight>
        </div>
      )}

      {/* ============ VISTA 2: MAPA TERRITORIAL ============ */}
      {vista === "mapa" && (
        <div className="fade" data-screen-label="mapa">
          <Panel
            title={`Mapa territorial · ${ind.label} · ${anio}`}
            accent="P2 · BRECHA TERRITORIAL"
            note="Explora los indicadores educativos por departamento seleccionando una región en el filtro. El mapa y el ranking se actualizan simultáneamente al cambiar el indicador. Haz clic en cualquier departamento para filtrar y profundizar en su comportamiento."
            right={
              <Control label="Indicador">
                <select
                  className="select"
                  value={indKey}
                  onChange={(e) => setIndKey(e.target.value)}
                >
                  {INDICADORES.map((i) => (
                    <option key={i.key} value={i.key}>{i.label}</option>
                  ))}
                </select>
              </Control>
            }
          >
            <div className="map-row">
              <div className="map-col">
                <div className="micro-h">Distribución territorial · {ind.label}</div>
                <ColombiaMap
                  values={mapValues}
                  colorFn={(v) => colorByIndicador(ind, v)}
                  unit={ind.unit}
                  selected={depSel}
                  onSelect={(d) => setDepSel(d)}
                  legend={{
                    label: `${ind.label} (${ind.unit.trim() || "—"})`,
                    stops: legendStops(ind),
                  }}
                />
                <div className="map-hint">
                  {ind.hint}.{" "}
                  {ind.mejor === "alto"
                    ? "Verde = mejor (más alto)."
                    : "Verde = mejor (más bajo)."}
                </div>
              </div>
              <div className="rank-col">
                <div className="rank-header">
                  Ranking departamental · {ind.label} · {ranking.length} deptos
                </div>
                <ResponsiveContainer width="100%" height={Math.max(420, ranking.length * 18)}>
                  <BarChart data={ranking} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 24 }}>
                    <CartesianGrid stroke={C.gridSoft} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.sub }}
                      label={{ value: "% promedio", position: "bottom", offset: 4, fontSize: 11, fill: C.sub }} />
                    <YAxis type="category" dataKey="depCorto" width={118} tick={{ fontSize: 10, fill: C.ink }} interval={0}
                      label={{ value: "Departamento", angle: -90, position: "insideLeft", offset: -2, fontSize: 11, fill: C.sub }} />
                    <Tooltip content={<TTBar />} cursor={{ fill: C.gridSoft, opacity: 0.5 }} />
                    {ind.mejor === "alto" && ind.umbrales[0] && (
                      <ReferenceLine x={ind.umbrales[0]} stroke={C.ok} strokeDasharray="3 3"
                        label={{ value: `meta ${ind.umbrales[0]}`, fontSize: 9, fill: C.ok, position: "top" }} />
                    )}
                    {ind.mejor === "bajo" && ind.umbrales[0] && (
                      <ReferenceLine x={ind.umbrales[0]} stroke={C.ok} strokeDasharray="3 3"
                        label={{ value: `meta ≤${ind.umbrales[0]}`, fontSize: 9, fill: C.ok, position: "top" }} />
                    )}
                    <Bar dataKey={indKey}
                      onClick={(d) => setDepSel(d.dep === depSel ? null : d.dep)}
                      cursor="pointer" radius={[0, 3, 3, 0]}>
                      {ranking.map((r, i) => (
                        <Cell key={i}
                          fill={colorByIndicador(ind, r[indKey])}
                          opacity={depSel && r.dep !== depSel ? 0.3 : 1} />
                      ))}
                    </Bar>
                    <Customized component={makeValueLabels({ [indKey]: { mode: "right", mono: true } })} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>

          {detalle && (
            <Insight tone={colorByIndicador(ind, detalle[indKey]) === C.critico ? "critico" : "azul"}>
              <b>{detalle.dep}</b> · {detalle.reg} · {anio} ·{" "}
              {ind.label}: <b style={{ color: colorByIndicador(ind, detalle[indKey]) }}>
                {fmt(detalle[indKey])}{ind.unit}
              </b>. Cobertura neta {fmt(detalle.cn)}%, deserción {fmt(detalle.des)}%,
              brecha extraedad {fmt(detalle.brecha)} pts. Población 5–16:{" "}
              {fmtInt(detalle.pob)}.
            </Insight>
          )}
        </div>
      )}

      {/* ============ VISTA 3: EFICIENCIA INTERNA ============ */}
      {vista === "eficiencia" && (
        <div className="fade" data-screen-label="eficiencia">
          <Panel
            title={`Aprobación por departamento · ${anio}`}
            accent="EFICIENCIA · APROBACIÓN / REPROBACIÓN / REPITENCIA"
            note={
              <span>
                Tasa de aprobación oficial por departamento (ordenada de menor a
                mayor). Línea de meta en 90%.{" "}
                <b style={{ color: C.critico }}>Nota de datos:</b> el desglose por
                nivel (transición/primaria/secundaria/media) de aprobación,
                reprobación y repitencia viene corrupto en la base de origen
                (columnas duplicadas/intercambiadas), por lo que aquí se usan los
                totales departamentales, que sí son confiables.
              </span>
            }>
            <ResponsiveContainer width="100%" height={Math.max(420, eficienciaDept.length * 17)}>
              <BarChart data={eficienciaDept} layout="vertical" margin={{ left: 8, right: 44, top: 4, bottom: 28 }}>
                <CartesianGrid stroke={C.gridSoft} horizontal={false} />
                <XAxis type="number" domain={[60, 100]} tick={{ fontSize: 10, fill: C.sub }}
                  label={{ value: "Aprobación (%)", position: "bottom", offset: 6, fontSize: 11, fill: C.sub }} />
                <YAxis type="category" dataKey="depCorto" width={118} tick={{ fontSize: 10, fill: C.ink }} interval={0}
                  label={{ value: "Departamento", angle: -90, position: "insideLeft", offset: -2, fontSize: 11, fill: C.sub }} />
                <Tooltip cursor={{ fill: C.gridSoft, opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "#fff", border: `1px solid ${C.grid}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "'IBM Plex Sans', sans-serif", boxShadow: "0 6px 18px rgba(16,33,46,.12)" }}>
                        <div style={{ fontWeight: 700 }}>{d.dep} <span style={{ color: C.sub, fontWeight: 400 }}>· {d.reg}</span></div>
                        <div style={{ marginTop: 3 }}>Aprobación: <b>{fmt(d.apr)}%</b></div>
                        <div>Reprobación: <b>{fmt(d.rep)}%</b></div>
                        <div>Repitencia: <b>{fmt(d.rpt)}%</b></div>
                      </div>
                    );
                  }} />
                <ReferenceLine x={90} stroke={C.ok} strokeDasharray="3 3"
                  label={{ value: "meta 90", fontSize: 9, fill: C.ok, position: "top" }} />
                <Bar dataKey="apr"
                  onClick={(d) => setDepSel(d.dep === depSel ? null : d.dep)}
                  cursor="pointer" radius={[0, 3, 3, 0]}>
                  {eficienciaDept.map((r, i) => (
                    <Cell key={i}
                      fill={r.apr >= 90 ? C.ok : r.apr >= 85 ? C.alerta : C.critico}
                      opacity={depSel && r.dep !== depSel ? 0.3 : 1} />
                  ))}
                </Bar>
                <Customized component={makeValueLabels({ apr: { mode: "right", mono: true } })} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            title="Evolución de eficiencia interna · Nacional"
            note="Doble eje para que la variación sea visible: aprobación a la izquierda (escala 80–100%), reprobación y repitencia a la derecha (escala 0–15%). Banda gris = pandemia 2020–2021: la flexibilización de promoción infló la aprobación y comprimió la reprobación.">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={eficienciaSerie} margin={{ top: 8, right: 30, left: 12, bottom: 24 }}>
                <CartesianGrid stroke={C.gridSoft} strokeDasharray="2 4" vertical={false} />
                <ReferenceArea x1={2020} x2={2021} fill={C.ink} fillOpacity={0.06} yAxisId="apr" />
                <XAxis dataKey="anio" tick={{ fontSize: 12, fill: C.sub }}
                  label={{ value: "Año", position: "bottom", offset: 2, fontSize: 12, fill: C.sub }} />
                <YAxis yAxisId="apr" domain={[80, 100]} tick={{ fontSize: 11, fill: C.ok }}
                  label={{ value: "Aprobación (%)", angle: -90, position: "insideLeft", offset: 14, style: { textAnchor: "middle" }, fontSize: 11, fill: C.ok }} />
                <YAxis yAxisId="fric" orientation="right" domain={[0, 15]} tick={{ fontSize: 11, fill: C.critico }}
                  label={{ value: "Reprob. / Repit. (%)", angle: 90, position: "insideRight", offset: 14, style: { textAnchor: "middle" }, fontSize: 11, fill: C.critico }} />
                <Tooltip content={<TTLines />} />
                <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 12, paddingBottom: 10 }} />
                <ReferenceLine x={anio} stroke={C.azulD} strokeDasharray="4 4" yAxisId="apr" />
                <Line yAxisId="apr"  type="monotone" dataKey="aprobacion"  name="Aprobación %"  stroke={C.ok}      strokeWidth={2.5} dot={{ r: 2 }} />
                <Line yAxisId="fric" type="monotone" dataKey="reprobacion" name="Reprobación %" stroke={C.critico} strokeWidth={2}   dot={{ r: 2 }} />
                <Line yAxisId="fric" type="monotone" dataKey="repitencia"  name="Repitencia %"  stroke={C.alerta}  strokeWidth={2}   dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            title={`Departamentos con mayor riesgo de trayectoria escolar · ${anio}`}
            note="Suma de reprobación + repitencia como índice simple de riesgo de trayectoria. Útil para focalizar programas de acompañamiento académico.">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={peoresEficiencia} layout="vertical" margin={{ left: 6, right: 48, top: 4, bottom: 28 }}>
                <CartesianGrid stroke={C.gridSoft} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.sub }}
                  label={{ value: "Porcentaje promedio (%)", position: "bottom", offset: 6, fontSize: 11, fill: C.sub }} />
                <YAxis type="category" dataKey="depCorto" width={128} tick={{ fontSize: 11, fill: C.ink }} />
                <Tooltip content={<TTStack />} />
                <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 11, paddingBottom: 10 }} />
                <Bar dataKey="rep" name="Reprobación %" stackId="a" fill={C.critico} />
                <Bar dataKey="rpt" name="Repitencia %"  stackId="a" fill={C.alerta} />
                <Customized component={makeValueLabels({
                  rep: { mode: "center", color: "#fff", minW: 20 },
                  rpt: { mode: "center", color: "#5c4708", minW: 20, total: { key: "riesgo", color: C.ink } },
                })} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Insight tone="alerta">
            <b>Lectura:</b> a nivel nacional la aprobación se sostiene entre 88 y
            94%, con reprobación de 4–9% y repitencia de 3–6%, salvo el sesgo
            de 2020–2021. La fricción interna (reprobación + repitencia) se
            concentra en los mismos departamentos de la periferia donde cae la
            cobertura — un patrón de <b>doble fricción</b>: menos acceso y menor
            permanencia.
          </Insight>
        </div>
      )}

      {/* ============ VISTA 4: DIAGNÓSTICO POR NIVEL ============ */}
      {vista === "nivel" && (
        <div className="fade" data-screen-label="nivel">
          <Panel
            title={`El embudo del sistema · ${depSel || (region === "Todas" ? "Nacional" : region)} · ${anio}`}
            accent="P3 · DIAGNÓSTICO POR NIVEL"
            note="Cobertura neta por nivel educativo. El acceso casi universal en primaria se desploma en media — ahí se concentra la pérdida de estudiantes.">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={porNivel} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={C.gridSoft} vertical={false} />
                <XAxis dataKey="nivel" tick={{ fontSize: 13, fill: C.ink, fontWeight: 600 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: C.sub }}
                  label={{ value: "Cobertura neta (%)", angle: -90, position: "insideLeft", offset: 8, fontSize: 12, fill: C.sub }} />
                <Tooltip content={<TTLines />} />
                <ReferenceLine y={90} stroke={C.ok} strokeDasharray="3 3"
                  label={{ value: "meta 90%", fontSize: 10, fill: C.ok, position: "right" }} />
                <Bar dataKey="cobertura" name="Cobertura neta %" fill={C.azul} radius={[6, 6, 0, 0]} />
                <Customized component={makeValueLabels({ cobertura: { mode: "top" } })} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            title="Deserción por nivel educativo"
            note="El nivel con mayor deserción varía por territorio — explora para identificar el punto más crítico.">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porNivel} margin={{ top: 24, right: 20, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={C.gridSoft} vertical={false} />
                <XAxis dataKey="nivel" tick={{ fontSize: 13, fill: C.ink, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 12, fill: C.sub }}
                  label={{ value: "Deserción (%)", angle: -90, position: "insideLeft", offset: 8, fontSize: 12, fill: C.sub }} />
                <Tooltip content={<TTLines />} />
                <Bar dataKey="desercion" name="Deserción %" radius={[6, 6, 0, 0]}>
                  {porNivel.map((r, i) => (
                    <Cell key={i} fill={colorByIndicador(IND_BY_KEY.des, r.desercion)} />
                  ))}
                </Bar>
                <Customized component={makeValueLabels({ desercion: { mode: "top" } })} />
              </BarChart>
            </ResponsiveContainer>
            <SemaforoLegend
              titulo="Color del semáforo · deserción (menos es mejor):"
              stops={legendStops(IND_BY_KEY.des)} />
          </Panel>
        </div>
      )}

      {/* ============ VISTA 5: ESTRATEGIAS DE FOCALIZACIÓN ============ */}
      {vista === "focal" && (
        <div className="fade" data-screen-label="focal">
          <div className="strat-q">
            <div className="strat-q-kicker">PREGUNTA ESTRATÉGICA · PARTE 2</div>
            ¿Qué oportunidades de mejora existen para <b>reducir la deserción</b> y{" "}
            <b>ampliar la cobertura</b> a nivel territorial?
          </div>

          <Panel
            title={`Matriz de focalización · ${anio}`}
            accent="P4 · DECISIÓN"
            note="Cada punto = un departamento. Tamaño = población 5–16. Cuadrante inferior-derecha (alta cobertura, baja deserción) = sano. Superior-izquierda = prioridad de intervención. Líneas guía en la meta de 90% de cobertura y 3% de deserción.">
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
                <CartesianGrid stroke={C.gridSoft} />
                <XAxis type="number" dataKey="x" name="Cobertura neta" unit="%" domain={[50, 105]}
                  tick={{ fontSize: 11, fill: C.sub }}
                  label={{ value: "Cobertura neta %", position: "bottom", offset: 10, fontSize: 12, fill: C.sub }} />
                <YAxis type="number" dataKey="y" name="Deserción" unit="%" domain={[0, "auto"]}
                  tick={{ fontSize: 11, fill: C.sub }}
                  label={{ value: "Deserción %", angle: -90, position: "insideLeft", fontSize: 12, fill: C.sub }} />
                <ZAxis type="number" dataKey="z" range={[40, 600]} />
                <ReferenceLine x={90} stroke={C.sub} strokeDasharray="3 3" />
                <ReferenceLine y={3} stroke={C.sub} strokeDasharray="3 3" />
                <Tooltip content={<TTScatter />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={focal} onClick={(d) => setDepSel(d.dep === depSel ? null : d.dep)} cursor="pointer">
                  {focal.map((p, i) => (
                    <Cell key={i}
                      fill={p.x >= 90 && p.y <= 3 ? C.ok : p.x < 80 || p.y > 5 ? C.critico : C.alerta}
                      fillOpacity={0.72}
                      stroke={depSel === p.dep ? C.ink : "none"}
                      strokeWidth={2} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </Panel>

          <Panel
            title={`Priorización territorial · ${anio}`}
            accent="P5 · ESTRATEGIA DE FOCALIZACIÓN"
            note="Índice de brecha = distancia a la meta de 90% de cobertura neta + 2× el exceso de deserción sobre 3% (la permanencia pesa el doble). Ordena los departamentos donde una intervención rendiría más, e identifica el nivel educativo que actúa como cuello de botella de acceso.">
            <div className="prio-row">
              <div className="prio-chart-col">
                <div className="prio-cards-h">Índice de brecha · {prioriza.length} prioritarios</div>
                <ResponsiveContainer width="100%" height={Math.max(280, prioriza.length * 30)}>
                  <BarChart data={prioriza} layout="vertical" margin={{ left: 6, right: 44, top: 4, bottom: 24 }}>
                  <CartesianGrid stroke={C.gridSoft} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.sub }}
                    label={{ value: "Índice de brecha", position: "bottom", offset: 4, fontSize: 11, fill: C.sub }} />
                  <YAxis type="category" dataKey="depCorto" width={118} tick={{ fontSize: 10, fill: C.ink }} interval={0} />
                  <Tooltip
                    cursor={{ fill: C.gridSoft, opacity: 0.5 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ background: "#fff", border: `1px solid ${C.grid}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "'IBM Plex Sans', sans-serif", boxShadow: "0 6px 18px rgba(16,33,46,.12)" }}>
                          <div style={{ fontWeight: 700 }}>{d.dep} <span style={{ color: C.sub, fontWeight: 400 }}>· {d.reg}</span></div>
                          <div style={{ marginTop: 3 }}>Índice de brecha: <b>{fmt(d.indice)}</b></div>
                          <div>Cobertura neta: <b>{fmt(d.cn)}%</b> (brecha {fmt(d.brechaCob)} pts)</div>
                          <div>Deserción: <b>{fmt(d.des)}%</b></div>
                          <div style={{ color: C.sub, marginTop: 3 }}>Acceso más débil: <b>{d.nivelCritico}</b> ({fmt(d.nivelCobertura)}%)</div>
                        </div>
                      );
                    }} />
                  <Bar dataKey="indice"
                    onClick={(d) => setDepSel(d.dep === depSel ? null : d.dep)}
                    cursor="pointer" radius={[0, 3, 3, 0]}>
                    {prioriza.map((r, i) => (
                      <Cell key={i}
                        fill={r.indice >= 30 ? C.critico : r.indice >= 15 ? C.alerta : C.azul}
                        opacity={depSel && r.dep !== depSel ? 0.3 : 1} />
                    ))}
                  </Bar>
                  <Customized component={makeValueLabels({ indice: { mode: "right", color: C.ink, fontSize: 10 } })} />
                </BarChart>
              </ResponsiveContainer>
              </div>

              <div className="prio-cards">
                <div className="prio-cards-h">Cuello de botella de acceso · top 5</div>
                {prioriza.slice(0, 5).map((d, i) => (
                  <div className="prio-card" key={i}
                    onClick={() => setDepSel(d.dep === depSel ? null : d.dep)}
                    style={{ borderColor: depSel === d.dep ? C.ink : C.grid }}>
                    <div className="prio-rank">{i + 1}</div>
                    <div className="prio-body">
                      <div className="prio-dep">{d.dep}</div>
                      <div className="prio-meta">
                        Acceso más débil: <b>{d.nivelCritico}</b> · {fmt(d.nivelCobertura)}% ·
                        deserción {fmt(d.des)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Insight tone="critico">
            <b>Lectura para la decisión:</b> el índice concentra la prioridad en
            la periferia — especialmente en la <b>Amazonía y la Orinoquía</b>
            (Vaupés, Vichada, Guainía, Guaviare, Amazonas), donde se combinan baja
            cobertura neta y mayor deserción. En casi todos los casos el acceso se
            rompe en la <b>educación media</b>: ahí está la mayor oportunidad de
            ampliar cobertura. Para reducir la deserción, la focalización debería
            cruzar estos territorios con los niveles donde la permanencia es más
            frágil (ver pestañas <i>Diagnóstico por nivel</i> y <i>Eficiencia interna</i>).
          </Insight>
        </div>
      )}

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div>
          <b>Fuente:</b> Ministerio de Educación Nacional — Estadísticas en
          Educación Preescolar, Básica y Media por Departamento. 462 registros,
          32 departamentos y Bogotá D.C., 2011–2024.
        </div>
        <div>
          <b>Metodología:</b> ETL en Python (encoding latin-1 reparado,
          normalización de tasas con coma decimal, validación de atípicos de
          carga). KPIs nacionales = <i>promedio simple</i> por departamento
          (limitación: no ponderados por matrícula).
        </div>
        <div>
          <b>Advertencias:</b> coberturas &gt;100% en cobertura bruta son
          legítimas (extraedad + migración); la cobertura neta nunca supera 100%.
          2018 incluye un salto metodológico por el cambio de proyecciones de
          población (Censo 2005 → Censo 2018). 2020–2021 hay sub-registro de
          deserción por flexibilización de promoción.
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Dashboard />);
