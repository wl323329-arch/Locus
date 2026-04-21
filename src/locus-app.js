(() => {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const {
    RAIL_WIDTH,
    MAX_VIEW_SCALE,
    DEFAULT_VIEW,
    COORD_MODES,
    defaultParameterConfig,
    sanitizeParameterConfig,
    sanitizeView,
    formatFnLabel,
    inferCurveKindFromExpr,
    humanizeError,
    evaluateExplicitSafe,
    evaluateCurvePointSafe,
    getCurveAxisRange
  } = window.LocusShared;
  const { SidebarShell, PlotCanvas } = window.LocusUI;
  const TWEAK_DEFAULTS = (
    /*EDITMODE-BEGIN*/
    {
      "theme": "linen"
    }
  );
  const DEFAULT_FUNCTIONS = [
    { expr: "sin(x)" },
    { expr: "0.5 * x^2 - 2" },
    { expr: "cos(x) * e^(-0.1 * x^2)" }
  ];
  function restoreFunctions(entries) {
    if (!Array.isArray(entries) || !entries.length) return null;
    const used = new Set(entries.map((fn) => fn.labelSeq).filter((n) => Number.isFinite(n)));
    let next = 0;
    return entries.map((fn) => {
      if (Number.isFinite(fn.labelSeq)) return { ...fn, label: formatFnLabel(fn.labelSeq) };
      while (used.has(next)) next++;
      const labelSeq = next++;
      used.add(labelSeq);
      return { ...fn, labelSeq, label: formatFnLabel(labelSeq) };
    });
  }
  function createDefaultFunctions(themeKey) {
    const palette = (window.LOCUS_THEMES[themeKey] || window.LOCUS_THEMES.linen).funcPalette;
    return DEFAULT_FUNCTIONS.map((fn, index) => ({
      id: Math.random().toString(36).slice(2, 9),
      expr: fn.expr,
      visible: true,
      color: palette[index % palette.length],
      thickness: 2,
      labelSeq: index,
      label: formatFnLabel(index)
    }));
  }
  function clampSidebarWidth(value) {
    const width = Number(value);
    return Math.max(260, Math.min(600, Number.isFinite(width) ? width : 340));
  }
  function useStoredState(key, initializer, serialize = (value) => value) {
    const [state, setState] = useState(initializer);
    useEffect(() => {
      try {
        localStorage.setItem(key, serialize(state));
      } catch {
      }
    }, [key, state]);
    return [state, setState];
  }
  function App() {
    const [themeKey, setThemeKey] = useStoredState("locus:theme", () => {
      try {
        const stored = localStorage.getItem("locus:theme");
        if (stored && window.LOCUS_THEMES[stored]) return stored;
      } catch {
      }
      return TWEAK_DEFAULTS.theme;
    }, String);
    const theme = window.LOCUS_THEMES[themeKey] || window.LOCUS_THEMES.linen;
    const [coordMode, setCoordMode] = useStoredState("locus:coordMode", () => {
      try {
        const stored = localStorage.getItem("locus:coordMode");
        if (stored === COORD_MODES.exact || stored === COORD_MODES.decimal) return stored;
      } catch {
      }
      return COORD_MODES.exact;
    }, String);
    const [parameterConfig, setParameterConfig] = useStoredState("locus:parameters", () => {
      try {
        const stored = localStorage.getItem("locus:parameters");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") return parsed;
        }
      } catch {
      }
      return {};
    }, JSON.stringify);
    const [functions, setFunctions] = useStoredState("locus:functions", () => {
      try {
        const stored = localStorage.getItem("locus:functions");
        const restored = stored ? restoreFunctions(JSON.parse(stored)) : null;
        if (restored) return restored;
      } catch {
      }
      return createDefaultFunctions(TWEAK_DEFAULTS.theme);
    }, JSON.stringify);
    const [view, setView] = useStoredState("locus:view", () => {
      try {
        const stored = localStorage.getItem("locus:view");
        if (stored) return sanitizeView(JSON.parse(stored));
      } catch {
      }
      return DEFAULT_VIEW;
    }, JSON.stringify);
    const [selectedFunctionId, setSelectedFunctionId] = useState(null);
    const [tangentMode, setTangentMode] = useState(false);
    const [tangentPoints, setTangentPoints] = useStoredState("locus:tangentPoints", () => {
      try {
        const stored = localStorage.getItem("locus:tangentPoints");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return parsed.filter((item) => item && item.id && item.fnId && Number.isFinite(item.x) && Number.isFinite(item.y));
        }
      } catch {
      }
      return [];
    }, JSON.stringify);
    const [traceInfo, setTraceInfo] = useState(null);
    const [showTweaks, setShowTweaks] = useState(false);
    const [tweaksOpen, setTweaksOpen] = useState(false);
    const tweaksRef = useRef(null);
    const [sidebarWidth, setSidebarWidth] = useStoredState("locus:sidebarWidth", () => {
      try {
        return clampSidebarWidth(localStorage.getItem("locus:sidebarWidth"));
      } catch {
      }
      return 340;
    }, String);
    const [collapsed, setCollapsed] = useStoredState("locus:collapsed", () => {
      try {
        return localStorage.getItem("locus:collapsed") === "1";
      } catch {
        return false;
      }
    }, (value) => value ? "1" : "0");
    const [resizing, setResizing] = useState(false);
    const onResizeStart = (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarWidth;
      setResizing(true);
      document.body.classList.add("resizing");
      const onMove = (ev) => {
        setSidebarWidth(clampSidebarWidth(startW + (ev.clientX - startX)));
      };
      const onUp = () => {
        setResizing(false);
        document.body.classList.remove("resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    const compiledFunctions = useMemo(() => {
      return functions.map((f) => {
        const label = f.label || formatFnLabel(f.labelSeq);
        const fallbackKind = inferCurveKindFromExpr(f.expr);
        if (!f.expr || !f.expr.trim()) return { ...f, label, curveKind: fallbackKind, compiled: null, error: null };
        try {
          const compiled = window.LocusMath.compile(f.expr);
          const params = Object.fromEntries(
            (compiled.parameters || []).map((name) => [
              name,
              sanitizeParameterConfig(parameterConfig[name], defaultParameterConfig(name)).value
            ])
          );
          if (compiled.kind === "explicit") compiled.evaluate(0, params);
          else if (compiled.kind === "implicit") compiled.evaluate(0, 0, params);
          else compiled.evaluate(compiled.parameterVar === "theta" ? 0 : 1, params);
          return { ...f, label, curveKind: compiled.kind, compiled, error: null };
        } catch (err) {
          return { ...f, label, curveKind: fallbackKind, compiled: null, error: humanizeError(err.message) };
        }
      });
    }, [functions, parameterConfig]);
    const parameterNames = useMemo(() => {
      const names = /* @__PURE__ */ new Set();
      compiledFunctions.forEach((fn) => {
        (fn.compiled?.parameters || []).forEach((name) => names.add(name));
      });
      return [...names].sort();
    }, [compiledFunctions]);
    useEffect(() => {
      setParameterConfig((prev) => {
        const next = {};
        parameterNames.forEach((name) => {
          next[name] = sanitizeParameterConfig(prev[name], defaultParameterConfig(name));
        });
        const prevKeys = Object.keys(prev);
        if (prevKeys.length === parameterNames.length && prevKeys.every((key) => next[key] && JSON.stringify(next[key]) === JSON.stringify(prev[key]))) return prev;
        return next;
      });
    }, [parameterNames]);
    const parameterValues = useMemo(() => Object.fromEntries(
      parameterNames.map((name) => [
        name,
        sanitizeParameterConfig(parameterConfig[name], defaultParameterConfig(name)).value
      ])
    ), [parameterConfig, parameterNames]);
    useEffect(() => {
      if (compiledFunctions.some((fn) => fn.id === selectedFunctionId)) return;
      setSelectedFunctionId(compiledFunctions[0]?.id || null);
    }, [compiledFunctions, selectedFunctionId]);
    useEffect(() => {
      setTangentPoints((prev) => {
        const next = prev.map((tangent) => {
          const fn = compiledFunctions.find((item) => item.id === tangent.fnId);
          if (!fn || !fn.compiled) return null;
          if (fn.compiled.kind === "explicit") {
            const y = evaluateExplicitSafe(fn.compiled, tangent.x, parameterValues);
            if (!Number.isFinite(y)) return null;
            return Math.abs(y - tangent.y) > 1e-6 ? { ...tangent, y } : tangent;
          }
          if (fn.compiled.kind === "parametric" || fn.compiled.kind === "polar") {
            if (!Number.isFinite(tangent.parameterValue)) return tangent;
            const point = evaluateCurvePointSafe(fn.compiled, tangent.parameterValue, parameterValues);
            if (!point) return null;
            return Math.abs(point.x - tangent.x) > 1e-6 || Math.abs(point.y - tangent.y) > 1e-6 ? { ...tangent, x: point.x, y: point.y } : tangent;
          }
          return tangent;
        }).filter(Boolean);
        if (next.length !== prev.length) return next;
        for (let i = 0; i < next.length; i++) {
          if (next[i] !== prev[i]) return next;
        }
        return prev;
      });
    }, [compiledFunctions, parameterValues]);
    const prevThemeRef = useRef(themeKey);
    useEffect(() => {
      if (prevThemeRef.current === themeKey) return;
      const oldTheme = window.LOCUS_THEMES[prevThemeRef.current] || theme;
      prevThemeRef.current = themeKey;
      setFunctions((prev) => prev.map((f) => {
        const idx = oldTheme.funcPalette.indexOf(f.color);
        if (idx < 0) return f;
        return { ...f, color: theme.funcPalette[idx % theme.funcPalette.length] };
      }));
    }, [themeKey, theme]);
    useEffect(() => {
      const onMsg = (e) => {
        if (!e.data) return;
        if (e.data.type === "__activate_edit_mode") setShowTweaks(true);
        if (e.data.type === "__deactivate_edit_mode") {
          setShowTweaks(false);
          setTweaksOpen(false);
        }
      };
      window.addEventListener("message", onMsg);
      window.parent.postMessage({ type: "__edit_mode_available" }, "*");
      return () => window.removeEventListener("message", onMsg);
    }, []);
    useEffect(() => {
      if (!showTweaks || !tweaksOpen) return;
      const onPointerDown = (e) => {
        if (tweaksRef.current && !tweaksRef.current.contains(e.target)) setTweaksOpen(false);
      };
      const onKeyDown = (e) => {
        if (e.key === "Escape") setTweaksOpen(false);
      };
      window.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    }, [showTweaks, tweaksOpen]);
    const pickTheme = (key) => {
      setThemeKey(key);
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { theme: key } }, "*");
    };
    const exportPNG = () => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `locus-plot-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    const setFunctionsFromSidebar = (next) => {
      const arr = typeof next === "function" ? next(compiledFunctions) : next;
      setFunctions(arr.map((f) => ({
        id: f.id,
        expr: f.expr,
        visible: f.visible,
        color: f.color,
        thickness: f.thickness,
        labelSeq: f.labelSeq,
        label: f.label
      })));
    };
    const toggleVisibility = useCallback((id) => {
      setFunctions((prev) => prev.map((f) => f.id === id ? { ...f, visible: !f.visible } : f));
    }, []);
    const onParameterChange = useCallback((name, patch) => {
      setParameterConfig((prev) => {
        const current = sanitizeParameterConfig(prev[name], defaultParameterConfig(name));
        const next = sanitizeParameterConfig({ ...current, ...patch }, defaultParameterConfig(name));
        return { ...prev, [name]: next };
      });
    }, []);
    const applyExample = useCallback((expr) => {
      setFunctions((prev) => {
        const selectedIndex = prev.findIndex((fn) => fn.id === selectedFunctionId);
        if (selectedIndex >= 0 && !prev[selectedIndex].expr.trim()) {
          const next = [...prev];
          next[selectedIndex] = { ...next[selectedIndex], expr };
          return next;
        }
        const palette = theme.funcPalette;
        const color = window.LocusShared.nextFreeColor(prev, palette);
        const labelSeq = window.LocusShared.nextFreeSeq(prev);
        const id = Math.random().toString(36).slice(2, 9);
        setSelectedFunctionId(id);
        return [...prev, {
          id,
          expr,
          visible: true,
          color,
          thickness: 2,
          labelSeq,
          label: formatFnLabel(labelSeq)
        }];
      });
    }, [selectedFunctionId, theme.funcPalette]);
    const scaleView = useCallback((factorX, factorY) => {
      setView((current) => sanitizeView({
        ...current,
        scaleX: current.scaleX * factorX,
        scaleY: current.scaleY * factorY
      }));
    }, []);
    const resetView = useCallback(() => {
      setView(DEFAULT_VIEW);
    }, []);
    const fitView = useCallback(() => {
      const visibleFns = compiledFunctions.filter((f) => f.visible && f.compiled);
      if (!visibleFns.length) {
        resetView();
        return;
      }
      const canvasW = Math.max(360, window.innerWidth - (collapsed ? RAIL_WIDTH : sidebarWidth));
      const canvasH = Math.max(300, window.innerHeight);
      const bounds = { wxMin: -10, wxMax: 10, wyMin: -10, wyMax: 10 };
      let xMin = Infinity;
      let xMax = -Infinity;
      let yMin = Infinity;
      let yMax = -Infinity;
      visibleFns.forEach((fn) => {
        if (fn.compiled.kind === "explicit") {
          const range = getCurveAxisRange(fn.compiled, "x", bounds.wxMin, bounds.wxMax, parameterValues);
          for (let i = 0; i <= 600; i++) {
            const x = range.min + (range.max - range.min) * (i / 600);
            const y = evaluateExplicitSafe(fn.compiled, x, parameterValues);
            if (!Number.isFinite(y) || Math.abs(y) > 1e8) continue;
            if (x < xMin) xMin = x;
            if (x > xMax) xMax = x;
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
          }
          return;
        }
        if (fn.compiled.kind === "parametric" || fn.compiled.kind === "polar") {
          window.LocusShared.samplePolylineWorldPoints(fn, bounds, 900, parameterValues).forEach((point) => {
            if (!point) return;
            xMin = Math.min(xMin, point.x);
            xMax = Math.max(xMax, point.x);
            yMin = Math.min(yMin, point.y);
            yMax = Math.max(yMax, point.y);
          });
          return;
        }
        window.LocusShared.sampleImplicitSegments(fn.compiled, bounds, 140, 140, parameterValues).forEach((segment) => {
          xMin = Math.min(xMin, segment.ax, segment.bx);
          xMax = Math.max(xMax, segment.ax, segment.bx);
          yMin = Math.min(yMin, segment.ay, segment.by);
          yMax = Math.max(yMax, segment.ay, segment.by);
        });
      });
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
        resetView();
        return;
      }
      if (xMin === xMax) {
        xMin -= 1;
        xMax += 1;
      }
      if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
      }
      const pad = 1.15;
      const cx = (xMin + xMax) / 2;
      const cy = (yMin + yMax) / 2;
      const xRange = (xMax - xMin) * pad;
      const yRange = (yMax - yMin) * pad;
      const scaleX = Math.max(1, Math.min(MAX_VIEW_SCALE, canvasW / xRange));
      const scaleY = Math.max(1, Math.min(MAX_VIEW_SCALE, canvasH / yRange));
      setView({ cx, cy, scaleX, scaleY });
    }, [compiledFunctions, collapsed, parameterValues, resetView, sidebarWidth]);
    useEffect(() => {
      const onKey = (e) => {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target && e.target.isContentEditable) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          scaleView(1.4, 1.4);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          scaleView(1 / 1.4, 1 / 1.4);
        } else if (e.key === "0" || e.key === "H" || e.key === "h") {
          e.preventDefault();
          resetView();
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          fitView();
        } else if (e.key === "e" || e.key === "E") {
          e.preventDefault();
          exportPNG();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [fitView, resetView, scaleView]);
    const selectedTangentCount = tangentPoints.filter((tangent) => tangent.fnId === selectedFunctionId).length;
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", width: "100%", height: "100%", background: theme.bg } }, /* @__PURE__ */ React.createElement(
      SidebarShell,
      {
        functions: compiledFunctions,
        setFunctions: setFunctionsFromSidebar,
        theme,
        themeKey,
        pickTheme,
        view,
        setView,
        traceInfo,
        coordMode,
        onExport: exportPNG,
        onFitView: fitView,
        onToggleVisibility: toggleVisibility,
        selectedFunctionId,
        onSelectFunction: setSelectedFunctionId,
        parameterNames,
        parameterConfig,
        onParameterChange,
        onApplyExample: applyExample,
        collapsed,
        expandedWidth: sidebarWidth,
        onCollapse: () => setCollapsed(true),
        onExpand: () => setCollapsed(false),
        onResizeStart,
        resizing
      }
    ), /* @__PURE__ */ React.createElement("main", { style: { flex: 1, position: "relative", background: theme.bg, minWidth: 0 } }, /* @__PURE__ */ React.createElement(
      PlotCanvas,
      {
        functions: compiledFunctions,
        view,
        setView,
        theme,
        onTrace: setTraceInfo,
        coordMode,
        selectedFunctionId,
        tangentMode,
        tangentPoints,
        onTangentPointsChange: setTangentPoints,
        parameters: parameterValues
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 16, right: 16, display: "flex", gap: 8, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { className: "coord-mode-switch", style: { color: theme.muted, background: theme.panel, borderColor: theme.rule } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: coordMode === COORD_MODES.exact ? "active" : "",
        onClick: () => setCoordMode(COORD_MODES.exact),
        title: "\u5C3D\u91CF\u7528\u7CBE\u786E\u5F62\u5F0F\u663E\u793A\u5750\u6807",
        "aria-label": "\u7CBE\u786E\u5750\u6807",
        style: { color: coordMode === COORD_MODES.exact ? theme.ink : theme.muted, background: coordMode === COORD_MODES.exact ? theme.chip : "transparent" }
      },
      "\u7CBE\u786E"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: coordMode === COORD_MODES.decimal ? "active" : "",
        onClick: () => setCoordMode(COORD_MODES.decimal),
        title: "\u7528\u5C0F\u6570\u5F62\u5F0F\u663E\u793A\u5750\u6807",
        "aria-label": "\u5C0F\u6570\u5750\u6807",
        style: { color: coordMode === COORD_MODES.decimal ? theme.ink : theme.muted, background: coordMode === COORD_MODES.decimal ? theme.chip : "transparent" }
      },
      "\u5C0F\u6570"
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setTangentMode((value) => !value),
        title: tangentMode ? "\u9000\u51FA\u5207\u7EBF\u6A21\u5F0F" : "\u8FDB\u5165\u5207\u7EBF\u6A21\u5F0F",
        style: {
          border: `1px solid ${theme.rule}`,
          background: tangentMode ? theme.chip : theme.panel,
          borderRadius: 6,
          color: tangentMode ? theme.ink : theme.muted,
          padding: "7px 10px",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer"
        }
      },
      tangentMode ? `\u5207\u7EBF \xB7 ${selectedTangentCount}` : "\u5207\u7EBF"
    )), showTweaks && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setTweaksOpen((open) => !open),
        style: {
          position: "absolute",
          top: 16,
          left: 16,
          width: 34,
          height: 34,
          borderRadius: 17,
          border: `1px solid ${theme.rule}`,
          background: theme.panel,
          color: theme.ink,
          cursor: "pointer",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12
        },
        "aria-label": "\u5207\u6362\u4E3B\u9898\u8C03\u8282\u9762\u677F"
      },
      "\u2726"
    ), tweaksOpen && /* @__PURE__ */ React.createElement("div", { ref: tweaksRef, className: "tweaks-panel" }, /* @__PURE__ */ React.createElement("h3", null, "\u4E3B\u9898"), /* @__PURE__ */ React.createElement("div", { className: "theme-grid" }, Object.entries(window.LOCUS_THEMES).map(([key, t]) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key,
        className: "theme-swatch",
        onClick: () => pickTheme(key),
        style: {
          background: t.bg,
          borderColor: key === themeKey ? theme.ink : "transparent"
        },
        "aria-label": `\u4F7F\u7528 ${t.name}`
      },
      /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 5, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 } }, t.funcPalette.slice(0, 3).map((color, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, style: { background: color, borderRadius: 2 } })))
    ))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 } }, Object.entries(window.LOCUS_THEMES).map(([key, t]) => /* @__PURE__ */ React.createElement("div", { key, className: "theme-swatch-label" }, t.name)))))));
  }
  ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
})();
