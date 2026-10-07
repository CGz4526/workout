import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Shield, Heart, ArrowBigUp, Footprints, Target, Zap, Flame, Minus, Plus, X, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type WorkoutTemplate, type TemplateItem } from '../types'
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
    const t = window.setTimeout(async () => {
      await db.templates.update(template.id, { items })
      setTemplate((prev) => (prev ? { ...prev, items } : prev))
      setSaved(true)
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current)
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 1500)
    }, 400)
    return () => window.clearTimeout(t)
  }, [items, template])

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)

  const addExercise = (exerciseId: string, exerciseName: string) => {
    if (items.some((i) => i.exerciseId === exerciseId)) return
    setItems([...items, { exerciseId, exerciseName, defaultSets: 4, defaultReps: 12 }])
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
    setItems([...items, { exerciseId: exId, exerciseName: n, defaultSets: 4, defaultReps: 12 }])
  }

  const updateItem = (idx: number, field: 'defaultSets' | 'defaultReps', delta: number) => {
    setItems(items.map((item, i) =>
      i === idx ? { ...item, [field]: Math.max(1, item[field] + delta) } : item
    ))
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
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

    const session = {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      date: new Date().toISOString(),
      duration: 0,
      exercises: [] as any[],
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

  const totalSets = items.reduce((s, i) => s + i.defaultSets, 0)
  const bodyPartCounts: Record<string, number> = {}
  for (const item of items) {
    const ex = allExercises.find((e) => e.id === item.exerciseId)
    if (ex) bodyPartCounts[ex.bodyPart] = (bodyPartCounts[ex.bodyPart] || 0) + 1
  }
  const bp = Object.entries(bodyPartCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '肩'
  const meta = BODY_PART_META[bp] ?? BODY_PART_META['肩']
  const Icon = meta.icon

  return (
    <div className="min-h-screen bg-surface-0 pb-24">
      <Header
        title={template.name}
        showBack
        rightAction={saved ? <span className="text-accent-light text-xs">已保存</span> : undefined}
      />

      <div className="px-4 py-6">
        <div className="flex items-center gap-4 mb-2 animate-fade-in">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg`}>
            <Icon size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">{template.name}</h2>
            <p className="text-secondary text-sm mt-0.5">
              {items.length} 个动作 · {totalSets} 组
            </p>
          </div>
        </div>
        <p className="text-muted text-xs mb-5 ml-0.5">调整会自动保存，下次进入即为最新版本</p>

        <div className="space-y-2.5 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {items.map((item, idx) => (
            <div key={item.exerciseId} className="p-4 bg-surface-1 rounded-2xl border border-border">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-secondary">{idx + 1}</span>
                </div>
                <p className="flex-1 min-w-0 text-primary font-medium text-sm truncate">{item.exerciseName}</p>
                <button
                  onClick={() => removeItem(idx)}
                  className="p-1.5 rounded-lg text-muted active:text-red-400 active:bg-red-500/10 transition-colors shrink-0"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex items-center gap-5 mt-3 ml-12">
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">组</span>
                  <button onClick={() => updateItem(idx, 'defaultSets', -1)} className="w-6 h-6 rounded-md bg-surface-2 flex items-center justify-center text-secondary active:bg-surface-3">
                    <Minus size={13} />
                  </button>
                  <span className="text-primary text-sm font-mono w-5 text-center">{item.defaultSets}</span>
                  <button onClick={() => updateItem(idx, 'defaultSets', 1)} className="w-6 h-6 rounded-md bg-surface-2 flex items-center justify-center text-secondary active:bg-surface-3">
                    <Plus size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">次</span>
                  <button onClick={() => updateItem(idx, 'defaultReps', -1)} className="w-6 h-6 rounded-md bg-surface-2 flex items-center justify-center text-secondary active:bg-surface-3">
                    <Minus size={13} />
                  </button>
                  <span className="text-primary text-sm font-mono w-6 text-center">{item.defaultReps}</span>
                  <button onClick={() => updateItem(idx, 'defaultReps', 1)} className="w-6 h-6 rounded-md bg-surface-2 flex items-center justify-center text-secondary active:bg-surface-3">
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => setSelectingExercise(true)}
            className="w-full py-3.5 border border-dashed border-surface-3 rounded-2xl text-secondary text-sm active:bg-surface-1 transition-colors"
          >
            + 添加动作
          </button>
        </div>
      </div>

      <div className="fixed bottom-16 left-0 right-0 p-4 bg-surface-0/80 backdrop-blur-xl border-t border-border">
        <button
          onClick={startWorkout}
          disabled={starting || items.length === 0}
          className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 disabled:from-surface-2 disabled:to-surface-2 disabled:text-muted text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none flex items-center justify-center gap-2"
        >
          <Play size={20} fill="currentColor" />
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
