/* Wheelman prototype — one store, plain actions, simulated timing. Nothing here talks to a network. */
(function () {
  var WN = (window.WN = window.WN || {});
  var E = WN.engine;
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  var bootAt = Date.now();
  var timers = {};
  var undoFn = null;
  var toastTimer = null;
  var listeners = [];
  var REV = 1;
  function nextRev() { REV += 1; return REV; } /* unique across all drafts, so the editor never shows stale text */

  function load(key, fallback) { try { var v = localStorage.getItem("wn-next-" + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
  function save(key, v) { try { localStorage.setItem("wn-next-" + key, JSON.stringify(v)); } catch (e) { /* storage blocked: keep it in memory */ } }

  function fresh() {
    var d = WN.data;
    return {
      booted: false,
      screen: "inbox",
      section: "dashboard",
      chips: { dashboard: "needs", marketplace: "needs", imports: "needs", auction: "todo" },
      open: null,
      view: "list",
      panelOpen: window.innerWidth >= 1280,
      panelTab: "car",
      playbookTab: "lessons",
      threads: clone(d.threads),
      drafts: {},
      cache: {},
      facts: clone(d.facts),
      lessons: clone(d.lessons),
      templates: clone(d.templates),
      run: null,
      toast: null,
      menu: null,
      search: null,
      remember: null,
      factOpen: null,
      sending: {},
      pasteOpen: false,
      demo: { open: false, speed: load("speed", "normal"), failNext: "", aiDown: false, dashboardDown: false, scenario: "busy", inbox: load("inbox", "sections"), events: true },
      settings: { theme: load("theme", "system"), accent: load("accent", "blue") },
      editingTemplate: null
    };
  }

  var S = { state: fresh() };
  WN.S = S;

  function emit() { listeners.forEach(function (fn) { fn(S.state); }); }
  var queued = false;
  function set(fn) {
    fn(S.state);
    if (!queued) { queued = true; Promise.resolve().then(function () { queued = false; emit(); }); }
  }
  S.set = set;
  S.sub = function (fn) { listeners.push(fn); };

  /* ---------- clock ---------- */
  function now() { return new Date(WN.data.clock.getTime() + (Date.now() - bootAt)); }
  function minutesSinceBoot() { return (Date.now() - bootAt) / 60000; }
  function agoNow(ago) { return ago + minutesSinceBoot(); }
  function timeAt(ago) { return new Date(now().getTime() - ago * 60000); }
  function clockText(date) {
    var h = date.getHours(), m = date.getMinutes();
    return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h < 12 ? "am" : "pm");
  }
  function whenShort(ago) {
    var t = timeAt(agoNow(ago)), n = now();
    var day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    var diff = Math.round((day(n) - day(t)) / 86400000);
    if (diff === 0) return clockText(t);
    if (diff === 1) return "Yesterday";
    if (diff < 7) return t.toLocaleDateString("en-AU", { weekday: "short" });
    return t.getDate() + " " + t.toLocaleDateString("en-AU", { month: "short" });
  }
  function whenLong(ago) {
    var t = timeAt(agoNow(ago)), n = now();
    var day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    var diff = Math.round((day(n) - day(t)) / 86400000);
    if (diff === 0) return clockText(t);
    if (diff === 1) return "Yesterday " + clockText(t);
    if (diff < 7) return t.toLocaleDateString("en-AU", { weekday: "short" }) + " " + clockText(t);
    return t.getDate() + " " + t.toLocaleDateString("en-AU", { month: "short" }) + " " + clockText(t);
  }
  function dayLabel(ago) {
    var t = timeAt(agoNow(ago)), n = now();
    var day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    var diff = Math.round((day(n) - day(t)) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return t.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
  }

  /* ---------- lookups ---------- */
  function thread(id) { return S.state.threads.find(function (t) { return t.id === id; }); }
  function customer(t) { return WN.data.customers[t.customer]; }
  function vehicle(t) { return t.vehicle ? WN.data.vehicles[t.vehicle] : null; }
  function lastCustomerAgo(t) {
    var ms = t.messages.filter(function (m) { return m.from === "them"; });
    return ms.length ? ms[ms.length - 1].ago : t.messages[t.messages.length - 1].ago;
  }
  function lastAgo(t) { return t.messages.length ? Math.min.apply(null, t.messages.map(function (m) { return m.ago; })) : 0; }
  function isWaiting(t) { return t.state === "waiting"; }
  function inSection(t, sec) { return t.section === sec; }

  function listFor(st, sec, chip) {
    var ts = st.threads.filter(function (t) { return st.demo.inbox === "one" ? true : inSection(t, sec); });
    if (chip === "needs") ts = ts.filter(isWaiting);
    if (chip === "followups") ts = ts.filter(function (t) { return t.followUp && t.state !== "done" && t.state !== "dismissed"; });
    if (chip === "todo") ts = ts.filter(function (t) { return t.bucket === "todo" && t.state !== "done"; });
    if (chip === "progress") ts = ts.filter(function (t) { return t.bucket === "progress" || (t.bucket === "todo" && t.state === "done"); });
    if (chip === "done") ts = ts.filter(function (t) { return t.bucket === "done"; });
    return ts.slice().sort(function (a, b) { return lastAgo(a) - lastAgo(b); });
  }
  function counts(st, sec) {
    var all = st.threads.filter(function (t) { return inSection(t, sec); });
    return {
      unread: all.reduce(function (n, t) { return n + (t.unread ? 1 : 0); }, 0),
      needs: all.filter(isWaiting).length,
      followups: all.filter(function (t) { return t.followUp && t.state !== "done" && t.state !== "dismissed"; }).length,
      todo: all.filter(function (t) { return t.bucket === "todo" && t.state !== "done"; }).length,
      all: all.length
    };
  }

  function ctxFor(t) {
    var st = S.state;
    return { dealer: WN.data.dealer, customer: customer(t), vehicle: vehicle(t), templates: st.templates, facts: st.facts, lessons: st.lessons, now: now() };
  }

  /* ---------- writing ---------- */
  function speed() {
    var s = S.state.demo.speed;
    return s === "fast" ? { think: 250, word: 8 } : s === "slow" ? { think: 2600, word: 45 } : { think: 900, word: 22 };
  }
  function countWords(p) { return E.partText(p).split(/\s+/).filter(Boolean).length; }
  function stop(id) { (timers[id] || []).forEach(clearTimeout); timers[id] = []; }
  function later(id, ms, fn) { timers[id] = timers[id] || []; timers[id].push(setTimeout(fn, ms)); }

  function build(t, intent) {
    var ctx = ctxFor(t);
    var fn = E.INTENTS[intent];
    var b = fn(ctx, ctx.vehicle, t);
    b.parts = b.parts.map(function (p, i) { p.id = "p" + i; p.removed = false; return p; });
    return b;
  }

  function writeDraft(id, intent, opts) {
    opts = opts || {};
    var t = thread(id);
    if (!t) return;
    intent = intent || t.intents[0];
    stop(id);
    var st = S.state;
    var cached = st.cache[id] && st.cache[id][intent];
    if (cached && !opts.force) {
      set(function (s) { var d = clone(cached); d.rev = nextRev(); s.drafts[id] = d; if (s.remember && s.remember.threadId === id) s.remember = null; });
      return;
    }
    var b = build(t, intent);
    var fail = st.demo.aiDown ? "ai-timeout" : st.demo.failNext;
    if (fail === "send-fail" || b.codeOnly) fail = "";
    if (fail && !st.demo.aiDown) set(function (s) { s.demo.failNext = ""; });
    var note = b.aiNote ? { kind: "bad", text: b.aiNote } : null;
    if (fail === "figure-wrong") {
      var v = vehicle(t);
      var a = b.parts.find(function (p) { return p.kind === "ai"; }) || b.parts[0];
      a.segs = a.segs.concat([" It has done " + E.km((v ? v.km : 50000) - 900) + "."]);
      note = { kind: "bad", text: "Simulated fault: the AI typed a figure itself instead of taking it from the records." };
    }
    if (fail === "ai-timeout" || fail === "budget") {
      b.parts = b.parts.map(function (p) {
        if (p.kind !== "ai") return p;
        return { id: p.id, kind: "code", removed: false, segs: [{ b: "ANSWER", v: "" }] };
      });
      note = fail === "budget"
        ? { kind: "warn", text: "This month's AI budget is used up, so this is your wording with a blank where the answer goes. Small jobs keep to free models; replies continue tomorrow, or raise the budget in Settings.", action: "retry" }
        : { kind: "warn", text: "The AI did not answer within 20 seconds, so this is your wording with a blank where the answer goes. Fill it in, or write it again.", action: "retry" };
    }
    if (fail === "ai-busy") note = { kind: "info", text: "The first model was busy, so the backup model wrote this one. Nothing for you to do." };
    var instant = opts.instant || b.codeOnly || fail === "ai-timeout" || fail === "budget";
    var total = b.parts.reduce(function (n, p) { return n + (p.kind === "ai" ? countWords(p) : 0); }, 0);
    var draft = {
      threadId: id, intent: intent, alts: t.intents.filter(function (x) { return x !== intent; }),
      rev: nextRev(),
      status: instant ? "ready" : "thinking", parts: b.parts, facts: b.facts || [], rules: b.rules || [],
      lessonsUsed: b.lessonsUsed || [], allowed: b.allowed || [], research: b.research || null,
      needsFact: b.needsFact || null, note: note, overrides: [], wordsShown: instant ? total : 0, totalWords: total,
      codeOnly: !!b.codeOnly, edited: false, instruction: opts.instruction || null,
      model: b.codeOnly ? "Written by code, no AI request" : fail === "ai-busy" ? "Backup model (simulated)" : fail === "ai-timeout" || fail === "budget" ? "Your wording, no AI request" : "Writing model (simulated)",
      tokens: b.codeOnly ? 0 : 2600 + Math.round(total * 9),
      written: whenLong(0)
    };
    set(function (s) { s.drafts[id] = draft; if (s.remember && s.remember.threadId === id) s.remember = null; });
    if (instant) { finish(id); return; }
    var sp = speed();
    var think = sp.think + (fail === "ai-busy" ? 1600 : 0);
    later(id, think, function () {
      set(function (s) { if (s.drafts[id]) s.drafts[id].status = "writing"; });
      var step = function () {
        var d = S.state.drafts[id];
        if (!d || d.status !== "writing") return;
        if (d.wordsShown >= d.totalWords) { finish(id); return; }
        set(function (s) { s.drafts[id].wordsShown += 2; });
        later(id, sp.word * 2, step);
      };
      step();
    });
  }
  function finish(id) {
    set(function (s) {
      var d = s.drafts[id];
      if (!d) return;
      d.status = "ready";
      d.wordsShown = d.totalWords;
      s.cache[id] = s.cache[id] || {};
      if (!d.instruction && !d.note) s.cache[id][d.intent] = clone(d);
    });
  }

  /* ---------- toast ---------- */
  function toast(text, opts) {
    opts = opts || {};
    undoFn = opts.undo || null;
    clearTimeout(toastTimer);
    set(function (s) { s.toast = { text: text, kind: opts.kind || "", hasUndo: !!opts.undo, action: opts.action || null, id: Date.now() }; });
    toastTimer = setTimeout(function () { set(function (s) { s.toast = null; }); undoFn = null; }, opts.undo ? 9000 : 4200);
  }

  /* ---------- actions ---------- */
  var A = {};

  A.boot = function () {
    S.state.threads.forEach(function (t) {
      if (t.section === "dashboard" && t.state === "waiting") writeDraft(t.id, null, { instant: true });
    });
    setTimeout(function () { set(function (s) { s.booted = true; }); }, 900);
    scheduleEvents();
  };

  function scheduleEvents() {
    later("events", 28000, function () { if (S.state.demo.events && S.state.demo.scenario === "busy") A.newMessage(); });
    later("events", 55000, function () { if (S.state.demo.events && S.state.demo.scenario === "busy") A.answeredElsewhere(); });
  }

  A.section = function (sec) {
    set(function (s) {
      s.screen = "inbox"; s.section = sec; s.menu = null;
      if (s.open && thread(s.open) && thread(s.open).section !== sec && s.demo.inbox !== "one") { s.open = null; s.view = "list"; }
    });
  };
  A.chip = function (c) {
    set(function (s) { s.chips[s.section] = c; });
    if (c === "followups") {
      /* his choice, 23 Oct 2026: choosing Follow-ups opens the first one and writes it */
      var first = listFor(S.state, S.state.section, "followups")[0];
      if (first) {
        A.open(first.id);
        if (!S.state.drafts[first.id]) writeDraft(first.id);
      }
    }
  };
  A.writeFollowUp = function () { var id = S.state.open; if (id) writeDraft(id); };
  A.screen = function (scr, tab) { set(function (s) { s.screen = scr; s.menu = null; if (tab) s.playbookTab = tab; }); };
  A.playbookTab = function (tab) { set(function (s) { s.playbookTab = tab; }); };

  A.open = function (id, opts) {
    var t = thread(id);
    if (!t) return;
    set(function (s) {
      s.screen = "inbox";
      if (s.demo.inbox !== "one") s.section = t.section;
      s.open = id; s.view = "chat"; t.unread = 0; s.remember = null; s.pasteOpen = false; s.factOpen = null;
      if (!(opts && opts.keepPanelTab)) s.panelTab = "car";
      if (window.innerWidth < 1280) s.panelOpen = false;
    });
    var needs = t.state === "waiting" || (t.followUp && t.state !== "done" && t.state !== "dismissed" && S.state.chips.dashboard === "followups") || (t.bucket === "todo" && t.state !== "done");
    if (needs && !S.state.drafts[id] && t.intents.length && t.intents[0] !== "order-shipping") writeDraft(id);
  };
  A.back = function () { set(function (s) { if (s.view === "panel") { s.view = "chat"; s.panelOpen = false; } else { s.view = "list"; s.open = null; } }); };
  A.panel = function (open) { set(function (s) { s.panelOpen = open == null ? !s.panelOpen : open; if (window.innerWidth < 900) s.view = s.panelOpen ? "panel" : "chat"; }); };
  A.panelTab = function (tab) { set(function (s) { s.panelTab = tab; }); };
  A.write = function (intent) { var id = S.state.open; if (id) writeDraft(id, intent, { force: true }); };
  A.swap = function (intent) { var id = S.state.open; if (id) writeDraft(id, intent); };

  A.editSeg = function (partId, segIdx, text) {
    var id = S.state.open; var d = S.state.drafts[id]; if (!d) return;
    var p = d.parts.find(function (x) { return x.id === partId; });
    if (!p || p.segs[segIdx] === text) return;
    set(function () { p.segs[segIdx] = text; d.edited = true; });
  };
  A.fill = function (partId, segIdx, v) {
    var d = S.state.drafts[S.state.open]; if (!d) return;
    var p = d.parts.find(function (x) { return x.id === partId; });
    set(function () { p.segs[segIdx].v = v; }); /* filling a blank is your decision, not an edit to learn from */
  };
  A.removePart = function (partId) {
    var d = S.state.drafts[S.state.open]; if (!d) return;
    var p = d.parts.find(function (x) { return x.id === partId; });
    set(function () { p.removed = true; d.edited = true; });
    toast((p.label || "Part") + " removed from this reply", { undo: function () { set(function () { p.removed = false; }); } });
  };
  A.restorePart = function (partId) {
    var d = S.state.drafts[S.state.open]; if (!d) return;
    var p = d.parts.find(function (x) { return x.id === partId; });
    set(function () { p.removed = false; });
  };
  A.clear = function () {
    var id = S.state.open, d = S.state.drafts[id]; if (!d) return;
    var keep = clone(d);
    set(function (s) { s.drafts[id] = { threadId: id, cleared: true, rev: nextRev(), parts: [{ id: "p0", kind: "own", segs: [""] }], facts: [], rules: [], lessonsUsed: [], alts: d.alts.concat([d.intent]), intent: null, status: "ready", overrides: [], edited: true }; });
    toast("Suggestion cleared. Type your own reply.", { undo: function () { set(function (s) { keep.rev = nextRev(); s.drafts[id] = keep; }); } });
  };
  A.fixFigure = function (f) {
    var d = S.state.drafts[S.state.open]; if (!d) return;
    var p = d.parts.find(function (x) { return x.id === f.part; });
    set(function () {
      var s = p.segs[f.seg]; var i = s.indexOf(f.found);
      if (i >= 0 && f.expected) p.segs.splice(f.seg, 1, s.slice(0, i), { f: f.expected, src: "Stock record" }, s.slice(i + f.found.length));
      d.rev = nextRev(); d.note = null;
    });
    toast("Changed to " + f.expected + " from the stock record");
  };
  A.keepFigure = function (f) {
    var d = S.state.drafts[S.state.open]; if (!d) return;
    set(function () { d.overrides.push(f.found.replace(/\s/g, "")); d.note = null; });
    toast("Kept your figure. It is your decision, so Copy is allowed.");
  };
  A.factOpen = function (open) { set(function (s) { s.factOpen = open; }); };

  function markDone(t, how) {
    var prev = { state: t.state, messages: t.messages.slice(), bucket: t.bucket };
    set(function () {
      t.state = "done";
      t.messages.push({ from: "event", text: how + " " + clockText(now()), ago: -minutesSinceBoot(), good: true });
    });
    return function () { set(function () { t.state = prev.state; t.messages = prev.messages; t.bucket = prev.bucket; }); };
  }

  A.copy = function (opts) {
    opts = opts || {};
    var id = S.state.open, t = thread(id), d = S.state.drafts[id];
    if (!t || !d) return;
    var text = E.draftText(d);
    copyText(text);
    var label = t.channel === "email" ? "Copied for Gmail at" : t.channel === "whatsapp" ? "Copied for WhatsApp at" : "Copied at";
    var undo = markDone(t, label);
    var asWritten = !d.edited && !d.instruction;
    set(function () { d.copied = { at: clockText(now()), asWritten: asWritten, withBlanks: !!opts.withBlanks }; });
    var where = t.channel === "email" ? "Paste it into the Gmail thread." : t.channel === "whatsapp" ? "Paste it into WhatsApp." : "Paste it into the dashboard conversation.";
    toast("Copied. " + where, { undo: function () { undo(); set(function () { d.copied = null; }); } });
    advanceRun(id);
  };
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        return;
      }
    } catch (e) { /* fall through */ }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.className = "sr";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* the text stays selected for a manual copy */ }
    setTimeout(function () { ta.remove(); }, 0);
  }

  A.send = function () {
    var id = S.state.open, t = thread(id), d = S.state.drafts[id];
    if (!t || !d) return;
    var text = E.draftText(d);
    set(function (s) { s.sending[id] = "sending"; });
    setTimeout(function () {
      if (S.state.demo.failNext === "send-fail") {
        set(function (s) { s.sending[id] = "failed"; s.demo.failNext = ""; });
        toast("Not sent: the Facebook engine did not answer. Your text is still in the box.", { kind: "bad" });
        return;
      }
      set(function (s) {
        s.sending[id] = "sent";
        t.messages.push({ from: "us", text: text, ago: -minutesSinceBoot(), by: "You, sent from Wheelman (simulated)" });
        t.state = "done";
        d.copied = { at: clockText(now()), sent: true, asWritten: !d.edited };
      });
      toast("Sent on Facebook (simulated). The engine's phone types it into Messenger.");
      advanceRun(id);
    }, S.state.demo.speed === "slow" ? 2600 : 1300);
  };

  A.putBack = function (id) {
    var t = thread(id); if (!t) return;
    set(function (s) {
      t.state = "waiting";
      t.messages = t.messages.filter(function (m) { return !(m.from === "event" && m.good); });
      var d = s.drafts[id]; if (d) d.copied = null;
    });
    toast("Put back in Needs reply.");
  };
  A.addLink = function (label, url) {
    var id = S.state.open, d = S.state.drafts[id];
    if (!d || d.status !== "ready") { toast("Open a reply first, then add the link."); return; }
    var at = d.parts.findIndex(function (p) { return p.kind === "block" && p.label === "First reply block"; });
    if (at < 0) at = d.parts.length - (d.parts.length && d.parts[d.parts.length - 1].kind === "code" ? 1 : 0);
    var part = { id: "p" + Date.now(), kind: "block", label: label, why: "Added by you from the car panel", segs: [label + ": " + url], removed: false };
    set(function () { d.parts.splice(at, 0, part); d.rev = nextRev(); d.edited = true; });
    toast(label + " added to the reply.", { undo: function () { set(function () { d.parts = d.parts.filter(function (p) { return p.id !== part.id; }); d.rev = nextRev(); }); } });
  };
  WN.copyPlain = function (text) { copyText(text); };

  A.dismiss = function () {
    var id = S.state.open, t = thread(id); if (!t) return;
    var prev = t.state;
    set(function (s) { t.state = "dismissed"; s.menu = null; });
    toast("Dismissed. It stays under All.", { undo: function () { set(function () { t.state = prev; }); } });
    advanceRun(id);
  };

  A.setType = function (type) {
    var id = S.state.open, t = thread(id); if (!t) return;
    var prev = { section: t.section, type: t.type, intents: t.intents.slice(), typeReason: t.typeReason };
    var prevDraft = S.state.drafts[id];
    set(function (s) {
      s.menu = null;
      if (type === "import") {
        t.section = "imports"; t.type = "import"; t.intents = ["import-offer-text", "import-ask"];
        t.typeReason = "Import enquiry: you changed the type at " + clockText(now()) + ".";
        s.section = "imports"; s.chips.imports = "needs";
      } else if (type === "stock") {
        t.section = "dashboard"; t.type = "stock"; t.intents = prev.intents[0] === "import-offer-text" ? ["stock-none", "ask-details"] : prev.intents;
        t.typeReason = "Stock enquiry: you changed the type at " + clockText(now()) + ".";
        s.section = "dashboard";
      }
      delete s.drafts[id]; delete s.cache[id];
    });
    if (type === "notcustomer") { A.dismiss(); return; }
    writeDraft(id);
    toast(type === "import" ? "Moved to Imports and rewritten as an import answer." : "Moved to Dashboard.", {
      undo: function () {
        stop(id);
        set(function (s) { t.section = prev.section; t.type = prev.type; t.intents = prev.intents; t.typeReason = prev.typeReason; s.section = prev.section; if (prevDraft) s.drafts[id] = prevDraft; });
      }
    });
  };

  A.tell = function (instruction) {
    var id = S.state.open, d = S.state.drafts[id], t = thread(id);
    if (!instruction || !t) return;
    stop(id);
    if (!d || d.cleared || !d.intent) { writeDraft(id, t.intents[0], { force: true, instruction: instruction }); d = S.state.drafts[id]; }
    var before = clone(d.parts);
    set(function () { d.status = "thinking"; d.instruction = instruction; d.wordsShown = 0; });
    later(id, speed().think + 400, function () {
      var r = E.rewrite({ parts: before }, instruction);
      set(function (s) {
        d.parts = r.parts; d.rev = nextRev(); d.status = "ready"; d.edited = true; d.totalWords = d.wordsShown = 1;
        d.note = r.understood ? null : { kind: "info", text: "Simulated: the real Wheelman rewrites the whole reply from your instruction in one request. This demo only acts on a few, such as \"shorter\", \"don't mention finance\" or \"ask for their number\"." };
        s.remember = { threadId: id, instruction: instruction, understood: r.understood };
      });
    });
  };
  A.remember = function (keep) {
    var r = S.state.remember; if (!r) return;
    var t = thread(r.threadId);
    if (!keep) { set(function (s) { s.remember = null; }); toast("Used for this reply only. Nothing was learned."); return; }
    var text = r.instruction.charAt(0).toUpperCase() + r.instruction.slice(1);
    if (!/[.!?]$/.test(text)) text += ".";
    var scope = t.section === "imports" ? "Import emails" : t.section === "marketplace" ? null : t.section === "auction" ? null : "Dashboard texts";
    if (!scope) { set(function (s) { s.remember = null; }); toast("Marketplace and Auction never teach Wheelman, so this was used once.", { kind: "" }); return; }
    var lesson = { id: "l-" + Date.now(), status: "on", text: text, scope: scope, origin: "Your instruction, today " + clockText(now()), uses: 1, apply: r.understood === "no-finance-unasked" ? "no-finance-unasked" : null, fresh: true };
    set(function (s) { s.lessons.unshift(lesson); s.remember = null; var d = s.drafts[r.threadId]; if (d) d.lessonsUsed = (d.lessonsUsed || []).concat([lesson.id]); });
    toast("Saved as a lesson for " + scope + ".", { action: { label: "See it", fn: "lessons" }, undo: function () { set(function (s) { s.lessons = s.lessons.filter(function (l) { return l.id !== lesson.id; }); }); } });
  };

  A.answerFact = function (fid, answer) {
    var f = S.state.facts.find(function (x) { return x.id === fid; });
    if (!f || !answer.trim()) return;
    set(function () { f.state = "confirmed"; f.answer = answer.trim(); f.date = "today " + clockText(now()); });
    var redo = S.state.threads.filter(function (t) { var d = S.state.drafts[t.id]; return d && d.needsFact && d.needsFact.id === fid && t.state === "waiting"; });
    redo.forEach(function (t) { delete S.state.cache[t.id]; writeDraft(t.id, null, { force: true, instant: true }); });
    var who = redo.length ? " " + WN.data.customers[redo[0].customer].name + "'s draft now uses it." : "";
    toast("Saved as Confirmed." + who, redo.length ? { action: { label: "Open it", fn: "open:" + redo[0].id } } : {});
  };
  A.factToWorking = function (fid) {
    var f = S.state.facts.find(function (x) { return x.id === fid; });
    set(function () { f.state = "confirmed"; f.date = "today " + clockText(now()); });
    toast("Marked as Confirmed.");
  };
  A.lesson = function (lid, op) {
    var l = S.state.lessons.find(function (x) { return x.id === lid; });
    if (!l) return;
    var prev = l.status;
    set(function () {
      if (op === "keep") { l.status = "on"; l.origin = l.origin + " · kept by you today"; }
      if (op === "reject") l.status = "rejected";
      if (op === "toggle") l.status = l.status === "on" ? "off" : "on";
    });
    var msg = op === "keep" ? "Kept. It applies from the next draft." : op === "reject" ? "Marked as not a rule. Wheelman will stop suggesting it." : l.status === "on" ? "Lesson switched on." : "Lesson switched off. It no longer shapes drafts.";
    toast(msg, { undo: function () { set(function () { l.status = prev; }); } });
  };
  A.editTemplate = function (tid) { set(function (s) { s.editingTemplate = tid ? { id: tid, text: s.templates.find(function (x) { return x.id === tid; }).text } : null; }); };
  A.templateText = function (text) { set(function (s) { if (s.editingTemplate) s.editingTemplate.text = text; }); };
  A.saveTemplate = function () {
    var e = S.state.editingTemplate; if (!e) return;
    var tpl = S.state.templates.find(function (x) { return x.id === e.id; });
    var prev = tpl.text;
    set(function (s) { tpl.text = e.text; tpl.version = (tpl.version || 1) + 1; tpl.changed = "today " + clockText(now()); s.editingTemplate = null; s.cache = {}; });
    toast("Template saved. New drafts use it; drafts already written keep their text.", { undo: function () { set(function () { tpl.text = prev; tpl.version--; }); } });
  };

  A.menu = function (m) { set(function (s) { s.menu = s.menu === m ? null : m; }); };
  A.search = function (q) { set(function (s) { s.search = q == null ? null : { q: q }; s.menu = null; }); };
  A.paste = function (open) { set(function (s) { s.pasteOpen = open; }); };
  A.pasteIn = function (text, who) {
    var t = thread(S.state.open); if (!t || !text.trim()) return;
    set(function (s) { t.messages.push({ from: who === "us" ? "us" : "them", text: text.trim(), ago: -minutesSinceBoot(), by: who === "us" ? "You, on WhatsApp (pasted in)" : "Pasted in from WhatsApp" }); s.pasteOpen = false; if (who !== "us") t.state = "waiting"; });
    if (who !== "us") writeDraft(t.id, null, { force: true });
  };

  /* reply run */
  A.startRun = function () {
    var st = S.state;
    var q = listFor(st, st.section, "needs").slice().sort(function (a, b) { return lastCustomerAgo(b) - lastCustomerAgo(a); }).map(function (t) { return t.id; });
    if (!q.length) return;
    var oldest = lastCustomerAgo(thread(q[0]));
    set(function (s) { s.run = { queue: q, i: 0, done: 0, oldest: Math.round(agoNow(oldest)), finished: false }; });
    A.open(q[0]);
  };
  function advanceRun(id) {
    var r = S.state.run;
    if (!r || r.finished || r.queue[r.i] !== id) return;
    setTimeout(function () {
      var rr = S.state.run; if (!rr || rr.queue[rr.i] !== id) return;
      set(function (s) { s.run.done++; s.run.i++; });
      nextInRun();
    }, 700);
  }
  function nextInRun() {
    var r = S.state.run;
    while (r.i < r.queue.length && !isWaiting(thread(r.queue[r.i]))) r.i++;
    if (r.i >= r.queue.length) { set(function (s) { s.run.finished = true; s.open = null; }); return; }
    A.open(r.queue[r.i]);
  }
  A.skip = function () { set(function (s) { s.run.i++; }); nextInRun(); };
  A.endRun = function () { set(function (s) { s.run = null; }); };

  /* demo controls */
  A.demo = function (patch) {
    set(function (s) { for (var k in patch) s.demo[k] = patch[k]; });
    if (patch.speed) save("speed", patch.speed);
    if (patch.inbox) { save("inbox", patch.inbox); set(function (s) { s.chips[s.section] = "needs"; }); }
  };
  A.setting = function (patch) {
    set(function (s) { for (var k in patch) s.settings[k] = patch[k]; });
    for (var k in patch) save(k, patch[k]);
  };
  A.scenario = function (name) {
    Object.keys(timers).forEach(stop);
    var keep = { theme: S.state.settings.theme, accent: S.state.settings.accent, inbox: S.state.demo.inbox, speed: S.state.demo.speed };
    S.state = fresh();
    S.state.booted = true;
    S.state.demo.scenario = name;
    S.state.demo.inbox = keep.inbox; S.state.demo.speed = keep.speed;
    if (name === "quiet") S.state.threads.forEach(function (t) { if (t.state === "waiting" && ["t-daniel", "f-ethan"].indexOf(t.id) < 0) { t.state = "answered"; t.unread = 0; } });
    if (name === "empty") S.state.threads.forEach(function (t) { if (t.state === "waiting") { t.state = "answered"; t.unread = 0; } if (t.bucket === "todo") t.bucket = "progress"; });
    if (name === "broken") { S.state.demo.dashboardDown = true; S.state.demo.aiDown = true; }
    S.state.threads.forEach(function (t) { if (t.section === "dashboard" && t.state === "waiting") writeDraft(t.id, null, { instant: true }); });
    scheduleEvents();
    set(function (s) { s.demo.open = true; });
    toast(name === "busy" ? "Busy morning: 9 waiting on the dashboard." : name === "quiet" ? "Quiet day: 2 waiting." : name === "empty" ? "Empty inbox: nobody waiting." : "Everything broken: the dashboard is not answering and the AI times out.");
  };
  A.newMessage = function () {
    if (thread("t-new")) { toast("That customer is already in the list."); return; }
    var t = clone(WN.data.incoming);
    t.messages.forEach(function (m) { m.ago = -minutesSinceBoot(); });
    set(function (s) { s.threads.unshift(t); });
    writeDraft(t.id, null, { instant: true });
  };
  A.answeredElsewhere = function () {
    var t = thread("t-liam");
    if (!t || t.state !== "waiting") { toast("Liam O'Brien was already answered."); return; }
    set(function (s) {
      t.messages.push({ from: "us", text: "Hi Liam, yes it is still available. Happy to show you through this afternoon.", ago: -minutesSinceBoot(), by: "A colleague, from the shop phone" });
      t.state = "answered"; t.answeredBy = "Answered on the shop phone at " + clockText(now());
      delete s.drafts[t.id];
    });
    stop(t.id);
  };
  A.retryDashboard = function () {
    set(function (s) { s.demo.dashboardDown = false; });
    toast("The dashboard answered. Everything is up to date.");
  };
  A.undo = function () { if (undoFn) { var f = undoFn; undoFn = null; f(); } set(function (s) { s.toast = null; }); };
  A.toastAction = function (fn) {
    set(function (s) { s.toast = null; });
    if (fn === "lessons") A.screen("playbook", "lessons");
    else if (fn.indexOf("open:") === 0) A.open(fn.slice(5));
  };

  WN.A = A;
  WN.Q = {
    thread: thread, customer: customer, vehicle: vehicle, listFor: listFor, counts: counts, isWaiting: isWaiting,
    lastCustomerAgo: lastCustomerAgo, lastAgo: lastAgo, whenShort: whenShort, whenLong: whenLong, dayLabel: dayLabel,
    clockText: clockText, now: now, agoNow: agoNow, toast: toast
  };
})();
