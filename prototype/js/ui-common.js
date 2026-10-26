/* Wheelman prototype — shared view helpers. */
(function () {
  var WN = (window.WN = window.WN || {});
  var P = window.htmPreact;
  var html = P.html;

  var SECTIONS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "marketplace", label: "Marketplace" },
    { id: "imports", label: "Imports" },
    { id: "auction", label: "Auction" }
  ];
  var CHANNEL = { text: "Text", facebook: "Facebook", email: "Email", whatsapp: "WhatsApp" };

  function initials(name) {
    var p = (name || "?").replace(/[^A-Za-z' ]/g, "").split(" ").filter(Boolean);
    return ((p[0] || "?")[0] + (p[1] ? p[1][0] : "")).toUpperCase();
  }
  function Avatar(props) { return html`<span class="avatar" aria-hidden="true">${initials(props.name)}</span>`; }

  function Icon(props) {
    var n = props.name, s = props.size || 16;
    var common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
    if (n === "search") return html`<svg ...${common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
    if (n === "back") return html`<svg ...${common}><path d="M15 18l-6-6 6-6"/></svg>`;
    if (n === "close") return html`<svg ...${common}><path d="M6 6l12 12M18 6 6 18"/></svg>`;
    if (n === "down") return html`<svg ...${common}><path d="m6 9 6 6 6-6"/></svg>`;
    if (n === "panel") return html`<svg ...${common}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/></svg>`;
    if (n === "check") return html`<svg ...${common}><path d="M5 12.5 10 17 19 7"/></svg>`;
    if (n === "alert") return html`<svg ...${common}><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>`;
    if (n === "copy") return html`<svg ...${common}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>`;
    if (n === "send") return html`<svg ...${common}><path d="M4 12 20 4l-6 16-3-7z"/></svg>`;
    if (n === "play") return html`<svg ...${common}><path d="M8 5v14l11-7z"/></svg>`;
    return null;
  }

  function Wheel() {
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 9.8V3.6M10 13.2l-5.6 3.2M14 13.2l5.6 3.2"/></svg>`;
  }

  /* a drawn stand-in for a car photo: no real photos in the demo */
  function CarPhoto(props) {
    var w = props.w || 320, h = props.h || 200;
    var label = props.label;
    return html`<svg class="carsvg" viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label=${label ? label + " (demo picture)" : "Car picture (demo)"} style=${"display:block;aspect-ratio:" + w + "/" + h}>
      <rect width="320" height="200" style="fill:var(--photo-1)"/>
      <rect y="150" width="320" height="50" style="fill:var(--photo-2);opacity:.55"/>
      <path d="M52 132 L74 98 Q82 86 98 84 L196 82 Q214 82 226 92 L258 112 Q276 116 282 128 L284 140 Q284 146 278 146 L56 146 Q48 146 48 140 Z" style="fill:var(--photo-2)"/>
      <path d="M92 96 Q98 90 108 90 L150 89 L150 112 L82 112 Z M160 89 L196 89 Q208 89 216 96 L234 112 L160 112 Z" style="fill:var(--surface-quiet);opacity:.85"/>
      <circle cx="104" cy="146" r="18" style="fill:var(--ink-2)"/><circle cx="104" cy="146" r="8" style="fill:var(--photo-1)"/>
      <circle cx="234" cy="146" r="18" style="fill:var(--ink-2)"/><circle cx="234" cy="146" r="8" style="fill:var(--photo-1)"/>
      ${label ? html`<text x="12" y="22" style="fill:var(--ink-2);font:700 13px var(--font-ui)">${label}</text>` : null}
    </svg>`;
  }

  function sectionLabel(id) { var s = SECTIONS.find(function (x) { return x.id === id; }); return s ? s.label : id; }

  WN.ui = { html: html, P: P, SECTIONS: SECTIONS, CHANNEL: CHANNEL, Avatar: Avatar, Icon: Icon, Wheel: Wheel, CarPhoto: CarPhoto, sectionLabel: sectionLabel, initials: initials };
})();
