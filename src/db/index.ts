import Dexie, { type EntityTable } from 'dexie'
import type { Exercise, WorkoutTemplate, WorkoutSession } from '../types'

const db = new Dexie('WorkoutDB') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  templates: EntityTable<WorkoutTemplate, 'id'>
  sessions: EntityTable<WorkoutSession, 'id'>
}

db.version(1).stores({
  exercises: 'id, bodyPart',
  templates: 'id',
  sessions: 'id, date',
})

const DEFAULT_EXERCISES: Exercise[] = [
  // 肩
  { id: 'ex-1', name: '绳索面拉', bodyPart: '肩' },
  { id: 'ex-2', name: '哑铃推举', bodyPart: '肩' },
  { id: 'ex-3', name: '哑铃侧平举', bodyPart: '肩' },
  { id: 'ex-4', name: '反向飞鸟', bodyPart: '肩' },
  { id: 'ex-5', name: '绳索Y举', bodyPart: '肩' },
  // 胸
  { id: 'ex-6', name: '杠铃卧推', bodyPart: '胸' },
  { id: 'ex-7', name: '上斜卧推', bodyPart: '胸' },
  { id: 'ex-8', name: '杠铃夹胸', bodyPart: '胸' },
  { id: 'ex-9', name: '绳索夹胸', bodyPart: '胸' },
  { id: 'ex-10', name: '双杠臂屈伸', bodyPart: '胸' },
  { id: 'ex-11', name: '哑铃飞鸟', bodyPart: '胸' },
  // 背
  { id: 'ex-12', name: '引体向上', bodyPart: '背' },
  { id: 'ex-13', name: '大剪刀下拉', bodyPart: '背' },
  { id: 'ex-14', name: '坐姿划船', bodyPart: '背' },
  { id: 'ex-15', name: '高位下拉', bodyPart: '背' },
  { id: 'ex-16', name: '绳索单臂下拉', bodyPart: '背' },
  // 腿
  { id: 'ex-17', name: '深蹲', bodyPart: '腿' },
  { id: 'ex-18', name: '硬拉', bodyPart: '腿' },
  { id: 'ex-19', name: '保加利亚深蹲', bodyPart: '腿' },
  { id: 'ex-20', name: '倒蹬', bodyPart: '腿' },
  { id: 'ex-21', name: '腿弯举', bodyPart: '腿' },
  { id: 'ex-22', name: '内收肌', bodyPart: '腿' },
  // 二头
  { id: 'ex-23', name: '杠铃弯举', bodyPart: '二头' },
  { id: 'ex-24', name: '锤式弯举', bodyPart: '二头' },
  { id: 'ex-25', name: '三面弯举', bodyPart: '二头' },
  // 三头
  { id: 'ex-26', name: '绳索下压', bodyPart: '三头' },
  { id: 'ex-27', name: '窄推', bodyPart: '三头' },
  // 核心
  { id: 'ex-28', name: '悬垂举腿', bodyPart: '核心' },
  { id: 'ex-29', name: '跪拜龙门架', bodyPart: '核心' },
  { id: 'ex-30', name: '卷腹', bodyPart: '核心' },
  { id: 'ex-31', name: '俄罗斯转体', bodyPart: '核心' },
]

const DEFAULT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'tpl-shoulder',
    name: '肩训日',
    items: [
      { exerciseId: 'ex-1', exerciseName: '绳索面拉', defaultSets: 4, defaultReps: 12 },
      { exerciseId: 'ex-2', exerciseName: '哑铃推举', defaultSets: 4, defaultReps: 10 },
      { exerciseId: 'ex-3', exerciseName: '哑铃侧平举', defaultSets: 4, defaultReps: 15 },
      { exerciseId: 'ex-4', exerciseName: '反向飞鸟', defaultSets: 3, defaultReps: 15 },
      { exerciseId: 'ex-5', exerciseName: '绳索Y举', defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    id: 'tpl-chest',
    name: '胸训日',
    items: [
      { exerciseId: 'ex-6', exerciseName: '杠铃卧推', defaultSets: 4, defaultReps: 10 },
      { exerciseId: 'ex-7', exerciseName: '上斜卧推', defaultSets: 4, defaultReps: 10 },
      { exerciseId: 'ex-8', exerciseName: '杠铃夹胸', defaultSets: 3, defaultReps: 12 },
      { exerciseId: 'ex-9', exerciseName: '绳索夹胸', defaultSets: 3, defaultReps: 15 },
      { exerciseId: 'ex-10', exerciseName: '双杠臂屈伸', defaultSets: 3, defaultReps: 10 },
      { exerciseId: 'ex-11', exerciseName: '哑铃飞鸟', defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    id: 'tpl-back',
    name: '背训日',
    items: [
      { exerciseId: 'ex-12', exerciseName: '引体向上', defaultSets: 4, defaultReps: 8 },
      { exerciseId: 'ex-13', exerciseName: '大剪刀下拉', defaultSets: 4, defaultReps: 12 },
      { exerciseId: 'ex-14', exerciseName: '坐姿划船', defaultSets: 4, defaultReps: 12 },
      { exerciseId: 'ex-15', exerciseName: '高位下拉', defaultSets: 3, defaultReps: 12 },
      { exerciseId: 'ex-16', exerciseName: '绳索单臂下拉', defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    id: 'tpl-leg',
    name: '腿训日',
    items: [
      { exerciseId: 'ex-17', exerciseName: '深蹲', defaultSets: 4, defaultReps: 10 },
      { exerciseId: 'ex-18', exerciseName: '硬拉', defaultSets: 4, defaultReps: 8 },
      { exerciseId: 'ex-19', exerciseName: '保加利亚深蹲', defaultSets: 3, defaultReps: 10 },
      { exerciseId: 'ex-20', exerciseName: '倒蹬', defaultSets: 4, defaultReps: 12 },
      { exerciseId: 'ex-21', exerciseName: '腿弯举', defaultSets: 3, defaultReps: 12 },
      { exerciseId: 'ex-22', exerciseName: '内收肌', defaultSets: 3, defaultReps: 15 },
    ],
  },
  {
    id: 'tpl-biceps',
    name: '二头训练',
    items: [
      { exerciseId: 'ex-23', exerciseName: '杠铃弯举', defaultSets: 4, defaultReps: 10 },
      { exerciseId: 'ex-24', exerciseName: '锤式弯举', defaultSets: 4, defaultReps: 12 },
      { exerciseId: 'ex-25', exerciseName: '三面弯举', defaultSets: 3, defaultReps: 10 },
    ],
  },
  {
    id: 'tpl-triceps',
    name: '三头训练',
    items: [
      { exerciseId: 'ex-26', exerciseName: '绳索下压', defaultSets: 4, defaultReps: 12 },
      { exerciseId: 'ex-27', exerciseName: '窄推', defaultSets: 4, defaultReps: 10 },
    ],
  },
  {
    id: 'tpl-core',
    name: '核心训练',
    items: [
      { exerciseId: 'ex-28', exerciseName: '悬垂举腿', defaultSets: 3, defaultReps: 12 },
      { exerciseId: 'ex-29', exerciseName: '跪拜龙门架', defaultSets: 3, defaultReps: 12 },
      { exerciseId: 'ex-30', exerciseName: '卷腹', defaultSets: 3, defaultReps: 20 },
      { exerciseId: 'ex-31', exerciseName: '俄罗斯转体', defaultSets: 3, defaultReps: 15 },
    ],
  },
]

export async function initDB() {
  // Always ensure default exercises exist
  const existingExIds = new Set((await db.exercises.toArray()).map((e) => e.id))
  const missingExercises = DEFAULT_EXERCISES.filter((e) => !existingExIds.has(e.id))
  if (missingExercises.length > 0) {
    await db.exercises.bulkAdd(missingExercises)
  }

  // Ensure templates have exercises with exerciseName field
  const existingTemplates = await db.templates.toArray()
  const needsReset =
    existingTemplates.length === 0 ||
    existingTemplates.some(
      (t) =>
        t.items.length === 0 ||
        t.items.some((item) => !(item as any).exerciseName)
    )
  if (needsReset) {
    await db.templates.clear()
    await db.templates.bulkAdd(DEFAULT_TEMPLATES)
  }
}

export { db }
