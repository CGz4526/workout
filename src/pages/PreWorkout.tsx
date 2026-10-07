import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Trash2, X, Minus, Plus as PlusIcon, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type TemplateItem } from '../types'
import Header from '../components/Header'

export default function PreWorkout() {
  const navigate = useNavigate()
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []
  const [items, setItems] = useState<TemplateItem[]>([])
  const [selectingExercise, setSelectingExercise] = useState(false)
  const [selectTab, setSelectTab] = useState<BodyPart>('肩')
  const [starting, setStarting] = useState(false)
  const [customName, setCustomName] = useState('')

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)

  const addExercise = (exerciseId: string) => {
    if (items.some((i) => i.exerciseId === exerciseId)) return
    const ex = allExercises.find((e) => e.id === exerciseId)
    setItems([...items, { exerciseId, exerciseName: ex?.name ?? '未知动作', defaultSets: 4, defaultReps: 12 }])
    setSelectingExercise(false)
  }

  const addCustomExercise = async () => {
    const name = customName.trim()
    if (!name) return

    const id = crypto.randomUUID()
    const existing = await db.exercises.toArray()
    const nameExists = existing.find((e) => e.name === name && e.bodyPart === selectTab)
    if (!nameExists) {
      await db.exercises.add({ id, name, bodyPart: selectTab, createdAt: Date.now() })
    }

    setItems([...items, { exerciseId: nameExists?.id ?? id, exerciseName: name, defaultSets: 4, defaultReps: 12 }])
    setCustomName('')
    setSelectingExercise(false)
  }

  const updateItem = (idx: number, field: 'defaultSets' | 'defaultReps', delta: number) => {
    setItems(
      items.map((item, i) =>
        i === idx
          ? { ...item, [field]: Math.max(1, item[field] + delta) }
          : item
      )
    )
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const startWorkout = async () => {
    if (starting || items.length === 0) return
    setStarting(true)

    const existing = await db.sessions.filter((s) => !s.finished).first()
    if (existing) {
      navigate(`/session/${existing.id}`)
      return
    }

    const session = {
      id: crypto.randomUUID(),
      templateName: '自由训练',
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

  return (
    <div className="min-h-screen bg-surface-0 pb-24">
      <Header title="预设动作" showBack />

      <div className="px-4 py-4">
        {items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-secondary text-sm">点击下方添加训练动作</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {items.map((item, idx) => (
              <div key={item.exerciseId} className="flex items-center gap-3 bg-surface-1 rounded-2xl p-4 border border-border">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-accent-light">{idx + 1}</span>
                </div>
                <span className="flex-1 text-primary text-sm font-medium">{item.exerciseName}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateItem(idx, 'defaultSets', -1)} className="p-1 rounded-md text-secondary active:bg-surface-2"><Minus size={14} /></button>
                  <span className="text-primary text-xs w-16 text-center font-mono">{item.defaultSets}×{item.defaultReps}</span>
                  <button onClick={() => updateItem(idx, 'defaultSets', 1)} className="p-1 rounded-md text-secondary active:bg-surface-2"><PlusIcon size={14} /></button>
                </div>
                <button onClick={() => removeItem(idx)} className="p-2 rounded-lg text-muted active:text-red-400 active:bg-red-500/10"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setSelectingExercise(true)}
          className="w-full py-3.5 border border-dashed border-surface-3 rounded-2xl text-secondary text-sm active:bg-surface-1 transition-colors"
        >
          + 添加动作
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

          {/* Custom exercise input */}
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
            {BODY_PARTS.map((bp) => (
              <button
                key={bp}
                onClick={() => setSelectTab(bp)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  selectTab === bp
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-surface-1 text-secondary border border-border'
                }`}
              >
                {bp}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filteredExercises.map((ex) => {
              const disabled = items.some((i) => i.exerciseId === ex.id)
              return (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex.id)}
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
    </div>
  )
}
