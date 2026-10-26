/* Wheelman prototype — search, demo controls, toast, demo bar. */
(function () {
  var WN = window.WN;
  var U = WN.ui, html = U.html, P = U.P, A = WN.A, Q = WN.Q;
  var useRef = P.useRef, useEffect = P.useEffect;

  function Search(props) {
    var st = props.st, q = (st.search.q || "").trim().toLowerCase();
    var ref = useRef();
    useEffect(function () { if (ref.current) ref.current.focus(); }, []);
    var people = [], cars = [], msgs = [];
    if (q) {
      st.threads.forEach(function (t) {
        var c = Q.customer(t);
        if ((c.name + " " + (c.phone || "") + " " + (c.email || "")).toLowerCase().indexOf(q) >= 0) people.push(t);
        t.messages.forEach(function (m) { if (m.from !== "event" && m.text.toLowerCase().indexOf(q) >= 0 && msgs.length < 6) msgs.push({ t: t, m: m }); });
      });
      Object.keys(WN.data.vehicles).forEach(function (k) {
        var v = WN.data.vehicles[k];
        if ((v.stock + " " + v.name).toLowerCase().indexOf(q) >= 0) cars.push(v);
      });
    }
    var openCar = function (v) {
      var t = st.threads.find(function (x) { return x.vehicle === v.stock; });
      A.search(null);
      if (t) { A.open(t.id); A.panel(true); A.panelTab("car"); }
      else Q.toast("No conversation about the " + v.short + " yet.");
    };
    return html`<div class="scrim" onClick=${function () { A.search(null); }}></div>
      <div class="searchpanel" role="dialog" aria-label="Search">
        <input ref=${ref} id="search" value=${st.search.q} placeholder="Search a name, number, stock number or words in a message" onInput=${function (e) { A.search(e.currentTarget.value); }} autocomplete="off"/>
        <div class="results">
          ${!q ? html`<p class="note" style="margin:8px">Try “Harrier”, “T14”, “0491 570 156” or “deposit”. Search covers every section and every list, so nothing filtered away stays hidden.</p>` : null}
          ${q && !people.length && !cars.length && !msgs.length ? html`<p class="note" style="margin:8px">Nothing matches “${st.search.q}”. Try a stock number such as T14.</p>` : null}
          ${people.length ? html`<h5>Customers</h5>${people.map(function (t) { var c = Q.customer(t); return html`<button key=${"p" + t.id} onClick=${function () { A.search(null); A.open(t.id); }}><span><b>${c.name}</b></span><small>${U.sectionLabel(t.section)} · ${U.CHANNEL[t.channel]}${c.phone ? " · " + c.phone : ""}</small></button>`; })}` : null}
          ${cars.length ? html`<h5>Cars</h5>${cars.map(function (v) { return html`<button key=${v.stock} onClick=${function () { openCar(v); }}><span><b>${v.name}</b></span><small>Stock ${v.stock} · ${WN.engine.money(v.price)} · ${v.status}</small></button>`; })}` : null}
          ${msgs.length ? html`<h5>Messages</h5>${msgs.map(function (x, i) { return html`<button key=${"m" + i} onClick=${function () { A.search(null); A.open(x.t.id); }}><span>${x.m.text.slice(0, 90)}${x.m.text.length > 90 ? "…" : ""}</span><small>${Q.customer(x.t).name} · ${Q.whenLong(x.m.ago)}</small></button>`; })}` : null}
        </div>
      </div>`;
  }

  function Opt(props) {
    return html`<button class="chip" aria-pressed=${!!props.on} onClick=${props.onClick}>${props.children}</button>`;
  }

  function DemoDrawer(props) {
    var st = props.st, dm = st.demo;
    var go = function (fn) { return function () { A.demo({ open: false }); fn(); }; };
    var tasks = [
      ["1. Answer a price enquiry and fill a blank", function () { A.section("dashboard"); A.chip("needs"); A.open("t-daniel"); }],
      ["2. Run through everyone waiting", function () { A.section("dashboard"); A.chip("needs"); A.startRun(); }],
      ["3. Tell Wheelman something, then remember it", function () { A.section("dashboard"); A.open("t-aisha"); }],
      ["4. Send a Marketplace reply", function () { A.section("marketplace"); A.open("f-ethan"); }],
      ["5. Turn a text into an import enquiry", function () { A.section("dashboard"); A.open("t-ryan"); }],
      ["6. Answer a business fact the draft needs", function () { A.section("dashboard"); A.open("t-jack"); }]
    ];
    return html`<div class="scrim" onClick=${function () { A.demo({ open: false }); }}></div>
    <aside class="drawer" role="dialog" aria-label="Demo controls">
      <div class="drawer-head"><h3>Demo controls</h3><button class="btn small quiet" onClick=${function () { A.demo({ open: false }); }} aria-label="Close demo controls"><${U.Icon} name="close"/></button></div>
      <div class="drawer-body">
        <p class="context warn" style="margin:0">Simulated, demo only. Nothing here reaches the dashboard, Facebook, the auction site or any AI. Every customer and car is invented.</p>
        <section><h4 style="margin:0" class="note">Try these six tasks</h4><div style="display:grid;gap:4px">${tasks.map(function (x) { return html`<button class="btn small" style="justify-content:flex-start" key=${x[0]} onClick=${go(x[1])}>${x[0]}</button>`; })}</div></section>
        <section><h4 style="margin:0" class="note">Scenario</h4><div class="optgrid">
          <${Opt} on=${dm.scenario === "busy"} onClick=${function () { A.scenario("busy"); }}>Busy morning<//>
          <${Opt} on=${dm.scenario === "quiet"} onClick=${function () { A.scenario("quiet"); }}>Quiet day<//>
          <${Opt} on=${dm.scenario === "broken"} onClick=${function () { A.scenario("broken"); }}>Everything broken<//>
          <${Opt} on=${dm.scenario === "empty"} onClick=${function () { A.scenario("empty"); }}>Empty inbox<//>
        </div></section>
        <section><h4 style="margin:0" class="note">Make something happen</h4><div style="display:grid;gap:4px">
          <button class="btn small" style="justify-content:flex-start" onClick=${go(A.newMessage)}>A new customer texts about the C-HR</button>
          <button class="btn small" style="justify-content:flex-start" onClick=${go(A.answeredElsewhere)}>A colleague answers Liam from the shop phone</button>
          <button class="btn small" style="justify-content:flex-start" onClick=${function () { A.demo({ dashboardDown: !dm.dashboardDown }); }}>${dm.dashboardDown ? "The dashboard answers again" : "The dashboard stops answering"}</button>
        </div></section>
        <section><h4 style="margin:0" class="note">The next AI request</h4><div class="optgrid">
          <${Opt} on=${!dm.failNext && !dm.aiDown} onClick=${function () { A.demo({ failNext: "", aiDown: false }); }}>Works<//>
          <${Opt} on=${dm.failNext === "ai-timeout"} onClick=${function () { A.demo({ failNext: "ai-timeout" }); }}>Times out<//>
          <${Opt} on=${dm.failNext === "ai-busy"} onClick=${function () { A.demo({ failNext: "ai-busy" }); }}>Busy, then backup<//>
          <${Opt} on=${dm.failNext === "budget"} onClick=${function () { A.demo({ failNext: "budget" }); }}>Budget used up<//>
          <${Opt} on=${dm.failNext === "figure-wrong"} onClick=${function () { A.demo({ failNext: "figure-wrong" }); }}>Types a wrong figure<//>
          <${Opt} on=${dm.failNext === "send-fail"} onClick=${function () { A.demo({ failNext: "send-fail" }); }}>Facebook send fails<//>
        </div><span class="note">Then open a conversation without a draft, or press an “Instead” option.</span></section>
        <section><h4 style="margin:0" class="note">Writing speed</h4><div class="optgrid">
          ${["fast", "normal", "slow"].map(function (s) { return html`<${Opt} key=${s} on=${dm.speed === s} onClick=${function () { A.demo({ speed: s }); }}>${s.charAt(0).toUpperCase() + s.slice(1)}<//>`; })}
        </div></section>
        <section><h4 style="margin:0" class="note">Inbox layout</h4><div class="optgrid">
          <${Opt} on=${dm.inbox === "sections"} onClick=${function () { A.demo({ inbox: "sections" }); }}>Four sections<//>
          <${Opt} on=${dm.inbox === "one"} onClick=${function () { A.demo({ inbox: "one" }); }}>Everything in one list<//>
        </div></section>
        <section><h4 style="margin:0" class="note">Theme</h4><div class="optgrid">
          ${[["system", "Follow the computer"], ["light", "Light"], ["dark", "Dark"]].map(function (x) { return html`<${Opt} key=${x[0]} on=${st.settings.theme === x[0]} onClick=${function () { A.setting({ theme: x[0] }); }}>${x[1]}<//>`; })}
        </div></section>
        <section><button class="btn" onClick=${function () { A.scenario("busy"); }}>Start the demo again</button></section>
      </div>
    </aside>`;
  }

  function Toast(props) {
    var t = props.st.toast;
    if (!t) return null;
    return html`<div class=${"toast" + (t.kind === "bad" ? " bad" : "")} role="status" aria-live="polite">
      <span>${t.text}</span>
      ${t.action ? html`<button class="btn small" onClick=${function () { A.toastAction(t.action.fn); }}>${t.action.label}</button>` : null}
      ${t.hasUndo ? html`<button class="btn small" onClick=${A.undo}>Undo</button>` : null}
    </div>`;
  }

  function DemoBar(props) {
    return html`<footer class="demobar">
      <span class="tag">Demo</span><span class="long">Invented data. Nothing is sent and nothing connects to live systems.</span><span class="short">Invented data, nothing is sent</span>
      <span class="grow"></span>
      <span class="long note">Prototype of the new Wheelman, 24 Oct 2026</span>
      <button class="btn small" onClick=${function () { A.demo({ open: true }); }}>Demo controls</button>
    </footer>`;
  }

  WN.views.Search = Search;
  WN.views.DemoDrawer = DemoDrawer;
  WN.views.Toast = Toast;
  WN.views.DemoBar = DemoBar;
})();
