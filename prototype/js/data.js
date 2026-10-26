/* Wheelman prototype — invented demo data. Every person, car, price and address here is made up. */
(function () {
  var WN = (window.WN = window.WN || {});

  var dealer = {
    name: "Harbour Auto Imports",
    short: "Harbour Auto",
    team: "Team Harbour Auto",
    phone: "02 5550 4821",
    address: "21 Harbour Road, Silverwater NSW 2128",
    hours: "Monday to Friday 9 am to 6 pm, Saturday 9 am to 4 pm",
    site: "harbourauto.example"
  };

  var included = ["6 months registration", "a fresh roadworthy certificate", "a 5-year warranty"];

  var vehicles = {
    T14: { stock: "T14", name: "2019 Toyota Harrier Premium", short: "Harrier", price: 36990, km: 41200, grade: "4.5", colour: "Pearl white", status: "At the yard", hue: 205, included: included, photos: 24, videos: 2 },
    A22: { stock: "A22", name: "2018 Toyota Alphard SC", short: "Alphard", price: 45990, km: 58900, grade: "4", colour: "Black", status: "At the yard", hue: 220, included: included, photos: 31, videos: 1 },
    M05: { stock: "M05", name: "2019 Mazda CX-5 25S", short: "CX-5", price: 28490, km: 47300, grade: "4.5", colour: "Soul red", status: "At the yard", hue: 355, included: included, photos: 22, videos: 1 },
    F09: { stock: "F09", name: "2017 Honda Fit Hybrid", short: "Fit", price: 15990, km: 62100, grade: "4", colour: "Silver", status: "At the yard", hue: 210, included: included, photos: 18, videos: 0 },
    P31: { stock: "P31", name: "2020 Toyota Prius S", short: "Prius", price: 27990, km: 39800, grade: "4.5", colour: "Grey", status: "At the yard", hue: 215, included: included, photos: 26, videos: 1 },
    V18: { stock: "V18", name: "2019 Honda Vezel Hybrid Z", short: "Vezel", price: 26490, wasPrice: 27990, km: 51600, grade: "4", colour: "Blue", status: "At the yard", hue: 200, included: included, photos: 20, videos: 1 },
    E03: { stock: "E03", name: "2016 Nissan Elgrand 350 Highway Star", short: "Elgrand", price: 29990, km: 71000, grade: "4", colour: "White", status: "On the water, arrives 6 Nov", hue: 190, included: included, photos: 12, videos: 0 },
    X11: { stock: "X11", name: "2018 Nissan X-Trail 20Xi", short: "X-Trail", price: 24990, km: 64200, grade: "3.5", colour: "Bronze", status: "Sold 17 Oct", hue: 30, included: included, photos: 19, videos: 1 },
    C27: { stock: "C27", name: "2018 Toyota C-HR G", short: "C-HR", price: 25990, km: 44900, grade: "4.5", colour: "Yellow", status: "At the yard", hue: 45, included: included, photos: 21, videos: 1 },
    L02: { stock: "L02", name: "2017 Toyota Land Cruiser Prado TX-L", short: "Prado", price: 52990, km: 88400, grade: "4", colour: "Graphite", status: "At the yard", hue: 215, included: included, photos: 28, videos: 2 }
  };

  /* customers: phone numbers are from the range set aside for drama and examples */
  var customers = {
    c1: { name: "Daniel Wong", phone: "0491 570 156", from: "Carsales" },
    c2: { name: "Mia Thompson", phone: "0491 570 158", from: "Website" },
    c3: { name: "Tom Nguyen", phone: "0491 570 159", from: "Carsales" },
    c4: { name: "Sofia Rossi", phone: "0491 570 110", from: "Autotrader" },
    c5: { name: "Jack Wilson", phone: "0491 570 113", from: "Website" },
    c6: { name: "Aisha Khan", phone: "0491 570 157", from: "Carsales" },
    c7: { name: "Liam O'Brien", phone: "0491 570 147", from: "Website" },
    c8: { name: "Hannah Lee", phone: "0491 570 162", from: "Walk-in" },
    c9: { name: "Ryan Patel", phone: "0491 570 171", from: "Website contact form" },
    c10: { name: "Grace Park", phone: "0491 570 175", from: "Carsales" },
    c11: { name: "Ben Carter", phone: "0491 570 183", from: "Autotrader" },
    c12: { name: "Chloe Martin", phone: "0491 570 186", from: "Website" },
    c13: { name: "Ethan R.", phone: "", from: "Facebook" },
    c14: { name: "Olivia M.", phone: "", from: "Facebook" },
    c15: { name: "Noah K.", phone: "", from: "Facebook" },
    c16: { name: "Zara P.", phone: "", from: "Facebook" },
    c17: { name: "Lucas B.", phone: "", from: "Facebook" },
    c18: { name: "Sarah Mitchell", email: "sarah.m@example.com", from: "Email" },
    c19: { name: "Kenji Sato", email: "k.sato@example.net", from: "Email" },
    c20: { name: "Chris Taylor", phone: "0491 570 191", from: "Auction order" },
    c21: { name: "Nina Patel", phone: "0491 570 194", from: "Auction order" },
    c22: { name: "Emma Davis", phone: "0491 570 196", from: "Auction order" },
    c23: { name: "Josh Lee", phone: "0491 570 198", from: "Auction order" },
    c24: { name: "Mohammed Ali", phone: "0491 570 165", from: "Carsales" },
    c25: { name: "New customer", phone: "0491 570 177", from: "Carsales" }
  };

  function m(from, text, ago, extra) {
    var o = { from: from, text: text, ago: ago };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  /* ago = minutes before the demo clock (Friday 24 Oct 2026, 10:30 am) */
  var threads = [
    /* ---------- Dashboard ---------- */
    {
      id: "t-daniel", customer: "c1", section: "dashboard", channel: "text", type: "stock", vehicle: "T14", source: "Carsales lead",
      state: "waiting", unread: 1, intents: ["price-trade-inspect", "price-only", "trade-in-only"],
      alsoOn: "Also asked about this Harrier on Facebook on Tuesday",
      insider: ["Lead score: high", "Asked about 2 other cars on Carsales", "Came from Carsales"],
      messages: [
        m("event", "New Carsales lead for the 2019 Toyota Harrier Premium", 19),
        m("them", "Hi, what's your best price on the Harrier? I've got a 2014 Mazda 3 to trade in, what would you give me for it? Could I come and see it Saturday?", 18)
      ]
    },
    {
      id: "t-mia", customer: "c2", section: "dashboard", channel: "text", type: "stock", vehicle: "P31", source: "Website enquiry",
      state: "waiting", unread: 1, intents: ["available-km", "invite-only"], wrongKm: true,
      insider: ["Lead score: medium", "Came from the website"],
      messages: [
        m("event", "Website enquiry for the 2020 Toyota Prius S", 47),
        m("them", "Is the Prius still available? How many km has it done?", 46)
      ]
    },
    {
      id: "t-tom", customer: "c3", section: "dashboard", channel: "text", type: "stock", vehicle: "A22", source: "Carsales lead",
      state: "waiting", unread: 2, intents: ["invite-yard", "online-inspection", "walkaround-video"],
      insider: ["Lead score: high", "Finance pre-approved on Carsales"],
      messages: [
        m("event", "New Carsales lead for the 2018 Toyota Alphard SC", 95),
        m("them", "Hi, is the Alphard still for sale?", 94),
        m("us", "Good morning Tom,\n\nThank you for your enquiry. Yes, the 2018 Toyota Alphard SC is available.\n\nRegards,\nTeam Harbour Auto", 80, { by: "You, from the dashboard" }),
        m("them", "Great. I'm up in Newcastle so I can't easily come down. Can you show me the car properly?", 32)
      ]
    },
    {
      id: "t-sofia", customer: "c4", section: "dashboard", channel: "text", type: "stock", vehicle: "V18", source: "Autotrader lead",
      state: "waiting", unread: 1, intents: ["history-warranty", "invite-only"],
      insider: ["Lead score: medium", "Came from Autotrader"],
      messages: [
        m("event", "New Autotrader lead for the 2019 Honda Vezel Hybrid Z", 63),
        m("them", "Does the Vezel have any service history? And does it come with a warranty?", 62)
      ]
    },
    {
      id: "t-jack", customer: "c5", section: "dashboard", channel: "text", type: "stock", vehicle: "C27", source: "Website enquiry",
      state: "waiting", unread: 1, intents: ["delivery-hold", "invite-only"],
      insider: ["Lead score: high", "Came from the website", "Lives in Queensland (from the lead)"],
      messages: [
        m("event", "Website enquiry for the 2018 Toyota C-HR G", 125),
        m("them", "Can you deliver the C-HR to Brisbane? If so I'd like to put a deposit on it today.", 124)
      ]
    },
    {
      id: "t-aisha", customer: "c6", section: "dashboard", channel: "text", type: "stock", vehicle: "F09", source: "Carsales lead",
      state: "waiting", unread: 1, intents: ["available-fit", "invite-only"],
      insider: ["Lead score: medium", "First car, from the message"],
      messages: [
        m("event", "New Carsales lead for the 2017 Honda Fit Hybrid", 140),
        m("them", "Is the Honda Fit still available? Looking for something cheap to run for uni.", 139)
      ]
    },
    {
      id: "t-liam", customer: "c7", section: "dashboard", channel: "text", type: "stock", vehicle: "L02", source: "Website enquiry",
      state: "waiting", unread: 1, intents: ["available-invite"], answeredLater: true,
      insider: ["Came from the website"],
      messages: [
        m("event", "Website enquiry for the 2017 Toyota Land Cruiser Prado TX-L", 12),
        m("them", "Is the Prado still available?", 11)
      ]
    },
    {
      id: "t-ryan", customer: "c9", section: "dashboard", channel: "text", type: "stock", vehicle: null, source: "Website contact form",
      typeReason: "Read as a stock enquiry: no car named, no import words such as \"from Japan\" or \"auction\".",
      wants: "Toyota Hiace Super GL diesel, 2016 to 2018, under 150,000 km, about $45,000",
      state: "waiting", unread: 1, intents: ["stock-none", "ask-details"],
      insider: ["Came from the website contact form"],
      messages: [
        m("event", "Website contact form", 205),
        m("them", "Hi, do you have a Toyota Hiace? Looking for a 2016 to 2018 Super GL diesel, under 150,000 km. Budget is about $45k all up.", 204)
      ]
    },
    {
      id: "t-hannah", customer: "c8", section: "dashboard", channel: "text", type: "buyer", vehicle: "X11", source: "Bought 17 Oct",
      state: "waiting", unread: 1, intents: ["buyer-rego"],
      insider: ["Bought the X-Trail on 17 Oct, paid in full"],
      messages: [
        m("event", "Sale recorded: 2018 Nissan X-Trail 20Xi, 17 Oct", 10080),
        m("them", "Hi, just wondering when the rego papers will arrive for the X-Trail?", 228)
      ]
    },
    {
      id: "t-mo", customer: "c24", section: "dashboard", channel: "text", type: "stock", vehicle: "T14", source: "Carsales lead",
      state: "answered", unread: 0, intents: ["price-only"],
      messages: [
        m("them", "Is the Harrier the hybrid one?", 1500),
        m("us", "Good afternoon Mohammed,\n\nThank you for your enquiry. This Harrier is the 2.0 litre petrol Premium, not the hybrid.\n\nRegards,\nTeam Harbour Auto", 1480, { by: "You, from the dashboard" })
      ]
    },
    {
      id: "t-grace", customer: "c10", section: "dashboard", channel: "text", type: "stock", vehicle: "L02", source: "Carsales lead",
      state: "answered", unread: 0, intents: ["fu-inspection"],
      followUp: { kind: "inspection", reason: "Inspected yesterday at 2 pm", due: "Due now" },
      messages: [
        m("them", "Can I come and look at the Prado tomorrow at 2?", 1700),
        m("us", "Good afternoon Grace,\n\nYes, tomorrow at 2 pm suits. Please call or text before visiting.\n\nRegards,\nTeam Harbour Auto", 1690, { by: "You, from the dashboard" }),
        m("event", "Inspection booked on the website: Thursday 2 pm", 1688),
        m("event", "Inspection time passed: Thursday 2 pm", 1230)
      ]
    },
    {
      id: "t-ben", customer: "c11", section: "dashboard", channel: "text", type: "stock", vehicle: "V18", source: "Autotrader lead",
      state: "answered", unread: 0, intents: ["fu-price-drop"],
      followUp: { kind: "news", reason: "Price dropped $1,500", due: "Due now" },
      messages: [
        m("them", "Would you do any better on the Vezel?", 5900),
        m("us", "Good morning Ben,\n\nThank you for your message. The price includes 6 months registration, a fresh roadworthy certificate and a 5-year warranty. Government charges are extra.\n\nRegards,\nTeam Harbour Auto", 5880, { by: "You, from the dashboard" }),
        m("event", "Price changed: $27,990 to $26,490", 300)
      ]
    },
    {
      id: "t-chloe", customer: "c12", section: "dashboard", channel: "text", type: "stock", vehicle: "P31", source: "Website enquiry",
      state: "answered", unread: 0, intents: ["fu-reminder"],
      followUp: { kind: "reminder", reason: "Inspection tomorrow 11 am", due: "Due today 4 pm" },
      messages: [
        m("them", "Can I book to see the Prius on Saturday morning?", 2900),
        m("us", "Good afternoon Chloe,\n\nOf course. You can book an inspection here: harbourauto.example/cars/P31#inspection=onsite\n\nRegards,\nTeam Harbour Auto", 2880, { by: "You, from the dashboard" }),
        m("event", "Inspection booked on the website: Saturday 11 am", 2850)
      ]
    },

    /* ---------- Marketplace ---------- */
    {
      id: "f-ethan", customer: "c13", section: "marketplace", channel: "facebook", type: "stock", vehicle: "M05", source: "Facebook Marketplace",
      state: "waiting", unread: 1, handedOver: true, intents: ["mp-offer", "mp-number"],
      messages: [
        m("them", "Is this still available?", 70),
        m("auto", "Hi Ethan, yes it's still available, $28,490 with only 47,300 km.\nIt's a grade 4.5 Japanese import, km verified against the auction documents, and the price includes 6 months rego, a fresh roadworthy and a 5-year warranty.\nKeen to see it? Send me your number and I'll give you a call.", 69, { by: "Auto-reply from the Facebook engine" }),
        m("them", "Would you take $24k cash? I can come tomorrow.", 21),
        m("event", "The Facebook engine handed this chat to a person", 20)
      ]
    },
    {
      id: "f-noah", customer: "c15", section: "marketplace", channel: "facebook", type: "stock", vehicle: "F09", source: "Facebook Marketplace",
      state: "waiting", unread: 1, intents: ["mp-km"],
      messages: [
        m("them", "Hi what's the kms on it", 38)
      ]
    },
    {
      id: "f-olivia", customer: "c14", section: "marketplace", channel: "facebook", type: "stock", vehicle: "A22", source: "Facebook Marketplace",
      state: "auto", unread: 0, intents: ["mp-number"],
      messages: [
        m("them", "Is this available", 150),
        m("auto", "Hi Olivia, yes it's still available, $45,990 with only 58,900 km.\nIt's a grade 4 Japanese import, km verified against the auction documents, and the price includes 6 months rego, a fresh roadworthy and a 5-year warranty.\nKeen to see it? Send me your number and I'll give you a call.", 149, { by: "Auto-reply from the Facebook engine" })
      ]
    },
    {
      id: "f-zara", customer: "c16", section: "marketplace", channel: "facebook", type: "stock", vehicle: "T14", source: "Facebook Marketplace",
      state: "answered", unread: 0, answeredBy: "A colleague on Facebook at 9:58", intents: ["mp-number"],
      messages: [
        m("them", "Does it have a sunroof?", 40),
        m("us", "Yes it does, a full panoramic roof. Send me your number and I'll give you a call.", 32, { by: "A colleague, on Facebook" })
      ]
    },
    {
      id: "f-lucas", customer: "c17", section: "marketplace", channel: "facebook", type: "stock", vehicle: "L02", source: "Facebook Marketplace",
      state: "waiting", unread: 1, intents: ["mp-close"],
      messages: [
        m("them", "Is the price negotiable", 300),
        m("us", "The lowest we can do on the Prado is $51,500. Send me your number and I'll give you a call.", 290, { by: "You, sent from Wheelman" }),
        m("them", "Too dear for me, all the best", 55)
      ]
    },

    /* ---------- Imports ---------- */
    {
      id: "e-sarah", customer: "c18", section: "imports", channel: "email", type: "import", vehicle: null, source: "Gmail",
      wants: "Toyota Alphard hybrid, 2018 to 2020",
      typeReason: "Import enquiry: asked whether we can bring one in from Japan.",
      state: "waiting", unread: 1, intents: ["import-email"],
      messages: [
        m("event", "Handed in from Gmail with Send to Wheelman", 182),
        m("them", "Hello,\n\nCould you import a Toyota Alphard hybrid, 2018 to 2020, for me? What would it cost landed in Sydney, and how long does it take?\n\nThanks,\nSarah", 184)
      ]
    },
    {
      id: "e-kenji", customer: "c19", section: "imports", channel: "email", type: "import", vehicle: null, source: "Gmail",
      wants: "Nissan Elgrand, 2017 or newer",
      state: "answered", unread: 0, intents: ["import-email"],
      messages: [
        m("them", "Hi, what is the process for importing a car through you?", 4400),
        m("us", "Hello Kenji,\n\nThank you for your email. Importing through us takes 6 to 10 weeks from winning the auction to collection...\n\nRegards,\nTeam Harbour Auto", 4300, { by: "You, from Gmail" })
      ]
    },

    /* ---------- Auction ---------- */
    {
      id: "o-chris", customer: "c20", section: "auction", channel: "whatsapp", type: "order", vehicle: null, source: "Auction order 1042",
      order: { no: 1042, stage: 2, wants: "Toyota Hiace Super GL diesel, 2016 to 2018, grade 4 or better, under 120,000 km, landed budget A$36,000", charged: "Deposit ¥300,000 received 20 Oct", due: "Lot offer" },
      state: "waiting", unread: 0, bucket: "todo", intents: ["order-lot-offer", "order-lot-offer-2"],
      messages: [
        m("event", "Order 1042 opened: deposit ¥300,000 received", 5800),
        m("us", "Hello Chris,\n\nThank you, we have received your deposit. We will search the coming auctions and send you the best matches.\n\nRegards,\nTeam Harbour Auto", 5790, { by: "You, copied for WhatsApp" }),
        m("event", "2 lots found for this order in the coming auctions", 90)
      ]
    },
    {
      id: "o-nina", customer: "c21", section: "auction", channel: "whatsapp", type: "order", vehicle: null, source: "Auction order 1045",
      order: { no: 1045, stage: 1, wants: "Honda Stepwgn Spada, 2019 or newer", charged: "Deposit ¥150,000 received today 9:05", due: "Deposit received" },
      state: "waiting", unread: 0, bucket: "todo", intents: ["order-deposit"],
      messages: [
        m("event", "Order 1045 opened: deposit ¥150,000 received", 85)
      ]
    },
    {
      id: "o-emma", customer: "c22", section: "auction", channel: "whatsapp", type: "order", vehicle: null, source: "Auction order 1039",
      order: { no: 1039, stage: 4, wants: "Toyota Voxy ZS, 2019", charged: "Paid in full 16 Oct", due: null },
      state: "answered", unread: 0, bucket: "progress", intents: ["order-shipping"],
      messages: [
        m("event", "Car secured at auction: 2019 Toyota Voxy ZS, grade 4", 12000),
        m("event", "Shipping booked: leaves Yokohama 30 Oct", 2000)
      ]
    },
    {
      id: "o-josh", customer: "c23", section: "auction", channel: "whatsapp", type: "order", vehicle: null, source: "Auction order 1031",
      order: { no: 1031, stage: 6, wants: "Mazda CX-8, 2018", charged: "Paid in full", due: null },
      state: "answered", unread: 0, bucket: "done", intents: ["order-shipping"],
      messages: [
        m("event", "Collected from the yard on 15 Oct", 13000)
      ]
    }
  ];

  /* arriving later in the demo */
  var incoming = {
    id: "t-new", customer: "c25", section: "dashboard", channel: "text", type: "stock", vehicle: "C27", source: "Carsales lead",
    state: "waiting", unread: 1, intents: ["available-invite"],
    insider: ["Came from Carsales"],
    messages: [
      m("event", "New Carsales lead for the 2018 Toyota C-HR G", 0),
      m("them", "Hi, is the yellow C-HR still available? Can I see it this afternoon?", 0)
    ]
  };

  var orderStages = ["Deposit received", "Searching the auctions", "Lots offered", "Car secured", "Shipping", "Compliance", "Collected"];

  /* the live auction, for the Hiace (order 1042 and Ryan's enquiry) */
  var auction = {
    rate: 98,
    lots: [
      { id: "Lot 3021", house: "USS Tokyo", date: "Tue 28 Oct", year: 2017, model: "Toyota Hiace Super GL diesel", grade: "4", km: 98000, siteBid: 1800000, link: "harbourauto.example/auction/lot/3021",
        sold: [
          { grade: "4", km: 91000, price: 1820000, when: "9 Oct" },
          { grade: "4", km: 104000, price: 1905000, when: "2 Oct" },
          { grade: "4", km: 112000, price: 1760000, when: "25 Sep" },
          { grade: "3.5", km: 95000, price: 1650000, when: "11 Oct" },
          { grade: "4.5", km: 88000, price: 2050000, when: "30 Sep" }
        ] },
      { id: "Lot 1187", house: "TAA Yokohama", date: "Wed 29 Oct", year: 2016, model: "Toyota Hiace Super GL diesel", grade: "4", km: 131000, siteBid: 1550000, link: "harbourauto.example/auction/lot/1187",
        sold: [
          { grade: "4", km: 128000, price: 1590000, when: "8 Oct" },
          { grade: "4", km: 139000, price: 1505000, when: "1 Oct" },
          { grade: "4", km: 121000, price: 1640000, when: "24 Sep" }
        ] }
    ],
    costs: { shipping: 2950, compliance: 4400, dutyRate: 0.05, gstRate: 0.1, rego: 1050, fee: 2500 },
    depositTiers: [[1000000, 150000], [2000000, 300000], [4000000, 500000]]
  };

  var research = {
    alphard: {
      eligible: "On the import-eligible list (model AYH30W, build 2015 to 2022)",
      page: "harbourauto.example/importing/toyota-alphard-hybrid",
      avgJpy: 3600000, deposit: "¥500,000", timeline: "6 to 10 weeks from winning the auction to collection",
      notFound: "No 2018 to 2020 Alphard hybrid in the next week's auctions yet."
    }
  };

  var templates = [
    { id: "first-reply", section: "Dashboard", name: "First reply block", uses: 212, text: "Vehicle details: {{CAR_LINK}}\nOur location: {{ADDRESS}}\nOpen {{HOURS}}.\nFeel free to visit us or call {{PHONE}}.\n{{SENDER}}" },
    { id: "price-reply", section: "Dashboard", name: "Price reply", uses: 96, text: "The price includes {{INCLUDED}}. Government charges are extra. We generally keep our prices competitive considering everything included, but we may offer a small discount for a serious buyer." },
    { id: "invite", section: "Dashboard", name: "Inspection invitation", uses: 141, text: "You can book an inspection here: {{BOOKING_LINK}}\nOr let us know your preferred date and time, and we'll arrange it for you. Please call or text before visiting." },
    { id: "fu-inspection", section: "Dashboard", name: "After an inspection", uses: 9, text: "Thank you for coming in to see the {{CAR}} {{WHEN}}. How did you find it?" },
    { id: "mp-first", section: "Marketplace", name: "First reply", uses: 410, text: "Hi {{NAME}}, yes it's still available, {{PRICE}} with only {{KM}}.\nIt's a grade {{GRADE}} Japanese import, km verified against the auction documents, and the price includes {{INCLUDED_SHORT}}.\nKeen to see it? Send me your number and I'll give you a call." },
    { id: "mp-number", section: "Marketplace", name: "Number ask", uses: 188, text: "Send me your number and I'll give you a call." },
    { id: "import-ask", section: "Imports", name: "Asking reply", uses: 23, text: "To find the right car for you, could you tell us the year range, the maximum kilometres, the grade you would accept, your landed budget and any colour or features you need?" },
    { id: "lot-offer", section: "Auction", name: "Lot offer", uses: 31, text: "We found a {{LOT_CAR}} at {{HOUSE}} on {{DATE}}, grade {{GRADE}}, {{KM}}.\nLot details: {{LOT_LINK}}\nOur suggested bid is {{BID}}. We do not bid blindly: this is based on the last similar cars sold.\nPlease confirm and we will place the bid." },
    { id: "deposit-received", section: "Auction", name: "Deposit received", uses: 28, text: "Thank you, we have received your deposit of {{DEPOSIT}}. We will search the coming auctions for your {{WANTS}} and send you the best matches." }
  ];

  var facts = [
    { id: "f-deposit", topic: "Holding deposit", state: "confirmed", answer: "$1,000, refundable until the customer confirms the purchase.", date: "9 Oct 2026" },
    { id: "f-included", topic: "What every stock car includes", state: "confirmed", answer: "6 months registration, a fresh roadworthy certificate and a 5-year warranty.", date: "12 Oct 2026" },
    { id: "f-hours", topic: "Opening hours", state: "confirmed", answer: "Monday to Friday 9 am to 6 pm, Saturday 9 am to 4 pm.", date: "12 Oct 2026" },
    { id: "f-finance", topic: "Finance", state: "confirmed", answer: "Through our finance partner; approval usually within one business day. No rates quoted by text.", date: "3 Oct 2026" },
    { id: "f-online", topic: "Online video inspection", state: "confirmed", answer: "A video call on WhatsApp or FaceTime, booked through the car's page.", date: "1 Oct 2026" },
    { id: "f-warranty", topic: "Extended warranty when not included", state: "confirmed", answer: "$1,300 for stock cars, $1,500 for imports to order.", date: "9 Oct 2026" },
    { id: "f-timeline", topic: "Import timeline", state: "confirmed", answer: "6 to 10 weeks from winning the auction to collection.", date: "9 Oct 2026" },
    { id: "f-trade", topic: "Trade-ins", state: "working", answer: "We accept trade-ins. A guide figure can be given by text; the final figure once we have seen the car.", date: "5 Oct 2026" },
    { id: "f-interstate", topic: "Interstate delivery", state: "needs", question: "Do we deliver interstate, and how is it priced?", answer: "", date: "" },
    { id: "f-rego", topic: "Registration papers after a sale", state: "working", answer: "Service NSW posts the papers to the buyer, usually within 10 business days of the sale.", date: "6 Oct 2026" }
  ];

  var lessons = [
    { id: "l-kindly", status: "proposed", text: "Leave out \"kindly\".", scope: "Dashboard texts", origin: "You removed it 6 times since 14 Oct", apply: "no-kindly", uses: 0,
      evidence: [
        { before: "Kindly let us know a time that suits you.", after: "Let us know a time that suits you." },
        { before: "Kindly call or text before visiting.", after: "Please call or text before visiting." },
        { before: "Kindly confirm which day works best.", after: "Which day works best for you?" }
      ] },
    { id: "l-question", status: "proposed", text: "End with one question at most.", scope: "Dashboard texts", origin: "You cut a second question 4 times since 16 Oct", apply: "one-question", uses: 0,
      evidence: [
        { before: "Would Saturday suit? And do you have a trade-in?", after: "Would Saturday suit?" },
        { before: "Is it for you? What budget are you working with?", after: "What budget are you working with?" },
        { before: "Shall we book you in? Would you like finance?", after: "Shall we book you in?" }
      ] },
    { id: "l-finance", status: "on", text: "Answer finance the way the team does: approval through our partner within a day, no rates by text.", scope: "Dashboard texts", origin: "Your note, 3 Oct 2026", uses: 41 },
    { id: "l-inspect", status: "on", text: "Every car on the website is ready to inspect.", scope: "Dashboard texts", origin: "Your note, 3 Oct 2026", uses: 63 },
    { id: "l-below", status: "on", text: "Never say \"below\" about a price.", scope: "Dashboard texts", origin: "Your note, 2 Oct 2026", uses: 18 },
    { id: "l-landed", status: "on", text: "Give the landed cost first, then the process.", scope: "Import emails", origin: "Kept from your repeated edits, 12 Oct 2026", uses: 7 }
  ];

  var voice = [
    { rule: "Formal and courteous. No slang, no emoji, at most one exclamation mark.", date: "12 Oct 2026" },
    { rule: "Greet by the hour (Good morning, Good afternoon, Good evening, or Hello) and sign off \"Regards, Team\" only on the first reply of the day. Never \"Hi\".", date: "1 and 13 Oct 2026" },
    { rule: "The deposit is the only urgency. Never other buyers or \"selling fast\".", date: "12 Oct 2026" },
    { rule: "Questions only when the answer is needed.", date: "13 Oct 2026" },
    { rule: "Insider facts shape a reply and are never stated.", date: "12 Oct 2026" },
    { rule: "Marketplace: answer first, 20 to 50 words, no greeting or sign-off, the next step is their number.", date: "20 Oct 2026" }
  ];

  var deals = [
    { customer: "c1", car: "T14", stage: "enquiry", last: "18 min ago", next: "Answer price and trade-in", proof: "Carsales lead, 10:12", thread: "t-daniel" },
    { customer: "c2", car: "P31", stage: "enquiry", last: "46 min ago", next: "Confirm it is available", proof: "Website enquiry, 9:44", thread: "t-mia" },
    { customer: "c3", car: "A22", stage: "enquiry", last: "32 min ago", next: "Offer an online inspection", proof: "Carsales lead, 8:56", thread: "t-tom" },
    { customer: "c5", car: "C27", stage: "enquiry", last: "2 h ago", next: "Answer delivery and the deposit", proof: "Website enquiry, 8:26", thread: "t-jack" },
    { customer: "c12", car: "P31", stage: "booked", last: "2 days ago", next: "Reminder today at 4 pm", proof: "Booking on the website, Sat 11 am", thread: "t-chloe" },
    { customer: "c10", car: "L02", stage: "seen", last: "yesterday", next: "Ask how the inspection went", proof: "Booking passed, Thu 2 pm", thread: "t-grace" },
    { customer: "c11", car: "V18", stage: "quiet", last: "4 days ago", next: "Tell them the price dropped", proof: "No reply since Mon", thread: "t-ben" },
    { customer: "c20", car: null, wants: "Hiace, order 1042", stage: "deposit", last: "4 days ago", next: "Send the lot offer", proof: "Deposit ¥300,000, 20 Oct", thread: "o-chris" },
    { customer: "c21", car: null, wants: "Stepwgn, order 1045", stage: "deposit", last: "today", next: "Welcome message", proof: "Deposit ¥150,000, 9:05", thread: "o-nina" },
    { customer: "c8", car: "X11", stage: "sold", last: "7 days ago", next: "Answer the rego question", proof: "Sale recorded, 17 Oct", thread: "t-hannah" }
  ];

  WN.data = {
    dealer: dealer, vehicles: vehicles, customers: customers, threads: threads, incoming: incoming,
    orderStages: orderStages, auction: auction, research: research, templates: templates,
    facts: facts, lessons: lessons, voice: voice, deals: deals,
    clock: new Date(2026, 9, 24, 10, 30, 0)
  };
})();
