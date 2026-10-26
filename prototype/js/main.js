/* Wheelman prototype — the app shell, keyboard and start-up. */
(function () {
  var WN = window.WN;
  var U = WN.ui, html = U.html, P = U.P, A = WN.A, Q = WN.Q, V = WN.views;

  function applyLook(st) {
    var root = document.documentElement;
    if (st.settings.theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", st.settings.theme);
    if (st.settings.accent === "blue") root.removeAttribute("data-accent"); else root.setAttribute("data-accent", st.settings.accent);
    var unread = st.threads.reduce(function (n, t) { return n + (t.unread ? 1 : 0); }, 0);
    document.title = (unread ? "(" + unread + ") " : "") + "Wheelman prototype";
  }

  function App(props) {
    var st = props.st;
    applyLook(st);
    var wide = window.innerWidth >= 1280;
    var inChat = st.screen === "inbox" && st.open && st.view !== "list";
    var page = st.screen === "playbook" ? html`<${V.Playbook} st=${st}/>` : st.screen === "board" ? html`<${V.Board} st=${st}/>` : st.screen === "week" ? html`<${V.Week}/>` : st.screen === "settings" ? html`<${V.Settings} st=${st}/>` : null;
    var showPanel = st.panelOpen && (wide || st.open);
    return html`<div class=${"shell" + (inChat ? " in-chat" : "")}>
      <${V.TopBar} st=${st}/>
      ${page
        ? html`<main style="min-height:0;display:grid">${page}</main>`
        : html`<main class=${"work" + (showPanel && wide ? "" : " no-panel")} data-view=${st.open ? (st.view === "list" ? "list" : st.view) : "list"}>
            <${V.ListColumn} st=${st}/>
            <${V.Chat} st=${st}/>
            ${showPanel && !wide ? html`<div class="scrim" onClick=${function () { A.panel(false); }}></div>` : null}
            ${showPanel ? html`<${V.Panel} st=${st}/>` : null}
          </main>`}
      <${V.DemoBar} st=${st}/>
      ${st.search ? html`<${V.Search} st=${st}/>` : null}
      ${st.demo.open ? html`<${V.DemoDrawer} st=${st}/>` : null}
      <${V.Toast} st=${st}/>
    </div>`;
  }

  var root = document.getElementById("app");
  function draw() { P.render(html`<${App} st=${WN.S.state}/>`, root); }
  WN.S.sub(draw);
  var resizeQueued = false;
  window.addEventListener("resize", function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () { resizeQueued = false; draw(); });
  });
  if (window.matchMedia) {
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw); } catch (e) { /* older browsers */ }
  }

  document.addEventListener("keydown", function (e) {
    var st = WN.S.state;
    var typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === "/" && !typing) { e.preventDefault(); A.search(""); return; }
    if (e.key === "Escape") {
      if (st.search) { A.search(null); return; }
      if (st.demo.open) { A.demo({ open: false }); return; }
      if (st.menu) { A.menu(null); return; }
      if (st.panelOpen && window.innerWidth < 1280) { A.panel(false); return; }
      if (st.open && window.innerWidth < 900) { A.back(); return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && st.open) {
      var t = Q.thread(st.open), d = st.drafts[st.open];
      if (!t || !d || d.status !== "ready" || t.state === "done") return;
      var ck = WN.engine.check(d, { vehicle: Q.vehicle(t) });
      if (ck.fails.length || t.channel === "facebook") return;
      e.preventDefault();
      A.copy({ withBlanks: ck.blanks > 0 });
    }
  });

  draw();
  A.boot();
})();
