// 训练记录的写入门槛。

import type { WorkoutSession } from '../types'

// 少于 1 分钟的训练视为误触或试手，不写入记录。
export const MIN_SESSION_SECONDS = 60

/**
 * 是否短到不该留记录。
 *
 * duration 为 0 表示「时长未知」——手动补录时用户可能根本不记得练了多久，
 * 这种记录是合法的，不能拿 0 去和门槛比。
 * 只有「明确记录了时长、但不足 1 分钟」才拦。
 */
export const isTooShortToRecord = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 && seconds < MIN_SESSION_SECONDS

/**
 * 把从库里读出来的记录补成「字段一定存在」的形状。
 *
 * `Settings` 的备份导入是 `JSON.parse` + `bulkAdd`，对内容零校验，所以库里
 * 完全可能出现缺字段的记录（手改过的备份、别的版本导出的文件）。而
 * `s.exercises.reduce(...)` / `for (const ex of s.exercises)` / `s.exercises.length`
 * 散落在 Home、History、Stats、SessionDetail、ActiveWorkout 五处，
 * `ex.sets.filter(...)` / `ex.sets.reduce(...)` 也散落在其中四处——任意一处读到
 * undefined 都会抛 TypeError，React 整棵树挂掉，页面直接空白。
 *
 * 所以兜底放在**读取边界**上，而不是逐个消费点写 `?? []`：新增读取字段时不会再漏。
 * 只夹写入侧是不够的——库里已有的坏数据照样能炸。
 *
 * 没有实际改动时返回**原对象**，避免下游 useMemo / useLiveQuery 白重渲染。
 */
export function normalizeSession(s: WorkoutSession): WorkoutSession {
  const exercises = Array.isArray(s.exercises) ? s.exercises : []
  let changed = exercises !== s.exercises
  const fixed = exercises.map((ex) => {
    if (Array.isArray(ex.sets)) return ex
    changed = true
    return { ...ex, sets: [] }
  })
  return changed ? { ...s, exercises: fixed } : s
}

