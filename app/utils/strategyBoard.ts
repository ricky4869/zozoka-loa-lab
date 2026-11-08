// 攻略畫板：標註的資料結構、繪製與命中判定。座標一律是截圖的原始像素座標。

export interface Point {
  x: number
  y: number
}

interface AnnotationBase {
  id: string
  color: string
  /** 線條粗細（截圖原始像素） */
  width: number
}

export interface PenAnnotation extends AnnotationBase {
  kind: 'pen'
  points: Point[]
}

export interface ArrowAnnotation extends AnnotationBase {
  kind: 'arrow'
  from: Point
  to: Point
}

export interface RectAnnotation extends AnnotationBase {
  kind: 'rect' | 'ellipse'
  x: number
  y: number
  w: number
  h: number
}

export interface TextAnnotation extends AnnotationBase {
  kind: 'text'
  x: number
  y: number
  text: string
}

export type Annotation = PenAnnotation | ArrowAnnotation | RectAnnotation | TextAnnotation

export type DrawTool = 'pen' | 'arrow' | 'rect' | 'ellipse' | 'text'
export type Tool = DrawTool | 'eraser'

export type StrokeSize = 'thin' | 'medium' | 'thick'

export const boardColors = [
  { name: '紅', value: '#ef4444' },
  { name: '黃', value: '#facc15' },
  { name: '藍', value: '#3b82f6' },
  { name: '綠', value: '#22c55e' },
  { name: '白', value: '#ffffff' }
] as const

const sizeFactor: Record<StrokeSize, number> = { thin: 3, medium: 6, thick: 12 }

/** 粗細以 1920 寬的截圖為基準，等比例套用到其他解析度 */
export function strokeWidthFor(size: StrokeSize, imageWidth: number) {
  return Math.max(1, sizeFactor[size] * (imageWidth / 1920))
}

export function fontSizeFor(width: number) {
  return width * 6
}

export function fontFor(width: number) {
  return `bold ${fontSizeFor(width)}px 'Public Sans', 'Microsoft JhengHei', sans-serif`
}

/** 依起點與目前位置算出框／圓的範圍；square 為 true 時鎖定成正方形／正圓 */
export function boxFromDrag(start: Point, current: Point, square: boolean) {
  let dx = current.x - start.x
  let dy = current.y - start.y
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * side
    dy = Math.sign(dy || 1) * side
  }
  return {
    x: Math.min(start.x, start.x + dx),
    y: Math.min(start.y, start.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy)
  }
}

function arrowHeadLength(width: number) {
  return Math.max(width * 4, 12)
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation) {
  ctx.save()
  ctx.strokeStyle = a.color
  ctx.fillStyle = a.color
  ctx.lineWidth = a.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (a.kind) {
    case 'pen': {
      const [first, ...rest] = a.points
      if (!first) break
      ctx.beginPath()
      ctx.moveTo(first.x, first.y)
      if (rest.length === 0) ctx.lineTo(first.x + 0.01, first.y)
      for (const p of rest) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      break
    }
    case 'arrow': {
      const angle = Math.atan2(a.to.y - a.from.y, a.to.x - a.from.x)
      const head = arrowHeadLength(a.width)
      // 線段收在箭頭底部，避免粗線條從箭頭尖端凸出
      const lineEnd = {
        x: a.to.x - Math.cos(angle) * head * 0.6,
        y: a.to.y - Math.sin(angle) * head * 0.6
      }
      ctx.beginPath()
      ctx.moveTo(a.from.x, a.from.y)
      ctx.lineTo(lineEnd.x, lineEnd.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(a.to.x, a.to.y)
      ctx.lineTo(a.to.x - head * Math.cos(angle - Math.PI / 7), a.to.y - head * Math.sin(angle - Math.PI / 7))
      ctx.lineTo(a.to.x - head * Math.cos(angle + Math.PI / 7), a.to.y - head * Math.sin(angle + Math.PI / 7))
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'rect': {
      ctx.strokeRect(a.x, a.y, a.w, a.h)
      break
    }
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'text': {
      const size = fontSizeFor(a.width)
      ctx.font = fontFor(a.width)
      ctx.textBaseline = 'top'
      ctx.lineWidth = size / 5
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.strokeText(a.text, a.x, a.y)
      ctx.fillText(a.text, a.x, a.y)
      break
    }
  }
  ctx.restore()
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** 判斷點 p 是否碰到標註；tolerance 為額外容許的距離（截圖像素） */
export function hitTest(ctx: CanvasRenderingContext2D, a: Annotation, p: Point, tolerance: number) {
  const reach = a.width / 2 + tolerance

  switch (a.kind) {
    case 'pen': {
      if (a.points.length === 1) return Math.hypot(p.x - a.points[0]!.x, p.y - a.points[0]!.y) <= reach
      for (let i = 1; i < a.points.length; i++) {
        if (distanceToSegment(p, a.points[i - 1]!, a.points[i]!) <= reach) return true
      }
      return false
    }
    case 'arrow':
      return distanceToSegment(p, a.from, a.to) <= Math.max(reach, arrowHeadLength(a.width) / 2)
    case 'rect': {
      const tl = { x: a.x, y: a.y }
      const tr = { x: a.x + a.w, y: a.y }
      const br = { x: a.x + a.w, y: a.y + a.h }
      const bl = { x: a.x, y: a.y + a.h }
      return [[tl, tr], [tr, br], [br, bl], [bl, tl]].some(([s, e]) => distanceToSegment(p, s!, e!) <= reach)
    }
    case 'ellipse': {
      const rx = a.w / 2
      const ry = a.h / 2
      if (rx < 1 || ry < 1) return Math.hypot(p.x - (a.x + rx), p.y - (a.y + ry)) <= reach + Math.max(rx, ry)
      const nx = (p.x - (a.x + rx)) / rx
      const ny = (p.y - (a.y + ry)) / ry
      return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) <= reach
    }
    case 'text': {
      ctx.save()
      ctx.font = fontFor(a.width)
      const textWidth = ctx.measureText(a.text).width
      ctx.restore()
      const height = fontSizeFor(a.width) * 1.2
      return p.x >= a.x - tolerance && p.x <= a.x + textWidth + tolerance
        && p.y >= a.y - tolerance && p.y <= a.y + height + tolerance
    }
  }
}
