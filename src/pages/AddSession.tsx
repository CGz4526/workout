import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2, X, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type ExerciseRecord } from '../types'
import Header from '../components/Header'

const toLocalInput = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AddSession() {
  const navigate = useNavigate()
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []

  const [name, setName] = useState('自由训练')
  const [date, setDate] = useState(() => toLocalInput(new Date()))
  const [duration, setDuration] = useState(60)
  const [exercises, setExercises] = useState<ExerciseRecord[]>([])
  const [selectingExercise, setSelectingExercise] = useState(false)
  const [selectTab, setSelectTab] = useState<BodyPart>('肩')
  const [customName, setCustomName] = useState('')

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)

  const addExercise = (exerciseId: string, exerciseName: string) => {
    setExercises([...exercises, {
      exerciseId,
      exerciseName,
      sets: [{ weight: undefined, reps: 12, completed: true }],
    }])
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

    setExercises([...exercises, {
      exerciseId: nameExists?.id ?? id,
      exerciseName: n,
      sets: [{ weight: undefined, reps: 12, completed: true }],
    }])
    setCustomName('')
    setSelectingExercise(false)
  }

  const addSet = (exIdx: number) => {
    setExercises(exercises.map((ex, i) =>
      i === exIdx ? { ...ex, sets: [...ex.sets, { weight: undefined, reps: 12, completed: true }] } : ex
    ))
  }

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises(exercises.map((ex, i) =>
      i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex
    ))
  }

  const updateSet = (exIdx: number, setIdx: number, field: 'weight' | 'reps', value: number | undefined) => {
    setExercises(exercises.map((ex, i) =>
      i === exIdx ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) } : ex
    ))
  }

  const removeExercise = (exIdx: number) => {
    setExercises(exercises.filter((_, i) => i !== exIdx))
  }

  const handleSave = async () => {
    if (exercises.length === 0) return

    await db.sessions.add({
      id: crypto.randomUUID(),
      templateName: name || '自由训练',
      date: new Date(date).toISOString(),
      duration: duration * 60,
      exercises,
      finished: true,
    })

    navigate('/history')
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-8">
      <Header title="添加记录" showBack />

      <div className="px-4 py-4 space-y-4">
        {/* Basic info */}
        <div className="bg-surface-1 rounded-2xl p-4 border border-border">
          <div className="space-y-3">
            <div>
              <label className="text-muted text-xs mb-1.5 block">训练名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：肩训日"
                className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted"
              />
            </div>
            <div>
              <label className="text-muted text-xs mb-1.5 block">训练时间</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-muted text-xs mb-1.5 block">训练时长（分钟）</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min="1"
                className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors font-mono"
              />
            </div>
          </div>
        </div>

        {/* Exercises */}
        <div className="bg-surface-1 rounded-2xl p-4 border border-border">
          <h3 className="text-primary font-semibold text-sm mb-3">训练动作</h3>

          {exercises.length === 0 ? (
            <p className="text-muted text-xs text-center py-4">点击下方添加动作</p>
          ) : (
            <div className="space-y-3 mb-3">
              {exercises.map((ex, exIdx) => (
                <div key={exIdx} className="bg-surface-2 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-primary text-sm font-medium">{ex.exerciseName}</span>
                    <button onClick={() => removeExercise(exIdx)} className="p-1 text-muted active:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {ex.sets.map((set, setIdx) => (
                      <div key={setIdx} className="flex items-center gap-2">
                        <span className="text-muted text-xs w-4">{setIdx + 1}</span>
                        <input
                          type="number"
                          value={set.weight ?? ''}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="重量"
                          className="flex-1 bg-surface-1 text-primary text-center py-1.5 rounded-lg text-xs outline-none border border-border font-mono placeholder:text-muted"
                        />
                        <span className="text-muted text-xs">kg</span>
                        <input
                          type="number"
                          value={set.reps ?? ''}
                          onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="次数"
                          className="flex-1 bg-surface-1 text-primary text-center py-1.5 rounded-lg text-xs outline-none border border-border font-mono placeholder:text-muted"
                        />
                        <span className="text-muted text-xs">次</span>
                        {ex.sets.length > 1 && (
                          <button onClick={() => removeSet(exIdx, setIdx)} className="p-1 text-muted active:text-red-400">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addSet(exIdx)}
                    className="w-full mt-2 py-1.5 border border-dashed border-surface-3 rounded-lg text-muted text-xs active:bg-surface-1 transition-colors"
                  >
                    + 添加一组
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setSelectingExercise(true)}
            className="w-full py-3 border border-dashed border-surface-3 rounded-xl text-secondary text-sm active:bg-surface-2 transition-colors"
          >
            + 添加动作
          </button>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={exercises.length === 0}
          className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 disabled:from-surface-2 disabled:to-surface-2 disabled:text-muted text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
        >
          保存记录
        </button>
      </div>

      {/* Exercise selector */}
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
            {filteredExercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => addExercise(ex.id, ex.name)}
                className="w-full text-left p-4 bg-surface-1 rounded-2xl mb-2 active:bg-surface-2 border border-border transition-all"
              >
                <span className="text-primary text-sm font-medium">{ex.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
