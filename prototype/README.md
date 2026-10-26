# Wheelman prototype

A clickable prototype of the redesigned Wheelman, made on 24 Oct 2026 from the redesign's product
requirements. It is the design the new page is built from, stage by stage, inside this repository.
It is removed once the new page has replaced the old one.

- Double-click **Open prototype.cmd**, or open `index.html` in Chrome or Edge.
- Everything is invented: the dealership, the customers, the cars, the prices.
- Nothing connects to the dealer dashboard, Facebook, the auction site, Gmail or any AI.
  The AI is simulated with pre-written text; the bar at the bottom says "Demo".
- **Demo controls** (bottom right) has the six tasks to try, scenarios (busy, quiet,
  everything broken, empty), faults to inject, writing speed, the one-list layout and the theme.

The prototype is separate from the app: Wheelman never loads it, and it reads nothing from `data/`.
It uses Preact and htm from `vendor/` as plain scripts, so it needs no server and no build step.
