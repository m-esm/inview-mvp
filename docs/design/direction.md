# Inview design direction

## Audience

- **Visitors** (primary): people at a show in Iran. They scan a QR code on a phone, then browse the current show, works and prices. Persian is the default. English is one tap away.
- **Gallery owners** (secondary): staff who edit the show on a desktop, and sometimes on a phone between clients.

## Tone

Quiet, editorial, catalogue-confident. The interface should feel like a well-set wall label and a well-printed show booklet, not like a startup dashboard. Sharp hierarchy. Calm pace. No decoration that does not serve reading or finding a work.

## Type pair

| Role | Face | License | Notes |
|---|---|---|---|
| Latin display | **Fraunces** | OFL-1.1 via `@fontsource/fraunces` | Soft optical serif. Gallery names and show titles. |
| Latin UI | **Sora** | OFL-1.1 via `@fontsource/sora` | Geometric sans. Buttons, forms, meta. |
| Persian (all roles) | **Estedad** | OFL-1.1 via `@fontsource/estedad` | Arabic–Latin sans built for screens. Replaces Vazirmatn. |

Self-host only. No Google Fonts runtime requests.

## Color system

Warm paper field, deep ink, one ochre accent. Dominant colors stay dark and quiet; ochre appears only for focus rings, price emphasis and active language.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#121714` | Primary text |
| `--paper` | `#F4F0E8` | Stage / page ground |
| `--surface` | `#FFFcf7` | Content surface |
| `--field` | `#EBE6DC` | Recessed controls |
| `--line` | `#D2CBBE` | Hairlines |
| `--muted` | `#5A564E` | Secondary text (AA on paper) |
| `--pine` | `#17332E` | Primary action |
| `--pine-hover` | `#0F2420` | Pressed / hover |
| `--ochre` | `#A85A32` | Accent, focus |
| `--good` / `--warn` / `--sold` | green / ochre / red-brown | Status only |

Spacing grid: **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64**. Radius: **2** (hair), **6** (control), **10** (panel). No card+shadow stacks.

## Layout by breakpoint

### Public gallery: mobile (≤719px)

Full-bleed surface. Sticky top chrome (wordmark + language). Fixed bottom tab bar with 44px targets. One column. Works as a tight wall-label list or 2-up grid. No floating phone frame.

### Public gallery: desktop (≥960px)

Composed stage, not a stretched phone column. Top navigation replaces the bottom tabs. Content sits in an editorial frame (max ~1120px) on the paper stage. Welcome is a split: large show title and meta on the start side, primary actions on the end side. Works open to a 3-column wall grid. Work detail is image-forward with the wall label beside the figure on wide screens.

### Editor: desktop (≥960px)

Sidebar + dense main. Section rails with clear Publish dock. Preview phone frame stays a preview, not the whole page.

### Editor: mobile (≤719px)

Top brand bar, horizontal section links, stacked forms. Touch targets stay ≥44px. Preview collapses under Publish.

## One memorable detail

**The ink rule.** A 2px ink bar draws in under the gallery wordmark and under each wall-label artist name on first paint (≈420ms, ease-out). It is the product’s signature motion. Respect `prefers-reduced-motion: reduce` (draw instantly, no transform).

## Interaction contract

Every control exposes hover, focus-visible (ochre ring), active, disabled and loading. Empty, error and loading states are designed, not improvised. Truncation uses ellipsis with title tooltips where needed. Logical CSS properties only (`margin-inline`, `inset-inline-end`, …) so RTL and LTR stay correct.
