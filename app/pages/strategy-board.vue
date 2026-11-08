<script setup lang="ts">
import { loadBoard, saveBoard } from '~/utils/boardStorage'
import {
  boardColors,
  boxFromDrag,
  drawAnnotation,
  fontFor,
  fontSizeFor,
  hitTest,
  strokeWidthFor
} from '~/utils/strategyBoard'
import type { Annotation, Point, StrokeSize, Tool } from '~/utils/strategyBoard'

definePageMeta({
  ssr: false
})

useSeoMeta({
  title: '攻略畫板 - LOA Lab'
})

const toast = useToast()

// ---- 畫板狀態與復原紀錄 ----

interface Screenshot {
  blob: Blob
  bitmap: ImageBitmap
  width: number
  height: number
}

interface BoardState {
  screenshot: Screenshot | null
  annotations: Annotation[]
}

const HISTORY_LIMIT = 100

const history = shallowRef<BoardState[]>([{ screenshot: null, annotations: [] }])
const historyIndex = ref(0)
const current = computed(() => history.value[historyIndex.value]!)
const screenshot = computed(() => current.value.screenshot)
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

function commit(state: BoardState) {
  const next = [...history.value.slice(0, historyIndex.value + 1), state]
  history.value = next.slice(-HISTORY_LIMIT)
  historyIndex.value = history.value.length - 1
}

function undo() {
  if (canUndo.value) historyIndex.value--
}

function redo() {
  if (canRedo.value) historyIndex.value++
}

function addAnnotation(annotation: Annotation) {
  commit({ ...current.value, annotations: [...current.value.annotations, annotation] })
}

function clearAnnotations() {
  if (current.value.annotations.length > 0) commit({ ...current.value, annotations: [] })
}

function clearBoard() {
  if (current.value.screenshot) commit({ screenshot: null, annotations: [] })
}

async function toScreenshot(blob: Blob): Promise<Screenshot> {
  const bitmap = await createImageBitmap(blob)
  return { blob, bitmap, width: bitmap.width, height: bitmap.height }
}

async function loadScreenshot(blob: Blob) {
  try {
    commit({ screenshot: await toScreenshot(blob), annotations: [] })
  } catch {
    toast.add({ title: '無法讀取這張圖片', color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

// ---- 工具設定 ----

const tool = ref<Tool>('pen')
const color = ref<string>(boardColors[0].value)
const size = ref<StrokeSize>('medium')

const toolItems: { value: Tool, label: string, icon: string, key: string }[] = [
  { value: 'pen', label: '畫筆', icon: 'i-lucide-pencil', key: '1' },
  { value: 'arrow', label: '箭頭', icon: 'i-lucide-move-up-right', key: '2' },
  { value: 'rect', label: '框', icon: 'i-lucide-square', key: '3' },
  { value: 'ellipse', label: '圓', icon: 'i-lucide-circle', key: '4' },
  { value: 'text', label: '文字', icon: 'i-lucide-type', key: '5' },
  { value: 'eraser', label: '橡皮擦', icon: 'i-lucide-eraser', key: 'E' }
]

const sizeItems: { value: StrokeSize, label: string }[] = [
  { value: 'thin', label: '細' },
  { value: 'medium', label: '中' },
  { value: 'thick', label: '粗' }
]

function currentStrokeWidth() {
  return strokeWidthFor(size.value, screenshot.value?.width ?? 1920)
}

// ---- 檢視（縮放與移動） ----

const viewportEl = ref<HTMLDivElement>()
const canvasEl = ref<HTMLCanvasElement>()
const fileInputEl = ref<HTMLInputElement>()

const scale = ref(1)
const offset = ref<Point>({ x: 0, y: 0 })
let viewIsFit = true

function fitView() {
  const viewport = viewportEl.value
  const shot = screenshot.value
  if (!viewport || !shot) return
  const s = Math.min(viewport.clientWidth / shot.width, viewport.clientHeight / shot.height)
  scale.value = s
  offset.value = {
    x: (viewport.clientWidth - shot.width * s) / 2,
    y: (viewport.clientHeight - shot.height * s) / 2
  }
  viewIsFit = true
}

function onWheel(e: WheelEvent) {
  if (!screenshot.value || !viewportEl.value) return
  e.preventDefault()
  const rect = viewportEl.value.getBoundingClientRect()
  const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  const oldScale = scale.value
  const newScale = Math.min(16, Math.max(0.05, oldScale * Math.exp(-e.deltaY * 0.0015)))
  offset.value = {
    x: mouse.x - (mouse.x - offset.value.x) * (newScale / oldScale),
    y: mouse.y - (mouse.y - offset.value.y) * (newScale / oldScale)
  }
  scale.value = newScale
  viewIsFit = false
}

const canvasStyle = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${scale.value})`
}))

// ---- 繪製 ----

let draft: Annotation | null = null
let erasedIds = new Set<string>()
let renderFrame = 0

function renderNow() {
  cancelAnimationFrame(renderFrame)
  renderFrame = 0
  const canvas = canvasEl.value
  const shot = screenshot.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !shot || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(shot.bitmap, 0, 0)
  for (const annotation of current.value.annotations) {
    if (!erasedIds.has(annotation.id)) drawAnnotation(ctx, annotation)
  }
  if (draft) drawAnnotation(ctx, draft)
}

function requestRender() {
  if (!renderFrame) renderFrame = requestAnimationFrame(renderNow)
}

watch(screenshot, async (shot, previous) => {
  if (!shot || shot === previous) return
  await nextTick()
  const canvas = canvasEl.value
  if (!canvas) return
  canvas.width = shot.width
  canvas.height = shot.height
  fitView()
  renderNow()
})

watch(current, requestRender)

// ---- 滑鼠操作 ----

type Interaction
  = | { kind: 'pan', last: Point }
    | { kind: 'draw', start: Point }
    | { kind: 'erase' }

let interaction: Interaction | null = null
const isSpaceDown = ref(false)
const isPanning = ref(false)

function toImagePoint(e: PointerEvent): Point {
  const rect = canvasEl.value!.getBoundingClientRect()
  const shot = screenshot.value!
  return {
    x: (e.clientX - rect.left) / rect.width * shot.width,
    y: (e.clientY - rect.top) / rect.height * shot.height
  }
}

function eraseAt(p: Point) {
  const ctx = canvasEl.value?.getContext('2d')
  if (!ctx) return
  const annotations = current.value.annotations
  for (let i = annotations.length - 1; i >= 0; i--) {
    const annotation = annotations[i]!
    if (!erasedIds.has(annotation.id) && hitTest(ctx, annotation, p, 6 / scale.value)) {
      erasedIds.add(annotation.id)
      requestRender()
      return
    }
  }
}

function onPointerDown(e: PointerEvent) {
  // 阻止預設行為：避免中鍵自動捲動，也避免搶走文字輸入框的焦點
  e.preventDefault()

  if (textDraft.value) {
    commitText()
    return
  }

  if (!screenshot.value) {
    if (e.button === 0) fileInputEl.value?.click()
    return
  }

  if (e.button === 1 || (e.button === 0 && isSpaceDown.value)) {
    interaction = { kind: 'pan', last: { x: e.clientX, y: e.clientY } }
    isPanning.value = true
  } else if (e.button === 0) {
    const p = toImagePoint(e)
    const id = crypto.randomUUID()
    const base = { id, color: color.value, width: currentStrokeWidth() }

    switch (tool.value) {
      case 'text':
        startText(p)
        return
      case 'eraser':
        interaction = { kind: 'erase' }
        erasedIds = new Set()
        eraseAt(p)
        break
      case 'pen':
        interaction = { kind: 'draw', start: p }
        draft = { ...base, kind: 'pen', points: [p] }
        break
      case 'arrow':
        interaction = { kind: 'draw', start: p }
        draft = { ...base, kind: 'arrow', from: p, to: p }
        break
      case 'rect':
      case 'ellipse':
        interaction = { kind: 'draw', start: p }
        draft = { ...base, kind: tool.value, x: p.x, y: p.y, w: 0, h: 0 }
        break
    }
    requestRender()
  } else {
    return
  }

  viewportEl.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!interaction) return

  if (interaction.kind === 'pan') {
    offset.value = {
      x: offset.value.x + e.clientX - interaction.last.x,
      y: offset.value.y + e.clientY - interaction.last.y
    }
    interaction.last = { x: e.clientX, y: e.clientY }
    viewIsFit = false
    return
  }

  if (interaction.kind === 'erase') {
    for (const event of e.getCoalescedEvents?.() ?? [e]) eraseAt(toImagePoint(event))
    return
  }

  if (!draft) return
  const p = toImagePoint(e)
  if (draft.kind === 'pen') {
    for (const event of e.getCoalescedEvents?.() ?? [e]) draft.points.push(toImagePoint(event))
  } else if (draft.kind === 'arrow') {
    draft.to = p
  } else if (draft.kind === 'rect' || draft.kind === 'ellipse') {
    Object.assign(draft, boxFromDrag(interaction.start, p, e.shiftKey))
  }
  requestRender()
}

function onPointerUp() {
  if (!interaction) return

  if (interaction.kind === 'erase' && erasedIds.size > 0) {
    const removed = erasedIds
    erasedIds = new Set()
    commit({ ...current.value, annotations: current.value.annotations.filter(a => !removed.has(a.id)) })
  } else if (interaction.kind === 'draw' && draft) {
    const finished = draft
    draft = null
    // 只是點一下沒拖曳的箭頭／框／圓不算數
    const minSize = 2 / scale.value
    const tooSmall
      = (finished.kind === 'arrow' && Math.hypot(finished.to.x - finished.from.x, finished.to.y - finished.from.y) < minSize)
        || ((finished.kind === 'rect' || finished.kind === 'ellipse') && (finished.w < minSize || finished.h < minSize))
    if (!tooSmall) addAnnotation(finished)
  }

  interaction = null
  isPanning.value = false
  requestRender()
}

const cursorClass = computed(() => {
  if (!screenshot.value) return 'cursor-pointer'
  if (isPanning.value) return 'cursor-grabbing'
  if (isSpaceDown.value) return 'cursor-grab'
  if (tool.value === 'text') return 'cursor-text'
  if (tool.value === 'eraser') return 'cursor-cell'
  return 'cursor-crosshair'
})

// ---- 文字工具 ----

const textDraft = ref<{ x: number, y: number, value: string, color: string, width: number } | null>(null)
const textInputEl = ref<HTMLInputElement>()

function startText(p: Point) {
  textDraft.value = { x: p.x, y: p.y, value: '', color: color.value, width: currentStrokeWidth() }
  nextTick(() => textInputEl.value?.focus())
}

function commitText() {
  const draftText = textDraft.value
  if (!draftText) return
  textDraft.value = null
  const text = draftText.value.trim()
  if (!text) return
  addAnnotation({
    id: crypto.randomUUID(),
    kind: 'text',
    x: draftText.x,
    y: draftText.y,
    text,
    color: draftText.color,
    width: draftText.width
  })
}

function cancelText() {
  textDraft.value = null
}

const textInputStyle = computed(() => {
  const draftText = textDraft.value
  if (!draftText) return {}
  const fontSize = fontSizeFor(draftText.width) * scale.value
  return {
    left: `${offset.value.x + draftText.x * scale.value}px`,
    top: `${offset.value.y + draftText.y * scale.value}px`,
    font: fontFor(draftText.width).replace(/[\d.]+px/, `${fontSize}px`),
    color: draftText.color,
    textShadow: '0 0 3px #000, 0 0 3px #000'
  }
})

// ---- 放入截圖 ----

function firstImage(files: FileList | null | undefined) {
  return Array.from(files ?? []).find(file => file.type.startsWith('image/'))
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = firstImage(input.files)
  if (file) loadScreenshot(file)
  input.value = ''
}

const isDragOver = ref(false)

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const file = firstImage(e.dataTransfer?.files)
  if (file) loadScreenshot(file)
}

function onPaste(e: ClipboardEvent) {
  if (isTyping(e.target)) return
  const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
  const file = item?.getAsFile()
  if (!file) return
  e.preventDefault()
  loadScreenshot(file)
}

// ---- 匯出 ----

function exportBlob() {
  renderNow()
  return new Promise<Blob>((resolve, reject) => {
    canvasEl.value!.toBlob(blob => (blob ? resolve(blob) : reject(new Error('匯出失敗'))), 'image/png')
  })
}

async function copyImage() {
  if (!screenshot.value) return
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportBlob() })])
    toast.add({ title: '已複製圖片到剪貼簿', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: '複製失敗，請改用下載', color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

async function downloadImage() {
  if (!screenshot.value) return
  const url = URL.createObjectURL(await exportBlob())
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  link.href = url
  link.download = `loa-board-${stamp}.png`
  link.click()
  URL.revokeObjectURL(url)
}

// ---- 快捷鍵 ----

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping(e.target) || interaction) return
  const key = e.key.toLowerCase()

  if (e.ctrlKey || e.metaKey) {
    if (key === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      e.preventDefault()
      redo()
    } else if (key === 'c' && screenshot.value && !window.getSelection()?.toString()) {
      e.preventDefault()
      copyImage()
    } else if (key === 's') {
      e.preventDefault()
      downloadImage()
    }
    return
  }

  if (e.altKey) return

  if (key === ' ') {
    e.preventDefault()
    isSpaceDown.value = true
    return
  }

  const item = toolItems.find(t => t.key.toLowerCase() === key)
  if (item) tool.value = item.value
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') isSpaceDown.value = false
}

function onWindowBlur() {
  isSpaceDown.value = false
}

// ---- 保存最後一塊畫板 ----

let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

watch(current, (state) => {
  if (!loaded) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const board = state.screenshot ? { screenshot: state.screenshot.blob, annotations: state.annotations } : null
    saveBoard(board).catch(() => {
      toast.add({ title: '畫板保存失敗', color: 'warning', icon: 'i-lucide-triangle-alert' })
    })
  }, 300)
})

let resizeObserver: ResizeObserver | undefined

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('paste', onPaste)
  viewportEl.value?.addEventListener('wheel', onWheel, { passive: false })
  resizeObserver = new ResizeObserver(() => {
    if (viewIsFit) fitView()
  })
  if (viewportEl.value) resizeObserver.observe(viewportEl.value)

  try {
    const stored = await loadBoard()
    // 載入期間若已經貼上新截圖，就不要蓋掉
    if (stored && !screenshot.value) {
      history.value = [{ screenshot: await toScreenshot(stored.screenshot), annotations: stored.annotations }]
      historyIndex.value = 0
    }
  } catch {
    // 讀不到舊畫板就從空白開始
  }
  loaded = true
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('paste', onPaste)
  viewportEl.value?.removeEventListener('wheel', onWheel)
  resizeObserver?.disconnect()
  cancelAnimationFrame(renderFrame)
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex items-center gap-1">
        <UTooltip
          v-for="item in toolItems"
          :key="item.value"
          :text="item.label"
          :kbds="[item.key]"
        >
          <UButton
            :icon="item.icon"
            :aria-label="item.label"
            :color="tool === item.value ? 'primary' : 'neutral'"
            :variant="tool === item.value ? 'solid' : 'ghost'"
            @click="tool = item.value"
          />
        </UTooltip>
      </div>

      <USeparator
        orientation="vertical"
        class="h-6"
      />

      <div class="flex items-center gap-1.5">
        <button
          v-for="c in boardColors"
          :key="c.value"
          type="button"
          :aria-label="`${c.name}色`"
          class="size-6 rounded-full border border-default ring-offset-2 ring-offset-default transition"
          :class="color === c.value ? 'ring-2 ring-primary' : 'hover:scale-110'"
          :style="{ backgroundColor: c.value }"
          @click="color = c.value"
        />
      </div>

      <USeparator
        orientation="vertical"
        class="h-6"
      />

      <div class="flex items-center gap-1">
        <UButton
          v-for="s in sizeItems"
          :key="s.value"
          :label="s.label"
          size="sm"
          :color="size === s.value ? 'primary' : 'neutral'"
          :variant="size === s.value ? 'soft' : 'ghost'"
          @click="size = s.value"
        />
      </div>

      <USeparator
        orientation="vertical"
        class="h-6"
      />

      <div class="flex items-center gap-1">
        <UTooltip
          text="復原"
          :kbds="['ctrl', 'Z']"
        >
          <UButton
            icon="i-lucide-undo-2"
            aria-label="復原"
            color="neutral"
            variant="ghost"
            :disabled="!canUndo"
            @click="undo"
          />
        </UTooltip>
        <UTooltip
          text="重做"
          :kbds="['ctrl', 'shift', 'Z']"
        >
          <UButton
            icon="i-lucide-redo-2"
            aria-label="重做"
            color="neutral"
            variant="ghost"
            :disabled="!canRedo"
            @click="redo"
          />
        </UTooltip>
        <UTooltip text="清除標註">
          <UButton
            icon="i-lucide-trash-2"
            aria-label="清除標註"
            color="neutral"
            variant="ghost"
            :disabled="current.annotations.length === 0"
            @click="clearAnnotations"
          />
        </UTooltip>
        <UTooltip text="清除畫板（截圖和標註）">
          <UButton
            icon="i-lucide-square-x"
            aria-label="清除畫板"
            color="neutral"
            variant="ghost"
            :disabled="!screenshot"
            @click="clearBoard"
          />
        </UTooltip>
      </div>

      <USeparator
        orientation="vertical"
        class="h-6"
      />

      <div class="flex items-center gap-1">
        <UTooltip text="符合視窗">
          <UButton
            icon="i-lucide-scan"
            aria-label="符合視窗"
            color="neutral"
            variant="ghost"
            :disabled="!screenshot"
            @click="fitView"
          />
        </UTooltip>
        <UTooltip text="換一張截圖">
          <UButton
            icon="i-lucide-image-plus"
            aria-label="換一張截圖"
            color="neutral"
            variant="ghost"
            @click="fileInputEl?.click()"
          />
        </UTooltip>
      </div>

      <div class="ms-auto flex items-center gap-2">
        <UTooltip
          text="複製圖片"
          :kbds="['ctrl', 'C']"
        >
          <UButton
            icon="i-lucide-copy"
            label="複製"
            color="neutral"
            variant="outline"
            :disabled="!screenshot"
            @click="copyImage"
          />
        </UTooltip>
        <UTooltip
          text="下載 PNG"
          :kbds="['ctrl', 'S']"
        >
          <UButton
            icon="i-lucide-download"
            label="下載"
            :disabled="!screenshot"
            @click="downloadImage"
          />
        </UTooltip>
      </div>
    </div>

    <div
      ref="viewportEl"
      class="relative min-h-80 flex-1 touch-none overflow-hidden rounded-lg border bg-elevated/50 select-none"
      :class="[cursorClass, isDragOver ? 'border-primary' : 'border-default']"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <canvas
        v-show="screenshot"
        ref="canvasEl"
        class="absolute top-0 left-0 origin-top-left"
        :style="canvasStyle"
      />

      <input
        v-if="textDraft"
        ref="textInputEl"
        v-model="textDraft.value"
        class="absolute min-w-8 bg-transparent leading-none outline-1 outline-white/60 outline-dashed [field-sizing:content]"
        :style="textInputStyle"
        @pointerdown.stop
        @keydown.enter.prevent="commitText"
        @keydown.esc.prevent="cancelText"
        @blur="commitText"
      >

      <div
        v-if="!screenshot"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted"
      >
        <UIcon
          name="i-lucide-image-plus"
          class="size-12"
        />
        <p class="text-lg font-medium text-default">
          Ctrl+V 貼上截圖
        </p>
        <p class="text-sm">
          或把圖片拖進來、點這裡選擇檔案
        </p>
      </div>
    </div>

    <input
      ref="fileInputEl"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileChange"
    >
  </div>
</template>
