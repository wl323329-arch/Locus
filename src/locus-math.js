(function () {
  const TOKEN = {
    NUM: 'NUM', ID: 'ID', OP: 'OP', LP: 'LP', RP: 'RP',
    COMMA: 'COMMA', QMARK: 'QMARK', COLON: 'COLON', END: 'END',
  };
  const COORDINATE_VARS = new Set(['x', 'y', 't', 'theta']);
  const normalizeInput = (src) => (src || '')
    .replace(/θ/gu, 'theta')
    .replace(/π/gu, 'pi')
    .replace(/≤/gu, '<=')
    .replace(/≥/gu, '>=')
    .replace(/≠/gu, '!=')
    .replace(/∈/gu, 'in');

  function splitTopLevel(src, separator = ';') {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (ch === separator && depth === 0) {
        parts.push(src.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(src.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  }

  function parseRangeStatement(src) {
    const match = src.match(/^(x|y|t|theta)\s+in\s+\[\s*(.+)\s*,\s*(.+)\s*\]$/u);
    if (!match) return null;
    return { variable: match[1], min: match[2], max: match[3] };
  }

  function parseAssignmentStatement(src) {
    const match = src.match(/^([A-Za-z_][A-Za-z_0-9]*)(?:\(\s*([A-Za-z_][A-Za-z_0-9]*)\s*\))?\s*=\s*(.+)$/u);
    if (!match) return null;
    return { target: match[1], parameter: match[2] || null, expr: match[3].trim() };
  }

  function tokenize(src) {
    const t = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
        t.push({ k: TOKEN.OP, v: two });
        i += 2;
        continue;
      }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        if (src[j] === 'e' || src[j] === 'E') {
          j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
        t.push({ k: TOKEN.NUM, v: parseFloat(src.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < src.length && /[A-Za-z_0-9]/.test(src[j])) j++;
        t.push({ k: TOKEN.ID, v: src.slice(i, j) });
        i = j;
        continue;
      }
      if ('+-*/^%<>!'.includes(c)) { t.push({ k: TOKEN.OP, v: c }); i++; continue; }
      if (c === '(') { t.push({ k: TOKEN.LP }); i++; continue; }
      if (c === ')') { t.push({ k: TOKEN.RP }); i++; continue; }
      if (c === ',') { t.push({ k: TOKEN.COMMA }); i++; continue; }
      if (c === '?') { t.push({ k: TOKEN.QMARK }); i++; continue; }
      if (c === ':') { t.push({ k: TOKEN.COLON }); i++; continue; }
      if (c === '=') { t.push({ k: TOKEN.OP, v: '=' }); i++; continue; }
      throw new Error('Unexpected character: ' + c);
    }
    t.push({ k: TOKEN.END });
    return t;
  }

  function parse(src) {
    const tokens = tokenize(normalizeInput(src));
    let i = 0;
    const peek = () => tokens[i];
    const eat = (kind, value) => {
      const token = tokens[i];
      if (!token || token.k !== kind || (value !== undefined && token.v !== value)) {
        throw new Error('Unexpected token');
      }
      i++;
      return token;
    };

    const parsePrimary = () => {
      const token = peek();
      if (token.k === TOKEN.NUM) {
        eat(TOKEN.NUM);
        return { num: token.v };
      }
      if (token.k === TOKEN.ID) {
        eat(TOKEN.ID);
        if (peek().k === TOKEN.LP) {
          eat(TOKEN.LP);
          const args = [];
          if (peek().k !== TOKEN.RP) {
            do {
              args.push(parseExpression());
              if (peek().k !== TOKEN.COMMA) break;
              eat(TOKEN.COMMA);
            } while (true);
          }
          eat(TOKEN.RP);
          return { call: token.v, args };
        }
        return { id: token.v };
      }
      if (token.k === TOKEN.LP) {
        eat(TOKEN.LP);
        const expr = parseExpression();
        eat(TOKEN.RP);
        return expr;
      }
      throw new Error('Unexpected token');
    };

    const parseUnary = () => {
      const token = peek();
      if (token.k === TOKEN.OP && (token.v === '+' || token.v === '-' || token.v === '!')) {
        eat(TOKEN.OP, token.v);
        const arg = parseUnary();
        return token.v === '-' ? { op: 'neg', arg } : token.v === '+' ? arg : { op: '!', arg };
      }
      return parsePrimary();
    };

    const parsePow = () => {
      let left = parseUnary();
      while (peek().k === TOKEN.OP && peek().v === '^') {
        eat(TOKEN.OP, '^');
        left = { op: '^', left, right: parseUnary() };
      }
      return left;
    };

    const parseMul = () => {
      let left = parsePow();
      while (peek().k === TOKEN.OP && ['*', '/', '%'].includes(peek().v)) {
        const op = eat(TOKEN.OP).v;
        left = { op, left, right: parsePow() };
      }
      return left;
    };

    const parseAdd = () => {
      let left = parseMul();
      while (peek().k === TOKEN.OP && ['+', '-'].includes(peek().v)) {
        const op = eat(TOKEN.OP).v;
        left = { op, left, right: parseMul() };
      }
      return left;
    };

    const parseCompare = () => {
      let left = parseAdd();
      while (peek().k === TOKEN.OP && ['<', '>', '<=', '>=', '==', '!=', '='].includes(peek().v)) {
        const op = eat(TOKEN.OP).v;
        left = { op, left, right: parseAdd() };
      }
      return left;
    };

    const parseAnd = () => {
      let left = parseCompare();
      while (peek().k === TOKEN.OP && peek().v === '&&') {
        eat(TOKEN.OP, '&&');
        left = { op: '&&', left, right: parseCompare() };
      }
      return left;
    };

    const parseOr = () => {
      let left = parseAnd();
      while (peek().k === TOKEN.OP && peek().v === '||') {
        eat(TOKEN.OP, '||');
        left = { op: '||', left, right: parseAnd() };
      }
      return left;
    };

    const parseConditional = () => {
      let test = parseOr();
      if (peek().k === TOKEN.QMARK) {
        eat(TOKEN.QMARK);
        const yes = parseExpression();
        eat(TOKEN.COLON);
        const no = parseExpression();
        return { op: '?:', test, yes, no };
      }
      return test;
    };

    function parseExpression() {
      return parseConditional();
    }

    const tree = parseExpression();
    if (peek().k !== TOKEN.END) throw new Error('Trailing tokens');
    return tree;
  }

  function evalNode(node, scope) {
    if (node.num !== undefined) return node.num;
    if (node.id !== undefined) {
      if (node.id in scope) return scope[node.id];
      if (node.id in Math) return Math[node.id];
      throw new Error('Unknown: ' + node.id);
    }
    if (node.call !== undefined) {
      const args = node.args.map(arg => evalNode(arg, scope));
      if (node.call === 'if') {
        if (args.length !== 3) throw new Error('if expects 3 arguments');
        return args[0] ? args[1] : args[2];
      }
      if (node.call === 'piecewise') {
        if (args.length < 3 || args.length % 2 === 0) throw new Error('piecewise expects condition/value pairs');
        for (let idx = 0; idx < args.length - 1; idx += 2) {
          if (args[idx]) return args[idx + 1];
        }
        return args[args.length - 1];
      }
      const fn = scope[node.call] ?? Math[node.call];
      if (typeof fn !== 'function') throw new Error('Not a function: ' + node.call);
      return fn(...args);
    }
    if (node.op === 'neg') return -evalNode(node.arg, scope);
    if (node.op === '!') return evalNode(node.arg, scope) ? 0 : 1;
    if (node.op === '?:') return evalNode(node.test, scope) ? evalNode(node.yes, scope) : evalNode(node.no, scope);
    const left = evalNode(node.left, scope);
    const right = evalNode(node.right, scope);
    switch (node.op) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      case '^': return Math.pow(left, right);
      case '<': return left < right ? 1 : 0;
      case '>': return left > right ? 1 : 0;
      case '<=': return left <= right ? 1 : 0;
      case '>=': return left >= right ? 1 : 0;
      case '==': return left === right ? 1 : 0;
      case '!=': return left !== right ? 1 : 0;
      case '&&': return left && right ? 1 : 0;
      case '||': return left || right ? 1 : 0;
      case '=': return Math.abs(left - right) <= 1e-12 ? 1 : 0;
      default: throw new Error('Bad op: ' + node.op);
    }
  }

  const EXTRA = {
    piecewise: (...args) => {
      if (args.length < 3 || args.length % 2 === 0) throw new Error('piecewise expects condition/value pairs');
      for (let idx = 0; idx < args.length - 1; idx += 2) {
        if (args[idx]) return args[idx + 1];
      }
      return args[args.length - 1];
    },
    if: (condition, whenTrue, whenFalse) => condition ? whenTrue : whenFalse,
    sec: (x) => 1 / Math.cos(x),
    csc: (x) => 1 / Math.sin(x),
    cot: (x) => 1 / Math.tan(x),
    ln: Math.log,
    log: Math.log10 || ((x) => Math.log(x) / Math.LN10),
    pi: Math.PI,
    e: Math.E,
    tau: 2 * Math.PI,
    nan: NaN,
    min: Math.min,
    max: Math.max,
  };

  function collectVariables(node, vars = new Set()) {
    if (!node) return vars;
    if (node.num !== undefined) return vars;
    if (node.id !== undefined) {
      if (!(node.id in EXTRA) && !(node.id in Math)) vars.add(node.id);
      return vars;
    }
    if (node.call !== undefined) {
      node.args.forEach((arg) => collectVariables(arg, vars));
      return vars;
    }
    if (node.op === 'neg' || node.op === '!') return collectVariables(node.arg, vars);
    if (node.op === '?:') {
      collectVariables(node.test, vars);
      collectVariables(node.yes, vars);
      collectVariables(node.no, vars);
      return vars;
    }
    collectVariables(node.left, vars);
    collectVariables(node.right, vars);
    return vars;
  }

  function buildEvaluator(node) {
    return (vars = {}) => evalNode(node, { ...EXTRA, ...vars });
  }

  function collectRangeVariables(rangeStatements) {
    const vars = new Set();
    rangeStatements.forEach((range) => {
      collectVariables(parse(range.min), vars);
      collectVariables(parse(range.max), vars);
    });
    return vars;
  }

  function buildRangeResolvers(rangeStatements) {
    return rangeStatements.map((range) => ({
      variable: range.variable,
      min: buildEvaluator(parse(range.min)),
      max: buildEvaluator(parse(range.max)),
    }));
  }

  function resolveRanges(rangeResolvers, params = {}) {
    const resolved = {};
    rangeResolvers.forEach((range) => {
      const min = range.min(params);
      const max = range.max(params);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return;
      resolved[range.variable] = min <= max ? { min, max } : { min: max, max: min };
    });
    return resolved;
  }

  function inResolvedRange(value, range) {
    return !range || (value >= range.min - 1e-9 && value <= range.max + 1e-9);
  }

  window.LocusMath = {
    parse,
    compile(src) {
      const normalized = normalizeInput(src);
      const statements = splitTopLevel(normalized);
      const rangeStatements = [];
      const expressionStatements = [];

      statements.forEach((statement) => {
        const range = parseRangeStatement(statement);
        if (range) {
          rangeStatements.push(range);
          return;
        }
        expressionStatements.push(statement);
      });

      const rangeResolvers = buildRangeResolvers(rangeStatements);
      const rangeParamVars = collectRangeVariables(rangeStatements);
      const assignments = expressionStatements
        .map(parseAssignmentStatement)
        .filter(assignment => assignment && ['x', 'y', 'r'].includes(assignment.target));

      if (
        expressionStatements.length === 2 &&
        assignments.length === 2 &&
        assignments.some((item) => item.target === 'x') &&
        assignments.some((item) => item.target === 'y')
      ) {
        const xAssignment = assignments.find((item) => item.target === 'x');
        const yAssignment = assignments.find((item) => item.target === 'y');
        const parameterVar = xAssignment.parameter || yAssignment.parameter || (/\bt\b/u.test(`${xAssignment.expr} ${yAssignment.expr}`) ? 't' : 'theta');
        const xTree = parse(xAssignment.expr);
        const yTree = parse(yAssignment.expr);
        const xEvaluator = buildEvaluator(xTree);
        const yEvaluator = buildEvaluator(yTree);
        const vars = new Set([
          ...collectVariables(xTree),
          ...collectVariables(yTree),
          ...rangeParamVars,
        ]);
        vars.delete(parameterVar);
        vars.delete('x');
        vars.delete('y');
        return {
          kind: 'parametric',
          parameterVar,
          parameters: [...vars].filter(name => !(name in EXTRA) && !(name in Math)),
          ranges: rangeResolvers,
          getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
          evaluate: (parameterValue, params = {}) => {
            const scope = { ...params, [parameterVar]: parameterValue };
            const ranges = resolveRanges(rangeResolvers, scope);
            if (!inResolvedRange(parameterValue, ranges[parameterVar])) return null;
            const x = xEvaluator(scope);
            const y = yEvaluator(scope);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            if (!inResolvedRange(x, ranges.x) || !inResolvedRange(y, ranges.y)) return null;
            return { x, y, parameterValue };
          },
        };
      }

      if (expressionStatements.length === 1 && assignments.length === 1 && assignments[0].target === 'r') {
        const rAssignment = assignments[0];
        const parameterVar = rAssignment.parameter || 'theta';
        const rTree = parse(rAssignment.expr);
        const rEvaluator = buildEvaluator(rTree);
        const vars = new Set([...collectVariables(rTree), ...rangeParamVars]);
        vars.delete(parameterVar);
        vars.delete('r');
        return {
          kind: 'polar',
          parameterVar,
          parameters: [...vars].filter(name => !(name in EXTRA) && !(name in Math)),
          ranges: rangeResolvers,
          getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
          evaluate: (parameterValue, params = {}) => {
            const scope = { ...params, [parameterVar]: parameterValue };
            const ranges = resolveRanges(rangeResolvers, scope);
            if (!inResolvedRange(parameterValue, ranges[parameterVar])) return null;
            const radius = rEvaluator(scope);
            if (!Number.isFinite(radius)) return null;
            const x = radius * Math.cos(parameterValue);
            const y = radius * Math.sin(parameterValue);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            if (!inResolvedRange(x, ranges.x) || !inResolvedRange(y, ranges.y)) return null;
            return { x, y, parameterValue, r: radius };
          },
        };
      }

      if (expressionStatements.length > 1) throw new Error('Use semicolons only for x = … ; y = … or range limits');
      const mainStatement = expressionStatements[0];
      if (!mainStatement) throw new Error('Missing expression');
      const tree = parse(mainStatement);
      if (tree.op === '=') {
        const leftVars = collectVariables(tree.left);
        const rightVars = collectVariables(tree.right);
        if (tree.left.id === 'y' && !rightVars.has('y')) {
          const explicit = buildEvaluator(tree.right);
          return {
            kind: 'explicit',
            parameters: [...new Set([...rightVars, ...rangeParamVars])].filter(name => name !== 'x' && !(name in EXTRA) && !(name in Math)),
            ranges: rangeResolvers,
            getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
            evaluate: (x, params = {}) => {
              const ranges = resolveRanges(rangeResolvers, params);
              if (!inResolvedRange(x, ranges.x)) return NaN;
              const y = explicit({ ...params, x });
              if (!Number.isFinite(y)) return NaN;
              return inResolvedRange(y, ranges.y) ? y : NaN;
            },
          };
        }
        if (tree.right.id === 'y' && !leftVars.has('y')) {
          const explicit = buildEvaluator(tree.left);
          return {
            kind: 'explicit',
            parameters: [...new Set([...leftVars, ...rangeParamVars])].filter(name => name !== 'x' && !(name in EXTRA) && !(name in Math)),
            ranges: rangeResolvers,
            getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
            evaluate: (x, params = {}) => {
              const ranges = resolveRanges(rangeResolvers, params);
              if (!inResolvedRange(x, ranges.x)) return NaN;
              const y = explicit({ ...params, x });
              if (!Number.isFinite(y)) return NaN;
              return inResolvedRange(y, ranges.y) ? y : NaN;
            },
          };
        }
        const left = buildEvaluator(tree.left);
        const right = buildEvaluator(tree.right);
        return {
          kind: 'implicit',
          parameters: [...new Set([...leftVars, ...rightVars, ...rangeParamVars])].filter(name => !['x', 'y'].includes(name) && !(name in EXTRA) && !(name in Math)),
          ranges: rangeResolvers,
          getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
          evaluate: (x, y, params = {}) => {
            const ranges = resolveRanges(rangeResolvers, params);
            if (!inResolvedRange(x, ranges.x) || !inResolvedRange(y, ranges.y)) return NaN;
            return left({ ...params, x, y }) - right({ ...params, x, y });
          },
        };
      }

      const vars = collectVariables(tree);
      const evaluate = buildEvaluator(tree);
      if (vars.has('y')) {
        return {
          kind: 'implicit',
          parameters: [...new Set([...vars, ...rangeParamVars])].filter(name => !['x', 'y'].includes(name) && !(name in EXTRA) && !(name in Math)),
          ranges: rangeResolvers,
          getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
          evaluate: (x, y, params = {}) => {
            const ranges = resolveRanges(rangeResolvers, params);
            if (!inResolvedRange(x, ranges.x) || !inResolvedRange(y, ranges.y)) return NaN;
            return evaluate({ ...params, x, y });
          },
        };
      }
      return {
        kind: 'explicit',
        parameters: [...new Set([...vars, ...rangeParamVars])].filter(name => name !== 'x' && !(name in EXTRA) && !(name in Math)),
        ranges: rangeResolvers,
        getRanges: (params = {}) => resolveRanges(rangeResolvers, params),
        evaluate: (x, params = {}) => {
          const ranges = resolveRanges(rangeResolvers, params);
          if (!inResolvedRange(x, ranges.x)) return NaN;
          const y = evaluate({ ...params, x });
          if (!Number.isFinite(y)) return NaN;
          return inResolvedRange(y, ranges.y) ? y : NaN;
        },
      };
    },
  };
})();

window.LOCUS_THEMES = {
  linen: {
    name: 'Linen', bg: '#f7f5f0', panel: '#fbfaf6', ink: '#1a1917', muted: '#6d6a62',
    rule: '#e6e2d7', ruleStrong: '#c9c3b2', gridMinor: '#ebe6d9', gridMajor: '#d4ccba',
    axis: '#3a3732', accent: '#1a1917', chip: '#efece3',
    funcPalette: ['oklch(62% 0.16 25)', 'oklch(62% 0.16 145)', 'oklch(62% 0.16 240)', 'oklch(62% 0.16 310)', 'oklch(62% 0.16 75)', 'oklch(62% 0.16 195)'],
  },
  graphite: {
    name: 'Graphite', bg: '#131416', panel: '#1a1b1e', ink: '#ecebe7', muted: '#8a8a84',
    rule: '#272829', ruleStrong: '#3a3b3d', gridMinor: '#212224', gridMajor: '#2e2f31',
    axis: '#9a9a94', accent: '#ecebe7', chip: '#232427',
    funcPalette: ['oklch(72% 0.17 25)', 'oklch(72% 0.17 145)', 'oklch(72% 0.17 240)', 'oklch(72% 0.17 310)', 'oklch(72% 0.17 75)', 'oklch(72% 0.17 195)'],
  },
  blueprint: {
    name: 'Blueprint', bg: '#0f2a3f', panel: '#143348', ink: '#e8f1f7', muted: '#9cbbd0',
    rule: '#1e4560', ruleStrong: '#2c597a', gridMinor: '#1b3f58', gridMajor: '#2a567a',
    axis: '#c5dae8', accent: '#ffffff', chip: '#1a3d57',
    funcPalette: ['oklch(80% 0.14 60)', 'oklch(80% 0.14 150)', 'oklch(80% 0.14 320)', 'oklch(80% 0.14 200)', 'oklch(80% 0.14 30)', 'oklch(80% 0.14 260)'],
  },
  paper: {
    name: 'Paper', bg: '#fefdf9', panel: '#fffffc', ink: '#2a2520', muted: '#7a7366',
    rule: '#ebe6d9', ruleStrong: '#d0c9b6', gridMinor: '#f1ecde', gridMajor: '#ddd4bf',
    axis: '#4a4238', accent: '#b8471f', chip: '#f3eedf',
    funcPalette: ['oklch(55% 0.15 30)', 'oklch(55% 0.13 160)', 'oklch(55% 0.15 255)', 'oklch(55% 0.15 300)', 'oklch(60% 0.12 90)', 'oklch(55% 0.14 210)'],
  },
  sunrise: {
    name: 'Sunrise', bg: '#fff8f0', panel: '#ffffff', ink: '#241712', muted: '#7a5f52',
    rule: '#f1e4d4', ruleStrong: '#d9c3aa', gridMinor: '#f6eadb', gridMajor: '#e4cdb2',
    axis: '#3a2419', accent: '#d94a1f', chip: '#f8ecdc',
    funcPalette: ['oklch(65% 0.20 30)', 'oklch(65% 0.18 140)', 'oklch(65% 0.18 260)', 'oklch(65% 0.20 340)', 'oklch(70% 0.17 90)', 'oklch(65% 0.18 200)'],
  },
};
