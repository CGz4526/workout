import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Minus, Timer, Trophy, Clock, Dumbbell, ListChecks, Zap } from 'lucide-react'
import { db } from '../db'
import type { ExerciseRecord } from '../types'
import Header from '../components/Header'
import CheckButton from '../components/CheckButton'

const REST_SECONDS = 150

export default function ActiveWorkout() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(sessionId!), [sessionId])
  const [exercises, setExercises] = useState<ExerciseRecord[]>([])
  const [finished, setFinished] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [, setDisplayTick] = useState(0) // triggers re-render for timer display
  const [finalElapsed, setFinalElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  const [restRemaining, setRestRemaining] = useState(0)
  const restTimerRef = useRef<number | null>(null)

  // Calculate elapsed from startTime
  const elapsed = finished
    ? finalElapsed
    : session?.startTime
      ? Math.floor((Date.now() - session.startTime) / 1000)
      : 0

  // Debounced save exercises to DB
  const saveTimeoutRef = useRef<number | null>(null)
  const saveExercises = useCallback((exs: ExerciseRecord[], restEnd?: number) => {
    if (!sessionId) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      db.sessions.update(sessionId, {
        exercises: exs,
        restEndTime: restEnd,
      })
    }, 300)
  }, [sessionId])

  // Init from session
  useEffect(() => {
    if (!session) return

    if (session.finished) {
      setExercises(session.exercises)
      setFinalElapsed(session.duration)
      setFinished(true)
      setShowSummary(true)
      return
    }

    if (exercises.length === 0) {
      if (session.exercises.length > 0) {
        setExercises(session.exercises)
      } else if (session.templateId) {
        db.templates.get(session.templateId).then((template) => {
          if (template && template.items.length > 0) {
            const resolved: ExerciseRecord[] = template.items.map((item) => ({
              exerciseId: item.exerciseId,
              exerciseName: item.exerciseName,
              sets: Array.from({ length: item.defaultSets }, () => ({
                weight: undefined as number | undefined,
                reps: item.defaultReps,
                completed: false,
              })),
            }))
            setExercises(resolved)
          }
        })
      }

      // Restore rest timer
      if (session.restEndTime && session.restEndTime > Date.now()) {
        setRestRemaining(Math.ceil((session.restEndTime - Date.now()) / 1000))
      }
    }
  }, [session])

  // Display tick: re-render every second so elapsed updates
  useEffect(() => {
    if (finished) return
    timerRef.current = window.setInterval(() => {
      setDisplayTick((t) => t + 1)
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [finished])

  // Rest timer
  useEffect(() => {
    if (restRemaining <= 0) return
    restTimerRef.current = window.setInterval(() => {
      setRestRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current)
    }
  }, [restRemaining > 0])

  // Save exercises to DB when they change
  useEffect(() => {
    if (exercises.length > 0 && !finished) {
      saveExercises(exercises)
    }
  }, [exercises])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatRestTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const startRest = () => {
    const end = Date.now() + REST_SECONDS * 1000
    setRestRemaining(REST_SECONDS)
    saveExercises(exercises, end)
  }

  const skipRest = () => {
    setRestRemaining(0)
    if (restTimerRef.current) clearInterval(restTimerRef.current)
    saveExercises(exercises, undefined)
  }

  const addRestTime = (seconds: number) => {
    setRestRemaining((prev) => {
      const newRemaining = prev + seconds
      saveExercises(exercises, Date.now() + newRemaining * 1000)
      return newRemaining
    })
  }

  const toggleSet = (exIdx: number, setIdx: number) => {
    if (finished) return
    const wasCompleted = exercises[exIdx].sets[setIdx].completed
    setExercises(
      exercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, completed: !s.completed } : s) }
          : ex
      )
    )
    if (!wasCompleted) startRest()
  }

  const updateSet = (exIdx: number, setIdx: number, field: 'weight' | 'reps', value: number | undefined) => {
    if (finished) return
    setExercises(
      exercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) }
          : ex
      )
    )
  }

  const addSet = (exIdx: number) => {
    if (finished) return
    setExercises(exercises.map((ex, i) =>
      i === exIdx ? { ...ex, sets: [...ex.sets, { weight: undefined, reps: 12, completed: false }] } : ex
    ))
  }

  const removeSet = (exIdx: number) => {
    if (finished) return
    setExercises(exercises.map((ex, i) =>
      i === exIdx && ex.sets.length > 1 ? { ...ex, sets: ex.sets.slice(0, -1) } : ex
    ))
  }

  const addExercise = async () => {
    if (finished) return
    const allExercises = await db.exercises.toArray()
    const name = prompt('输入动作名称（从动作库选择或自由输入）:')
    if (!name) return
    const matched = allExercises.find((e) => e.name === name)
    setExercises([
      ...exercises,
      { exerciseId: matched?.id ?? crypto.randomUUID(), exerciseName: name, sets: [{ weight: undefined, reps: 12, completed: false }] },
    ])
  }

  const finishWorkout = async () => {
    if (!sessionId) return
    if (timerRef.current) clearInterval(timerRef.current)
    if (restTimerRef.current) clearInterval(restTimerRef.current)
    const duration = session?.startTime
      ? Math.floor((Date.now() - session.startTime) / 1000)
      : 0
    setFinalElapsed(duration)
    await db.sessions.update(sessionId, {
      exercises,
      duration,
      finished: true,
      restEndTime: undefined,
    })
    setFinished(true)
    setShowSummary(true)
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (exercises.length === 0 && !showSummary && !session.finished) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const completedSets = exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0)
  const completedExercises = exercises.filter((ex) => ex.sets.some((s) => s.completed))
  const progress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0

  if (showSummary) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        <Header title="训练总结" showBack />
        <div className="flex-1 px-4 py-6 flex flex-col items-center overflow-y-auto">
          <div className="relative mb-6 animate-scale-in">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/30 animate-pulse-glow">
              <Trophy size={36} className="text-white" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-primary mb-1 animate-fade-in">训练完成</h2>
          <p className="text-secondary text-sm mb-8 animate-fade-in">继续保持，你很棒</p>

          <div className="w-full grid grid-cols-3 gap-3 mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                <Clock size={18} className="text-accent-light" />
              </div>
              <p className="text-primary text-lg font-bold font-mono">{formatTime(elapsed)}</p>
              <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">时长</p>
            </div>
            <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                <Dumbbell size={18} className="text-accent-light" />
              </div>
              <p className="text-primary text-lg font-bold">{completedExercises.length}</p>
              <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">动作</p>
            </div>
            <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                <ListChecks size={18} className="text-accent-light" />
              </div>
              <p className="text-primary text-lg font-bold">{completedSets}</p>
              <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">组数</p>
            </div>
          </div>

          <div className="w-full space-y-3 mb-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {exercises.filter(ex => ex.sets.some(s => s.completed)).map((ex, idx) => {
              const doneSets = ex.sets.filter(s => s.completed)
              return (
                <div key={idx} className="bg-surface-1 rounded-2xl p-4 border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-accent-light">{idx + 1}</span>
                      </div>
                      <span className="text-primary font-semibold text-sm">{ex.exerciseName}</span>
                    </div>
                    <span className="text-accent-light text-xs font-mono font-bold">{doneSets.length} 组</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-9">
                    {doneSets.map((s, i) => (
                      <span key={i} className="text-[11px] bg-surface-2 text-primary px-2.5 py-1 rounded-lg font-mono border border-border">
                        {s.weight ? `${s.weight}kg` : '-'} × {s.reps ?? '-'}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-24">
      <Header
        title={session.templateName ?? '训练中'}
        showBack
        rightAction={
          <div className="flex items-center gap-1.5 text-secondary text-xs font-mono bg-surface-2 px-2.5 py-1 rounded-lg">
            <Timer size={13} className="text-accent-light" />
            {formatTime(elapsed)}
          </div>
        }
      />

      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between text-xs mb-2.5">
          <span className="text-secondary font-mono">{completedSets}/{totalSets} 组</span>
          <span className="text-secondary">
            {exercises.filter((ex) => ex.sets.every((s) => s.completed)).length}/{exercises.length} 完成
          </span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {exercises.map((ex, exIdx) => {
          const allDone = ex.sets.every((s) => s.completed)
          return (
            <div key={exIdx} className={`bg-surface-1 rounded-2xl p-4 border transition-colors duration-300 ${allDone ? 'border-accent/20' : 'border-border'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-300 ${allDone ? 'bg-accent/20' : 'bg-surface-2'}`}>
                    <span className={`text-xs font-bold ${allDone ? 'text-accent-light' : 'text-secondary'}`}>{exIdx + 1}</span>
                  </div>
                  <div>
                    <h3 className={`font-semibold text-sm transition-colors duration-300 ${allDone ? 'text-accent-light' : 'text-primary'}`}>
                      {ex.exerciseName}
                    </h3>
                    <p className="text-muted text-[10px] mt-0.5">
                      {ex.sets.filter(s => s.completed).length}/{ex.sets.length} 组
                    </p>
                  </div>
                </div>
                {!finished && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => removeSet(exIdx)} className="p-1.5 rounded-lg text-muted active:bg-surface-2 transition-colors">
                      <Minus size={14} />
                    </button>
                    <button onClick={() => addSet(exIdx)} className="p-1.5 rounded-lg text-muted active:bg-surface-2 transition-colors">
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 items-center text-[10px] text-muted mb-1.5 px-1 uppercase tracking-wider">
                <span>组</span>
                <span>重量</span>
                <span>次数</span>
                <span />
              </div>

              {ex.sets.map((set, setIdx) => (
                <div
                  key={setIdx}
                  className={`grid grid-cols-[2.5rem_1fr_1fr_2.5rem] gap-2 items-center py-2 px-1 rounded-xl transition-colors duration-200 ${
                    set.completed ? 'bg-accent/[0.06]' : ''
                  }`}
                >
                  <span className={`text-xs font-mono ${set.completed ? 'text-accent-light font-bold' : 'text-muted'}`}>
                    {setIdx + 1}
                  </span>
                  <input
                    type="number"
                    value={set.weight ?? ''}
                    onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="-"
                    disabled={finished}
                    className="bg-surface-2 text-primary text-center py-2 rounded-lg text-sm outline-none border border-border focus:border-accent/40 transition-colors disabled:opacity-40 font-mono placeholder:text-muted"
                  />
                  <input
                    type="number"
                    value={set.reps ?? ''}
                    onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="-"
                    disabled={finished}
                    className="bg-surface-2 text-primary text-center py-2 rounded-lg text-sm outline-none border border-border focus:border-accent/40 transition-colors disabled:opacity-40 font-mono placeholder:text-muted"
                  />
                  <div className="flex justify-center">
                    <CheckButton checked={set.completed} onClick={() => toggleSet(exIdx, setIdx)} />
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {!finished && (
          <button
            onClick={addExercise}
            className="w-full py-3.5 border border-dashed border-surface-3 rounded-2xl text-secondary text-sm active:bg-surface-1 transition-colors"
          >
            + 添加动作
          </button>
        )}
      </div>

      {restRemaining > 0 && !finished && (
        <div className="fixed inset-0 z-50 bg-surface-0/95 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">
          <p className="text-muted text-xs uppercase tracking-widest mb-3">组间休息</p>

          <div className="relative w-44 h-44 mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="43" fill="none" stroke="var(--color-surface-2)" strokeWidth="5" />
              <circle
                cx="50" cy="50" r="43" fill="none"
                stroke="url(#restGradient)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 43}`}
                strokeDashoffset={`${2 * Math.PI * 43 * (1 - restRemaining / REST_SECONDS)}`}
                className="transition-all duration-1000 ease-linear"
              />
              <defs>
                <linearGradient id="restGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-primary text-5xl font-bold font-mono tracking-tight">
                {formatRestTime(restRemaining)}
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 mb-8">
            <button
              onClick={() => addRestTime(30)}
              className="px-5 py-2.5 bg-surface-1 text-primary rounded-xl text-sm font-medium border border-border active:bg-surface-2 transition-colors"
            >
              +30秒
            </button>
            <button
              onClick={() => addRestTime(60)}
              className="px-5 py-2.5 bg-surface-1 text-primary rounded-xl text-sm font-medium border border-border active:bg-surface-2 transition-colors"
            >
              +1分钟
            </button>
          </div>

          <button
            onClick={skipRest}
            className="px-10 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold rounded-2xl active:from-emerald-700 active:to-emerald-600 transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            跳过休息
          </button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-0/80 backdrop-blur-xl border-t border-border">
        <button
          onClick={finishWorkout}
          className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
        >
          <Zap size={18} />
          结束训练
        </button>
      </div>
    </div>
  )
}
