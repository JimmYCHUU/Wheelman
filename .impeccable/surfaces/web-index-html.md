---
version: 2
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: ["web/css/tokens.css","web/css/components.css","web/css/views.css","web/app.js","web/views/TopBar.js","web/views/CarPanel.js","web/views/Viewer.js","web/views/FindCar.js"]
---

# Surface brief: Wheelman main page

Scope: the single page at `/` (web/index.html, the five stylesheets in web/css, web/app.js and web/views).
Visitor mode: Operate.

## Audience and job

One user, the owner, answering 30 to 50 customer enquiries a day for a car dealership (dashboard texts, Facebook Marketplace, auction orders, import emails). He keeps this page beside the dealership's dashboard. Job: see who is waiting, read what they wrote, check the suggested reply, fix any blank, add the car's photo, video or document link when asked, copy it, send it from the dashboard.

## What earlier layouts got wrong (owner's own words)

- 29 Sep 2026: too much at once; could not tell the customer's words, our replies and the suggestion apart; coloured notes and blanks unclear; small labels and tabs hard to follow.
- 15 Oct 2026: wanted a better experience and the car's photos, videos, export certificate and auction sheet at hand; the Standards section had no purpose.

## Constraints

- The page never sends, except the Marketplace Send. The primary action copies.
- Customer text is inserted as text, never HTML. No inline styles or scripts (strict content security policy); pictures only through Wheelman; videos only from Carbarn's own storage. No external libraries.
- Every existing function stays: copy, rewrite, prompt, good reply, could be better, dismiss with undo, rulings, check now, the AI panel.
- Brand: Carbarn blue #0073EA, navy text, pale blue surfaces, Manrope; light or dark follows the computer.

## Direction contract

THESIS: The conversation and the car side by side. One conversation at a time in the messaging shape, with the car the customer is asking about always in view beside it, its photos, videos and documents one press from the reply. It refuses the old details sidebar of label-value rows and the section switch that ate the list.

OWN-WORLD: Carbarn's own: white bars, pale blue thread, navy ink, one brand blue for the chosen section's underline, selection, badges and the primary action. Photos carry the colour; the interface stays quiet around them. Photos and videos open in a near-black viewer in both themes, as in any photo app.

STORY: the owner sees the sections and their counts across the top, who is waiting in the list, the conversation in the middle with the car's thumbnail on its strip, and the car itself on the right. A customer asks for a video: he presses Add to reply on the walkaround and the link lands in the suggestion, labelled, on its own line.

FIRST VIEWPORT: At 1440 by 900. Top bar 56px: brand, four section tabs with counts, Find a car, a status pill, cog, refresh. List 352px. Conversation: header, car strip with a 64 by 48 photo, thread, message box with Copy reply bottom right. Panel 416px: Car | Customer tabs, the car's main photo 16:10, name, price, km, availability, then a 3-column photo grid.

SIGNATURE INTERACTION: Add to reply from the panel or the viewer types the labelled link where the cursor was, or before the sign-off; Ctrl + Z takes it out. Motion: 120 to 160ms press feedback, 220ms ease-out for photos arriving and the viewer, the tab underline scaling in; nothing animates under reduced motion.

FORM: Chat + car panel, chosen by the owner by name in a structured question on 16 Oct 2026 (over "Chat first, car on request" and "One customer at a time"). No roll: the owner pinned the structure.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- None blocking. The page ships no raster images of its own; car photos come from the dashboard at run time.
