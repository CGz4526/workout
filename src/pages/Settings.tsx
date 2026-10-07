import { useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { db } from '../db'
import Header from '../components/Header'

const toLocalDate = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const downloadJSON = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  // Attach to the DOM so the click reliably triggers a download across browsers
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke later — revoking synchronously can cancel an in-flight download
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const buildBackup = async () => {
    const [exercises, templates, sessions] = await Promise.all([
      db.exercises.toArray(),
      db.templates.toArray(),
      db.sessions.toArray(),
    ])
    return {
      version: 1,
      exportDate: new Date().toISOString(),
      counts: {
        exercises: exercises.length,
        templates: templates.length,
        sessions: sessions.length,
      },
      exercises,
      templates,
      sessions,
    }
  }

  const handleExport = async () => {
    try {
      const data = await buildBackup()
      downloadJSON(`workout-backup-${toLocalDate(new Date())}.json`, data)
      alert(
        `导出成功\n动作 ${data.counts.exercises} · 模板 ${data.counts.templates} · 训练记录 ${data.counts.sessions}\n请确认浏览器已开始下载该 JSON 文件。`
      )
    } catch (err) {
      console.error('导出失败', err)
      alert('导出失败，请重试或更换浏览器')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      const validExercises = Array.isArray(data.exercises)
      const validTemplates =
        data.templates === undefined || Array.isArray(data.templates)
      const validSessions = Array.isArray(data.sessions)

      if (!data.version || !validExercises || !validTemplates || !validSessions) {
        alert('无效的备份文件')
        return
      }

      if (!confirm('导入会覆盖当前数据，确定继续？\n（导入前会自动下载一份当前数据的备份）')) {
        return
      }

      // Safety net: snapshot current data and auto-download it first, so a
      // wrong or corrupted import can never cause an unrecoverable loss.
      const safety = await buildBackup()
      downloadJSON(`workout-backup-before-import-${toLocalDate(new Date())}.json`, safety)

      // Write inside a transaction: if any step fails, Dexie rolls everything
      // back and the existing data is left untouched.
      await db.transaction('rw', db.exercises, db.templates, db.sessions, async () => {
        await db.exercises.clear()
        await db.templates.clear()
        await db.sessions.clear()

        if (data.exercises.length > 0) await db.exercises.bulkAdd(data.exercises)
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          await db.templates.bulkAdd(data.templates)
        }
        if (data.sessions.length > 0) await db.sessions.bulkAdd(data.sessions)
      })

      alert('导入成功')
      window.location.reload()
    } catch (err) {
      console.error('导入失败', err)
      alert('导入失败，已保留原有数据')
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header title="数据备份" showBack />

      <div className="px-4 py-4 space-y-3">
        {/* Export */}
        <button
          onClick={handleExport}
          className="w-full flex items-center gap-4 p-4 bg-surface-1 rounded-2xl border border-border active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Download size={20} className="text-accent-light" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-primary font-semibold text-sm">导出数据</p>
            <p className="text-muted text-xs mt-0.5">将所有数据导出为 JSON 文件</p>
          </div>
        </button>

        {/* Import */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-4 p-4 bg-surface-1 rounded-2xl border border-border active:bg-surface-2 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Upload size={20} className="text-blue-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-primary font-semibold text-sm">导入数据</p>
            <p className="text-muted text-xs mt-0.5">从备份文件恢复（导入前会自动备份当前数据）</p>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />

        <p className="text-muted text-xs leading-relaxed px-1 pt-2">
          数据仅保存在本机浏览器中，换设备 / 清缓存前请先导出备份。
        </p>
      </div>
    </div>
  )
}
