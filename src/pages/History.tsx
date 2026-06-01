import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronUp, Clock, Trash2, Calendar } from 'lucide-react'
import { db } from '../db'
import Header from '../components/Header'

export default function History() {
  const sessions =
    useLiveQuery(() =>
      db.sessions.orderBy('date').reverse().toArray().then(
        (all) => all.filter((s) => s.finished)
      )
    ) ?? []
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m === 0) return `${s}秒`
    return `${m}分${s > 0 ? s + '秒' : ''}`
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除这条训练记录？')) {
      await db.sessions.delete(id)
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

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header title="训练历史" />

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
                  const expanded = expandedId === s.id
                  const completedSets = s.exercises.reduce(
                    (sum, ex) => sum + ex.sets.filter((st) => st.completed).length, 0
                  )
                  return (
                    <div key={s.id} className="bg-surface-1 rounded-2xl overflow-hidden border border-border">
                      <button
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="w-full flex items-center gap-3.5 p-4 active:bg-surface-2 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
                          <Clock size={18} className="text-secondary" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-primary font-semibold text-sm">
                            {s.templateName ?? '自由训练'}
                          </p>
                          <p className="text-muted text-xs mt-0.5">
                            {formatDuration(s.duration)} · {s.exercises.length} 动作 · {completedSets} 组
                          </p>
                        </div>
                        <div className={`p-1.5 rounded-lg transition-colors ${expanded ? 'bg-surface-2' : ''}`}>
                          {expanded ? (
                            <ChevronUp size={16} className="text-secondary" />
                          ) : (
                            <ChevronDown size={16} className="text-muted" />
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-4 pb-4 border-t border-border pt-3 animate-fade-in">
                          {s.exercises.map((ex, exIdx) => (
                            <div key={exIdx} className="mb-4 last:mb-0">
                              <p className="text-primary text-sm font-semibold mb-2 flex items-center gap-2">
                                <span className="w-5 h-5 rounded-md bg-accent/10 flex items-center justify-center">
                                  <span className="text-[10px] font-bold text-accent-light">{exIdx + 1}</span>
                                </span>
                                {ex.exerciseName}
                              </p>
                              <div className="ml-7 space-y-1">
                                {ex.sets.map((set, setIdx) => (
                                  <div
                                    key={setIdx}
                                    className="flex items-center gap-2.5 text-sm"
                                  >
                                    <span className="text-muted w-5 text-xs font-mono">{setIdx + 1}</span>
                                    <span className="text-primary font-mono text-xs">
                                      {set.weight ? `${set.weight}kg` : '-'}
                                    </span>
                                    <span className="text-muted text-xs">×</span>
                                    <span className="text-primary font-mono text-xs">
                                      {set.reps ?? '-'}
                                    </span>
                                    <span className={`text-[10px] ml-1 ${set.completed ? 'text-accent-light' : 'text-muted'}`}>
                                      {set.completed ? '✓' : '✗'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="flex items-center gap-1.5 text-red-400/80 text-xs mt-3 ml-7 py-1.5 px-3 rounded-lg active:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={13} />
                            删除记录
                          </button>
                        </div>
                      )}
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
