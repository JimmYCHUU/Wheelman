# The demo

`npm run demo` (or a double-click on `Start Wheelman demo.cmd`) runs Wheelman on an invented world:
made-up customers, cars, Marketplace chats, auction orders and phone texts, with the suggested
replies already written. Nothing in it is real, and nothing it does can reach the internet: the
dashboard, the Marketplace engine, the live-auction feed and the AI are all stand-ins on this
computer (`test/support/standins.js`, the same ones the tests use).

- It opens on port 3211, beside the real app on 3210, and needs no `.env` file.
- Its database, log and example bank live under `data/demo/`, which is wiped on every start.
- The page shows a DEMO ribbon, so a screenshot of real data can never be mistaken for one of these.
- Check now, Rewrite, Could be better and the Auction section's live-auction lookups all work,
  against the stand-ins.
- `node demo/start.js --check` starts it, reads the page's data once and exits: that is what CI runs.

Every screenshot of Wheelman that is published is taken from this demo, never from the real
thing, so no customer can appear in one.
