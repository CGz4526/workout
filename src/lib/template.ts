import type { TemplateItem, WorkoutTemplate } from '../types'

// 组数 / 次数的合法区间。

export const MIN_ITEM_COUNT = 1
export const MAX_SETS = 20
export const MAX_REPS = 100

export type CountField = 'defaultSets' | 'defaultReps'

const UPPER_BOUND: Record<CountField, number> = {
  defaultSets: MAX_SETS,
  defaultReps: MAX_REPS,
}

/**
 * 把组数 / 次数夹进合法区间。
 *
 * 上限不是洁癖。`ActiveWorkout` 会拿 `defaultSets` 去 `Array.from({ length })`
 * 铺出等量的组并全部渲染，而组数有两个不受源码控制的来源：
 *   1. `Settings.tsx` 的备份导入——`JSON.parse` 之后直接 `bulkAdd`，没有任何校验；
 *   2. `sessionStorage` 里的 preset JSON。
 * 只要其中一个带来 `defaultSets: 100000`，开始训练就会当场把页面卡死。
 * 所以在「写入」（步进器）和「消费」（ActiveWorkout）两侧都要夹。
 *
 * 非有限数（NaN / Infinity / undefined 转出来的）一律退回下限，不抛错——
 * 这里的目标是让 UI 活下来，不是报错。
 */
export function clampItemCount(field: CountField, value: number): number {
  if (!Number.isFinite(value)) return MIN_ITEM_COUNT
  return Math.min(UPPER_BOUND[field], Math.max(MIN_ITEM_COUNT, Math.round(value)))
}

/** 步进器：在 value 基础上加减 delta 后夹住。 */
export function stepItemCount(field: CountField, value: number, delta: number): number {
  return clampItemCount(field, value + delta)
}

/** 把整条动作的 sets / reps 都夹一遍。用于消费外部来源的数据。 */
export function sanitizeItem(item: TemplateItem): TemplateItem {
  return {
    ...item,
    defaultSets: clampItemCount('defaultSets', item.defaultSets),
    defaultReps: clampItemCount('defaultReps', item.defaultReps),
  }
}

/**
 * 把从库里读出来的模板补成「字段一定存在」的形状。
 *
 * 与 `normalizeSession` 同一个理由：备份导入零校验，缺 `items` 的模板完全可能
 * 存在。而 `for (const item of t.items)`（`Templates.getDominantBodyPart`）会抛
 * `TypeError: t.items is not iterable`、`t.items.reduce(...)` / `t.items.map(...)`
 * 也会抛——Home 与 Templates 两个页面会**整页白屏**。
 *
 * 兜底放在读取边界，新增消费点不会再漏。没改动时返回原对象，避免多余的重渲染。
 */
export function normalizeTemplate(t: WorkoutTemplate): WorkoutTemplate {
  if (Array.isArray(t.items)) return t
  return { ...t, items: [] }
}
