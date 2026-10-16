---
name: Wheelman
description: "Carbarn's reply assistant, a local messaging-style page in Carbarn's blue. Pick a waiting customer, check the suggested reply sitting unsent in the message box with the car they are asking about beside it, copy it."
colors:
  # Light theme (default). Keys are the custom property names in web/css/tokens.css.
  brand: "#0073ea"
  panel: "#f2f6fb"
  tray: "#dde5ef"
  side: "#ffffff"
  side-hover: "#f3f8fe"
  side-on: "#e6f1fe"
  thread: "#edf3fa"
  bubble-in: "#ffffff"
  bubble-out: "#d7eaff"
  bubble-sys: "#fff3cf"
  pill: "#ffffff"
  sheet: "#ffffff"
  line: "#e1e8f0"
  line-strong: "#c5d1de"
  text: "#061d33"
  muted: "#3b5068"
  faint: "#54687d"
  on-out: "#061d33"
  on-sys: "#55431a"
  accent: "#0473ea"
  accent-press: "#035fc4"
  accent-ink: "#ffffff"
  accent-soft: "#deeeff"
  accent-text: "#0459b8"
  red: "#a8261d"
  red-soft: "#fde9e6"
  amber: "#6d4a00"
  amber-soft: "#ffeaa6"
  blue: "#0c3a66"
  blue-soft: "#e3effc"
  bubble-out-meta: "#0459b8"
  toast-bg: "#061d33"
  toast-ink: "#f2f7fc"
  photo-ground: "#dfe7f0"
  scrim: "rgba(6, 29, 51, .40)"
  scrim-soft: "rgba(3, 15, 28, .55)"
  on-scrim: "#ffffff"
  # The viewer. The same in both themes: photos are judged on a dark ground.
  viewer-bg: "#030f1c"
  viewer-bar: "#071a2d"
  viewer-ink: "#eef4fa"
  viewer-muted: "#a9bccf"
  viewer-line: "#1b3550"
  viewer-btn: "#0f2840"
  viewer-btn-hover: "#173654"
  # Dark theme. Same custom properties, redefined under prefers-color-scheme: dark.
  brand-dark: "#3d9bff"
  panel-dark: "#0b2640"
  tray-dark: "#020c18"
  side-dark: "#061d33"
  side-hover-dark: "#0b2640"
  side-on-dark: "#103252"
  thread-dark: "#041627"
  bubble-in-dark: "#12304d"
  bubble-out-dark: "#0c4a86"
  bubble-sys-dark: "#2c2a1c"
  pill-dark: "#0f2b47"
  sheet-dark: "#12304d"
  line-dark: "#153655"
  line-strong-dark: "#2a4d70"
  text-dark: "#e8f0f8"
  muted-dark: "#b1c3d6"
  faint-dark: "#94a9bf"
  on-out-dark: "#eef6ff"
  on-sys-dark: "#e6d9a4"
  accent-dark: "#3d9bff"
  accent-press-dark: "#2f86e3"
  accent-ink-dark: "#04162a"
  accent-soft-dark: "#0f3559"
  accent-text-dark: "#8cc4ff"
  red-dark: "#ff9f95"
  red-soft-dark: "#43211d"
  amber-dark: "#ffd977"
  amber-soft-dark: "#4a3a0c"
  blue-dark: "#a9d0ff"
  blue-soft-dark: "#123457"
  bubble-out-meta-dark: "#b9dcff"
  toast-bg-dark: "#e8f0f8"
  toast-ink-dark: "#061d33"
  photo-ground-dark: "#0f2b47"
  scrim-dark: "rgba(0, 0, 0, .55)"
  # Avatar grounds. The same in both themes, always with white initials.
  avatar-ink: "#ffffff"
  avatar-default: "#5a6f85"
  avatar-0: "#0c3a66"
  avatar-1: "#2a6f97"
  avatar-2: "#5b4b8a"
  avatar-3: "#1f7a6d"
  avatar-4: "#9b4a3c"
  avatar-5: "#3f5a73"
  avatar-6: "#8a4f7d"
  avatar-7: "#8f5a14"
typography:
  wordmark:
    fontFamily: '"Montserrat", "Manrope", "Segoe UI", system-ui, sans-serif'
    fontSize: "1.3125rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "1.375rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "normal"
  body:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  editor:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  control:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label-strong:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "normal"
  caption:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  mono:
    fontFamily: '"Cascadia Mono", Consolas, ui-monospace, monospace'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  pill: "999px"
  full: "50%"
spacing:
  sp-05: "0.125rem"
  sp-1: "0.25rem"
  sp-2: "0.5rem"
  sp-3: "0.75rem"
  sp-4: "1rem"
  sp-5: "1.25rem"
  sp-6: "1.5rem"
  sp-8: "2rem"
  sp-10: "2.5rem"
components:
  brand-mark:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    size: "2.25rem"
  wordmark:
    textColor: "{colors.brand}"
    typography: "{typography.wordmark}"
  top-bar:
    backgroundColor: "{colors.side}"
    textColor: "{colors.text}"
    padding: "0 0.75rem 0 1rem"
    height: "3.5rem"
    rounded: "{rounded.lg}"
  section-track:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "0.125rem"
  section-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 0.75rem"
    height: "2.25rem"
  section-tab-on:
    backgroundColor: "{colors.side}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
  status-pill:
    backgroundColor: "{colors.side}"
    textColor: "{colors.muted}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    padding: "0 0.5rem 0 0.75rem"
    height: "2.25rem"
  popover:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.25rem 1.25rem"
    width: "24rem"
  find-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 0.75rem 0 2.5rem"
    height: "2.25rem"
    width: "15rem"
  find-field-focus:
    backgroundColor: "{colors.side}"
  find-row-on:
    backgroundColor: "{colors.side-on}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.25rem"
  button-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1.25rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-press}"
  button-primary-wait:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1.25rem"
    height: "2.25rem"
  button-primary-wait-hover:
    backgroundColor: "{colors.side-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.25rem"
  button-small:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    padding: "0 0.75rem"
    height: "1.75rem"
  mini-button:
    backgroundColor: "transparent"
    textColor: "{colors.accent-text}"
    typography: "{typography.label-strong}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    size: "2.5rem"
  filter-chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "0 0.75rem"
    height: "1.75rem"
  filter-chip-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    typography: "{typography.control}"
  segment-track:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "0.125rem"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.sm}"
    padding: "0 1rem"
    height: "2.25rem"
  segment-on:
    backgroundColor: "{colors.side}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
  search-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 1rem 0 2.5rem"
    height: "2.25rem"
  search-field-focus:
    backgroundColor: "{colors.side}"
  instruction-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.25rem"
  conversation-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "0.5rem 1rem 0.5rem 0.75rem"
    height: "4rem"
  conversation-row-hover:
    backgroundColor: "{colors.side-hover}"
  conversation-row-current:
    backgroundColor: "{colors.side-on}"
  avatar:
    backgroundColor: "{colors.avatar-default}"
    textColor: "{colors.avatar-ink}"
    rounded: "{rounded.full}"
    size: "3rem"
  avatar-small:
    size: "2.5rem"
  badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 0.5rem"
    height: "1.25rem"
  tag:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: "0 0.5rem"
  tag-warning:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
  tag-danger:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
  tag-info:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
  tag-success:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  bubble-in:
    backgroundColor: "{colors.bubble-in}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.5rem 0.5rem"
  bubble-out:
    backgroundColor: "{colors.bubble-out}"
    textColor: "{colors.on-out}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.5rem 0.5rem"
  pill-date:
    backgroundColor: "{colors.pill}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.75rem"
  pill-event:
    backgroundColor: "{colors.bubble-sys}"
    textColor: "{colors.on-sys}"
  pill-unanswered:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  car-strip:
    backgroundColor: "{colors.side}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "0.5rem 1rem"
  car-thumb:
    backgroundColor: "{colors.photo-ground}"
    rounded: "{rounded.sm}"
    width: "4rem"
    height: "3rem"
  message-box:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.editor}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem 0.5rem"
  quiet-panel:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
  advice-fail:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  advice-blank:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  advice-input:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  blank-button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.amber}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.xs}"
    padding: "0.125rem 0.5rem"
  notice:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.75rem 1rem"
  notice-bad:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
  notice-info:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
  panel-section:
    backgroundColor: "{colors.side}"
    textColor: "{colors.text}"
    typography: "{typography.ui}"
    padding: "1rem 1.25rem 1.25rem"
  another-car-band:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  car-hero:
    backgroundColor: "{colors.photo-ground}"
    rounded: "{rounded.lg}"
  photo-tile:
    backgroundColor: "{colors.photo-ground}"
    rounded: "{rounded.sm}"
  count-chip:
    backgroundColor: "{colors.scrim-soft}"
    textColor: "{colors.on-scrim}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
  video-poster:
    backgroundColor: "{colors.photo-ground}"
    rounded: "{rounded.sm}"
    width: "5.5rem"
    height: "3.5rem"
  play-disc:
    backgroundColor: "{colors.scrim-soft}"
    textColor: "{colors.on-scrim}"
    rounded: "{rounded.full}"
    size: "2.5rem"
  doc-icon:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.sm}"
    size: "2.5rem"
  viewer:
    backgroundColor: "{colors.viewer-bg}"
    textColor: "{colors.viewer-ink}"
  viewer-bar:
    backgroundColor: "{colors.viewer-bar}"
    textColor: "{colors.viewer-ink}"
    typography: "{typography.ui}"
    padding: "0.5rem 1.25rem"
  viewer-button:
    backgroundColor: "transparent"
    textColor: "{colors.viewer-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1rem"
    height: "2.25rem"
  viewer-button-hover:
    backgroundColor: "{colors.viewer-btn-hover}"
  viewer-nav:
    backgroundColor: "{colors.viewer-btn}"
    textColor: "{colors.viewer-ink}"
    rounded: "{rounded.full}"
    size: "3rem"
  viewer-thumb:
    backgroundColor: "{colors.viewer-btn}"
    rounded: "{rounded.sm}"
    width: "5rem"
    height: "3.5rem"
  dialog:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
    width: "28rem"
  toast:
    backgroundColor: "{colors.toast-bg}"
    textColor: "{colors.toast-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1rem"
---

# Design System: Wheelman

## Overview

**Creative North Star: "The Unsent Draft"**

Wheelman is Carbarn's reply assistant, and it looks and behaves like a desktop messaging app with the car beside it. A bar across the top holds the name and the four sections as tabs. Conversations are listed in a column on the left, one conversation is open in the middle, and the car the customer is asking about is on the right. The message box at the bottom of the conversation already holds a suggested reply. That reply is a draft: it is labelled "not sent", it can be edited in place, and the main button only copies it. The car's photos, videos and documents are one press from that draft. Everything on the page supports reading one conversation, checking one draft and putting the right car in it.

The look is quiet and familiar on purpose, in Carbarn's own colours. The top bar and the three columns are white and pale blue tiles with rounded corners, set apart by narrow gaps of a darker tray rather than by lines; inside a tile, parts are separated by 1px lines and small shifts in tone. The thread sits on a pale blue ground one step deeper than the panels, so the white and blue bubbles read against it. Carbarn's blue marks what is chosen, what is new and what to press. Red, amber and navy appear only as status, always with words beside them. The car photos carry the colour; the interface stays quiet around them, and photos and videos open large in a near-black viewer in both themes, as in any photo app. Text is navy, set in Manrope, the typeface of carbarn.com.au, in sentence case throughout. The one exception is the name: WHEELMAN in Montserrat capitals beside a white steering wheel on a blue disc, with "by Carbarn" under it. Light and dark both ship and follow the computer's setting; the dark theme is built on navy and there is no theme switch.

Density is that of a working tool: 15px body text, 36px controls, 56px bars, 64px list rows, 2px between bubbles from the same sender. Two earlier layouts were rejected by the owner: a page of cards with every customer open at once and coded labels (29 Sep 2026), and a details sidebar of label-value rows with a section switch that took the top of the list (redesigned 16 Oct 2026). This system keeps one conversation and its car in view and says things in words.

**Key Characteristics:**
- A top bar, then three columns in one fixed-height frame: conversation list, open conversation, and the car and customer panel.
- The four sections are tabs in the top bar, each with a count; the list column holds only the list.
- The suggested reply lives in the message box, never in the thread.
- The car is always in view: a photo on the strip above the thread, the full car in the panel, any car through Find a car.
- One blue accent, Carbarn's. Red, amber and navy are status colours that always come with words.
- Manrope for all text, sentence case, tabular figures. The Montserrat wordmark is the only capitals.
- Four rounded tiles on a darker tray, with gaps in place of lines between them; inside, flat white and pale blue surfaces, 1px dividers, two shadow levels. Photos are the only rich colour.
- Pill-shaped controls, 8px corners on bubbles and photos, 16px on the four tiles, the car's main photo and floating panels, circles for avatars, icon buttons and the mark.
- Short motion: 160ms press feedback, 220ms for photos, the draft and the viewer, 260ms for the drawer, none on keyboard moves and none under reduced motion.
- Light and a navy-based dark from one set of custom properties; the viewer is dark in both.

## Colors

Carbarn's palette: the blue of the Carbarn wordmark, navy text, white and pale blue surfaces, and three status hues that are only ever used as a soft ground with matching text. Every value is a custom property in `web/css/tokens.css`, declared once for light and once for dark; the other stylesheets only say `var(--name)`, and `npm run check-css` fails a colour, font size, corner or space typed anywhere else. The frontmatter lists the dark value under the same key with a `-dark` suffix.

### Primary
- **Carbarn Blue** (`brand`): the colour of the wordmark, the disc of the steering-wheel mark (the drawing takes the current colour, so the disc is the lighter blue in dark; the browser-tab icon keeps the light value), and the 3px line under the chosen section tab.
- **Action Blue** (`accent`): solid fill for the primary button and every count badge (section tabs, list rows, the jump button, the back button). Also the "checked" status dot, the focus ring, the text caret, the border a field takes when focused, the outline of the current thumbnail in the viewer's filmstrip, and the chosen voice-over chip in the viewer. In light it sits four units of red from Carbarn Blue; in dark the two are the same value.
- **Action Blue Pressed** (`accent-press`): the primary button under the pointer.
- **Ink on Blue** (`accent-ink`): text and icons on a solid blue fill. White in light; near-black navy in dark because the dark accent is bright.
- **Blue Tint** (`accent-soft`): ground for "on" states: the selected filter chip, a toggled button (Rewrite, Prompt, Good reply once approved, Could be better), the "unanswered messages" pill, the success tag and text selection. It is also the ground of the document tile in the car panel.
- **Blue Text** (`accent-text`): blue used as text: links and link buttons, Copy link and Add to reply in the panel, the time on a row with unanswered messages, "Available" and "This customer's car" in an availability line, the "Figures and links match your records" line, "Copied", and the "writing a suggestion…" line in the conversation header. On an outgoing bubble the staff name uses `bubble-out-meta`: Blue Text in light, a lighter blue (#b9dcff) in dark.

### Secondary
Status colours, not accents. Each is a pair: a strong value used as text and a soft value used as its ground.
- **Check Red** (`red` on `red-soft`): something failed a check or must not be done. Failed-figure advice, error notices, the opted-out panel, the save note when a change could not be saved yet, "Sold" and "Reserved" availability, the "Check the reply" tag, the red status dot.
- **Blank Amber** (`amber` on `amber-soft`): a person has to act or wait. Blanks in the draft, the "Replace the highlighted part" line, warning notices, the "Blank to fill", "Due" and "Folded in Gmail" tags, cars not yet on the lot (in transit, in Japan, being prepared, unknown), a car's photos that could not be read, the busy status dot.
- **Note Navy** (`blue` on `blue-soft`): information that needs the user's attention but blocks nothing. Input advice above the draft, the import-enquiry line above the message box, the "Needs you" tag, the "Another car" band in the panel, the key box in the AI dialog. Its soft ground is close to Blue Tint, so the navy text, the icon and the sentence are what set it apart.

### Tertiary
Identity only, never meaning.
- **Avatar grounds** (`avatar-0` to `avatar-7`, plus `avatar-default`): eight muted hues, tuned to sit with the blue, assigned from a hash of the customer's name so the same person always gets the same colour. A missing name gets the slate default and a person icon. Initials and icon are `avatar-ink`, white. The values are the same in both themes.

### Neutral
- **Panel Mist** (`panel`): the ground of the Review and sign-in pages, the conversation and panel headers, the area around the message box, the fill of chips, the search and Find a car fields and the segmented track, the 8px bands between sections in the panel, and the empty conversation.
- **Tray** (`tray`: #dde5ef light, #020c18 dark): the ground the four tiles sit on (the top bar, the list, the conversation and the panel), seen only in the 0.375rem (6px) gaps around and between them. One step deeper than Panel Mist in light and darker than the list in dark, so the tiles stand apart without a line or a shadow.
- **List White** (`side`): the top bar, the conversation list, the car strip, the panel and the status pill. In dark it is Carbarn's navy. `side-hover` is a row or result under the pointer; `side-on` is the open row and the highlighted Find a car result.
- **Thread Blue** (`thread`): the ground behind bubbles. Used nowhere else.
- **Incoming Bubble** (`bubble-in`): the customer's messages.
- **Outgoing Bubble** (`bubble-out`) with **Outgoing Text** (`on-out`): messages sent by staff.
- **Event Cream** (`bubble-sys`) with **Event Text** (`on-sys`): system events in the thread, such as an enquiry arriving from a car portal. The one warm surface on the page.
- **Pill** (`pill`) and **Sheet** (`sheet`): the date pill; and the message box, the quiet panel, the jump button, the Load older button, the status panel, the Find a car results and the AI dialog. Both white in light; in dark the sheet is one step lighter than the panel so the message box and the floating panels still read as raised.
- **Photo Ground** (`photo-ground`: #dfe7f0 light, #0f2b47 dark): behind a photo that is still on its way, in the strip thumbnail, the main photo, the grid tiles and the video posters.
- **Line** (`line`): 1px dividers between bars, columns and rows, and the border of the status pill and floating panels. In the panel header it is also the track of the Car | Customer switch.
- **Strong Line** (`line-strong`): outlines of bordered controls and of the message box at rest, scrollbar thumbs, list bullets, loading shimmer.
- **Navy Ink** (`text`), **Muted** (`muted`), **Faint** (`faint`): three steps of text, all on the navy hue. Navy Ink for names, headings and message text; Muted for secondary sentences, resting control labels and car facts; Faint for times, previews, placeholders and fine print.

### The viewer and overlays
- **Viewer** (`viewer-bg` #030f1c, `viewer-bar`, `viewer-line`, `viewer-btn`, `viewer-btn-hover`, `viewer-ink`, `viewer-muted`): near-black navy grounds and pale text for the full-window viewer. One set for both themes.
- **Scrims**: `scrim` behind a dialog; `scrim-soft` with white `on-scrim` text for the photo count chip, the "+N" tile and the play disc, laid directly on photos.
- **Toast** (`toast-bg`, `toast-ink`): navy with near-white text in light, inverted in dark.

### Named Rules
**The One Blue Rule.** Carbarn's blue is the only accent. Solid blue is the primary button, the badges, the wordmark, the mark, the "checked" dot and the focus ring; the tint with blue text marks things that are on. A second accent hue would break the reading "blue means chosen, new, or press here".

**The Words With Colour Rule.** Red, amber and navy never carry meaning alone. Every tinted block holds a plain sentence, every tag is a word ("Check the reply", "Blank to fill", "Needs you"), and each status or availability dot sits beside words that say the same thing.

**The Paired Tint Rule.** A status colour is a soft ground with its strong value as text on top, or the strong value as text on a neutral surface. The strong value fills nothing larger than an 8px dot or a 1px underline.

**The Quiet Frame Rule.** The car photos are the only rich colour on the page. Around them the interface stays white, pale blue and navy; nothing decorative is tinted to compete with a car.

## Typography

**Display Font:** Montserrat 800 (with Manrope, Segoe UI, system-ui, sans-serif), used for the wordmark and nothing else
**Body Font:** Manrope (with Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Roboto, sans-serif)
**Label/Mono Font:** Cascadia Mono (with Consolas, ui-monospace, monospace), used only for AI model names in the status panel and the AI dialog

**Character:** Manrope, the typeface of carbarn.com.au, at working sizes. Hierarchy comes from weight and a narrow range of sizes, not from a second family. Figures are tabular everywhere, so times, prices and counts line up. Both typefaces are served from the page's own `web/fonts` folder; Manrope is declared for every weight from 400 to 800, so the in-between weights the page uses are real.

### Hierarchy
- **Wordmark** (Montserrat 800, 1.3125rem / 21px, line-height 1, 0.01em, uppercase): the name in the top bar, in Carbarn Blue. "by Carbarn" sits 0.25rem under it in Manrope at 0.75rem / 650, Faint, 0.01em.
- **Headline** (650, 1.375rem / 22px, -0.02em, balanced wrap): the one sentence in the empty conversation that says how many are waiting.
- **Title** (650, 1.0625rem / 17px): the open conversation's name, the car's name at the top of the panel (line-height 1.2, balanced), the panel title when it has no tabs, "Wheelman now" at the top of the status panel, the AI dialog's title, the empty-list heading.
- **Body** (400, 0.9375rem / 15px, line-height 1.45): the default, message bubbles, and names in the conversation list (500, rising to 650 when that customer has unanswered messages).
- **Editor** (400, 0.9375rem / 15px, line-height 1.5): the draft in the message box and the paste box.
- **UI** (0.875rem / 14px): list previews, filter chips and segments (500, or 650 when selected), section tabs (500, 650 when chosen), rows in the Customer tab, the car's name on the strip, video and document names (650), the quiet panel, the viewer's caption. **Control** is the same size at 650: button labels and the toast.
- **Label** (0.8125rem / 13px): the status pill, notices, the line under the name in the conversation header, the car strip, date and event pills, advice lines, fine print. **Label strong** is the same size at 650: section headings in the panel and the status panel, the "Suggested reply" label, the sender line on a bubble (line-height 1.2), small buttons, Copy link and Add to reply, the blank buttons.
- **Caption** (0.75rem / 12px): times in the list and inside bubbles, badge numerals (700), tags (650), the word count, the "written at" time, Find a car's stock, price and kilometres, the photo count chip (650), a document's kind.

### Named Rules
**The One Family Rule.** Every word of interface text is Manrope. Montserrat appears once, at 800, for the wordmark. Both are files in `web/fonts`; the page loads nothing from outside, and falls back to the computer's own sans if a file is missing. Mono appears only for an AI model's name, which the owner may need to type exactly.

**The Weight Is State Rule.** 400 is reading text, 500 is a resting name, chip, tab or segment, 650 is emphasis, every heading, and anything selected or unanswered, 700 is kept for badge numerals and the "+N" photo tile, and 800 for the wordmark and the one Undo inside a toast. A name, chip or tab going from 500 to 650 is a state change, always paired with a colour change.

**The Ink Heading Rule.** Headings are Navy Ink at 650, in the panel, the status panel and the dialog alike. Blue is for what is chosen, new or pressable, never for a heading.

**The Sentence Case Rule.** The wordmark is the only uppercase text on the page. There are no uppercase labels and no letter-spaced labels. Letter-spacing is only tightened on the headline (-0.02em) and opened by 0.01em on the wordmark, the "by Carbarn" line and avatar initials. Italic is reserved for text the app supplies in place of content: "Photo" or "Attachment" inside a bubble and "writing a suggestion…" in the header.

## Layout

The page is the height of the window and the document itself never scrolls. It is a column on the Tray, 0.375rem in from the window's edges: the top bar (3.5rem), then, 0.375rem below it, a grid that fills the rest. Without the panel the grid is the conversation list (minimum 20rem, maximum 25rem) and the conversation, which takes the rest. With the panel open the list narrows to at most 22rem, the conversation takes the rest, and the panel is 26rem, with 0.375rem of Tray between each. At 1440 by 900 that is a 352px list, a 648px conversation and a 416px panel. Each column scrolls its own content.

The top bar is one bar across the page with no dividing line inside it, so it reads as the frame of the whole page, not as part of the conversation under it (the owner's correction, 16 Oct 2026). The brand sits at the left; the section tabs sit in the middle of the bar; Find a car, the status pill, the cog and the "check now" button sit at the right, the last button level with the button below it (the panel button in the conversation header, or the panel's close button when the panel is open). The two sides share the width equally so the tabs stay centred; a side that needs more room takes it, and the tabs move over rather than run under it, always at least 1rem clear of both sides. The list column stacks: notices (only when something needs action, at most two, at most 40% of the column), the search field, the filter chips, the scrolling rows, and a footer that appears only in Auction. The conversation column stacks: a header 3.5rem tall, the car strip, the thread, and the message box docked at the bottom. The panel's header matches the conversation header's height so the two bands line up.

The thread is anchored to the bottom: with few messages they sit just above the message box, not at the top. It always keeps at least 30% of the window height (22% on a narrow window); on a short window the message box scrolls first. Its side padding scales with width (6% of the column, clamped between 0.75rem and 4.5rem). Bubbles are at most 72% of the thread or 36rem, whichever is smaller; pills at most 85% or 34rem. Consecutive bubbles from the same sender are 0.125rem apart; a change of sender adds 0.5rem.

Spacing is a 4px grid with 2px for hairline gaps: `sp-05` 0.125rem, `sp-1` 0.25rem, `sp-2` 0.5rem, `sp-3` 0.75rem, `sp-4` 1rem, `sp-5` 1.25rem, `sp-6` 1.5rem, `sp-8` 2rem, `sp-10` 2.5rem. The Tray between the tiles has its own step, `tile-gap` 0.375rem (6px). Horizontal padding inside bars and columns is mostly 1rem; panel sections are padded 1rem by 1.25rem; controls sit 0.25 to 0.5rem apart.

Responsive behaviour:
- **1279px and under:** the panel leaves the grid and becomes a drawer over the conversation: a Round tile floating 0.375rem in from the right, top and bottom edges, 26rem wide, or the full width less those edges if narrower. Crossing below this width closes it; above it, the panel opens or stays closed as the owner last left it. The list keeps to 22rem at most, so the conversation keeps its room.
- **Under 1440px:** Find a car waits behind a search icon that opens it across the bar, so the tabs stay centred and clear of both sides.
- **1100px and under:** "by Carbarn", the chevron on the status pill and "Open listing" on the car strip are hidden.
- **1000px and under:** the brand shows only its mark, and the tabs sit a little closer together.
- **860px and under:** one column. The page shows either the list or the conversation; a back button with the count of other conversations waiting appears in the conversation header. The brand shows only its mark. The section track moves to a row of its own under the bar, with no line above it, starting at its left edge and scrolling sideways when it is wider than the window; it is hidden while a conversation is open. The car strip's button shortens to "23 photos". Bubbles widen to 86%, thread and message-box gutters tighten to 0.75rem, the draft's maximum height drops from 28% to 20% of the window height, the quieter buttons under the draft lose their icons, and the word count is hidden. The tiles sit 0.25rem apart and 0.25rem in from the window's edges, with Soft corners.

Layering, lowest first: the jump-to-newest and Load older buttons over the thread, the panel drawer, the Find a car results, the toast. The status panel, the AI dialog and the viewer open in the browser's top layer, above everything.

### Named Rules
**The Tiles Rule.** The top bar, the list, the conversation and the panel are four tiles with Round corners on the Tray, 0.375rem apart and 0.375rem in from the window's edges (the owner's choice, 16 Oct 2026; narrowed from 0.5rem the same day). The gaps separate them, never a line. Inside a tile nothing is boxed again: headers, the car strip, rows and bands run edge to edge within it.

**The Docked Draft Rule.** The suggestion is always in the message box at the bottom of the conversation column. The thread holds only what was really said, plus pills.

**The Bottom-Anchored Thread Rule.** The thread opens at its newest message and stays there as the message box grows or new messages arrive, until the user scrolls up more than about 60px. Then a round button appears at the bottom right to return, showing the unanswered count.

**The Thread Keeps Its Share Rule.** However tall the message box grows, the conversation keeps 30% of the window (22% narrow). The message box scrolls inside itself before the thread is squeezed further.

## Elevation & Depth

Mostly flat. The four tiles are told apart by the Tray between them; inside a tile, regions are told apart by tone (white bars and list, pale panel, slightly deeper blue thread) and 1px lines. Neither uses a shadow. Shadows are small, tinted with the navy of the text, and have two jobs: lifting a message-like object off its ground, and marking something that floats over other content. In dark the same two tokens switch to stronger black shadows, and the raised look of the message box comes from its lighter surface. Photos get no shadow; they sit on their own rounded corners. The viewer has none either: its depth is the near-black ground.

### Shadow Vocabulary
- **Resting lift** (`box-shadow: 0 1px 1px rgba(6, 29, 51, .10)`; dark `0 1px 1px rgba(0, 0, 0, .35)`): bubbles, date and event pills, the message box, the quiet panel, the paste box, the sticky Load older button, and the selected segment of a switch in light (in dark it has none).
- **Chosen section lift** (`box-shadow: 0 1px 3px rgba(6, 29, 51, .16), 0 0 0 1px` Line; dark `0 1px 3px rgba(0, 0, 0, .45)`): the chosen section pill in the top bar, and nothing else.
- **Floating** (`box-shadow: 0 2px 6px rgba(6, 29, 51, .10), 0 8px 24px rgba(6, 29, 51, .10)`; dark `0 2px 6px rgba(0, 0, 0, .35), 0 10px 28px rgba(0, 0, 0, .4)`): the jump-to-newest button, the toast, the panel when it is a drawer, the status panel, the Find a car results, the AI dialog.
- **Scrim** (`rgba(6, 29, 51, .40)`; dark `rgba(0, 0, 0, .55)`): behind the AI dialog. The viewer's backdrop is its own near-black ground.

### Named Rules
**The Two Shadows Rule.** Only these two shadows exist, and the lift under the chosen section in the top bar (the owner asked for the tabs "popped up", 16 Oct 2026). The bar, columns, headers, rows, chips, the other tabs and ordinary buttons have none. The panel gets a shadow only when it floats over the conversation as a drawer; as a grid column it is a tile like the others, with the Tray around it.

## Shapes

Six corner steps, each with its own kind of thing:
- **Hairline (`xs`, 0.25rem):** tags, the buttons that name a blank, the highlight behind a blank or a failed figure, and loading bars.
- **Gentle (`sm`, 0.5rem):** things that hold a message, a picture or a piece of advice: bubbles, pills, advice lines, the strip thumbnail, photo tiles, video posters, document tiles, filmstrip thumbnails, Find a car results, segments, the name button in the header.
- **Soft (`md`, 0.75rem):** the message box, the quiet panel, the paste box, notices, the segmented track, the "Another car" band, the import-enquiry line.
- **Round (`lg`, 1rem):** the four tiles (the top bar, the list, the conversation and the panel, as a drawer too) and Find a car when it opens across the bar, the car's main photo, and everything that floats: the status panel, the Find a car results, the AI dialog. At 860px and under the tiles take Soft corners.
- **Pill (`pill`):** every control with its own fill or outline, whatever its height: buttons, chips, the section tabs and their track, the search and Find a car fields, the status pill, selects and instruction fields, badges, the photo count chip, the toast.
- **Circle (`full`):** avatars, icon buttons, status dots, the jump button, the play disc, the viewer's previous and next buttons, the numbered steps in the empty conversation, and the brand mark.

Inside a tile, conversation rows, headers and bands are square and run edge to edge; the tile's own corners clip them.

Photos keep the car's own shape: cover-cropped to 4:3 in the grid and the strip thumbnail (64 by 48), 16:10 for the main photo, and contained, never cropped, in the viewer.

The brand mark is a disc in the style of Carbarn's round icon: a Carbarn Blue circle carrying a white steering wheel (a ring, a bar across it just above centre, one spoke down to the rim, and a solid hub). It is one drawing on a 48-unit grid with 4.5-unit white strokes and round ends, kept once in `web/assets/brand.svg` and used at 2.25rem in the top bar and 5rem in the empty conversation; `web/icon.svg` is the same drawing for the browser tab.

The first bubble in a run from one sender has its top corner on the sender's side squared off and a small triangular tail there (0.5rem wide, 0.75rem tall), pointing left for the customer and right for staff. Later bubbles in the run have no tail. A text seen only on the phone carries a 1px dashed outline in its own text colour.

Borders are 1px. `line` divides the bands inside a tile (a header from what is under it) and the rows; the divider between rows starts 4.5rem in, under the text, so avatars are not underlined. `line-strong` outlines the bordered buttons, the fields and the message box. Sections in the panel are separated by a 0.5rem band of the panel colour.

Icons are one drawn set: 24px grid, 1.75 stroke, round caps and joins, no fills, coloured by the surrounding text. They render at 1.25rem by default, 1rem inside buttons, fields and advice lines, 0.875rem beside a small link, on the status pill and in the photo count chip. The play triangle in a play disc is filled; the brand mark is the only other filled drawing.

## Components

### Brand block
The name of the product, at the left of the top bar.
- **Mark:** the steering-wheel disc at 2.25rem, 0.75rem to the left of the words.
- **Wordmark:** WHEELMAN in Montserrat 800 capitals at 1.3125rem, Carbarn Blue, line-height 1.
- **By-line:** "by Carbarn" 0.25rem below, 0.75rem / 650, Faint. Hidden at 1100px and under; at 860px and under only the mark shows.
- The block is not a link or a button and has no states.

### Top bar and section tabs
A white tile 3.5rem tall with Round corners and no line under it; the Tray shows between it and the columns.
- **Track:** the four sections sit in the middle of the bar on one Panel Mist pill with 0.125rem of padding and 0.125rem between the tabs (the owner asked for "pills type (poped up)", 16 Oct 2026).
- **Tabs:** Dashboard, Marketplace, Auction, Import Query, each a pill 2.25rem tall with 0.75rem side padding (0.5rem at 1000px and under), Muted at 0.875rem / 500. A badge after each label counts the conversations there with something new, and is hidden at zero. A section that is switched off has no tab; with only the Dashboard there are no tabs.
- **Chosen:** raised off the track: List White with the chosen section lift in light, a lighter navy (#183c61) with a dark lift in dark, the label in Navy Ink at 650. Hover on another tab, on fine pointers only, washes it with 5% of the text colour and darkens its label; pressing scales a tab to 0.97. Arrow keys, Home and End move between tabs.
- **Behaviour:** switching resets the list to its first chip, clears the search and closes the open conversation. The four sections are never mixed.

### Find a car
A pill field in the top bar, 15rem wide (11rem at 1100px and under), Panel Mist fill, a search icon inside its left edge, placeholder "Find a car". Focus turns the fill List White and the border Action Blue.
- **Results:** a floating sheet under the field, right-aligned, up to 24rem wide and 70% of the window tall, 1rem corners, 0.25rem padding, floating shadow. Each result is two lines: the car's name at 0.875rem / 650, then its stock number, price, kilometres and availability (dot and words) at 0.75rem Faint. The highlighted result is `side-on`; hover is `side-hover`. Arrow keys move, Enter opens, Escape closes. With nothing found it says so in a sentence.
- **Opening a car** puts it in the panel's Car tab under an "Another car" band, beside whatever conversation is open.
- **Narrow:** the field waits behind a search icon button and, pressed, covers the whole bar until it closes.

### Status pill and status panel
How Wheelman is doing, in a few words, at the right of the top bar.
- **Pill:** 2.25rem, List White with a 1px Line border, a 0.5rem status dot, a few words ("Up to date", "Checking", "Writing", "Dashboard not reached", "Not checked yet", "Not responding") at 0.8125rem / 650 Muted, and a small chevron (hidden at 1100px and under). Hover turns it `side-hover` with Navy Ink text. Its tooltip lists every line.
- **Dot:** blue after a successful check, red after a failed one, amber and slowly pulsing while checking or writing, Faint when unknown. The words always say the same thing.
- **Panel:** opens under the pill with its right edge on the pill's: a Sheet with a 1px Line border, 1rem corners and the floating shadow, up to 24rem wide and 70% of the window tall, 0.8125rem text. "Wheelman now" as its title; a bulleted list of what was checked, the AI requests used and the budget; "Writing, in this order" with the AI models numbered in mono; "Suggestions are written by …" with a Change link to the AI dialog; "What it reads and has learned" (replies read, lessons, backup); and the team link when the page is shared. Sub-headings are 0.8125rem / 650 Navy Ink; bullets are 4px Strong Line dots.

### Buttons
Rounded, low, quiet until needed. One filled button per view.
- **Shape:** pill, 2.25rem tall, 1rem side padding, label at 0.875rem / 650, optional 1rem icon before the label with a 0.5rem gap.
- **Primary:** solid Action Blue with Ink on Blue, 1.25rem side padding. This is "Copy reply", and also "Write it now", "Try again", "Put back in Waiting" and "They wrote this". In a Marketplace chat the primary is "Send reply", with a paper-plane icon, and "Copy reply" drops to a plain button beside it.
- **Primary, blanks remaining:** while the draft still contains a blank, the copy button drops to the sheet colour with Navy Ink text and a Strong Line outline and reads "Copy with blanks". It still works; it stops inviting.
- **Plain:** transparent, Muted text, no outline (Rewrite, Clear, Prompt, Good reply, Could be better). Toggled on, it takes Blue Tint with Blue Text.
- **Outline:** transparent with a Strong Line outline and Navy Ink text ("Write it again", "Write a reply anyway", "Dismiss this conversation", "Load older conversations").
- **Small:** 1.75rem tall, 0.75rem side padding, 0.8125rem label. The car strip's "23 photos · 4 videos" is a small outline button.
- **Mini:** no fill, no outline, Blue Text at 0.8125rem / 650 with a 0.875rem icon, underlined on hover: Copy link, Add to reply and Open beside each video and document.
- **Link:** Blue Text at 650, underlined: "Change", "See all 23", "Read again", the ways back in the "Another car" band.
- **Icon button:** 2.5rem circle, transparent, Muted icon. The "check now" icon spins while a check is running.
- **Name button:** the avatar, name and sub-line in the conversation header are one button that opens the panel on the Customer tab. No fill, 0.5rem corners.
- **Hover / Focus:** hover, on fine pointers only, washes the button with 7% of the text colour (8% for icon buttons) and turns the label to Navy Ink; the primary goes to Action Blue Pressed. Pressing scales to 0.97 (0.94 for icon buttons, 0.96 for blank buttons and the back button) over 160ms. Keyboard focus is a 2px Action Blue outline, 2px out. Disabled is 55% opacity (50% for icon buttons).

### Tags
The one small label on the page, in front of a row's preview text.
- **Style:** 0.75rem / 650, 0.5rem side padding, 0.25rem corners, line-height 1.5. Neutral is Panel Mist with Muted text ("Dismissed", "Phone only", an order's list); warning is the amber pair ("Blank to fill", "Due: car secured", "Folded in Gmail"); danger the red pair ("Check the reply"); info the navy pair ("Needs you", a reply that is due); success the blue tint.
- At most two on a row. They sit inline with the preview and never change the row's height. A dismissed row shows no number badge and is not bold.

### Chips
The lists of the section, above the rows.
- **Labels:** All and Waiting in Dashboard, Marketplace and Import Query; To do, In progress and Finished in Auction. Only Waiting (and To do) carries a count.
- **Style:** 1.75rem pill, Panel Mist ground, Muted text at 0.875rem / 500, 0.75rem side padding, no outline. The count follows the label at 650.
- **State:** the selected chip takes Blue Tint, Blue Text and 650. Exactly one is selected. Hover on an unselected chip uses the open-row colour. Press scales to 0.97. Arrow keys move between them.

### Segmented switch
Exactly one of two or three, in a track: the panel's Car | Customer, and the viewer's groups.
- **Style:** a 0.75rem track with 0.125rem padding holding equal segments 2.25rem tall with 0.5rem corners, Muted at 0.875rem / 500. In the panel header the track is Line, so it shows against the Panel Mist band.
- **State:** the selected segment takes the switch's "on" ground (List White in light, the open-row colour in dark), Navy Ink at 650 and the resting lift in light. Hover darkens another segment's label. Press scales to 0.97.

### Cards / Containers
There are no cards: the four tiles are the page's frame, and nothing inside them is boxed again. The containers inside are message-shaped:
- **Message box:** see below.
- **Quiet panel:** in place of the message box when no draft applies (already replied, opted out, dismissed, not written yet, failed). Sheet colour, 0.75rem corners, resting lift, 0.75rem by 1rem padding, one sentence in Muted at 0.875rem and at most two buttons beside it. The sentence turns Check Red for opted out and failed.
- **Loading:** while a suggestion is written the message box shows "Writing a suggestion" over a sheet holding three bars (38%, 92%, 64% wide, 0.75rem tall) with a slow shimmer between Line and Strong Line. The list shows six skeleton rows (a grey circle and two shimmering lines) while it loads.

### Inputs / Fields
- **Search** (in the list column) and **Find a car** (in the top bar): 2.25rem pills, Panel Mist fill, no visible border, a 1rem search icon inside the left edge. On focus the fill turns List White and the border turns Action Blue; there is no outline ring.
- **Instruction fields** (what to change in a rewrite, what could be better, the prompt): 2.25rem pills, sheet fill, Strong Line border, Action Blue border on focus, each with an outline button beside it.
- **Draft textarea:** borderless and transparent inside the message box. The box is an editor, so it carries a 1px Strong Line outline at rest and an Action Blue border while anything inside has focus; empty, it shows "Type your reply here" in Faint.
- **Select** (Which message? in Auction, the fields of the AI dialog): 2.25rem pill, sheet fill, Strong Line border, 500 text, Action Blue border on focus.
- Placeholders use Faint at full opacity. Carets are Action Blue.

### Navigation
The conversation list is the navigation inside a section.
- **Row:** a full-width button at least 4rem tall. 3rem avatar, then the name and time on top, the car on its own line in Muted at 0.8125rem (Marketplace, Auction and Import Query), then the preview and badge. Padding 0.5rem top and bottom, 0.75rem left, 1rem right. Name 0.9375rem / 500; time 0.75rem Faint; preview 0.875rem Faint, one line, cut with an ellipsis, with up to two tags before it. "You:" before our own last message is Muted.
- **Unanswered:** the name goes to 650, the time turns Blue Text at 650, and a blue badge with the count sits at the right of the preview line.
- **States:** hover is `side-hover`; the open row is `side-on` and stays that colour under the pointer. Focus is the blue outline drawn 2px inside the row. Rows have no transition, so moving with the arrow keys is instant.
- **More:** twenty rows at a time; an outline "Load older conversations" button under the last row, with how many are left in Faint.
- **Empty list:** centred, a 1.0625rem / 650 line and a Faint sentence under it.
- **Narrow:** the list fills the window; opening a row swaps to the conversation.

### List footer
A quiet strip under the rows, below a 1px line, in Faint at 0.8125rem, shown only in Auction: how many orders were read from the dashboard and how they split across To do, In progress and Finished. Plain text, no colour, no icon.

### Avatar and badge
- **Avatar:** a circle with white initials (first and last name) at 650. 3rem in the list, 2.5rem in the conversation header. Ground from the eight avatar hues.
- **Badge:** Action Blue pill, 1.25rem tall and at least as wide, Ink on Blue numerals at 0.75rem / 700. Used on the section tabs, on rows, on the jump button and on the narrow-layout back button. It always carries words for a screen reader.

### Message bubbles
- **Incoming:** left, Incoming Bubble ground, Navy Ink text. **Outgoing:** right, Outgoing Bubble ground, Outgoing Text.
- 0.5rem corners, resting lift, padding 0.25rem top, 0.5rem sides and bottom, 0.9375rem text at line-height 1.45. Line breaks in the message are kept.
- The first bubble in a run carries the sender line at 0.8125rem / 650: the staff member's name on outgoing bubbles (`bubble-out-meta`), the channel ("via the website") in Muted on incoming ones.
- The time floats at the bottom right at 0.75rem: Faint on incoming, the bubble's own text colour at 70% on outgoing. In Marketplace a reply still being typed by the engine's phone shows "Sending" in its place.
- A photo the dashboard holds is shown in the bubble at up to 20rem tall with 0.5rem corners and opens full size; otherwise an italic "Photo" or "Attachment" with the image icon. Links keep the bubble's text colour and are underlined.

### Thread pills
Centred, 0.5rem corners, 0.8125rem text, padding 0.25rem by 0.75rem.
- **Date:** Pill ground, Muted text, resting lift ("Today", "Yesterday", or the full date).
- **Event:** Event Cream with Event Text, for things the system did, with the time after it.
- **Unanswered marker:** Blue Tint with Blue Text at 650 and no shadow, placed above the first message that has not been answered.
- **Note:** no ground and no shadow, Muted text, for staff notes and Marketplace's "An auto-reply is queued" line.
- **Load older messages:** an outline button with resting lift, pinned to the top of the thread while there is history to bring in.

In Marketplace, event pills close the thread when the auto-reply has handed the chat to a person, had a reply fail, or left an answer unsent for more than 15 minutes. Outgoing bubbles there are labelled "Auto-reply" or "Typed by a person".

### Car strip
One line under the conversation header on List White, with a 1px line under it.
- **With a car:** the car's first photo as a 4rem by 3rem thumbnail with 0.5rem corners (an image icon on Photo Ground until it arrives, then a 220ms fade), then two lines: the car's name in Navy Ink at 0.875rem / 650, and its price, kilometres and availability at 0.8125rem Muted. At the right, a small outline button with an image icon, "23 photos · 4 videos", and "Open listing" with an external-link icon. The thumbnail and the button open the panel on the Car tab.
- **An order or an unmatched listing:** one wrapping line of words: the car at 650, the stage or "Not in the stock list" with its dot, the deposit state, and a link ("Open the auction car", "Open on Facebook") pushed to the right.
- **Availability** everywhere is a 0.5rem dot plus words at 650, both in Blue Text (available, or the customer's own car), Check Red (sold, reserved) or Blank Amber (in transit, in Japan, being prepared, unknown).
- Hidden when there is no car, order or listing.

### Message box
The signature component. Top to bottom:
1. **Import line** (only for a dashboard enquiry read as an import enquiry): Note Navy on its soft ground, 0.75rem corners, one sentence and underlined choices ("Move to Import Query", "Not an import enquiry").
2. **Label row:** "Suggested reply" at 0.8125rem / 650 followed by "· not sent · click in the text to change it" in Faint at 500 ("Suggested reply, changed by you · not sent" once edited, "Your reply" once cleared); at the right the word count (with "about N texts" once an SMS passes 160 characters) and when it was written or saved, both 0.75rem Faint.
3. **Advice lines** (below).
4. **The sheet:** sheet colour, 0.75rem corners, resting lift, a 1px Strong Line outline that turns Action Blue while anything inside has focus. It holds the draft and a foot row. On the left: Rewrite, then Good reply and Could be better (dashboard and import replies only). On the right, kept together so they never wrap apart: Clear (hidden when the box is empty), Copy reply, and in a Marketplace chat Send reply.
5. **Rewrite row / Could be better row** (when on): the instruction field and an outline button ("Write it again", "Rewrite and learn").
6. **After copying:** a Blue Text "Copied" with a check icon.

**Before a suggestion exists** the box is the quiet panel: one sentence in Muted ("A suggestion will be written within a few minutes.", the reason nothing is written by itself, or the time Wheelman tries again while the models are busy), then **Prompt** (plain button, toggled on while its line is open) and **Write it now** (primary). Prompt opens a full-width row under them: the pill field "What should the reply say? For example: we have none of that model, we can source one" and an outline **Write from this**. Enter writes; Escape or Prompt again closes the row and keeps the words.

The draft is a textarea that grows with its text from 4.5rem up to 28% of the window height (20% narrow), then scrolls. Behind it is an exact copy of the text in transparent ink, used only to paint highlights: a blank such as `[PRICE?]` gets Blank Amber's soft ground with a thin amber ring; a figure or link that failed a check gets Check Red's soft ground with a 1px red underline. The highlights follow the text as the user types and disappear when the marked text is removed. A new suggestion fades in over 220ms from a 2px blur. Ctrl + Enter in the draft copies it.

### Advice lines
One sentence each, directly above the sheet, 0.8125rem, 0.5rem corners, 0.5rem by 0.75rem padding, in this order:
- **Failed check:** Check Red on its soft ground at 500, alert icon.
- **Blanks:** Blank Amber on its soft ground at 500, pencil icon: "Replace the highlighted part before sending:" followed by one small button per blank, named in words ("the price", "the date"). Pressing a button selects that blank in the draft, so typing replaces it. The buttons are sheet-coloured with 0.25rem corners and a border at 40% of the amber text. A reason, when there is one, wraps onto its own line.
- **Needs input:** Note Navy on its soft ground, info icon. A cleared box shows one of these with "Bring back the suggestion".
- **Caution:** plain Faint text, no ground.
- **All clear:** plain Blue Text with a check icon, shown only when the draft had figures or links and none failed. If the user has edited the draft it is replaced by a Faint line saying the typed text has not been checked.

### Add to reply
Every photo group, video and document in the panel and the viewer has Add to reply. It types "Label: link" (for example "Walkaround 360 video: …") into the draft on its own line: where the owner last put the cursor, otherwise just before the sign-off or the standard block, otherwise at the end. It is typed the way typing is, so Ctrl + Z takes it out, and a toast says "Added to the reply". On a window too narrow for the panel beside the conversation, the drawer closes so the link is seen arriving.

### Panel (car and customer)
On the right of the conversation, opened from the header's panel button, the name button, the car strip or Find a car. On a wide window it opens by default and remembers being closed.
- **Header:** the Panel Mist band 3.5rem tall, holding the Car | Customer switch (Order or Enquiry in place of Customer for auction orders and emails), or a plain title when there is no Car tab, and a close icon button at the right.
- **Body:** List White, scrolling, sections padded 1rem by 1.25rem and separated by 0.5rem Panel Mist bands. Section headings are 0.8125rem / 650 Navy Ink, with an optional link ("See all 23") at the right.

**Car tab:**
- **Another car band** (only for a car opened with Find a car): Note Navy on its soft ground, 0.75rem corners, "Another car · Stock N" and a way back ("Back to Sam's car", "Close this car").
- **Main photo:** the car's first photo at 16:10, 1rem corners, inset 1rem from the panel's sides, zooming 2% under the pointer. A count chip sits at its bottom right: "23 photos" in white at 0.75rem / 650 on the soft scrim, with an image icon. While the photos are read it is a shimmering placeholder of the same shape.
- **Headline:** the car's name (1.0625rem / 650, line-height 1.2); "Stock N", the price ("…, government charges extra", hidden once sold) and kilometres in Muted at 0.8125rem; the facts a buyer asks first in one line ("Petrol · Automatic · 7 seats · White"); availability; and "Open listing".
- **Photos:** a 3-column grid of 4:3 tiles with 0.25rem gaps and 0.5rem corners, the first nine, the last of them a "+N" tile (white 1.0625rem / 700 on the soft scrim) when there are more. Each tile zooms 4% under the pointer and opens the viewer there. **Auction photos** follow the same way with six.
- **Videos:** a list, each row a 5.5rem by 3.5rem poster with a 2.5rem play disc on the soft scrim, then the name (0.875rem / 650 Navy Ink, opens the viewer) and Copy link · Add to reply.
- **Documents:** a list, each row a 2.5rem Blue Tint tile with the file, picture or album icon, then the name as a link, its kind ("PDF", "Picture", "Google Photos album") in Faint at 0.75rem, and Open · Copy link · Add to reply.
- **Included with this car:** a bulleted list.
- **Foot:** "Read from the dashboard 2 min ago." in Faint with a Read again link.
- **Empty and error states** are sentences: "No videos of this car on the dashboard yet." in Faint; a read that failed is a Blank Amber line with an alert icon and a Try again outline button; with no car matched the tab says to use Find a car.

**Customer tab:** the customer's details as a two-column list with no heading of its own (the tab, or the panel's heading when there is no car, already says Customer, Buyer, Order or Enquiry) (Faint labels in a 7rem column, values beside them at 0.875rem; the phone and email copy when pressed), then the section's own blocks (Marketplace, the Import Query email, the auction order, what an import customer is looking for), "What the suggestion relies on" as a short bulleted list and fine print, the import ruling buttons, Dismiss, and "All times are Sydney time." There is no large avatar.

On a window 1279px and under the panel is a drawer: it slides in from the right over 260ms, takes the focus, and closes with Escape.

### Viewer
A car's photos and videos large, over the whole window, on the near-black viewer ground in both themes.
- **Head:** the viewer bar with a 1px viewer line under it: the car's name at 0.875rem / 650, a segmented switch of the groups with their counts ("Photos 23", "Auction photos 6", "Videos 4"; the chosen one on the lighter viewer button ground in viewer ink), and a close icon button at the right.
- **Stage:** the picture or video fills the space between the bars and keeps its shape (contained, never cropped), fading in over 220ms. Round previous and next buttons, 3rem, on the viewer button ground, sit either side and wrap around; they are hidden for a single item. A click on the dark ground around the picture closes the viewer. A video that cannot play on the page shows its poster and a sentence saying to open it.
- **Bar:** the item's name and "3 of 23" in viewer muted; for a video with both versions, two chips "With voice-over" and "Without" (the chosen one solid Action Blue, the other on the viewer button ground); then Copy link (the button itself says "Copied" for a moment, since the page's toast would sit behind the viewer), Add to reply (closes the viewer so the link is seen arriving), and Open original. These are pill buttons outlined in the viewer line with viewer ink, turning to the lighter viewer button ground under the pointer.
- **Filmstrip:** thumbnails 5rem by 3.5rem with 0.5rem corners at 55% opacity; the current one at full opacity with a 2px Action Blue outline, kept in view. Video thumbnails carry a small play disc.
- **Keys:** Left and Right move, Home and End jump, Escape closes.

### Dialog
The panel behind the cog (which AI writes): a Sheet up to 28rem wide with 1rem corners and the floating shadow over the scrim, 1.25rem padding, a 1.0625rem / 650 title with a close button, fields labelled at 0.8125rem / 650, a navy key box when a key is missing, and the buttons at the bottom right.

### Notices
Problems that need action now, at the top of the list column: rounded blocks (0.75rem corners) with 0.5rem between them, inset 0.75rem from the column's sides. A 1.25rem icon column, then a 650 title and a sentence or short list at 0.8125rem. Blank Amber pair for warnings (suggestions paused, budget used, the phone add-on silent), Check Red pair for failures (setup not finished, the dashboard or Marketplace not reached, a suggestion that could not be written), Note Navy pair for information. At most two are shown, most serious first. Reminders are never notices.

### Toast
A navy pill with near-white text in the light theme and a pale pill with navy text in the dark theme, 0.875rem / 650, 0.75rem by 1rem padding, floating shadow, at most 28rem wide. It is placed by script, centred over the conversation column just under the car strip so it never covers the message box, and fades and drops 0.75rem into place over 160ms. It stays 2.6 seconds, longer for a long sentence (up to 14 seconds).

Toast with an action: after Dismiss the toast carries one underlined "Undo" button at weight 800, stays for nine seconds, and accepts clicks while it is showing. A plain toast never takes clicks.

### Empty conversation
When no conversation is open: centred on Panel Mist, the brand mark at 5rem, the headline, three numbered steps (1.75rem circles on List White with Navy Ink numerals at 650), and two Faint lines: that nothing is sent from the page (or, in Marketplace, only by Send), and that any car's photos, videos and documents are under Find a car.

### Import Query
An email thread uses the same frame as a conversation. The row carries the subject on the car line, the address stands in for a missing name, and a "Folded in Gmail" amber tag marks a thread with a message Gmail had folded. The header reads "Email · subject" and its copy button copies the address. Customer bubbles say "via Email"; ours carry the sender's name from Gmail, or "Sent from Gmail". The panel opens on its Enquiry view: an Import Query block (subject, address with copy, message count, first and latest) and a Research notes heading for what the website said about the model asked about.

### Auction orders
An order uses the same frame as a conversation, with these differences.
- **Row:** the customer, the car on its own line in Muted, then a "Due: …" tag (amber, or navy when the customer wrote and a reply is due) followed by the stage in plain words, or their message.
- **Car strip:** the car, the stage with the amber dot (red once the order is finished), the deposit state, and a link to the auction car when there is one.
- **Thread:** steps of the order (opened, deposit received, car secured) are event pills. A message copied from Wheelman is an outgoing bubble labelled "Copied from Wheelman"; a pasted one is labelled "via WhatsApp" or "Pasted by you" and carries a small underlined "Remove".
- **Order bar:** a row above the message box. On the left "Which message?" at 0.8125rem / 650 with a pill select; on the right the plain "Paste their message" button.
- **Paste box:** a Sheet with the Strong Line outline and an Action Blue border on focus, holding a plain text area and a footer: a Faint line saying nothing is sent, then an outline "We sent this" and the primary "They wrote this".
- **Message box:** the shared editor. Rewrite becomes "Add what you know"; "Refresh figures" appears for a message that quotes the live auction; there is no Good reply or Could be better, because nothing is learned here.
- **Panel:** the Order view in place of the Customer tab.

### Dismiss placement
Dismiss is not in the message box. It lives in the last section of the Customer tab, as an outline button under a one-line explanation. Clear only empties the box; it does not dismiss the conversation.

### Motion
- **Press:** 160ms scale to between 0.94 and 0.97 with `cubic-bezier(.23, 1, .32, 1)`. Colour and border changes take 160ms with the default ease.
- **Appearing:** the jump button and the toast take 160ms; the arriving draft, photos (strip thumbnail, main photo, viewer), and the viewer itself 220ms, with the same strong ease-out. The panel drawer slides in over 260ms with `cubic-bezier(.32, .72, 0, 1)`. Under the pointer a photo tile zooms 4% over 220ms, the main photo 2% over 260ms, a play disc 8% over 160ms.
- **Waiting:** the busy dot pulses over 1.4s, the "check now" icon spins at 0.7s a turn, the loading bars, skeleton rows and the loading main photo shimmer over 1.2s.
- **Reduced motion:** every duration token drops to zero and every loop stops; nothing animates.

## Do's and Don'ts

### Do:
- **Do** take every colour, size, space, corner, shadow and duration from `web/css/tokens.css`, give any new colour a light value and a dark value there, and keep `npm run check-css` passing.
- **Do** keep solid blue for the primary button, the badges, the wordmark, the mark, the "checked" dot and the focus ring, and use Blue Tint with Blue Text for anything that is switched on.
- **Do** set headings in Navy Ink at 650; blue is for what is chosen, new or pressable.
- **Do** show the name as it is built: the white steering wheel on a Carbarn Blue disc, WHEELMAN in Montserrat 800 capitals, and "by Carbarn" under it.
- **Do** put a plain sentence in every red, amber or navy block, and use the strong value as text on its own soft ground.
- **Do** keep the suggested reply in the message box under the label "Suggested reply · not sent", with one filled button: Copy reply, or Send reply in a Marketplace chat.
- **Do** mark blanks in amber and failed figures in red inside the draft text itself, and name each blank on a button that selects it.
- **Do** keep the car in view beside the conversation, and give every photo group, video and document Copy link and Add to reply.
- **Do** put a link into a reply with its label, on a line of its own, typed so Ctrl + Z takes it out.
- **Do** let the photos carry the colour: Photo Ground behind a photo still loading, the soft scrim for anything laid on one, and the near-black viewer in both themes.
- **Do** use the two shadows as they are used now: resting lift for bubbles, pills and the message box; floating for the jump button, the toast, the drawer and the panels that open over the page.
- **Do** give pressable controls the 160ms press scale (0.94 to 0.97) and keep hover styles inside the fine-pointer media query.
- **Do** build content from text nodes and draw new icons on the same 24px grid with a 1.75 stroke and round ends.
- **Do** keep text at 4.5:1 or better against its ground in both themes. The closest pairs are the white label on the primary button in light (about 4.5:1) and, in dark, the primary button under the pointer and the outgoing timestamp (both about 4.9:1).

### Don't:
- **Don't** show the suggestion as a bubble in the thread. The thread is only what was really said.
- **Don't** add anything that looks like sending where nothing is sent. Outside a Marketplace chat there is no send icon and no "Send" label; the button at the bottom right of the message box says what it does, which is copy. In a Marketplace chat the one Send button reads "Send reply", sends exactly the text in the box, waits while a blank is still to be filled, and reads "Sending" until the engine answers.
- **Don't** put the sections back in the list column. They are tabs in the top bar; the list column is the list.
- **Don't** add a second accent colour, and don't use solid red, amber or navy as a fill larger than a status dot.
- **Don't** signal status with colour alone or with a code. Write the words.
- **Don't** add uppercase or letter-spaced labels. The wordmark is the only capitals, and Montserrat belongs to it alone.
- **Don't** add a third typeface or load a font from outside; Manrope and Montserrat are served from `web/fonts`. Don't add a library either. The page loads nothing from outside: car pictures come through Wheelman's own addresses, videos from Carbarn's own storage, and its content security policy forbids inline styles and scripts.
- **Don't** add another shadow, or put a shadow on the bar, a column, a header, a row, a chip, a tab or an ordinary button. Don't separate the four tiles with lines, or box anything again inside a tile: the Tray between them is their only divider.
- **Don't** animate the conversation list when it is moved through with the keyboard. Rows change instantly.
- **Don't** insert customer text as HTML, and don't use real customer names, numbers, messages or cars in examples of this system; use invented ones.
