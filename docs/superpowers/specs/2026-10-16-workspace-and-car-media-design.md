# Workspace redesign and car media

Date: 16 October 2026. Owner's request of 15 October 2026, decided with him on 16 October 2026.

## 1. What the owner asked for

1. "I don't want the Standard section. It was decided so there's no purpose of showing in the
   dashboard."
2. "I want to improve the UI/UX experience … It could be complete redesign if you want."
3. "I should be able to access the vehicle photos and videos (those are already in the website),
   export certificate and auction report … for individual stocks."

He gave full authority over the design and the skills used. His three choices:

| Question | His answer |
|---|---|
| Layout | **Chat + car panel**: sections as one row of tabs in the top bar; the right panel shows the car (main photo, photos, videos, documents) with a Customer tab beside it; the car is in view while replying. |
| Where the car's files can be reached | **Both**: the car in the open conversation, and a **Find a car** box in the top bar for any car by stock number or name. |
| Links in replies | **Yes, when asked**: when a customer asks for photos, a video, the auction sheet or the export certificate, the suggestion carries that link. |

This reverses his 2 October 2026 "No leave that document thing": documents are now wanted.

Kept as they are (product rules and brand commitments in PRODUCT.md): Carbarn blue and navy,
Manrope, the WhatsApp shape (one conversation at a time, the suggestion as an unsent draft in the
message box, never a bubble), nothing sent except the Marketplace Send, read-only everywhere,
Dismiss always undoable, plain words over codes.

## 2. Where the car's files come from

Both addresses are on the dashboard API host, answer a GET **without a login**, and are keyed by
the chassis number, which the vehicle list Wheelman already reads carries for every car
(`chassisNo`).

**`GET /carbarnau/api/v2/vehicles/media/{chassisNo}`**: the website's media for the car, an array
of `{ mediaType: IMAGE | VIDEO, imageRole, displayOrder, url, thumbnailUrl, voiceOverVideoUrl,
label, altText, title }`.

- Images carry a role: `front_exterior`, `side_exterior`, `rear_exterior`, `interior_front`,
  `dashboard`, `odometer`, `climate_control`, `gear_shifter`, `door_controls`, `rear_seats`,
  `boot_space`.
- Videos carry a label (Walkaround 360, Inside Front, Inside Rear, Engine Bay & Tyres), the plain
  file, the voice-over file and a poster.
- Videos exist only for cars filmed in Sydney. Older cars return `[]`.

**`GET /carbarnau/api/v1/vehicles/chassis/{chassisNo}`**: the dashboard's full record of the car.
From it Wheelman keeps **only**:

- `auctionPhotos[]`, plus `exteriorPhoto[]` and `interiorPhoto[]`, which are the photos of older
  cars that have no website media;
- `operation.documents[]`, filtered to this allowlist:

| documentType | Shown as | Kind |
|---|---|---|
| `AUCTION_SHEET` | Auction sheet | image |
| `EXPORT_CERTIFICATE` | Export certificate | PDF |
| `VIA_APPROVAL` | Import approval (VIA) | PDF |
| `SYDNEY_VEHICLE_PHOTOS_LINK` | Sydney photos album | Google Photos album |
| `RAW_FOOTAGE_LINK` | Raw footage album | Google Photos album |
| `COMPLIANCE_PHOTOS_LINK` | Compliance photos album | Google Photos album |

**Never kept, never shown, never sent anywhere:**

- `INSPECTION_SHEET`: its address carries the supplier's API key.
- `PROFORMA_INVOICE`: our purchase cost.
- `SIGNED_FORM_5`: a customer's signed form.
- The record's costs (`fob`, `shippingPrice`, `paymentSummary`, `grossCost`), the supplier, the
  VIN and engine number, and the buyer (`salesInfo`).

The reduction happens in one function, the moment the record is read. Nothing else from it is
held in memory, written to disk or logged.

Sample of twelve cars (15 October 2026):

- Auction photos are on almost every car.
- Website photos are on recent cars; older cars use the older photo lists.
- Videos are only on cars filmed at the yard.
- The auction sheet is on almost every car. The export certificate is on about half.
- `SIGNED_FORM_5` does occur, which is why the allowlist is needed.

## 3. Design

### 3.1 Remove Standards (PR 1)

The Standards section is removed completely, along with the model-replies machinery behind it.
None of the 37 scenarios was ever approved (`voice/model-replies.json` is `{}`), so the
`=== MODEL REPLIES ===` block in the prompt has always been empty and no reply changes.

What goes:

- the registry entry and its copy keys;
- the `tr:` key and its routes (`/api/standards*`);
- the scenario branches in the rating and advice routes;
- `ensureScenarioDraft` and the `standards` branch in `sectionRows`;
- `src/modelreplies.js`, `voice/model-replies.md` and `voice/model-replies.json`;
- the prompt block, `test/standards.test.js`, and the config paths;
- the README, PRODUCT.md and DESIGN.md lines about it.

Git history keeps the files.

### 3.2 Car media on the server (PR 2)

**Reading.** A new module, `src/vehiclemedia.js`. Its `vehicleMedia(stockNo, { fresh })` finds
the car in the local vehicles table, reads both addresses through the dashboard client, and
returns the safe projection:

```
{ stockNo, title, readAt,
  photos:    [{ id, group: 'website' | 'auction', role, label, link }],
  videos:    [{ id, label, link, plainLink, poster, playable }],
  documents: [{ type, label, kind: 'pdf' | 'image' | 'album', link }] }
```

- `link` is the public address, for Open, Copy link and Add to reply.
- `id` indexes the server's own copy of the list. The page loads every picture through Wheelman by
  this id; nothing the page sends is used as an address.

**Allowlist.** The dashboard client's read allowlist gains exactly two patterns:
`^/carbarnau/api/v1/vehicles/chassis/[A-Za-z0-9-]{3,40}$` and
`^/carbarnau/api/v2/vehicles/media/[A-Za-z0-9-]{3,40}$`.

**Chassis.** `chassisNo` joins the stored vehicle fields (`SAFE_FIELDS`). `vehicleFacts` lists
its fields one by one, so the chassis never reaches the AI. It is also never sent to the page.

**Caching.** One answer per car is kept in memory for 30 minutes. The car panel's Refresh asks
again with `fresh=1`. When an address fails, the last good answer is kept and the page says it
could not be read again.

**Pictures through Wheelman.** Pictures are fetched once and kept in `data/media/vehicles/`,
named by a hash of their address. They are served from there with
`cache-control: private, max-age=86400`.

- The fetch reuses the photo-from-a-text code, generalised: image types only, at most 15 MB,
  30-second timeout.
- Hosts allowed: `www.storage.importautos.com.au`, `fastlycb.s3.ap-southeast-2.amazonaws.com`,
  `s3-ap-southeast-2.amazonaws.com`, `www.nichibojapan.com` and `nichibojapan.com`.
- Plain `http` is accepted only for the two nichibojapan hosts, which serve auction photos that
  way.

**Videos.** Videos play straight from Carbarn's own public storage. The page's content security
policy gains `media-src 'self' https://fastlycb.s3.ap-southeast-2.amazonaws.com` and nothing
else. A video on any other host is offered as Open only.

**Documents and albums.** These are links that open in a new tab. Navigation is not governed by
the policy.

**New routes** (read-only, available through the team link too):

| Route | Purpose |
|---|---|
| `GET /api/vehicles?q=` | Find a car: up to 12 cars matching a stock number (exact first, then prefix) or title words, available ones first, then newest. Each gives `{ stockNo, title, price, odometer, availability }`. |
| `GET /api/vehicles/:stock` | The car for the panel: the same shape as `present().vehicle`. |
| `GET /api/vehicles/:stock/media[?fresh=1]` | The safe projection. |
| `GET /api/vehicles/:stock/picture/:id` | One picture, through the cache. |

### 3.3 The page (PR 3): Chat + car panel

The visual world stays Carbarn's: blue `#0073EA`, navy text, pale blue surfaces, Manrope, and
light or dark following the computer. What changes is the structure, the hierarchy and the new
car surfaces.

**Top bar**, one row, 56px:

- Left: the brand (mark, WHEELMAN, by Carbarn).
- Then the **section tabs**: Dashboard · Marketplace · Auction · Import Query. Underlined when
  chosen, with the unread number beside each. Tabs for switched-off sections are hidden.
- On the right:
  - **Find a car**: a search field.
  - **The status**: a dot and two or three words, such as "Up to date", "Checking the dashboard"
    or "Dashboard not reached". Pressing it opens the **status panel**, which holds everything
    the long status line and the welcome page used to say: last check, AI requests and budget,
    lead alerts, phone add-on, models, what Wheelman has read and learned, the last backup, the
    team link, and which AI writes, with Change.
  - The cog.
  - Check now.

At smaller widths: below 1280px the status keeps only its dot; below 1100px Find a car becomes an
icon that opens the field; at 860px and below the tabs move to a scrolling row under the bar.

**List column.** The 2×2 section switch is gone, which gives the list about 90px more height.
The rest is unchanged: notices, search, All / Waiting chips (To do / In progress / Finished in
Auction), and the rows.

**Conversation.**

- Header: the person, what they are asking about, Copy phone, and a **Car** toggle for the panel.
- The **car strip** becomes a richer line:
  - a 56×42 thumbnail of the car's first photo;
  - the title;
  - price and km;
  - the availability, in words with a dot;
  - **Photos & videos** (with the count), which opens the panel on the Car tab;
  - Open listing.
- The thread and the message box are unchanged in behaviour.

**Right panel**, 26rem.

- On windows 1280px and wider it is **open by default** whenever the conversation has a car, and
  it remembers if it was closed. Narrower, it is the drawer it is today.
- Two tabs: **Car** and **Customer**. For Import Query and auction orders, which have no stock
  car, only the Customer tab shows; it is labelled **Order** for auction orders.

*Car tab*, top to bottom:

1. The main photo, wide; pressing it opens the viewer.
2. Title, price, km and availability, with Open listing.
3. **Photos**:
   - website photos as a 3-column grid; the first 9 show, then a "+N more" tile;
   - **Auction photos** below, collapsed to 6.
4. **Videos**: one row each, with the poster, the label, and Play, Copy link and Add to reply.
5. **Documents**: one row each (Auction sheet, Export certificate, Import approval (VIA), the
   albums), with Open, Copy link and Add to reply.
6. **About this car**: stock number, fuel, transmission, seats, colour, and Included with this
   car.

The Car tab's other states:

- **Loading:** grey shapes where the media will appear.
- **Nothing found:** says so plainly, for example "No website photos yet: this car has not been
  photographed in Sydney".
- **Could not be read:** says so, with Try again.
- **Read time:** a Refresh link sits at the foot, with when the media was read.

*Customer tab*: everything the details panel shows today, without the big repeated avatar and
name: contact, the Marketplace, email and order parts, what the suggestion relies on, the import
ruling, and Dismiss.

**Viewer.** A full-window dialog over the page.

- Group tabs: Website photos, Auction photos, Videos, Documents.
- The picture or video large in the middle, with a caption ("Front", "Odometer", "3 of 23").
- A filmstrip underneath.
- Buttons: Copy link, Add to reply, Open original, and Close.
- Keys: ← and → move; Home and End jump; Escape closes.
- Videos play with controls. A switch chooses With voice-over (the default, as on the website)
  or Without.

**Add to reply** puts the link on its own line, with a label, where the cursor was in the open
suggestion, for example "Walkaround video: https://…". If there is no cursor it goes at the end,
before the sign-off. It works like typing: Ctrl+Z undoes it, it is saved as an edit, and
Wheelman learns from it as from any change. With no suggestion open, the button says why it is
waiting.

**Find a car.**

- Typing shows up to 12 matches under the field, read from the stored stock list (available cars
  first). Arrow keys and Enter pick one, Escape closes.
- Picking a car opens it in the right panel's Car tab under a line "Another car: 2019 Toyota
  Hiace · stock 1044 · Back to Tom Bell's car". Add to reply works there too, so a link to
  another car can go to the customer on screen.
- With no conversation open, the car opens in the panel beside the welcome.

**Welcome**, nothing open: the headline and the three steps only. The status lines move to the
status panel.

**Motion.** Press feedback stays at 120–160ms. The panel and viewer open with 220–260ms
ease-out; photos fade in when loaded. Nothing animates under reduced motion.

**Accessibility.**

- Tabs follow the tablist pattern.
- The viewer is a modal dialog with its label; focus returns to what opened it.
- Thumbnails are buttons with the photo's label.
- Every icon button has a name.

### 3.4 Links in replies (PR 4)

When the customer's waiting messages ask for photos, a video, the auction sheet or the export
certificate, and the matched car has that media, code adds a block under the AI's lines. It sits
with the price reply and the invitation (`extras` in `assessReply`), in this order:

```
Walkaround video: <voice-over link>
Auction sheet: <link>
Export certificate: <link>
Photos: <the car's page on the website>
```

Rules:

- **Videos.** The Walkaround 360 comes first; the other videos are added only when the customer
  asks for a video of the inside or the engine.
- **Photos.** These link to the car's listing, where every photo is. A car not yet listed has no
  photos line.
- **Never added:** albums, VIA, and anything not in the allowlist.
- **What the AI is told.** A line in the request says the block is added by code, so the AI
  answers in its own words and does not write those links itself, does not say "below", and does
  not say anything "has been sent".
- **Checks.** The links are added to the records the checks trust.
- **Failure.** If the media cannot be read in time (5 seconds), no block is added and the
  existing rule applies: say we will check and send it, with [CHECK?].
- **Marketplace.** It gets the same block, with `utm_source=facebook` on the website link only.

## 4. Order of work

Each PR is a branch with all tests green. It is shown to the owner on a demo copy with invented
data before he merges.

1. `remove-standards`: §3.1
2. `car-media`: §3.2, with tests on the stand-ins
3. `workspace`: §3.3, with impeccable's finish review and DESIGN.md updated
4. `media-links`: §3.4, with replay cases

## 5. Testing

- **Server.**
  - The projection drops every disallowed document type and every cost and buyer field. It is
    tested on an invented record that carries them all.
  - The allowlist refuses other paths.
  - The picture route refuses unknown ids and non-images.
  - The cache is used.
  - Find a car orders its results.
  - The stand-ins serve the two new addresses.
- **Page modules.** Copy keys, the registry without Standards, and the add-to-reply insertion
  (pure function).
- **CSS.** The budget check stays at zero hand-typed values: every new size is a token.
- **In the browser.** A demo run on invented data, never the live page:
  - desktop at 1440 and 1280, and narrow at 390, in light and dark;
  - screenshots of the conversation with the panel, the viewer, Find a car and the status panel.
