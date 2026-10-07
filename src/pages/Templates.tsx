import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Edit3, X, Minus, Plus as PlusIcon, Shield, Heart, ArrowBigUp, Footprints, Target, Zap, Flame, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type TemplateItem, type WorkoutTemplate } from '../types'
import Header from '../components/Header'

const BODY_PART_META: Record<string, { gradient: string; icon: React.ElementType }> = {
  '肩':   { gradient: 'from-orange-500 to-amber-500', icon: Shield },
  '胸':   { gradient: 'from-red-500 to-rose-500',     icon: Heart },
  '背':   { gradient: 'from-blue-500 to-cyan-500',    icon: ArrowBigUp },
  '腿':   { gradient: 'from-purple-500 to-violet-500', icon: Footprints },
  '二头': { gradient: 'from-pink-500 to-fuchsia-500',  icon: Target },
  '三头': { gradient: 'from-teal-500 to-emerald-500',  icon: Zap },
  '核心': { gradient: 'from-yellow-500 to-orange-500', icon: Flame },
}

export default function Templates() {
  const templates = useLiveQuery(() => db.templates.toArray()) ?? []
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [items, setItems] = useState<TemplateItem[]>([])
  const [selectingExercise, setSelectingExercise] = useState(false)
  const [selectTab, setSelectTab] = useState<BodyPart>('肩')
  const [customName, setCustomName] = useState('')

  const filteredExercises = allExercises.filter((e) => e.bodyPart === selectTab)

  const addExercise = (exerciseId: string) => {
    if (items.some((i) => i.exerciseId === exerciseId)) return
    const ex = allExercises.find((e) => e.id === exerciseId)
    setItems([...items, { exerciseId, exerciseName: ex?.name ?? '未知动作', defaultSets: 4, defaultReps: 12 }])
    setSelectingExercise(false)
  }

  const addCustomExercise = async () => {
    const n = customName.trim()
    if (!n) return

    const id = crypto.randomUUID()
    const existing = await db.exercises.toArray()
    const nameExists = existing.find((e) => e.name === n && e.bodyPart === selectTab)
    if (!nameExists) {
      await db.exercises.add({ id, name: n, bodyPart: selectTab, createdAt: Date.now() })
    }

    setItems([...items, { exerciseId: nameExists?.id ?? id, exerciseName: n, defaultSets: 4, defaultReps: 12 }])
    setCustomName('')
    setSelectingExercise(false)
  }

  const updateItem = (idx: number, field: 'defaultSets' | 'defaultReps', delta: number) => {
    setItems(
      items.map((item, i) =>
        i === idx
          ? { ...item, [field]: Math.max(1, item[field] + delta) }
          : item
      )
    )
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!name.trim() || items.length === 0) return
    if (editingId) {
      await db.templates.update(editingId, { name: name.trim(), items })
    } else {
      await db.templates.add({
        id: crypto.randomUUID(),
        name: name.trim(),
        items,
      })
    }
    setName('')
    setItems([])
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (template: WorkoutTemplate) => {
    setEditingId(template.id)
    setName(template.name)
    setItems([...template.items])
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await db.templates.delete(id)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setName('')
    setItems([])
  }

  const getDominantBodyPart = (template: typeof templates[0]) => {
    const counts: Record<string, number> = {}
    for (const item of template.items) {
      const ex = allExercises.find((e) => e.id === item.exerciseId)
      if (ex) counts[ex.bodyPart] = (counts[ex.bodyPart] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '肩'
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header
        title="训练模板"
        rightAction={
          <button
            onClick={() => { setEditingId(null); setName(''); setItems([]); setShowForm(true) }}
            className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center active:bg-accent/20 transition-colors"
          >
            <Plus size={18} className="text-accent-light" />
          </button>
        }
      />

      {showForm && (
        <div className="px-4 py-4 border-b border-border bg-surface-1/50 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-primary font-semibold text-sm">{editingId ? '编辑模板' : '新建模板'}</h3>
            <button onClick={handleCancel} className="p-1.5 rounded-lg active:bg-surface-2">
              <X size={18} className="text-secondary" />
            </button>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="模板名称（如：肩训日）"
            className="w-full bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm mb-4 outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted"
          />

          <div className="space-y-2 mb-4">
            {items.map((item, idx) => {
              return (
                <div key={item.exerciseId} className="flex items-center gap-3 bg-surface-2 rounded-xl p-3 border border-border">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-accent-light">{idx + 1}</span>
                  </div>
                  <span className="flex-1 text-primary text-sm font-medium">{item.exerciseName}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateItem(idx, 'defaultSets', -1)} className="p-1 rounded-md text-secondary active:bg-surface-3"><Minus size={13} /></button>
                    <span className="text-primary text-xs w-14 text-center font-mono">{item.defaultSets}×{item.defaultReps}</span>
                    <button onClick={() => updateItem(idx, 'defaultSets', 1)} className="p-1 rounded-md text-secondary active:bg-surface-3"><PlusIcon size={13} /></button>
                  </div>
                  <button onClick={() => removeItem(idx)} className="p-1.5 rounded-md text-muted active:text-red-400 active:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setSelectingExercise(true)}
            className="w-full py-3 border border-dashed border-surface-3 rounded-xl text-secondary text-sm mb-4 active:bg-surface-2 transition-colors"
          >
            + 添加动作
          </button>

          <button
            onClick={handleSave}
            disabled={!name.trim() || items.length === 0}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 disabled:from-surface-2 disabled:to-surface-2 disabled:text-muted text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
          >
            {editingId ? '保存修改' : '保存模板'}
          </button>
        </div>
      )}

      {selectingExercise && (
        <div className="fixed inset-0 z-50 bg-surface-0 flex flex-col animate-scale-in">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-surface-0/80 backdrop-blur-xl">
            <h3 className="text-primary font-semibold">选择动作</h3>
            <button onClick={() => { setSelectingExercise(false); setCustomName('') }} className="p-1.5 rounded-lg active:bg-surface-2">
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
                className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center active:bg-accent/20 disabled:opacity-30"
              >
                <Check size={18} className="text-accent-light" />
              </button>
            </div>
          </div>

          <div className="flex overflow-x-auto gap-2 px-4 py-3 border-b border-border no-scrollbar">
            {BODY_PARTS.map((bp) => (
              <button
                key={bp}
                onClick={() => setSelectTab(bp)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  selectTab === bp
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-surface-1 text-secondary border border-border'
                }`}
              >
                {bp}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filteredExercises.map((ex, idx) => {
              const disabled = items.some((i) => i.exerciseId === ex.id)
              return (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex.id)}
                  disabled={disabled}
                  className="w-full text-left p-4 bg-surface-1 rounded-2xl mb-2 disabled:opacity-30 active:bg-surface-2 border border-border transition-all animate-fade-in"
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <span className="text-primary text-sm font-medium">{ex.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        {templates.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-surface-1 border border-border flex items-center justify-center mx-auto mb-4">
              <Flame size={24} className="text-muted" />
            </div>
            <p className="text-secondary text-sm">暂无模板</p>
            <p className="text-muted text-xs mt-1">点击右上角创建</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {templates.map((t, idx) => {
              const bp = getDominantBodyPart(t)
              const meta = BODY_PART_META[bp] ?? BODY_PART_META['肩']
              const Icon = meta.icon
              const totalSets = t.items.reduce((s, i) => s + i.defaultSets, 0)
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3.5 p-4 bg-surface-1 rounded-2xl border border-border animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shrink-0 shadow-lg`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-primary font-semibold text-sm">{t.name}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {t.items.length} 动作 · {totalSets} 组
                    </p>
                  </div>
                  <button onClick={() => handleEdit(t)} className="p-2.5 rounded-xl text-muted active:text-accent-light active:bg-accent/10 transition-colors">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-2.5 rounded-xl text-muted active:text-red-400 active:bg-red-500/10 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
