/* Wheelman prototype — Playbook, Sales board, This week, Settings. */
(function () {
  var WN = window.WN;
  var U = WN.ui, html = U.html, P = U.P, A = WN.A, Q = WN.Q, E = WN.engine;
  var useRef = P.useRef;

  /* ---------- Playbook ---------- */
  function Playbook(props) {
    var st = props.st;
    var tab = st.playbookTab;
    var proposed = st.lessons.filter(function (l) { return l.status === "proposed"; }).length;
    var needs = st.facts.filter(function (f) { return f.state === "needs"; }).length;
    var tabs = [["lessons", "Lessons", proposed ? proposed + " to review" : null], ["facts", "Business facts", needs ? needs + " needs an answer" : null], ["templates", "Templates", null], ["voice", "Voice", null]];
    return html`<section class="tile page" aria-label="Playbook"><div class="page-inner">
      <div class="pagehead"><div class="grow"><h1>Playbook</h1><p class="lead">Everything Wheelman knows and follows, in one place. Change it here and new drafts use it straight away.</p></div></div>
      <div class="subtabs" role="tablist">${tabs.map(function (x) { return html`<button class="chip" role="tab" aria-pressed=${tab === x[0]} onClick=${function () { A.playbookTab(x[0]); }}>${x[1]}${x[2] ? html`<span class="count">${x[2]}</span>` : null}</button>`; })}</div>
      ${tab === "lessons" ? html`<${Lessons} st=${st}/>` : null}
      ${tab === "facts" ? html`<${Facts} st=${st}/>` : null}
      ${tab === "templates" ? html`<${Templates} st=${st}/>` : null}
      ${tab === "voice" ? html`<${Voice}/>` : null}
    </div></section>`;
  }

  function Lessons(props) {
    var st = props.st;
    var byStatus = function (s) { return st.lessons.filter(function (l) { return l.status === s; }); };
    var proposed = byStatus("proposed"), on = byStatus("on"), off = byStatus("off"), rejected = byStatus("rejected");
    return html`<div style="display:grid;gap:20px">
      <p class="note" style="margin:0">Lessons come from your instructions (when you choose Remember) and from edits you make again and again. Dashboard texts teach Dashboard replies and emails teach Import emails. Marketplace, phone-only texts and auction orders never teach.</p>
      <section style="display:grid;gap:8px"><h2>To review</h2>
        ${proposed.length ? proposed.map(function (l) { return html`<${LessonCard} l=${l} key=${l.id}/>`; }) : html`<p class="note" style="margin:0">Nothing to review. A lesson is proposed after you make the same kind of edit three times.</p>`}
      </section>
      <section style="display:grid;gap:8px"><h2>In use <span class="note">(${on.length})</span></h2>${on.map(function (l) { return html`<${LessonCard} l=${l} key=${l.id}/>`; })}</section>
      ${off.length ? html`<section style="display:grid;gap:8px"><h2>Switched off</h2>${off.map(function (l) { return html`<${LessonCard} l=${l} key=${l.id}/>`; })}</section>` : null}
      ${rejected.length ? html`<section style="display:grid;gap:8px"><h2>Not a rule</h2>${rejected.map(function (l) { return html`<div class="card off" key=${l.id}><div class="card-top"><span class="grow">${l.text}</span><button class="btn small quiet" onClick=${function () { A.lesson(l.id, "keep"); }}>Keep it after all</button></div></div>`; })}</section>` : null}
    </div>`;
  }

  function LessonCard(props) {
    var l = props.l;
    if (l.status === "proposed") {
      return html`<div class="card proposed">
        <div class="card-top"><span class="grow">${l.text}</span><span class="reason info">Proposed</span></div>
        <div class="meta">${l.origin} · would apply to ${l.scope}</div>
        <div class="ev">${l.evidence.map(function (e, i) { return html`<div key=${i}><small>Before</small><del>${e.before}</del><small style="margin-top:6px">What you sent</small><ins>${e.after}</ins></div>`; })}</div>
        <div class="card-top"><button class="btn small main" onClick=${function () { A.lesson(l.id, "keep"); }}>Keep as a lesson</button><button class="btn small" onClick=${function () { A.lesson(l.id, "reject"); }}>Not a rule</button></div>
      </div>`;
    }
    return html`<div class=${"card" + (l.status === "off" ? " off" : "")}>
      <div class="card-top"><span class="grow">${l.text}</span>${l.fresh ? html`<span class="reason good">New</span>` : null}
        <button class="switch" role="switch" aria-checked=${l.status === "on"} aria-label=${(l.status === "on" ? "Switch off: " : "Switch on: ") + l.text} onClick=${function () { A.lesson(l.id, "toggle"); }}></button></div>
      <div class="meta">${l.scope} · ${l.origin} · used in ${l.uses} ${l.uses === 1 ? "draft" : "drafts"}</div>
    </div>`;
  }

  function Facts(props) {
    var st = props.st;
    var group = function (s) { return st.facts.filter(function (f) { return f.state === s; }); };
    return html`<div style="display:grid;gap:20px">
      <p class="note" style="margin:0">Every fact a reply states comes from here or from the stock records. A fact that needs your answer becomes a blank in replies until you answer it.</p>
      ${group("needs").length ? html`<section style="display:grid;gap:8px"><h2>Needs your answer</h2>${group("needs").map(function (f) { return html`<${FactAsk} f=${f} key=${f.id}/>`; })}</section>` : null}
      <section style="display:grid;gap:8px"><h2>Working <span class="note">(used, not yet confirmed by you)</span></h2>${group("working").map(function (f) {
        return html`<div class="card" key=${f.id}><div class="card-top"><span class="grow">${f.topic}</span><span class="state-tag working">Working</span><button class="btn small" onClick=${function () { A.factToWorking(f.id); }}>Confirm</button></div><div>${f.answer}</div><div class="meta">Since ${f.date}</div></div>`;
      })}</section>
      <section style="display:grid;gap:8px"><h2>Confirmed</h2>${group("confirmed").map(function (f) {
        return html`<div class="card" key=${f.id}><div class="card-top"><span class="grow">${f.topic}</span><span class="state-tag confirmed">Confirmed ${f.date}</span></div><div>${f.answer}</div></div>`;
      })}</section>
    </div>`;
  }
  function FactAsk(props) {
    var f = props.f, ref = useRef();
    return html`<form class="card proposed" onSubmit=${function (e) { e.preventDefault(); A.answerFact(f.id, ref.current.value); }}>
      <div class="card-top"><span class="grow">${f.topic}</span><span class="state-tag needs">Needs answer</span></div>
      <div class="field"><label for=${"fa-" + f.id}>${f.question}</label><textarea id=${"fa-" + f.id} ref=${ref} placeholder="For example: Yes, through our transport partner, usually 5 to 7 business days; quoted per trip."></textarea></div>
      <div class="card-top"><button class="btn small main" type="submit">Save as Confirmed</button><span class="note">Drafts waiting on this fact are rewritten with your answer.</span></div>
    </form>`;
  }

  function fillFor(tpl, t) {
    var v = Q.vehicle(t), c = Q.customer(t), d = WN.data.dealer;
    var vars = {
      CAR_LINK: v ? d.site + "/cars/" + v.stock : d.site + "/cars", ADDRESS: d.address, HOURS: d.hours, PHONE: d.phone, SENDER: d.team,
      INCLUDED: v ? v.included.join(", ").replace(/, ([^,]*)$/, " and $1") : "", BOOKING_LINK: v ? d.site + "/cars/" + v.stock + "#inspection=onsite" : "",
      CAR: v ? v.name : "", WHEN: "yesterday", NAME: E.first(c.name), PRICE: v ? E.money(v.price) : "", KM: v ? E.km(v.km) : "", GRADE: v ? v.grade : "",
      INCLUDED_SHORT: "6 months rego, a fresh roadworthy and a 5-year warranty", DEPOSIT: "¥150,000", WANTS: "car",
      LOT_CAR: "2017 Toyota Hiace Super GL diesel", HOUSE: "USS Tokyo", DATE: "Tue 28 Oct", LOT_LINK: "harbourauto.example/auction/lot/3021", BID: "¥1,850,000"
    };
    return tpl.replace(/\{\{([A-Z_]+)\}\}/g, function (a, k) { return vars[k] != null ? vars[k] : a; });
  }

  function Templates(props) {
    var st = props.st;
    var e = st.editingTemplate;
    if (e) {
      var tpl = st.templates.find(function (x) { return x.id === e.id; });
      var sec = tpl.section.toLowerCase();
      var sample = st.threads.filter(function (t) { return t.section === sec && (sec === "auction" || t.vehicle); }).slice(0, 3);
      if (sample.length < 3) sample = sample.concat(st.threads.filter(function (t) { return t.vehicle && sample.indexOf(t) < 0; }).slice(0, 3 - sample.length));
      return html`<div style="display:grid;gap:12px">
        <div class="field"><label for="tpl-text">${tpl.section}: ${tpl.name}</label><textarea id="tpl-text" style="min-height:140px" value=${e.text} onInput=${function (ev) { A.templateText(ev.currentTarget.value); }}></textarea>
          <span class="note">Words in double braces, such as {{BOOKING_LINK}}, are filled in by code from the records. Keep them, and the facts stay exact.</span></div>
        <h2>How it would read in 3 real conversations</h2>
        <div class="preview3">${sample.map(function (t) { return html`<div class="pv" key=${t.id}><b>${Q.customer(t).name}${Q.vehicle(t) ? " · " + Q.vehicle(t).short : ""}</b>${fillFor(e.text, t)}</div>`; })}</div>
        <div class="card-top"><button class="btn main" onClick=${A.saveTemplate}>Save this version</button><button class="btn" onClick=${function () { A.editTemplate(null); }}>Cancel</button><span class="note">Version ${(tpl.version || 1) + 1}. Every earlier version is kept.</span></div>
      </div>`;
    }
    var groups = ["Dashboard", "Marketplace", "Imports", "Auction"];
    return html`<div style="display:grid;gap:20px">${groups.map(function (g) {
      return html`<section style="display:grid;gap:8px" key=${g}><h2>${g}</h2>${st.templates.filter(function (t) { return t.section === g; }).map(function (t) {
        return html`<div class="card" key=${t.id}><div class="card-top"><span class="grow">${t.name}</span><span class="note">used ${t.uses} times${t.changed ? " · changed " + t.changed : ""}</span><button class="btn small" onClick=${function () { A.editTemplate(t.id); }}>Edit</button></div><div style="white-space:pre-wrap;font-size:var(--fs-13);color:var(--ink-2)">${t.text}</div></div>`;
      })}</section>`;
    })}</div>`;
  }

  function Voice() {
    return html`<div style="display:grid;gap:8px">
      <p class="note" style="margin:0">How every reply sounds. These are your decisions, with their dates.</p>
      ${WN.data.voice.map(function (v, i) { return html`<div class="card" key=${i}><div>${v.rule}</div><div class="meta">Your decision, ${v.date}</div></div>`; })}
    </div>`;
  }

  /* ---------- Sales board ---------- */
  var BOARD = [["enquiry", "Enquiry"], ["booked", "Inspection booked"], ["seen", "Seen the car"], ["deposit", "Deposit paid"], ["sold", "Sold this month"], ["quiet", "Gone quiet"]];
  function Board(props) {
    var deals = WN.data.deals;
    return html`<section class="tile page" aria-label="Sales board"><div class="page-inner">
      <div class="pagehead"><div class="grow"><h1>Sales board</h1><p class="lead">Every open deal, grouped by stage. Stages come from records only: enquiries, bookings, deposits and sales. Nothing is typed in by hand, so it never goes stale.</p></div></div>
      ${BOARD.map(function (g) {
        var rows = deals.filter(function (d) { return d.stage === g[0]; });
        if (!rows.length) return null;
        return html`<section style="display:grid;gap:8px" key=${g[0]}>
          <div class="stagehead"><h2>${g[1]}</h2><span class="note num">${rows.length}</span></div>
          <div class="table-wrap"><table class="grid board"><thead><tr><th>Customer</th><th>Car</th><th>Last contact</th><th>Next step</th><th>Proved by</th></tr></thead><tbody>
            ${rows.map(function (d) {
              var v = d.car ? WN.data.vehicles[d.car] : null;
              return html`<tr class="clickable" key=${d.thread} tabindex="0" onClick=${function () { A.open(d.thread); }} onKeyDown=${function (e) { if (e.key === "Enter") A.open(d.thread); }}>
                <td><b>${WN.data.customers[d.customer].name}</b></td><td>${v ? v.name : d.wants}</td><td>${d.last}</td><td>${d.next}</td><td class="note">${d.proof}</td></tr>`;
            })}
          </tbody></table></div>
        </section>`;
      })}
    </div></section>`;
  }

  /* ---------- This week ---------- */
  function Week() {
    return html`<section class="tile page" aria-label="This week"><div class="page-inner">
      <div class="pagehead"><div class="grow"><h1>This week</h1><p class="lead">An experiment: five plain sentences instead of a dashboard of charts. Keep it only if you would look at it.</p></div></div>
      <ul class="sentences">
        <li>You sent <b>142 replies</b> this week, 31 more than last week.</li>
        <li>Half of new texts were answered within <b>9 minutes</b> during opening hours.</li>
        <li><b>48 of 142</b> replies (34%) went out as Wheelman wrote them, up from 18%.</li>
        <li><b>6 inspections</b> were booked and <b>2 deposits</b> were paid.</li>
        <li>The AI cost about <b>A$4.60</b> this week; the month so far is A$18.40 of A$50.</li>
      </ul>
      <p class="note">Demo figures, invented for this prototype.</p>
    </div></section>`;
  }

  /* ---------- Settings ---------- */
  function Settings(props) {
    var st = props.st;
    var down = st.demo.dashboardDown;
    var src = [
      ["Dealer dashboard", down ? "Not reached since 10:24. Wheelman keeps trying every 3 minutes." : "Last read 10:29 · every 3 minutes", down ? "bad" : ""],
      ["Dashboard alerts", "Last read 10:30 · every 45 seconds", ""],
      ["Facebook engine", "Last read 10:28 · every 3 minutes · the only place Wheelman can send", ""],
      ["Japan auction site", "Read when an import or order needs it · last 10:02", ""],
      ["Import-eligible models", "Read daily · last 6:00 am · 429 models", ""],
      ["Phone add-on", "Running in your Chrome · last seen 30 seconds ago", ""],
      ["Gmail add-on", "Ready · last thread handed in 7:26 am", ""]
    ];
    var themes = [["system", "Follow the computer"], ["light", "Light"], ["dark", "Dark"]];
    return html`<section class="tile page" aria-label="Settings and status"><div class="page-inner">
      <div class="pagehead"><div class="grow"><h1>Settings and status</h1><p class="lead">What Wheelman reads, which AI writes, and how it looks. All simulated in this demo.</p></div></div>
      <section style="display:grid;gap:8px"><h2>Sources</h2><div class="sources">${src.map(function (s) { return html`<div class="source" key=${s[0]}><span class=${"dot " + s[2]}></span><span>${s[0]}<br/><small>${s[1]}</small></span>${s[2] === "bad" ? html`<button class="btn small" onClick=${A.retryDashboard}>Try again</button>` : html`<span></span>`}</div>`; })}</div></section>
      <section style="display:grid;gap:8px"><h2>Which AI writes</h2>
        <div class="table-wrap"><table class="grid"><thead><tr><th>Job</th><th>Provider and model</th><th>Today</th></tr></thead><tbody>
          <tr><td>Dashboard, Imports and Auction replies</td><td>Gemini · 3.8 Flash, then OpenAI as backup</td><td class="num">31 requests</td></tr>
          <tr><td>Marketplace replies</td><td>Gemini · 3.5 Flash Lite (never a paid model unless you tick it)</td><td class="num">6 requests</td></tr>
          <tr><td>Lessons from your instructions</td><td>Gemini · 3.5 Flash Lite</td><td class="num">1 request</td></tr>
        </tbody></table></div>
        <div style="display:grid;gap:6px"><div class="card-top"><span class="grow">This month: <span class="num">A$18.40</span> of <span class="num">A$50</span></span><span class="note">Warning at 80%</span></div><div class="meter"><i style="width:37%"></i></div></div>
      </section>
      <div class="twocol">
        <section style="display:grid;gap:8px"><h2>Business identity</h2>
          <div class="field"><label for="biz">Business name</label><input id="biz" value=${WN.data.dealer.name} disabled/></div>
          <span class="note">Invented for the demo. In the real product this is your business, set once.</span>
          <div class="field"><label>Accent colour</label><div class="swatches">${[["blue", "Blue"], ["teal", "Teal"], ["indigo", "Indigo"]].map(function (a) { return html`<button class=${"swatch sw-" + a[0]} aria-label=${a[1]} aria-pressed=${st.settings.accent === a[0]} onClick=${function () { A.setting({ accent: a[0] }); }}></button>`; })}</div></div>
        </section>
        <section style="display:grid;gap:8px"><h2>Look and layout</h2>
          <div class="field"><label>Theme</label><div class="chips">${themes.map(function (x) { return html`<button class="chip" aria-pressed=${st.settings.theme === x[0]} onClick=${function () { A.setting({ theme: x[0] }); }}>${x[1]}</button>`; })}</div></div>
          <div class="field"><label>Inbox</label><div class="chips"><button class="chip" aria-pressed=${st.demo.inbox === "sections"} onClick=${function () { A.demo({ inbox: "sections" }); }}>Four sections (proposed)</button><button class="chip" aria-pressed=${st.demo.inbox === "one"} onClick=${function () { A.demo({ inbox: "one" }); }}>One list (to try)</button></div></div>
          <div class="field"><label>Keyboard</label><span class="note">/ search · Ctrl+Enter copy the reply · Esc close</span></div>
          <div class="field"><label>Sending</label><span class="note">Texts are copied and pasted into the dashboard. The dashboard has no address for a single conversation, so Wheelman cannot open it there for you.</span></div>
        </section>
      </div>
    </div></section>`;
  }

  WN.views.Playbook = Playbook;
  WN.views.Board = Board;
  WN.views.Week = Week;
  WN.views.Settings = Settings;
})();
