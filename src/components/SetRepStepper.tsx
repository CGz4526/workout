import { Minus, Plus } from 'lucide-react'
import type { CountField } from '../lib/template'

// 数字格的宽度。次数上限 100（3 位数），要留够两边留白；组数上限 20，两位就够。
const SETS_CELL = 'w-8'
const REPS_CELL = 'w-10'

function Stepper({
  value,
  cell,
  label,
  onStep,
}: {
  value: number
  cell: string
  label: string
  onStep: (delta: number) => void
}) {
  const btn =
    'w-7 h-7 rounded-lg flex items-center justify-center text-secondary active:bg-surface-3 active:text-primary transition-colors tap'
  return (
    <div className="flex items-center gap-0.5 bg-surface-2 rounded-xl p-0.5 shrink-0">
      <button type="button" onClick={() => onStep(-1)} aria-label={`减少${label}`} className={btn}>
        <Minus size={14} />
      </button>
      {/* 数字用正文字体 + tabular-nums：等宽数字保证加减时不抖动，
          但不引 mono 字体栈——这一行里只有它是 mono 的话会显得突兀，
          而且旁边的中文标签落在 CJK 回退字体上，两种字体混在一起更明显。 */}
      <span className={`${cell} text-center text-sm text-primary tabular-nums`}>{value}</span>
      <button type="button" onClick={() => onStep(1)} aria-label={`增加${label}`} className={btn}>
        <Plus size={14} />
      </button>
    </div>
  )
}

export interface SetRepStepperProps {
  sets: number
  reps: number
  onStep: (field: CountField, delta: number) => void
  className?: string
}

/**
 * 「组数 × 次数」的双步进器。
 *
 * 以前是塞在动作行右侧的一个紧凑 pill（`− 3 + × − 12 +`）：在 390px 宽的手机上
 * 它占掉 161px，把动作名挤到 43px 被截断；数字格只有 20/24px 宽，上限值
 * 「20」「100」左右各只剩 2–3px 留白；数字还是 font-mono，和旁边中文对不上。
 *
 * 现在拆成带标签的独立一行（组数 / 次数），数字格加宽、去掉 mono、按钮加大到
 * 28px。DOM 结构保持「减号按钮 [数字span] 加号按钮」相邻——测试与既有习惯都依赖它。
 */
export default function SetRepStepper({ sets, reps, onStep, className = '' }: SetRepStepperProps) {
  return (
    // 外层 flex-wrap 是安全网，不是布局意图：320px 视口（iPhone SE 一代）下这一行内容
    // 需要 276px（组数 128 + gap 12 + 次数 136——次数格比组数格宽 8px，因为上限是三位数），
    // 而外层行只有 270px，差 6px 会溢出；用户把系统字号调大时同理。375/390 下始终单行
    // （325/340 ≥ 276），外观与不加 wrap 一致。两组各自包一层，保证换行发生在**组与组之间**——
    // 否则会出现「组数 [− 20 +] 次数」/「[− 100 +]」这种标签与控制项被拆散的难看折行。
    // 实测（tmp-shots/shot5-measure.js，走 CDP Emulation 真机宽度）：280px / 320px 折 2 行、
    // 两组各占一行、scrollWidth−clientWidth = 0；375px / 390px 单行、over 0。
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-secondary">组数</span>
        <Stepper value={sets} cell={SETS_CELL} label="组数" onStep={(d) => onStep('defaultSets', d)} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-secondary">次数</span>
        <Stepper value={reps} cell={REPS_CELL} label="次数" onStep={(d) => onStep('defaultReps', d)} />
      </div>
    </div>
  )
}
