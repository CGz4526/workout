import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Calendar, Activity, Dumbbell, ChevronLeft, ChevronRight, ChartColumn } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type Exercise, type WorkoutSession } from '../types'
import Header from '../components/Header'
import { bodyPartMeta } from '../lib/bodyParts'
import { normalizeSession } from '../lib/session'

type TimeRange = '1w' | '1m' | '3m'

type Bucket = { label: string; start: number; end: number }

// 分桶方式与「训练频次」图保持一致，这样两张图说的是同一批时间段。
const buildBuckets = (range: TimeRange, now: Date): Bucket[] => {
  if (range === '1w') {
    return Array.from({ length: 7 }, (_, i) => {
      const start = new Date(now)
      start.setDate(now.getDate() - (6 - i))
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      return {
        label: start.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        start: start.getTime(),
        end: end.getTime(),
      }
    })
  }
  if (range === '1m') {
    return Array.from({ length: 4 }, (_, i) => {
      const end = new Date(now)
      end.setDate(now.getDate() - (3 - i) * 7)
      end.setHours(23, 59, 59, 999)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      return {
        label: `${start.getMonth() + 1}/${start.getDate()}周`,
        start: start.getTime(),
        end: end.getTime(),
      }
    })
  }
  return Array.from({ length: 3 }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1)
    const end = new Date(now.getFullYear(), now.getMonth() - (1 - i), 1)
    return { label: `${start.getMonth() + 1}月`, start: start.getTime(), end: end.getTime() }
  })
}

// 训练容量 = Σ(重量 × 次数)。只算「已完成且填了重量」的组：
// 自重动作没有重量，计入会把容量拉低成噪声。
const sessionVolume = (s: WorkoutSession) =>
  s.exercises.reduce(
    (sum, ex) =>
      sum +
      ex.sets.reduce((v, st) => v + (st.completed ? (st.weight ?? 0) * (st.reps ?? 0) : 0), 0),
    0
  )

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

// useLiveQuery 在首次结果到达前返回 undefined。写成 `?? []` 会在**每一次渲染**
// 造出一个新数组，于是下面每个 useMemo 的依赖每帧都变、缓存全部失效。
// 用模块级常量兜底，身份才稳定。
const EMPTY_SESSIONS: WorkoutSession[] = []
const EMPTY_EXERCISES: Exercise[] = []

export default function Stats() {
  const sessions = useLiveQuery(() =>
    db.sessions.orderBy('date').reverse().toArray().then(
      (all) => all.filter((s) => s.finished).map(normalizeSession)
    )
  ) ?? EMPTY_SESSIONS
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? EMPTY_EXERCISES

  const [timeRange, setTimeRange] = useState<TimeRange>('1w')
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const cutoffDate = useMemo(() => {
    const now = new Date()
    switch (timeRange) {
      case '1w': now.setDate(now.getDate() - 7); break
      case '1m': now.setMonth(now.getMonth() - 1); break
      case '3m': now.setMonth(now.getMonth() - 3); break
    }
    return now
  }, [timeRange])

  const filteredSessions = useMemo(() =>
    sessions.filter((s) => new Date(s.date) >= cutoffDate),
    [sessions, cutoffDate]
  )

  const strengthSessions = useMemo(() =>
    filteredSessions.filter((s) => !s.aerobic && s.exercises.length > 0),
    [filteredSessions]
  )

  const aerobicSessions = useMemo(() =>
    filteredSessions.filter((s) => s.aerobic === true),
    [filteredSessions]
  )

  // Calendar heatmap data
  const calendarData = useMemo(() => {
    const { year, month } = calMonth
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    // getDay(): 0=Sun, 1=Mon... We want Monday as first column
    const startOffset = (firstDay.getDay() + 6) % 7 // Monday=0

    // Build a map of date -> { strength, aerobic }
    const dateMap: Record<string, { strength: boolean; aerobic: boolean }> = {}
    for (const s of sessions) {
      const d = new Date(s.date)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const isAerobic = s.aerobic === true
      // Rest days never ran a timer; see History.tsx for the same rule.
      const isRest = !isAerobic && s.exercises.length === 0 && !s.startTime
      if (isRest) continue
      if (!dateMap[key]) dateMap[key] = { strength: false, aerobic: false }
      if (isAerobic) dateMap[key].aerobic = true
      else dateMap[key].strength = true
    }

    const cells: { day: number; strength?: boolean; aerobic?: boolean }[] = []
    for (let i = 0; i < startOffset; i++) cells.push({ day: 0 })
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${month}-${day}`
      cells.push({ day, strength: dateMap[key]?.strength, aerobic: dateMap[key]?.aerobic })
    }
    // Pad to complete weeks
    while (cells.length % 7 !== 0) cells.push({ day: 0 })

    const weeks: typeof cells[] = []
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7))
    }

    return { weeks, daysInMonth }
  }, [calMonth, sessions])

  const calLabel = `${calMonth.year}年${calMonth.month + 1}月`

  // Weight trend data (sorted by date, using days-ago for proportional spacing)
  const weightData = useMemo(() => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)
    const daysAgo = (date: Date) => Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    return filteredSessions
      .filter((s) => s.weight)
      .map((s) => ({
        daysAgo: daysAgo(new Date(s.date)),
        label: new Date(s.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        weight: s.weight,
      }))
      .sort((a, b) => b.daysAgo - a.daysAgo)
  }, [filteredSessions])

  // Body part stats (count each part once per training day)
  const bodyPartData = useMemo(() => {
    const counts: Record<string, number> = {}
    BODY_PARTS.forEach(bp => counts[bp] = 0)

    for (const s of strengthSessions) {
      // Collect unique body parts for this session
      const sessionParts = new Set<string>()
      for (const ex of s.exercises) {
        const def = allExercises.find((e) => e.id === ex.exerciseId)
        if (def) sessionParts.add(def.bodyPart)
      }
      // Each part counts once per day
      for (const part of sessionParts) {
        counts[part] = (counts[part] || 0) + 1
      }
    }

    return BODY_PARTS.map(bp => ({ name: bp, count: counts[bp], fill: bodyPartMeta(bp).hex })).filter(d => d.count > 0)
  }, [strengthSessions, allExercises])

  // Aerobic stats
  // 注意别再在这里 `const aerobicSessions = filteredSessions.filter(...)`：
  // 那会遮蔽外层的同名变量，既白跑一次过滤，又让依赖数组写错（声明的是
  // aerobicSessions、真正用到的却是 filteredSessions）。外层已经是同一个集合。
  const aerobicStats = useMemo(() => {
    const total = aerobicSessions.length
    const totalDistance = aerobicSessions.reduce((sum, s) => sum + (s.distance ?? 0), 0)
    const totalDuration = aerobicSessions.reduce((sum, s) => sum + s.duration, 0)

    // Count by type
    const byType: Record<string, number> = {}
    for (const s of aerobicSessions) {
      const name = s.templateName ?? '有氧'
      byType[name] = (byType[name] || 0) + 1
    }

    return { total, totalDistance, totalDuration, byType }
  }, [aerobicSessions])

  // Aerobic frequency data based on time range
  const aerobicFrequencyData = useMemo(() => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)

    if (timeRange === '1w') {
      const days: { day: string; count: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(now.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const next = new Date(date)
        next.setDate(date.getDate() + 1)
        const label = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        const count = aerobicSessions.filter((s) => {
          const d = new Date(s.date)
          return d >= date && d < next
        }).length
        days.push({ day: label, count })
      }
      return { data: days, show: true }
    }

    if (timeRange === '1m') {
      const weeks: { day: string; count: number }[] = []
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(now)
        weekEnd.setDate(now.getDate() - i * 7)
        const weekStart = new Date(weekEnd)
        weekStart.setDate(weekEnd.getDate() - 6)
        weekStart.setHours(0, 0, 0, 0)
        weekEnd.setHours(23, 59, 59, 999)
        const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
        const count = aerobicSessions.filter((s) => {
          const d = new Date(s.date)
          return d >= weekStart && d <= weekEnd
        }).length
        weeks.push({ day: label + '周', count })
      }
      return { data: weeks, show: true }
    }

    const months: { day: string; count: number }[] = []
    for (let i = 2; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
      const label = `${monthStart.getMonth() + 1}月`
      const count = aerobicSessions.filter((s) => {
        const d = new Date(s.date)
        return d >= monthStart && d <= monthEnd
      }).length
      months.push({ day: label, count })
    }
    return { data: months, show: true }
  }, [aerobicSessions, timeRange])

  // Training frequency data based on time range
  const frequencyData = useMemo(() => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)

    if (timeRange === '1w') {
      // Daily breakdown for 7 days
      const days: { day: string; count: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(now.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const next = new Date(date)
        next.setDate(date.getDate() + 1)
        const label = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        const count = strengthSessions.filter((s) => {
          const d = new Date(s.date)
          return d >= date && d < next
        }).length
        days.push({ day: label, count })
      }
      return { data: days, label: '近七日' }
    }

    if (timeRange === '1m') {
      // Weekly breakdown for 4 weeks
      const weeks: { day: string; count: number }[] = []
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(now)
        weekEnd.setDate(now.getDate() - i * 7)
        const weekStart = new Date(weekEnd)
        weekStart.setDate(weekEnd.getDate() - 6)
        weekStart.setHours(0, 0, 0, 0)
        weekEnd.setHours(23, 59, 59, 999)
        const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`
        const count = strengthSessions.filter((s) => {
          const d = new Date(s.date)
          return d >= weekStart && d <= weekEnd
        }).length
        weeks.push({ day: label + '周', count })
      }
      return { data: weeks, label: '四周' }
    }

    // Monthly breakdown for 3 months
    const months: { day: string; count: number }[] = []
    for (let i = 2; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999)
      const label = `${monthStart.getMonth() + 1}月`
      const count = strengthSessions.filter((s) => {
        const d = new Date(s.date)
        return d >= monthStart && d <= monthEnd
      }).length
      months.push({ day: label, count })
    }
    return { data: months, label: '三月' }
  }, [strengthSessions, timeRange])

  // Training volume per bucket — the one curve that actually shows progress,
  // which frequency/body-part counts cannot.
  const volumeData = useMemo(() => {
    const now = new Date()
    now.setHours(23, 59, 59, 999)
    const buckets = buildBuckets(timeRange, now)
    const data = buckets.map((b) => ({ day: b.label, volume: 0 }))

    for (const s of strengthSessions) {
      const vol = sessionVolume(s)
      if (vol <= 0) continue
      const t = new Date(s.date).getTime()
      const i = buckets.findIndex((b) => t >= b.start && t < b.end)
      if (i >= 0) data[i].volume += vol
    }

    return { data, total: data.reduce((sum, d) => sum + d.volume, 0) }
  }, [strengthSessions, timeRange])

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header title="数据统计" />

      <div className="mx-auto w-full max-w-lg">
      {/* Calendar heatmap */}
      <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card mx-4 mt-4 animate-rise-in">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-primary font-semibold text-sm">训练日历</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCalMonth(prev => {
                const d = new Date(prev.year, prev.month - 1, 1)
                return { year: d.getFullYear(), month: d.getMonth() }
              })}
              className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center active:bg-surface-3"
            >
              <ChevronLeft size={16} className="text-secondary" />
            </button>
            <span className="text-primary text-sm font-medium min-w-[80px] text-center">{calLabel}</span>
            <button
              onClick={() => setCalMonth(prev => {
                const d = new Date(prev.year, prev.month + 1, 1)
                return { year: d.getFullYear(), month: d.getMonth() }
              })}
              className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center active:bg-surface-3"
            >
              <ChevronRight size={16} className="text-secondary" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {/* Weekday labels */}
          <div className="flex flex-col gap-1.5 justify-between">
            {WEEKDAYS.map((wd) => (
              <span key={wd} className="text-[9px] text-muted leading-none h-4 flex items-center">{wd}</span>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="flex-1">
            <div className="flex flex-col gap-1.5">
              {calendarData.weeks.map((week, wi) => (
                <div key={wi} className="flex gap-1.5">
                  {week.map((cell, ci) => {
                    if (cell.day === 0) return <div key={ci} className="w-4 h-4 rounded" />
                    const bg = cell.strength ? 'bg-emerald-500' : cell.aerobic ? 'bg-emerald-500/20' : 'bg-surface-2'
                    const title = `${cell.day}日${cell.strength ? ' 力量' : ''}${cell.aerobic ? ' 有氧' : ''}`
                    return (
                      <div
                        key={ci}
                        className={`relative w-4 h-4 rounded-sm flex items-center justify-center ${bg}`}
                        title={title}
                      >
                        {(cell.strength || cell.aerobic) && <span className="text-[7px] text-white/90 leading-none">{cell.day}</span>}
                        {cell.aerobic && (
                          <span className="absolute top-0 left-0 w-0 h-0 border-t-[6px] border-t-blue-500 border-r-[6px] border-r-transparent rounded-tl-sm" />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px] text-muted">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" />力量</span>
          <span className="flex items-center gap-1"><span className="relative w-3 h-3 rounded-sm bg-emerald-500/20"><span className="absolute top-0 left-0 w-0 h-0 border-t-[5px] border-t-blue-500 border-r-[5px] border-r-transparent" /></span>有氧标记</span>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-2 px-4 py-3 border-b border-border">
        {(['1w', '1m', '3m'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              timeRange === range
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-surface-1 text-secondary border border-border'
            }`}
          >
            {range === '1w' ? '近一周' : range === '1m' ? '近一月' : '近三月'}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Body part stats */}
        {bodyPartData.length > 0 && (
          <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card animate-rise-in">
            <div className="flex items-center gap-2 mb-4">
              <Dumbbell size={16} className="text-accent-light" />
              <h3 className="text-primary font-semibold text-sm">各部位训练次数</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bodyPartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12, fontWeight: 'bold', fill: 'var(--color-primary)' }}>
                  {bodyPartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Training frequency */}
        <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card animate-rise-in">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-accent-light" />
            <h3 className="text-primary font-semibold text-sm">{frequencyData.label}训练</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={frequencyData.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, fontWeight: 'bold', fill: 'var(--color-primary)' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Training volume */}
        {volumeData.total > 0 && (
          <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card animate-rise-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ChartColumn size={16} className="text-accent-light" />
                <h3 className="text-primary font-semibold text-sm">训练容量</h3>
              </div>
              <span className="text-primary text-sm font-bold font-mono">
                {Math.round(volumeData.total).toLocaleString('zh-CN')} kg
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={volumeData.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="volume" name="容量 (kg)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-muted text-[10px] mt-2 leading-relaxed">
              重量 × 次数，只统计已完成且填写了重量的组；自重动作不计入。
            </p>
          </div>
        )}

        {/* Aerobic stats */}
        {aerobicStats.total > 0 && (
          <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card animate-rise-in">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-blue-400" />
              <h3 className="text-primary font-semibold text-sm">有氧训练</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-primary text-lg font-bold">{aerobicStats.total}</p>
                <p className="text-muted text-[10px] uppercase tracking-wider">次数</p>
              </div>
              <div className="text-center">
                <p className="text-primary text-lg font-bold">{aerobicStats.totalDistance.toFixed(1)}km</p>
                <p className="text-muted text-[10px] uppercase tracking-wider">总距离</p>
              </div>
              <div className="text-center">
                <p className="text-primary text-lg font-bold">{Math.floor(aerobicStats.totalDuration / 60)}分</p>
                <p className="text-muted text-[10px] uppercase tracking-wider">总时长</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(aerobicStats.byType).map(([name, count]) => (
                <span key={name} className="text-xs bg-surface-2 text-primary px-3 py-1.5 rounded-lg border border-border">
                  {name} ×{count}
                </span>
              ))}
            </div>
            {aerobicFrequencyData.show && (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={aerobicFrequencyData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, fontWeight: 'bold', fill: 'var(--color-primary)' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Weight trend */}
        {weightData.length > 0 && (
          <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card animate-rise-in">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-accent-light" />
              <h3 className="text-primary font-semibold text-sm">体重趋势</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-2)" />
                <XAxis
                  dataKey="daysAgo"
                  type="number"
                  tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                  tickFormatter={(v) => {
                    const item = weightData.find(d => d.daysAgo === v)
                    return item?.label ?? ''
                  }}
                  domain={['dataMax + 1', 'dataMin']}
                  reversed
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted)' }} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`${value}kg`, '体重']}
                  labelFormatter={(label) => {
                    // Recharts 把 label 声明成 ReactNode，这里实际是 X 轴的数值
                    const daysAgo = Number(label)
                    const item = weightData.find(d => d.daysAgo === daysAgo)
                    return `${item?.label ?? ''} (${daysAgo === 0 ? '今天' : `${daysAgo}天前`})`
                  }}
                />
                <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
