import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, Edit3, X, Check } from 'lucide-react'
import { db } from '../db'
import { BODY_PARTS, type BodyPart, type Exercise } from '../types'
import Header from '../components/Header'

const BODY_PART_ICONS: Record<string, string> = {
  '肩': '🏋️',
  '胸': '💪',
  '背': '🔙',
  '腿': '🦵',
  '二头': '💪',
  '三头': '🔥',
  '核心': '🎯',
}

export default function Exercises() {
  const [activeTab, setActiveTab] = useState<BodyPart>('肩')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')

  const exercises =
    useLiveQuery(() => db.exercises.where('bodyPart').equals(activeTab).toArray()) ?? []

  const handleSave = async () => {
    if (!formName.trim()) return
    if (editingId) {
      await db.exercises.update(editingId, { name: formName.trim() })
    } else {
      await db.exercises.add({
        id: crypto.randomUUID(),
        name: formName.trim(),
        bodyPart: activeTab,
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
            className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center active:bg-accent/20 transition-colors"
          >
            <Plus size={18} className="text-accent-light" />
          </button>
        }
      />

      <div className="flex overflow-x-auto gap-2 px-4 py-3.5 border-b border-border no-scrollbar">
        {BODY_PARTS.map((bp) => (
          <button
            key={bp}
            onClick={() => setActiveTab(bp)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === bp
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-surface-1 text-secondary border border-border active:bg-surface-2'
            }`}
          >
            {bp}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="px-4 py-3.5 border-b border-border bg-surface-1/50 animate-fade-in">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="动作名称"
              className="flex-1 bg-surface-2 text-primary px-4 py-2.5 rounded-xl text-sm outline-none border border-border focus:border-accent/50 transition-colors placeholder:text-muted"
            />
            <button onClick={handleSave} className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center active:bg-accent/20">
              <Check size={18} className="text-accent-light" />
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center active:bg-surface-3">
              <X size={18} className="text-secondary" />
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        {exercises.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-surface-1 border border-border flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">{BODY_PART_ICONS[activeTab]}</span>
            </div>
            <p className="text-secondary text-sm">暂无动作</p>
            <p className="text-muted text-xs mt-1">点击右上角添加</p>
          </div>
        ) : (
          <div className="space-y-2">
            {exercises.map((ex, idx) => (
              <div
                key={ex.id}
                className="flex items-center justify-between p-4 bg-surface-1 rounded-2xl border border-border animate-fade-in"
                style={{ animationDelay: `${idx * 0.03}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
                    <span className="text-xs font-bold text-secondary">{idx + 1}</span>
                  </div>
                  <span className="text-primary text-sm font-medium">{ex.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(ex)} className="p-2 rounded-lg text-muted active:bg-surface-2 transition-colors">
                    <Edit3 size={15} />
                  </button>
                  <button onClick={() => handleDelete(ex.id)} className="p-2 rounded-lg text-muted active:text-red-400 active:bg-red-500/10 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
