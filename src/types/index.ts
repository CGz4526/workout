export interface Exercise {
  id: string
  name: string
  bodyPart: string
  description?: string
  createdAt?: number
}

export interface TemplateItem {
  exerciseId: string
  exerciseName: string
  defaultSets: number
  defaultReps: number
}

export interface WorkoutTemplate {
  id: string
  name: string
  items: TemplateItem[]
}

export interface SetRecord {
  weight?: number
  reps?: number
  completed: boolean
}

export interface ExerciseRecord {
  exerciseId: string
  exerciseName: string
  sets: SetRecord[]
}

export interface WorkoutSession {
  id: string
  templateId?: string
  templateName?: string
  date: string
  duration: number
  exercises: ExerciseRecord[]
  finished?: boolean
  startTime?: number // timestamp when workout started (for continuous timer)
  restEndTime?: number // timestamp when rest ends (for background timer)
  photos?: string[] // base64 encoded images, max 3
  weight?: number // body weight in kg
  aerobic?: boolean // true for aerobic exercises (running, swimming)
  distance?: number // distance in km for aerobic exercises
  diet?: 'low' | 'mid' | 'high' | 'cheat' // carbon cycling diet
}

export const BODY_PARTS = ['肩', '胸', '背', '腿', '二头', '三头', '核心'] as const
export type BodyPart = (typeof BODY_PARTS)[number]
