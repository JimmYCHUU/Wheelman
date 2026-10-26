/* Wheelman prototype — the deal panel beside the conversation. */
(function () {
  var WN = window.WN;
  var U = WN.ui, html = U.html, A = WN.A, Q = WN.Q, E = WN.engine;

  var STAGES = [["enquiry", "Enquiry"], ["booked", "Inspection booked"], ["seen", "Seen the car"], ["deposit", "Deposit paid"], ["sold", "Sold"]];

  function Panel(props) {
    var st = props.st;
    var t = st.open ? Q.thread(st.open) : null;
    var cls = "tile panel" + (st.panelOpen ? "" : " closed");
    if (!t) {
      if (window.innerWidth < 1280) return null;
      return html`<aside class=${cls} aria-label="Details"><div class="empty" style="margin:auto"><h3>Car and customer</h3><p>Open a conversation to see the car, the customer and what Wheelman used for the reply.</p></div></aside>`;
    }
    var v = Q.vehicle(t), d = st.drafts[t.id];
    var tabs = [["car", v ? "Car" : t.order ? "Order" : "Asked for"], ["customer", "Customer"], ["used", "What Wheelman used"]];
    return html`<aside class=${cls} aria-label="Car and customer">
      <div class="panel-head">
        <div class="seg-ctl" role="tablist">${tabs.map(function (x) { return html`<button role="tab" aria-selected=${st.panelTab === x[0]} onClick=${function () { A.panelTab(x[0]); }}>${x[1]}</button>`; })}</div>
        <button class="btn small quiet" onClick=${function () { A.panel(false); }} aria-label="Close details"><${U.Icon} name="close"/></button>
      </div>
      <div class="panel-body">
        ${st.panelTab === "car" ? (v ? html`<${CarTab} v=${v} d=${d}/>` : html`<${WantsTab} t=${t} d=${d}/>`) : null}
        ${st.panelTab === "customer" ? html`<${CustomerTab} t=${t} st=${st}/>` : null}
        ${st.panelTab === "used" ? html`<${UsedTab} t=${t} d=${d} st=${st}/>` : null}
      </div>
    </aside>`;
  }

  function CarTab(props) {
    var v = props.v;
    var site = WN.data.dealer.site + "/cars/" + v.stock;
    var shots = ["Front", "Rear", "Side", "Interior", "Odometer", "Boot"];
    var media = [];
    if (v.videos) media.push({ label: "Walkaround video", sub: "1 min 42 s, with voice-over", url: site + "/video" });
    var docs = [{ label: "Auction sheet", sub: "Grade " + v.grade + ", condition notes", url: site + "/auction-sheet" }, { label: "Export certificate", sub: "PDF", url: site + "/export-certificate" }];
    return html`<div style="display:grid;gap:16px">
      <div class="hero"><${U.CarPhoto} label=${v.short}/><span class="count num">${v.photos} photos</span></div>
      <dl class="kv">
        <dt>Price</dt><dd>${E.money(v.price)}${v.wasPrice ? html` <span class="note">was ${E.money(v.wasPrice)}</span>` : null}</dd>
        <dt>Kilometres</dt><dd>${E.km(v.km)}</dd>
        <dt>Auction grade</dt><dd>${v.grade}</dd>
        <dt>Colour</dt><dd>${v.colour}</dd>
        <dt>Availability</dt><dd>${v.status}</dd>
        <dt>Stock number</dt><dd>${v.stock}</dd>
      </dl>
      <section><h4>Included</h4><ul class="included">${v.included.map(function (x) { return html`<li>${x}</li>`; })}</ul></section>
      <section><h4>Photos</h4>
        <div class="photos">${shots.map(function (s) { return html`<div class="ph" key=${s}><${U.CarPhoto} w="1" h="1"/><span>${s}</span></div>`; })}</div>
        <div class="note" style="margin-top:6px">Demo pictures. The real panel shows the car's own photos and auction photos.</div>
      </section>
      ${media.length ? html`<section><h4>Videos</h4><div class="items">${media.map(function (m) { return html`<${Item} m=${m}/>`; })}</div></section>` : null}
      <section><h4>Documents</h4><div class="items">${docs.map(function (m) { return html`<${Item} m=${m}/>`; })}</div>
        <div class="note" style="margin-top:6px">Inspection sheets, invoices, signed forms and our costs are never read or shown.</div></section>
    </div>`;
  }

  function Item(props) {
    var m = props.m;
    return html`<div class="item"><span class="grow">${m.label}<small>${m.sub}</small></span>
      <button class="btn small quiet" onClick=${function () { WN.copyPlain(m.url); Q.toast(m.label + " link copied"); }}>Copy link</button>
      <button class="btn small" onClick=${function () { A.addLink(m.label, m.url); }}>Add to reply</button></div>`;
  }

  function WantsTab(props) {
    var t = props.t, d = props.d;
    var r = d && d.research;
    return html`<div style="display:grid;gap:16px">
      ${t.order ? html`<${OrderStages} t=${t}/>` : null}
      <section><h4>${t.order ? "Order " + t.order.no : "What they asked for"}</h4>
        <p style="margin:0">${t.order ? t.order.wants : t.wants || "No car named yet."}</p>
        ${t.order ? html`<p class="note" style="margin:6px 0 0">${t.order.charged}. Our own costs are never kept.</p>` : null}
      </section>
      ${r && r.bid ? html`<${BidCalc} lot=${r.lot} b=${r.bid}/>` : null}
      ${r && r.landed ? html`<section><h4>Landed cost estimate</h4><table class="calc"><tbody>${r.landed.lines.map(function (l, i) { return html`<tr key=${i}><td>${l[0]}</td><td>${E.aud(l[1])}</td></tr>`; })}<tr class="total"><td>Estimated landed total</td><td>${E.aud(r.landed.total)}</td></tr></tbody></table><p class="note">Demo figures. The real numbers come from the website's cost calculator.</p></section>` : null}
      ${!r && t.type === "stock" && t.wants ? html`<p class="context warn" style="margin:0">Read as a stock enquiry. If this is a car to bring in from Japan, change the type to Import enquiry and the reply becomes an import answer.</p>` : null}
    </div>`;
  }

  function BidCalc(props) {
    var lot = props.lot, b = props.b;
    return html`<section><h4>Suggested bid for ${lot.id}</h4>
      <p class="note" style="margin:0 0 6px">${lot.year} ${lot.model}, grade ${lot.grade}, ${E.km(lot.km)}, ${lot.house}, ${lot.date}</p>
      <table class="calc"><tbody>
        ${b.pool.map(function (s, i) { return html`<tr key=${i}><td>Sold ${s.when}: grade ${s.grade}, ${E.km(s.km)}</td><td>${E.yen(s.price)}</td></tr>`; })}
        <tr><td>Average of these 3</td><td>${E.yen(b.avg)}</td></tr>
        <tr><td>Rounded up to the next ¥50,000</td><td>${E.yen(b.fromSold)}</td></tr>
        <tr><td>The site's suggested bid</td><td>${E.yen(b.siteBid)}</td></tr>
        <tr class="total"><td>Our suggested bid</td><td>${E.yen(b.bid)}</td></tr>
      </tbody></table>
      <p class="note">${b.usedSite ? "Similar cars sold for less, so the site's bid rounded up is used: never below the site's bid." : "Above the site's suggested bid, so the sold-price average stands."} Your rule, 5 Oct 2026.</p>
    </section>`;
  }

  function OrderStages(props) {
    var o = props.t.order;
    return html`<section><h4>Where the order is</h4><ol class="stages">${WN.data.orderStages.map(function (s, i) {
      var cls = i < o.stage ? "done" : i === o.stage ? "now" : "";
      return html`<li class=${cls} key=${i}><span class="mark"></span><span>${s}${i === o.stage && o.due ? html`<small>Due now: ${o.due}</small>` : null}</span></li>`;
    })}</ol></section>`;
  }

  function CustomerTab(props) {
    var t = props.t, c = Q.customer(t);
    var deal = WN.data.deals.find(function (x) { return x.thread === t.id; });
    var at = deal ? STAGES.findIndex(function (s) { return s[0] === deal.stage; }) : 0;
    var quiet = deal && deal.stage === "quiet";
    if (quiet) at = 0;
    return html`<div style="display:grid;gap:16px">
      <dl class="kv">
        <dt>Name</dt><dd>${c.name}</dd>
        ${c.phone ? html`<dt>Number</dt><dd>${c.phone}</dd>` : null}
        ${c.email ? html`<dt>Email</dt><dd style="overflow-wrap:anywhere">${c.email}</dd>` : null}
        <dt>Came from</dt><dd>${c.from}</dd>
        <dt>Writes by</dt><dd>${U.CHANNEL[t.channel]}</dd>
      </dl>
      ${t.alsoOn ? html`<p class="context info" style="margin:0">${t.alsoOn}. Same customer, matched by the number.</p>` : null}
      ${t.order ? null : html`<section><h4>Where the deal is</h4>
        <ol class="stages">${STAGES.map(function (s, i) {
          var cls = i < at ? "done" : i === at ? "now" : "";
          return html`<li class=${cls} key=${s[0]}><span class="mark"></span><span>${s[1]}${i === at && deal ? html`<small>${deal.proof}</small>` : null}</span></li>`;
        })}</ol>
        ${quiet ? html`<p class="note">Gone quiet: ${deal.proof}.</p>` : null}
        <p class="note">Stages come from records (bookings, deposits, sales), never typed in.</p>
      </section>`}
      ${t.insider && t.insider.length ? html`<section><h4>Shaped the reply, never stated</h4><div class="insider">${t.insider.map(function (x) { return html`<span key=${x}>${x}</span>`; })}</div></section>` : null}
    </div>`;
  }

  function UsedTab(props) {
    var t = props.t, d = props.d, st = props.st;
    if (!d) return html`<p class="note">No reply written yet for this conversation.</p>`;
    var lessons = (d.lessonsUsed || []).map(function (id) { return st.lessons.find(function (l) { return l.id === id; }); }).filter(Boolean);
    var cost = d.tokens ? "about " + d.tokens.toLocaleString("en-AU") + " tokens in, about A$0." + String(Math.max(1, Math.round(d.tokens / 900))).padStart(3, "0") : "no AI request";
    return html`<div style="display:grid;gap:16px">
      <section><h4>Facts and where they came from</h4><ul class="usedlist">${d.facts.length ? d.facts.map(function (f, i) { return html`<li key=${i}>${f.label}: <b>${f.value || "needs your answer"}</b><small>${f.src}</small></li>`; }) : html`<li>No figures or links used.</li>`}</ul></section>
      <section><h4>Rules that shaped it</h4><ul class="usedlist">${(d.rules || []).map(function (r, i) { return html`<li key=${i}>${r.text}<small>${r.date}</small></li>`; })}</ul></section>
      <section><h4>Lessons applied</h4><ul class="usedlist">${lessons.length ? lessons.map(function (l) { return html`<li key=${l.id}>${l.text}<small>${l.origin}</small></li>`; }) : html`<li class="note">None for this reply.</li>`}</ul>
        <button class="linkbtn" onClick=${function () { A.screen("playbook", "lessons"); }}>See every lesson in Playbook</button></section>
      <section><h4>Who wrote it</h4><p style="margin:0">${d.model}</p><p class="note" style="margin:2px 0 0">${cost} (simulated). Customer names and numbers are removed before the AI sees anything.</p></section>
    </div>`;
  }

  WN.views.Panel = Panel;
})();
