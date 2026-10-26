/* Wheelman prototype — conversation and message box. */
(function () {
  var WN = window.WN;
  var U = WN.ui, html = U.html, P = U.P, A = WN.A, Q = WN.Q, E = WN.engine;
  var useRef = P.useRef, useLayoutEffect = P.useLayoutEffect, useState = P.useState, useEffect = P.useEffect;

  /* ---------- the conversation ---------- */
  function Chat(props) {
    var st = props.st;
    var t = st.open ? Q.thread(st.open) : null;
    if (st.run && st.run.finished) return html`<section class="tile chat"><${RunDone} st=${st}/></section>`;
    if (!t) return html`<section class="tile chat"><${NoThread} st=${st}/></section>`;
    var c = Q.customer(t), v = Q.vehicle(t);
    return html`<section class="tile chat" aria-label=${"Conversation with " + c.name}>
      <${ChatHead} st=${st} t=${t} c=${c}/>
      ${st.run && !st.run.finished ? html`<div class="runbar" role="status"><span class="grow">Reply run · <span class="num">${st.run.i + 1} of ${st.run.queue.length}</span></span><button class="btn small quiet" onClick=${A.skip}>Skip</button><button class="btn small quiet" onClick=${A.endRun}>End run</button></div>` : null}
      <${CarStrip} t=${t} v=${v}/>
      <${Thread} t=${t} key=${t.id}/>
      <${Composer} st=${st} t=${t} key=${"c-" + t.id}/>
    </section>`;
  }

  function NoThread(props) {
    var st = props.st;
    var rows = Q.listFor(st, st.section, "needs");
    return html`<div class="empty" style="margin:auto">
      ${rows.length
        ? html`<h3>${rows.length} waiting in ${U.sectionLabel(st.section)}</h3><p>Pick a conversation, or go through everyone waiting, oldest first. Copy moves you to the next one.</p><button class="btn main" onClick=${A.startRun}><${U.Icon} name="play" size="12"/> Start replying</button>`
        : html`<h3>No one is waiting in ${U.sectionLabel(st.section)}</h3><p>Pick any conversation from the list to read it.</p>`}
    </div>`;
  }

  function RunDone(props) {
    var r = props.st.run;
    return html`<div class="empty" style="margin:auto">
      <h3>All answered</h3>
      <p><span class="num">${r.done}</span> ${r.done === 1 ? "reply" : "replies"} in this run. The oldest had waited <span class="num">${WN.views.fmtWait(r.oldest)}</span>.</p>
      <button class="btn main" onClick=${A.endRun}>Back to the list</button>
    </div>`;
  }

  function ChatHead(props) {
    var st = props.st, t = props.t, c = props.c;
    var typeLabel = t.type === "import" ? "Import enquiry" : t.type === "order" ? "Auction order" : t.type === "buyer" ? "Buyer" : "Stock enquiry";
    var canType = t.section === "dashboard" || t.section === "imports";
    var line2 = [U.CHANNEL[t.channel], t.source, c.phone || c.email].filter(Boolean).join(" · ");
    return html`<div class="chat-head">
      <button class="btn quiet small back" onClick=${A.back} aria-label="Back to the list"><${U.Icon} name="back"/> List</button>
      <${U.Avatar} name=${c.name}/>
      <div class="title"><div class="name">${c.name}</div><div class="line2">${line2}</div></div>
      ${canType ? html`<button class="btn small type-btn" aria-haspopup="true" aria-expanded=${st.menu === "type"} onClick=${function (e) { WN.popAt = e.currentTarget.getBoundingClientRect(); A.menu("type"); }}>${typeLabel} <${U.Icon} name="down" size="14"/></button>` : html`<span class="reason type-btn">${typeLabel}</span>`}
      <button class="btn small quiet" aria-haspopup="true" aria-expanded=${st.menu === "more"} onClick=${function (e) { WN.popAt = e.currentTarget.getBoundingClientRect(); A.menu("more"); }}>More <${U.Icon} name="down" size="14"/></button>
      <button class="btn small quiet details-btn" aria-pressed=${st.panelOpen} onClick=${function () { A.panel(); }}><${U.Icon} name="panel"/> Details</button>
      ${st.menu === "type" ? html`<${TypeMenu} t=${t}/>` : null}
      ${st.menu === "more" ? html`<${MoreMenu} t=${t} c=${c}/>` : null}
    </div>`;
  }

  function popStyle() {
    var r = WN.popAt || { right: window.innerWidth - 16, bottom: 120, left: 16 };
    return "top:" + (r.bottom + 6) + "px;right:" + Math.max(16, window.innerWidth - r.right) + "px";
  }
  function TypeMenu(props) {
    var t = props.t;
    var opt = function (id, label, sub) {
      return html`<button role="menuitemradio" aria-checked=${t.type === id} onClick=${function () { A.setType(id); }}><span class=${t.type === id ? "sel" : ""}>${label}<small>${sub}</small></span></button>`;
    };
    return html`<div class="scrim" style="background:transparent" onClick=${function () { A.menu(null); }}></div>
      <div class="pop" role="menu" style=${popStyle()}>
        ${opt("stock", "Stock enquiry", "Answered from the cars we have · Dashboard")}
        ${opt("import", "Import enquiry", "Answered with eligibility, landed cost and the deposit · Imports")}
        <hr/>
        ${opt("notcustomer", "Not a customer", "Dismissed, with Undo; stays under All")}
      </div>`;
  }
  function MoreMenu(props) {
    var t = props.t, c = props.c;
    return html`<div class="scrim" style="background:transparent" onClick=${function () { A.menu(null); }}></div>
      <div class="pop" role="menu" style=${popStyle()}>
        <button role="menuitem" class="phone-only" onClick=${function () { A.menu(null); A.panel(true); }}><span>Car and customer<small>Photos, documents, the deal and what Wheelman used</small></span></button>
        ${t.section === "dashboard" || t.section === "imports" ? html`<button role="menuitem" class="phone-only" onClick=${function () { A.menu("type"); }}><span>Change the enquiry type<small>Now: ${t.type === "import" ? "Import enquiry" : "Stock enquiry"}</small></span></button>` : null}
        <button role="menuitem" onClick=${A.dismiss}><span>Dismiss<small>No reply needed. Undo for 9 seconds; stays under All.</small></span></button>
        ${c.phone ? html`<button role="menuitem" onClick=${function () { A.menu(null); WN.copyPlain(c.phone); Q.toast("Number copied: " + c.phone); }}><span>Copy number<small>${c.phone}</small></span></button>` : null}
      </div>`;
  }

  function CarStrip(props) {
    var t = props.t, v = props.v;
    if (!v) {
      var line = t.order ? "Order " + t.order.no + " · " + t.order.wants : t.wants ? "Asked for: " + t.wants : "No car named";
      return html`<div class="carstrip"><div class="info"><div class="facts">${line}</div></div></div>`;
    }
    return html`<div class="carstrip">
      <button class="thumb" style="padding:0;border:0" onClick=${function () { A.panel(true); A.panelTab("car"); }} aria-label="Show the car's photos"><${U.CarPhoto} w="52" h="36"/></button>
      <div class="info">
        <div><b>${v.name}</b> <span class="note">Stock ${v.stock}</span></div>
        <div class="facts num">${E.money(v.price)} · ${E.km(v.km)} · grade ${v.grade} · ${v.status}</div>
      </div>
      <button class="btn small quiet" onClick=${function () { A.panel(true); A.panelTab("car"); }}>${v.photos} photos${v.videos ? " · " + v.videos + (v.videos === 1 ? " video" : " videos") : ""}</button>
    </div>`;
  }

  function Thread(props) {
    var t = props.t;
    var ref = useRef();
    useEffect(function () { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [t.messages.length]);
    var out = [], lastDay = null;
    var ms = t.messages.slice().sort(function (a, b) { return b.ago - a.ago; });
    ms.forEach(function (m, i) {
      var day = Q.dayLabel(m.ago);
      if (day !== lastDay) { out.push(html`<div class="day" key=${"d" + i}>${day}</div>`); lastDay = day; }
      if (m.from === "event") { out.push(html`<div class=${"event" + (m.good ? " good" : "")} key=${i}>${m.text}${m.good ? "" : " · " + Q.whenLong(m.ago)}</div>`); return; }
      var cls = m.from === "them" ? "them" : m.from === "auto" ? "auto" : "us";
      var by = m.from === "them" ? Q.whenLong(m.ago) : (m.by || "Us") + " · " + Q.whenLong(m.ago);
      out.push(html`<div class=${"bubble " + cls} key=${i}>${m.text}<span class="by">${by}</span></div>`);
    });
    return html`<div class="thread" ref=${ref} aria-live="polite">${out}</div>`;
  }

  /* ---------- the message box ---------- */
  function Composer(props) {
    var st = props.st, t = props.t;
    var d = st.drafts[t.id];
    var sending = st.sending[t.id];
    var section = U.sectionLabel(t.section);

    if (t.state === "done" && d && d.copied) {
      var c = d.copied;
      var learn = c.sent ? "Sent on Facebook at " + c.at + " (simulated). Marketplace replies never teach Wheelman." :
        c.asWritten ? "Copied unchanged, so it counts as a good reply. Nothing else to press." :
        "Copied with your changes. Wheelman learns from what changed once it sees the reply sent" + (t.section === "auction" ? "; Auction never teaches, so here nothing is learned." : ".");
      return html`<div class="composer"><div class="done-note" role="status"><${U.Icon} name="check"/><span style="flex:1;min-width:0">${c.sent ? "Sent " : "Copied "}${c.at}. ${learn}</span><button class="btn small" onClick=${function () { WN.A.putBack(t.id); }}>Put back in Needs reply</button></div></div>`;
    }
    if (t.state === "dismissed") return html`<div class="composer"><div class="done-note plain"><span style="flex:1">Dismissed. It stays under All.</span><button class="btn small" onClick=${function () { WN.A.putBack(t.id); }}>Put back in Needs reply</button></div></div>`;
    if (!d) {
      var msg, btn = "Write a reply anyway", act = function () { A.write(t.intents[0]); };
      if (t.answeredBy) msg = t.answeredBy + ". Nothing for you to do.";
      else if (t.state === "auto") msg = "The Facebook engine's auto-reply answered. Nothing for you to do.";
      else if (t.followUp) { msg = "Follow-up due: " + t.followUp.reason.toLowerCase() + "."; btn = "Write the follow-up"; act = A.writeFollowUp; }
      else if (t.order && !t.order.due) msg = "Nothing is due for this order. The next message, “Arrived in Sydney”, is offered when the ship docks.";
      else msg = "We replied last, so nothing is waiting.";
      return html`<div class="composer">
        <div class="done-note plain"><span style="flex:1;min-width:0">${msg}</span>${t.order && !t.order.due ? null : html`<button class=${"btn small" + (t.followUp ? " main" : "")} onClick=${act}>${btn}</button>`}</div>
        ${t.channel === "whatsapp" ? html`<${PasteBox} st=${st}/>` : null}
      </div>`;
    }

    var writing = d.status === "thinking" || d.status === "writing";
    var ck = writing ? null : E.check(d, { vehicle: Q.vehicle(t) });
    var mainLabel = t.channel === "facebook" ? "Send on Facebook" : t.channel === "email" ? "Copy for Gmail" : t.channel === "whatsapp" ? "Copy for WhatsApp" : "Copy reply";
    var words = E.draftText(d).split(/\s+/).filter(Boolean).length;
    var rememberHere = st.remember && st.remember.threadId === t.id;

    return html`<div class="composer" aria-label="Message box"><div class="cscroll">
      ${t.typeReason && t.section !== "auction" ? html`<div class=${"context" + (t.type === "stock" && t.wants ? " warn" : "")}><span style="flex:1;min-width:0">${t.typeReason}</span>${t.type === "stock" && t.wants ? html`<button class="btn small" onClick=${function () { A.setType("import"); }}>Change to Import enquiry</button>` : null}</div>` : null}
      ${t.handedOver && t.state === "waiting" ? html`<div class="context info">The Facebook engine handed this chat to a person. It was written when you opened it.</div>` : null}
      ${t.followUp && d.intent && d.intent.indexOf("fu-") === 0 ? html`<div class="context info">Follow-up: ${t.followUp.reason}. Written when you opened it.</div>` : null}
      ${t.order && t.order.due ? html`<div class="context info">Due for order ${t.order.no}: ${t.order.due}. ${d.codeOnly ? "Written by code from your wording, no AI request." : "One AI request for the first line; the rest is your wording."}</div>` : null}
      <div class="boxlabel"><span><b>Suggested reply</b> · not sent<span class="hint"> · click in the text to change it</span></span><span class="grow"></span>${d.codeOnly || /no AI/.test(d.model || "no AI") ? null : html`<span class="sim">Simulated AI</span>`}<span class="num wc">${words} words</span></div>
      ${d.note ? html`<div class=${d.note.kind === "bad" ? "failnote" : "context " + (d.note.kind === "warn" ? "warn" : "info")}><span style="flex:1;min-width:0">${d.note.text}</span>${d.note.action === "retry" ? html`<button class="btn small" onClick=${function () { A.write(d.intent); }}>Write it again</button>` : null}</div>` : null}
      <${Editor} d=${d} t=${t} writing=${writing} bad=${ck && ck.fails.length}/>
      ${d.needsFact && d.needsFact.state === "needs" ? html`<div class="context warn"><span style="flex:1;min-width:0">“${d.needsFact.topic}” needs your answer, so that part is a blank. Answer it once and every draft uses it.</span><button class="btn small" onClick=${function () { A.screen("playbook", "facts"); }}>Answer it in Playbook</button></div>` : null}
      </div><div class="cfoot">
      ${ck && ck.fails.map(function (f, i) { return html`<div class="failnote" key=${i} role="alert"><span style="flex:1;min-width:0"><b>Check failed:</b> ${f.msg} Copy is blocked until it is fixed.</span>${f.expected ? html`<button class="btn small" onClick=${function () { A.fixFigure(f); }}>Use ${f.expected}</button>` : null}<button class="btn small quiet" onClick=${function () { A.keepFigure(f); }}>Keep my figure</button></div>`; })}
      ${ck ? html`<${Trust} st=${st} t=${t} d=${d} ck=${ck}/>` : html`<div class="trust"><span class="state">Checking facts as it writes…</span></div>`}
      ${rememberHere ? html`<${Remember} st=${st} t=${t}/>` : null}
      ${!writing && d.alts && d.alts.length ? html`<div class="instead"><span>Instead:</span>${d.alts.map(function (a) { return html`<button class="opt" key=${a} onClick=${function () { A.swap(a); }}>${E.LABELS[a] || a}</button>`; })}${d.cleared ? null : null}</div>` : null}
      ${d.research && !writing ? html`<${Research} d=${d}/>` : null}
      <div class="foot">
        <${Tell} disabled=${writing} key=${"tell-" + t.id}/>
        <div class="right">
          ${d.cleared ? null : html`<button class="btn quiet small" onClick=${A.clear} disabled=${writing}>Clear</button>`}
          <${MainButton} t=${t} d=${d} ck=${ck} writing=${writing} label=${mainLabel} sending=${sending}/>
        </div>
      </div>
      ${t.channel === "whatsapp" ? html`<${PasteBox} st=${st}/>` : null}
    </div></div>`;
  }

  function MainButton(props) {
    var t = props.t, d = props.d, ck = props.ck;
    if (props.writing) return html`<button class="btn main" disabled>Writing…</button>`;
    if (ck.fails.length) return html`<button class="btn main" disabled title="Fix the figure first">${props.label}</button>`;
    if (t.channel === "facebook") {
      if (props.sending === "sending") return html`<button class="btn main" disabled>Sending…</button>`;
      if (ck.blanks) return html`<button class="btn main" onClick=${focusBlank}>Fill ${ck.blanks} ${ck.blanks === 1 ? "blank" : "blanks"} to send</button>`;
      return html`<button class="btn main" onClick=${A.send}><${U.Icon} name="send" size="14"/> ${props.sending === "failed" ? "Try again" : props.label}</button>`;
    }
    if (ck.blanks) return html`<button class="btn quiet small" onClick=${function () { A.copy({ withBlanks: true }); }}>Copy with the ${ck.blanks === 1 ? "blank" : "blanks"}</button><button class="btn main" onClick=${focusBlank}>Fill ${ck.blanks} ${ck.blanks === 1 ? "blank" : "blanks"}</button>`;
    return html`<button class="btn main" onClick=${function () { A.copy(); }} title="Ctrl+Enter"><${U.Icon} name="copy" size="14"/> ${props.label}</button>`;
  }
  function focusBlank() {
    var el = document.querySelector(".composer .pill:not(.filled)");
    if (el) { el.focus(); el.scrollIntoView({ block: "nearest" }); }
  }

  /* the editor: AI sentences, code blocks, fact chips and fill-in blanks */
  function Editor(props) {
    var d = props.d, writing = props.writing;
    var budget = d.wordsShown;
    var aiSeen = false;
    var parts = d.parts.map(function (p) {
      var inner;
      if (writing && p.kind === "ai") {
        if (d.status === "thinking") inner = html`<div style="display:grid;gap:8px;padding:4px 0"><div class="writing-line" style="width:92%"></div><div class="writing-line" style="width:64%"></div></div>`;
        else {
          var text = E.partText(p).split(/(\s+)/);
          var out = "", n = 0, i = 0;
          for (; i < text.length && n < budget; i++) { out += text[i]; if (text[i].trim()) n++; }
          var words = E.partText(p).split(/\s+/).filter(Boolean).length;
          budget = Math.max(0, budget - words);
          var active = !aiSeen && n < words;
          if (n < words) aiSeen = true;
          inner = html`<div class="para">${out}${active ? html`<span class="caret"></span>` : null}</div>`;
        }
      } else {
        inner = html`<div class="para">${p.segs.map(function (s, i) { return html`<${Seg} key=${d.rev + "-" + p.id + "-" + i} s=${s} p=${p} i=${i} rev=${d.rev} disabled=${writing}/>`; })}</div>`;
      }
      if (p.kind === "block") {
        if (p.removed) return html`<div class="block removed" key=${p.id}><span>${p.label} removed from this reply</span><button class="btn small quiet" onClick=${function () { A.restorePart(p.id); }}>Put back</button></div>`;
        return html`<div class="block" key=${p.id}>
          <div class="block-head"><span title=${p.why}>${p.label} · added by Wheelman's rules</span><span class="grow"></span>${writing ? null : html`<button class="btn small quiet" onClick=${function () { A.removePart(p.id); }} aria-label=${"Remove " + p.label}>Remove</button>`}</div>
          ${inner}
        </div>`;
      }
      return html`<div key=${p.id}>${inner}</div>`;
    });
    return html`<div class=${"editor" + (props.bad ? " bad" : "")}>${parts}</div>`;
  }

  function Seg(props) {
    var s = props.s, p = props.p, i = props.i;
    var ref = useRef();
    useLayoutEffect(function () { if (ref.current && typeof s === "string") ref.current.textContent = s; }, [props.rev]);
    if (typeof s === "string") {
      return html`<span class="seg" contenteditable=${props.disabled ? "false" : "true"} ref=${ref} role="textbox" aria-multiline="true" aria-label="Reply text, you can change it" spellcheck="true" data-placeholder=${p.kind === "own" ? "Type your reply" : ""}
        onInput=${function (e) { A.editSeg(p.id, i, e.currentTarget.textContent); }}
        onKeyDown=${function (e) {
          if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("insertText", false, "\n"); }
        }}
        onPaste=${function (e) { e.preventDefault(); var text = (e.clipboardData || window.clipboardData).getData("text"); document.execCommand("insertText", false, text); }}></span>`;
    }
    if (s.f != null) return html`<span class="fact" tabindex="0" title=${"From: " + s.src}>${s.f}</span>`;
    if (s.b != null) {
      var size = Math.max(s.b.length + 3, (s.v || "").length + 1);
      return html`<input class=${"pill" + (s.v ? " filled" : "")} size=${size} value=${s.v} placeholder=${"[" + s.b + "?]"} aria-label=${"Fill in: " + s.b.toLowerCase()} disabled=${props.disabled}
        onInput=${function (e) { A.fill(p.id, i, e.currentTarget.value); }}/>`;
    }
    return null;
  }

  function Trust(props) {
    var st = props.st, d = props.d, ck = props.ck, t = props.t;
    var open = st.factOpen === t.id;
    var icon = ck.summary.tone === "good" ? "check" : "alert";
    return html`<div style="display:grid;gap:6px">
      <div class="trust">
        <button class=${"state " + ck.summary.tone} aria-expanded=${open} onClick=${function () { A.factOpen(open ? null : t.id); }}><${U.Icon} name=${icon} size="14"/> ${ck.summary.text}</button>
        <button class="linkbtn" onClick=${function () { A.factOpen(open ? null : t.id); }}>${open ? "Hide" : "Show where each came from"}</button>
      </div>
      ${open ? html`<ul class="factlist">
        ${ck.fails.map(function (f, i) { return html`<li key=${"x" + i}><span class="no">✕</span><span>${f.found} <span class="src">· not in your records</span></span></li>`; })}
        ${d.facts.map(function (f, i) {
          var mark = f.state === "needs" ? html`<span class="need">!</span>` : f.state === "working" ? html`<span class="need">~</span>` : html`<span class="ok">✓</span>`;
          return html`<li key=${i}>${mark}<span>${f.label}: <b>${f.value || "needs your answer"}</b><span class="src"> · ${f.src}</span></span></li>`;
        })}
        ${!d.facts.length && !ck.fails.length ? html`<li><span class="ok">✓</span><span>No figures or links in this reply.</span></li>` : null}
      </ul>` : null}
    </div>`;
  }

  function Remember(props) {
    var t = props.t, r = props.st.remember;
    var scope = t.section === "imports" ? "Import emails" : "Dashboard replies";
    if (t.section === "marketplace" || t.section === "auction") {
      return html`<div class="remember"><span style="flex:1;min-width:0">Rewritten from “${r.instruction}”. ${U.sectionLabel(t.section)} never teaches Wheelman, so it is used for this reply only.</span><button class="btn small" onClick=${function () { A.remember(false); }}>OK</button></div>`;
    }
    return html`<div class="remember"><span style="flex:1;min-width:0">Rewritten from “${r.instruction}”. Use it again?</span>
      <button class="btn small" onClick=${function () { A.remember(false); }}>Just this once</button>
      <button class="btn small main" onClick=${function () { A.remember(true); }}>Remember for ${scope}</button></div>`;
  }

  function Tell(props) {
    var ref = useRef();
    var submit = function (e) {
      e.preventDefault();
      var v = ref.current.value.trim();
      if (!v) return;
      A.tell(v);
      ref.current.value = "";
    };
    return html`<form class="tell" onSubmit=${submit}>
      <input ref=${ref} id="tell" placeholder="Tell Wheelman what to say…" aria-label="Tell Wheelman what to say, then press Enter" disabled=${props.disabled} autocomplete="off"/>
      <button class="btn small quiet" type="submit" disabled=${props.disabled}>Rewrite</button>
    </form>`;
  }

  function Research(props) {
    var r = props.d.research;
    return html`<details class="context" style="display:block">
      <summary style="cursor:pointer;font-weight:600">What Wheelman looked up (${r.notes.length})</summary>
      <ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:2px">${r.notes.map(function (n, i) { return html`<li key=${i}>${n}</li>`; })}</ul>
    </details>`;
  }

  function PasteBox(props) {
    var st = props.st;
    var ref = useRef();
    if (!st.pasteOpen) return html`<div><button class="btn small quiet" onClick=${function () { A.paste(true); }}>Paste what they wrote on WhatsApp</button></div>`;
    return html`<div class="paste">
      <textarea ref=${ref} id="paste" placeholder="Paste the customer's WhatsApp message here" aria-label="WhatsApp message"></textarea>
      <div style="display:grid;gap:6px;align-content:start">
        <button class="btn small main" onClick=${function () { A.pasteIn(ref.current.value, "them"); }}>They wrote this</button>
        <button class="btn small" onClick=${function () { A.pasteIn(ref.current.value, "us"); }}>We sent this</button>
        <button class="btn small quiet" onClick=${function () { A.paste(false); }}>Cancel</button>
      </div>
    </div>`;
  }

  WN.views.Chat = Chat;
})();
