# BSC 70 Linz — Design Token Mapping

Reference only: no CSS files changed.

Source audit:
- `src/styles/base.css`
- `src/styles/themes/light.css`
- `src/styles/themes/dark.css`

Design direction:
- Street Energy
- Blue + white club identity
- Lime green = accent only, never text

## New Color Palette

```css
PRIMARY COLORS (Blue + White identity):
--color-primary:     #3B82F6  /* electric blue — solid buttons, icon accents, non-text UI */
--color-primary-dark: #2563EB /* hover state for primary in light mode */
--color-secondary:   #1D4ED8  /* accessible blue for text links / secondary emphasis on light bg */
--color-accent:      #84CC16  /* lime green — CTA only, never text */

BACKGROUNDS:
--color-bg:          #F8FAFC  /* off-white — main background */
--color-surface:     #FFFFFF  /* pure white — cards, panels */
--color-hero-bg:     #09090B  /* near-black — hero section */

TEXT:
--color-text:        #09090B  /* near-black — primary text */
--color-muted:       #6B7280  /* cool gray — secondary text */
--color-hero-text:   #F8FAFC  /* off-white — text on dark bg */

BORDERS:
--color-border:      rgba(9, 9, 11, 0.08)  /* subtle dividers */
--color-card-bg:     #FFFFFF

DARK THEME OVERRIDES:
--color-bg:          #09090B  /* near-black */
--color-surface:     #18181B  /* dark gray */
--color-text:        #F8FAFC  /* off-white */
--color-muted:       #A1A1AA  /* lighter gray */
--color-primary:     #60A5FA  /* brighter blue for dark bg */
--color-primary-dark: #3B82F6  /* hover state for primary in dark mode */
--color-secondary:   #93C5FD  /* text-safe blue for dark mode links and emphasis */
--color-accent:      #A3E635  /* brighter lime for dark bg */
--color-border:      rgba(248, 250, 252, 0.08)
```

## Typography

```css
--font-display:  'Space Grotesk', system-ui, sans-serif
--font-body:     'Inter', system-ui, sans-serif
--font-mono:     ui-monospace, SFMono-Regular, Menlo, monospace
```

## Spacing & Radius

```css
--radius:        0px
--radius-sm:     4px
--radius-lg:     8px
--section-gap:   clamp(60px, 8vw, 120px)
--header-height: 72px
--container:     1280px
```

## Complete Token Mapping

### Base theme tokens (`base.css :root`)

| Token | Current value | New value | Notes |
|---|---:|---:|---|
| `--font-body` | `"Inter", system-ui, -apple-system, sans-serif` | `"Inter", system-ui, sans-serif` | Keep body stack, remove platform-specific tail. |
| `--font-display` | `"Fraunces", "Times New Roman", Georgia, serif` | `"Space Grotesk", system-ui, sans-serif` | Switch from editorial serif to sharper sports-tech heading voice. |
| `--font-mono` | `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` | `ui-monospace, SFMono-Regular, Menlo, monospace` | No custom mono font. |
| `--color-bg` | `#F4F1EA` | `#F8FAFC` | Cleaner off-white base. |
| `--color-surface` | `#FFFFFF` | `#FFFFFF` | Unchanged. |
| `--color-text` | `#0E0F0C` | `#09090B` | Near-black text for stronger contrast. |
| `--color-muted` | `rgba(14, 15, 12, 0.6)` | `#6B7280` | Stable cool gray with explicit contrast. |
| `--color-primary` | `#E63322` | `#3B82F6` | Brand action blue. Use for solid controls, not body text on light bg. |
| `--color-primary-dark` | `#C42818` | `#2563EB` | Hover/active state in light mode. |
| `--color-secondary` | `#1E3A8A` | `#1D4ED8` | Accessible text-link blue on light backgrounds. |
| `--color-accent` | `#E63322` | `#84CC16` | Lime reserved for CTA accents only. |
| `--color-border` | `rgba(14, 15, 12, 0.08)` | `rgba(9, 9, 11, 0.08)` | Subtle divider tone. |
| `--color-card-bg` | `#FFFFFF` | `#FFFFFF` | Cards stay white on light theme. |
| `--radius` | `2px` | `0px` | Sharper cards for the redesign. |
| `--radius-sm` | `2px` | `4px` | Slightly softer micro-rounding. |
| `--radius-lg` | `4px` | `8px` | Button radius. |
| `--shadow` | `0 1px 2px rgba(14, 15, 12, 0.04), 0 4px 12px rgba(14, 15, 12, 0.05)` | `0 1px 2px rgba(9, 9, 11, 0.04), 0 8px 24px rgba(9, 9, 11, 0.06)` | Cleaner elevation. |
| `--shadow-lg` | `0 4px 12px rgba(14, 15, 12, 0.08), 0 16px 32px rgba(14, 15, 12, 0.06)` | `0 8px 24px rgba(9, 9, 11, 0.10), 0 24px 48px rgba(9, 9, 11, 0.12)` | Stronger hero/card depth. |
| `--container` | `1280px` | `1280px` | Unchanged. |
| `--header-height` | `72px` | `72px` | Unchanged. |
| `--section-gap` | `clamp(80px, 10vw, 160px)` | `clamp(60px, 8vw, 120px)` | Tighter rhythm. |
| `--color-hero-bg` | `#0E0F0C` | `#09090B` | Near-black hero field. |
| `--color-hero-text` | `#F4F1EA` | `#F8FAFC` | High-contrast hero copy. |
| `--color-hero-surface` | `rgba(244, 241, 234, 0.08)` | `rgba(248, 250, 252, 0.08)` | Soft translucent panels in hero. |

### Light theme (`themes/light.css`)

| Token | Current value | New value | Notes |
|---|---:|---:|---|
| `--color-bg` | `#F4F1EA` | `#F8FAFC` | Main page background. |
| `--color-surface` | `#FFFFFF` | `#FFFFFF` | Cards / panels. |
| `--color-text` | `#0E0F0C` | `#09090B` | Primary text. |
| `--color-muted` | `rgba(14, 15, 12, 0.6)` | `#6B7280` | Secondary text. |
| `--color-primary` | `#E63322` | `#3B82F6` | CTA fill / icon accent. Not normal light-theme text. |
| `--color-primary-dark` | `#C42818` | `#2563EB` | Hover state. |
| `--color-secondary` | `#1E3A8A` | `#1D4ED8` | Accessible text-link blue. |
| `--color-accent` | `#E63322` | `#84CC16` | Decorative / CTA accent only. |
| `--color-border` | `rgba(14, 15, 12, 0.08)` | `rgba(9, 9, 11, 0.08)` | Divider / hairline. |
| `--color-card-bg` | `#FFFFFF` | `#FFFFFF` | Cards. |
| `--color-hero-bg` | `#0E0F0C` | `#09090B` | Hero background. |
| `--color-hero-text` | `#F4F1EA` | `#F8FAFC` | Hero text. |
| `--color-hero-surface` | `rgba(244, 241, 234, 0.08)` | `rgba(248, 250, 252, 0.08)` | Hero overlays. |

### Dark theme (`themes/dark.css`)

| Token | Current value | New value | Notes |
|---|---:|---:|---|
| `--color-bg` | `#0E0F0C` | `#09090B` | Main dark background. |
| `--color-surface` | `#1A1B17` | `#18181B` | Dark cards/panels. |
| `--color-text` | `#F4F1EA` | `#F8FAFC` | Primary text on dark bg. |
| `--color-muted` | `rgba(244, 241, 234, 0.6)` | `#A1A1AA` | Secondary text on dark bg. |
| `--color-primary` | `#FF4734` | `#60A5FA` | Bright blue for dark UI. |
| `--color-primary-dark` | `#E63322` | `#3B82F6` | Hover state. |
| `--color-secondary` | `#5B7CFF` | `#93C5FD` | Dark-mode link / emphasis blue. |
| `--color-accent` | `#FF4734` | `#A3E635` | Lime accent only, not text. |
| `--color-border` | `rgba(244, 241, 234, 0.08)` | `rgba(248, 250, 252, 0.08)` | Divider tone for dark UI. |
| `--color-card-bg` | `#1A1B17` | `#18181B` | Cards/panels. |
| `--color-hero-bg` | `#0E0F0C` | `#09090B` | Hero background. |
| `--color-hero-text` | `#F4F1EA` | `#F8FAFC` | Hero text. |
| `--color-hero-surface` | `rgba(244, 241, 234, 0.08)` | `rgba(248, 250, 252, 0.08)` | Hero overlays. |

## WCAG Contrast Validation

Formula used:

`ratio = (L1 + 0.05) / (L2 + 0.05)`

Relative luminance computed from sRGB hex values per WCAG 2.1.

WCAG AA targets:
- Normal text: `4.5:1`
- Large text: `3:1`

| Combination | Ratio | AA | AAA | Notes |
|---|---:|---|---|---|
| `#09090B` text on `#F8FAFC` bg | `19.02:1` | PASS | PASS | Core body text. |
| `#3B82F6` text on `#F8FAFC` bg | `3.52:1` | FAIL normal / PASS large | FAIL | Use as filled UI blue, not body/link text on light bg. |
| `#6B7280` text on `#F8FAFC` bg | `4.62:1` | PASS | FAIL | Safe muted copy. |
| `#84CC16` text on `#F8FAFC` bg | `1.89:1` | FAIL | FAIL | Do not use for text. Accent only. |
| `#84CC16` text on `#09090B` bg | `10.07:1` | PASS | PASS | Contrast passes, but design rule still forbids text use. |
| `#F8FAFC` text on `#09090B` bg | `19.02:1` | PASS | PASS | Hero / dark-section text. |
| `#60A5FA` text on `#09090B` bg | `7.83:1` | PASS | PASS | Dark-mode primary blue. |
| `#A1A1AA` text on `#09090B` bg | `7.76:1` | PASS | PASS | Dark-mode muted copy. |

### Lime green rule

`#84CC16` is an accent color only.

- On light backgrounds it fails WCAG AA for text.
- On dark backgrounds it technically passes contrast, but it still must not be used as text because the redesign spec reserves it for CTA fills, highlights, and decorative cues only.
