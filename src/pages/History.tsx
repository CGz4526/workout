import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, ChevronRight, Calendar, Image, Trash2, Plus, Database, Play, Coffee } from 'lucide-react'
import { db } from '../db'
import Header from '../components/Header'

function SwipeableItem({ onDelete, onContinue, onClick, children }: { onDelete: () => void; onContinue?: () => void; onClick: () => void; children: React.ReactNode }) {
  const [offsetLeft, setOffsetLeft] = useState(0)
  const startX = useRef(0)
  const swiping = useRef(false)
  const btnWidth = 80

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    swiping.current = true
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current) return
    const diff = startX.current - e.touches[0].clientX
    if (diff > 0) {
      // swipe left: card shifts left, shows delete on right
      setOffsetLeft(-Math.min(diff, btnWidth))
    } else if (diff < 0) {
      // swipe right: card shifts right, shows continue on left
      setOffsetLeft(Math.min(-diff, btnWidth))
    } else {
      setOffsetLeft(0)
    }
  }

  const handleTouchEnd = () => {
    swiping.current = false
    if (Math.abs(offsetLeft) > btnWidth / 2) {
      setOffsetLeft(offsetLeft > 0 ? btnWidth : -btnWidth)
    } else {
      setOffsetLeft(0)
    }
  }

  const handleClick = () => {
    if (offsetLeft === 0) {
      onClick()
    } else {
      setOffsetLeft(0)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Continue button (left) */}
      {onContinue && (
        <div className="absolute left-0 top-0 bottom-0 w-20">
          <button
            onClick={(e) => { e.stopPropagation(); onContinue() }}
            className="w-full h-full bg-emerald-500 flex items-center justify-center active:bg-emerald-600 transition-colors rounded-l-2xl"
          >
            <Play size={20} className="text-white" />
          </button>
        </div>
      )}

      {/* Delete button (right) */}
      <div className="absolute right-0 top-0 bottom-0 w-20">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-full h-full bg-red-500 flex items-center justify-center active:bg-red-600 transition-colors rounded-r-2xl"
        >
          <Trash2 size={20} className="text-white" />
        </button>
      </div>

      {/* Main content */}
      <div
        className="relative bg-surface-1 border border-border transition-transform"
        style={{ transform: `translateX(${offsetLeft}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  )
}

export default function History() {
  const navigate = useNavigate()
  const sessions =
    useLiveQuery(() =>
      db.sessions.orderBy('date').reverse().toArray().then(
        (all) => all.filter((s) => s.finished)
      )
    ) ?? []
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []

  const getBodyParts = (s: typeof sessions[0]) => {
    if (s.aerobic) return null
    const parts = new Set<string>()

    // Keyword-based extra body parts for multi-joint exercises
    const extraParts: Record<string, string[]> = {
      '飞鸟': ['肩'],
      '双杠臂屈伸': ['三头', '肩'],
      '窄推': ['胸'],
      '硬拉': ['背'],
      '引体向上': ['二头'],
    }

    for (const ex of s.exercises) {
      const def = allExercises.find((e) => e.id === ex.exerciseId)
      if (def) {
        parts.add(def.bodyPart)
      } else if (ex.exerciseName) {
        const byName = allExercises.find((e) => e.name === ex.exerciseName)
        if (byName) {
          parts.add(byName.bodyPart)
        } else {
          const byPartial = allExercises.find((e) => e.name.includes(ex.exerciseName) || ex.exerciseName.includes(e.name))
          if (byPartial) parts.add(byPartial.bodyPart)
        }
      }

      // Check extra parts from keywords
      for (const [keyword, exParts] of Object.entries(extraParts)) {
        if (ex.exerciseName.includes(keyword)) {
          exParts.forEach(p => parts.add(p))
        }
      }
    }
    return parts.size > 0 ? [...parts] : null
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}时${m}分${s > 0 ? s + '秒' : ''}`
    if (m === 0) return `${s}秒`
    return `${m}分${s > 0 ? s + '秒' : ''}`
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除这条训练记录？')) {
      await db.sessions.delete(id)
    }
  }

  const handleContinue = async (id: string) => {
    const existing = await db.sessions.filter((s) => !s.finished).first()
    if (existing) {
      alert('已有进行中的训练，请先结束当前训练')
      return
    }
    const session = await db.sessions.get(id)
    if (session) {
      await db.sessions.update(id, {
        finished: false,
        startTime: Date.now() - session.duration * 1000,
      })
      navigate(`/session/${id}`)
    }
  }

  const grouped: Record<string, typeof sessions> = {}
  for (const s of sessions) {
    const dateKey = new Date(s.date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey].push(s)
  }

  // Within the same day, list strength sessions above aerobic ones
  // (rest days count as non-aerobic). Array.sort is stable, so sessions
  // of the same type keep their original time order.
  for (const key of Object.keys(grouped)) {
    grouped[key].sort(
      (a, b) => Number(a.aerobic === true) - Number(b.aerobic === true)
    )
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header
        title="训练历史"
        rightAction={
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/settings')}
              className="w-8 h-8 rounded-lg bg-surface-1 flex items-center justify-center active:bg-surface-2 transition-colors"
            >
              <Database size={16} className="text-secondary" />
            </button>
            <button
              onClick={() => navigate('/add-session')}
              className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center active:bg-accent/20 transition-colors"
            >
              <Plus size={18} className="text-accent-light" />
            </button>
          </div>
        }
      />

      <div className="px-4 py-3">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-surface-1 border border-border flex items-center justify-center mx-auto mb-4">
              <Calendar size={24} className="text-muted" />
            </div>
            <p className="text-secondary text-sm">暂无训练记录</p>
            <p className="text-muted text-xs mt-1">完成训练后会自动记录</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="mb-6">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                <h3 className="text-secondary text-xs font-semibold uppercase tracking-wider">{date}</h3>
              </div>
              <div className="space-y-2">
                {items.map((s) => {
                  const isAerobic = s.aerobic === true
                  const isRest = !isAerobic && s.exercises.length === 0
                  const completedSets = s.exercises.reduce(
                    (sum, ex) => sum + ex.sets.filter((st) => st.completed).length, 0
                  )
                  const photoCount = s.photos?.length ?? 0
                  const startTime = new Date(s.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                  const bodyParts = getBodyParts(s)
                  const cardBg = isRest ? 'bg-stone-500/5' : isAerobic ? 'bg-blue-500/5' : 'border-zinc-700 border'
                  const iconBg = isRest ? 'bg-stone-400/10' : isAerobic ? 'bg-blue-400/10' : 'bg-accent/10'
                  const iconColor = isRest ? 'text-stone-400' : isAerobic ? 'text-blue-400' : 'text-accent-light'
                  return (
                    <div className={`rounded-2xl overflow-hidden ${cardBg}`}>
                    <SwipeableItem
                      key={s.id}
                      onDelete={() => handleDelete(s.id)}
                      onContinue={isRest ? undefined : () => handleContinue(s.id)}
                      onClick={() => navigate(`/session-detail/${s.id}`)}
                    >
                      <div className="flex items-center gap-3.5 p-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                          {isRest ? <Coffee size={18} className={iconColor} /> : <Clock size={18} className={iconColor} />}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-semibold text-sm flex items-center justify-between">
                            <span className="text-primary">{s.templateName ?? '自由训练'}
                              {isAerobic && s.duration > 0 && <span className="text-muted text-xs font-normal ml-2">{formatDuration(s.duration)}</span>}
                              {!isAerobic && !isRest && <span className="text-muted text-xs font-normal ml-2">{startTime} · {formatDuration(s.duration)}</span>}
                            </span>
                            {s.weight && <span className="text-muted text-xs font-normal shrink-0 ml-2">体重：{s.weight}kg</span>}
                          </p>
                          <p className="text-muted text-xs mt-0.5 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                              {isAerobic && s.distance ? (
                                `${s.distance}km`
                              ) : !isRest && !isAerobic ? (
                                <>
                                  {s.exercises.length} 动作 · {completedSets} 组
                                  {photoCount > 0 && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Image size={10} />
                                      {photoCount}
                                    </span>
                                  )}
                                </>
                              ) : null}
                              {bodyParts && bodyParts.map((part, idx) => (
                                <span key={part} className={`text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent-light border border-accent/10 shrink-0 ${idx >= 3 ? 'hidden' : ''}`}>{part}</span>
                              ))}
                              {bodyParts && bodyParts.length > 3 && (
                                <span className="text-[10px] text-muted shrink-0">+{bodyParts.length - 3}</span>
                              )}
                            </span>
                            {s.diet && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
                                s.diet === 'low' ? 'bg-emerald-500/20 text-emerald-400' :
                                s.diet === 'mid' ? 'bg-amber-500/20 text-amber-400' :
                                s.diet === 'high' ? 'bg-orange-600/20 text-orange-500' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {s.diet === 'low' ? '低碳' : s.diet === 'mid' ? '中碳' : s.diet === 'high' ? '高碳' : '放纵餐'}
                              </span>
                            )}
                          </p>
                        </div>
                        <ChevronRight size={18} className="text-surface-3 shrink-0" />
                      </div>
                    </SwipeableItem>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
