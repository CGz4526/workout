import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, X, Clock, Dumbbell, ListChecks, Plus, Trash2, Check, Route } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type ExerciseRecord } from '../types'
import Header from '../components/Header'

const MAX_PHOTOS = 3

const toLocalInput = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []

  const [session, setSession] = useState<any>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const [weight, setWeight] = useState<string>('')
  const [duration, setDuration] = useState<string>('')
  const [distance, setDistance] = useState<string>('')
  const [date, setDate] = useState<string>('')
  const [exercises, setExercises] = useState<ExerciseRecord[]>([])
  const [editing, setEditing] = useState(false)
  const [selectingExercise, setSelectingExercise] = useState(false)
  const [selectTab, setSelectTab] = useState<BodyPart>('肩')
  const [customName, setCustomName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)
  const isAerobic = session?.aerobic === true

  useEffect(() => {
    if (sessionId) {
      db.sessions.get(sessionId).then((s) => {
        if (s) {
          setSession(s)
          setPhotos(s.photos ?? [])
          setWeight(s.weight?.toString() ?? '')
          setDuration(Math.floor(s.duration / 60).toString())
          setDistance(s.distance?.toString() ?? '')
          setDate(toLocalInput(new Date(s.date)))
          setExercises(s.exercises)
        } else {
          navigate('/history')
        }
      })
    }
  }, [sessionId])

  const saveSession = async () => {
    if (!sessionId) return
    await db.sessions.update(sessionId, {
      exercises,
      templateName: session.templateName,
      duration: Number(duration) * 60,
      weight: weight ? Number(weight) : undefined,
      distance: distance ? Number(distance) : undefined,
      date: new Date(date).toISOString(),
    })
    setEditing(false)
  }

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

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}时${m}分${s > 0 ? s + '秒' : ''}`
    if (m === 0) return `${s}秒`
    return `${m}分${s > 0 ? s + '秒' : ''}`
  }

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const maxSize = 800
          let width = img.width
          let height = img.height

          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize
              width = maxSize
            } else {
              width = (width / height) * maxSize
              height = maxSize
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.7))
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const handleAddPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0 || !sessionId) return

    const remaining = MAX_PHOTOS - photos.length
    const toAdd = files.slice(0, remaining)

    const compressed = await Promise.all(toAdd.map(compressImage))
    const newPhotos = [...photos, ...compressed]

    await db.sessions.update(sessionId, { photos: newPhotos })
    setPhotos(newPhotos)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeletePhoto = async (idx: number) => {
    if (!sessionId) return
    const newPhotos = photos.filter((_, i) => i !== idx)

    await db.sessions.update(sessionId, { photos: newPhotos })
    setPhotos(newPhotos)
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)

  return (
    <div className="min-h-screen bg-surface-0 pb-8">
      <Header
        title={editing ? '编辑记录' : '训练详情'}
        showBack
        rightAction={
          editing ? (
            <button onClick={saveSession} className="text-accent-light text-sm font-medium">
              保存
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="text-accent-light text-sm font-medium">
              编辑
            </button>
          )
        }
      />

      <div className="px-4 py-4">
        {/* Summary */}
        <div className="bg-surface-1 rounded-2xl p-5 border border-border mb-4 animate-fade-in">
          {editing ? (
            <div className="space-y-3 mb-3">
              <input
                value={session.templateName ?? ''}
                onChange={(e) => setSession({ ...session, templateName: e.target.value })}
                placeholder="训练名称"
                className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted"
              />
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors"
              />
            </div>
          ) : (
            <h2 className="text-lg font-bold text-primary mb-3">{session.templateName ?? '自由训练'}</h2>
          )}
          <div className={`gap-3 ${isAerobic ? 'grid grid-cols-2' : 'grid grid-cols-3'}`}>
            <div className="text-center">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
                <Clock size={16} className="text-accent-light" />
              </div>
              {editing ? (
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-12 bg-surface-2 text-primary text-center py-1 rounded-lg text-sm outline-none border border-border font-mono"
                  />
                  <span className="text-muted text-xs">分</span>
                </div>
              ) : (
                <p className="text-primary text-sm font-bold font-mono">{formatDuration(session.duration)}</p>
              )}
              <p className="text-muted text-[10px] uppercase tracking-wider">时长</p>
            </div>
            {isAerobic ? (
              <div className="text-center">
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
                  <Route size={16} className="text-accent-light" />
                </div>
                {editing ? (
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      step="0.1"
                      className="w-14 bg-surface-2 text-primary text-center py-1 rounded-lg text-sm outline-none border border-border font-mono"
                    />
                    <span className="text-muted text-xs">km</span>
                  </div>
                ) : (
                  <p className="text-primary text-sm font-bold font-mono">{distance ? `${distance}km` : '-'}</p>
                )}
                <p className="text-muted text-[10px] uppercase tracking-wider">距离</p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
                    <Dumbbell size={16} className="text-accent-light" />
                  </div>
                  <p className="text-primary text-sm font-bold">{exercises.length}</p>
                  <p className="text-muted text-[10px] uppercase tracking-wider">动作</p>
                </div>
                <div className="text-center">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
                    <ListChecks size={16} className="text-accent-light" />
                  </div>
                  <p className="text-primary text-sm font-bold">{totalSets}</p>
                  <p className="text-muted text-[10px] uppercase tracking-wider">组数</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Body Weight */}
        <div className="bg-surface-1 rounded-2xl p-4 border border-border mb-4 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <h3 className="text-primary font-semibold text-sm mb-3">体重记录</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={async () => {
                if (sessionId) {
                  await db.sessions.update(sessionId, { weight: weight ? Number(weight) : undefined })
                }
              }}
              placeholder="输入体重"
              className="flex-1 bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted font-mono"
            />
            <span className="text-muted text-sm">kg</span>
          </div>
        </div>

        {/* Diet */}
        <div className="bg-surface-1 rounded-2xl p-4 border border-border mb-4 animate-fade-in" style={{ animationDelay: '0.06s' }}>
          <h3 className="text-primary font-semibold text-sm mb-3">碳循环饮食</h3>
          <div className="flex gap-2">
            {([
              ['low', '低碳日', 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'],
              ['mid', '中碳日', 'bg-amber-500/20 border-amber-500/40 text-amber-400'],
              ['high', '高碳日', 'bg-orange-600/20 border-orange-500/40 text-orange-500'],
              ['cheat', '放纵餐', 'bg-red-500/20 border-red-500/40 text-red-400'],
            ] as const).map(([value, label, activeClass]) => (
              <button
                key={value}
                onClick={async () => {
                  if (sessionId) await db.sessions.update(sessionId, { diet: value })
                  setSession({ ...session, diet: value })
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  session.diet === value
                    ? activeClass
                    : 'bg-surface-2 border-border text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="bg-surface-1 rounded-2xl p-4 border border-border mb-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-primary font-semibold text-sm">训练照片</h3>
            <span className="text-muted text-xs">{photos.length}/{MAX_PHOTOS}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {photos.map((photo, idx) => (
              <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-surface-2" onClick={() => setPreviewIdx(idx)}>
                <img src={photo} alt={`训练照片 ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePhoto(idx) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center active:bg-black/80 transition-colors"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-surface-3 flex flex-col items-center justify-center gap-1 active:bg-surface-2 transition-colors"
              >
                <Camera size={20} className="text-muted" />
                <span className="text-muted text-[10px]">添加照片</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddPhotos}
            className="hidden"
          />
        </div>

        {/* Exercises */}
        <div className="space-y-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {exercises.map((ex, exIdx) => (
            <div key={exIdx} className="bg-surface-1 rounded-2xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-accent-light">{exIdx + 1}</span>
                  </div>
                  <span className="text-primary font-semibold text-sm">{ex.exerciseName}</span>
                </div>
                {editing && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => addSet(exIdx)} className="p-1.5 rounded-lg text-muted active:bg-surface-2">
                      <Plus size={14} />
                    </button>
                    <button onClick={() => removeExercise(exIdx)} className="p-1.5 rounded-lg text-muted active:text-red-400 active:bg-red-500/10">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="ml-9 space-y-1.5">
                {ex.sets.map((set, setIdx) => (
                  <div key={setIdx} className="flex items-center gap-2">
                    <span className="text-muted text-xs w-4 font-mono">{setIdx + 1}</span>
                    {editing ? (
                      <>
                        <input
                          type="number"
                          value={set.weight ?? ''}
                          onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="重量"
                          className="flex-1 bg-surface-2 text-primary text-center py-1.5 rounded-lg text-xs outline-none border border-border font-mono placeholder:text-muted"
                        />
                        <span className="text-muted text-xs">kg</span>
                        <input
                          type="number"
                          value={set.reps ?? ''}
                          onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="次数"
                          className="flex-1 bg-surface-2 text-primary text-center py-1.5 rounded-lg text-xs outline-none border border-border font-mono placeholder:text-muted"
                        />
                        <span className="text-muted text-xs">次</span>
                        {ex.sets.length > 1 && (
                          <button onClick={() => removeSet(exIdx, setIdx)} className="p-1 text-muted active:text-red-400">
                            <X size={12} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-primary font-mono text-xs">{set.weight ? `${set.weight}kg` : '-'}</span>
                        <span className="text-muted text-xs">×</span>
                        <span className="text-primary font-mono text-xs">{set.reps ?? '-'}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {editing && (
            <button
              onClick={() => setSelectingExercise(true)}
              className="w-full py-3.5 border border-dashed border-surface-3 rounded-2xl text-secondary text-sm active:bg-surface-1 transition-colors"
            >
              + 添加动作
            </button>
          )}
        </div>

        {/* Delete */}
        <div className="mt-6 text-center">
          <button
            onClick={async () => {
              if (confirm('确定删除这条训练记录？')) {
                await db.sessions.delete(session.id)
                navigate('/history')
              }
            }}
            className="text-red-400/80 text-xs active:text-red-400 transition-colors"
          >
            删除训练记录
          </button>
        </div>
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

      {/* Photo Preview */}
      {previewIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in"
          onClick={() => setPreviewIdx(null)}
        >
          <button
            onClick={() => setPreviewIdx(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
          >
            <X size={24} className="text-white" />
          </button>
          <img
            src={photos[previewIdx]}
            alt={`训练照片 ${previewIdx + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain"
          />
        </div>
      )}
    </div>
  )
}
