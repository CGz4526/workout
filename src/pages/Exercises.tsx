import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Edit3, X, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type Exercise } from '../types'
import Header from '../components/Header'
import { bodyPartMeta } from '../lib/bodyParts'

export default function Exercises() {
  const [activeTab, setActiveTab] = useState<BodyPart>('肩')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')

  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []
  const exercises = allExercises
    .filter((e) => e.bodyPart === activeTab)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))

  const activeMeta = bodyPartMeta(activeTab)
  const ActiveIcon = activeMeta.icon

  const handleSave = async () => {
    if (!formName.trim()) return
    if (editingId) {
      await db.exercises.update(editingId, { name: formName.trim() })
    } else {
      await db.exercises.add({
        id: crypto.randomUUID(),
        name: formName.trim(),
        bodyPart: activeTab,
        createdAt: Date.now(),
      })
    }
    setFormName('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (ex: Exercise) => {
    setEditingId(ex.id)
    setFormName(ex.name)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await db.exercises.delete(id)
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header
        title="动作库"
        rightAction={
          <button
            onClick={() => { setEditingId(null); setFormName(''); setShowForm(true) }}
            aria-label="新增动作"
            className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center active:bg-accent/20 transition-colors tap"
          >
            <Plus size={18} className="text-accent" />
          </button>
        }
      />

      {/* 每个部位用自己的一档配色，选中态直接上渐变——整页的色调跟着当前部位走 */}
      <div className="mx-auto flex w-full max-w-lg overflow-x-auto gap-2 px-4 py-3.5 border-b border-border no-scrollbar">
        {BODY_PARTS.map((bp) => {
          const m = bodyPartMeta(bp)
          const TabIcon = m.icon
          const active = activeTab === bp
          return (
            <button
              key={bp}
              onClick={() => setActiveTab(bp)}
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

      {showForm && (
        <div className="mx-auto w-full max-w-lg px-4 py-3.5 border-b border-border bg-surface-1/50 animate-fade-in">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder={`新增「${activeTab}」动作`}
              className="flex-1 bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted"
            />
            <button onClick={handleSave} aria-label="保存" className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center active:bg-accent/20 tap">
              <Check size={18} className="text-accent" />
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} aria-label="取消" className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center active:bg-surface-3 tap">
              <X size={18} className="text-secondary" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-lg px-4 py-3">
        {exercises.length === 0 ? (
          <div className="text-center py-16">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border ${activeMeta.soft} ${activeMeta.border}`}>
              <ActiveIcon size={24} className={activeMeta.text} />
            </div>
            <p className="text-secondary text-sm">暂无「{activeTab}」动作</p>
            <p className="text-muted text-xs mt-1">点击右上角添加</p>
          </div>
        ) : (
          <>
            <p className="text-muted text-xs mb-2.5 px-0.5">共 {exercises.length} 个动作</p>
            <div className="space-y-2">
              {exercises.map((ex, idx) => {
                const m = bodyPartMeta(ex.bodyPart)
                const RowIcon = m.icon
                return (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between p-3.5 pl-4 bg-surface-1 rounded-2xl border border-border shadow-card animate-pop-in"
                    style={{ animationDelay: `${Math.min(idx, 10) * 0.03}s` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.soft}`}>
                        <RowIcon size={16} className={m.text} />
                      </span>
                      <span className="text-primary text-sm font-medium truncate">{ex.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleEdit(ex)} aria-label={`编辑 ${ex.name}`} className="p-2 rounded-lg text-muted active:bg-surface-2 transition-colors tap">
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => handleDelete(ex.id)} aria-label={`删除 ${ex.name}`} className="p-2 rounded-lg text-muted active:text-red-400 active:bg-red-500/10 transition-colors tap">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
