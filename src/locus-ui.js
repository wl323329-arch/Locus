(() => {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const {
    RAIL_WIDTH,
    MIN_VIEW_SCALE,
    MAX_VIEW_SCALE,
    DEFAULT_VIEW,
    sanitizeView,
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
    buildVisiblePolylineCurves,
    computeSpecialPoints,
    getImplicitSampleGrid,
    sampleVisibleImplicitCurves,
    closestPointOnSegment,
    getTangentLine
  } = window.LocusShared;
  const EXPR_FUNCTION_NAMES = /* @__PURE__ */ new Set(["sin", "cos", "tan", "asin", "acos", "atan", "exp", "ln", "log", "sqrt", "abs", "pow", "sec", "csc", "cot"]);
  const EXPR_CONSTANT_NAMES = /* @__PURE__ */ new Set(["pi", "e", "tau"]);
  const EXAMPLE_SECTIONS = [
    {
      title: "\u57FA\u7840\u66F2\u7EBF",
      description: "\u5FEB\u901F\u653E\u5165\u5E38\u89C1\u663E\u51FD\u6570\u3002",
      items: [
        { label: "\u6B63\u5F26\u66F2\u7EBF", expr: "sin(x)" },
        { label: "\u629B\u7269\u7EBF", expr: "0.5 * x^2 - 2" },
        { label: "\u963B\u5C3C\u4F59\u5F26", expr: "cos(x) * e^(-0.1 * x^2)" },
        { label: "\u4E0A\u534A\u5706", expr: "sqrt(4 - x^2); x in [-2, 2]" }
      ]
    },
    {
      title: "\u9690\u51FD\u6570",
      description: "\u5706\u9525\u66F2\u7EBF\u548C\u5173\u7CFB\u5F0F\u653E\u8FD9\u91CC\u3002",
      items: [
        { label: "\u5706", expr: "x^2 + y^2 = 9" },
        { label: "\u629B\u7269\u7EBF", expr: "y^2 = 4x" },
        { label: "\u53CC\u66F2\u7EBF", expr: "x^2 - y^2 = 4" }
      ]
    },
    {
      title: "\u53C2\u6570\u4E0E\u6781\u5750\u6807",
      description: "\u9700\u8981\u53C2\u6570\u6ED1\u5757\u65F6\u4ECE\u8FD9\u7EC4\u5F00\u59CB\u3002",
      items: [
        { label: "\u5355\u4F4D\u5706\u53C2\u6570\u5F0F", expr: "x = cos(t); y = sin(t); t in [0, 2*pi]" },
        { label: "\u6446\u7EBF", expr: "x = t - sin(t); y = 1 - cos(t); t in [0, 4*pi]" },
        { label: "\u5FC3\u5F62\u7EBF", expr: "r = 1 + a*cos(theta); theta in [0, 2*pi]" }
      ]
    },
    {
      title: "\u8BED\u6CD5\u901F\u67E5",
      description: "\u7ED9\u8868\u8FBE\u5F0F\u7F16\u8F91\u5668\u7684\u5E38\u7528\u8BED\u6CD5\u3002",
      items: [
        { label: "\u5206\u6BB5\u51FD\u6570", expr: "piecewise(x < 0, -1, x > 1, 1, x)" },
        { label: "\u51FD\u6570\u540D", expr: "sin cos tan asin acos atan exp ln log sqrt abs pow" },
        { label: "\u5E38\u91CF\u540D", expr: "pi e tau sec csc cot if" }
      ]
    }
  ];
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

  function useCanvasSize(wrapRef) {
    const [size, setSize] = useState({ w: 800, h: 600 });
    useEffect(() => {
      if (!wrapRef.current) return;
      const ro = new ResizeObserver(() => {
        const r = wrapRef.current.getBoundingClientRect();
        setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
      });
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, [wrapRef]);
    return size;
  }

  function usePanAndPinch({ setView, size }) {
    const draggingRef = useRef(null);
    const pinchRef = useRef(null);
    const zoomAroundPoint = useCallback((baseView, screenX, screenY, factorX, factorY) => {
      const sourceView = sanitizeView(baseView);
      const wxBefore = sourceView.cx + (screenX - size.w / 2) / sourceView.scaleX;
      const wyBefore = sourceView.cy - (screenY - size.h / 2) / sourceView.scaleY;
      const scaleX = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, sourceView.scaleX * factorX));
      const scaleY = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, sourceView.scaleY * factorY));
      setView({
        cx: wxBefore - (screenX - size.w / 2) / scaleX,
        cy: wyBefore + (screenY - size.h / 2) / scaleY,
        scaleX,
        scaleY
      });
    }, [setView, size.h, size.w]);
    return { draggingRef, pinchRef, zoomAroundPoint };
  }

  function useTangentDrag({ selectedFunction, tangentMode, tangentHandles, tangentPoints, findPointOnFunction, onTangentPointsChange }) {
    const tangentDragRef = useRef(null);
    const tryStart = (localPoint) => {
      if (!tangentMode || !selectedFunction) return false;
      const handle = tangentHandles
        .filter((item) => item.fnId === selectedFunction.id)
        .reduce((best, item) => {
          const dist = Math.hypot(localPoint.x - item.sx, localPoint.y - item.sy);
          return !best || dist < best.dist ? { item, dist } : best;
        }, null);
      if (handle && handle.dist <= 14) {
        tangentDragRef.current = { id: handle.item.id, fnId: selectedFunction.id };
        return true;
      }
      const curvePoint = findPointOnFunction(localPoint, selectedFunction.id);
      if (!curvePoint) return false;
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
      return true;
    };
    const tryMove = (localPoint) => {
      if (!tangentDragRef.current) return false;
      const curvePoint = findPointOnFunction(localPoint, tangentDragRef.current.fnId, true);
      if (curvePoint) {
        onTangentPointsChange((prev) => prev.map((tangent) => tangent.id === tangentDragRef.current.id
          ? { ...tangent, x: curvePoint.x, y: curvePoint.y, parameterValue: curvePoint.parameterValue }
          : tangent));
      }
      return true;
    };
    const end = () => {
      tangentDragRef.current = null;
    };
    return { tangentDragRef, tryStart, tryMove, end };
  }

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
    const baseCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const wrapRef = useRef(null);
    const size = useCanvasSize(wrapRef);
    const mouseRef = useRef(null);
    const [hoverVersion, setHoverVersion] = useState(0);
    const hoverRafRef = useRef(0);
    const scheduleHover = useCallback(() => {
      if (hoverRafRef.current) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = 0;
        setHoverVersion((v) => (v + 1) | 0);
      });
    }, []);
    const setHoverMouse = useCallback((next) => {
      mouseRef.current = next;
      scheduleHover();
    }, [scheduleHover]);
    useEffect(() => () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    }, []);
    const [labelFade, setLabelFade] = useState(null);
    const [revealedPointKey, setRevealedPointKey] = useState(null);
    const revealTimerRef = useRef(null);
    const prevCoordModeRef = useRef(coordMode);
    useEffect(() => { scheduleHover(); }, [size.w, size.h, scheduleHover]);
    const worldToScreen = useCallback((wx, wy) => {
      const { cx, cy, scaleX, scaleY } = view;
      return [size.w / 2 + (wx - cx) * scaleX, size.h / 2 - (wy - cy) * scaleY];
    }, [view, size]);
    const screenToWorld = useCallback((sx, sy) => {
      const { cx, cy, scaleX, scaleY } = view;
      return [cx + (sx - size.w / 2) / scaleX, cy - (sy - size.h / 2) / scaleY];
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
      const tangentLine = getTangentLine(owner, tangent, view, parameters);
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
    }).filter(Boolean), [functions, parameters, tangentPoints, view]);
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
      view.scaleX,
      view.scaleY,
      size.w,
      size.h,
      parameters
    ), [curveEntities, functions, implicitCurveSamples, parameters, sampledPolylineCurves, worldBounds, view.scaleX, view.scaleY, size.h, size.w]);
    const screenPoints = useMemo(() => {
      return specialPoints.map((point) => {
        const [sx, sy] = worldToScreen(point.x, point.y);
        return { ...point, key: getPointKey(point), sx, sy };
      }).filter((point) => point.sx >= -16 && point.sx <= size.w + 16 && point.sy >= -16 && point.sy <= size.h + 16);
    }, [specialPoints, worldToScreen, size.w, size.h]);
    const snappedPoint = useMemo(() => {
      const mouse = mouseRef.current;
      if (!mouse) return null;
      let best = null;
      let bestDist = Infinity;
      for (const point of screenPoints) {
        const dist = Math.hypot(point.sx - mouse.x, point.sy - mouse.y);
        if (dist < bestDist) { best = point; bestDist = dist; }
      }
      return best && bestDist <= 16 ? { ...best, distanceToMouse: bestDist } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screenPoints, hoverVersion]);
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
      const mouse = mouseRef.current;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hoverVersion, curveEntities, implicitCurves, parameters, sampledPolylineCurves, worldToScreen, screenToWorld]);
    const visiblePoint = snappedPoint && snappedPoint.key === revealedPointKey ? snappedPoint : null;
    const showCurveTrace = !visiblePoint && !!curveTracker;
    useEffect(() => {
      window.clearTimeout(revealTimerRef.current);
      if (!snappedPoint) {
        setRevealedPointKey(null);
        return;
      }
      const nextKey = snappedPoint.key;
      setRevealedPointKey(null);
      revealTimerRef.current = window.setTimeout(() => {
        setRevealedPointKey(nextKey);
      }, 150);
      return () => window.clearTimeout(revealTimerRef.current);
    }, [snappedPoint?.key]);
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
    const prepareCanvas = (ref) => {
      const canvas = ref.current;
      if (!canvas) return null;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      canvas.style.width = size.w + "px";
      canvas.style.height = size.h + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };
    const drawPointMarker = (ctx, point, radius) => {
      ctx.save();
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
    };
    const drawBase = useCallback(() => {
      const ctx = prepareCanvas(baseCanvasRef);
      if (!ctx) return;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, size.w, size.h);
      const getGridStep = (scale) => {
        const targetPx = 80;
        const roughStep = targetPx / Math.max(scale, 1e-6);
        const pow = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const normalized = roughStep / pow;
        if (normalized < 1.5) return pow;
        if (normalized < 3.5) return 2 * pow;
        if (normalized < 7.5) return 5 * pow;
        return 10 * pow;
      };
      const stepX = getGridStep(view.scaleX);
      const stepY = getGridStep(view.scaleY);
      const minorStepX = stepX / 5;
      const minorStepY = stepY / 5;
      const { wxMin, wxMax, wyMin, wyMax } = worldBounds;
      const drawGridLines = (stepHorizontal, stepVertical, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        const startX2 = Math.ceil(wxMin / stepHorizontal) * stepHorizontal;
        for (let x = startX2; x <= wxMax; x += stepHorizontal) {
          const [sx] = worldToScreen(x, 0);
          ctx.moveTo(sx + 0.5, 0);
          ctx.lineTo(sx + 0.5, size.h);
        }
        const startY2 = Math.ceil(wyMin / stepVertical) * stepVertical;
        for (let y = startY2; y <= wyMax; y += stepVertical) {
          const [, sy] = worldToScreen(0, y);
          ctx.moveTo(0, sy + 0.5);
          ctx.lineTo(size.w, sy + 0.5);
        }
        ctx.stroke();
      };
      drawGridLines(minorStepX, minorStepY, theme.gridMinor, 1);
      drawGridLines(stepX, stepY, theme.gridMajor, 1);
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
      const fmtTick = (v, step) => {
        if (Math.abs(v) < 1e-10) return "0";
        const abs = Math.abs(v);
        if (abs >= 1e5 || abs < 1e-3) return v.toExponential(1);
        const digits = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
        return v.toFixed(digits);
      };
      const startX = Math.ceil(wxMin / stepX) * stepX;
      for (let x = startX; x <= wxMax; x += stepX) {
        if (Math.abs(x) < stepX * 1e-3) continue;
        const [sx] = worldToScreen(x, 0);
        const yLabel = Math.max(4, Math.min(size.h - 16, ax0Y + 4));
        ctx.fillText(fmtTick(x, stepX), sx, yLabel);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const startY = Math.ceil(wyMin / stepY) * stepY;
      for (let y = startY; y <= wyMax; y += stepY) {
        if (Math.abs(y) < stepY * 1e-3) continue;
        const [, sy] = worldToScreen(0, y);
        const xLabel = Math.max(24, Math.min(size.w - 4, ax0X - 6));
        ctx.fillText(fmtTick(y, stepY), xLabel, sy);
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
      screenPoints.forEach((point) => drawPointMarker(ctx, point, 4));
    }, [
      implicitCurves,
      sampledPolylineCurves,
      screenPoints,
      selectedFunctionId,
      size.h,
      size.w,
      tangentHandles,
      tangentMode,
      theme,
      view,
      worldBounds,
      worldToScreen
    ]);
    const drawOverlay = useCallback(() => {
      const ctx = prepareCanvas(overlayCanvasRef);
      if (!ctx) return;
      ctx.clearRect(0, 0, size.w, size.h);
      if (snappedPoint) drawPointMarker(ctx, snappedPoint, 5.5);
      const labelPhases = labelFade ? [
        { mode: labelFade.from, alpha: 1 - labelFade.progress },
        { mode: labelFade.to, alpha: labelFade.progress }
      ] : [{ mode: coordMode, alpha: 1 }];
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
      labelFade,
      showCurveTrace,
      size.h,
      size.w,
      snappedPoint,
      theme,
      visiblePoint
    ]);
    useEffect(() => { drawBase(); }, [drawBase]);
    useEffect(() => { drawOverlay(); }, [drawOverlay]);
    const { draggingRef, pinchRef, zoomAroundPoint } = usePanAndPinch({ setView, size });
    const { tangentDragRef, tryStart: tryTangentStart, tryMove: tryTangentMove, end: endTangent } = useTangentDrag({
      selectedFunction,
      tangentMode,
      tangentHandles,
      tangentPoints,
      findPointOnFunction,
      onTangentPointsChange
    });
    const onMouseDown = (e) => {
      const rect = overlayCanvasRef.current.getBoundingClientRect();
      const nextMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (tryTangentStart(nextMouse)) {
        setHoverMouse(nextMouse);
        return;
      }
      draggingRef.current = { x: e.clientX, y: e.clientY, view: { ...view } };
      setHoverMouse(nextMouse);
    };
    const onMouseMove = (e) => {
      const rect = overlayCanvasRef.current.getBoundingClientRect();
      const nextMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (tryTangentMove(nextMouse)) {
        setHoverMouse(nextMouse);
        return;
      }
      if (draggingRef.current) {
        const dx = e.clientX - draggingRef.current.x;
        const dy = e.clientY - draggingRef.current.y;
        setView({
          ...draggingRef.current.view,
          cx: draggingRef.current.view.cx - dx / draggingRef.current.view.scaleX,
          cy: draggingRef.current.view.cy + dy / draggingRef.current.view.scaleY
        });
        setHoverMouse(null);
        return;
      }
      setHoverMouse(nextMouse);
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      endTangent();
    };
    const onMouseLeave = () => {
      draggingRef.current = null;
      endTangent();
      setHoverMouse(null);
    };
    const onWheel = (e) => {
      e.preventDefault();
      const rect = overlayCanvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 15e-4);
      const xOnly = e.shiftKey && !e.altKey;
      const yOnly = e.altKey && !e.shiftKey;
      zoomAroundPoint(view, mx, my, xOnly ? factor : yOnly ? 1 : factor, yOnly ? factor : xOnly ? 1 : factor);
    };
    const onTouchStart = (e) => {
      const rect = overlayCanvasRef.current.getBoundingClientRect();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        draggingRef.current = { x: t.clientX, y: t.clientY, view: { ...view } };
        pinchRef.current = null;
        setHoverMouse({ x: t.clientX - rect.left, y: t.clientY - rect.top });
      } else if (e.touches.length === 2) {
        draggingRef.current = null;
        const [t1, t2] = e.touches;
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchRef.current = {
          dist,
          scaleX: view.scaleX,
          scaleY: view.scaleY,
          cx: view.cx,
          cy: view.cy,
          midX: (t1.clientX + t2.clientX) / 2 - rect.left,
          midY: (t1.clientY + t2.clientY) / 2 - rect.top
        };
        setHoverMouse(null);
      }
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      const rect = overlayCanvasRef.current.getBoundingClientRect();
      if (e.touches.length === 1 && draggingRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - draggingRef.current.x;
        const dy = t.clientY - draggingRef.current.y;
        setView({
          ...draggingRef.current.view,
          cx: draggingRef.current.view.cx - dx / draggingRef.current.view.scaleX,
          cy: draggingRef.current.view.cy + dy / draggingRef.current.view.scaleY
        });
        setHoverMouse({ x: t.clientX - rect.left, y: t.clientY - rect.top });
      } else if (e.touches.length === 2 && pinchRef.current) {
        const [t1, t2] = e.touches;
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const factor = dist / pinchRef.current.dist;
        zoomAroundPoint(
          pinchRef.current,
          pinchRef.current.midX,
          pinchRef.current.midY,
          factor,
          factor
        );
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        draggingRef.current = null;
        pinchRef.current = null;
        setHoverMouse(null);
      }
    };
    return /* @__PURE__ */ React.createElement(
      "div",
      { ref: wrapRef, style: { position: "absolute", inset: 0, overflow: "hidden" } },
      /* @__PURE__ */ React.createElement("canvas", {
        ref: baseCanvasRef,
        style: { display: "block", position: "absolute", inset: 0, pointerEvents: "none" },
        "aria-hidden": "true"
      }),
      /* @__PURE__ */ React.createElement("canvas", {
        ref: overlayCanvasRef,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onWheel,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel: onTouchEnd,
        style: {
          display: "block",
          position: "absolute",
          inset: 0,
          cursor: draggingRef.current || tangentDragRef.current ? "grabbing" : "crosshair"
        },
        "aria-label": "\u51FD\u6570\u7ED8\u56FE\u753B\u5E03"
      })
    );
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
          title: fn.visible ? "\u9690\u85CF" : "\u663E\u793A",
          "aria-label": fn.visible ? `\u9690\u85CF ${label}` : `\u663E\u793A ${label}`,
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
          placeholder: "\u4F8B\u5982\uFF1Ay = sin(x); x in [-pi, pi]",
          "aria-label": `${label} \u7684\u8868\u8FBE\u5F0F`,
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
        fn.expr ? hasError ? fn.expr : /* @__PURE__ */ React.createElement("span", { className: "expr-preview" }, renderExpressionPreview(fn.expr)) : /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted } }, "\u70B9\u51FB\u8F93\u5165\u8868\u8FBE\u5F0F\u2026")
      ), hasError && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#c94a3a", marginTop: 3, fontFamily: '"JetBrains Mono", monospace' } }, fn.error), selected && /* @__PURE__ */ React.createElement("div", { style: {
        marginTop: 6,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        color: fn.color,
        letterSpacing: "0.08em",
        textTransform: "uppercase"
      } }, "\u5DF2\u9009\u4E2D")),
      !isOnly && /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            onDelete();
          },
          title: "\u5220\u9664",
          "aria-label": `\u5220\u9664 ${label}`,
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
  function SidebarButton({ children, onClick, theme, ...buttonProps }) {
    const [hover, setHover] = useState(false);
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick,
        ...buttonProps,
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
  function ExamplesPage({ theme, onBack, onApplyExample }) {
    return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "14px 16px 10px 16px",
      borderBottom: `1px solid ${theme.rule}`,
      display: "flex",
      alignItems: "center",
      gap: 10
    } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: onBack,
        title: "\u8FD4\u56DE\u51FD\u6570\u5217\u8868",
        style: {
          width: 28,
          height: 28,
          border: `1px solid ${theme.rule}`,
          background: "transparent",
          borderRadius: 999,
          cursor: "pointer",
          color: theme.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }
      },
      /* @__PURE__ */ React.createElement(ChevronLeft, null)
    ), /* @__PURE__ */ React.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      letterSpacing: "0.1em"
    } }, "\u793A\u4F8B"), /* @__PURE__ */ React.createElement("div", { style: {
      marginTop: 4,
      fontFamily: "Inter, sans-serif",
      fontSize: 13,
      fontWeight: 600,
      color: theme.ink
    } }, "\u793A\u4F8B\u4E0E\u8BED\u6CD5"))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: "14px 16px 18px 16px" } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "12px 14px",
      borderRadius: 18,
      background: theme.chip,
      border: `1px solid ${theme.rule}`,
      color: theme.muted,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      lineHeight: 1.7,
      marginBottom: 14
    } }, "\u70B9\u51FB\u6761\u76EE\u4F1A\u4F18\u5148\u586B\u5165\u5F53\u524D\u9009\u4E2D\u7684\u7A7A\u51FD\u6570\uFF1B\u5F53\u524D\u51FD\u6570\u5DF2\u5199\u5185\u5BB9\u65F6\uFF0C\u4F1A\u65B0\u589E\u4E00\u6761\u51FD\u6570\u3002"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 12 } }, EXAMPLE_SECTIONS.map((section) => /* @__PURE__ */ React.createElement(
      "section",
      {
        key: section.title,
        className: "examples-card",
        style: {
          borderRadius: 20,
          padding: "14px 14px 12px 14px",
          background: theme.panel,
          border: `1px solid ${theme.rule}`,
          boxShadow: `0 14px 30px ${theme.shadow}`
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: {
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: theme.ink
      } }, section.title),
      /* @__PURE__ */ React.createElement("div", { style: {
        marginTop: 4,
        color: theme.muted,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        lineHeight: 1.6
      } }, section.description),
      /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: 8, marginTop: 12 } }, section.items.map((item) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: `${section.title}:${item.label}`,
          className: "example-item",
          onClick: () => onApplyExample(item.expr),
          title: `\u63D2\u5165 ${item.label}`,
          style: {
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 16,
            border: `1px solid ${theme.rule}`,
            background: theme.bg,
            cursor: "pointer",
            color: theme.ink
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: theme.ink
        } }, item.label),
        /* @__PURE__ */ React.createElement("div", { style: {
          marginTop: 5,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          lineHeight: 1.6,
          color: theme.muted,
          wordBreak: "break-word"
        } }, item.expr)
      )))
    )))));
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
    onParameterChange,
    onApplyExample
  }) {
    const [themeMenuOpen, setThemeMenuOpen] = useState(false);
    const [panelPage, setPanelPage] = useState("functions");
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
    const scaleView = (factorX, factorY) => {
      setView((current) => sanitizeView({
        ...current,
        scaleX: current.scaleX * factorX,
        scaleY: current.scaleY * factorY
      }));
    };
    const resetView = () => setView(DEFAULT_VIEW);
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
      letterSpacing: "0.08em"
    } }, "\u51FD\u6570\u7ED8\u56FE\u53F0")), /* @__PURE__ */ React.createElement("div", { ref: themeMenuRef, style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setThemeMenuOpen((v) => !v),
        title: "\u4E3B\u9898",
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
      marginBottom: 8
    } }, "\u4E3B\u9898"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 } }, Object.entries(window.LOCUS_THEMES).map(([key, t]) => {
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
        title: "\u6536\u8D77\u4FA7\u680F",
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
    )), panelPage === "functions" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px 8px 16px"
    } }, /* @__PURE__ */ React.createElement("div", { style: {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      letterSpacing: "0.1em"
    } }, "\u51FD\u6570 \xB7 ", functions.length), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: addFn,
        title: "\u65B0\u589E\u51FD\u6570",
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
      " \u65B0\u589E"
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
    )), functions.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "20px 16px", color: theme.muted, fontSize: 12 } }, "\u8FD8\u6CA1\u6709\u51FD\u6570\uFF0C\u5148\u65B0\u589E\u4E00\u6761\u5F00\u59CB\u3002"), parameterNames.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { borderTop: `1px solid ${theme.rule}`, marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "12px 16px 8px 16px",
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      color: theme.muted,
      letterSpacing: "0.08em"
    } }, "\u53C2\u6570"), parameterNames.map((name) => /* @__PURE__ */ React.createElement(
      ParameterControl,
      {
        key: name,
        name,
        config: sanitizeParameterConfig(parameterConfig[name], defaultParameterConfig(name)),
        theme,
        onChange: onParameterChange
      }
    ))), /* @__PURE__ */ React.createElement("div", { style: {
      padding: "14px 16px 18px 16px",
      borderTop: `1px dashed ${theme.rule}`,
      marginTop: 8
    } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "examples-entry",
        onClick: () => setPanelPage("examples"),
        title: "\u6253\u5F00\u793A\u4F8B\u9875",
        style: {
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          borderRadius: 22,
          border: `1px solid ${theme.rule}`,
          background: theme.chip,
          cursor: "pointer",
          boxShadow: `0 16px 32px ${theme.shadow}`
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12
      } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        color: theme.muted,
        letterSpacing: "0.08em"
      } }, "\u793A\u4F8B"), /* @__PURE__ */ React.createElement("div", { style: {
        marginTop: 5,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: theme.ink
      } }, "\u793A\u4F8B\u4E0E\u8BED\u6CD5\u6536\u7EB3\u9875")), /* @__PURE__ */ React.createElement("div", { className: "examples-entry-arrow", style: {
        width: 28,
        height: 28,
        borderRadius: 999,
        border: `1px solid ${theme.rule}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.ink,
        flexShrink: 0,
        background: theme.panel
      } }, /* @__PURE__ */ React.createElement(ChevronRight, null))),
      /* @__PURE__ */ React.createElement("div", { style: {
        marginTop: 9,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10,
        lineHeight: 1.7,
        color: theme.muted
      } }, "\u5E38\u7528\u66F2\u7EBF\u3001\u9690\u51FD\u6570\u3001\u53C2\u6570\u5F0F\u548C\u8BED\u6CD5\u901F\u67E5\u5DF2\u7ECF\u79FB\u5230\u5355\u72EC\u9875\u9762\u3002")
    )))) : /* @__PURE__ */ React.createElement(
      ExamplesPage,
      {
        theme,
        onBack: () => setPanelPage("functions"),
        onApplyExample
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { borderTop: `1px solid ${theme.rule}` } }, /* @__PURE__ */ React.createElement("div", { style: {
      padding: "10px 16px",
      borderBottom: `1px solid ${theme.rule}`,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 11,
      minHeight: 38,
      display: "flex",
      alignItems: "center"
    } }, traceInfo ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 8, background: traceInfo.fn.color } }), traceInfo.fn.label && /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink, fontWeight: 600 } }, traceInfo.kind === "intersection" ? `${traceInfo.fn.label} \u2229 ${traceInfo.label2 || ""}` : traceInfo.kind && traceInfo.kind !== "curve" ? `${traceInfo.fn.label} \xB7 ${traceInfo.kind}` : traceInfo.fn.label), /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted } }, "x"), /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink } }, formatCoordinateValue(traceInfo.x, coordMode)), /* @__PURE__ */ React.createElement("span", { style: { color: theme.muted, marginLeft: 6 } }, "y"), /* @__PURE__ */ React.createElement("span", { style: { color: theme.ink } }, formatCoordinateValue(traceInfo.y, coordMode))) : /* @__PURE__ */ React.createElement("div", { style: { color: theme.muted, fontSize: 10, letterSpacing: "0.08em" } }, "\u60AC\u505C\u66F2\u7EBF\u67E5\u770B\u5750\u6807")), /* @__PURE__ */ React.createElement("div", { style: {
      padding: "8px 16px 0 16px",
      color: theme.muted,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10,
      letterSpacing: "0.08em"
    } }, "X \u7F29\u653E ", formatDecimalNumber(view.scaleX), " \xB7 Y \u7F29\u653E ", formatDecimalNumber(view.scaleY)), /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 16px 12px 16px", display: "flex", gap: 6, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => scaleView(1.4, 1.4) }, "\u653E\u5927"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => scaleView(1 / 1.4, 1 / 1.4) }, "\u7F29\u5C0F"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => scaleView(1.4, 1), title: "\u4EC5\u62C9\u4F38 X \u8F74" }, "X \u62C9\u4F38"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => scaleView(1 / 1.4, 1), title: "\u4EC5\u538B\u7F29 X \u8F74" }, "X \u538B\u7F29"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => scaleView(1, 1.4), title: "\u4EC5\u62C9\u4F38 Y \u8F74" }, "Y \u62C9\u4F38"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: () => scaleView(1, 1 / 1.4), title: "\u4EC5\u538B\u7F29 Y \u8F74" }, "Y \u538B\u7F29"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: onFitView }, "\u9002\u914D\u6570\u636E"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: resetView }, "\u91CD\u7F6E"), /* @__PURE__ */ React.createElement(SidebarButton, { theme, onClick: onExport }, "\u5BFC\u51FA PNG"))));
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
        title: "\u5C55\u5F00\u4FA7\u680F",
        "aria-label": "\u5C55\u5F00\u4FA7\u680F",
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
        title: `${fn.label || "f"} = ${fn.expr || "\u2014"} \xB7 \u70B9\u51FB${fn.visible ? "\u9690\u85CF" : "\u663E\u793A"}`,
        "aria-label": `${fn.visible ? "\u9690\u85CF" : "\u663E\u793A"} ${fn.label || "\u51FD\u6570"}`,
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
          title: "\u62D6\u52A8\u8C03\u6574\u5BBD\u5EA6",
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
