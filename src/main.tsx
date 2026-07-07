import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/context/ThemeContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { LenisProvider } from '@/context/LenisContext'

// Prevent the browser from restoring a remembered scroll position on
// back/forward navigation, since Layout.tsx (via Lenis) owns scroll
// position on every route change instead.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <LanguageProvider>
      <LenisProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LenisProvider>
    </LanguageProvider>
  </ThemeProvider>
)
