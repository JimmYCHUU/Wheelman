/* Wheelman prototype — the simulated engine.
   Understand and Plan are code; "Compose" is pre-written demo text standing in for the AI;
   every fact, link and block is put in by code; Verify checks figures against the records. */
(function () {
  var WN = (window.WN = window.WN || {});

  /* ---------- formatting ---------- */
  function money(n) { return "$" + Math.round(n).toLocaleString("en-AU"); }
  function aud(n) { return "A$" + Math.round(n).toLocaleString("en-AU"); }
  function yen(n) { return "¥" + Math.round(n).toLocaleString("en-AU"); }
  function km(n) { return Math.round(n).toLocaleString("en-AU") + " km"; }
  function first(name) { return (name || "").split(" ")[0]; }
  function greetWord(date) {
    var h = date.getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }

  /* ---------- segments ---------- */
  function F(t, src) { return { f: t, src: src }; }
  function B(label) { return { b: label, v: "" }; }
  function ai(segs) { return { kind: "ai", segs: segs }; }
  function code(text) { return { kind: "code", segs: [text] }; }
  function block(label, why, segs) { return { kind: "block", label: label, why: why, segs: segs }; }

  function fillTemplate(ctx, id, vars) {
    var t = ctx.templates.find(function (x) { return x.id === id; });
    var text = t ? t.text : "";
    return text.replace(/\{\{([A-Z_]+)\}\}/g, function (all, k) { return vars[k] != null ? vars[k] : all; });
  }
  function factById(ctx, id) { return ctx.facts.find(function (f) { return f.id === id; }); }
  function lessonOn(ctx, apply) {
    return ctx.lessons.find(function (l) { return l.apply === apply && l.status === "on"; });
  }

  function carLink(ctx, v) { return ctx.dealer.site + "/cars/" + v.stock; }
  function bookingLink(ctx, v, mode) { return carLink(ctx, v) + "#inspection=" + (mode || "onsite"); }

  /* ---------- code-built blocks (his wording, from Playbook templates) ---------- */
  function priceBlock(ctx, v) {
    var text = fillTemplate(ctx, "price-reply", { INCLUDED: v.included.join(", ").replace(/, ([^,]*)$/, " and $1") });
    return block("Price reply", "Your wording, added because they asked about price (your rule, 12 Oct 2026)", [text]);
  }
  function inviteBlock(ctx, v, mode) {
    var text = fillTemplate(ctx, "invite", { BOOKING_LINK: bookingLink(ctx, v, mode) });
    if (mode === "online") text = text.replace("book an inspection here", "book an online video inspection here");
    return block(mode === "online" ? "Online inspection invitation" : "Inspection invitation",
      mode === "online" ? "Added because they live far away (your rule, 1 Oct 2026)" : "Added because they want to see the car (your rule, 1 Oct 2026)", [text]);
  }
  function firstBlock(ctx, v) {
    var d = ctx.dealer;
    var text = fillTemplate(ctx, "first-reply", { CAR_LINK: v ? carLink(ctx, v) : d.site + "/cars", ADDRESS: d.address, HOURS: d.hours, PHONE: d.phone, SENDER: d.team });
    if (!v) text = text.replace(/^Vehicle details: .*\n/, "");
    return block("First reply block", "Added to a brand-new enquiry, in place of the sign-off (your choice, 2 Oct 2026)", [text]);
  }
  function signoff(ctx) { return code("Regards,\n" + ctx.dealer.team); }
  function greet(ctx, word) { return code((word || greetWord(ctx.now)) + " " + first(ctx.customer.name) + ","); }

  /* ---------- facts shown in the trust line ---------- */
  function vfacts(v, keys) {
    var out = [];
    keys.forEach(function (k) {
      if (k === "price") out.push({ label: "Price", value: money(v.price), src: "Stock record " + v.stock });
      if (k === "km") out.push({ label: "Kilometres", value: km(v.km), src: "Stock record " + v.stock });
      if (k === "included") out.push({ label: "What is included", value: v.included.join(", "), src: "The car's Included list" });
      if (k === "link") out.push({ label: "Booking link", value: "harbourauto.example/cars/" + v.stock, src: "Website, car page" });
      if (k === "status") out.push({ label: "Availability", value: v.status, src: "Stock record " + v.stock });
      if (k === "grade") out.push({ label: "Auction grade", value: v.grade, src: "Auction sheet" });
    });
    return out;
  }
  function bfact(ctx, id) {
    var f = factById(ctx, id);
    return { label: f.topic, value: f.answer || f.question, src: "Business fact, " + (f.state === "confirmed" ? "confirmed " + f.date : f.state === "working" ? "working, not yet confirmed" : "needs your answer"), state: f.state };
  }

  /* ---------- auction: bid rule and landed cost ---------- */
  function suggestedBid(lot) {
    var same = lot.sold.filter(function (s) { return s.grade === lot.grade; });
    var pool = (same.length >= 3 ? same : lot.sold.slice()).slice().sort(function (a, b) {
      return Math.abs(a.km - lot.km) - Math.abs(b.km - lot.km);
    }).slice(0, 3);
    var avg = pool.reduce(function (s, x) { return s + x.price; }, 0) / pool.length;
    var up = function (n) { return Math.ceil(n / 50000) * 50000; };
    var fromSold = up(avg);
    var fromSite = up(lot.siteBid);
    return { pool: pool, avg: avg, fromSold: fromSold, siteBid: lot.siteBid, bid: Math.max(fromSold, fromSite), usedSite: fromSite > fromSold };
  }
  function landed(jpy) {
    var c = WN.data.auction.costs, rate = WN.data.auction.rate;
    var car = jpy / rate;
    var duty = (car + c.shipping) * c.dutyRate;
    var gst = (car + c.shipping + duty + c.compliance) * c.gstRate;
    var lines = [
      ["Car at auction (" + yen(jpy) + ", at ¥" + rate + " to the dollar)", car],
      ["Shipping to Sydney", c.shipping],
      ["Import duty (5%)", duty],
      ["Compliance", c.compliance],
      ["GST (10%)", gst],
      ["Registration and CTP", c.rego],
      ["Our fee", c.fee]
    ];
    var total = lines.reduce(function (s, l) { return s + l[1]; }, 0);
    return { lines: lines, total: total };
  }
  function depositFor(jpy) {
    var tiers = WN.data.auction.depositTiers;
    for (var i = 0; i < tiers.length; i++) if (jpy <= tiers[i][0]) return tiers[i][1];
    return Math.round(jpy * 0.15);
  }
  function landedText(l) {
    return l.lines.map(function (x) { return x[0] + ": " + aud(x[1]); }).join("\n") + "\nEstimated landed total: " + aud(l.total);
  }
  function landedMoney(l) {
    return l.lines.map(function (x) { return aud(x[1]); }).concat([aud(l.total)]);
  }

  /* ---------- reply types ---------- */
  var LABELS = {
    "price-trade-inspect": "Price, trade-in and inspection",
    "price-only": "Price reply only",
    "trade-in-only": "Trade-in and inspection",
    "available-km": "Available, kilometres and inspection",
    "invite-only": "Invite to inspect",
    "invite-yard": "Invite to the yard",
    "online-inspection": "Offer an online video inspection",
    "walkaround-video": "Send the walkaround video",
    "history-warranty": "History and warranty",
    "delivery-hold": "Delivery and the deposit",
    "available-fit": "Available and invite",
    "available-invite": "Available and invite",
    "stock-none": "Not in stock",
    "ask-details": "Ask what they want",
    "import-offer-text": "Import answer with a live lot",
    "import-ask": "Ask the import questions",
    "buyer-rego": "Rego papers",
    "fu-inspection": "How did the inspection go",
    "fu-price-drop": "The price has dropped",
    "fu-reminder": "Reminder for tomorrow",
    "mp-offer": "Price, then their number",
    "mp-number": "Ask for their number",
    "mp-km": "Kilometres, then their number",
    "mp-close": "Polite close",
    "import-email": "Import answer",
    "order-lot-offer": "Lot offer: Lot 3021",
    "order-lot-offer-2": "Lot offer: Lot 1187",
    "order-deposit": "Deposit received",
    "order-shipping": "Shipping update"
  };

  var R = {
    once: { text: "Greeting and sign-off only on the first reply of the day", date: "your rule, 1 Oct 2026" },
    noGreet: { text: "No greeting or sign-off: you already wrote to them today", date: "your rule, 1 Oct 2026" },
    price: { text: "Price question answered with your price reply, never a lower figure", date: "your rule, 12 Oct 2026" },
    invite: { text: "Booking link because they want to see the car", date: "your rule, 1 Oct 2026" },
    far: { text: "Online video link because they live far away", date: "your rule, 1 Oct 2026" },
    first: { text: "First reply block on a brand-new enquiry", date: "your choice, 2 Oct 2026" },
    deposit: { text: "Deposit offered because they asked to hold it", date: "your rule, 21 Oct 2026" },
    buyer: { text: "Answered as a buyer: the sale is recorded", date: "your rule, 2 Oct 2026" },
    blank: { text: "A blank where you must decide, never a guess", date: "your rule, 29 Sep 2026" },
    mpShape: { text: "Marketplace: answer first, then their number; no greeting or sign-off", date: "your rule, 20 Oct 2026" },
    mpClose: { text: "A buyer leaving over the price gets a polite close, no blank, link or deposit", date: "your rule, 16 Oct 2026" },
    exact: { text: "Import replies give the exact answer, or a blank plus research notes", date: "your rule, 9 Oct 2026" },
    bid: { text: "Bid: average of the 3 closest sold cars, rounded up to the next ¥50,000, never below the site's bid", date: "your rule, 5 Oct 2026" },
    depLink: { text: "The deposit link is always a blank you paste", date: "your rule, 5 Oct 2026" },
    fuAsk: { text: "After an inspection, ask how it went, never whether they came", date: "your rule, 20 Oct 2026" },
    code: { text: "Written by code from your wording, no AI request", date: "your rule, 20 Oct 2026" }
  };

  function hiaceLot() { return WN.data.auction.lots[0]; }

  var INTENTS = {
    "price-trade-inspect": function (ctx, v) {
      return {
        parts: [greet(ctx),
          ai(["Thank you for your enquiry about the ", F(v.name, "Stock record " + v.stock), ". We would be glad to look at your 2014 Mazda 3 as a trade-in. As a guide, similar cars trade at around ", B("TRADE-IN VALUE"), ", and we confirm the figure once we have seen it. Saturday suits: we are open ", F("9 am to 4 pm", "Business fact: Opening hours"), "."]),
          priceBlock(ctx, v), inviteBlock(ctx, v), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "included", "link"]).concat([bfact(ctx, "f-hours"), bfact(ctx, "f-trade")]),
        rules: [R.price, R.invite, R.blank, R.first]
      };
    },
    "price-only": function (ctx, v) {
      return { parts: [greet(ctx), ai(["Thank you for your enquiry about the ", F(v.name, "Stock record " + v.stock), "."]), priceBlock(ctx, v), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "included"]), rules: [R.price, R.first] };
    },
    "trade-in-only": function (ctx, v) {
      return { parts: [greet(ctx), ai(["Thank you for your enquiry. We would be glad to appraise your 2014 Mazda 3 when you come in on Saturday; as a guide, similar cars trade at around ", B("TRADE-IN VALUE"), "."]), inviteBlock(ctx, v), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "link"]).concat([bfact(ctx, "f-trade")]), rules: [R.invite, R.blank, R.first] };
    },
    "available-km": function (ctx, v, t) {
      var kmText = t.wrongKm ? "38,900 km" : null;
      var segs = ["Thank you for your enquiry. Yes, the ", F(v.name, "Stock record " + v.stock), " is available. It has done "];
      segs.push(kmText ? kmText : F(km(v.km), "Stock record " + v.stock));
      segs.push(" and comes with ", F(v.included.join(", ").replace(/, ([^,]*)$/, " and $1"), "The car's Included list"), ".");
      return { parts: [greet(ctx), ai(segs), inviteBlock(ctx, v), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "km", "included", "link"]), rules: [R.invite, R.first],
        aiNote: t.wrongKm ? "The AI typed the kilometres itself instead of taking them from the stock record." : null };
    },
    "invite-only": function (ctx, v) {
      return { parts: [greet(ctx), ai(["Thank you for your enquiry. Yes, the ", F(v.name, "Stock record " + v.stock), " is available, and you are welcome to come and see it."]), inviteBlock(ctx, v), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "link"]), rules: [R.invite, R.first] };
    },
    "available-invite": function (ctx, v) { return INTENTS["invite-only"](ctx, v); },
    "invite-yard": function (ctx, v) {
      return { parts: [ai(["You are welcome to see the ", F(v.short, "Stock record " + v.stock), " at our yard in Silverwater. Let us know a day that suits and we will have it ready for you."]), inviteBlock(ctx, v)],
        facts: vfacts(v, ["status", "link"]), rules: [R.noGreet, R.invite] };
    },
    "online-inspection": function (ctx, v) {
      return { parts: [ai(["Of course. As you are in Newcastle, we can show you the ", F(v.short, "Stock record " + v.stock), " on a live video call, walking around it and starting it up, so you can see everything before making the trip."]), inviteBlock(ctx, v, "online")],
        facts: vfacts(v, ["status"]).concat([bfact(ctx, "f-online")]), rules: [R.noGreet, R.far] };
    },
    "walkaround-video": function (ctx, v) {
      return { parts: [ai(["Here is the walkaround video of the ", F(v.short, "Stock record " + v.stock), ", so you can see it from every side."]), block("Walkaround video", "Added because they asked to see the car properly (your rule, 16 Oct 2026)", ["Walkaround video: " + carLink(ctx, v) + "/video"])],
        facts: vfacts(v, ["status"]), rules: [R.noGreet] };
    },
    "history-warranty": function (ctx, v) {
      var close = lessonOn(ctx, "no-kindly") ? "Let us know if you would like to come and see it." : "Kindly let us know if you would like to come and see it.";
      return {
        parts: [greet(ctx),
          ai(["Thank you for your enquiry. The ", F(v.name, "Stock record " + v.stock), " comes with ", F("a 5-year warranty", "The car's Included list"), ", included in the price. Its auction sheet records its condition and history at the time of sale in Japan; you can see it here:"]),
          block("Auction sheet", "Added because they asked about its history (your rule, 16 Oct 2026)", ["Auction sheet: " + carLink(ctx, v) + "/auction-sheet"]),
          ai([close]), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "included", "grade"]), rules: [R.first],
        lessonsUsed: lessonOn(ctx, "no-kindly") ? ["l-kindly"] : []
      };
    },
    "delivery-hold": function (ctx, v) {
      var f = factById(ctx, "f-interstate");
      var line1 = f.state === "needs"
        ? ["Thank you for your enquiry. We can arrange delivery of the ", F(v.short, "Stock record " + v.stock), " to Brisbane: ", B("DELIVERY COST"), "."]
        : ["Thank you for your enquiry. Yes, we can deliver the ", F(v.short, "Stock record " + v.stock), " to Brisbane. ", F(f.answer.replace(/^yes[,.!]?\s*/i, "").replace(/^\w/, function (c) { return c.toUpperCase(); }), "Business fact: Interstate delivery, confirmed " + f.date), " The cost for your trip is ", B("DELIVERY COST"), "."];
      return {
        parts: [greet(ctx), ai(line1),
          ai(["To hold it for you, we take a ", F("$1,000 holding deposit", "Business fact: Holding deposit"), ", refundable until you confirm the purchase."]),
          firstBlock(ctx, v)],
        facts: vfacts(v, ["status"]).concat([bfact(ctx, "f-interstate"), bfact(ctx, "f-deposit")]),
        rules: [R.deposit, R.blank, R.first],
        needsFact: f.state === "needs" ? f : null
      };
    },
    "available-fit": function (ctx, v) {
      var noFin = lessonOn(ctx, "no-finance-unasked");
      var segs = ["Thank you for your enquiry. Yes, the ", F(v.name, "Stock record " + v.stock), " is available. As a hybrid it uses very little fuel, which suits uni driving well."];
      if (!noFin) segs.push(" We also offer finance through our partner, with approval usually within one business day.");
      return { parts: [greet(ctx), ai(segs), inviteBlock(ctx, v), firstBlock(ctx, v)],
        facts: vfacts(v, ["status", "link"]).concat(noFin ? [] : [bfact(ctx, "f-finance")]), rules: [R.invite, R.first],
        lessonsUsed: noFin ? [noFin.id] : [] };
    },
    "stock-none": function (ctx) {
      return { parts: [greet(ctx), ai(["Thank you for your enquiry. We do not have a Toyota Hiace in stock at the moment. We will let you know if one comes in."]), firstBlock(ctx, null)],
        facts: [{ label: "Hiace in stock", value: "None", src: "Stock list, 0 of 10 cars" }], rules: [R.first] };
    },
    "ask-details": function (ctx) {
      return { parts: [greet(ctx), code(fillTemplate(ctx, "import-ask", {})), firstBlock(ctx, null)],
        facts: [], rules: [R.code, R.first], codeOnly: true };
    },
    "import-offer-text": function (ctx) {
      var lot = hiaceLot(), b = suggestedBid(lot), l = landed(b.bid), dep = depositFor(b.bid);
      return {
        parts: [greet(ctx),
          ai(["Thank you for the details. A ", F("2016 to 2018 Toyota Hiace Super GL diesel", "Import-eligible list: model match"), " is on the import-eligible list, so we can bring one in for you from the Japanese auctions."]),
          block("Live auction match", "Your offer wording, figures by code (your rule, 3 Oct 2026)", [lot.id + ", " + lot.house + ", " + lot.date + ": " + lot.year + " " + lot.model + ", grade " + lot.grade + ", " + km(lot.km) + "\nLot details: " + lot.link + "\nSuggested bid: " + yen(b.bid)]),
          block("Landed cost estimate", "From the website's cost calculator (demo figures)", [landedText(l)]),
          block("Deposit", "The deposit link is always a blank you paste (your rule, 5 Oct 2026)", ["To start, the deposit is " + yen(dep) + ", refundable if we do not win a car for you: ", B("DEPOSIT LINK")]),
          ai(["From winning the auction to collection takes ", F("6 to 10 weeks", "Business fact: Import timeline"), ". We do not bid blindly; the bid comes from the last similar cars sold."]),
          firstBlock(ctx, null)],
        facts: [{ label: "Eligible to import", value: "Hiace Super GL 2016 to 2018", src: "Import-eligible list" }, { label: "Suggested bid", value: yen(b.bid), src: "3 closest sold cars, rounded up" }, { label: "Landed estimate", value: aud(l.total), src: "Cost calculator" }, bfact(ctx, "f-timeline")],
        rules: [R.exact, R.bid, R.depLink, R.first],
        allowed: landedMoney(l),
        research: { kind: "hiace", lot: lot, bid: b, landed: l, deposit: dep,
          notes: ["Import-eligible list: matched on make, model and years", "Live auction: 2 lots found for the coming week", "Cost calculator: estimate for a bid of " + yen(b.bid), "Not found: nothing missing"] }
      };
    },
    "import-ask": function (ctx) { return INTENTS["ask-details"](ctx); },
    "buyer-rego": function (ctx, v) {
      return { parts: [greet(ctx), ai(["Thank you for your message, and we hope you are enjoying the ", F(v.short, "Sale record, 17 Oct"), ". ", F("Service NSW posts the registration papers to you, usually within 10 business days of the sale", "Business fact: Registration papers (working)"), ". As your sale was on 17 Oct, they should arrive by ", B("DATE"), "."]), signoff(ctx)],
        facts: [{ label: "Sale", value: v.name + ", 17 Oct", src: "Sale record" }, bfact(ctx, "f-rego")], rules: [R.buyer, R.blank, R.once] };
    },
    "fu-inspection": function (ctx, v) {
      return { parts: [greet(ctx), ai(["Thank you for coming in to see the ", F(v.name, "Stock record " + v.stock), " yesterday. How did you find it? If you would like to keep it aside while you decide, we can hold it with a ", F("$1,000 refundable holding deposit", "Business fact: Holding deposit"), "."]), signoff(ctx)],
        facts: [{ label: "Inspection", value: "Thursday 2 pm", src: "Booking on the website" }, bfact(ctx, "f-deposit")], rules: [R.fuAsk, R.once] };
    },
    "fu-price-drop": function (ctx, v) {
      return { parts: [greet(ctx), ai(["Thank you again for your interest in the ", F(v.name, "Stock record " + v.stock), ". Its price has come down to ", F(money(v.price), "Stock record " + v.stock), ", from ", F(money(v.wasPrice), "Price history"), ". You are welcome to come and see it."]), inviteBlock(ctx, v), signoff(ctx)],
        facts: vfacts(v, ["price", "status", "link"]).concat([{ label: "Earlier price", value: money(v.wasPrice), src: "Price history, changed today 5:30 am" }]), rules: [R.invite, R.once] };
    },
    "fu-reminder": function (ctx, v) {
      var d = ctx.dealer;
      return { parts: [greet(ctx, "Good afternoon"), code("This is a reminder of your inspection of the " + v.name + " tomorrow, Saturday, at 11 am. We are at " + d.address + ". Please call or text " + d.phone + " if anything changes."), signoff(ctx)],
        facts: [{ label: "Booking", value: "Saturday 11 am", src: "Booking on the website" }, { label: "Address", value: d.address, src: "Business identity" }], rules: [R.code], codeOnly: true };
    },
    "mp-offer": function (ctx, v) {
      return { parts: [ai(["The lowest we can do on the ", F(v.short, "Stock record " + v.stock), " is ", B("PRICE"), ". Send me your number and I'll give you a call to set a time for tomorrow."])],
        facts: vfacts(v, ["status", "price"]), rules: [R.mpShape, R.blank] };
    },
    "mp-number": function (ctx, v) {
      return { parts: [ai(["Happy to help with the ", F(v.short, "Stock record " + v.stock), ". Send me your number and I'll give you a call."])],
        facts: vfacts(v, ["status"]), rules: [R.mpShape] };
    },
    "mp-km": function (ctx, v) {
      return { parts: [ai(["It's done ", F(km(v.km), "Stock record " + v.stock), ", verified against the auction documents. Send me your number and I'll give you a call."])],
        facts: vfacts(v, ["km"]), rules: [R.mpShape] };
    },
    "mp-close": function (ctx, v) {
      return { parts: [ai(["No problem at all, thanks for your interest in the ", F(v.short, "Stock record " + v.stock), ". All the best with your search."])],
        facts: [], rules: [R.mpClose] };
    },
    "import-email": function (ctx) {
      var r = WN.data.research.alphard, l = landed(r.avgJpy);
      return {
        parts: [greet(ctx),
          ai(["Thank you for your email. ", F("The 2018 to 2020 Toyota Alphard hybrid is on the import-eligible list", "Import-eligible list: model AYH30W"), ", so we can bring one in for you. Based on recent auction prices, the estimated landed cost in Sydney is:"]),
          block("Landed cost estimate", "From the website's cost calculator (demo figures)", [landedText(l)]),
          ai(["The deposit to start is ", F(r.deposit, "Deposit table on the website"), ", and from winning the auction to collection takes ", F("6 to 10 weeks", "Business fact: Import timeline"), ". There is no 2018 to 2020 Alphard hybrid in this week's auctions yet; once you confirm your budget, we will search the coming auctions for you. You can read more here: ", F(r.page, "Website, importing page")]),
          signoff(ctx)],
        facts: [{ label: "Eligible to import", value: "Alphard hybrid, build 2015 to 2022", src: "Import-eligible list" }, { label: "Landed estimate", value: aud(l.total), src: "Cost calculator" }, { label: "Deposit", value: r.deposit, src: "Deposit table on the website" }, bfact(ctx, "f-timeline")],
        rules: [R.exact, R.once],
        allowed: landedMoney(l),
        lessonsUsed: ["l-landed"],
        research: { kind: "alphard", landed: l, notes: ["Import-eligible list: Alphard hybrid AYH30W, build 2015 to 2022", "Cost calculator: estimate from the average auction price of " + yen(r.avgJpy), "Website: importing page for the Alphard hybrid", "Not found: " + r.notFound] }
      };
    },
    "order-lot-offer": function (ctx) { return lotOffer(ctx, 0); },
    "order-lot-offer-2": function (ctx) { return lotOffer(ctx, 1); },
    "order-deposit": function (ctx, v, t) {
      return { parts: [code("Hello " + first(ctx.customer.name) + ","), code(fillTemplate(ctx, "deposit-received", { DEPOSIT: "¥150,000", WANTS: "Honda Stepwgn Spada" })), signoff(ctx)],
        facts: [{ label: "Deposit", value: "¥150,000, received today 9:05", src: "Auction order 1045" }], rules: [R.code], codeOnly: true };
    }
  };

  function lotOffer(ctx, i) {
    var lot = WN.data.auction.lots[i], b = suggestedBid(lot);
    return {
      parts: [code("Hello " + first(ctx.customer.name) + ","),
        ai(["We have found " + (i === 0 ? "two Hiace vans" : "a second Hiace") + " that fit what you asked for; " + (i === 0 ? "the better match is below." : "this one has higher kilometres but a lower bid.")]),
        block("Lot offer", "Your wording, figures by code (your rule, 5 Oct 2026)", [fillTemplate(ctx, "lot-offer", { LOT_CAR: lot.year + " " + lot.model, HOUSE: lot.house, DATE: lot.date, GRADE: lot.grade, KM: km(lot.km), LOT_LINK: lot.link, BID: yen(b.bid) })]),
        signoff(ctx)],
      facts: [{ label: "Lot", value: lot.id + ", " + lot.house + ", " + lot.date, src: "Live auction" }, { label: "Suggested bid", value: yen(b.bid), src: "3 closest sold cars, rounded up" }],
      rules: [R.bid, R.once],
      research: { kind: "lot", lot: lot, bid: b, notes: ["Live auction: 2 lots for order 1042", "Sold prices: " + lot.sold.length + " similar cars in the last month"] }
    };
  }

  /* ---------- assemble, check ---------- */
  function segText(s) {
    if (typeof s === "string") return s;
    if (s.f != null) return s.f;
    if (s.b != null) return s.v ? s.v : "[" + s.b + "?]";
    return "";
  }
  function partText(p) { return p.segs.map(segText).join(""); }
  function draftText(d) {
    return d.parts.filter(function (p) { return !p.removed; }).map(partText).join("\n\n");
  }

  var MONEY = /(?:A\$|\$)\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|(?:A\$|\$)\d+(?:\.\d{2})?/g;
  var KM = /\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s?km\b/gi;

  function check(d, ctx) {
    var v = ctx.vehicle;
    var allowedMoney = (d.allowed || []).slice();
    if (v) { allowedMoney.push(money(v.price)); if (v.wasPrice) allowedMoney.push(money(v.wasPrice)); }
    allowedMoney.push("$1,000");
    var allowedKm = v ? [km(v.km)] : [];
    var lot = WN.data.auction.lots; lot.forEach(function (l) { allowedKm.push(km(l.km)); });
    var fails = [], blanks = 0;
    d.parts.forEach(function (p) {
      if (p.removed) return;
      p.segs.forEach(function (s, i) {
        if (s && s.b != null && !s.v) blanks++;
        var txt = typeof s === "string" ? s : null; /* facts from records and your own blank fills are trusted */
        if (!txt) return;
        (txt.match(MONEY) || []).forEach(function (found) {
          var norm = found.replace(/\s/g, "");
          if (allowedMoney.indexOf(norm) < 0 && (d.overrides || []).indexOf(norm) < 0) {
            fails.push({ part: p.id, seg: i, found: norm, kind: "price", expected: v ? money(v.price) : null,
              msg: norm + " is not a figure in your records" + (v ? ". The stock record says " + money(v.price) + "." : ".") });
          }
        });
        var re = new RegExp(KM.source, "gi"), mm;
        while ((mm = re.exec(txt))) {
          var val = mm[1].replace(/,/g, "");
          var norm2 = Number(val).toLocaleString("en-AU") + " km";
          if (allowedKm.indexOf(norm2) < 0 && (d.overrides || []).indexOf(norm2) < 0) {
            fails.push({ part: p.id, seg: i, found: mm[0], kind: "km", expected: v ? km(v.km) : null,
              msg: mm[0] + " does not match the stock record" + (v ? " (" + km(v.km) + ")." : ".") });
          }
        }
      });
    });
    var needs = (d.facts || []).filter(function (f) { return f.state === "needs"; }).length;
    var checked = (d.facts || []).filter(function (f) { return f.state !== "needs"; }).length;
    var summary;
    if (fails.length) summary = { tone: "bad", text: fails.length === 1 ? "1 figure does not match your records" : fails.length + " figures do not match your records" };
    else if (needs) summary = { tone: "warn", text: "1 fact needs your answer" + (blanks ? " · " + blanks + (blanks === 1 ? " blank" : " blanks") + " to fill" : "") };
    else if (blanks) summary = { tone: "warn", text: checked + " facts checked · " + blanks + (blanks === 1 ? " blank to fill" : " blanks to fill") };
    else summary = { tone: "good", text: checked + (checked === 1 ? " fact checked" : " facts checked") };
    return { fails: fails, blanks: blanks, needs: needs, summary: summary };
  }

  /* ---------- simulated instruction rewrite ---------- */
  function rewrite(d, instruction) {
    var s = instruction.toLowerCase();
    var parts = JSON.parse(JSON.stringify(d.parts));
    var understood = false;
    function eachAi(fn) { parts.forEach(function (p) { if (p.kind === "ai") fn(p); }); }
    if (/financ/.test(s) && /(don'?t|do not|no |without|unless|leave out|skip)/.test(s)) {
      eachAi(function (p) { p.segs = p.segs.map(function (x) { return typeof x === "string" ? x.replace(/\s*We also offer finance[^.]*\./g, "") : x; }); });
      understood = "no-finance-unasked";
    }
    if (/short/.test(s)) {
      eachAi(function (p) {
        var t = p.segs.map(segText).join("");
        var cut = t.split(/(?<=\.)\s/).slice(0, 2).join(" ");
        if (cut.length < t.length) { p.segs = [cut]; }
      });
      understood = understood || "shorter";
    }
    if (/no greeting|without greeting|skip the greeting/.test(s)) {
      parts = parts.filter(function (p, i) { return !(i === 0 && p.kind === "code"); });
      understood = understood || "no-greeting";
    }
    if (/source|find one|bring one in/.test(s)) {
      var firstAi = parts.find(function (p) { return p.kind === "ai"; });
      if (firstAi) firstAi.segs = firstAi.segs.concat([" If you let us know the exact model you have in mind, we can source one for you."]);
      understood = understood || "source";
    }
    if (/number|call/.test(s) && !understood) {
      var a = parts.filter(function (p) { return p.kind === "ai"; }).pop();
      if (a) a.segs = a.segs.concat([" Send me your number and I'll give you a call."]);
      understood = "number";
    }
    return { parts: parts, understood: understood };
  }

  WN.engine = {
    money: money, aud: aud, yen: yen, km: km, first: first, greetWord: greetWord,
    LABELS: LABELS, INTENTS: INTENTS, check: check, draftText: draftText, partText: partText, segText: segText,
    rewrite: rewrite, suggestedBid: suggestedBid, landed: landed, depositFor: depositFor
  };
})();
