import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Exercises from './pages/Exercises'
import Templates from './pages/Templates'
import ActiveWorkout from './pages/ActiveWorkout'
import History from './pages/History'
import BottomNav from './components/BottomNav'

function AppLayout() {
  const location = useLocation()
  const isWorkout = location.pathname.startsWith('/session/')

  return (
    <div className="min-h-screen bg-zinc-950">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/session/:sessionId" element={<ActiveWorkout />} />
        <Route path="/history" element={<History />} />
      </Routes>
      {!isWorkout && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/workout">
      <AppLayout />
    </BrowserRouter>
  )
}
