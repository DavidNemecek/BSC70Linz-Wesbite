import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import News from '@/pages/News'
import Registration from '@/pages/Registration'
import Chronik from '@/pages/Chronik'
import Impressum from '@/pages/Impressum'
import Anfahrt from '@/pages/Anfahrt'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/news" element={<News />} />
        <Route path="/anmeldung" element={<Registration />} />
        <Route path="/chronik" element={<Chronik />} />
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/anfahrt/:hall" element={<Anfahrt />} />
      </Route>
    </Routes>
  )
}
