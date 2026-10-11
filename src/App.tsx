import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Exercises from './pages/Exercises'
import Templates from './pages/Templates'
import TemplateDetail from './pages/TemplateDetail'
import PreWorkout from './pages/PreWorkout'
import ActiveWorkout from './pages/ActiveWorkout'
import SessionDetail from './pages/SessionDetail'
import AddSession from './pages/AddSession'
import History from './pages/History'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import BottomNav from './components/BottomNav'

function AppLayout() {
  const location = useLocation()
  const isWorkout = location.pathname.startsWith('/session/')

  return (
    <div className="min-h-screen bg-surface-0">
      {/* 所有页面共用一个 max-w-lg 的内容列，桌面宽屏下不会拉成一条长线 */}
      <main className="mx-auto w-full max-w-lg">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/template/:templateId" element={<TemplateDetail />} />
          <Route path="/pre-workout" element={<PreWorkout />} />
          <Route path="/session/:sessionId" element={<ActiveWorkout />} />
          <Route path="/session-detail/:sessionId" element={<SessionDetail />} />
          <Route path="/add-session" element={<AddSession />} />
          <Route path="/history" element={<History />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {!isWorkout && <BottomNav />}
    </div>
  )
}

export default function App() {
  // Keep the router in sync with the deployment base path
  // (e.g. "/workout/" on a GitHub Pages project site, "/" in dev).
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  return (
    <BrowserRouter basename={basename}>
      <AppLayout />
    </BrowserRouter>
  )
}
