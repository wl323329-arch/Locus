(() => {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const {
    RAIL_WIDTH,
    inferCurveKindFromExpr,
    formatDecimalNumber,
    formatCoordinateValue,
    formatPointLabel,
    getPointKey,
    defaultParameterConfig,
    sanitizeParameterConfig,
    nextFreeSeq,
    nextFreeColor,
    formatFnLabel,
    formatTangentLabel,
    evaluateExplicitSafe,
    evaluateCurvePointSafe,
    buildVisiblePolylineCurves,
    computeSpecialPoints,
    getImplicitSampleGrid,
    sampleVisibleImplicitCurves,
    closestPointOnSegment,
    getTangentLine
  } = window.LocusShared;
  const EXPR_FUNCTION_NAMES = /* @__PURE__ */ new Set(["sin", "cos", "tan", "asin", "acos", "atan", "exp", "ln", "log", "sqrt", "abs", "pow", "sec", "csc", "cot"]);
  const EXPR_CONSTANT_NAMES = /* @__PURE__ */ new Set(["pi", "e", "tau"]);
  function renderExpressionPreview(expr) {
    if (!expr) return null;
    const tokens = [];
    const pattern = /\s+|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|./gu;
    let match;
    let index = 0;
    while (match = pattern.exec(expr)) {
      const text = match[0];
      let className = "";
      if (/^\s+$/u.test(text)) {
        className = "";
      } else if (EXPR_FUNCTION_NAMES.has(text)) {
        className = "expr-token-fn";
      } else if (EXPR_CONSTANT_NAMES.has(text)) {
        className = "expr-token-const";
      } else if (text === "x" || text === "y") {
        className = "expr-token-var";
      } else if (/^\d+(?:\.\d+)?$/u.test(text)) {
        className = "expr-token-num";
      } else if (/^[+\-*/^%=(),]$/u.test(text)) {
        className = "expr-token-op";
      }
      tokens.push(/* @__PURE__ */ React.createElement("span", { key: index++, className: className || void 0 }, text));
    }
    return tokens;
  }
  const TrashIcon = () => /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 13 13", fill: "none", stroke: "currentColor", strokeWidth: "1.3" }, /* @__PURE__ */ React.createElement("path", { d: "M2.5 3.5h8M5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M3.5 3.5v7a1 1 0 001 1h4a1 1 0 001-1v-7M5.5 5.5v4M7.5 5.5v4" }));
  const PlusIcon = () => /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }, /* @__PURE__ */ React.createElement("path", { d: "M6 2v8M2 6h8" }));
  const ChevronLeft = () => /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M7.5 2.5L4 6l3.5 3.5" }));
  const ChevronRight = () => /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M4.5 2.5L8 6l-3.5 3.5" }));
  const LocusMark = ({ color }) => /* @__PURE__ */ React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 22 22", fill: "none", stroke: color, strokeWidth: "1.3", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "15", r: "1.5", fill: color, stroke: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M3 15a12 12 0 0112-12" }), /* @__PURE__ */ React.createElement("path", { d: "M6 15a9 9 0 019-9" }), /* @__PURE__ */ React.createElement("path", { d: "M9 15a6 6 0 016-6" }));
  function PlotCanvas({
    functions,
    view,
    setView,
    theme,
    onTrace,
    coordMode,
    selectedFunctionId,
    tangentMode,
    tangentPoints,
    onTangentPointsChange,
    parameters
  }) {
    const canvasRef = useRef(null);
    const wrapRef = useRef(null);
    const [size, setSize] = useState({ w: 800, h: 600 });
    const [mouse, setMouse] = useState(null);
    const draggingRef = useRef(null);
    const tangentDragRef = useRef(null);
    const [labelFade, setLabelFade] = useState(null);
    const [revealedPointKey, setRevealedPointKey] = useState(null);
    const revealTimerRef = useRef(null);
    const prevCoordModeRef = useRef(coordMode);
    const pinchRef = useRef(null);
    useEffect(() => {
      if (!wrapRef.current) return;
      const ro = new ResizeObserver(() => {
        const r = wrapRef.current.getBoundingClientRect();
        setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
      });
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, []);
    const worldToScreen = useCallback((wx, wy) => {
      const { cx, cy, scale } = view;
      return [size.w / 2 + (wx - cx) * scale, size.h / 2 - (wy - cy) * scale];
    }, [view, size]);
    const screenToWorld = useCallback((sx, sy) => {
      const { cx, cy, scale } = view;
      return [cx + (sx - size.w / 2) / scale, cy - (sy - size.h / 2) / scale];
    }, [view, size]);
    useEffect(() => {
      if (prevCoordModeRef.current === coordMode) return;
      const from = prevCoordModeRef.current;
      prevCoordModeRef.current = coordMode;
      let raf = 0;
      const duration = 220;
      const started = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        setLabelFade({ from, to: coordMode, progress });
        if (progress < 1) raf = requestAnimationFrame(tick);
        else setTimeout(() => setLabelFade(null), 0);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [coordMode]);
    const worldBounds = useMemo(() => {
      const [wxMin, wyMax] = screenToWorld(0, 0);
      const [wxMax, wyMin] = screenToWorld(size.w, size.h);
      return { wxMin, wxMax, wyMin, wyMax };
    }, [screenToWorld, size]);
    const implicitGrid = useMemo(() => getImplicitSampleGrid(size.w, size.h), [size.h, size.w]);
    const polylineSampleCount = useMemo(
      () => Math.max(320, Math.min(2400, Math.floor(size.w * 2))),
      [size.w]
    );
    const tangentCurves = useMemo(() => tangentPoints.map((tangent) => {
      const owner = functions.find((fn) => fn.id === tangent.fnId);
      if (!owner || !owner.compiled) return null;
      const tangentLine = getTangentLine(owner, tangent, view.scale, parameters);
      if (!tangentLine) return null;
      const label = formatTangentLabel(tangent.seq, owner.label);
      if (tangentLine.type === "vertical") {
        return {
          id: tangent.id,
          visible: owner.visible,
          color: owner.color,
          thickness: 1.5,
          label,
          dash: [8, 6],
          showLabel: false,
          source: "tangent",
          ownerId: owner.id,
          tangentId: tangent.id,
          tangentPoint: tangent,
          compiled: {
            kind: "implicit",
            evaluate: (x) => x - tangentLine.x
          }
        };
      }
      return {
        id: tangent.id,
        visible: owner.visible,
        color: owner.color,
        thickness: 1.5,
        label,
        dash: [8, 6],
        showLabel: false,
        source: "tangent",
        ownerId: owner.id,
        tangentId: tangent.id,
        tangentPoint: tangent,
        compiled: {
          kind: "explicit",
          evaluate: (x) => tangentLine.y + tangentLine.slope * (x - tangentLine.x)
        }
      };
    }).filter(Boolean), [functions, parameters, tangentPoints, view.scale]);
    const curveEntities = useMemo(() => [...functions, ...tangentCurves], [functions, tangentCurves]);
    const sampledPolylineCurves = useMemo(() => buildVisiblePolylineCurves(
      curveEntities,
      worldBounds,
      polylineSampleCount,
      worldToScreen,
      size,
      parameters
    ), [curveEntities, parameters, polylineSampleCount, size, worldBounds, worldToScreen]);
    const implicitCurveSamples = useMemo(() => sampleVisibleImplicitCurves(curveEntities, worldBounds, implicitGrid.cols, implicitGrid.rows, parameters), [curveEntities, implicitGrid.cols, implicitGrid.rows, parameters, worldBounds]);
    const specialPoints = useMemo(() => computeSpecialPoints(
      functions,
      curveEntities,
      sampledPolylineCurves,
      implicitCurveSamples,
      worldBounds.wxMin,
      worldBounds.wxMax,
      worldBounds.wyMin,
      worldBounds.wyMax,
      view.scale,
      size.w,
      size.h,
      parameters
    ), [curveEntities, functions, implicitCurveSamples, parameters, sampledPolylineCurves, worldBounds, view.scale, size.h, size.w]);
    const pointOverlay = useMemo(() => {
      const screenPoints = specialPoints.map((point) => {
        const [sx, sy] = worldToScreen(point.x, point.y);
        const distanceToMouse = mouse ? Math.hypot(sx - mouse.x, sy - mouse.y) : Infinity;
        return { ...point, key: getPointKey(point), sx, sy, distanceToMouse };
      }).filter((point) => point.sx >= -16 && point.sx <= size.w + 16 && point.sy >= -16 && point.sy <= size.h + 16);
      const snappedPoint = mouse ? screenPoints.reduce((closest, point) => point.distanceToMouse < (closest?.distanceToMouse ?? Infinity) ? point : closest, null) : null;
      return {
        screenPoints,
        snappedPoint: snappedPoint && snappedPoint.distanceToMouse <= 16 ? snappedPoint : null
      };
    }, [mouse, size, specialPoints, worldToScreen]);
    const implicitCurves = useMemo(() => implicitCurveSamples.map((fn) => {
      const segments = fn.segments.map((segment) => {
        const aScreen = worldToScreen(segment.ax, segment.ay);
        const bScreen = worldToScreen(segment.bx, segment.by);
        return {
          ...segment,
          asx: aScreen[0],
          asy: aScreen[1],
          bsx: bScreen[0],
          bsy: bScreen[1]
        };
      }).filter((segment) => Math.max(segment.asx, segment.bsx) >= -24 && Math.min(segment.asx, segment.bsx) <= size.w + 24 && Math.max(segment.asy, segment.bsy) >= -24 && Math.min(segment.asy, segment.bsy) <= size.h + 24);
      let anchor = null;
      segments.forEach((segment) => {
        const sx = (segment.asx + segment.bsx) / 2;
        const sy = (segment.asy + segment.bsy) / 2;
        if (!anchor || sx > anchor.sx) anchor = { sx, sy };
      });
      return { ...fn, segments, anchor };
    }).filter((fn) => fn.segments.length), [implicitCurveSamples, size.h, size.w, worldToScreen]);
    const selectedFunction = useMemo(
      () => functions.find((fn) => fn.id === selectedFunctionId) || null,
      [functions, selectedFunctionId]
    );
    const findPointOnFunction = useCallback((screenPoint, functionId, allowLoose = false) => {
      const targetFunction = functions.find((fn) => fn.id === functionId);
      if (!targetFunction || !targetFunction.visible || !targetFunction.compiled) return null;
      if (targetFunction.compiled.kind === "explicit") {
        const [wx] = screenToWorld(screenPoint.x, screenPoint.y);
        const y = evaluateExplicitSafe(targetFunction.compiled, wx, parameters);
        if (!Number.isFinite(y)) return null;
        const [sx, sy] = worldToScreen(wx, y);
        const dist = Math.hypot(sx - screenPoint.x, sy - screenPoint.y);
        if (!allowLoose && dist > 18) return null;
        return { x: wx, y, sx, sy, dist };
      }
      if (["parametric", "polar"].includes(targetFunction.compiled.kind)) {
        const targetCurve = sampledPolylineCurves.find((fn) => fn.id === functionId);
        if (!targetCurve) return null;
        let best2 = null;
        targetCurve.segments.forEach((segment) => {
          const closest = closestPointOnSegment(
            screenPoint,
            { x: segment.asx, y: segment.asy },
            { x: segment.bsx, y: segment.bsy }
          );
          if (!best2 || closest.dist < best2.dist) {
            best2 = {
              x: segment.ax + (segment.bx - segment.ax) * closest.t,
              y: segment.ay + (segment.by - segment.ay) * closest.t,
              sx: closest.x,
              sy: closest.y,
              dist: closest.dist,
              parameterValue: segment.aParam + (segment.bParam - segment.aParam) * closest.t
            };
          }
        });
        if (!allowLoose && best2 && best2.dist > 18) return null;
        return best2;
      }
      const targetImplicitCurve = implicitCurves.find((fn) => fn.id === functionId);
      if (!targetImplicitCurve) return null;
      let best = null;
      targetImplicitCurve.segments.forEach((segment) => {
        const closest = closestPointOnSegment(
          screenPoint,
          { x: segment.asx, y: segment.asy },
          { x: segment.bsx, y: segment.bsy }
        );
        if (!best || closest.dist < best.dist) {
          best = {
            x: segment.ax + (segment.bx - segment.ax) * closest.t,
            y: segment.ay + (segment.by - segment.ay) * closest.t,
            sx: closest.x,
            sy: closest.y,
            dist: closest.dist
          };
        }
      });
      if (!allowLoose && best && best.dist > 18) return null;
      return best;
    }, [functions, implicitCurves, parameters, sampledPolylineCurves, screenToWorld, worldToScreen]);
    const tangentHandles = useMemo(() => tangentPoints.map((tangent) => {
      const owner = functions.find((fn) => fn.id === tangent.fnId);
      if (!owner || !owner.visible) return null;
      const [sx, sy] = worldToScreen(tangent.x, tangent.y);
      return { ...tangent, color: owner.color, ownerLabel: owner.label, sx, sy };
    }).filter((handle) => handle && handle.sx >= -20 && handle.sx <= size.w + 20 && handle.sy >= -20 && handle.sy <= size.h + 20), [functions, size.h, size.w, tangentPoints, worldToScreen]);
    const curveTracker = useMemo(() => {
      if (!mouse) return null;
      const [wx] = screenToWorld(mouse.x, mouse.y);
      let best = null;
      curveEntities.forEach((fn) => {
        if (!fn.visible || !fn.compiled || fn.compiled.kind !== "explicit") return;
        const y = evaluateExplicitSafe(fn.compiled, wx, parameters);
        if (!Number.isFinite(y)) return;
        const [, sy] = worldToScreen(wx, y);
        const dist = Math.abs(sy - mouse.y);
        if (!best || dist < best.dist) best = { fn, x: wx, y, sx: mouse.x, sy, dist };
      });
      sampledPolylineCurves.filter((fn) => fn.compiled.kind !== "explicit").forEach((fn) => {
        fn.segments.forEach((segment) => {
          const closest = closestPointOnSegment(
            mouse,
            { x: segment.asx, y: segment.asy },
            { x: segment.bsx, y: segment.bsy }
          );
          if (!best || closest.dist < best.dist) {
            best = {
              fn,
              x: segment.ax + (segment.bx - segment.ax) * closest.t,
              y: segment.ay + (segment.by - segment.ay) * closest.t,
              sx: closest.x,
              sy: closest.y,
              dist: closest.dist
            };
          }
        });
      });
      implicitCurves.forEach((fn) => {
        fn.segments.forEach((segment) => {
          const closest = closestPointOnSegment(
            mouse,
            { x: segment.asx, y: segment.asy },
            { x: segment.bsx, y: segment.bsy }
          );
          if (!best || closest.dist < best.dist) {
            best = {
              fn,
              x: segment.ax + (segment.bx - segment.ax) * closest.t,
              y: segment.ay + (segment.by - segment.ay) * closest.t,
              sx: closest.x,
              sy: closest.y,
              dist: closest.dist
            };
          }
        });
      });
      return best && best.dist <= 26 ? best : null;
    }, [mouse, curveEntities, implicitCurves, parameters, sampledPolylineCurves, worldToScreen, screenToWorld]);
    const visiblePoint = pointOverlay.snappedPoint && pointOverlay.snappedPoint.key === revealedPointKey ? pointOverlay.snappedPoint : null;
    const showCurveTrace = !visiblePoint && !!curveTracker;
    useEffect(() => {
      window.clearTimeout(revealTimerRef.current);
      if (!pointOverlay.snappedPoint) {
        setRevealedPointKey(null);
        return;
      }
      const nextKey = pointOverlay.snappedPoint.key;
      setRevealedPointKey(null);
      revealTimerRef.current = window.setTimeout(() => {
        setRevealedPointKey(nextKey);
      }, 150);
      return () => window.clearTimeout(revealTimerRef.current);
    }, [pointOverlay.snappedPoint?.key]);
    useEffect(() => {
      if (!onTrace) return;
      if (visiblePoint) {
        onTrace({
          fn: { color: visiblePoint.type === "intersection" ? theme.ink : visiblePoint.color, label: visiblePoint.label },
          x: visiblePoint.x,
          y: visiblePoint.y,
          kind: visiblePoint.type,
          label2: visiblePoint.label2
        });
        return;
      }
      if (curveTracker) {
        onTrace({
          fn: { color: curveTracker.fn.color, label: curveTracker.fn.label },
          x: curveTracker.x,
          y: curveTracker.y,
          kind: "curve"
        });
        return;
      }
      onTrace(null);
    }, [onTrace, theme.ink, visiblePoint, curveTracker]);
    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      canvas.style.width = size.w + "px";
      canvas.style.height = size.h + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, size.w, size.h);
      const { scale } = view;
      const targetPx = 80;
      const roughStep = targetPx / scale;
      const pow = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const normalized = roughStep / pow;
      let step;
      if (normalized < 1.5) step = pow;
      else if (normalized < 3.5) step = 2 * pow;
      else if (normalized < 7.5) step = 5 * pow;
      else step = 10 * pow;
      const minorStep = step / 5;
      const { wxMin, wxMax, wyMin, wyMax } = worldBounds;
      const drawGridLines = (st, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        const startX2 = Math.ceil(wxMin / st) * st;
        for (let x = startX2; x <= wxMax; x += st) {
          const [sx] = worldToScreen(x, 0);
          ctx.moveTo(sx + 0.5, 0);
          ctx.lineTo(sx + 0.5, size.h);
        }
        const startY2 = Math.ceil(wyMin / st) * st;
        for (let y = startY2; y <= wyMax; y += st) {
          const [, sy] = worldToScreen(0, y);
          ctx.moveTo(0, sy + 0.5);
          ctx.lineTo(size.w, sy + 0.5);
        }
        ctx.stroke();
      };
      drawGridLines(minorStep, theme.gridMinor, 1);
      drawGridLines(step, theme.gridMajor, 1);
      ctx.strokeStyle = theme.axis;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      const [, ax0Y] = worldToScreen(0, 0);
      const [ax0X] = worldToScreen(0, 0);
      if (ax0Y >= 0 && ax0Y <= size.h) {
        ctx.moveTo(0, ax0Y + 0.5);
        ctx.lineTo(size.w, ax0Y + 0.5);
      }
      if (ax0X >= 0 && ax0X <= size.w) {
        ctx.moveTo(ax0X + 0.5, 0);
        ctx.lineTo(ax0X + 0.5, size.h);
      }
      ctx.stroke();
      ctx.fillStyle = theme.muted;
      ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const fmtTick = (v) => {
        if (Math.abs(v) < 1e-10) return "0";
        const abs = Math.abs(v);
        if (abs >= 1e5 || abs < 1e-3) return v.toExponential(1);
        const digits = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
        return v.toFixed(digits);
      };
      const startX = Math.ceil(wxMin / step) * step;
      for (let x = startX; x <= wxMax; x += step) {
        if (Math.abs(x) < step * 1e-3) continue;
        const [sx] = worldToScreen(x, 0);
        const yLabel = Math.max(4, Math.min(size.h - 16, ax0Y + 4));
        ctx.fillText(fmtTick(x), sx, yLabel);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const startY = Math.ceil(wyMin / step) * step;
      for (let y = startY; y <= wyMax; y += step) {
        if (Math.abs(y) < step * 1e-3) continue;
        const [, sy] = worldToScreen(0, y);
        const xLabel = Math.max(24, Math.min(size.w - 4, ax0X - 6));
        ctx.fillText(fmtTick(y), xLabel, sy);
      }
      if (ax0X >= 0 && ax0X <= size.w && ax0Y >= 0 && ax0Y <= size.h) {
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("0", ax0X - 4, ax0Y + 4);
      }
      const labelAnchors = [];
      sampledPolylineCurves.forEach((fn) => {
        ctx.strokeStyle = fn.color;
        ctx.lineWidth = fn.thickness || 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash(fn.dash || []);
        ctx.beginPath();
        fn.segments.forEach((segment) => {
          ctx.moveTo(segment.asx, segment.asy);
          ctx.lineTo(segment.bsx, segment.bsy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        if (fn.anchor && fn.label && fn.showLabel !== false) labelAnchors.push({ label: fn.label, color: fn.color, sx: fn.anchor.sx, sy: fn.anchor.sy });
      });
      implicitCurves.forEach((fn) => {
        ctx.strokeStyle = fn.color;
        ctx.lineWidth = fn.thickness || 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash(fn.dash || []);
        ctx.beginPath();
        fn.segments.forEach((segment) => {
          ctx.moveTo(segment.asx, segment.asy);
          ctx.lineTo(segment.bsx, segment.bsy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        if (fn.anchor && fn.label && fn.showLabel !== false) labelAnchors.push({ label: fn.label, color: fn.color, sx: fn.anchor.sx, sy: fn.anchor.sy });
      });
      tangentHandles.forEach((handle) => {
        const isSelectedOwner = handle.fnId === selectedFunctionId;
        ctx.save();
        ctx.fillStyle = theme.panel;
        ctx.strokeStyle = handle.color;
        ctx.lineWidth = tangentMode && isSelectedOwner ? 2.5 : 2;
        ctx.beginPath();
        ctx.arc(handle.sx, handle.sy, tangentMode && isSelectedOwner ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = handle.color;
        ctx.beginPath();
        ctx.arc(handle.sx, handle.sy, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      if (labelAnchors.length) {
        ctx.save();
        ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = "middle";
        const placed = [];
        labelAnchors.sort((a, b) => b.sx - a.sx).forEach(({ label, color, sx, sy }) => {
          let lx = Math.min(sx + 6, size.w - 4 - ctx.measureText(label).width);
          let ly = Math.max(10, Math.min(size.h - 10, sy));
          const minGap = 14;
          let tries = 0;
          while (placed.some((p) => Math.abs(p.sx - lx) < 40 && Math.abs(p.sy - ly) < minGap) && tries++ < 12) {
            ly += (tries % 2 ? -1 : 1) * minGap;
            ly = Math.max(10, Math.min(size.h - 10, ly));
          }
          placed.push({ sx: lx, sy: ly });
          ctx.fillStyle = theme.panel;
          const w = ctx.measureText(label).width;
          ctx.globalAlpha = 0.88;
          ctx.fillRect(lx - 2, ly - 8, w + 4, 16);
          ctx.globalAlpha = 1;
          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.fillText(label, lx, ly);
        });
        ctx.restore();
      }
      const { screenPoints, snappedPoint } = pointOverlay;
      const activePoint = snappedPoint;
      const labelPhases = labelFade ? [
        { mode: labelFade.from, alpha: 1 - labelFade.progress },
        { mode: labelFade.to, alpha: labelFade.progress }
      ] : [{ mode: coordMode, alpha: 1 }];
      screenPoints.forEach((point) => {
        ctx.save();
        const isActive = activePoint === point;
        const radius = isActive ? 5.5 : 4;
        if (point.type === "intersection") {
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = theme.panel;
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, radius, -Math.PI / 2, Math.PI / 2);
          ctx.fillStyle = point.color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, radius, Math.PI / 2, -Math.PI / 2);
          ctx.fillStyle = point.color2 || point.color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = theme.ink;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else if (point.type === "max" || point.type === "min") {
          ctx.fillStyle = point.color;
          ctx.strokeStyle = theme.panel;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(point.sx, point.sy - radius);
          ctx.lineTo(point.sx + radius, point.sy);
          ctx.lineTo(point.sx, point.sy + radius);
          ctx.lineTo(point.sx - radius, point.sy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = point.color;
          ctx.strokeStyle = theme.panel;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
      const typeText = { zero: "zero", max: "max", min: "min", intersection: "\u2229" };
      const drawReadout = (point, { titleLines, color, showCrosshair }) => {
        ctx.save();
        if (showCrosshair) {
          ctx.strokeStyle = theme.ruleStrong;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(point.sx, 0);
          ctx.lineTo(point.sx, size.h);
          ctx.moveTo(0, point.sy);
          ctx.lineTo(size.w, point.sy);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = theme.ruleStrong;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(point.sx, point.sy);
          ctx.lineTo(point.sx, size.h);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        ctx.save();
        ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
        const titleWidth = titleLines.reduce((w, line) => Math.max(w, ctx.measureText(line).width), 0);
        ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
        const coordLabels = labelPhases.map(({ mode, alpha }) => ({
          text: formatPointLabel(point.x, point.y, mode),
          alpha
        })).filter((label) => label.alpha > 1e-3);
        const coordWidth = coordLabels.reduce((w, l) => Math.max(w, ctx.measureText(l.text).width), 0);
        const contentW = Math.max(titleWidth, coordWidth);
        const padX = 7;
        const titleH = titleLines.length ? 14 : 0;
        const boxH = titleH + 18;
        let lx = point.sx + 10;
        let ly = point.sy - boxH - 8;
        if (lx + contentW + padX * 2 > size.w - 6) lx = point.sx - contentW - padX * 2 - 10;
        if (ly < 6) ly = point.sy + 12;
        if (ly + boxH > size.h - 6) ly = point.sy - boxH - 8;
        ctx.fillStyle = theme.panel;
        ctx.strokeStyle = theme.ruleStrong;
        ctx.lineWidth = 1;
        ctx.fillRect(lx, ly, contentW + padX * 2, boxH);
        ctx.strokeRect(lx + 0.5, ly + 0.5, contentW + padX * 2 - 1, boxH - 1);
        if (titleLines.length) {
          ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = color || theme.muted;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(titleLines.join("  "), lx + padX, ly + 8);
        }
        coordLabels.forEach(({ text, alpha }) => {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = theme.ink;
          ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(text, lx + padX, ly + titleH + 9);
          ctx.restore();
        });
        ctx.restore();
      };
      if (visiblePoint) {
        const titleLines = [];
        if (visiblePoint.type === "intersection") {
          titleLines.push(`${visiblePoint.label || ""} \u2229 ${visiblePoint.label2 || ""}`.trim());
        } else if (visiblePoint.type && typeText[visiblePoint.type]) {
          titleLines.push(`${visiblePoint.label || ""} \xB7 ${typeText[visiblePoint.type]}`.trim());
        }
        drawReadout(visiblePoint, { titleLines, color: visiblePoint.color, showCrosshair: true });
      } else if (showCurveTrace) {
        const tracker = curveTracker;
        ctx.save();
        ctx.fillStyle = tracker.fn.color;
        ctx.strokeStyle = theme.panel;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tracker.sx, tracker.sy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        drawReadout(
          { sx: tracker.sx, sy: tracker.sy, x: tracker.x, y: tracker.y },
          { titleLines: tracker.fn.label ? [tracker.fn.label] : [], color: tracker.fn.color, showCrosshair: false }
        );
      }
    }, [
      coordMode,
      curveTracker,
      implicitCurves,
      labelFade,
      pointOverlay,
      selectedFunctionId,
      showCurveTrace,
      sampledPolylineCurves,
      size,
      tangentHandles,
      tangentMode,
      theme,
      view,
      visiblePoint,
      worldBounds,
      worldToScreen
    ]);
    useEffect(() => {
      draw();
    }, [draw]);
    const onMouseDown = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const nextMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (tangentMode && selectedFunction) {
        const handle = tangentHandles.filter((item) => item.fnId === selectedFunction.id).reduce((best, item) => {
          const dist = Math.hypot(nextMouse.x - item.sx, nextMouse.y - item.sy);
          return !best || dist < best.dist ? { item, dist } : best;
        }, null);
        if (handle && handle.dist <= 14) {
          tangentDragRef.current = { id: handle.item.id, fnId: selectedFunction.id };
          setMouse(nextMouse);
          return;
        }
        const curvePoint = findPointOnFunction(nextMouse, selectedFunction.id);
        if (curvePoint) {
          const seq = tangentPoints.filter((point) => point.fnId === selectedFunction.id).length;
          const nextTangent = {
            id: Math.random().toString(36).slice(2, 9),
            fnId: selectedFunction.id,
            seq,
            x: curvePoint.x,
            y: curvePoint.y,
            parameterValue: curvePoint.parameterValue
          };
          tangentDragRef.current = { id: nextTangent.id, fnId: selectedFunction.id };
          onTangentPointsChange((prev) => [...prev, nextTangent]);
          setMouse(nextMouse);
          return;
        }
      }
      draggingRef.current = { x: e.clientX, y: e.clientY, view: { ...view } };
      setMouse(nextMouse);
    };
    const onMouseMove = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const nextMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (tangentDragRef.current) {
        const curvePoint = findPointOnFunction(nextMouse, tangentDragRef.current.fnId, true);
        if (curvePoint) {
          onTangentPointsChange((prev) => prev.map((tangent) => tangent.id === tangentDragRef.current.id ? { ...tangent, x: curvePoint.x, y: curvePoint.y, parameterValue: curvePoint.parameterValue } : tangent));
        }
        setMouse(nextMouse);
        return;
      }
      if (draggingRef.current) {
        const dx = e.clientX - draggingRef.current.x;
        const dy = e.clientY - draggingRef.current.y;
        setView({
          ...draggingRef.current.view,
          cx: draggingRef.current.view.cx - dx / view.scale,
          cy: draggingRef.current.view.cy + dy / view.scale
        });
        setMouse(null);
        return;
      }
      setMouse(nextMouse);
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      tangentDragRef.current = null;
    };
    const onMouseLeave = () => {
      draggingRef.current = null;
      tangentDragRef.current = null;
      setMouse(null);
    };
    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wxBefore, wyBefore] = screenToWorld(mx, my);
      const factor = Math.exp(-e.deltaY * 15e-4);
      const newScale = Math.max(0.5, Math.min(8e3, view.scale * factor));
      const newCx = wxBefore - (mx - size.w / 2) / newScale;
      const newCy = wyBefore + (my - size.h / 2) / newScale;
      setView({ cx: newCx, cy: newCy, scale: newScale });
    };
    const onTouchStart = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        draggingRef.current = { x: t.clientX, y: t.clientY, view: { ...view } };
        pinchRef.current = null;
        setMouse({ x: t.clientX - rect.left, y: t.clientY - rect.top });
      } else if (e.touches.length === 2) {
        draggingRef.current = null;
        const [t1, t2] = e.touches;
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchRef.current = {
          dist,
          scale: view.scale,
          cx: view.cx,
          cy: view.cy,
          midX: (t1.clientX + t2.clientX) / 2 - rect.left,
          midY: (t1.clientY + t2.clientY) / 2 - rect.top
        };
        setMouse(null);
      }
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      if (e.touches.length === 1 && draggingRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - draggingRef.current.x;
        const dy = t.clientY - draggingRef.current.y;
        setView({
          ...draggingRef.current.view,
          cx: draggingRef.current.view.cx - dx / view.scale,
          cy: draggingRef.current.view.cy + dy / view.scale
        });
        setMouse({ x: t.clientX - rect.left, y: t.clientY - rect.top });
      } else if (e.touches.length === 2 && pinchRef.current) {
        const [t1, t2] = e.touches;
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = dist / pinchRef.current.dist;
        const newScale = Math.max(0.5, Math.min(8e3, pinchRef.current.scale * factor));
        const mx = pinchRef.current.midX;
        const my = pinchRef.current.midY;
        const wxBefore = pinchRef.current.cx + (mx - size.w / 2) / pinchRef.current.scale;
        const wyBefore = pinchRef.current.cy - (my - size.h / 2) / pinchRef.current.scale;
        const newCx = wxBefore - (mx - size.w / 2) / newScale;
        const newCy = wyBefore + (my - size.h / 2) / newScale;
        setView({ cx: newCx, cy: newCy, scale: newScale });
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        draggingRef.current = null;
        pinchRef.current = null;
        setMouse(null);
      }
    };
    return /* @__PURE__ */ React.createElement("div", { ref: wrapRef, style: { position: "absolute", inset: 0, overflow: "hidden" } }, /* @__PURE__ */ React.createElement(
      "canvas",
      {
        ref: canvasRef,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onWheel,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel: onTouchEnd,
        style: { display: "block", cursor: draggingRef.current || tangentDragRef.current ? "grabbing" : "crosshair" },
        "aria-label": "Function plot canvas"
      }
    ));
  }
  function FunctionRow({ fn, theme, onChange, onDelete, isOnly, selected, onSelect }) {
    const [editing, setEditing] = useState(!fn.expr);
    const [draft, setDraft] = useState(fn.expr);
    const inputRef = useRef(null);
    useEffect(() => {
      setDraft(fn.expr);
    }, [fn.expr]);
    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);
    const commit = () => {
      onChange({ ...fn, expr: draft });
      setEditing(false);
    };
    const hasError = !!fn.error;
    const label = fn.label || "f";
    const curveKind = fn.curveKind || inferCurveKindFromExpr(fn.expr);
    const descriptor = curveKind === "implicit" ? `${label}(x, y)` : curveKind === "parametric" ? `${label}(t) =` : curveKind === "polar" ? `${label}(\u03B8) =` : `${label}(x) =`;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        onClick: onSelect,
        style: {
          display: "flex",
          alignItems: "stretch",
          borderBottom: `1px solid ${theme.rule}`,
          background: selected ? theme.chip : theme.panel,
          boxShadow: selected ? `inset 2px 0 0 ${fn.color}` : "none"
        }
      },
      /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            onChange({ ...fn, visible: !fn.visible });
          },
          title: fn.visible ? "Hide" : "Show",
          "aria-label": fn.visible ? `Hide ${label}` : `Show ${label}`,
          style: {
            width: 36,
            border: "none",
            cursor: "pointer",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRight: `1px solid ${theme.rule}`
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: {
          width: 14,
          height: 14,
          borderRadius: 14,
          background: fn.visible ? fn.color : "transparent",
          border: fn.visible ? "none" : `1.5px dashed ${theme.ruleStrong}`,
          transition: "all 150ms"
        } })
      ),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, padding: "10px 10px 10px 12px", minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
        color: theme.muted,
        letterSpacing: "0.02em",
        opacity: fn.visible ? 1 : 0.45
      } }, descriptor), editing ? /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: inputRef,
          value: draft,
          onClick: (e) => e.stopPropagation(),
          onChange: (e) => setDraft(e.target.value),
          onBlur: commit,
          onKeyDown: (e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(fn.expr);
              setEditing(false);
            }
          },
          placeholder: "e.g. y = sin(x); x in [-pi, pi]",
          "aria-label": `Expression for ${label}`,
          style: {
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 14,
            color: theme.ink,
            padding: "2px 0",
            marginTop: 2,
            borderBottom: `1.5px solid ${fn.color}`
          }
        }
      ) : /* @__PURE__ */ React.createElement(
        "div",
        {
          onClick: (e) => {
            e.stopPropagation();
            onSelect();
            setEditing(true);
          },
          style: {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 14,
            color: hasError ? "#c94a3a" : theme.ink,
            cursor: "text",
            padding: "2px 0",
            marginTop: 2,
            opacity: fn.visible ? 1 : 0.45,
            wordBreak: "break-word",
            textDecoration: hasError ? "underline wavy #c94a3a" : "none",
            textUnderlineOffset: 3
          }
        },
        fn.expr ? hasError ? fn.expr : /* @__PURE__ */ React.createElement("span", { className: "expr-preview" }, renderExpressionPreview(fn.expr)) : /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted } }, "click to enter an expression\u2026")
      ), hasError && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#c94a3a", marginTop: 3, fontFamily: '"JetBrains Mono", monospace' } }, fn.error), selected && /* @__PURE__ */ React.createElement("div", { style: {
        marginTop: 6,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        color: fn.color,
        letterSpacing: "0.08em",
        textTransform: "uppercase"
      } }, "selected")),
      !isOnly && /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            onDelete();
          },
          title: "Remove",
          "aria-label": `Remove ${label}`,
          style: {
            width: 32,
            border: "none",
            background: "transparent",
            color: theme.muted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.5
          },
          onMouseEnter: (e) => e.currentTarget.style.opacity = 1,
          onMouseLeave: (e) => e.currentTarget.style.opacity = 0.5
        },
        /* @__PURE__ */ React.createElement(TrashIcon, null)
      )
    );
  }
  function SidebarButton({ children, onClick, theme }) {
    const [hover, setHover] = useState(false);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick,
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        style: {
          padding: "6px 10px",
          background: hover ? theme.chip : "transparent",
          border: `1px solid ${theme.rule}`,
          borderRadius: 4,
          color: theme.ink,
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          cursor: "pointer",
          transition: "background 120ms"
        }
      },
      children
    );
  }
  function ParameterControl({ name, config, theme, onChange }) {
    const apply = (patch) => onChange(name, patch);
    return /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 16px", borderBottom: `1px solid ${theme.rule}` } }, /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11
    } }, /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink } }, name), /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted } }, formatDecimalNumber(config.value))), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "range",
        min: config.min,
        max: config.max,
        step: config.step,
        value: config.value,
        onChange: (e) => apply({ value: parseFloat(e.target.value) }),
        style: { width: "100%", accentColor: theme.accent }
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        value: config.min,
        step: config.step,
        onChange: (e) => apply({ min: parseFloat(e.target.value) }),
        style: { width: "100%", border: `1px solid ${theme.rule}`, borderRadius: 4, padding: "5px 6px", background: theme.panel, color: theme.ink, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        value: config.value,
        step: config.step,
        onChange: (e) => apply({ value: parseFloat(e.target.value) }),
        style: { width: "100%", border: `1px solid ${theme.rule}`, borderRadius: 4, padding: "5px 6px", background: theme.panel, color: theme.ink, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        value: config.max,
        step: config.step,
        onChange: (e) => apply({ max: parseFloat(e.target.value) }),
        style: { width: "100%", border: `1px solid ${theme.rule}`, borderRadius: 4, padding: "5px 6px", background: theme.panel, color: theme.ink, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }
      }
    )));
  }
  function ExpandedSidebarInner({
    functions,
    setFunctions,
    theme,
    view,
    setView,
    traceInfo,
    onExport,
    onCollapse,
    width,
    themeKey,
    pickTheme,
    coordMode,
    onFitView,
    selectedFunctionId,
    onSelectFunction,
    parameterNames,
    parameterConfig,
    onParameterChange
  }) {
    const [themeMenuOpen, setThemeMenuOpen] = useState(false);
    const themeMenuRef = useRef(null);
    const addFn = () => {
      const palette = theme.funcPalette;
      const color = nextFreeColor(functions, palette);
      const labelSeq = nextFreeSeq(functions);
      setFunctions([...functions, {
        id: Math.random().toString(36).slice(2, 9),
        expr: "",
        visible: true,
        color,
        thickness: 2,
        labelSeq,
        label: formatFnLabel(labelSeq)
      }]);
    };
    const updateFn = (idx, next) => {
      const copy = [...functions];
      copy[idx] = next;
      setFunctions(copy);
    };
    const deleteFn = (idx) => setFunctions(functions.filter((_, i) => i !== idx));
    const resetView = () => setView({ cx: 0, cy: 0, scale: 50 });
    useEffect(() => {
      if (!themeMenuOpen) return;
      const onPointerDown = (e) => {
        if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) setThemeMenuOpen(false);
      };
      const onKeyDown = (e) => {
        if (e.key === "Escape") setThemeMenuOpen(false);
      };
      window.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    }, [themeMenuOpen]);
    return /* @__PURE__ */ React.createElement("div", { style: {
      width,
      height: "100%",
      background: theme.panel,
      display: "flex",
      flexDirection: "column"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "18px 16px 14px 16px",
      borderBottom: `1px solid ${theme.rule}`,
      display: "flex",
      alignItems: "center",
      gap: 10
    } }, /* @__PURE__ */ React.createElement(LocusMark, { color: theme.ink }), /* @__PURE__ */ React.createElement("div", { style: { lineHeight: 1, flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 17,
      fontWeight: 600,
      color: theme.ink,
      letterSpacing: "-0.01em"
    } }, "Locus"), /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      marginTop: 3,
      letterSpacing: "0.08em",
      textTransform: "uppercase"
    } }, "function plotter")), /* @__PURE__ */ React.createElement("div", { ref: themeMenuRef, style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setThemeMenuOpen((v) => !v),
        title: "Theme",
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
          height: 28,
          border: `1px solid ${theme.rule}`,
          background: themeMenuOpen ? theme.chip : "transparent",
          borderRadius: 4,
          cursor: "pointer",
          color: theme.ink,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 8, background: theme.accent } }),
      window.LOCUS_THEMES[themeKey].name
    ), themeMenuOpen && /* @__PURE__ */ React.createElement("div", { className: "popover-grow", style: {
      position: "absolute",
      top: "calc(100% + 8px)",
      right: 0,
      width: 196,
      padding: 10,
      background: theme.panel,
      border: `1px solid ${theme.rule}`,
      borderRadius: 6,
      boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
      zIndex: 20
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      marginBottom: 8
    } }, "Theme"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 } }, Object.entries(window.LOCUS_THEMES).map(([key, t]) => {
      const active = themeKey === key;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key,
          onClick: () => {
            pickTheme(key);
            setThemeMenuOpen(false);
          },
          title: t.name,
          style: {
            aspectRatio: "1",
            border: active ? `2px solid ${theme.ink}` : `1px solid ${theme.rule}`,
            borderRadius: 4,
            cursor: "pointer",
            padding: 3,
            background: t.bg,
            position: "relative",
            transition: "border-color 150ms, transform 120ms"
          },
          onMouseEnter: (e) => {
            if (!active) e.currentTarget.style.borderColor = theme.ruleStrong;
          },
          onMouseLeave: (e) => {
            if (!active) e.currentTarget.style.borderColor = theme.rule;
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: {
          position: "absolute",
          inset: 4,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2
        } }, t.funcPalette.slice(0, 3).map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { background: c, borderRadius: 1 } })))
      );
    })))), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: onCollapse,
        title: "Collapse sidebar",
        style: {
          width: 28,
          height: 28,
          border: `1px solid ${theme.rule}`,
          background: "transparent",
          borderRadius: 4,
          cursor: "pointer",
          color: theme.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      /* @__PURE__ */ React.createElement(ChevronLeft, null)
    )), /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px 8px 16px"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      letterSpacing: "0.1em",
      textTransform: "uppercase"
    } }, "Functions \xB7 ", functions.length), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: addFn,
        title: "Add function",
        style: {
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          background: "transparent",
          border: `1px solid ${theme.rule}`,
          borderRadius: 4,
          color: theme.ink,
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          cursor: "pointer"
        },
        onMouseEnter: (e) => e.currentTarget.style.borderColor = theme.ruleStrong,
        onMouseLeave: (e) => e.currentTarget.style.borderColor = theme.rule
      },
      /* @__PURE__ */ React.createElement(PlusIcon, null),
      " Add"
    )), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", borderTop: `1px solid ${theme.rule}` } }, functions.map((fn, i) => /* @__PURE__ */ React.createElement(
      FunctionRow,
      {
        key: fn.id,
        fn,
        theme,
        onChange: (next) => updateFn(i, next),
        onDelete: () => deleteFn(i),
        isOnly: functions.length === 1,
        selected: fn.id === selectedFunctionId,
        onSelect: () => onSelectFunction(fn.id)
      }
    )), functions.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "20px 16px", color: theme.muted, fontSize: 12 } }, "No functions yet. Add one to get started."), parameterNames.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { borderTop: `1px solid ${theme.rule}`, marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "12px 16px 8px 16px",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      letterSpacing: "0.08em",
      textTransform: "uppercase"
    } }, "Parameters"), parameterNames.map((name) => /* @__PURE__ */ React.createElement(
      ParameterControl,
      {
        key: name,
        name,
        config: sanitizeParameterConfig(parameterConfig[name], defaultParameterConfig(name)),
        theme,
        onChange: onParameterChange
      }
    ))), /* @__PURE__ */ React.createElement("div", { style: {
      padding: "12px 16px 16px 16px",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      lineHeight: 1.6,
      borderTop: `1px dashed ${theme.rule}`,
      marginTop: 8
    } }, /* @__PURE__ */ React.createElement("div", { style: { letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 } }, "Reference"), /* @__PURE__ */ React.createElement("div", null, "y = sin(x) \xB7 y = 0.5*x^2 - 2"), /* @__PURE__ */ React.createElement("div", null, "x^2 + y^2 = 9 \xB7 y^2 = 4x"), /* @__PURE__ */ React.createElement("div", null, "x = cos(t); y = sin(t); t in [0, 2*pi]"), /* @__PURE__ */ React.createElement("div", null, "r = 1 + a*cos(theta); theta in [0, 2*pi]"), /* @__PURE__ */ React.createElement("div", null, "piecewise(x < 0, -1, x > 1, 1, x)"), /* @__PURE__ */ React.createElement("div", null, "y = sqrt(4 - x^2); x in [-2, 2]"), /* @__PURE__ */ React.createElement("div", null, "sin \xB7 cos \xB7 tan \xB7 asin \xB7 acos \xB7 atan"), /* @__PURE__ */ React.createElement("div", null, "exp \xB7 ln \xB7 log \xB7 sqrt \xB7 abs \xB7 pow"), /* @__PURE__ */ React.createElement("div", null, "pi \xB7 e \xB7 tau \xB7 sec \xB7 csc \xB7 cot \xB7 if"))), /* @__PURE__ */ React.createElement("div", { style: { borderTop: `1px solid ${theme.rule}` } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "10px 16px",
      borderBottom: `1px solid ${theme.rule}`,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11,
      minHeight: 38,
      display: "flex",
      alignItems: "center"
    } }, traceInfo ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 8, background: traceInfo.fn.color } }), traceInfo.fn.label && /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink, fontWeight: 600 } }, traceInfo.kind === "intersection" ? `${traceInfo.fn.label} \u2229 ${traceInfo.label2 || ""}` : traceInfo.kind && traceInfo.kind !== "curve" ? `${traceInfo.fn.label} \xB7 ${traceInfo.kind}` : traceInfo.fn.label), /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted } }, "x"), /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink } }, formatCoordinateValue(traceInfo.x, coordMode)), /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted, marginLeft: 6 } }, "y"), /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink } }, formatCoordinateValue(traceInfo.y, coordMode))) : /* @__PURE__ */ React.createElement("div", { style: { color: theme.muted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" } }, "hover any curve to trace")), /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 16px 12px 16px", display: "flex", gap: 6, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => setView({ ...view, scale: Math.min(8e3, view.scale * 1.4) }) }, "Zoom +"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => setView({ ...view, scale: Math.max(0.5, view.scale / 1.4) }) }, "Zoom \u2212"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: onFitView }, "Fit data"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => setView({ cx: 0, cy: 0, scale: 50 }) }, "Reset"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: onExport }, "Export PNG"))));
  }
  function CollapsedRailInner({ functions, theme, onExpand, onToggleVisibility }) {
    return /* @__PURE__ */ React.createElement("div", { style: {
      width: RAIL_WIDTH,
      height: "100%",
      background: theme.panel,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: 14
    } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: onExpand,
        title: "Expand sidebar",
        "aria-label": "Expand sidebar",
        style: {
          width: 32,
          height: 32,
          border: `1px solid ${theme.rule}`,
          background: "transparent",
          borderRadius: 4,
          cursor: "pointer",
          color: theme.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14
        }
      },
      /* @__PURE__ */ React.createElement(ChevronRight, null)
    ), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement(LocusMark, { color: theme.ink })), /* @__PURE__ */ React.createElement("div", { style: {
      width: "100%",
      borderTop: `1px solid ${theme.rule}`,
      paddingTop: 12,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8
    } }, functions.map((fn) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: fn.id,
        onClick: () => onToggleVisibility(fn.id),
        title: `${fn.label || "f"}(x) = ${fn.expr || "\u2014"}  \xB7  click to ${fn.visible ? "hide" : "show"}`,
        "aria-label": `${fn.visible ? "Hide" : "Show"} ${fn.label || "function"}`,
        style: {
          width: 18,
          height: 18,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: {
        width: 12,
        height: 12,
        borderRadius: 12,
        background: fn.visible ? fn.color : "transparent",
        border: fn.visible ? "none" : `1.5px dashed ${theme.ruleStrong}`,
        transition: "background 120ms"
      } })
    ))), /* @__PURE__ */ React.createElement("div", { style: {
      marginTop: "auto",
      padding: "10px 0",
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 9,
      color: theme.muted,
      letterSpacing: "0.2em",
      textTransform: "uppercase"
    } }, "Locus"));
  }
  function SidebarShell(props) {
    const { collapsed, expandedWidth, theme, onResizeStart, resizing } = props;
    const currentWidth = collapsed ? RAIL_WIDTH : expandedWidth;
    const expandedSnapshotRef = useRef(expandedWidth);
    if (!collapsed) expandedSnapshotRef.current = expandedWidth;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: `sidebar-shell ${resizing ? "no-anim" : ""}`,
        style: {
          width: currentWidth,
          borderRight: `1px solid ${theme.rule}`,
          background: theme.panel
        }
      },
      /* @__PURE__ */ React.createElement(
        "div",
        {
          className: `sidebar-content ${collapsed ? "hidden" : ""}`,
          style: { width: expandedSnapshotRef.current }
        },
        /* @__PURE__ */ React.createElement(ExpandedSidebarInner, { ...props, width: expandedSnapshotRef.current })
      ),
      /* @__PURE__ */ React.createElement("div", { className: `sidebar-rail ${collapsed ? "" : "hidden"}` }, /* @__PURE__ */ React.createElement(
        CollapsedRailInner,
        {
          functions: props.functions,
          theme,
          onExpand: props.onExpand,
          onToggleVisibility: props.onToggleVisibility
        }
      )),
      !collapsed && /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "resize-handle",
          onMouseDown: onResizeStart,
          title: "Drag to resize",
          style: {
            position: "absolute",
            top: 0,
            right: -3,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 10
          }
        },
        /* @__PURE__ */ React.createElement("div", { className: "resize-bar", style: {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 3,
          width: 1
        } })
      )
    );
  }
  window.LocusUI = { PlotCanvas, SidebarShell };
})();
