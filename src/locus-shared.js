(function () {
  const RAIL_WIDTH = 48;
  const MIN_VIEW_SCALE = 0.5;
  const MAX_VIEW_SCALE = 8000;
  const DEFAULT_VIEW = { cx: 0, cy: 0, scaleX: 50, scaleY: 50 };
  const COORD_MODES = {
    exact: 'exact',
    decimal: 'decimal',
  };
  // 统一数值容差。locus-math.js 内另有一组同名私有常量，两处要同步修改。
  const TOLERANCE = {
    EQUATION: 1e-12,          // interpolateIsoPoint 等价判定
    SEGMENT: 1e-9,            // 线段相交/最近点 epsilon
    ROOT_ZERO: 1e-8,          // 零点扫描判定
    NEWTON_CONVERGE: 1e-8,    // refineImplicitIntersection 位移收敛
    IMPLICIT_RESIDUAL: 1e-5,  // 隐函数残差可接受上限
    REL_RADICAL: 2e-4,        // formatExactNumber 相对容差
  };

  function clampViewScale(value, fallback = DEFAULT_VIEW.scaleX) {
    if (!Number.isFinite(+value)) return fallback;
    return Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, +value));
  }

  function sanitizeView(view) {
    const next = view && typeof view === 'object' ? view : {};
    const legacyScale = Number.isFinite(+next.scale) ? +next.scale : DEFAULT_VIEW.scaleX;
    return {
      cx: Number.isFinite(+next.cx) ? +next.cx : DEFAULT_VIEW.cx,
      cy: Number.isFinite(+next.cy) ? +next.cy : DEFAULT_VIEW.cy,
      scaleX: clampViewScale(next.scaleX, legacyScale),
      scaleY: clampViewScale(next.scaleY, legacyScale),
    };
  }

  function defaultParameterConfig(name) {
    const centered = new Set(['h', 'k', 'm', 'n']);
    const value = centered.has(name) ? 0 : 1;
    return { value, min: -10, max: 10, step: 0.1 };
  }

  function sanitizeParameterConfig(config, fallback = defaultParameterConfig('a')) {
    const next = { ...fallback, ...(config || {}) };
    const value = Number.isFinite(+next.value) ? +next.value : fallback.value;
    let min = Number.isFinite(+next.min) ? +next.min : fallback.min;
    let max = Number.isFinite(+next.max) ? +next.max : fallback.max;
    const step = Number.isFinite(+next.step) && +next.step > 0 ? +next.step : fallback.step;
    if (min > max) [min, max] = [max, min];
    if (value < min) min = value;
    if (value > max) max = value;
    return { value, min, max, step };
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  }

  function trimDecimal(text) {
    return text.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
  }

  function formatDecimalNumber(value) {
    if (Math.abs(value) < 1e-10) return '0';
    const abs = Math.abs(value);
    if (abs >= 1e5 || abs < 1e-4) return value.toExponential(3).replace('+', '');
    return trimDecimal(value.toFixed(abs < 1 ? 4 : 3));
  }

  function bestFraction(value, maxDen = 64) {
    let best = { num: Math.round(value), den: 1, err: Math.abs(value - Math.round(value)) };
    for (let den = 1; den <= maxDen; den++) {
      const num = Math.round(value * den);
      const err = Math.abs(value - num / den);
      if (err < best.err) best = { num, den, err };
    }
    const factor = gcd(best.num, best.den);
    return { num: best.num / factor, den: best.den / factor, err: best.err };
  }

  function formatFraction(num, den, suffix = '') {
    if (num === 0) return '0';
    const sign = num < 0 ? '-' : '';
    const absNum = Math.abs(num);
    if (suffix) {
      if (den === 1 && absNum === 1) return `${sign}${suffix}`;
      if (den === 1) return `${sign}${absNum}${suffix}`;
      if (absNum === 1) return `${sign}${suffix}/${den}`;
      return `${sign}${absNum}${suffix}/${den}`;
    }
    return den === 1 ? `${num}` : `${num}/${den}`;
  }

  function isSquareFree(n) {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % (factor * factor) === 0) return false;
    }
    return true;
  }

  function bestRadicalFraction(value, maxCoeff = 12, maxDen = 24, maxRad = 24) {
    let best = null;
    const abs = Math.abs(value);
    for (let rad = 2; rad <= maxRad; rad++) {
      if (!isSquareFree(rad)) continue;
      const root = Math.sqrt(rad);
      for (let den = 1; den <= maxDen; den++) {
        for (let coeff = 1; coeff <= maxCoeff; coeff++) {
          const candidate = coeff * root / den;
          const err = Math.abs(abs - candidate);
          if (!best || err < best.err) best = { coeff, den, rad, err };
        }
      }
    }
    return best;
  }

  function formatRadicalFraction(value, coeff, den, rad) {
    const sign = value < 0 ? '-' : '';
    const factor = gcd(coeff, den);
    const reducedCoeff = coeff / factor;
    const reducedDen = den / factor;
    const radical = reducedCoeff === 1 ? `√${rad}` : `${reducedCoeff}√${rad}`;
    return reducedDen === 1 ? `${sign}${radical}` : `${sign}${radical}/${reducedDen}`;
  }

  function formatExactNumber(value) {
    if (Math.abs(value) < 1e-10) return '0';
    const constants = [
      { base: Math.PI, symbol: 'π' },
      { base: Math.E, symbol: 'e' },
    ];
    for (const { base, symbol } of constants) {
      const ratio = value / base;
      const frac = bestFraction(ratio, 24);
      const tolerance = Math.max(1e-6, Math.abs(value) * TOLERANCE.REL_RADICAL);
      if (frac.err * Math.abs(base) < tolerance) return formatFraction(frac.num, frac.den, symbol);
    }
    const radical = bestRadicalFraction(value);
    const radicalTolerance = Math.max(1e-6, Math.abs(value) * TOLERANCE.REL_RADICAL);
    if (radical && radical.err < radicalTolerance) {
      return formatRadicalFraction(value, radical.coeff, radical.den, radical.rad);
    }
    const frac = bestFraction(value, 96);
    return formatFraction(frac.num, frac.den);
  }

  function formatCoordinateValue(value, mode) {
    return mode === COORD_MODES.exact ? formatExactNumber(value) : formatDecimalNumber(value);
  }

  function formatPointLabel(x, y, mode) {
    return `(${formatCoordinateValue(x, mode)}, ${formatCoordinateValue(y, mode)})`;
  }

  function getPointKey(point) {
    const ids = [point.fnId, point.fn2Id].filter(Boolean).sort().join('|');
    return `${point.type}:${point.x.toFixed(6)}:${point.y.toFixed(6)}:${ids}`;
  }

  const FUNC_SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

  function inferCurveKindFromExpr(expr) {
    const compact = (expr || '').replace(/\s+/g, '');
    if (!compact) return 'explicit';
    if (/x(?:\(t(?:heta)?\))?=.+;y(?:\(t(?:heta)?\))?=.+/iu.test(compact) || /y(?:\(t(?:heta)?\))?=.+;x(?:\(t(?:heta)?\))?=.+/iu.test(compact)) {
      return 'parametric';
    }
    if (/r(?:\(theta\))?=.+/iu.test(compact)) return 'polar';
    if (compact.includes('y')) {
      if (/^y=.+$/u.test(compact) || /^.+=y$/u.test(compact)) return 'explicit';
      return 'implicit';
    }
    return compact.includes('=') ? 'implicit' : 'explicit';
  }

  function formatIndexedLabel(prefix, seq) {
    const n = Number.isFinite(seq) ? seq + 1 : 1;
    return prefix + String(n).split('').map(d => FUNC_SUBSCRIPTS[+d] || d).join('');
  }

  function formatFnLabel(seq) {
    return formatIndexedLabel('f', seq);
  }

  function formatTangentLabel(seq, ownerLabel) {
    return `${formatIndexedLabel('t', seq)}(${ownerLabel || 'f'})`;
  }

  function nextFreeSeq(fns) {
    const used = new Set(fns.map(f => f.labelSeq).filter(n => Number.isFinite(n)));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  function nextFreeColor(fns, palette) {
    const used = new Set(fns.map(f => f.color));
    for (const c of palette) if (!used.has(c)) return c;
    return palette[fns.length % palette.length];
  }

  function humanizeError(msg) {
    if (!msg) return '表达式无效';
    if (msg.startsWith('Unknown: ')) return '未知名称：“' + msg.slice(9) + '”';
    if (msg.startsWith('Not a function: ')) return '“' + msg.slice(16) + '”不是可调用函数';
    if (msg.startsWith('Unexpected character: ')) return '存在无法识别的字符：“' + msg.slice(22) + '”';
    if (msg.includes('Unexpected token')) return '请检查运算符附近的语法';
    if (msg.includes('Trailing tokens')) return '末尾存在多余内容';
    if (msg.includes('piecewise')) return 'piecewise 需要成对的条件和值';
    if (msg.includes('if expects')) return 'if 的格式应为 if(condition, whenTrue, whenFalse)';
    if (msg.startsWith('Bad op: ')) return '存在不支持的运算符';
    return msg;
  }

  function evaluateSafe(fn, x) {
    try {
      const y = fn(x);
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    }
  }

  function evaluateExplicitSafe(compiled, x, params = {}) {
    if (!compiled || compiled.kind !== 'explicit') return NaN;
    try {
      const y = compiled.evaluate(x, params);
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    }
  }

  function evaluateImplicitSafe(compiled, x, y, params = {}) {
    if (!compiled || compiled.kind !== 'implicit') return NaN;
    try {
      const value = compiled.evaluate(x, y, params);
      return Number.isFinite(value) ? value : NaN;
    } catch {
      return NaN;
    }
  }

  function evaluateCurvePointSafe(compiled, parameterValue, params = {}) {
    if (!compiled || !['parametric', 'polar'].includes(compiled.kind)) return null;
    try {
      const point = compiled.evaluate(parameterValue, params);
      if (!point) return null;
      return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
    } catch {
      return null;
    }
  }

  function getResolvedRanges(compiled, params = {}) {
    if (!compiled?.getRanges) return {};
    try {
      return compiled.getRanges(params) || {};
    } catch {
      return {};
    }
  }

  function getCurveAxisRange(compiled, axis, fallbackMin, fallbackMax, params = {}) {
    const range = getResolvedRanges(compiled, params)[axis];
    if (!range) return { min: fallbackMin, max: fallbackMax };
    return {
      min: Math.max(fallbackMin, range.min),
      max: Math.min(fallbackMax, range.max),
    };
  }

  function getCurveParameterRange(compiled, params = {}) {
    const ranges = getResolvedRanges(compiled, params);
    const axis = compiled?.parameterVar || 't';
    const fallback = compiled?.kind === 'polar' || axis === 'theta'
      ? { min: 0, max: Math.PI * 2 }
      : { min: -10, max: 10 };
    return ranges[axis] || fallback;
  }

  function bisectRoot(fn, left, right, maxIter = 32) {
    let a = left;
    let b = right;
    let fa = evaluateSafe(fn, a);
    let fb = evaluateSafe(fn, b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
    if (Math.abs(fa) < 1e-10) return a;
    if (Math.abs(fb) < 1e-10) return b;
    if (fa * fb > 0) return null;
    for (let i = 0; i < maxIter; i++) {
      const mid = (a + b) / 2;
      const fm = evaluateSafe(fn, mid);
      if (!Number.isFinite(fm)) return null;
      if (Math.abs(fm) < 1e-10) return mid;
      if (fa * fm <= 0) {
        b = mid;
        fb = fm;
      } else {
        a = mid;
        fa = fm;
      }
    }
    return (a + b) / 2;
  }

  function dedupePoints(points, xTol, yTol) {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const deduped = [];
    sorted.forEach((point) => {
      const last = deduped[deduped.length - 1];
      if (last && Math.abs(last.x - point.x) <= xTol && Math.abs(last.y - point.y) <= yTol && last.type === point.type) return;
      deduped.push(point);
    });
    return deduped;
  }

  function isTangentCurve(curve) {
    return curve?.source === 'tangent' && curve.line && curve.tangentPoint;
  }

  function tangentLineY(line, x) {
    if (!line || line.type === 'vertical') return NaN;
    return line.y + line.slope * (x - line.x);
  }

  function getImplicitSampleGrid(width, height) {
    return {
      cols: Math.max(48, Math.min(220, Math.ceil(width / 8))),
      rows: Math.max(36, Math.min(180, Math.ceil(height / 8))),
    };
  }

  function samplePolylineWorldPoints(fn, bounds, sampleCount, params = {}) {
    if (!fn?.compiled) return [];
    if (isTangentCurve(fn)) return sampleTangentLineWorldPoints(fn.line, bounds);
    const compiled = fn.compiled;
    const points = [];
    if (compiled.kind === 'explicit') {
      const range = getCurveAxisRange(compiled, 'x', bounds.wxMin, bounds.wxMax, params);
      if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return points;
      for (let i = 0; i <= sampleCount; i++) {
        const x = range.min + (range.max - range.min) * (i / sampleCount);
        const y = evaluateExplicitSafe(compiled, x, params);
        points.push(Number.isFinite(y) ? { x, y, parameterValue: x } : null);
      }
      return points;
    }
    if (compiled.kind === 'parametric' || compiled.kind === 'polar') {
      const range = getCurveParameterRange(compiled, params);
      if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return points;
      for (let i = 0; i <= sampleCount; i++) {
        const parameterValue = range.min + (range.max - range.min) * (i / sampleCount);
        const point = evaluateCurvePointSafe(compiled, parameterValue, params);
        points.push(point ? { ...point, parameterValue } : null);
      }
      return points;
    }
    return points;
  }

  function sampleTangentLineWorldPoints(line, bounds) {
    const { wxMin, wxMax, wyMin, wyMax } = bounds;
    if (!line || !Number.isFinite(wxMin + wxMax + wyMin + wyMax) || wxMax <= wxMin || wyMax <= wyMin) return [];
    if (line.type === 'vertical') {
      if (!Number.isFinite(line.x) || line.x < wxMin || line.x > wxMax) return [];
      return [
        { x: line.x, y: wyMin, parameterValue: wyMin },
        { x: line.x, y: wyMax, parameterValue: wyMax },
      ];
    }
    if (!Number.isFinite(line.x) || !Number.isFinite(line.y) || !Number.isFinite(line.slope)) return [];
    return [
      { x: wxMin, y: tangentLineY(line, wxMin), parameterValue: wxMin },
      { x: wxMax, y: tangentLineY(line, wxMax), parameterValue: wxMax },
    ].filter(point => Number.isFinite(point.y));
  }

  function buildVisiblePolylineCurves(functions, bounds, sampleCount, worldToScreen, size, params = {}) {
    return functions
      .filter(fn => fn.visible && fn.compiled && (isTangentCurve(fn) || ['explicit', 'parametric', 'polar'].includes(fn.compiled.kind)))
      .map((fn) => {
        const samples = samplePolylineWorldPoints(fn, bounds, sampleCount, params);
        const segments = [];
        let previous = null;
        let anchor = null;
        samples.forEach((sample) => {
          if (!sample) {
            previous = null;
            return;
          }
          const [sx, sy] = worldToScreen(sample.x, sample.y);
          const next = { ...sample, sx, sy };
          if (
            sx >= -24 && sx <= size.w + 24 && sy >= -24 && sy <= size.h + 24 &&
            (!anchor || sx > anchor.sx)
          ) anchor = { sx, sy };
          if (previous) {
            const dist = Math.hypot(sx - previous.sx, sy - previous.sy);
            if (isTangentCurve(fn) || (Math.abs(sy - previous.sy) <= size.h * 1.5 && dist <= Math.max(size.w, size.h) * 1.5)) {
              segments.push({
                ax: previous.x, ay: previous.y, bx: sample.x, by: sample.y,
                asx: previous.sx, asy: previous.sy, bsx: sx, bsy: sy,
                aParam: previous.parameterValue, bParam: sample.parameterValue,
              });
            }
          }
          previous = next;
        });
        return { ...fn, segments, anchor };
      })
      .filter(fn => fn.segments.length);
  }

  function scanRoots(fn, xMin, xMax, sampleCount, yTol) {
    const roots = [];
    const pushRoot = (x) => {
      if (!Number.isFinite(x)) return;
      const y = evaluateSafe(fn, x);
      if (!Number.isFinite(y) || Math.abs(y) > yTol * 3) return;
      roots.push(x);
    };
    const step = (xMax - xMin) / sampleCount;
    let prevX = xMin;
    let prevY = evaluateSafe(fn, prevX);
    if (Number.isFinite(prevY) && Math.abs(prevY) <= TOLERANCE.ROOT_ZERO) pushRoot(prevX);
    for (let i = 1; i <= sampleCount; i++) {
      const x = xMin + step * i;
      const y = evaluateSafe(fn, x);
      if (!Number.isFinite(prevY) || !Number.isFinite(y)) {
        prevX = x;
        prevY = y;
        continue;
      }
      if (Math.abs(y) <= TOLERANCE.ROOT_ZERO) pushRoot(x);
      if (prevY * y < 0) {
        const root = bisectRoot(fn, prevX, x);
        if (root != null) pushRoot(root);
      }
      prevX = x;
      prevY = y;
    }
    return dedupePoints(roots.map(x => ({ x, y: 0, type: 'zero' })), step * 1.5, yTol * 2).map(p => p.x);
  }

  function scanExtrema(fn, xMin, xMax, sampleCount) {
    const span = xMax - xMin;
    if (!Number.isFinite(span) || span <= 0) return [];
    const h = span / (sampleCount * 80);
    const derivAt = (x) => {
      const yp = evaluateSafe(fn, x + h);
      const ym = evaluateSafe(fn, x - h);
      if (!Number.isFinite(yp) || !Number.isFinite(ym)) return NaN;
      return (yp - ym) / (2 * h);
    };
    const extrema = [];
    const step = span / sampleCount;
    let prevX = xMin;
    let prevD = derivAt(prevX);
    for (let i = 1; i <= sampleCount; i++) {
      const x = xMin + step * i;
      const d = derivAt(x);
      if (Number.isFinite(prevD) && Number.isFinite(d) && prevD * d < 0 && Math.abs(prevD - d) < 1e8) {
        let a = prevX;
        let b = x;
        let da = prevD;
        for (let k = 0; k < 28; k++) {
          const mid = (a + b) / 2;
          const dm = derivAt(mid);
          if (!Number.isFinite(dm)) break;
          if (Math.abs(dm) < 1e-10) {
            a = b = mid;
            break;
          }
          if (da * dm <= 0) {
            b = mid;
          } else {
            a = mid;
            da = dm;
          }
        }
        const root = (a + b) / 2;
        const y = evaluateSafe(fn, root);
        if (Number.isFinite(y)) {
          extrema.push({ x: root, y, type: prevD > 0 ? 'max' : 'min' });
        }
      }
      prevX = x;
      prevD = d;
    }
    return extrema;
  }

  function intersectSegmentCollections(left, right, xTol, yTol) {
    const points = [];
    const decorate = (segments) => segments.map((segment) => ({
      ...segment,
      minX: Math.min(segment.ax, segment.bx),
      maxX: Math.max(segment.ax, segment.bx),
      minY: Math.min(segment.ay, segment.by),
      maxY: Math.max(segment.ay, segment.by),
    }));
    let leftSegments = decorate(left.segments);
    let rightSegments = decorate(right.segments).sort((a, b) => a.minX - b.minX);
    if (leftSegments.length > rightSegments.length) {
      [leftSegments, rightSegments] = [rightSegments, leftSegments];
      [left, right] = [right, left];
    }
    rightSegments.sort((a, b) => a.minX - b.minX);
    leftSegments.forEach((segmentA) => {
      for (const segmentB of rightSegments) {
        if (segmentB.minX > segmentA.maxX + xTol) break;
        if (
          segmentA.maxX < segmentB.minX - xTol ||
          segmentB.maxX < segmentA.minX - xTol ||
          segmentA.maxY < segmentB.minY - yTol ||
          segmentB.maxY < segmentA.minY - yTol
        ) continue;
        const hit = segmentIntersection(segmentA, segmentB, Math.max(xTol, yTol) * 0.25);
        if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) continue;
        points.push({
          type: 'intersection',
          x: hit.x,
          y: hit.y,
          color: left.color,
          color2: right.color,
          fnId: left.id,
          fn2Id: right.id,
          label: left.label,
          label2: right.label,
        });
      }
    });
    return dedupePoints(points, xTol * 2, yTol * 2);
  }

  function intersectExplicitAndImplicit(explicitCurve, implicitCurve, xMin, xMax, sampleCount, yTol, params = {}) {
    const explicitRange = getCurveAxisRange(explicitCurve.compiled, 'x', xMin, xMax, params);
    const implicitRange = getCurveAxisRange(implicitCurve.compiled, 'x', xMin, xMax, params);
    const overlapMin = Math.max(explicitRange.min, implicitRange.min);
    const overlapMax = Math.min(explicitRange.max, implicitRange.max);
    if (!(overlapMax > overlapMin)) return [];

    const implicitYRange = getResolvedRanges(implicitCurve.compiled, params).y;
    const diff = (x) => {
      const y = evaluateExplicitSafe(explicitCurve.compiled, x, params);
      if (!Number.isFinite(y)) return NaN;
      if (implicitYRange && (y < implicitYRange.min || y > implicitYRange.max)) return NaN;
      return evaluateImplicitSafe(implicitCurve.compiled, x, y, params);
    };

    return scanRoots(diff, overlapMin, overlapMax, sampleCount, yTol).map((x) => {
      const y = evaluateExplicitSafe(explicitCurve.compiled, x, params);
      return Number.isFinite(y) ? {
        type: 'intersection',
        x,
        y,
        color: explicitCurve.color,
        color2: implicitCurve.color,
        fnId: explicitCurve.id,
        fn2Id: implicitCurve.id,
        label: explicitCurve.label,
        label2: implicitCurve.label,
      } : null;
    }).filter(Boolean);
  }

  function curveResidualAtPoint(curve, x, y, params = {}) {
    if (isTangentCurve(curve)) {
      const residual = tangentLineResidual(curve.line, x, y);
      return Number.isFinite(residual) ? Math.abs(residual) : NaN;
    }
    const compiled = curve?.compiled;
    if (!compiled) return NaN;
    if (compiled.kind === 'explicit') {
      const expectedY = evaluateExplicitSafe(compiled, x, params);
      return Number.isFinite(expectedY) ? Math.abs(expectedY - y) : NaN;
    }
    if (compiled.kind === 'implicit') {
      const value = evaluateImplicitSafe(compiled, x, y, params);
      return Number.isFinite(value) ? Math.abs(value) : NaN;
    }
    return NaN;
  }

  function tangentLineResidual(line, x, y) {
    if (!line || !Number.isFinite(x) || !Number.isFinite(y)) return NaN;
    if (line.type === 'vertical') return Number.isFinite(line.x) ? x - line.x : NaN;
    const expectedY = tangentLineY(line, x);
    return Number.isFinite(expectedY) ? y - expectedY : NaN;
  }

  function decorateIntersection(left, right, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      type: 'intersection',
      x,
      y,
      color: left.color,
      color2: right.color,
      fnId: left.id,
      fn2Id: right.id,
      label: left.label,
      label2: right.label,
    };
  }

  function tangentOwnerContact(tangentCurve, ownerCurve) {
    const point = tangentCurve?.tangentPoint;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    const hit = decorateIntersection(tangentCurve, ownerCurve, point.x, point.y);
    return hit ? [hit] : [];
  }

  function intersectTangentLines(left, right) {
    const a = left.line;
    const b = right.line;
    if (!a || !b) return [];
    let x;
    let y;
    if (a.type === 'vertical' && b.type === 'vertical') return [];
    if (a.type === 'vertical') {
      x = a.x;
      y = tangentLineY(b, x);
    } else if (b.type === 'vertical') {
      x = b.x;
      y = tangentLineY(a, x);
    } else {
      const denom = a.slope - b.slope;
      if (!Number.isFinite(denom) || Math.abs(denom) < 1e-10) return [];
      x = (b.y - a.y + a.slope * a.x - b.slope * b.x) / denom;
      y = tangentLineY(a, x);
    }
    const hit = decorateIntersection(left, right, x, y);
    return hit ? [hit] : [];
  }

  function intersectTangentWithExplicit(tangentCurve, curve, xMin, xMax, sampleCount, xTol, yTol, params = {}) {
    const line = tangentCurve.line;
    const domain = getCurveAxisRange(curve.compiled, 'x', xMin, xMax, params);
    if (!(domain.max > domain.min)) return [];
    if (line.type === 'vertical') {
      if (line.x < domain.min - xTol || line.x > domain.max + xTol) return [];
      const y = evaluateExplicitSafe(curve.compiled, line.x, params);
      const hit = decorateIntersection(tangentCurve, curve, line.x, y);
      return hit ? [hit] : [];
    }
    const diff = (x) => evaluateExplicitSafe(curve.compiled, x, params) - tangentLineY(line, x);
    return scanRoots(diff, domain.min, domain.max, sampleCount, yTol).map((x) => {
      const y = evaluateExplicitSafe(curve.compiled, x, params);
      return decorateIntersection(tangentCurve, curve, x, y);
    }).filter(Boolean);
  }

  function intersectTangentWithSampled(tangentCurve, curve, sampleCount, xTol, yTol, params = {}) {
    const line = tangentCurve.line;
    const range = getCurveParameterRange(curve.compiled, params);
    if (!(range.max > range.min)) return [];
    const residualTol = line.type === 'vertical' ? xTol : yTol;
    const residual = (parameterValue) => {
      const point = evaluateCurvePointSafe(curve.compiled, parameterValue, params);
      return point ? tangentLineResidual(line, point.x, point.y) : NaN;
    };
    return scanRoots(residual, range.min, range.max, sampleCount, residualTol).map((parameterValue) => {
      const point = evaluateCurvePointSafe(curve.compiled, parameterValue, params);
      return point ? decorateIntersection(tangentCurve, curve, point.x, point.y) : null;
    }).filter(Boolean);
  }

  function intersectTangentWithImplicit(tangentCurve, curve, xMin, xMax, yMin, yMax, sampleCount, xTol, yTol, params = {}) {
    const line = tangentCurve.line;
    const ranges = getResolvedRanges(curve.compiled, params);
    if (line.type === 'vertical') {
      if (ranges.x && (line.x < ranges.x.min - xTol || line.x > ranges.x.max + xTol)) return [];
      const yRange = ranges.y || { min: yMin, max: yMax };
      const min = Math.max(yMin, yRange.min);
      const max = Math.min(yMax, yRange.max);
      if (!(max > min)) return [];
      return scanRoots((y) => evaluateImplicitSafe(curve.compiled, line.x, y, params), min, max, sampleCount, yTol).map((y) => (
        decorateIntersection(tangentCurve, curve, line.x, y)
      )).filter(Boolean);
    }
    const xRange = ranges.x || { min: xMin, max: xMax };
    const yRange = ranges.y;
    const min = Math.max(xMin, xRange.min);
    const max = Math.min(xMax, xRange.max);
    if (!(max > min)) return [];
    const residual = (x) => {
      const y = tangentLineY(line, x);
      if (!Number.isFinite(y) || (yRange && (y < yRange.min || y > yRange.max))) return NaN;
      return evaluateImplicitSafe(curve.compiled, x, y, params);
    };
    return scanRoots(residual, min, max, sampleCount, yTol).map((x) => {
      const y = tangentLineY(line, x);
      return decorateIntersection(tangentCurve, curve, x, y);
    }).filter(Boolean);
  }

  function intersectTangentWithCurve(tangentCurve, curve, xMin, xMax, yMin, yMax, sampleCount, xTol, yTol, params = {}) {
    if (!tangentCurve?.visible || !curve?.visible || tangentCurve.id === curve.id) return [];
    if (tangentCurve.ownerId && tangentCurve.ownerId === curve.id) return tangentOwnerContact(tangentCurve, curve);
    if (isTangentCurve(curve)) return intersectTangentLines(tangentCurve, curve);
    if (!curve.compiled) return [];
    if (curve.compiled.kind === 'explicit') {
      return intersectTangentWithExplicit(tangentCurve, curve, xMin, xMax, sampleCount, xTol, yTol, params);
    }
    if (curve.compiled.kind === 'parametric' || curve.compiled.kind === 'polar') {
      return intersectTangentWithSampled(tangentCurve, curve, sampleCount, xTol, yTol, params);
    }
    if (curve.compiled.kind === 'implicit') {
      return intersectTangentWithImplicit(tangentCurve, curve, xMin, xMax, yMin, yMax, sampleCount, xTol, yTol, params);
    }
    return [];
  }

  function mergeIntersectionPoints(points, xTol, yTol, curvesById, params = {}) {
    if (!points.length) return [];
    const groups = new Map();
    points.forEach((point) => {
      const key = [point.fnId, point.fn2Id].filter(Boolean).sort().join('|');
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = [];
        groups.set(key, bucket);
      }
      bucket.push(point);
    });

    const merged = [];
    groups.forEach((group) => {
      const n = group.length;
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (i) => {
        let root = i;
        while (parent[root] !== root) root = parent[root];
        while (parent[i] !== root) {
          const next = parent[i];
          parent[i] = root;
          i = next;
        }
        return root;
      };
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (
            Math.abs(group[i].x - group[j].x) <= xTol &&
            Math.abs(group[i].y - group[j].y) <= yTol
          ) {
            const ri = find(i);
            const rj = find(j);
            if (ri !== rj) parent[ri] = rj;
          }
        }
      }
      const clusters = new Map();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        let bucket = clusters.get(root);
        if (!bucket) {
          bucket = [];
          clusters.set(root, bucket);
        }
        bucket.push(group[i]);
      }
      clusters.forEach((cluster) => {
        let bestPoint = cluster[0];
        let bestScore = NaN;
        let hasScoredPoint = false;
        let sumX = 0;
        let sumY = 0;
        cluster.forEach((point) => {
          sumX += point.x;
          sumY += point.y;
          let scored = false;
          const score = [point.fnId, point.fn2Id].reduce((sum, id) => {
            const residual = curveResidualAtPoint(curvesById.get(id), point.x, point.y, params);
            if (!Number.isFinite(residual)) return sum;
            scored = true;
            return sum + residual;
          }, 0);
          if (!scored) return;
          if (!hasScoredPoint || score < bestScore) {
            bestPoint = point;
            bestScore = score;
            hasScoredPoint = true;
          }
        });
        merged.push(hasScoredPoint ? bestPoint : {
          ...bestPoint,
          x: sumX / cluster.length,
          y: sumY / cluster.length,
        });
      });
    });

    return merged;
  }

  function computeSpecialPoints(featureFunctions, curves, polylineCurves, implicitCurves, xMin, xMax, yMin, yMax, scaleX, scaleY, width, height, params = {}) {
    const visibleTangentCurves = curves.filter(isTangentCurve).filter(fn => fn.visible);
    const visibleBaseCurves = curves.filter(fn => !isTangentCurve(fn));
    const visibleExplicit = visibleBaseCurves.filter(fn => fn.visible && fn.compiled && fn.compiled.kind === 'explicit');
    const sampledCurves = polylineCurves || [];
    const analysisSampledCurves = sampledCurves.filter(fn => !isTangentCurve(fn));
    const visibleImplicit = (implicitCurves || []).filter(fn => !isTangentCurve(fn));
    if (!sampledCurves.length && !visibleImplicit.length) return [];
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return [];
    const sampleCount = Math.max(320, Math.min(1600, Math.floor(width * 1.5)));
    const yTol = Math.max(1e-6, 6 / Math.max(scaleY, 1));
    const xTol = Math.max((xMax - xMin) / sampleCount * 2, 1e-6);
    const points = [];

    featureFunctions
      .filter(fn => fn.visible && fn.compiled && fn.compiled.kind === 'explicit')
      .forEach((fn) => {
        const domain = getCurveAxisRange(fn.compiled, 'x', xMin, xMax, params);
        const evaluator = (x) => evaluateExplicitSafe(fn.compiled, x, params);
        const zeros = scanRoots(evaluator, domain.min, domain.max, sampleCount, yTol);
        zeros.forEach((x) => {
          points.push({
            type: 'zero',
            x,
            y: 0,
            color: fn.color,
            fnId: fn.id,
            label: fn.label,
          });
        });
        const extrema = scanExtrema(evaluator, domain.min, domain.max, Math.min(sampleCount, 900));
        extrema.forEach(({ x, y, type }) => {
          points.push({
            type,
            x,
            y,
            color: fn.color,
            fnId: fn.id,
            label: fn.label,
          });
        });
      });

    for (let i = 0; i < visibleExplicit.length; i++) {
      for (let j = i + 1; j < visibleExplicit.length; j++) {
        const overlapMin = Math.max(
          getCurveAxisRange(visibleExplicit[i].compiled, 'x', xMin, xMax, params).min,
          getCurveAxisRange(visibleExplicit[j].compiled, 'x', xMin, xMax, params).min,
        );
        const overlapMax = Math.min(
          getCurveAxisRange(visibleExplicit[i].compiled, 'x', xMin, xMax, params).max,
          getCurveAxisRange(visibleExplicit[j].compiled, 'x', xMin, xMax, params).max,
        );
        if (!(overlapMax > overlapMin)) continue;
        const diff = (x) => (
          evaluateExplicitSafe(visibleExplicit[i].compiled, x, params) -
          evaluateExplicitSafe(visibleExplicit[j].compiled, x, params)
        );
        const roots = scanRoots(diff, overlapMin, overlapMax, sampleCount, yTol);
        roots.forEach((x) => {
          const y = evaluateExplicitSafe(visibleExplicit[i].compiled, x, params);
          if (!Number.isFinite(y)) return;
          points.push({
            type: 'intersection',
            x,
            y,
            color: visibleExplicit[i].color,
            color2: visibleExplicit[j].color,
            fnId: visibleExplicit[i].id,
            fn2Id: visibleExplicit[j].id,
            label: visibleExplicit[i].label,
            label2: visibleExplicit[j].label,
          });
        });
      }
    }

    visibleExplicit.forEach((explicitCurve) => {
      visibleImplicit.forEach((implicitCurve) => {
        points.push(...intersectExplicitAndImplicit(
          explicitCurve,
          implicitCurve,
          xMin,
          xMax,
          sampleCount,
          yTol,
          params,
        ));
      });
    });

    for (let i = 0; i < visibleTangentCurves.length; i++) {
      const tangentCurve = visibleTangentCurves[i];
      visibleBaseCurves.forEach((curve) => {
        points.push(...intersectTangentWithCurve(
          tangentCurve,
          curve,
          xMin,
          xMax,
          yMin,
          yMax,
          Math.min(sampleCount, 900),
          xTol,
          yTol,
          params,
        ));
      });
      for (let j = i + 1; j < visibleTangentCurves.length; j++) {
        points.push(...intersectTangentWithCurve(
          tangentCurve,
          visibleTangentCurves[j],
          xMin,
          xMax,
          yMin,
          yMax,
          Math.min(sampleCount, 900),
          xTol,
          yTol,
          params,
        ));
      }
    }

    points.push(...intersectImplicitCurves(
      visibleImplicit,
      xTol,
      Math.max(yTol, (yMax - yMin) / Math.max(120, height)),
      params,
    ));

    const genericCurves = [...analysisSampledCurves, ...visibleImplicit];
    for (let i = 0; i < genericCurves.length; i++) {
      for (let j = i + 1; j < genericCurves.length; j++) {
        if (genericCurves[i].compiled.kind === 'explicit' && genericCurves[j].compiled.kind === 'explicit') continue;
        if (genericCurves[i].compiled.kind === 'implicit' && genericCurves[j].compiled.kind === 'implicit') continue;
        if (
          (genericCurves[i].compiled.kind === 'explicit' && genericCurves[j].compiled.kind === 'implicit') ||
          (genericCurves[i].compiled.kind === 'implicit' && genericCurves[j].compiled.kind === 'explicit')
        ) continue;
        points.push(...intersectSegmentCollections(genericCurves[i], genericCurves[j], xTol, yTol));
      }
    }

    const visiblePoints = points.filter(point => point.y >= yMin - yTol * 4 && point.y <= yMax + yTol * 4);
    const otherPoints = dedupePoints(
      visiblePoints.filter(point => point.type !== 'intersection'),
      xTol,
      yTol * 3,
    );
    const curvesById = new Map([...sampledCurves, ...visibleImplicit, ...visibleTangentCurves].map(curve => [curve.id, curve]));
    const intersections = mergeIntersectionPoints(
      visiblePoints.filter(point => point.type === 'intersection'),
      Math.max(xTol, 4 / Math.max(scaleX, 1)),
      Math.max(yTol * 3, 4 / Math.max(scaleY, 1)),
      curvesById,
      params,
    );

    return [...otherPoints, ...intersections].sort((a, b) => a.x - b.x || a.y - b.y);
  }

  function interpolateIsoPoint(a, b, fa, fb) {
    if (Math.abs(fa) < TOLERANCE.EQUATION && Math.abs(fb) < TOLERANCE.EQUATION) return (a + b) / 2;
    if (Math.abs(fa - fb) < TOLERANCE.EQUATION) return (a + b) / 2;
    const t = Math.max(0, Math.min(1, fa / (fa - fb)));
    return a + (b - a) * t;
  }

  function sampleImplicitSegments(compiled, bounds, cols, rows, params = {}) {
    if (!compiled || compiled.kind !== 'implicit') return [];
    const { wxMin, wxMax, wyMin, wyMax } = bounds;
    if (!Number.isFinite(wxMin + wxMax + wyMin + wyMax) || wxMax <= wxMin || wyMax <= wyMin) return [];
    const dx = (wxMax - wxMin) / cols;
    const dy = (wyMax - wyMin) / rows;
    const ranges = getResolvedRanges(compiled, params);
    const xRange = ranges.x;
    const yRange = ranges.y;
    const values = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(NaN));

    for (let row = 0; row <= rows; row++) {
      const y = wyMax - row * dy;
      for (let col = 0; col <= cols; col++) {
        const x = wxMin + col * dx;
        if ((xRange && (x < xRange.min || x > xRange.max)) || (yRange && (y < yRange.min || y > yRange.max))) continue;
        values[row][col] = evaluateImplicitSafe(compiled, x, y, params);
      }
    }

    const segments = [];
    const pushSegment = (p1, p2) => {
      if (!p1 || !p2) return;
      segments.push({ ax: p1.x, ay: p1.y, bx: p2.x, by: p2.y });
    };

    for (let row = 0; row < rows; row++) {
      const yTop = wyMax - row * dy;
      const yBottom = yTop - dy;
      for (let col = 0; col < cols; col++) {
        const xLeft = wxMin + col * dx;
        const xRight = xLeft + dx;
        const tl = values[row][col];
        const tr = values[row][col + 1];
        const br = values[row + 1][col + 1];
        const bl = values[row + 1][col];
        if (![tl, tr, br, bl].every(Number.isFinite)) continue;

        const points = {};
        const maybeTop = (tl === 0 || tr === 0 || tl * tr < 0)
          ? { x: interpolateIsoPoint(xLeft, xRight, tl, tr), y: yTop }
          : null;
        const maybeRight = (tr === 0 || br === 0 || tr * br < 0)
          ? { x: xRight, y: interpolateIsoPoint(yTop, yBottom, tr, br) }
          : null;
        const maybeBottom = (br === 0 || bl === 0 || br * bl < 0)
          ? { x: interpolateIsoPoint(xRight, xLeft, br, bl), y: yBottom }
          : null;
        const maybeLeft = (bl === 0 || tl === 0 || bl * tl < 0)
          ? { x: xLeft, y: interpolateIsoPoint(yBottom, yTop, bl, tl) }
          : null;

        if (maybeTop) points.top = maybeTop;
        if (maybeRight) points.right = maybeRight;
        if (maybeBottom) points.bottom = maybeBottom;
        if (maybeLeft) points.left = maybeLeft;

        const hits = Object.entries(points);
        if (hits.length === 2) {
          pushSegment(hits[0][1], hits[1][1]);
          continue;
        }
        if (hits.length !== 4) continue;

        const center = evaluateImplicitSafe(compiled, (xLeft + xRight) / 2, (yTop + yBottom) / 2, params);
        const centerMatchesTL = center >= 0 ? tl >= 0 : tl < 0;
        if (centerMatchesTL) {
          pushSegment(points.top, points.right);
          pushSegment(points.bottom, points.left);
        } else {
          pushSegment(points.top, points.left);
          pushSegment(points.right, points.bottom);
        }
      }
    }

    return segments;
  }

  function sampleVisibleImplicitCurves(functions, bounds, cols, rows, params = {}) {
    return functions
      .filter(fn => fn.visible && fn.compiled && fn.compiled.kind === 'implicit' && !isTangentCurve(fn))
      .map(fn => ({ ...fn, segments: sampleImplicitSegments(fn.compiled, bounds, cols, rows, params) }))
      .filter(fn => fn.segments.length);
  }

  function segmentIntersection(a, b, epsilon = TOLERANCE.SEGMENT) {
    const rX = a.bx - a.ax;
    const rY = a.by - a.ay;
    const sX = b.bx - b.ax;
    const sY = b.by - b.ay;
    const qmpX = b.ax - a.ax;
    const qmpY = b.ay - a.ay;
    const crossRS = rX * sY - rY * sX;

    if (Math.abs(crossRS) < epsilon) {
      const endpoints = [
        { x: a.ax, y: a.ay },
        { x: a.bx, y: a.by },
        { x: b.ax, y: b.ay },
        { x: b.bx, y: b.by },
      ];
      const near = endpoints.filter((point, index) => (
        endpoints.findIndex((other) => Math.hypot(other.x - point.x, other.y - point.y) <= epsilon * 50) !== index
      ));
      if (!near.length) return null;
      const sum = near.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
      return { x: sum.x / near.length, y: sum.y / near.length };
    }

    const t = (qmpX * sY - qmpY * sX) / crossRS;
    const u = (qmpX * rY - qmpY * rX) / crossRS;
    if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
    return {
      x: a.ax + t * rX,
      y: a.ay + t * rY,
    };
  }

  function refineImplicitIntersection(leftCompiled, rightCompiled, seedX, seedY, params = {}) {
    let x = seedX;
    let y = seedY;
    for (let i = 0; i < 8; i++) {
      const f = evaluateImplicitSafe(leftCompiled, x, y, params);
      const g = evaluateImplicitSafe(rightCompiled, x, y, params);
      if (!Number.isFinite(f) || !Number.isFinite(g)) return null;
      if (Math.max(Math.abs(f), Math.abs(g)) < TOLERANCE.NEWTON_CONVERGE) return { x, y };

      const hx = Math.max(1e-4, Math.abs(x) * 1e-4);
      const hy = Math.max(1e-4, Math.abs(y) * 1e-4);
      const fx1 = evaluateImplicitSafe(leftCompiled, x + hx, y, params);
      const fx0 = evaluateImplicitSafe(leftCompiled, x - hx, y, params);
      const fy1 = evaluateImplicitSafe(leftCompiled, x, y + hy, params);
      const fy0 = evaluateImplicitSafe(leftCompiled, x, y - hy, params);
      const gx1 = evaluateImplicitSafe(rightCompiled, x + hx, y, params);
      const gx0 = evaluateImplicitSafe(rightCompiled, x - hx, y, params);
      const gy1 = evaluateImplicitSafe(rightCompiled, x, y + hy, params);
      const gy0 = evaluateImplicitSafe(rightCompiled, x, y - hy, params);
      if (![fx1, fx0, fy1, fy0, gx1, gx0, gy1, gy0].every(Number.isFinite)) return null;

      const fx = (fx1 - fx0) / (2 * hx);
      const fy = (fy1 - fy0) / (2 * hy);
      const gx = (gx1 - gx0) / (2 * hx);
      const gy = (gy1 - gy0) / (2 * hy);
      const det = fx * gy - fy * gx;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-10) return null;

      const dx = (-f * gy + fy * g) / det;
      const dy = (f * gx - fx * g) / det;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

      x += dx;
      y += dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < TOLERANCE.NEWTON_CONVERGE) break;
    }

    const finalF = evaluateImplicitSafe(leftCompiled, x, y, params);
    const finalG = evaluateImplicitSafe(rightCompiled, x, y, params);
    if (!Number.isFinite(finalF) || !Number.isFinite(finalG)) return null;
    return Math.max(Math.abs(finalF), Math.abs(finalG)) < TOLERANCE.IMPLICIT_RESIDUAL ? { x, y } : null;
  }

  function intersectImplicitCurves(curves, xTol, yTol, params = {}) {
    const points = [];
    const decorateSegments = (segments) => segments.map((segment) => ({
      ...segment,
      minX: Math.min(segment.ax, segment.bx),
      maxX: Math.max(segment.ax, segment.bx),
      minY: Math.min(segment.ay, segment.by),
      maxY: Math.max(segment.ay, segment.by),
    }));

    for (let i = 0; i < curves.length; i++) {
      const left = curves[i];
      const leftSegments = decorateSegments(left.segments);
      for (let j = i + 1; j < curves.length; j++) {
        const right = curves[j];
        const rightSegments = decorateSegments(right.segments);
        leftSegments.forEach((segmentA) => {
          rightSegments.forEach((segmentB) => {
            if (
              segmentA.maxX < segmentB.minX - xTol ||
              segmentB.maxX < segmentA.minX - xTol ||
              segmentA.maxY < segmentB.minY - yTol ||
              segmentB.maxY < segmentA.minY - yTol
            ) return;
            const hit = segmentIntersection(segmentA, segmentB, Math.max(xTol, yTol) * 0.25);
            if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y)) return;
            const refined = refineImplicitIntersection(left.compiled, right.compiled, hit.x, hit.y, params) || hit;
            points.push({
              type: 'intersection',
              x: refined.x,
              y: refined.y,
              color: left.color,
              color2: right.color,
              fnId: left.id,
              fn2Id: right.id,
              label: left.label,
              label2: right.label,
            });
          });
        });
      }
    }

    return dedupePoints(points, xTol, yTol);
  }

  function closestPointOnSegment(point, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < TOLERANCE.SEGMENT) return { x: a.x, y: a.y, t: 0, dist: Math.hypot(point.x - a.x, point.y - a.y) };
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lenSq));
    const x = a.x + abx * t;
    const y = a.y + aby * t;
    return { x, y, t, dist: Math.hypot(point.x - x, point.y - y) };
  }

  function differentiateExplicit(compiled, x, scaleX, params = {}) {
    if (!compiled || compiled.kind !== 'explicit') return null;
    const h = Math.max(1e-4, Math.abs(x) * 1e-4, 2 / Math.max(scaleX, 1));
    const left = evaluateExplicitSafe(compiled, x - h, params);
    const right = evaluateExplicitSafe(compiled, x + h, params);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return (right - left) / (2 * h);
  }

  function differentiateImplicit(compiled, x, y, scaleX, scaleY, params = {}) {
    if (!compiled || compiled.kind !== 'implicit') return null;
    const hx = Math.max(1e-4, Math.abs(x) * 1e-4, 2 / Math.max(scaleX, 1));
    const hy = Math.max(1e-4, Math.abs(y) * 1e-4, 2 / Math.max(scaleY, 1));
    const fx1 = evaluateImplicitSafe(compiled, x + hx, y, params);
    const fx0 = evaluateImplicitSafe(compiled, x - hx, y, params);
    const fy1 = evaluateImplicitSafe(compiled, x, y + hy, params);
    const fy0 = evaluateImplicitSafe(compiled, x, y - hy, params);
    if (![fx1, fx0, fy1, fy0].every(Number.isFinite)) return null;
    return {
      fx: (fx1 - fx0) / (2 * hx),
      fy: (fy1 - fy0) / (2 * hy),
    };
  }

  function differentiateSampledCurve(compiled, parameterValue, scaleX, scaleY, params = {}) {
    if (!compiled || !['parametric', 'polar'].includes(compiled.kind)) return null;
    const h = Math.max(1e-4, Math.abs(parameterValue) * 1e-4, 2 / Math.max(scaleX, scaleY, 1));
    const left = evaluateCurvePointSafe(compiled, parameterValue - h, params);
    const right = evaluateCurvePointSafe(compiled, parameterValue + h, params);
    if (!left || !right) return null;
    return {
      dx: (right.x - left.x) / (2 * h),
      dy: (right.y - left.y) / (2 * h),
    };
  }

  function getTangentLine(fn, point, view, params = {}) {
    if (!fn || !fn.compiled || !point) return null;
    const scaleX = Math.max(view?.scaleX || view?.scale || DEFAULT_VIEW.scaleX, 1);
    const scaleY = Math.max(view?.scaleY || view?.scale || DEFAULT_VIEW.scaleY, 1);
    if (fn.compiled.kind === 'explicit') {
      const slope = differentiateExplicit(fn.compiled, point.x, scaleX, params);
      if (!Number.isFinite(slope)) return null;
      return { type: 'slope', x: point.x, y: point.y, slope };
    }
    if (fn.compiled.kind === 'implicit') {
      const gradient = differentiateImplicit(fn.compiled, point.x, point.y, scaleX, scaleY, params);
      if (!gradient) return null;
      if (Math.abs(gradient.fx) < 1e-8 && Math.abs(gradient.fy) < 1e-8) return null;
      if (Math.abs(gradient.fy) < 1e-8) return { type: 'vertical', x: point.x, y: point.y };
      return { type: 'slope', x: point.x, y: point.y, slope: -gradient.fx / gradient.fy };
    }
    const derivative = differentiateSampledCurve(fn.compiled, point.parameterValue, scaleX, scaleY, params);
    if (!derivative) return null;
    if (Math.abs(derivative.dx) < 1e-8 && Math.abs(derivative.dy) < 1e-8) return null;
    if (Math.abs(derivative.dx) < 1e-8) return { type: 'vertical', x: point.x, y: point.y };
    return { type: 'slope', x: point.x, y: point.y, slope: derivative.dy / derivative.dx };
  }

  window.LocusShared = {
    RAIL_WIDTH,
    MIN_VIEW_SCALE,
    MAX_VIEW_SCALE,
    DEFAULT_VIEW,
    COORD_MODES,
    sanitizeView,
    defaultParameterConfig,
    sanitizeParameterConfig,
    formatDecimalNumber,
    formatCoordinateValue,
    formatPointLabel,
    getPointKey,
    inferCurveKindFromExpr,
    formatFnLabel,
    formatTangentLabel,
    nextFreeSeq,
    nextFreeColor,
    humanizeError,
    evaluateExplicitSafe,
    evaluateCurvePointSafe,
    getCurveAxisRange,
    samplePolylineWorldPoints,
    buildVisiblePolylineCurves,
    computeSpecialPoints,
    getImplicitSampleGrid,
    sampleImplicitSegments,
    sampleVisibleImplicitCurves,
    closestPointOnSegment,
    getTangentLine,
  };
})();
