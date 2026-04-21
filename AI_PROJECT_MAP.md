# Locus Project Map

## Read Order

1. `Locus.html`
2. `src/locus-math.js`
3. `src/locus-shared.js`
4. `src/locus-ui.js`
5. `src/locus-app.js`
6. `styles.css`

`Locus.html` 只加载本地 `vendor/` 下的 React 运行时，然后按 `math -> shared -> ui -> app` 的顺序挂全局对象。

## Runtime Contracts

### `window.LocusMath`

表达式编译器，唯一职责是把字符串转成统一的曲线对象。

- `parse(src)`: 生成 AST。
- `compile(src)`: 返回编译结果。

编译结果的稳定结构：

```js
{
  kind: "explicit" | "implicit" | "parametric" | "polar",
  parameters: string[],
  getRanges(params): { x?: { min, max }, y?: { min, max }, t?: { min, max }, theta?: { min, max } },
  evaluate(...)
}
```

`evaluate` 的调用方式按 `kind` 区分：

- `explicit`: `evaluate(x, params)`
- `implicit`: `evaluate(x, y, params)`
- `parametric`: `evaluate(parameterValue, params)`，返回 `{ x, y, parameterValue } | null`
- `polar`: `evaluate(parameterValue, params)`，返回 `{ x, y, parameterValue, r } | null`

## Module Map

### `Locus.html`

入口壳文件，只负责：

- 提供 `#root`
- 加载 React 和四个运行模块
- 不包含业务逻辑

### `src/locus-math.js`

表达式语言和曲线编译层。

函数分块：

- 预处理与拆句
  - `normalizeInput`
  - `splitTopLevel`
  - `parseRangeStatement`
  - `parseAssignmentStatement`
- 词法与语法分析
  - `tokenize`
  - `parse`
- AST 求值
  - `evalNode`
  - `buildEvaluator`
- 变量与范围提取
  - `collectVariables`
  - `collectRangeVariables`
  - `buildRangeResolvers`
  - `resolveRanges`
  - `inResolvedRange`
- 编译入口
  - `window.LocusMath.compile`

这里是新数学能力的第一落点。新增曲线类型、参数变量、范围语法，先改这个文件。

### `src/locus-shared.js`

纯计算和绘图辅助层，不直接管 React 状态。

函数分块：

- 视图与参数清洗
  - `clampViewScale`
  - `sanitizeView`
  - `defaultParameterConfig`
  - `sanitizeParameterConfig`
- 数字与标签格式化
  - `formatDecimalNumber`
  - `formatExactNumber`
  - `formatCoordinateValue`
  - `formatPointLabel`
  - `getPointKey`
  - `formatFnLabel`
  - `formatTangentLabel`
- 曲线类型与范围读取
  - `inferCurveKindFromExpr`
  - `getCurveAxisRange`
- 显函数/参数曲线采样
  - `samplePolylineWorldPoints`
  - `buildVisiblePolylineCurves`
- 隐函数采样
  - `getImplicitSampleGrid`
  - `sampleImplicitSegments`
  - `sampleVisibleImplicitCurves`
- 特征点与交点
  - `computeSpecialPoints`
  - `segmentIntersection`
  - `refineImplicitIntersection`
  - `dedupePoints`
- 几何辅助
  - `closestPointOnSegment`
- 切线
  - `differentiateExplicit`
  - `differentiateImplicit`
  - `differentiateSampledCurve`
  - `getTangentLine`

这个文件是 UI 和数学编译层之间的中间层。采样、交点、切线、坐标格式都在这里统一。

### `src/locus-ui.js`

所有可视化和交互组件都在这里，通过 `window.LocusUI` 暴露给 app 层。

函数分块：

- 轻量展示辅助
  - `renderExpressionPreview`
  - 图标组件
- 主画布
  - `PlotCanvas`

`PlotCanvas` 内部负责：

- 画布尺寸监听
- 世界坐标和屏幕坐标转换
- 折线曲线和隐函数曲线的可见样本构造
- 特征点悬停与吸附
- 拖拽、缩放、双指手势
- 曲线追踪信息上报
- 实际 canvas 绘制

- 侧栏与输入面板
  - `ExamplesPage`
  - `ParameterControl`
  - `ExpandedSidebarInner`
  - `CollapsedRailInner`
  - `SidebarShell`

侧栏只做输入、展示和回调分发，不做数学计算。

### `src/locus-app.js`

顶层状态编排层。

函数分块：

- 本地持久化与默认值
  - `restoreFunctions`
  - `createDefaultFunctions`
  - `clampSidebarWidth`
  - `useStoredState`
- 顶层应用
  - `App`

`App` 负责：

- 初始化持久化状态
  - 主题
  - 坐标显示模式
  - 参数滑块配置
  - 函数列表
  - 视图
  - 切线点
  - 侧栏宽度与折叠状态
- 把函数表达式编译成 `compiledFunctions`
- 收集所有参数名并补全默认滑块配置
- 在主题切换时同步曲线颜色
- 提供侧栏和画布需要的回调
  - 增删改函数
  - 套用示例
  - 适配视图
  - 导出 PNG
  - 更新参数

`App` 不做底层几何运算，只做状态协调。

### `styles.css`

补充静态样式，主要是：

- 侧栏动画
- 示例卡片/表达式 token 样式
- 交互过渡

## Core Data Shapes

### Function Item

运行期函数对象至少包含：

```js
{
  id,
  expr,
  visible,
  color,
  thickness,
  labelSeq,
  label
}
```

编译后会追加：

```js
{
  curveKind,
  compiled,
  error
}
```

### Tangent Point

```js
{
  id,
  fnId,
  x,
  y,
  seq,
  parameterValue?
}
```

### View

```js
{
  cx,
  cy,
  scaleX,
  scaleY
}
```

## Change Guide

- 加新语法或新曲线：先看 `src/locus-math.js`
- 改采样、交点、切线、坐标格式：看 `src/locus-shared.js`
- 改画布交互或侧栏结构：看 `src/locus-ui.js`
- 改状态流、持久化、模块装配：看 `src/locus-app.js`

## Current Structure Notes

- 当前运行链路只使用 `src/*.js`
- 旧的 `.jsx` 副本已经移除，避免和实际入口产生双份源文件
