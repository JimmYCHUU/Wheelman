/* Wheelman prototype — top bar and list column. */
(function () {
  var WN = window.WN;
  var U = WN.ui, html = U.html, A = WN.A, Q = WN.Q, E = WN.engine;

  function statusOf(st) {
    if (st.demo.dashboardDown) return { tone: "bad", words: "Dashboard not reached since 10:24" };
    var writing = Object.keys(st.drafts).some(function (k) { var d = st.drafts[k]; return d.status === "thinking" || d.status === "writing"; });
    if (writing) return { tone: "writing", words: "Writing a reply" };
    if (st.demo.aiDown) return { tone: "warn", words: "AI not answering: using your wording" };
    return { tone: "", words: "Up to date · checked 1 min ago" };
  }

  function TopBar(props) {
    var st = props.st;
    var status = statusOf(st);
    var one = st.demo.inbox === "one";
    var proposed = st.lessons.filter(function (l) { return l.status === "proposed"; }).length;
    return html`<header class="tile topbar" role="banner">
      <button class="brand" onClick=${function () { A.section(st.section); }} aria-label="Wheelman, back to the inbox">
        <span class="brand-disc"><${U.Wheel}/></span>
        <span class="brand-word">WHEELMAN</span>
        <span class="brand-by">for ${WN.data.dealer.name}</span>
      </button>
      <nav class="tabs" aria-label="Sections">
        <div class="tab-track" role="tablist">
          ${one
            ? html`<button class="tab" role="tab" aria-selected=${st.screen === "inbox"} onClick=${function () { A.screen("inbox"); }}>Everything waiting</button>`
            : U.SECTIONS.map(function (s) {
              var c = Q.counts(st, s.id);
              return html`<button class="tab" role="tab" aria-selected=${st.screen === "inbox" && st.section === s.id} onClick=${function () { A.section(s.id); }}>
                ${s.label}${c.unread ? html`<span class="badge" aria-label=${c.unread + " unread"}>${c.unread}</span>` : null}
              </button>`;
            })}
        </div>
      </nav>
      <button class="searchbox" onClick=${function () { A.search(""); }} aria-label="Search customers, cars and messages">
        <${U.Icon} name="search"/><span class="label">Search customers, cars</span><kbd>/</kbd>
      </button>
      <button class="status" onClick=${function () { A.screen("settings"); }} aria-label=${"Status: " + status.words + ". Open settings and status."}>
        <span class=${"dot " + status.tone}></span><span class="words">${status.words}</span>
      </button>
      <button class="btn quiet menu-btn" aria-haspopup="true" aria-expanded=${st.menu === "main"} onClick=${function (e) { WN.popAt = e.currentTarget.getBoundingClientRect(); A.menu("main"); }}>
        Menu <${U.Icon} name="down" size="14"/>
      </button>
      ${st.menu === "main" ? html`<${MainMenu} proposed=${proposed}/>` : null}
    </header>`;
  }

  function MainMenu(props) {
    var r = WN.popAt || { right: window.innerWidth - 16, bottom: 60 };
    var style = "top:" + (r.bottom + 6) + "px;right:" + Math.max(16, window.innerWidth - r.right) + "px";
    return html`<div class="scrim" style="background:transparent" onClick=${function () { A.menu(null); }}></div>
    <div class="pop" role="menu" style=${style}>
      <button role="menuitem" onClick=${function () { A.screen("playbook"); }}><span>Playbook<small>Templates, facts, lessons and voice${props.proposed ? " · " + props.proposed + " lessons to review" : ""}</small></span></button>
      <button role="menuitem" onClick=${function () { A.screen("board"); }}><span>Sales board<small>Every open deal, by stage</small></span></button>
      <button role="menuitem" onClick=${function () { A.screen("week"); }}><span>This week<small>Five sentences (experiment)</small></span></button>
      <hr/>
      <button role="menuitem" onClick=${function () { A.screen("settings"); }}><span>Settings and status<small>Identity, AI, sources, theme</small></span></button>
    </div>`;
  }

  function reasonFor(st, t) {
    var d = st.drafts[t.id];
    if (t.state === "dismissed") return { text: "Dismissed", tone: "" };
    if (t.answeredBy && t.state !== "waiting") return { text: t.answeredBy, tone: "" };
    if (t.state === "auto") return { text: "Auto-reply answered", tone: "" };
    if (t.state === "done") { var c = d && d.copied; return { text: c ? (c.sent ? "Sent " : "Copied ") + c.at : "Done", tone: "good" }; }
    if (t.followUp && st.chips.dashboard === "followups" && st.section === "dashboard") return { text: t.followUp.reason, tone: "info" };
    if (t.order && t.order.due && t.state !== "done") return { text: "Due: " + t.order.due, tone: "info" };
    if (t.handedOver && t.state === "waiting") return { text: "Needs you", tone: "info" };
    if (d && (d.status === "thinking" || d.status === "writing")) return { text: "Writing…", tone: "" };
    if (d && d.status === "ready" && t.state === "waiting") {
      var ck = E.check(d, { vehicle: Q.vehicle(t) });
      if (ck.fails.length) return { text: "Check failed", tone: "bad" };
      if (ck.needs) return { text: "Needs a fact from you", tone: "warn" };
      if (ck.blanks) return { text: ck.blanks === 1 ? "Blank to fill" : ck.blanks + " blanks to fill", tone: "warn" };
    }
    if (t.followUp && t.state !== "done") return { text: "Follow-up: " + t.followUp.reason, tone: "" };
    return null;
  }

  function preview(t) {
    var ms = t.messages.filter(function (m) { return m.from !== "event"; });
    var m = ms[ms.length - 1] || t.messages[t.messages.length - 1];
    var who = m.from === "us" ? (m.by && m.by.indexOf("colleague") >= 0 ? "Colleague: " : "You: ") : m.from === "auto" ? "Auto-reply: " : "";
    return who + m.text.replace(/\s+/g, " ");
  }

  function Row(props) {
    var t = props.t, st = props.st;
    var c = Q.customer(t), v = Q.vehicle(t);
    var r = reasonFor(st, t);
    var one = st.demo.inbox === "one";
    var carLine = (one ? U.sectionLabel(t.section) + " · " : "") + (v ? v.name : t.order ? "Order " + t.order.no + ": " + t.order.wants.split(",")[0] : t.wants ? "Wants: " + t.wants.split(",")[0] : t.source);
    return html`<button class=${"row" + (t.unread ? " unread" : "")} aria-current=${st.open === t.id} onClick=${function () { A.open(t.id); }}>
      <${U.Avatar} name=${c.name}/>
      <span style="min-width:0;display:grid;gap:1px">
        <span class="who"><span>${c.name}</span><span class="channel">${U.CHANNEL[t.channel]}</span></span>
        <span class="car">${carLine}</span>
        <span class="sub">${preview(t)}</span>
        ${r ? html`<span><span class=${"reason " + r.tone}>${r.text}</span></span>` : null}
      </span>
      <span class="meta"><span class="num">${Q.whenShort(Q.lastAgo(t))}</span>${t.unread ? html`<span class="badge" aria-label=${t.unread + " unread messages"}>${t.unread}</span>` : null}</span>
    </button>`;
  }

  function Skeleton() {
    var rows = [0, 1, 2, 3, 4, 5];
    return html`<div aria-label="Loading conversations">${rows.map(function (i) { return html`<div class="skel" key=${i}><i class="round"></i><span class="lines"><i style=${"width:" + (60 + (i * 7) % 30) + "%"}></i><i style=${"width:" + (35 + (i * 11) % 40) + "%"}></i></span></div>`; })}</div>`;
  }

  function ListColumn(props) {
    var st = props.st;
    var sec = st.section;
    var chip = st.chips[sec];
    var one = st.demo.inbox === "one";
    if (one && chip === "followups") chip = "needs";
    var rows = Q.listFor(st, sec, chip);
    var c = Q.counts(st, sec);
    var allCount = one ? st.threads.length : c.all;
    var needsCount = one ? st.threads.filter(Q.isWaiting).length : c.needs;
    var chips = sec === "auction" && !one
      ? [["todo", "To do", c.todo], ["progress", "In progress", null], ["done", "Finished", null]]
      : [["needs", "Needs reply", needsCount]].concat(sec === "dashboard" && !one ? [["followups", "Follow-ups", c.followups]] : []).concat([["all", "All", null]]);
    var showRun = (chip === "needs" || chip === "todo") && rows.length > 0 && !st.run && chip !== "todo";
    var oldest = rows.length ? Math.max.apply(null, rows.map(function (t) { return Q.agoNow(Q.lastCustomerAgo(t)); })) : 0;
    var down = st.demo.dashboardDown && (sec === "dashboard" || sec === "auction" || one);
    return html`<section class="tile list" aria-label="Conversations">
      <div class="list-head">
        ${one ? html`<div style="font-weight:700">Everything waiting <span class="note">(trial view: all sections in one list)</span></div>` : null}
        <div class="chips" role="group" aria-label="Filter">
          ${chips.map(function (ch) {
            return html`<button class="chip" aria-pressed=${chip === ch[0]} onClick=${function () { A.chip(ch[0]); }}>${ch[1]}${ch[2] != null ? html`<span class="count">${ch[2]}</span>` : null}</button>`;
          })}
        </div>
      </div>
      ${down ? html`<div class="problem" role="alert"><span><strong>The dashboard has not answered since 10:24.</strong> You are seeing what was read before. Nothing is lost, and Wheelman keeps trying every 3 minutes.</span><button class="btn small" onClick=${A.retryDashboard}>Try again now</button></div>` : null}
      ${showRun ? html`<div class="run-start"><span style="display:grid;line-height:1.3"><b class="num">${rows.length} waiting</b><span class="num">oldest ${fmtWait(oldest)}</span></span><button class="btn main small" onClick=${A.startRun}><${U.Icon} name="play" size="12"/> Start replying</button></div>` : null}
      <div class="rows">
        ${!st.booted ? html`<${Skeleton}/>` : rows.length ? rows.map(function (t) { return html`<${Row} key=${t.id} t=${t} st=${st}/>`; }) : html`<${EmptyList} chip=${chip} sec=${sec}/>`}
      </div>
      ${st.booted ? html`<div class="list-foot">${sec === "auction" && !one ? "39 orders read from the dashboard; 4 shown in this demo" : "All " + allCount + " conversations kept, newest first"}</div>` : null}
    </section>`;
  }

  function fmtWait(min) {
    min = Math.round(min);
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  function EmptyList(props) {
    if (props.chip === "needs") return html`<div class="empty"><h3>No one is waiting</h3><p>Every customer in this section has an answer. New messages appear here with a blue number.</p><button class="btn small" onClick=${function () { A.chip("all"); }}>Show all conversations</button></div>`;
    if (props.chip === "followups") return html`<div class="empty"><h3>No follow-ups due</h3><p>A follow-up appears when an inspection has passed, a customer has gone quiet, a car's price drops, or a visit is tomorrow.</p></div>`;
    if (props.chip === "todo") return html`<div class="empty"><h3>Nothing to send</h3><p>No auction order has a message due.</p></div>`;
    return html`<div class="empty"><h3>Nothing here yet</h3></div>`;
  }

  WN.views = WN.views || {};
  WN.views.TopBar = TopBar;
  WN.views.ListColumn = ListColumn;
  WN.views.fmtWait = fmtWait;
  WN.views.statusOf = statusOf;
})();
