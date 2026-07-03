import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/context/ThemeContext'
import { LenisProvider } from '@/context/LenisContext'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <LenisProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LenisProvider>
  </ThemeProvider>
)
