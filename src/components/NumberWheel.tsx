import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, Keyboard as KeyboardIcon } from 'lucide-react'

// 一行的高度。中选行的位置和「第 i 项该滚到哪里」都按它算，改这一个值即可。
const ITEM_H = 44

export interface NumberWheelProps {
  open: boolean
  title: string
  value: number | undefined
  min: number
  max: number
  /** 步长，默认 1。0.5 这类小数步长会按两位小数取整，避免浮点误差。 */
  step?: number
  /** 数字后面的单位，如 kg / 次 */
  unit?: string
  /** 自定义显示（组间歇用 formatRest 显示「2分30秒」） */
  format?: (v: number) => string
  /** 允许留空（重量可以空着 = 自重），底部多一个「清空」 */
  clearable?: boolean
  onClose: () => void
  onConfirm: (v: number | undefined) => void
}

/**
 * iOS 风格的滚轮数字选择器（底部浮层）。
 *
 * 主交互是滑动选择；右上角可切到「键盘」直接输入（用户要的是「滑动优先、输入次之」）。
 * 滚轮用 CSS scroll-snap 实现，不引第三方依赖——iOS Safari 16+ 支持良好。
 */
export default function NumberWheel({
  open,
  title,
  value,
  min,
  max,
  step = 1,
  unit,
  format,
  clearable,
  onClose,
  onConfirm,
}: NumberWheelProps) {
  // 用整数索引累加再除以 100，避免 0.5 步长累加出 6.499999999 这种值
  const values = useMemo(() => {
    const n = Math.max(0, Math.round((max - min) / step))
    return Array.from({ length: n + 1 }, (_, i) => Math.round((min + i * step) * 100) / 100)
  }, [min, max, step])

  const [idx, setIdx] = useState(0)
  const [keyboard, setKeyboard] = useState(false)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const stopRef = useRef<number | null>(null)
  const readyRef = useRef(false)

  // 打开时：定位到当前值（取最接近的一项，库里可能有不在步长网格上的历史值）
  useEffect(() => {
    if (!open) return
    let target = 0
    if (value !== undefined) {
      let best = Infinity
      values.forEach((v, i) => {
        const d = Math.abs(v - value)
        if (d < best) {
          best = d
          target = i
        }
      })
    }
    setIdx(target)
    setKeyboard(false)
    setDraft(value === undefined ? '' : String(value))
    readyRef.current = false
    const raf = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = target * ITEM_H
      // 程序化滚动也会触发 scroll 事件，先让它们消化掉再开始监听
      window.setTimeout(() => {
        readyRef.current = true
      }, 90)
    })
    return () => cancelAnimationFrame(raf)
  }, [open, value, values])

  useEffect(() => () => { if (stopRef.current) window.clearTimeout(stopRef.current) }, [])

  // 滚动停止（110ms 无新事件）后再更新中选值，避免滚动过程中疯狂重渲染
  const onScroll = () => {
    if (!readyRef.current) return
    if (stopRef.current) window.clearTimeout(stopRef.current)
    stopRef.current = window.setTimeout(() => {
      const el = listRef.current
      if (!el) return
      setIdx(Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H))))
    }, 110)
  }

  const scrollTo = (i: number) => {
    setIdx(i)
    listRef.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const confirm = () => {
    if (keyboard) {
      const raw = draft.trim()
      if (!raw) {
        onConfirm(clearable ? undefined : values[0])
        onClose()
        return
      }
      const n = Number(raw)
      if (!Number.isFinite(n)) {
        onClose()
        return
      }
      onConfirm(clamp(Math.round(n * 100) / 100))
    } else {
      onConfirm(values[idx])
    }
    onClose()
  }

  if (!open) return null
  const label = (v: number) => (format ? format(v) : String(v))

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <button
        type="button"
        aria-label="关闭选择器"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 animate-fade-in"
      />
      <div
        className="relative mx-auto w-full max-w-lg bg-surface-1 rounded-t-3xl border-t border-border shadow-raised animate-sheet-up"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="pt-2.5 flex justify-center">
          <span className="w-9 h-1 rounded-full bg-surface-3" />
        </div>

        <div className="flex items-center justify-between px-4 h-12">
          <button type="button" onClick={onClose} className="text-secondary text-sm tap px-2 py-1 -ml-2 rounded-lg">
            取消
          </button>
          <span className="text-primary font-semibold text-sm">{title}</span>
          <button
            type="button"
            onClick={confirm}
            className="text-accent-light text-sm font-semibold tap px-2 py-1 -mr-2 rounded-lg"
          >
            完成
          </button>
        </div>

        {keyboard ? (
          <div className="h-[220px] flex flex-col items-center justify-center px-8">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="—"
              className="w-full text-center text-4xl font-mono bg-transparent text-primary outline-none border-b-2 border-accent/35 pb-2 placeholder:text-muted/50"
            />
            {unit && <span className="text-muted text-xs mt-2">{unit}</span>}
          </div>
        ) : (
          <div className="relative h-[220px] overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-surface-1 to-transparent z-10" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface-1 to-transparent z-10" />
            <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 h-11 rounded-xl bg-accent/[0.07] border-y border-accent/25 z-10" />
            <div ref={listRef} onScroll={onScroll} className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory">
              {/* 上下留白，让首尾项也能滚到中选位 */}
              <div className="snap-none" style={{ height: ITEM_H * 2 }} />
              {values.map((v, i) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => scrollTo(i)}
                  className="snap-center w-full flex items-center justify-center transition-all duration-150"
                  style={{ height: ITEM_H }}
                >
                  <span
                    className={
                      i === idx
                        ? 'text-primary text-2xl font-bold font-mono'
                        : 'text-muted text-lg font-mono'
                    }
                  >
                    {label(v)}
                  </span>
                  {unit && i === idx && <span className="text-muted text-xs ml-1.5">{unit}</span>}
                </button>
              ))}
              <div className="snap-none" style={{ height: ITEM_H * 2 }} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 pt-1">
          <button
            type="button"
            onClick={() => setKeyboard((k) => !k)}
            className="flex items-center gap-1.5 text-secondary text-xs tap px-2.5 py-1.5 rounded-lg"
          >
            {keyboard ? <Gauge size={13} /> : <KeyboardIcon size={13} />}
            {keyboard ? '滚轮' : '键盘'}
          </button>
          {clearable && (
            <button
              type="button"
              onClick={() => {
                onConfirm(undefined)
                onClose()
              }}
              className="text-muted text-xs tap px-2.5 py-1.5 rounded-lg"
            >
              清空
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
