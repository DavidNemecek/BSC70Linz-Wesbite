import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// Self-hosted webfonts, bundled and served from our own domain so no visitor
// data reaches Google. These are the same files Google Fonts serves — the
// packages ship Inter v20 and Bebas Neue v16, the exact versions the CDN was
// delivering — so the typefaces are unchanged.
//
// Imported per subset *and* weight on purpose: fontsource's CSS carries no
// unicode-range, so `latin.css` would pull in all nine weights, and mixing
// latin with latin-ext would have the later @font-face override the earlier
// one for the same family/weight. Only `latin` is needed — the site's text
// uses nothing beyond Latin-1 plus dashes, quotes and the euro sign.
// Weights 400/500/600/700 are the ones actually rendered; 300 was requested
// from the CDN but never used by any rule.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/bebas-neue/latin-400.css'

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
