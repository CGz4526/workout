import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Shield, Heart, ArrowBigUp, Footprints, Target, Zap, Flame, Plus, X, Check, GripVertical } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type WorkoutTemplate, type TemplateItem, type WorkoutSession } from '../types'
import Header from '../components/Header'

const BODY_PART_META: Record<string, { gradient: string; icon: React.ElementType }> = {
  '肩':   { gradient: 'from-orange-500 to-amber-500', icon: Shield },
  '胸':   { gradient: 'from-red-500 to-rose-500',     icon: Heart },
  '背':   { gradient: 'from-blue-500 to-cyan-500',    icon: ArrowBigUp },
  '腿':   { gradient: 'from-purple-500 to-violet-500', icon: Footprints },
  '二头': { gradient: 'from-pink-500 to-fuchsia-500',  icon: Target },
  '三头': { gradient: 'from-teal-500 to-emerald-500',  icon: Zap },
  '核心': { gradient: 'from-yellow-500 to-orange-500', icon: Flame },
}

// Volume is not editable here any more — a template is just a list of exercises.
// Sets/reps are adjusted per session on the pre-workout screen.
const DEFAULT_SETS = 4
const DEFAULT_REPS = 12

// 拖拽调序的状态。列表行高一致，所以目标槽位可以直接由位移除以 step 算出来。
type DragMeta = {
  startY: number
  dy: number
  index: number
  target: number
  step: number
  count: number
}

export default function TemplateDetail() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [items, setItems] = useState<TemplateItem[]>([])
  const [starting, setStarting] = useState(false)
  const [saved, setSaved] = useState(false)
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []

  const [selectingExercise, setSelectingExercise] = useState(false)
  const [selectTab, setSelectTab] = useState<BodyPart>('肩')
  const [customName, setCustomName] = useState('')
  const savedTimerRef = useRef<number | null>(null)
  // Holds the not-yet-written edit so it can be flushed if the user leaves
  // before the 400ms debounce fires.
  const pendingRef = useRef<{ id: string; items: TemplateItem[] } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // 拖动过程中的权威数据放 ref：pointerup 可能早于最后一次 pointermove 的
  // 重渲染落地，读 state 会拿到过期的 target。
  const dragMetaRef = useRef<DragMeta | null>(null)
  const [drag, setDrag] = useState<DragMeta | null>(null)

  useEffect(() => {
    if (templateId) {
      db.templates.get(templateId).then((t) => {
        if (t) {
          setTemplate(t)
          setItems([...t.items])
        } else {
          navigate('/')
        }
      })
    }
  }, [templateId])

  // Auto-save edits back to the template so changes persist long-term
  useEffect(() => {
    if (!template) return
    if (JSON.stringify(items) === JSON.stringify(template.items)) return
    pendingRef.current = { id: template.id, items }
    const t = window.setTimeout(async () => {
      await db.templates.update(template.id, { items })
      pendingRef.current = null
      setTemplate((prev) => (prev ? { ...prev, items } : prev))
      setSaved(true)
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 1500)
    }, 400)
    return () => window.clearTimeout(t)
  }, [items, template])

  // Leaving within the debounce window must not silently drop the edit.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current
      if (pending) {
        pendingRef.current = null
        db.templates.update(pending.id, { items: pending.items })
      }
    }
  }, [])

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)

  const addExercise = (exerciseId: string, exerciseName: string) => {
    if (items.some((i) => i.exerciseId === exerciseId)) return
    setItems([...items, { exerciseId, exerciseName, defaultSets: DEFAULT_SETS, defaultReps: DEFAULT_REPS }])
    setSelectingExercise(false)
  }

  const addCustomExercise = async () => {
    const n = customName.trim()
    if (!n) return

    const id = crypto.randomUUID()
    const existing = await db.exercises.toArray()
    const nameExists = existing.find((e) => e.name === n && e.bodyPart === selectTab)
    if (!nameExists) {
      await db.exercises.add({ id, name: n, bodyPart: selectTab, createdAt: Date.now() })
    }

    const exId = nameExists?.id ?? id
    setCustomName('')
    setSelectingExercise(false)
    if (items.some((i) => i.exerciseId === exId)) return
    setItems([...items, { exerciseId: exId, exerciseName: n, defaultSets: DEFAULT_SETS, defaultReps: DEFAULT_REPS }])
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  // ---- 拖拽调序（Pointer Events）----
  // 不能用 HTML5 drag-and-drop：移动端浏览器基本不触发。Pointer Events 触屏和鼠标通吃。
  // 只在手柄上监听 pointerdown，列表其余部分仍可正常滚动。
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, idx: number) => {
    if (items.length < 2) return
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
    if (rows.length < 2) return

    // 量一次原始位置。transform 不影响布局，所以拖动期间这些值一直有效。
    const rects = rows.map((r) => r.getBoundingClientRect())
    const step = rects[1].top - rects[0].top
    if (!(step > 0)) return

    dragMetaRef.current = { startY: e.clientY, dy: 0, index: idx, target: idx, step, count: rows.length }
    setDrag(dragMetaRef.current)
    // 捕获指针，手指移出手柄范围后仍能收到 move / up
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const meta = dragMetaRef.current
    if (!meta) return
    meta.dy = e.clientY - meta.startY
    // 行高一致，所以目标槽位可以直接由位移算出来
    meta.target = Math.max(0, Math.min(meta.count - 1, Math.round(meta.index + meta.dy / meta.step)))
    setDrag({ ...meta })
  }

  const endDrag = () => {
    const meta = dragMetaRef.current
    dragMetaRef.current = null
    setDrag(null)
    if (!meta || meta.target === meta.index) return
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(meta.index, 1)
      next.splice(meta.target, 0, moved)
      return next
    })
  }

  // 被系统手势打断时不要提交，直接还原
  const cancelDrag = () => {
    dragMetaRef.current = null
    setDrag(null)
  }

  const startWorkout = async () => {
    if (starting || items.length === 0 || !template) return
    setStarting(true)

    // Make sure the latest edits are persisted before starting
    await db.templates.update(template.id, { items })

    const existing = await db.sessions.filter((s) => !s.finished).first()
    if (existing) {
      navigate(`/session/${existing.id}`)
      return
    }

    const session: WorkoutSession = {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      date: new Date().toISOString(),
      duration: 0,
      exercises: [],
      finished: false,
      startTime: Date.now(),
    }

    await db.sessions.add(session)
    sessionStorage.setItem(`preset-${session.id}`, JSON.stringify(items))
    navigate(`/session/${session.id}`)
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  const exerciseById = new Map(allExercises.map((e) => [e.id, e]))
  const bodyPartCounts: Record<string, number> = {}
  for (const item of items) {
    const ex = exerciseById.get(item.exerciseId)
    if (ex) bodyPartCounts[ex.bodyPart] = (bodyPartCounts[ex.bodyPart] || 0) + 1
  }
  const bp = Object.entries(bodyPartCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '肩'
  const meta = BODY_PART_META[bp] ?? BODY_PART_META['肩']
  const Icon = meta.icon

  return (
    <div className="min-h-screen bg-surface-0 pb-48">
      <Header
        title={template.name}
        showBack
        rightAction={
          saved ? (
            <span className="flex items-center gap-1 text-accent-light text-xs font-medium">
              <Check size={13} />
              已保存
            </span>
          ) : undefined
        }
      />

      <div className="px-4 pt-5">
        {/* Hero */}
        <div className="flex items-center gap-4 animate-fade-in">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg shadow-black/25 shrink-0`}>
            <Icon size={26} className="text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-primary truncate">{template.name}</h2>
            <p className="text-secondary text-sm mt-0.5">{items.length} 个动作</p>
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between mt-7 mb-3 px-0.5">
          <h3 className="text-muted text-[11px] font-semibold tracking-widest">动作列表</h3>
          <span className="text-muted text-[11px]">拖动左侧手柄调序 · 自动保存</span>
        </div>

        {/* Exercise list */}
        <div ref={listRef} className={`space-y-2 ${drag ? 'select-none' : ''}`}>
          {items.map((item, idx) => {
            const ex = exerciseById.get(item.exerciseId)
            const isDragging = drag?.index === idx
            // 起点与目标槽位之间的行让位：整体上移或下移一格。
            let shift = 0
            if (drag && !isDragging) {
              if (drag.index < drag.target && idx > drag.index && idx <= drag.target) shift = -drag.step
              else if (drag.index > drag.target && idx >= drag.target && idx < drag.index) shift = drag.step
            }
            // 序号要显示「松手后会落在第几位」，显示当前位置会骗人
            const shownIdx = isDragging ? drag.target : shift < 0 ? idx - 1 : shift > 0 ? idx + 1 : idx
            return (
              <div
                key={item.exerciseId}
                data-row
                className={`rounded-xl border ${
                  isDragging
                    ? 'bg-surface-2 border-accent/40 shadow-lg shadow-black/25'
                    : 'bg-surface-1 border-border'
                }`}
                style={{
                  // 拖拽用 transform，不动布局，所以量到的行位置在整个拖动过程中都成立
                  transform: isDragging ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift}px)` : undefined,
                  transition: isDragging ? 'none' : 'transform 160ms ease',
                  zIndex: isDragging ? 10 : undefined,
                  position: isDragging ? 'relative' : undefined,
                }}
              >
                {/* 入场动画放在内层：animate-fade-in 的 fill-mode 会一直占着
                    transform，放在外层会把拖拽的 translateY 顶掉 */}
                <div
                  className="flex items-center gap-2 pl-2 pr-1.5 py-3 animate-fade-in"
                  style={{ animationDelay: `${Math.min(idx, 8) * 0.03}s` }}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => startDrag(e, idx)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={cancelDrag}
                    aria-label={`拖动调整 ${item.exerciseName} 的顺序`}
                    className="shrink-0 p-1 -ml-0.5 rounded-lg text-muted active:text-secondary cursor-grab active:cursor-grabbing"
                    style={{ touchAction: 'none' }}
                  >
                    <GripVertical size={16} />
                  </button>
                  <span className="w-5 text-center text-xs font-mono text-muted shrink-0">{shownIdx + 1}</span>
                  <span className="flex-1 min-w-0 text-primary text-sm font-medium truncate">{item.exerciseName}</span>
                  {ex && (
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent-light border border-accent/15">
                      {ex.bodyPart}
                    </span>
                  )}
                  <button
                    onClick={() => removeItem(idx)}
                    aria-label={`删除 ${item.exerciseName}`}
                    className="shrink-0 p-1.5 rounded-lg text-muted active:text-red-400 active:bg-red-500/10 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )
          })}

          {items.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-secondary text-sm">还没有动作</p>
              <p className="text-muted text-xs mt-1">点击下方按钮添加</p>
            </div>
          )}

          <button
            onClick={() => setSelectingExercise(true)}
            className="w-full flex items-center justify-center gap-1.5 py-3.5 border border-dashed border-surface-3 rounded-xl text-secondary text-sm active:bg-surface-1 transition-colors"
          >
            <Plus size={16} />
            添加动作
          </button>
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-4 py-3 bg-surface-0/85 backdrop-blur-xl border-t border-border">
        <button
          onClick={startWorkout}
          disabled={starting || items.length === 0}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 disabled:from-surface-2 disabled:to-surface-2 disabled:text-muted text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none flex items-center justify-center gap-2"
        >
          <Play size={18} fill="currentColor" />
          {starting ? '启动中...' : '开始训练'}
        </button>
      </div>

      {selectingExercise && (
        <div className="fixed inset-0 z-50 bg-surface-0 flex flex-col animate-scale-in">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-surface-0/80 backdrop-blur-xl">
            <h3 className="text-primary font-semibold">选择动作</h3>
            <button onClick={() => { setSelectingExercise(false); setCustomName('') }} className="p-1.5 rounded-lg active:bg-surface-2">
              <X size={22} className="text-secondary" />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomExercise()}
                placeholder="输入自定义动作名称"
                className="flex-1 bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted"
              />
              <button
                onClick={addCustomExercise}
                disabled={!customName.trim()}
                className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center active:bg-accent/20 disabled:opacity-30"
              >
                <Check size={18} className="text-accent-light" />
              </button>
            </div>
          </div>

          <div className="flex overflow-x-auto gap-2 px-4 py-3 border-b border-border no-scrollbar">
            {BODY_PARTS.map((b) => (
              <button
                key={b}
                onClick={() => setSelectTab(b)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  selectTab === b
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-surface-1 text-secondary border border-border'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filteredExercises.map((ex) => {
              const disabled = items.some((i) => i.exerciseId === ex.id)
              return (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex.id, ex.name)}
                  disabled={disabled}
                  className="w-full text-left p-4 bg-surface-1 rounded-2xl mb-2 disabled:opacity-30 active:bg-surface-2 border border-border transition-all"
                >
                  <span className="text-primary text-sm font-medium">{ex.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
