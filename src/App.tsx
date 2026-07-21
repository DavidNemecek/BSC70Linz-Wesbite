import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import News from '@/pages/News'
import Registration from '@/pages/Registration'
import Beitrittserklaerung from '@/pages/Beitrittserklaerung'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/news" element={<News />} />
        <Route path="/anmeldung" element={<Registration />} />
      </Route>
      <Route path="/beitrittserklaerung" element={<Beitrittserklaerung />} />
    </Routes>
  )
}
