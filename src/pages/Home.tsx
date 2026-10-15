import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Play, Clock, Zap, ChevronRight, Footprints, Target, Bike, Waves, Coffee, CalendarDays, Route, Dumbbell, Scale } from 'lucide-react'
import { db } from '../db'
import type { ExerciseRecord } from '../types'
import { bodyPartMeta } from '../lib/bodyParts'
import { toLocalDateKey } from '../lib/date'
import { setDayWeight } from '../lib/weight'
import { normalizeSession } from '../lib/session'
import { normalizeTemplate } from '../lib/template'
import { countedSets } from '../lib/set'
import { CLIMB_CHOICES } from '../lib/aerobic'
import Header from '../components/Header'

// 有氧入口。带 `choices` 的卡片点开后会先问「具体是哪一项」——
// 爬楼梯和爬坡都属于爬升类训练，每次练的可能是任一种，不该在卡片上写死。
// 存进记录的 templateName 是最终选中的那个名字，Stats 按类型统计也据此分组。
// 每项带一对颜色：`soft` 是图标底，`color` 是图标本身（深色主题下用浅一档）。
const AEROBIC_ENTRIES: {
  label: string
  icon: React.ElementType
  soft: string
  color: string
  choices?: string[]
}[] = [
  { label: '跑步', icon: Bike, soft: 'bg-blue-500/10', color: 'text-blue-500 dark:text-blue-400' },
  { label: '游泳', icon: Waves, soft: 'bg-cyan-500/10', color: 'text-cyan-600 dark:text-cyan-400' },
  { label: '羽毛球', icon: Target, soft: 'bg-orange-500/10', color: 'text-orange-500 dark:text-orange-400' },
  {
    label: '爬楼梯/爬坡',
    icon: Footprints,
    soft: 'bg-purple-500/10',
    color: 'text-purple-500 dark:text-purple-400',
    choices: CLIMB_CHOICES,
  },
]

const startAerobic = async (name: string, navigate: (path: string) => void) => {
  const existing = await db.sessions.filter((s) => !s.finished).first()
  if (existing) {
    navigate(`/session/${existing.id}`)
    return
  }

  const session = {
    id: crypto.randomUUID(),
    templateName: name,
    date: new Date().toISOString(),
    duration: 0,
    exercises: [],
    finished: false,
    startTime: Date.now(),
    aerobic: true,
  }

  await db.sessions.add(session)
  navigate(`/session/${session.id}`)
}

export default function Home() {
  const navigate = useNavigate()
  // 非空时弹出「这次是爬楼梯还是爬坡」的选择层
  const [choosingAerobic, setChoosingAerobic] = useState<{ label: string; choices?: string[] } | null>(null)
  const templates = useLiveQuery(() => db.templates.toArray().then((all) => all.map(normalizeTemplate))) ?? []
  const activeSession = useLiveQuery(() =>
    db.sessions.filter((s) => !s.finished).first()
  )
  const recentSessions = useLiveQuery(() =>
    db.sessions.orderBy('date').reverse().toArray().then(
      (all) => all.filter((s) => s.finished).map(normalizeSession)
    )
  ) ?? []
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []

  // 今日体重：早起称个体重、当天还没训练时也能记。
  // 只用一次普通读库来回填，不用 useLiveQuery 订阅——否则用户每敲一个字，
  // 库里旧值都会把输入框冲回原值。失焦/回车即存。
  const todayKey = toLocalDateKey(new Date())
  const [weightInput, setWeightInput] = useState('')
  const [weightSaved, setWeightSaved] = useState(false)
  const weightTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    db.weights.get(todayKey).then((w) => {
      if (w) setWeightInput(String(w.weight))
    })
  }, [todayKey])

  useEffect(() => () => { if (weightTimer.current) window.clearTimeout(weightTimer.current) }, [])

  const saveWeight = async (raw: string) => {
    const kg = Number(raw)
    if (!raw.trim() || !Number.isFinite(kg) || kg <= 0 || kg > 500) return
    await setDayWeight(new Date().toISOString(), kg)
    setWeightSaved(true)
    if (weightTimer.current) window.clearTimeout(weightTimer.current)
    weightTimer.current = window.setTimeout(() => setWeightSaved(false), 2000)
  }

  const today = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getTemplateBodyPart = (template: typeof templates[0]) => {
    const bodyPartCounts: Record<string, number> = {}
    for (const item of template.items) {
      const ex = allExercises.find((e) => e.id === item.exerciseId)
      if (ex) {
        bodyPartCounts[ex.bodyPart] = (bodyPartCounts[ex.bodyPart] || 0) + 1
      }
    }
    const sorted = Object.entries(bodyPartCounts).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] ?? '肩'
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header title="健身记录" />

      <div className="px-4 pt-5 pb-6">
        <div className="mb-6 animate-rise-in">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-secondary bg-surface-1 border border-border shadow-card px-2.5 py-1 rounded-full mb-2.5">
            <CalendarDays size={12} className="text-accent" />
            {today}
          </span>
          <h2 className="text-[28px] leading-tight font-bold text-primary tracking-tight">
            今日训练<span className="text-accent">.</span>
          </h2>
        </div>

        {/* 今日体重：早起称了体重先记下来，不用等有训练记录 */}
        <div className="mb-5 bg-surface-1 rounded-2xl border border-border shadow-card p-4 animate-rise-in">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center">
              <Scale size={13} className="text-secondary" />
            </span>
            <h3 className="text-primary text-sm font-semibold tracking-wide">今日体重</h3>
            {weightSaved && <span className="text-[10px] font-medium text-accent animate-rise-in">已记录</span>}
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onBlur={(e) => saveWeight(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              placeholder="输入体重"
              className="flex-1 min-w-0 bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted font-mono"
            />
            <span className="text-muted text-sm shrink-0">kg</span>
          </div>
        </div>

        {/* Continue active workout */}
        {activeSession && (
          <button
            onClick={() => navigate(`/session/${activeSession.id}`)}
            className="w-full group relative overflow-hidden flex items-center justify-center gap-2.5 py-4 mb-4 bg-gradient-to-r from-amber-600 to-orange-500 active:from-amber-700 active:to-orange-600 text-white font-semibold rounded-2xl shadow-lg shadow-amber-500/25 tap animate-rise-in"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-active:translate-x-[100%] transition-transform duration-700" />
            继续训练：{activeSession.templateName}
          </button>
        )}

        {/* New workout */}
        {!activeSession && (
          <>
            <button
              onClick={() => navigate('/pre-workout')}
              className="w-full group relative overflow-hidden flex items-center justify-center gap-2.5 py-4 mb-3 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 text-white font-semibold rounded-2xl shadow-glow tap animate-rise-in"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-active:translate-x-[100%] transition-transform duration-700" />
              <Play size={20} fill="currentColor" />
              开始力量训练
            </button>

            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {AEROBIC_ENTRIES.map((entry, idx) => (
                <button
                  key={entry.label}
                  onClick={() =>
                    entry.choices ? setChoosingAerobic(entry) : startAerobic(entry.label, navigate)
                  }
                  style={{ animationDelay: `${0.06 + idx * 0.04}s` }}
                  className="flex items-center justify-center gap-2.5 py-3.5 bg-surface-1 rounded-2xl border border-border shadow-card tap animate-pop-in"
                >
                  <span className={`w-7 h-7 rounded-xl ${entry.soft} flex items-center justify-center shrink-0`}>
                    <entry.icon size={15} className={entry.color} />
                  </span>
                  <span className="text-primary text-sm font-medium">{entry.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={async () => {
                const existing = await db.sessions.filter((s) => !s.finished).first()
                if (existing) {
                  navigate(`/session/${existing.id}`)
                  return
                }
                const session = {
                  id: crypto.randomUUID(),
                  templateName: '休息日',
                  date: new Date().toISOString(),
                  duration: 0,
                  exercises: [] as ExerciseRecord[],
                  finished: true,
                }
                await db.sessions.add(session)
                navigate(`/session-detail/${session.id}`)
              }}
              className="w-full group relative overflow-hidden flex items-center justify-center gap-2 py-3 bg-surface-1 rounded-2xl border border-border shadow-card tap-soft mb-8"
            >
              <Coffee size={16} className="text-muted" />
              <span className="text-secondary text-sm">休息日</span>
            </button>
          </>
        )}

        {/* Templates */}
        {templates.length > 0 && (
          <section className="mb-8 animate-rise-in" style={{ animationDelay: '0.12s' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-accent-soft flex items-center justify-center">
                  <Zap size={13} className="text-accent" />
                </span>
                <h3 className="text-primary text-sm font-semibold tracking-wide">快速开始</h3>
              </div>
              <button
                onClick={() => navigate('/templates')}
                className="flex items-center gap-0.5 text-secondary text-xs active:text-primary transition-colors"
              >
                管理模板
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid gap-2.5">
              {templates.map((t, idx) => {
                const bp = getTemplateBodyPart(t)
                const meta = bodyPartMeta(bp)
                const Icon = meta.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/template/${t.id}`)}
                    style={{ animationDelay: `${Math.min(idx, 8) * 0.04}s` }}
                    className="group relative flex items-center gap-3.5 p-4 bg-surface-1 rounded-2xl border border-border shadow-card tap-soft animate-pop-in overflow-hidden"
                  >
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shrink-0 shadow-md shadow-black/10`}>
                      <Icon size={19} className="text-white" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-primary font-semibold text-sm">{t.name}</p>
                      <p className="text-muted text-xs mt-1 truncate">
                        {t.items.length === 0
                          ? '暂无动作'
                          : t.items.map((item) => item.exerciseName).slice(0, 3).join('、') +
                            (t.items.length > 3 ? ` +${t.items.length - 3}` : '')}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${meta.soft} ${meta.text} ${meta.border}`}>
                      {bp}
                    </span>
                    <ChevronRight size={18} className="text-muted group-active:text-secondary transition-colors shrink-0" />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <section className="animate-rise-in" style={{ animationDelay: '0.18s' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center">
                <Clock size={13} className="text-secondary" />
              </span>
              <h3 className="text-primary text-sm font-semibold tracking-wide">最近训练</h3>
            </div>
            <div className="grid gap-2.5">
              {recentSessions.slice(0, 5).map((s, idx) => {
                // 排除热身组，否则首页显示的组数会比详情页和统计页都大
                const completedSets = countedSets(s.exercises)
                // 有氧用蓝色、力量用主色、休息日中性色，和首页上方的入口配色保持一致
                const isAerobic = s.aerobic === true
                // 休息日：没跑计时器（无 startTime）、没有动作。自动补的休息日也走这里
                const isRest = !isAerobic && s.exercises.length === 0 && !s.startTime
                const Icon = isRest ? Coffee : isAerobic ? Route : Dumbbell
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/session-detail/${s.id}`)}
                    style={{ animationDelay: `${Math.min(idx, 6) * 0.04}s` }}
                    className="group flex items-center gap-3.5 p-4 bg-surface-1 rounded-2xl border border-border shadow-card tap-soft animate-pop-in"
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isRest ? 'bg-stone-500/10' : isAerobic ? 'bg-blue-500/10' : 'bg-accent-soft'}`}>
                      <Icon size={18} className={isRest ? 'text-stone-500 dark:text-stone-400' : isAerobic ? 'text-blue-500 dark:text-blue-400' : 'text-accent'} />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-primary font-medium text-sm truncate">
                        {s.templateName ?? '自由训练'}
                      </p>
                      <p className="text-muted text-xs mt-1 truncate">
                        {new Date(s.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        {' · '}
                        {isRest
                          ? '休息日'
                          : isAerobic
                            ? `${formatDuration(s.duration)}${s.distance ? ` · ${s.distance}km` : ''}`
                            : `${completedSets} 组 · ${formatDuration(s.duration)}`}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-muted group-active:text-secondary transition-colors shrink-0" />
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* 「爬楼梯 / 爬坡」二选一。点遮罩或取消都不开始训练。 */}
      {choosingAerobic && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 pb-6"
          onClick={() => setChoosingAerobic(null)}
        >
          <div
            className="w-full max-w-sm bg-surface-1 rounded-3xl border-t border-border px-4 pt-5 pb-8 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-primary font-semibold text-sm mb-3">这次练的是哪一种？</p>
            <div className="space-y-2">
              {(choosingAerobic.choices ?? []).map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setChoosingAerobic(null)
                    startAerobic(name, navigate)
                  }}
                  className="w-full py-3.5 bg-surface-2 rounded-2xl text-primary text-sm font-medium active:bg-surface-3 transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setChoosingAerobic(null)}
              className="w-full mt-3 py-3 text-secondary text-sm active:text-primary transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
