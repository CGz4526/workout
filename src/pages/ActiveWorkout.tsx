import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Minus, Timer, Trophy, Clock, Dumbbell, ListChecks, Zap, Route, X, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, MAX_RPE, MIN_RPE, type BodyPart, type ExerciseRecord, type SetRecord, type TemplateItem } from '../types'
import Header from '../components/Header'
import CheckButton from '../components/CheckButton'
import NumberWheel from '../components/NumberWheel'
import { alertRestDone, notificationPermission, primeAudio, requestNotificationPermission } from '../lib/feedback'
import { useWakeLock } from '../lib/useWakeLock'
import { isTooShortToRecord, normalizeSession } from '../lib/session'
import { sanitizeItem, normalizeTemplate } from '../lib/template'
import { bodyPartMeta } from '../lib/bodyParts'
import { resolveRestSeconds } from '../lib/rest'
import { clampRpe, isCountedSet } from '../lib/set'

const REST_FALLBACK = 150
const MAX_NOTES_LENGTH = 500

// 训练页三个数字字段的滚轮参数。重量用 2.5kg 一档（杠铃片的最小组合），
// 次数 1 下一档，RPE 半档——和各自的语义对齐。
const WHEEL_CFG = {
  weight: { title: '重量', min: 0, max: 600, step: 2.5, unit: 'kg' as string | undefined },
  reps: { title: '次数', min: 1, max: 100, step: 1, unit: '次' as string | undefined },
  rpe: { title: 'RPE', min: MIN_RPE, max: MAX_RPE, step: 0.5, unit: undefined as string | undefined },
}

// "上次成绩" 的日期前缀：只到「天」这一粒度就够了，精确到时分反而难读。
function daysAgoLabel(dateStr: string) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(dateStr))) / 86400000)
  if (diff <= 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 30) return `${diff} 天前`
  return `${Math.floor(diff / 30)} 个月前`
}

// 最多列 3 组，再多会把动作名挤掉
function formatPrevSets(sets: SetRecord[]) {
  const shown = sets.slice(0, 3).map((s) => `${s.weight ?? '-'}×${s.reps ?? '-'}`).join(' · ')
  return sets.length > 3 ? `${shown} +${sets.length - 3}` : shown
}

// 秒 → 「分钟」输入框的初值。向下取整，和 SessionDetail 的编辑口径保持一致
// （那边也是 Math.floor(s.duration / 60)）。0 秒表示「时长未知」，显示成空。
function secondsToMinutesInput(seconds: number): string {
  return Number.isFinite(seconds) && seconds > 0 ? String(Math.floor(seconds / 60)) : ''
}

// 把模板动作铺成训练记录。
// defaultSets 有两个不受源码控制的来源（备份导入、sessionStorage 的 preset），
// 所以必须先用 sanitizeItem 夹住再 Array.from——一个坏掉的备份里出现
// defaultSets: 100000，这里就会当场铺出十万个组对象把页面卡死。
/**
 * 把模板条目铺成训练记录。
 *
 * 入参是**敌意数据**，不是内部结构：它来自 `sessionStorage` 的 preset JSON 和
 * 库里的模板，两者都由备份导入 / 手改产生，没有任何 schema 校验。
 * 不是数组就退回空列表——否则 `items.map` 抛错会让这个初始化 effect 中途死掉，
 * `setLoaded(true)` 永远执行不到，训练页会一直卡在加载态。
 */
function buildRecordsFromItems(items: unknown): ExerciseRecord[] {
  if (!Array.isArray(items)) return []
  return items
    // 数组里混进 null / 数字也要活下来：sanitizeItem 会去读 item.defaultSets
    .filter((raw): raw is TemplateItem => !!raw && typeof raw === 'object')
    .map((raw) => {
      const item = sanitizeItem(raw)
      return {
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        sets: Array.from({ length: item.defaultSets }, () => ({
          weight: undefined as number | undefined,
          reps: item.defaultReps,
          completed: false,
        })),
      }
    })
}

export default function ActiveWorkout() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const session = useLiveQuery(
    async () => {
      const raw = await db.sessions.get(sessionId!)
      return raw ? normalizeSession(raw) : raw
    },
    [sessionId],
  )
  const [exercises, setExercises] = useState<ExerciseRecord[]>([])
  const [finished, setFinished] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  // 训练不足 1 分钟被丢弃时，记下时长用来给用户一个说明页（而不是静默跳走）
  const [discardedSeconds, setDiscardedSeconds] = useState<number | null>(null)
  // 当前时间戳，每秒由下面的 interval 推进一次。
  // 用它而不是在 render 里直接 Date.now()：render 必须是纯函数
  // （react-hooks/purity），而且并发渲染下每次重渲染取到的时间会漂移。
  const [now, setNow] = useState(() => Date.now())
  const [finalElapsed, setFinalElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  const [restEndTime, setRestEndTime] = useState<number | null>(null)
  // 当前这次休息的总时长（秒），用于倒计时圆环的比例。
  // 不同动作的组间歇不同，所以不能用一个模块级常量——必须记下这次用了多久。
  const [restDuration, setRestDuration] = useState(REST_FALLBACK)
  const [distance, setDistance] = useState<string>('')
  // 有氧结束后允许修正时长。存的是「分钟」字符串，和 SessionDetail 的编辑口径一致；
  // 落库时再换算成秒。
  const [durationInput, setDurationInput] = useState<string>('')
  const [loaded, setLoaded] = useState(false)
  const restTimerRef = useRef<number | null>(null)
  const initializedForRef = useRef<string | null>(null)
  // 已经播报过的休息结束时间戳，保证同一次休息只提醒一次
  // （interval 可能在下一次重渲染清空 state 之前再跳一次）。
  const restAlertedRef = useRef<number | null>(null)
  const notifAskedRef = useRef(false)
  // 训练备注。和 exercises 一样用防抖落库——用户每敲一个字都写一次库没意义。
  const [notesInput, setNotesInput] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const notesTimerRef = useRef<number | null>(null)
  const [notifState, setNotifState] = useState<NotificationPermission | 'unsupported'>(
    () => notificationPermission()
  )
  // 动作 → 最近一次已结束训练的成绩，用于训练时显示「上次」
  const [lastPerf, setLastPerf] = useState<Record<string, { sets: SetRecord[]; date: string }>>({})
  // 本次训练所用模板的条目，用来解析每个动作的组间歇（模板值 > 动作库值 > 默认）
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([])
  // 数字滚轮选择器：点重量/次数/RPE 弹出（滑动优先，键盘次之）
  const [wheel, setWheel] = useState<{ exIdx: number; setIdx: number; field: 'weight' | 'reps' | 'rpe' } | null>(null)

  // Calculate elapsed from startTime
  const elapsed = finished
    ? finalElapsed
    : session?.startTime
      ? Math.floor((now - session.startTime) / 1000)
      : 0

  // Calculate rest remaining from end time
  const restRemaining = restEndTime ? Math.max(0, Math.ceil((restEndTime - now) / 1000)) : 0

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

  // Init from session (runs once per session)
  //
  // 关于 react-hooks/set-state-in-effect：这里是「把异步加载到的外部数据（Dexie）
  // 一次性播种成本地可编辑 state」，属于该规则明确允许的「与外部系统同步」场景——
  // 不能用 useLiveQuery 订阅，否则用户正在编辑时会被库里的旧值覆盖。
  // 代价只是挂载时多一次渲染，可接受。
  // 真正的修法是把组件拆成「加载器 + 内层」并用 key={sessionId} 重挂载，
  // 但那会牵动 initializedForRef / loaded / 防抖保存三者的耦合，风险不划算。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!session || initializedForRef.current === sessionId) return
    initializedForRef.current = sessionId ?? null

    if (session.finished) {
      setExercises(session.exercises)
      setFinalElapsed(session.duration)
      setNotesInput(session.notes ?? '')
      // 有氧的时长/距离在总结页是可编辑的，所以要把库里已有的值回填进输入框。
      // 之前只回填了 exercises，重开一条已结束的有氧记录时距离框是空的——
      // 明明存了 5km 却显示空白。
      setDurationInput(secondsToMinutesInput(session.duration))
      setDistance(session.distance != null ? String(session.distance) : '')
      setFinished(true)
      setShowSummary(true)
      setLoaded(true)
      return
    }

    if (session.exercises.length > 0) {
      setExercises(session.exercises)
      setLoaded(true)
    } else {
      // Prefer the preset prepared right before starting (it reflects any
      // last-minute edits made on the template / pre-workout screens),
      // otherwise fall back to the saved template.
      const presetKey = `preset-${sessionId}`
      const presetData = sessionStorage.getItem(presetKey)
      if (presetData) {
        // 坏 JSON 会让 JSON.parse 抛错，同样会打断初始化；解不开就当没有 preset
        let presetItems: unknown
        try {
          presetItems = JSON.parse(presetData)
        } catch {
          presetItems = null
        }
        setExercises(buildRecordsFromItems(presetItems))
        sessionStorage.removeItem(presetKey)
        setLoaded(true)
      } else if (session.templateId) {
        db.templates.get(session.templateId).then((raw) => {
          // 缺 items 的模板（坏备份）在这里补成 []，否则 .length 会抛错、
          // 整个 .then 中断，训练页永远停在加载态
          const template = raw ? normalizeTemplate(raw) : null
          if (template && template.items.length > 0) {
            setExercises(buildRecordsFromItems(template.items))
          }
          setLoaded(true)
        })
      } else {
        setLoaded(true)
      }
    }

    // Restore an in-progress rest timer
    if (session.restEndTime && session.restEndTime > Date.now()) {
      setRestEndTime(session.restEndTime)
    }
    // 备注在两条分支里都要回填：恢复一条已结束的记录，以及从中途继续的训练
    setNotesInput(session.notes ?? '')
  }, [session, sessionId])

  // 模板条目单独取一次：组间歇的解析要用它（模板值优先于动作库值）。
  // 用不到模板也能训练——那种情况回落回动作库值，再回落回默认两分半。
  useEffect(() => {
    if (!session?.templateId) return
    let cancelled = false
    db.templates.get(session.templateId).then((raw) => {
      if (cancelled) return
      setTemplateItems(raw ? normalizeTemplate(raw).items : [])
    })
    return () => {
      cancelled = true
    }
  }, [session?.templateId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Display tick: re-render every second so elapsed updates
  useEffect(() => {
    if (finished) return
    timerRef.current = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [finished])

  // Rest timer - just trigger re-renders, actual calculation is done above
  useEffect(() => {
    // 用 Date.now() 而不是 restRemaining 做这个前置判断：restRemaining 是由
    // 每秒推进的 now 派生的，把它写进依赖数组会让定时器每秒重建一次。
    if (!restEndTime || Date.now() >= restEndTime) return
    restTimerRef.current = window.setInterval(() => {
      const t = Date.now()
      setNow(t) // trigger re-render to recalculate
      if (t >= restEndTime) {
        // 后台标签页的定时器会被节流，所以这里可能在超时后才第一次命中——
        // 那也照样提醒（用户刚回到页面时正需要这个提示）。
        if (restAlertedRef.current !== restEndTime) {
          restAlertedRef.current = restEndTime
          alertRestDone()
        }
        setRestEndTime(null)
        if (restTimerRef.current) clearInterval(restTimerRef.current)
      }
    }, 1000)
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current)
    }
  }, [restEndTime])

  // Persist exercises + rest timer state whenever either changes.
  // Gated on `loaded` (not on a non-empty list) so that deleting every exercise
  // is persisted too — otherwise the UI shows 0 while the DB keeps the previous
  // state, and the deleted exercises come back on the next visit.
  useEffect(() => {
    if (finished || !loaded) return
    saveExercises(exercises, restEndTime ?? undefined)
  }, [exercises, restEndTime, finished, loaded, saveExercises])

  // 整个训练过程保持屏幕常亮——训练中伸手去点手机结果发现它锁屏了，
  // 正好抵消掉「实时记录」的意义。
  useWakeLock(!finished && loaded)

  // 「上次成绩」：该动作最近一次**已结束**训练里真正完成的组。
  // 只在进入本次训练时算一次——训练期间唯一会变的是当前这条记录，而它已被排除。
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    db.sessions
      .toArray()
      .then((all) => {
        if (cancelled) return
        const map: Record<string, { sets: SetRecord[]; date: string }> = {}
        all
          .filter((s) => s.finished && s.id !== sessionId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .forEach((s) => {
            for (const ex of s.exercises) {
              // 排除热身组：把空杆热身算进「上次成绩」会让参考值失真，
              // 用户看到的是 20kg×15，而正式组其实是 60kg×8。
              const done = ex.sets.filter(isCountedSet)
              if (done.length === 0) continue
              // 从新到旧遍历，第一次命中即为最近一次。
              // 同时按 id 和名称建索引：训练中新增的自定义动作可能带新 id。
              if (!map[ex.exerciseId]) map[ex.exerciseId] = { sets: done, date: s.date }
              if (!map[ex.exerciseName]) map[ex.exerciseName] = { sets: done, date: s.date }
            }
          })
        setLastPerf(map)
      })
      .catch(() => {
        // 读历史失败不应该影响正在进行的训练
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // 某个动作这次训练该歇多久。入参是敌意数据（模板/动作库都可能来自备份导入），
  // resolveRestSeconds 内部会夹取。
  const restFor = (exIdx: number): number => {
    const ex = exercises[exIdx]
    if (!ex) return REST_FALLBACK
    const item = templateItems.find((i) => i.exerciseId === ex.exerciseId)
    const def = allExercises.find((e) => e.id === ex.exerciseId)
    return resolveRestSeconds(item, def)
  }

  // 备注防抖落库。和 saveExercises 同一套思路：flush 在 finishWorkout 里做，
  // 否则刚敲完字就结束训练，那一段还没写进去就丢了。
  const saveNotes = useCallback((text: string) => {
    if (!sessionId) return
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = window.setTimeout(() => {
      const trimmed = text.trim()
      db.sessions.update(sessionId, { notes: trimmed || undefined })
      setNotesSaved(true)
      window.setTimeout(() => setNotesSaved(false), 1500)
    }, 400)
  }, [sessionId])

  const formatRestTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const startRest = (seconds: number) => {
    // 这里是从点击事件同步调用的，而 iOS 只允许在用户手势里解锁音频，
    // 所以必须在这一刻 prime，否则休息结束的提示音会一直是哑的。
    primeAudio()
    // 通知权限只在第一次开始休息时问一次：此刻是真实用户手势（Chrome 的硬性要求），
    // 而且「组间休息」这个上下文能让权限弹窗显得不突兀。
    if (!notifAskedRef.current && notifState === 'default') {
      notifAskedRef.current = true
      requestNotificationPermission().then(setNotifState)
    }
    restAlertedRef.current = null
    setRestDuration(seconds)
    // 用每秒推进的 now 而不是 Date.now()：后者会让 react-hooks/purity
    // 把这个函数判成「可能在渲染期调用」，报 impure function。
    // 最多差 1 秒，对休息倒计时无影响。
    setRestEndTime(now + seconds * 1000)
  }

  const skipRest = () => {
    setRestEndTime(null)
    if (restTimerRef.current) clearInterval(restTimerRef.current)
  }

  const addRestTime = (seconds: number) => {
    setRestEndTime((prev) => (prev ?? Date.now()) + seconds * 1000)
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
    // 热身组不触发休息——它本来就不该按正式组的节奏走。
    if (!wasCompleted && !exercises[exIdx].sets[setIdx].warmup) startRest(restFor(exIdx))
  }

  const updateSet = (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', value: number | undefined) => {
    if (finished) return
    setExercises(
      exercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) }
          : ex
      )
    )
  }

  // 热身标记。热身组不计入容量与有效组数，但重量/次数照记——
  // 回看时能看出当天开了多少组空杆热身。
  const toggleWarmup = (exIdx: number, setIdx: number) => {
    if (finished) return
    setExercises(
      exercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, warmup: !s.warmup } : s) }
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

  const removeExercise = (exIdx: number) => {
    if (finished) return
    setExercises(exercises.filter((_, i) => i !== exIdx))
  }

  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []
  const [selectingExercise, setSelectingExercise] = useState(false)
  const [selectTab, setSelectTab] = useState<BodyPart>('肩')
  const [customName, setCustomName] = useState('')

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)

  const addExerciseFromLib = (exerciseId: string, exerciseName: string) => {
    if (finished) return
    setExercises([
      ...exercises,
      { exerciseId, exerciseName, sets: [{ weight: undefined, reps: 12, completed: false }] },
    ])
    setSelectingExercise(false)
  }

  const addCustomExercise = async () => {
    if (finished) return
    const n = customName.trim()
    if (!n) return

    // Save to exercises library
    const id = crypto.randomUUID()
    const existing = await db.exercises.toArray()
    const nameExists = existing.find((e) => e.name === n && e.bodyPart === selectTab)
    if (!nameExists) {
      await db.exercises.add({
        id,
        name: n,
        bodyPart: selectTab,
        createdAt: Date.now(),
      })
    }

    setExercises([
      ...exercises,
      { exerciseId: nameExists?.id ?? id, exerciseName: n, sets: [{ weight: undefined, reps: 12, completed: false }] },
    ])
    setCustomName('')
    setSelectingExercise(false)
  }

  const finishWorkout = async () => {
    if (!sessionId) return
    if (timerRef.current) clearInterval(timerRef.current)
    if (restTimerRef.current) clearInterval(restTimerRef.current)
    // 丢掉还没落库的防抖写入，免得它在记录被删掉之后又 update 一次
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)

    const duration = session?.startTime
      ? Math.floor((now - session.startTime) / 1000)
      : 0

    // 不足 1 分钟的力量训练直接丢弃，不留空记录。
    // 休息日不走这条路径——它在 Home 就以 finished: true 建好，直接进详情页。
    // 有氧豁免：爬几趟楼梯就是几十秒，把记录删掉反而是丢数据（用户要能事后手改时长）。
    if (isTooShortToRecord(duration, { aerobic: session?.aerobic === true })) {
      await db.sessions.delete(sessionId)
      setDiscardedSeconds(duration)
      setFinished(true)
      return
    }

    setFinalElapsed(duration)
    setDurationInput(secondsToMinutesInput(duration))
    await db.sessions.update(sessionId, {
      // 每个动作存一份训练时生效的组间歇快照：模板/动作库之后可能被改，
      // 历史详情页要还原的是「当时歇了多久」
      exercises: exercises.map((ex, i) => ({ ...ex, restSeconds: restFor(i) })),
      duration,
      finished: true,
      restEndTime: undefined,
      distance: distance ? Number(distance) : undefined,
      // 备注和 exercises 一起 flush：刚敲完字就结束训练时，防抖还没跑完
      notes: notesInput.trim() || undefined,
    })
    setFinished(true)
    setShowSummary(true)
  }

  // 有氧结束后修正时长 / 距离。时长输入的是分钟，落库换算成秒。
  // 空值或非正数一律当作「时长未知」存 0，和 AddSession 的口径一致。
  const saveAerobicField = async (field: 'duration' | 'distance', raw: string) => {
    if (!sessionId) return
    if (field === 'duration') {
      const minutes = Number(raw)
      await db.sessions.update(sessionId, {
        duration: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0,
      })
      return
    }
    const km = Number(raw)
    await db.sessions.update(sessionId, {
      distance: raw && Number.isFinite(km) ? km : undefined,
    })
  }

  // 太短被丢弃时给一个明确的说明页——静默跳回首页会让用户以为已经存上了。
  // 必须放在下面那个加载态判断之前：记录已被删除，session 会变成 undefined。
  if (discardedSeconds !== null) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        <Header title="未记录" />
        <div className="flex-1 px-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-surface-1 border border-border flex items-center justify-center mb-5">
            <Timer size={26} className="text-muted" />
          </div>
          <h2 className="text-lg font-bold text-primary mb-2">训练不足 1 分钟</h2>
          <p className="text-secondary text-sm leading-relaxed mb-8">
            本次只练了 {formatTime(discardedSeconds)}，太短了。
            <br />
            已丢弃，没有写入训练记录。
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full max-w-xs py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  if (!session || !loaded) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <button
          onClick={() => navigate('/')}
          className="text-secondary text-sm active:text-primary transition-colors"
        >
          返回首页
        </button>
      </div>
    )
  }

  const isAerobic = session.aerobic === true

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
  const completedSets = exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0)
  // 有效组 = 已完成且非热身。进度条仍用 completedSets（它衡量「有没有都勾完」），
  // 但总结页对外展示的数字必须排除热身，否则热身会把成绩算得偏乐观。
  const workingSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(isCountedSet).length, 0)
  const completedExercises = exercises.filter((ex) => ex.sets.some(isCountedSet))
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

          <h2 className="text-2xl font-bold text-primary mb-1 animate-rise-in">训练完成</h2>
          <p className="text-secondary text-sm mb-8 animate-rise-in" style={{ animationDelay: '0.05s' }}>继续保持，你很棒</p>

          <div className={`w-full gap-3 mb-8 animate-fade-in ${isAerobic ? 'grid grid-cols-2 max-w-sm' : 'grid grid-cols-3'}`} style={{ animationDelay: '0.1s' }}>
            <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border shadow-card">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                <Clock size={18} className="text-accent-light" />
              </div>
              {isAerobic ? (
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={durationInput}
                    onChange={(e) => setDurationInput(e.target.value)}
                    onBlur={() => saveAerobicField('duration', durationInput)}
                    placeholder="0"
                    className="w-16 bg-surface-2 text-primary text-center py-1 rounded-lg text-lg font-bold outline-none border border-border font-mono placeholder:text-muted"
                  />
                  <span className="text-muted text-xs">分</span>
                </div>
              ) : (
                <p className="text-primary text-lg font-bold font-mono">{formatTime(elapsed)}</p>
              )}
              <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">时长</p>
            </div>
            {isAerobic ? (
              <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border shadow-card">
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                  <Route size={18} className="text-accent-light" />
                </div>
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    onBlur={() => saveAerobicField('distance', distance)}
                    placeholder="0"
                    step="0.1"
                    className="w-16 bg-surface-2 text-primary text-center py-1 rounded-lg text-lg font-bold outline-none border border-border font-mono placeholder:text-muted"
                  />
                  <span className="text-muted text-xs">km</span>
                </div>
                <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">距离</p>
              </div>
            ) : (
              <>
                <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border shadow-card">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                    <Dumbbell size={18} className="text-accent-light" />
                  </div>
                  <p className="text-primary text-lg font-bold">{completedExercises.length}</p>
                  <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">动作</p>
                </div>
                <div className="bg-surface-1 rounded-2xl p-4 text-center border border-border shadow-card">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2.5">
                    <ListChecks size={18} className="text-accent-light" />
                  </div>
                  <p className="text-primary text-lg font-bold">{workingSets}</p>
                  <p className="text-muted text-[10px] mt-0.5 uppercase tracking-wider">组数</p>
                </div>
              </>
            )}
          </div>

          {!isAerobic && (
            <div className="w-full space-y-3 mb-8 animate-rise-in" style={{ animationDelay: '0.2s' }}>
              {exercises.filter(ex => ex.sets.some(isCountedSet)).map((ex, idx) => {
                const doneSets = ex.sets.filter(isCountedSet)
                const warmupCount = ex.sets.filter((s) => s.warmup === true).length
                return (
                  <div key={idx} className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-accent-light">{idx + 1}</span>
                        </div>
                        <span className="text-primary font-semibold text-sm">{ex.exerciseName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {warmupCount > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 text-[10px] tabular-nums">热身 {warmupCount}</span>
                        )}
                        <span className="text-accent-light text-xs font-bold tabular-nums">{doneSets.length} 组</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 ml-9">
                      {doneSets.map((s, i) => (
                        <span key={i} className="text-[11px] bg-surface-2 text-primary px-2.5 py-1 rounded-lg font-mono border border-border">
                          {s.weight ? `${s.weight}kg` : '-'} × {s.reps ?? '-'}
                          {s.rpe != null && <span className="text-muted ml-1">@{s.rpe}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

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

      {!isAerobic && (
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between text-xs mb-2.5">
            <span className="text-secondary tabular-nums">{completedSets}/{totalSets} 组</span>
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
      )}

      {isAerobic ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
          <div className="relative w-48 h-48 mb-8">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="43" fill="none" stroke="var(--color-surface-2)" strokeWidth="5" />
              <circle
                cx="50" cy="50" r="43" fill="none"
                stroke="url(#timerGradient)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 43}`}
                strokeDashoffset="0"
                className="transition-all duration-1000 ease-linear"
              />
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-primary text-4xl font-bold font-mono tracking-tight">
                {formatTime(elapsed)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-5">
          {exercises.map((ex, exIdx) => {
            const allDone = ex.sets.every((s) => s.completed)
            const prev = lastPerf[ex.exerciseId] ?? lastPerf[ex.exerciseName]
            return (
              <div key={exIdx} className={`bg-surface-1 rounded-2xl p-4 border shadow-card transition-colors duration-300 ${allDone ? 'border-accent/30' : 'border-border'}`}>
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
                      {prev && (
                        <p className="text-muted/80 text-[10px] mt-0.5 max-w-[190px] truncate">
                          上次 {daysAgoLabel(prev.date)}：{formatPrevSets(prev.sets)}
                        </p>
                      )}
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

                {/* 最后一列必须定宽，不能写 auto：表头这格是空 span（宽 0），数据行那格是
                    CheckButton（w-9 = 36px），用 auto 会让同一套 grid-cols 算出两套列宽——
                    RPE 列整体右移 36px，标题和下面的格子对不上（实测 deltaCenter=36）。
                    表头统一 text-center，与各列居中的内容对齐。 */}
                <div className="grid grid-cols-[1.9rem_1fr_1fr_2.6rem_2.25rem] gap-1 items-center text-[10px] text-muted mb-1.5 px-0.5 uppercase tracking-wider text-center">
                  <span>组</span>
                  <span>重量</span>
                  <span>次数</span>
                  <span>RPE</span>
                  <span />
                </div>

                {ex.sets.map((set, setIdx) => (
                  <div
                    key={setIdx}
                    className={`grid grid-cols-[1.9rem_1fr_1fr_2.6rem_2.25rem] gap-1 items-center py-2 px-0.5 rounded-xl transition-colors duration-200 ${
                      set.warmup ? 'bg-amber-500/[0.05]' : set.completed ? 'bg-accent/[0.06]' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleWarmup(exIdx, setIdx)}
                      disabled={finished}
                      aria-pressed={set.warmup === true}
                      aria-label={set.warmup ? `取消第 ${setIdx + 1} 组的热身标记` : `把第 ${setIdx + 1} 组标为热身`}
                      className={`h-7 w-full rounded-md flex items-center justify-center text-[10px] font-mono transition-colors tap disabled:opacity-40 ${
                        set.warmup
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold'
                          : set.completed ? 'text-accent-light font-bold' : 'text-muted'
                      }`}
                    >
                      {set.warmup ? '热' : setIdx + 1}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWheel({ exIdx, setIdx, field: 'weight' })}
                      disabled={finished}
                      aria-label={`第 ${setIdx + 1} 组重量`}
                      className="relative bg-surface-2 text-primary text-center py-2 pr-6 rounded-lg text-sm border border-border transition-colors disabled:opacity-40 font-mono tap min-w-0 w-full"
                    >
                      {set.weight ?? <span className="text-muted">-</span>}
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted text-[10px] pointer-events-none">kg</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWheel({ exIdx, setIdx, field: 'reps' })}
                      disabled={finished}
                      aria-label={`第 ${setIdx + 1} 组次数`}
                      className="bg-surface-2 text-primary text-center py-2 rounded-lg text-sm border border-border transition-colors disabled:opacity-40 font-mono tap min-w-0"
                    >
                      {set.reps ?? <span className="text-muted">-</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWheel({ exIdx, setIdx, field: 'rpe' })}
                      disabled={finished}
                      aria-label={`第 ${setIdx + 1} 组 RPE`}
                      className="bg-surface-2 text-primary text-center py-2 rounded-lg text-xs border border-border transition-colors disabled:opacity-40 font-mono tap min-w-0"
                    >
                      {set.rpe ?? <span className="text-muted text-[10px]">RPE</span>}
                    </button>
                    <div className="flex justify-center">
                      <CheckButton checked={set.completed} onClick={() => toggleSet(exIdx, setIdx)} />
                    </div>
                  </div>
                ))}
                {!finished && (
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="text-red-500 dark:text-red-400 text-[10px] mt-2 px-2 py-1 rounded-lg active:bg-red-500/10 transition-colors"
                  >
                    删除这个动作
                  </button>
                )}
              </div>
            )
          })}

          {!finished && (
            <button
              onClick={() => setSelectingExercise(true)}
              className="w-full py-3.5 border border-dashed border-surface-3 rounded-2xl text-secondary text-sm active:bg-surface-1 transition-colors tap-soft"
            >
              + 添加动作
            </button>
          )}

          {/* 训练备注。当场记下「今天肩不舒服」「换了器械」，
              回看重量下滑时能对上原因——事后想不起来是常事。 */}
          <div className="bg-surface-1 rounded-2xl p-4 border border-border shadow-card">
            <h3 className="text-primary font-semibold text-sm mb-2.5">训练备注</h3>
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value.slice(0, MAX_NOTES_LENGTH))}
              onBlur={() => saveNotes(notesInput)}
              placeholder="今天的状态、不适、器械调整…"
              rows={2}
              disabled={finished}
              className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted resize-none disabled:opacity-40"
            />
            {notesSaved && <p className="text-accent text-[10px] mt-1.5">已保存</p>}
          </div>
        </div>
      )}

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
                strokeDashoffset={`${2 * Math.PI * 43 * (1 - restRemaining / restDuration)}`}
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

          <div className="flex gap-2.5 mb-8 px-4">
            <button
              onClick={() => addRestTime(30)}
              className="px-4 py-2.5 bg-surface-1 text-primary rounded-xl text-sm font-medium border border-border active:bg-surface-2 transition-colors"
            >
              +30秒
            </button>
            <button
              onClick={() => addRestTime(60)}
              className="px-4 py-2.5 bg-surface-1 text-primary rounded-xl text-sm font-medium border border-border active:bg-surface-2 transition-colors"
            >
              +1分钟
            </button>
          </div>

          {notifState !== 'granted' && (
            <p className="text-muted text-[10px] -mt-4 mb-6 px-10 text-center leading-relaxed">
              {notifState === 'denied'
                ? '通知已被拒绝，休息结束只会有震动和提示音'
                : '锁屏或切到后台时可能收不到提醒，建议允许通知'}
            </p>
          )}

          <button
            onClick={skipRest}
            className="px-10 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold rounded-2xl active:from-emerald-700 active:to-emerald-600 transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            跳过休息
          </button>

          <button
            onClick={finishWorkout}
            className="mt-4 text-muted text-xs active:text-secondary transition-colors"
          >
            结束训练
          </button>
        </div>
      )}

      {selectingExercise && (
        <div className="fixed inset-0 z-50 bg-surface-0 flex justify-center animate-fade-in">
          <div className="flex h-full w-full max-w-lg flex-col">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-surface-0/80 backdrop-blur-xl">
            <h3 className="text-primary font-semibold">选择动作</h3>
            <button onClick={() => { setSelectingExercise(false); setCustomName('') }} aria-label="关闭" className="p-1.5 rounded-lg active:bg-surface-2 tap">
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
                className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center active:bg-accent/20 disabled:opacity-30 tap"
              >
                <Check size={18} className="text-accent" />
              </button>
            </div>
          </div>

          <div className="flex overflow-x-auto gap-2 px-4 py-3 border-b border-border no-scrollbar">
            {BODY_PARTS.map((bp) => {
              const m = bodyPartMeta(bp)
              const TabIcon = m.icon
              const active = selectTab === bp
              return (
                <button
                  key={bp}
                  onClick={() => setSelectTab(bp)}
                  aria-pressed={active}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 tap ${
                    active
                      ? `bg-gradient-to-r ${m.gradient} text-white shadow-md shadow-black/10`
                      : 'bg-surface-1 text-secondary border border-border active:bg-surface-2'
                  }`}
                >
                  <TabIcon size={14} className={active ? 'text-white' : m.text} />
                  {bp}
                </button>
              )
            })}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filteredExercises.map((ex, idx) => {
              const m = bodyPartMeta(ex.bodyPart)
              const ExIcon = m.icon
              return (
                <button
                  key={ex.id}
                  onClick={() => addExerciseFromLib(ex.id, ex.name)}
                  className="w-full flex items-center gap-3 text-left p-3.5 bg-surface-1 rounded-2xl mb-2 active:bg-surface-2 border border-border shadow-card tap-soft animate-pop-in"
                  style={{ animationDelay: `${Math.min(idx, 8) * 0.03}s` }}
                >
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${m.soft}`}>
                    <ExIcon size={15} className={m.text} />
                  </span>
                  <span className="text-primary text-sm font-medium flex-1">{ex.name}</span>
                </button>
              )
            })}
          </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-lg p-4 bg-surface-0/80 backdrop-blur-xl border-t border-border">
        <button
          onClick={finishWorkout}
          className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 text-white font-semibold rounded-2xl transition-all duration-200 shadow-glow tap flex items-center justify-center gap-2"
        >
          <Zap size={18} />
          结束训练
        </button>
      </div>

      {/* 重量 / 次数 / RPE 的滚轮选择器。滑动选值为主，底部可切到键盘直接输入。
          z-[70] 压在休息遮罩（z-50）之上：休息中顺手改一下上一组的 RPE 是常事。 */}
      {wheel && (
        <NumberWheel
          title={WHEEL_CFG[wheel.field].title}
          value={exercises[wheel.exIdx]?.sets[wheel.setIdx]?.[wheel.field]}
          min={WHEEL_CFG[wheel.field].min}
          max={WHEEL_CFG[wheel.field].max}
          step={WHEEL_CFG[wheel.field].step}
          unit={WHEEL_CFG[wheel.field].unit}
          clearable
          onClose={() => setWheel(null)}
          onConfirm={(v) => {
            if (!wheel) return
            updateSet(wheel.exIdx, wheel.setIdx, wheel.field, wheel.field === 'rpe' ? clampRpe(v) : v)
          }}
        />
      )}
    </div>
  )
}