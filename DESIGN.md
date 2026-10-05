---
name: Wheelman
description: "Carbarn's reply assistant, a local messaging-style page in Carbarn's blue. Pick a waiting customer, check the suggested reply sitting unsent in the message box, copy it."
colors:
  # Light theme (default). Keys are the custom property names in web/styles.css.
  brand: "#0073ea"
  panel: "#f2f6fb"
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
  # Dark theme. Same custom properties, redefined under prefers-color-scheme: dark.
  brand-dark: "#3d9bff"
  panel-dark: "#0b2640"
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
  # Avatar grounds. Written directly in the stylesheet, the same in both themes, always with white initials.
  avatar-default: "#5a6f85"
  avatar-h0: "#0c3a66"
  avatar-h1: "#2a6f97"
  avatar-h2: "#5b4b8a"
  avatar-h3: "#1f7a6d"
  avatar-h4: "#9b4a3c"
  avatar-h5: "#3f5a73"
  avatar-h6: "#8a4f7d"
  avatar-h7: "#8f5a14"
typography:
  wordmark:
    fontFamily: '"Montserrat", "Manrope", "Segoe UI", system-ui, sans-serif'
    fontSize: "1.3125rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  title-lg:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  title:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "normal"
  body:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  body-sm:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
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
  thread-meta:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.78125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  timestamp:
    fontFamily: '"Manrope", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, sans-serif'
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  mono:
    fontFamily: '"Cascadia Mono", Consolas, ui-monospace, monospace'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  mark: "0.1875rem"
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  pill-sm: "1rem"
  pill: "1.125rem"
  pill-lg: "1.25rem"
  full: "50%"
spacing:
  "2": "0.125rem"
  "4": "0.25rem"
  "6": "0.375rem"
  "8": "0.5rem"
  "10": "0.625rem"
  "12": "0.75rem"
  "14": "0.875rem"
  "16": "1rem"
  "20": "1.25rem"
  "24": "1.5rem"
components:
  brand-mark:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    size: "2.125rem"
  wordmark:
    textColor: "{colors.brand}"
    typography: "{typography.wordmark}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1.125rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-press}"
  button-primary-wait:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 1.125rem"
    height: "2.25rem"
  button-primary-wait-hover:
    backgroundColor: "{colors.side-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 0.875rem"
    height: "2.25rem"
  button-quiet-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 0.875rem"
    height: "2.25rem"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    size: "2.5rem"
  filter-chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill-sm}"
    padding: "0 0.625rem"
    height: "2rem"
  filter-chip-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  search-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 0.875rem 0 2.25rem"
    height: "2.25rem"
  search-field-focus:
    backgroundColor: "{colors.side}"
  instruction-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.pill-lg}"
    padding: "0 0.875rem"
    height: "2.5rem"
  conversation-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "0.625rem 1rem 0.625rem 0.75rem"
  conversation-row-hover:
    backgroundColor: "{colors.side-hover}"
  conversation-row-current:
    backgroundColor: "{colors.side-on}"
  avatar:
    backgroundColor: "{colors.avatar-default}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    size: "3rem"
  badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.caption}"
    rounded: "0.625rem"
    padding: "0 0.375rem"
    height: "1.25rem"
  bubble-in:
    backgroundColor: "{colors.bubble-in}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.5625rem 0.4375rem"
  bubble-out:
    backgroundColor: "{colors.bubble-out}"
    textColor: "{colors.on-out}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.5625rem 0.4375rem"
  pill-date:
    backgroundColor: "{colors.pill}"
    textColor: "{colors.muted}"
    typography: "{typography.thread-meta}"
    rounded: "{rounded.sm}"
    padding: "0.3125rem 0.75rem"
  pill-event:
    backgroundColor: "{colors.bubble-sys}"
    textColor: "{colors.on-sys}"
  pill-unanswered:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  message-box:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.75rem 0.875rem 0.5rem"
  advice-fail:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    rounded: "{rounded.sm}"
    padding: "0.4375rem 0.625rem"
  advice-blank:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
    rounded: "{rounded.sm}"
    padding: "0.4375rem 0.625rem"
  advice-input:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
    rounded: "{rounded.sm}"
    padding: "0.4375rem 0.625rem"
  blank-button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "0.125rem 0.5rem"
  notice:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    padding: "0.625rem 1rem"
  notice-bad:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
  notice-info:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
  toast:
    backgroundColor: "#061d33"
    textColor: "#f2f7fc"
    typography: "{typography.body-sm}"
    rounded: "1.5rem"
    padding: "0.625rem 1rem"
---

# Design System: Wheelman

## Overview

**Creative North Star: "The Unsent Draft"**

Wheelman is Carbarn's reply assistant, and it looks and behaves like a desktop messaging app. Conversations are listed in a column on the left, one conversation is open on the right, and the message box at the bottom already holds a suggested reply. That reply is a draft: it is labelled "not sent", it can be edited in place, and the main button only copies it. Everything else on the page supports reading one conversation and checking one draft.

The look is quiet and familiar on purpose, in Carbarn's own colours. Surfaces are white and pale blue, separated by 1px lines and small shifts in tone. The thread sits on a pale blue ground one step deeper than the panels, so the white and blue bubbles read against it. Carbarn's blue marks what needs attention and what to press. Red, amber and navy appear only as status, always with a sentence beside them. Text is navy, set in Manrope, the typeface of carbarn.com.au, in sentence case throughout. The one exception is the name: WHEELMAN in Montserrat capitals beside a white steering wheel on a blue disc, with "by Carbarn" under it. Light and dark both ship and follow the computer's setting; the dark theme is built on navy and there is no theme switch.

Density is that of a working tool: 15px body text, 36px buttons, 2px between bubbles from the same sender. The layout this replaced, a page of cards with every customer open at once and coded labels, was rejected by the user as confusing. This system keeps one conversation in view and says things in words.

**Key Characteristics:**
- Three regions in one fixed-height frame: conversation list, open chat, optional details panel.
- The suggested reply lives in the message box, never in the thread.
- One blue accent, Carbarn's. Red, amber and navy are status colours that always come with words.
- Manrope for all text, sentence case, tabular figures. The Montserrat wordmark is the only capitals.
- Flat white and pale blue surfaces, 1px dividers, two shadow levels.
- Pill-shaped controls, 8px corners on bubbles, circles for avatars, icon buttons and the mark.
- Short motion: 160ms press feedback, 180 to 240ms for things that appear, none on keyboard moves.
- Light and a navy-based dark from one set of custom properties.

## Colors

Carbarn's palette: the blue of the Carbarn wordmark, navy text, white and pale blue surfaces, and three status hues that are only ever used as a soft ground with matching text. Every value is a custom property declared once for light and once for dark at the top of the stylesheet; the frontmatter lists the dark value under the same key with a `-dark` suffix.

### Primary
- **Carbarn Blue** (`brand`: #0073ea light, #3d9bff dark): the colour of the wordmark. The disc of the steering-wheel mark is the light value in both themes, written into the drawing itself.
- **Action Blue** (`accent`: #0473ea light, #3d9bff dark): solid fill for the primary button, the unanswered count badge and the "checked" status dot. Also the focus ring, the text caret, and the border a text field takes when focused. In light it sits four units of red from Carbarn Blue; in dark the two are the same value.
- **Action Blue Pressed** (`accent-press`: #035fc4 light, #2f86e3 dark): the primary button under the pointer.
- **Ink on Blue** (`accent-ink`: #ffffff light, #04162a dark): text and icons on a solid blue fill. White in light; near-black navy in dark because the dark accent is bright.
- **Blue Tint** (`accent-soft`: #deeeff light, #0f3559 dark): ground for "on" states: the selected filter chip, a toggled button, the "unanswered messages" pill, and text selection.
- **Blue Text** (`accent-text`: #0459b8 light, #8cc4ff dark): blue used as text: links, the time on a row with unanswered messages, the staff name on an outgoing bubble, section headings in the details panel, "Available" in the car strip, and the "figures match" line.

### Secondary
Status colours, not accents. Each is a pair: a strong value used as text and a soft value used as its ground.
- **Check Red** (`red` #a8261d on `red-soft` #fde9e6 light; #ff9f95 on #43211d dark): something failed a check or must not be done. Failed-figure advice, error notices, the opted-out message, "Sold", the "Check the reply" flag in the list.
- **Blank Amber** (`amber` #6d4a00 on `amber-soft` #ffeaa6 light; #ffd977 on #4a3a0c dark): a person has to act or wait. Blanks in the draft, the "replace the highlighted part" line, default notices, cars not yet on the lot, the "Blank to fill" flag, the busy status dot.
- **Note Navy** (`blue` #0c3a66 on `blue-soft` #e3effc light; #a9d0ff on #123457 dark): information that needs the user's input but blocks nothing. Input advice above the draft and the business-facts notice. Its soft ground is close to Blue Tint, so the navy text, the info icon and the sentence are what set it apart.

### Tertiary
Identity only, never meaning.
- **Avatar grounds** (`avatar-h0` to `avatar-h7`, plus `avatar-default`): eight muted hues, tuned to sit with the blue, assigned from a hash of the customer's name so the same person always gets the same colour. A missing name gets the slate default and a person icon. Initials and icon are white. The values are the same in both themes.

### Neutral
- **Panel Mist** (`panel`: #f2f6fb light, #0b2640 dark): page ground, chat and details headers, the area around the message box, the fill of chips and the search field, and the bands between sections in the details panel.
- **List White** (`side`: #ffffff light, #061d33 dark): the conversation list, the car strip, the details panel. In dark it is Carbarn's navy. `side-hover` is a row under the pointer; `side-on` is the open row, a pale blue in light.
- **Thread Blue** (`thread`: #edf3fa light, #041627 dark): the ground behind bubbles. Used nowhere else.
- **Incoming Bubble** (`bubble-in`: #ffffff light, #12304d dark): the customer's messages.
- **Outgoing Bubble** (`bubble-out`: #d7eaff light, #0c4a86 dark) with **Outgoing Text** (`on-out`): messages sent by staff.
- **Event Cream** (`bubble-sys`: #fff3cf light, #2c2a1c dark) with **Event Text** (`on-sys`): system events in the thread, such as an enquiry arriving from a car portal. The one warm surface on the page.
- **Pill** (`pill`) and **Sheet** (`sheet`): the date pill; and the message box, the round jump button and the "nothing to do" panel. Both white in light; in dark the sheet is one step lighter than the panel so the message box still reads as raised.
- **Line** (`line`: #e1e8f0 light, #153655 dark): 1px dividers between regions and rows.
- **Strong Line** (`line-strong`: #c5d1de light, #2a4d70 dark): outlines of bordered controls, scrollbar thumbs, list bullets, loading bars.
- **Navy Ink** (`text`), **Muted** (`muted`), **Faint** (`faint`): three steps of text, all on the navy hue. Navy Ink for names and message text; Muted for secondary sentences and resting control labels; Faint for times, previews, placeholders and fine print.

### Named Rules
**The One Blue Rule.** Carbarn's blue is the only accent. Solid blue is the primary button, the unanswered badge, the wordmark and the disc of the mark, the "checked" dot and the focus ring; the tint with blue text marks things that are on. A second accent hue would break the reading "blue means look here or press here".

**The Words With Colour Rule.** Red, amber and navy never carry meaning alone. Every tinted block holds a plain sentence, the list flags are words ("Check the reply", "Blank to fill"), and each status dot sits beside text that says the same thing.

**The Paired Tint Rule.** A status colour is a soft ground with its strong value as text on top, or the strong value as text on a neutral surface. The strong value fills nothing larger than an 8px dot or a 1px underline.

## Typography

**Display Font:** Montserrat 800 (with Manrope, Segoe UI, system-ui, sans-serif), used for the wordmark and nothing else
**Body Font:** Manrope (with Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, Helvetica Neue, Roboto, sans-serif)
**Label/Mono Font:** Cascadia Mono (with Consolas, ui-monospace, monospace), used only for file names inside notices

**Character:** Manrope, the typeface of carbarn.com.au, at working sizes. Hierarchy comes from weight and a narrow range of sizes, not from a second family. Figures are tabular everywhere, so times, prices and counts line up. Both typefaces are served from the page's own `web/fonts` folder; Manrope is declared for every weight from 400 to 800, so the in-between weights the page uses are real.

### Hierarchy
- **Wordmark** (Montserrat 800, 1.3125rem / 21px, line-height 1, 0.01em, uppercase): the name in the list header, in Carbarn Blue. The line "by Carbarn" sits 0.25rem under it in Manrope at 0.6875rem / 600, Faint, 0.01em.
- **Headline** (650, 1.5rem / 24px, -0.02em, balanced wrap): the one sentence in the empty chat that says how many customers are waiting.
- **Title large** (650, 1.25rem / 20px, -0.01em): the customer's name at the top of the details panel.
- **Title** (650, 1rem / 16px): the open conversation's name, the details panel heading, the empty-list heading. Names in the conversation list use this size at 500 and rise to 650 when that customer has unanswered messages.
- **Body** (400, 0.9375rem / 15px, line-height 1.45): the default. Message bubbles tighten to 1.4; the draft in the message box opens to 1.5 for editing.
- **Body small** (0.875rem / 14px): list previews, filter chips (500, or 650 when selected), rows in the details panel, the toast. Button labels are this size at 650.
- **Label** (0.8125rem / 13px): the status line, notices, the line under the name in the chat header, the car strip, the "Suggested reply · not sent" label (650), details section headings (650, blue), the "Learned from" line in the list footer, fine print.
- **Thread meta** (0.78125rem / 12.5px, line-height 1.4): date and event pills, and the sender's name at the top of a bubble (650, line-height 1.3).
- **Caption** (0.75rem / 12px): times in the list, badge numerals (700), the word count, the "written at" time.
- **Timestamp** (0.6875rem / 11px, line-height 1): the time inside a bubble. The smallest text on the page, shared only with the "by Carbarn" line.

Present in the build but not part of the ramp: weight 550 on the coloured advice lines, weight 600 on a handful of small controls and links (the time-window select, the listing link, the rating buttons, the toast, the "by Carbarn" line), and a 0.84375rem (13.5px) size used only by the advice lines. None has a role of its own.

### Named Rules
**The One Family Rule.** Every word of interface text is Manrope. Montserrat appears once, at 800, for the wordmark. Both are files in `web/fonts`; the page loads nothing from outside, and falls back to the computer's own sans if a file is missing. Mono appears only for a file name the user has to find.

**The Weight Is State Rule.** 400 is reading text, 500 is a resting name or chip, 650 is emphasis and anything selected or unanswered, 700 is kept for badge numerals, and 800 exists only in the wordmark. A name or chip going from 500 to 650 is a state change, always paired with a colour change.

**The Sentence Case Rule.** The wordmark is the only uppercase text on the page. There are no uppercase labels and no letter-spaced labels. Letter-spacing is only tightened on the two largest text sizes (-0.02em, -0.01em) and opened by 0.01em on the wordmark, the "by Carbarn" line and avatar initials. Italic is reserved for text the app supplies in place of content: "Photo" inside a bubble and "writing a suggestion…" in the header.

## Layout

The page is one frame the height of the window; the document itself never scrolls. A grid splits it into a conversation list (minimum 20rem, maximum 25rem), a chat column that takes the rest, and, when opened, a details column fixed at 22.5rem. Each column scrolls its own content.

The list column stacks: the brand block (mark, wordmark, "by Carbarn") with the "check now" button opposite, the Dashboard and Marketplace section switch, a one-line status, any notices (at most 40% of the column, then they scroll), the search field, three filter chips, the scrolling rows, and a footer holding the "Learned from N replies you used" line above the time-window select. The chat column stacks: a header at least 3.75rem tall, a one-line car strip, the thread, and the message box docked at the bottom. The details panel header matches the chat header's height so the two bands line up.

The thread is anchored to the bottom: with few messages they sit just above the message box, not at the top. Its side padding scales with width (6% of the column, clamped between 0.75rem and 4.5rem). Bubbles are at most 72% of the thread or 36rem, whichever is smaller; pills at most 85% or 34rem. Consecutive bubbles from the same sender are 0.125rem apart; a change of sender adds 0.5rem.

Spacing uses 2px steps of the root size with no named scale. The values that recur are 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875 and 1rem inside components, and 1.25 to 1.5rem for section padding in the details panel. Horizontal padding inside regions is mostly 1rem; controls sit 0.25 to 0.5rem apart.

Responsive behaviour:
- **1180px and under:** the details panel leaves the grid and becomes a drawer fixed to the right edge (22.5rem, or the full width if narrower), over the chat.
- **860px and under:** one column. The page shows either the list or the chat; a back button appears in the chat header, carrying a badge with the number of other customers waiting. Bubbles widen to 86%, thread and message-box gutters tighten, the draft's maximum height drops from 38% to 32% of the window height, and the word count is hidden.

Layering is three levels only: the jump-to-newest button above the thread, the details drawer above the chat, the toast above everything.

### Named Rules
**The Docked Draft Rule.** The suggestion is always in the message box at the bottom of the chat column. The thread holds only what was really said, plus pills.

**The Bottom-Anchored Thread Rule.** The thread opens at its newest message and stays there as the message box grows or new messages arrive, until the user scrolls up more than about 60px. Then a round button appears at the bottom right to return, showing the unanswered count.

## Elevation & Depth

Mostly flat. Regions are told apart by tone (white list, pale panel, slightly deeper blue thread) and 1px lines, not by shadow. Shadows are small, tinted with the navy of the text, and have two jobs: lifting a message-like object off the thread ground, and marking something that floats over other content. In dark the same two tokens switch to stronger black shadows, and the raised look of the message box comes from its lighter surface.

### Shadow Vocabulary
- **Resting lift** (`box-shadow: 0 1px 1px rgba(6, 29, 51, .10)`; dark `0 1px 1px rgba(0, 0, 0, .35)`): bubbles, date and event pills, the message box, the "nothing to do" panel.
- **Floating** (`box-shadow: 0 2px 6px rgba(6, 29, 51, .10), 0 8px 24px rgba(6, 29, 51, .10)`; dark `0 2px 6px rgba(0, 0, 0, .35), 0 10px 28px rgba(0, 0, 0, .4)`): the jump-to-newest button, the toast, and the details panel when it is a drawer.

### Named Rules
**The Two Shadows Rule.** Only these two shadows exist. Columns, headers, rows, chips and buttons have none. The details panel gets a shadow only when it overlays the chat; as a grid column it has a 1px line.

## Shapes

Three corner families. Things that hold a message or a piece of advice have gently rounded corners (0.5rem): bubbles, pills, advice lines. The message box and the "nothing to do" panel are slightly rounder (0.75rem). Controls with their own fill or outline are pills, with the radius set to half the control's height (1rem on 2rem chips, 1.125rem on 2.25rem buttons and the search field, 1.25rem on 2.5rem fields). Avatars, icon buttons, status dots, the jump button, the numbered steps in the empty chat and the brand mark are circles.

Smaller radii are for small things: 0.375rem on the buttons that name a blank and on the loading bars, 0.1875rem on the highlight behind a blank or a failed figure. Conversation rows and notices are square and run edge to edge.

The brand mark is a disc in the style of Carbarn's round icon: a Carbarn Blue circle carrying a white steering wheel (a ring, a bar across it just above centre, one spoke down to the rim, and a solid hub). It is one drawing on a 48-unit grid with 4.5-unit white strokes and round ends, used at 2.125rem in the list header, 4.5rem in the empty chat, and as the browser tab icon.

The first bubble in a run from one sender has its top corner on the sender's side squared off and a small triangular tail there (0.5rem wide, 0.625rem tall), pointing left for the customer and right for staff. Later bubbles in the run have no tail.

Borders are 1px. `line` divides regions and rows; the divider between rows starts 4.5rem in, under the text, so avatars are not underlined. `line-strong` outlines the bordered buttons and the instruction field. Sections in the details panel are separated by a 0.5rem band of the panel colour.

Icons are one drawn set: 24px grid, 1.75 stroke, round caps and joins, no fills, coloured by the surrounding text. They render at 1.25rem by default, 1rem inside buttons and advice lines, 0.875rem beside a small link. The brand mark is the only filled drawing.

## Components

### Brand block
The name of the product, at the top of the list column.
- **Mark:** the steering-wheel disc at 2.125rem, 0.625rem to the left of the words.
- **Wordmark:** WHEELMAN in Montserrat 800 capitals at 1.3125rem, Carbarn Blue, line-height 1.
- **By-line:** "by Carbarn" 0.25rem below, 0.6875rem / 600, Faint.
- The block is not a link or a button and has no states. In dark the wordmark takes the lighter blue; the disc keeps its blue.

### Buttons
Rounded, low, quiet until needed. One filled button per view.
- **Shape:** pill (2.25rem tall, 1.125rem radius), label at 0.875rem / 650, optional 1rem icon before the label with a 0.4375rem gap.
- **Primary:** solid Action Blue with Ink on Blue, 1.125rem side padding. This is "Copy reply", and also "Write it now" and "Try again" when there is no draft yet.
- **Primary, blanks remaining:** while the draft still contains a blank, the same button drops to the sheet colour with Navy Ink text and a Strong Line outline and reads "Copy with blanks". It still works; it stops inviting.
- **Quiet:** transparent, Muted text, no outline (Rewrite, Dismiss). Toggled on, it takes Blue Tint with Blue Text.
- **Outline:** transparent with a Strong Line outline and Navy Ink text ("Write it again", "Write a reply anyway"). The three rating buttons shown after copying are the same shape at 1.875rem tall.
- **Icon button:** 2.5rem circle, transparent, Muted icon. The header's "check now" icon spins while a check is running.
- **Name button:** the avatar, name and sub-line in the chat header are one button that opens the details panel. No fill, 0.5rem corners.
- **Hover / Focus:** hover, on fine pointers only, washes the button with 5 to 8% of the text colour and turns the label to Navy Ink; the primary goes to Action Blue Pressed. Pressing scales to 0.97 (0.94 for icon buttons) over 160ms. Keyboard focus is a 2px Action Blue outline, 2px out. Disabled is 55% opacity (50% for icon buttons).

### Dismiss placement
Dismiss is not in the message box. It lives in the last section of the details panel, as an outline button under a one-line explanation. The message box footer holds Rewrite, the two teaching buttons (Good reply, Could be better), the word count, Clear and Copy. Clear only empties the box; it does not dismiss the conversation.

### Row tag
A small label in front of a row's preview text, used for "Dismissed" under No reply needed.
- **Style:** Panel Mist ground, Muted text at 0.75rem / 650, 0.25rem corners, 0.375rem side padding. It sits inline with the preview and never changes the row's height. A dismissed row shows no number badge and is not bold.

### Section switch
Two segments under the brand block: Dashboard and Marketplace. It chooses which inbox the list shows; the two are never mixed.
- **Style:** a Panel Mist track with 0.75rem corners and 0.1875rem padding, holding two equal segments 2.125rem tall with 0.5625rem corners. Labels are Muted at 0.875rem / 500. A badge after each label counts who is waiting there, and is hidden at zero.
- **State:** the selected segment takes the list ground (white in light, the open-row colour in dark), Ink text at 650 and the hairline shadow in light. Exactly one is selected. Hover on the other segment darkens its label. Press scales to 0.97.
- **Behaviour:** switching resets the filter to Waiting, clears the search and closes the open chat. In Marketplace the "Not customers" chip is hidden. The switch itself is hidden when the Marketplace section is turned off.

### Chips
The three filters above the list: Waiting, No reply needed, Not customers.
- **Style:** 2rem pill, Panel Mist ground, Muted text at 0.875rem / 500, no outline. A count follows the label in 650 when it is not zero.
- **State:** the selected chip takes Blue Tint, Blue Text and 650. Exactly one is selected. Hover on an unselected chip uses the open-row colour. Press scales to 0.97.

### Cards / Containers
There are no cards. The containers are message-shaped:
- **Message box:** see below.
- **"Nothing to do" panel:** in place of the message box when no draft applies (already replied, opted out, not written yet, failed). Sheet colour, 0.75rem corners, resting lift, 0.75rem by 0.875rem padding, one sentence at 0.875rem and at most two buttons. The sentence turns Check Red for opted out and failed.
- **Loading:** while a suggestion is being written the message box shows three bars (38%, 92%, 64% wide, 0.6875rem tall) with a slow shimmer between Line and Strong Line.

### Inputs / Fields
- **Search:** 2.25rem pill, Panel Mist fill, no visible border, a 1rem search icon inside the left edge. On focus the fill turns List White and the border turns Action Blue; there is no outline ring.
- **Instruction field** (what to change in a rewrite): 2.5rem pill, sheet fill, Strong Line border, Action Blue border on focus.
- **Draft textarea:** borderless and transparent inside the message box. The box is an editor, so it carries a 1px Strong Line outline at rest and an Action Blue border on focus; empty, it shows "Type your reply here" in Faint. The line above it says whose text it holds ("Suggested reply", "Suggested reply, changed by you", "Your reply") and, at the right, when it was written or saved.
- **Time-window select:** borderless Muted text in the list footer; turns Navy Ink on hover.
- Placeholders use Faint at full opacity. Carets are Action Blue.

### Navigation
The conversation list is the only navigation.
- **Row:** a full-width button. 3rem avatar, then two lines: name and time on top, preview and badge below. Padding 0.625rem top and bottom, 0.75rem left, 1rem right. Name 1rem / 500; time 0.75rem Faint; preview 0.875rem Faint, one line, cut with an ellipsis. "You:" before our own last message is Muted.
- **Unanswered:** the name goes to 650, the time turns Blue Text at 650, and a blue badge with the count sits at the right of the preview line.
- **Flags:** a preview can start with "Check the reply:" in Check Red or "Blank to fill:" in Blank Amber, at 650.
- **States:** hover is `side-hover`; the open row is `side-on` and stays that colour under the pointer. Focus is the blue outline drawn 2px inside the row. Rows have no transition, so moving with the arrow keys is instant.
- **Empty list:** centred, a 1rem / 650 line and a Faint sentence under it.
- **Narrow:** the list fills the window; opening a row swaps to the chat.

### List footer
A quiet strip under the rows, below a 1px line, in Faint at 0.8125rem.
- **Learned line:** "Learned from N replies you used", with ", M of them edited" added when some were changed before use. It is hidden until at least one reply has been learned, sits 0.25rem above the select, and explains itself in a tooltip. Plain text, no colour, no icon.
- **Time-window select:** "Showing the" followed by the select described under Inputs.

### Avatar and badge
- **Avatar:** a circle with white initials (first and last name) at 650. 3rem in the list, 2.5rem in the chat header, 5rem at the top of the details panel. Ground from the eight avatar hues.
- **Badge:** Action Blue pill, 1.25rem tall and at least as wide, Ink on Blue numerals at 0.75rem / 700. Used for unanswered counts in the list, on the jump button and on the narrow-layout back button.

### Message bubbles
- **Incoming:** left, Incoming Bubble ground, Navy Ink text. **Outgoing:** right, Outgoing Bubble ground, Outgoing Text.
- 0.5rem corners, resting lift, padding 0.375rem top, 0.5625rem sides, 0.4375rem bottom, 0.9375rem text at line-height 1.4. Line breaks in the message are kept.
- The first bubble in a run carries the sender line at 0.78125rem / 650: the staff member's name in Blue Text on outgoing bubbles (in dark, a lighter blue written directly in the stylesheet), the channel ("via the website") in Muted on incoming ones.
- The time floats at the bottom right at 0.6875rem: Faint on incoming, the bubble's own text colour at 70% on outgoing.
- A photo or attachment is an italic "Photo" or "Attachment" with the image icon. Links keep the bubble's text colour and are underlined.

### Thread pills
In Marketplace, two more pills can close the thread: the event pill when the auto-reply has handed the chat to a person, had a reply fail, or left an answer unsent for more than 15 minutes; the quiet note pill when an auto-reply is queued and may answer first. Outgoing bubbles there are labelled "Auto-reply" or "Typed by a person". Marketplace rows carry a third line, the car, in Muted at 0.8125rem.
Centred, 0.5rem corners, 0.78125rem text, padding 0.3125rem by 0.75rem.
- **Date:** Pill ground, Muted text, resting lift ("Today", "Yesterday", or the full date).
- **Event:** Event Cream with Event Text, for things the system did.
- **Unanswered marker:** Blue Tint with Blue Text at 650 and no shadow, placed above the first message that has not been answered.
- **Note:** no ground and no shadow, Muted text, for staff notes and "earlier messages not shown".

### Message box
The signature component. Top to bottom:
1. **Label row:** "Suggested reply" at 0.8125rem / 650 followed by "· not sent" in Faint at 500; the time it was written at the right in 0.75rem Faint.
2. **Advice lines** (below).
3. **The sheet:** sheet colour, 0.75rem corners, resting lift, a transparent 1px border that turns Action Blue while anything inside has focus. It holds the draft and a foot row: Rewrite and Dismiss on the left, the word count (with "about N texts" once the draft passes 160 characters), then the primary button at the far right.
4. **Rewrite row** (when Rewrite is on): the instruction field and an outline button.
5. **After copying:** a blue "Copied" with a check icon, the question "How was the suggestion?", and three small rating buttons.

The draft is a textarea that grows with its text from 4.5rem up to 38% of the window height, then scrolls. Behind it is an exact copy of the text in transparent ink, used only to paint highlights: a blank such as `[PRICE?]` gets Blank Amber's soft ground with a thin amber ring; a figure or link that failed a check gets Check Red's soft ground with a 1px red underline. The highlights follow the text as the user types and disappear when the marked text is removed. A new suggestion fades in over 220ms from a 2px blur. Ctrl + Enter in the draft copies it.

### Advice lines
One sentence each, directly above the sheet, in this order:
- **Failed check:** Check Red on its soft ground, alert icon, 0.5rem corners.
- **Blanks:** Blank Amber on its soft ground, pencil icon: "Replace the highlighted part before sending:" followed by one small button per blank, named in words ("the price", "the date"). Pressing a button selects that blank in the draft, so typing replaces it. The buttons are sheet-coloured with a 0.375rem radius and a border at 40% of the amber text. A reason, when there is one, wraps onto its own line.
- **Needs input:** Note Navy on its soft ground, info icon.
- **Caution:** plain Faint text, no ground.
- **All clear:** plain Blue Text with a check icon, shown only when the draft had figures or links and none failed. If the user has edited the draft it is replaced by a Faint line saying the typed text has not been checked.

### Notices
Setup and service problems, at the top of the list column, edge to edge with no radius. A 1.25rem icon column, then a 650 title and a sentence or short list at 0.8125rem. Blank Amber pair by default (suggestions paused), Check Red pair for errors, Note Navy pair for information. The navy notice folds its detail behind an underlined "Show" / "Hide".

### Status line
One line under the brand block: a 0.5rem dot and a sentence in Faint at 0.8125rem. The dot is blue after a successful check, red after a failed one, amber and slowly pulsing while checking or writing, and the Faint colour when unknown. The sentence always states the same thing in words.

### Car strip
One line under the chat header on List White: the car's title in Navy Ink at 650, then price, odometer and availability at 0.8125rem Muted, and "Open listing" with a small external-link icon pushed to the right. Availability is a 0.4375rem dot plus words, both in Blue Text (available), Check Red (sold) or Blank Amber (anything else). Hidden when no car is matched.

### Details panel
Opened from the chat header. A header band matching the chat header, then a centred 5rem avatar, name and phone, then sections separated by 0.5rem Panel Mist bands. Each section has a small blue heading (0.8125rem / 650) and a two-column list: Faint labels in a 7rem column, values beside them, at 0.875rem. Facts are short lists with small round Strong Line bullets. In the wide layout it is a third column with a 1px line; at 1180px and under it slides in from the right over 240ms.

### Toast
A navy pill with near-white text in the light theme and a pale pill with navy text in the dark theme (both colour pairs are written directly in the stylesheet), 0.875rem text, floating shadow, at most 28rem wide. It is placed by script, centred over the chat column just under the car strip so it never covers the message box, fades and drops in 0.75rem over 180ms, and leaves after 2.6 seconds.

Toast with an action: after Dismiss the toast carries one underlined "Undo" button at weight 800, stays for nine seconds instead of under three, and accepts clicks while it is showing. A plain toast never takes clicks.

### Empty chat
When no conversation is open: centred on Panel Mist, the brand mark at 4.5rem, the headline, three numbered steps (1.75rem circles on List White) and a Faint line saying nothing is ever sent from the page.

### Motion
- **Press:** 160ms scale to between 0.94 and 0.97 with `cubic-bezier(.23, 1, .32, 1)`. Colour and border changes take 160ms with the default ease.
- **Appearing:** the jump button and toast take 180ms, the arriving draft 220ms, with the same strong ease-out. The details drawer slides in over 240ms with `cubic-bezier(.32, .72, 0, 1)`.
- **Waiting:** the busy dot pulses over 1.4s, the "check now" icon spins at 0.7s a turn, the loading bars shimmer over 1.2s.
- **Reduced motion:** every animation and transition is cut to 1ms and loops run once; the busy dot holds at 70% opacity.

## Do's and Don'ts

### Do:
- **Do** take every colour from the custom properties at the top of the stylesheet, and give any new colour a light value and a dark value in the same two blocks.
- **Do** keep solid blue for the primary button, the unanswered badge, the wordmark and mark, the "checked" dot and the focus ring, and use Blue Tint with Blue Text for anything that is switched on.
- **Do** show the name as it is built: the white steering wheel on a Carbarn Blue disc, WHEELMAN in Montserrat 800 capitals, and "by Carbarn" under it.
- **Do** put a plain sentence in every red, amber or navy block, and use the strong value as text on its own soft ground.
- **Do** keep the suggested reply in the message box under the label "Suggested reply · not sent", with a copy action as the one filled button.
- **Do** mark blanks in amber and failed figures in red inside the draft text itself, and name each blank on a button that selects it.
- **Do** use the two shadows as they are used now: resting lift for bubbles, pills and the message box; floating for the jump button, the toast and the details drawer.
- **Do** give pressable controls the 160ms press scale (0.94 to 0.97) and keep hover styles inside the fine-pointer media query.
- **Do** build content from text nodes and draw new icons on the same 24px grid with a 1.75 stroke and round ends.
- **Do** keep text at 4.5:1 or better against its ground in both themes. Every text pair checked from the stylesheet values meets this; the closest are the white label on the primary button in light (about 4.5:1) and, in dark, the primary button under the pointer and the outgoing timestamp (both about 4.9:1).

### Don't:
- **Don't** show the suggestion as a bubble in the thread. The thread is only what was really said.
- **Don't** add anything that looks like sending: no send icon and no "Send" label. The button at the bottom right of the message box always says what it does, which is copy.
- **Don't** add a second accent colour, and don't use solid red, amber or navy as a fill larger than a status dot.
- **Don't** signal status with colour alone or with a code. Write the sentence.
- **Don't** add uppercase or letter-spaced labels. The wordmark is the only capitals, and Montserrat and weight 800 belong to it alone.
- **Don't** add a third typeface or load a font from outside; Manrope and Montserrat are served from `web/fonts`. Don't add a raster image or a library either. The page loads nothing from outside, and its content security policy forbids inline styles and scripts.
- **Don't** add a third shadow, or put a shadow on a column, header, row, chip or button.
- **Don't** animate the conversation list when it is moved through with the keyboard. Rows change instantly.
- **Don't** insert customer text as HTML, and don't use real customer names, numbers or messages in examples of this system; use invented ones.
