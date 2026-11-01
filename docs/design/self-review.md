# Redesign self-review (bans checklist)

Checked against the owner bans list after the Catalogue Wall redesign.

| Ban | Status |
|---|---|
| Inter / Roboto / system as primary font | Pass: Latin UI is Sora; display is Fraunces; Persian is Estedad. All self-hosted OFL. |
| Purple / indigo / teal gradients on white | Pass: pine + paper + ochre only. |
| Three-column icon-title-text card grids | Pass: none added. |
| Decorative gradients as the main idea | Pass: the stage is flat paper; the atmosphere panel is solid pine. |
| Card + border + shadow stacks | Pass: surfaces use hairline borders; no stacked shadow cards. Gate card is border-only. |
| Redundant icons that repeat the label | Pass: bottom tabs keep icons for scanability; desktop nav is text-only. |
| Generic even palettes | Pass: dominant pine / paper with one ochre accent. |
| Glassmorphism | Pass: none. |
| Fade-in on every section | Pass: one orchestrated page-load reveal + ink rule; respects `prefers-reduced-motion`. |
| Emoji as icons | Pass: none. |
| Pill label above every headline | Pass: eyebrow is small caps / muted text, not a pill chip. Language control is an underline toggle, not a pill. |

## Breakpoint intent

- Public gallery mobile: full-bleed surface, bottom tabs, 44px targets.
- Public gallery desktop: full-bleed stage, top nav, split welcome with pine atmosphere panel (not a 480px phone column).
- Editor desktop: sticky preview column + publish dock.
- Editor / gate mobile: stacked card; gate drops the marketing panel under 960px.
