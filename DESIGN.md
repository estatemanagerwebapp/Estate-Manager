---
name: Silverstone Managers
description: Calm, confident property and facility management for Lagos.
colors:
  commit: '#ff5a1f'
  commit-hover: '#ff7a4a'
  ink: '#17231f'
  deep-pine: '#192923'
  paper: '#f7f6f2'
  muted: '#5c675f'
  rule: '#e2e4dd'
  amber-accent: '#f0c3a4'
  clay-accent: '#8f6452'
  ink-on-commit: '#3a1c0d'
typography:
  display:
    fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(52px, 8.4vw, 104px)'
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: '-0.055em'
  accent:
    fontFamily: 'DM Serif Display, Georgia, serif'
    fontSize: 'inherit'
    fontWeight: 400
    lineHeight: 1
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(38px, 5.4vw, 64px)'
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: '-0.05em'
  body:
    fontFamily: 'DM Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.85
    letterSpacing: 'normal'
  label:
    fontFamily: 'DM Sans, ui-sans-serif, system-ui, sans-serif'
    fontSize: '9px'
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: '0.16em'
rounded:
  none: '0px'
spacing:
  gutter: 'clamp(24px, 7.2vw, 112px)'
  section: 'clamp(72px, 11vw, 130px)'
  list-gap: 'clamp(24px, 4vw, 56px)'
components:
  button-primary:
    backgroundColor: '{colors.commit}'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
    padding: '0 22px'
    height: '46px'
  button-primary-hover:
    backgroundColor: '{colors.commit-hover}'
    textColor: '{colors.ink}'
  button-dark:
    backgroundColor: '{colors.ink}'
    textColor: '#ffffff'
    rounded: '{rounded.none}'
    padding: '0 22px'
    height: '46px'
  button-quiet:
    backgroundColor: 'transparent'
    textColor: '#ffffff'
    rounded: '{rounded.none}'
    padding: '0 22px'
    height: '46px'
  button-quiet-dark:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
    padding: '0 22px'
    height: '46px'
---

# Design System: Silverstone Managers

## Overview

**Creative North Star: "The Estate Office"**

The landing page should feel like walking into a well-run estate office: quiet, ordered, and confident. The paper ground, square edges, and hairline rules do the work that decoration would otherwise do. Photography supplies the warmth; typography supplies the authority.

The system is deliberately sparse. There are six sections, each with one job: hero, partners, confidence, built-for, CTA, footer. Sections change tone through full-bleed ground shifts — paper, deep pine, warm orange — rather than through cards, shadows, or ornament. The orange is a committed brand signal, not a sprinkle: it carries the primary action and one drenched band.

Emphasis inside headlines is always the same move: Manrope for the claim, DM Serif Display italic for the human half of the sentence. That pairing is the most recognizable trait of the surface.

**Key Characteristics:**

- Paper-first neutral ground with three full-bleed tonal bands.
- Manrope display paired with DM Serif Display italic accents.
- Square edges, 1px hairline rules, zero resting shadows.
- Photographic hero; no illustration, no icon-card grid.
- Small, wide-tracked uppercase labels for wayfinding.

## Colors

A warm, mineral palette: paper and pine for calm, a single saturated orange for conviction.

### Primary

- **Commit Orange** (#ff5a1f): The brand signal. Used for the primary action, the logo mark, the CTA band, and small rules. It never exceeds roughly a third of any viewport and is most powerful as one drenched section.
- **Commit Hover** (#ff7a4a): Brighter hover state for the primary button. Lifting the orange raises contrast with the dark label.

### Neutral

- **Ink** (#17231f): Primary text on paper, dark button ground, logo mark.
- **Deep Pine** (#192923): The dark band ground. Carries white text and warm-serif accents.
- **Paper** (#f7f6f2): Page ground. Warm off-white, never pure white.
- **Muted Slate** (#5c675f): Supporting paragraphs, labels, footer detail.
- **Rule** (#e2e4dd): All hairlines, section borders, and field outlines.
- **Ink on Commit** (#3a1c0d): Body and secondary text inside the orange band. Dark brown-black keeps the band readable at small sizes.
- **Amber Accent** (#f0c3a4): Italic accent words on dark grounds.
- **Clay Accent** (#8f6452): Italic accent words on paper.

### Named Rules

**The One Band Rule.** Orange is allowed one full-bleed section per page. Everywhere else it appears only as a button, a mark, or a 28px rule.

**The No White Body Rule.** Small text on Commit Orange uses Ink on Commit, not white. White on orange fails 4.5:1 below large-text sizes.

## Typography

**Display Font:** Manrope (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** DM Sans (with ui-sans-serif, system-ui, sans-serif)
**Accent Font:** DM Serif Display italic (with Georgia, serif)

**Character:** A geometric humanist sans for authority, a high-contrast serif italic for warmth. The contrast between them is the page's voice; either font alone would read as generic.

### Hierarchy

- **Display** (600, clamp(52px, 8.4vw, 104px), 0.98): Hero headline only. Tight tracking (-0.055em), two lines maximum on desktop.
- **Headline** (600, clamp(38px, 5.4vw, 64px), 1.05): Section headings. Tracking (-0.05em).
- **Title** (600, 16px, 1.35): Confidence and built-for item names.
- **Body** (400, 14px hero / 12.5px sections, 1.85): Paragraphs. Keep measure under 460px in narrow columns and 560px in wide ones.
- **Label** (700, 9–10px, 0.07–0.16em, uppercase): Buttons, partner strip label, CTA contact label, copyright.

### Named Rules

**The Split Headline Rule.** Every section heading ends in DM Serif Display italic. Never set a full heading in the serif, and never set the accent word in the same sans as the claim.

**The Two-Line Rule.** Display headlines break at a meaningful clause boundary, never mid-phrase. At 1440px, "Better managed." and "Better for life." each hold one line.

## Layout

A centered editorial column with full-bleed bands. Content gutters are clamp(24px, 7.2vw, 112px); section rhythm is clamp(72px, 11vw, 130px) top and bottom. Headings sit on a two-column grid — claim left, supporting paragraph right, bottom-aligned — that collapses to one column at 900px.

The page order is fixed: hero, partners, confidence, built-for, CTA, footer. The partners strip is a single horizontal line on desktop (label left, four categories right) and a 2x2 grid on mobile. Three-up lists use a grid with 1px top rules on each item, never cards. At 900px those lists stack with the same top rules; at 640px all gutters drop to 20px and buttons become full-width only inside the CTA.

## Elevation & Depth

The surface is flat by default. There are no resting shadows, no glows, and no blurred panels. Depth comes from full-bleed photography in the hero and from tonal section shifts (paper → deep pine → orange). The only shadow in the system is the mobile navigation drop shadow (`0 14px 26px rgb(23 35 31 / 8%)`), used solely to separate the open menu from the hero image.

### Named Rules

**The No Card Rule.** Content is separated by hairlines and ground shifts, never by elevated boxes.

## Shapes

Square edges throughout: buttons, nav outline, images, and bands all use 0 radius. The vocabulary is 1px rules, full-bleed rectangles, and one rotated 2x2 logo mark (10px squares, 3px gap, −6deg). Circles are not used; the arrow glyphs are the only curves.

## Components

### Buttons

- **Shape:** Square (0 radius), 46px tall, 22px horizontal padding, 10px uppercase label at 0.07em tracking.
- **Primary:** Commit Orange ground with Ink label. Used for sign-in on the hero; dark text keeps small text at 5.19:1.
- **Primary Hover:** Commit Hover ground, Ink label, 1px lift.
- **Dark:** Ink ground with white label. Used inside the orange CTA band.
- **Quiet:** Transparent with a 42% white border and white label, over the hero photograph.
- **Quiet Dark:** Transparent with a 55% ink border and ink label, inside the orange band.

### Navigation

Sticky 72px paper bar with a bottom hairline. Wordmark left; four text links plus Onboard and a bordered Sign in action right. Links are 11px DM Sans at 600 weight, muted slate, turning clay on hover. Below 640px the links collapse into an absolute paper panel with row hairlines, and the Sign in action loses its border.

### Partner Strip

A bordered horizontal band. A 9px uppercase muted label sits left; four 13px Manrope 600 names sit right with wide gaps. On mobile it becomes a 2x2 grid.

### Confidence / Built-For Items

Icon, title, and a short paragraph above a 1px top rule. No background, no container, no shadow. Icons are 22px Lucide strokes; clay on paper and amber on deep pine. Paragraphs cap at 320px.

### CTA Band

One drenched Commit Orange section split into message and contact halves. The heading is Ink with an Ink-on-Commit serif accent; body copy is Ink on Commit. A 26% ink rule separates the contact column, which lists email, phone, and location as text links, not buttons.

## Do's and Don'ts

### Do:

- **Do** keep one full-bleed orange band per page and use orange elsewhere only as action, mark, or rule.
- **Do** pair Manrope claims with DM Serif Display italic accent words in every heading.
- **Do** separate content with 1px rules and tonal ground shifts.
- **Do** keep body measure within 460–560px.
- **Do** put Ink or Ink on Commit text on orange surfaces.
- **Do** use one shared `/login` entry point for every account type, plus `/onboard`; legacy role-specific login URLs redirect to `/login`.

### Don't:

- **Don't** use white body text on Commit Orange.
- **Don't** introduce cards, shadows, rounded corners, or glass panels.
- **Don't** add eyebrow kickers, section numbers, or a metric strip above headlines.
- **Don't** set an entire heading in the serif accent face.
- **Don't** replace the square button language with pills.
- **Don't** invent partner logos or claims; the partner strip lists categories, not companies.
