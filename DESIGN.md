---
name: Couple Budget
description: A bright, two-handed household budget for one couple, built phone-first.
colors:
  canvas: "#f3f5fa"
  surface: "#ffffff"
  ink: "#0f172a"
  muted: "#566074"
  line: "#e2e6ef"
  ink-indigo: "#4b3fe4"
  ink-indigo-deep: "#3f34cf"
  indigo-mist: "#ecebfd"
  indigo-mist-deep: "#dfdcfb"
  rose: "#d23a76"
  blush: "#ffb7d3"
  lagoon-teal: "#0fa3a3"
  personal-slate: "#64748b"
  good: "#0a8058"
  bad: "#d13438"
  warn: "#b45309"
typography:
  display:
    fontFamily: "ui-rounded, SF Pro Rounded, Nunito, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  display-large:
    fontFamily: "ui-rounded, SF Pro Rounded, Nunito, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.33
  headline-large:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.29
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  nav-label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  sheet: "28px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink-indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-indigo-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.canvas}"
  button-soft:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.ink-indigo}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-soft-hover:
    backgroundColor: "{colors.indigo-mist-deep}"
  button-danger:
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  card-feature:
    backgroundColor: "{colors.ink-indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "48px"
  segmented:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "4px"
  segmented-option-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  nav-tab-active:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.ink-indigo}"
    rounded: "{rounded.md}"
    height: "44px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
    padding: "20px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
---

# Design System: Couple Budget

## Overview

**Creative North Star: "Two Hands, One Number"**

Two partners, each with their own colour (Ink Indigo and Rose), feed into one shared total that both can trust. The system is built around that meeting point. Every screen leads with a large, rounded, tabular number (left to spend, settle-up, still to pay, net worth), and the partner colours appear around it as avatars, split bars and shares. When something belongs to both of them, it turns Lagoon Teal.

The mood is bright and playful without losing the arithmetic. A cool off-white canvas holds white cards with generously rounded corners, and the one strong accent is Ink Indigo. Motion makes the app feel alive without making anyone wait. On the first visit to a screen its sections rise in on a short stagger (0.32s, 30ms steps). A return visit only fades in over 0.16s. Totals count up to their value, buttons and rows press in under the thumb, months slide in from the side you're moving toward, and success pops. Entrances use an exponential ease-out; exits are quicker than entrances. The motion never decorates idle content, and all of it switches off under reduced motion.

The app is phone-first and installed to the home screen. On phones it uses a bottom tab bar and bottom sheets. On a wider screen the same content sits beside a left sidebar and the sheets become centred dialogs.

**Key Characteristics:**
- One hero number per screen, set in the rounded display face with tabular figures.
- Partner identity is carried by colour: Ink Indigo for Partner One, Rose for Partner Two, Lagoon Teal for shared.
- Surfaces are flat at rest: white cards with a hairline border on a cool canvas.
- Shapes are soft and rounded: 12px controls, 24px cards, 28px sheets, full pills.
- Motion is playful but fast: a first-visit rise, then fades, count-ups, presses, slides and pops.

## Colors

The palette is cool and bright: a near-white blue-grey ground, one saturated indigo, and a small set of partner and status colours that carry meaning rather than decoration.

### Primary
- **Ink Indigo** (`ink-indigo`): the brand colour and Partner One's colour. It fills primary buttons, the settle-up feature card, the logo tile, progress fills, focus outlines, slider fills and the active nav state. Its hover state is **Deep Ink Indigo** (`ink-indigo-deep`).
- **Indigo Mist** (`indigo-mist`): the soft tint of Ink Indigo, used behind soft buttons, active nav tabs, focused menu options, the demo banner and icon badges. It darkens to `indigo-mist-deep` on hover.

### Secondary
- **Rose** (`rose`): Partner Two's colour, used in avatars, split bars and that partner's share of anything. It is deep enough to carry white avatar initials at 4.5:1.
- **Blush** (`blush`): a light Rose used inside the logo monogram (the K) and in illustrative bars. It is never used for text.

### Tertiary
- **Lagoon Teal** (`lagoon-teal`): shared, meaning anything owned by both partners or paid from the joint account. It appears on the shared avatar and on shared segments of split bars.

### Neutral
- **Cool Canvas** (`canvas`): the app background and the recessed fill inside segmented controls and grouped lists.
- **Surface White** (`surface`): cards, sheets, inputs and the nav bars.
- **Ink** (`ink`): primary text, toasts, and the scrim behind sheets (at 45%).
- **Slate Muted** (`muted`): secondary text, labels, inactive nav and helper hints.
- **Hairline** (`line`): borders on cards and inputs, dividers, and the unfilled track of the slider.
- **Personal Slate** (`personal-slate`): the "personal" owner, meaning whoever paid. It also marks the Transfer category.

### Status
- **Good** (`good`): income, a positive balance and success confirmations.
- **Bad** (`bad`): over budget, a negative net worth, destructive actions and validation errors. Progress bars turn Bad automatically when spending passes the budget.
- **Warn** (`warn`): cautionary states.

Each category has its own colour (in `src/lib/defaults.ts`), shown as an icon on a 12% tint of that colour (an `IconTile`).

### Named Rules
**The Partner Colour Rule.** Ink Indigo means Partner One, Rose means Partner Two, Lagoon Teal means shared, and Slate means personal. Do not reuse these four colours for any unrelated meaning. They are how the couple reads ownership at a glance.

**The Tint, Not Fill Rule.** Category colours appear as a 12% tint behind an icon in the full colour, never as a large solid fill.

## Typography

**Display Font:** the system rounded face (`ui-rounded`, i.e. SF Pro Rounded on Apple devices), falling back to Nunito and then the system sans.
**Body Font:** Inter, falling back to the system UI sans. Inter is not loaded as a web font, so most devices render the system sans.

**Character:** the rounded display face makes money feel friendly and readable at a glance. The body sans is plain and neutral, so the numbers do the talking.

### Hierarchy
- **Display** (700, 44px, and Display Large at 52px from `md`, line-height 1, -0.02em, tabular): the screen's hero number. It drops to 24–36px for secondary totals on cards. Display is reserved for money values, applied through the `display` utility.
- **Headline** (700, 24px, and Headline Large at 28px from `md`): page titles, such as the couple's names on Home.
- **Title** (700, 17px): section titles and the app name. Sheet titles use 18px.
- **Body** (400, 16px): default copy. Inputs use 16px so iOS does not zoom on focus. Money inputs and steppers use 17px semibold tabular figures.
- **Body Small** (500, 15px): card descriptions, toasts and medium-size buttons.
- **Label** (13px): hints, captions, the sync status and small segmented options.
- **Nav Label** (600, 11px): labels under the bottom tab icons.

### Named Rules
**The Tabular Money Rule.** Every amount uses tabular figures (the `num` or `display` utility), so columns of money line up and count-ups do not jitter.

## Layout

On phones the layout is a single column. Content sits in `max-w-5xl` with 16px side padding, opens with 20px top padding, and has 112px of bottom padding to clear the fixed tab bar. From the `md` breakpoint (768px), a fixed 240px left sidebar replaces the top header and bottom tab bar, and the side padding grows to 32px.

Spacing follows Tailwind's 4px scale. The default gap is 12px (`gap-3`) between items inside a card. Sections are separated by 24px (`gap-6`), and card grids use 16px (`gap-4`). Card grids collapse to one column on phones and become three columns at `md`.

All layout respects safe areas. The bottom nav and sheet footers pad by `env(safe-area-inset-bottom)`, and the viewport uses `viewport-fit=cover`.

Touch targets are at least 44px tall: medium buttons are 44px, inputs and selects 48px, and bottom tabs 64px.

## Elevation & Depth

The system is flat at rest. Cards stand off the canvas through the colour step from Cool Canvas to Surface White plus a hairline border, not through shadow. Shadows are kept for layers that float above the page and for small affordances that show selection or press.

### Shadow Vocabulary
- **Accent lift** (`shadow-sm` tinted Ink Indigo at 30%): only under the primary button.
- **Selected chip** (`shadow-sm`): the active option in a segmented control.
- **Floating menu / toast** (`shadow-xl`): Listbox menus and toasts.
- **Sheet** (`shadow-2xl`): bottom sheets and dialogs, over an Ink scrim at 45%.
- **Thumb** (`0 1px 4px rgb(15 23 42 / 0.2)`): the slider thumb and switch knob.

The sticky header and bottom nav get depth from translucency (90–95% opacity with a backdrop blur), not from shadow.

### Named Rules
**The Flat-At-Rest Rule.** Cards never carry a shadow. If something casts a shadow, it is floating (a menu, sheet or toast) or being pressed or selected.

## Shapes

Everything is soft and rounded, and the radius grows with the size of the container: 10px for small icon tiles, 12px for buttons, inputs and medium tiles, 16px for segmented tracks, menus, toasts and large tiles, 24px for cards, and 28px for sheets (top corners only on phones). Avatars, progress bars, switches, the sheet grabber and the nav pill indicator are full pills.

The logo is a 64px Ink Indigo tile with 17px corners carrying a B and K monogram. The two letters lean on a shared stem, the B in white and the K in Blush, which is the North Star in miniature.

## Components

### Buttons
Buttons should feel bright and tactile: they press in under the thumb and give back a crisp colour step.
- **Shape:** 12px corners, semibold, with 8px between icon and label.
- **Sizes:** small is 36px tall with 13px+ text, medium is 44px with 15px text, large is 52px with 16px text, and the icon button is 44px square.
- **Primary:** Ink Indigo with white text and an accent-lift shadow. Hover deepens it to Deep Ink Indigo.
- **Secondary (default):** Surface White with a hairline border and Ink text. Hover fills it with Cool Canvas.
- **Soft:** Indigo Mist with Ink Indigo text, for supportive actions such as "Get a check-up".
- **Ghost:** text only. Hover adds an Ink wash at 5%.
- **Danger:** Bad-coloured text. Hover adds a Bad wash at 10%.
- **States:** every variant shrinks to `scale(.97)` when pressed and shows a 2px Ink Indigo focus outline offset by 2px. A busy button shows a spinning loader. Disabled buttons drop to 50% opacity.

### Cards / Containers
- **Corner style:** 24px.
- **Background:** Surface White with a hairline border and 20px padding.
- **Feature card:** one card per screen may be filled with Ink Indigo and white text (on Home, it holds the settle-up).
- **Empty state:** a centred card with a small bar-chart illustration in the brand tints (Indigo Mist, mid indigo, Ink Indigo, Blush), a bold title, muted copy and one primary action.

### Inputs / Fields
- **Style:** 48px tall, Surface White, a hairline border and 12px corners. Labels sit above in 14px semibold, with optional 13px muted hints below.
- **Focus:** the border turns Ink Indigo and gains a 2px Ink Indigo ring at 20%.
- **Money input:** a muted `$` prefix with 17px semibold tabular digits, plus optional − and + steppers 44px wide. It keeps what the person typed until the field loses focus.
- **Select:** a Headless UI listbox. Each option can carry an icon or avatar plus a one-line hint. The selected option shows an Ink Indigo check, and the menu scales in from 95%.
- **Segmented:** a Cool Canvas track with 4px padding. The active option is a Surface White chip with a small shadow, and inactive options are muted.
- **Switch:** a 48×28 pill with a Hairline track that turns Ink Indigo when on, and a white knob that slides across.
- **Slider:** an 8px pill track filled up to the value (Ink Indigo by default, or a partner colour), with a 26px white thumb ringed in the fill colour that grows while dragged.

### Navigation
- **Phone:** a fixed five-tab bottom bar in translucent Surface White with a hairline top border. Each 64px tab stacks an icon over an 11px label. The active tab turns Ink Indigo and sits its icon in an Indigo Mist pill. The sticky top header shows the logo, the name, sync status and Settings.
- **Wider screens:** a 240px Surface White sidebar. Each 44px link is an icon plus a semibold label, and the active link is Indigo Mist with Ink Indigo text. Settings and sync status sit at the bottom.

### Sheet
On phones this is a bottom sheet with 28px top corners, a 40×4 Hairline grabber and a sticky footer that respects the safe area. It slides up from below in 260ms on an exponential ease-out and leaves in 180ms, animating only transform and opacity. It ignores taps while leaving, so the screen underneath responds straight away, and it keeps showing its content until it is gone. From `md` it becomes a centred dialog up to 512px wide, with all four corners at 28px, fading in and rising 12px.

### Avatar & Split Bar (signature)
An avatar is a full-circle initial in white on that partner's colour. Shared shows a people icon on Lagoon Teal. Split bars place the partner colours side by side in proportion to their shares, labelled with avatars and tabular percentages. Together these are the "two hands" of the North Star.

### Hero Number (signature)
A muted label (such as "Left to spend") above a Display number that counts up to its value. It turns Bad when the number is negative or over budget. A muted two-line comparison (such as "spent of budgeted") sits to the right.

### Spending Calendar
A seven-column month of days shaded in five quiet steps of Ink (5–34% opacity), scaled on a square root and capped at the 90th percentile so one large bill cannot wash out the month. Every cell keeps ink text and an 11px tabular amount. Today is underlined. On phones it shows one week and expands to the whole month on request. It never uses a partner colour.

### Toast
An Ink pill with 16px corners and white 15px medium text. It sits just above the tab bar on phones, where the thumb already is, and bottom-centre on wider screens. One toast shows at a time, and it is announced politely to screen readers. A toast can carry one action (such as Undo) in a light indigo text button, and then it stays for 6 seconds instead of 3.4.

## Do's and Don'ts

### Do:
- **Do** lead each screen with one Display hero number in tabular figures, labelled in muted text above it.
- **Do** use Ink Indigo for Partner One, Rose for Partner Two and Lagoon Teal for shared, wherever ownership is shown.
- **Do** keep cards flat: Surface White, a hairline border and 24px corners.
- **Do** use the press feedback (`scale(.97)` on buttons, a Cool Canvas fill on rows), the first-visit rise, count-up and pop for success, and keep everything working with `prefers-reduced-motion`.
- **Do** offer Undo for anything destructive, and say how many other records a bulk change will touch before it happens.
- **Do** keep touch targets at 44px or more, inputs at 48px and body text in inputs at 16px or more.
- **Do** show category colour as a 12% tint behind an icon in full colour.

### Don't:
- **Don't** put shadows on resting cards. Shadows belong to menus, sheets, toasts and pressed or selected affordances.
- **Don't** reuse the partner or shared colours for unrelated meanings.
- **Don't** set money in proportional figures or in the body face at hero size.
- **Don't** fill more than one card per screen with Ink Indigo. The feature card is the exception that makes it stand out.
- **Don't** use Blush for text. It is an illustration and logo tint.
