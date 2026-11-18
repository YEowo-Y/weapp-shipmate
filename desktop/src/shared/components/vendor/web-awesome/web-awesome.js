/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var oi = () => ({
  checkValidity(t) {
    const e = t.input, o = {
      message: "",
      isValid: !0,
      invalidKeys: []
    };
    if (!e)
      return o;
    let i = !0;
    if ("checkValidity" in e && (i = e.checkValidity()), i)
      return o;
    if (o.isValid = !1, "validationMessage" in e && (o.message = e.validationMessage), !("validity" in e))
      return o.invalidKeys.push("customError"), o;
    for (const n in e.validity) {
      if (n === "valid")
        continue;
      const a = n;
      e.validity[a] && o.invalidKeys.push(a);
    }
    return o;
  }
});
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var go = class extends Event {
  constructor() {
    super("wa-invalid", { bubbles: !0, cancelable: !1, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var ii = Object.defineProperty, ni = Object.getOwnPropertyDescriptor, wo = (t) => {
  throw TypeError(t);
}, c = (t, e, o, i) => {
  for (var n = i > 1 ? void 0 : i ? ni(e, o) : e, a = t.length - 1, r; a >= 0; a--)
    (r = t[a]) && (n = (i ? r(e, o, n) : r(n)) || n);
  return i && n && ii(e, o, n), n;
}, vo = (t, e, o) => e.has(t) || wo("Cannot " + o), ai = (t, e, o) => (vo(t, e, "read from private field"), e.get(t)), ri = (t, e, o) => e.has(t) ? wo("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(t) : e.set(t, o), si = (t, e, o, i) => (vo(t, e, "write to private field"), e.set(t, o), o);
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const jt = globalThis, $e = jt.ShadowRoot && (jt.ShadyCSS === void 0 || jt.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, ke = Symbol(), De = /* @__PURE__ */ new WeakMap();
let bo = class {
  constructor(e, o, i) {
    if (this._$cssResult$ = !0, i !== ke) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = e, this.t = o;
  }
  get styleSheet() {
    let e = this.o;
    const o = this.t;
    if ($e && e === void 0) {
      const i = o !== void 0 && o.length === 1;
      i && (e = De.get(o)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), i && De.set(o, e));
    }
    return e;
  }
  toString() {
    return this.cssText;
  }
};
const li = (t) => new bo(typeof t == "string" ? t : t + "", void 0, ke), V = (t, ...e) => {
  const o = t.length === 1 ? t[0] : e.reduce((i, n, a) => i + ((r) => {
    if (r._$cssResult$ === !0) return r.cssText;
    if (typeof r == "number") return r;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + r + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(n) + t[a + 1], t[0]);
  return new bo(o, t, ke);
}, ci = (t, e) => {
  if ($e) t.adoptedStyleSheets = e.map((o) => o instanceof CSSStyleSheet ? o : o.styleSheet);
  else for (const o of e) {
    const i = document.createElement("style"), n = jt.litNonce;
    n !== void 0 && i.setAttribute("nonce", n), i.textContent = o.cssText, t.appendChild(i);
  }
}, Ne = $e ? (t) => t : (t) => t instanceof CSSStyleSheet ? ((e) => {
  let o = "";
  for (const i of e.cssRules) o += i.cssText;
  return li(o);
})(t) : t;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: di, defineProperty: ui, getOwnPropertyDescriptor: hi, getOwnPropertyNames: mi, getOwnPropertySymbols: pi, getPrototypeOf: fi } = Object, it = globalThis, Ue = it.trustedTypes, gi = Ue ? Ue.emptyScript : "", ce = it.reactiveElementPolyfillSupport, Ft = (t, e) => t, Yt = { toAttribute(t, e) {
  switch (e) {
    case Boolean:
      t = t ? gi : null;
      break;
    case Object:
    case Array:
      t = t == null ? t : JSON.stringify(t);
  }
  return t;
}, fromAttribute(t, e) {
  let o = t;
  switch (e) {
    case Boolean:
      o = t !== null;
      break;
    case Number:
      o = t === null ? null : Number(t);
      break;
    case Object:
    case Array:
      try {
        o = JSON.parse(t);
      } catch {
        o = null;
      }
  }
  return o;
} }, Ee = (t, e) => !di(t, e), Ve = { attribute: !0, type: String, converter: Yt, reflect: !1, useDefault: !1, hasChanged: Ee };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), it.litPropertyMetadata ?? (it.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
let yt = class extends HTMLElement {
  static addInitializer(e) {
    this._$Ei(), (this.l ?? (this.l = [])).push(e);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(e, o = Ve) {
    if (o.state && (o.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((o = Object.create(o)).wrapped = !0), this.elementProperties.set(e, o), !o.noAccessor) {
      const i = Symbol(), n = this.getPropertyDescriptor(e, i, o);
      n !== void 0 && ui(this.prototype, e, n);
    }
  }
  static getPropertyDescriptor(e, o, i) {
    const { get: n, set: a } = hi(this.prototype, e) ?? { get() {
      return this[o];
    }, set(r) {
      this[o] = r;
    } };
    return { get: n, set(r) {
      const s = n == null ? void 0 : n.call(this);
      a == null || a.call(this, r), this.requestUpdate(e, s, i);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(e) {
    return this.elementProperties.get(e) ?? Ve;
  }
  static _$Ei() {
    if (this.hasOwnProperty(Ft("elementProperties"))) return;
    const e = fi(this);
    e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(Ft("finalized"))) return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(Ft("properties"))) {
      const o = this.properties, i = [...mi(o), ...pi(o)];
      for (const n of i) this.createProperty(n, o[n]);
    }
    const e = this[Symbol.metadata];
    if (e !== null) {
      const o = litPropertyMetadata.get(e);
      if (o !== void 0) for (const [i, n] of o) this.elementProperties.set(i, n);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [o, i] of this.elementProperties) {
      const n = this._$Eu(o, i);
      n !== void 0 && this._$Eh.set(n, o);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(e) {
    const o = [];
    if (Array.isArray(e)) {
      const i = new Set(e.flat(1 / 0).reverse());
      for (const n of i) o.unshift(Ne(n));
    } else e !== void 0 && o.push(Ne(e));
    return o;
  }
  static _$Eu(e, o) {
    const i = o.attribute;
    return i === !1 ? void 0 : typeof i == "string" ? i : typeof e == "string" ? e.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    var e;
    this._$ES = new Promise((o) => this.enableUpdating = o), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (e = this.constructor.l) == null || e.forEach((o) => o(this));
  }
  addController(e) {
    var o;
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(e), this.renderRoot !== void 0 && this.isConnected && ((o = e.hostConnected) == null || o.call(e));
  }
  removeController(e) {
    var o;
    (o = this._$EO) == null || o.delete(e);
  }
  _$E_() {
    const e = /* @__PURE__ */ new Map(), o = this.constructor.elementProperties;
    for (const i of o.keys()) this.hasOwnProperty(i) && (e.set(i, this[i]), delete this[i]);
    e.size > 0 && (this._$Ep = e);
  }
  createRenderRoot() {
    const e = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return ci(e, this.constructor.elementStyles), e;
  }
  connectedCallback() {
    var e;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(!0), (e = this._$EO) == null || e.forEach((o) => {
      var i;
      return (i = o.hostConnected) == null ? void 0 : i.call(o);
    });
  }
  enableUpdating(e) {
  }
  disconnectedCallback() {
    var e;
    (e = this._$EO) == null || e.forEach((o) => {
      var i;
      return (i = o.hostDisconnected) == null ? void 0 : i.call(o);
    });
  }
  attributeChangedCallback(e, o, i) {
    this._$AK(e, i);
  }
  _$ET(e, o) {
    var a;
    const i = this.constructor.elementProperties.get(e), n = this.constructor._$Eu(e, i);
    if (n !== void 0 && i.reflect === !0) {
      const r = (((a = i.converter) == null ? void 0 : a.toAttribute) !== void 0 ? i.converter : Yt).toAttribute(o, i.type);
      this._$Em = e, r == null ? this.removeAttribute(n) : this.setAttribute(n, r), this._$Em = null;
    }
  }
  _$AK(e, o) {
    var a, r;
    const i = this.constructor, n = i._$Eh.get(e);
    if (n !== void 0 && this._$Em !== n) {
      const s = i.getPropertyOptions(n), l = typeof s.converter == "function" ? { fromAttribute: s.converter } : ((a = s.converter) == null ? void 0 : a.fromAttribute) !== void 0 ? s.converter : Yt;
      this._$Em = n;
      const d = l.fromAttribute(o, s.type);
      this[n] = d ?? ((r = this._$Ej) == null ? void 0 : r.get(n)) ?? d, this._$Em = null;
    }
  }
  requestUpdate(e, o, i, n = !1, a) {
    var r;
    if (e !== void 0) {
      const s = this.constructor;
      if (n === !1 && (a = this[e]), i ?? (i = s.getPropertyOptions(e)), !((i.hasChanged ?? Ee)(a, o) || i.useDefault && i.reflect && a === ((r = this._$Ej) == null ? void 0 : r.get(e)) && !this.hasAttribute(s._$Eu(e, i)))) return;
      this.C(e, o, i);
    }
    this.isUpdatePending === !1 && (this._$ES = this._$EP());
  }
  C(e, o, { useDefault: i, reflect: n, wrapped: a }, r) {
    i && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(e) && (this._$Ej.set(e, r ?? o ?? this[e]), a !== !0 || r !== void 0) || (this._$AL.has(e) || (this.hasUpdated || i || (o = void 0), this._$AL.set(e, o)), n === !0 && this._$Em !== e && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(e));
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$ES;
    } catch (o) {
      Promise.reject(o);
    }
    const e = this.scheduleUpdate();
    return e != null && await e, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    var i;
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [a, r] of this._$Ep) this[a] = r;
        this._$Ep = void 0;
      }
      const n = this.constructor.elementProperties;
      if (n.size > 0) for (const [a, r] of n) {
        const { wrapped: s } = r, l = this[a];
        s !== !0 || this._$AL.has(a) || l === void 0 || this.C(a, void 0, r, l);
      }
    }
    let e = !1;
    const o = this._$AL;
    try {
      e = this.shouldUpdate(o), e ? (this.willUpdate(o), (i = this._$EO) == null || i.forEach((n) => {
        var a;
        return (a = n.hostUpdate) == null ? void 0 : a.call(n);
      }), this.update(o)) : this._$EM();
    } catch (n) {
      throw e = !1, this._$EM(), n;
    }
    e && this._$AE(o);
  }
  willUpdate(e) {
  }
  _$AE(e) {
    var o;
    (o = this._$EO) == null || o.forEach((i) => {
      var n;
      return (n = i.hostUpdated) == null ? void 0 : n.call(i);
    }), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(e)), this.updated(e);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(e) {
    return !0;
  }
  update(e) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((o) => this._$ET(o, this[o]))), this._$EM();
  }
  updated(e) {
  }
  firstUpdated(e) {
  }
};
yt.elementStyles = [], yt.shadowRootOptions = { mode: "open" }, yt[Ft("elementProperties")] = /* @__PURE__ */ new Map(), yt[Ft("finalized")] = /* @__PURE__ */ new Map(), ce == null || ce({ ReactiveElement: yt }), (it.reactiveElementVersions ?? (it.reactiveElementVersions = [])).push("2.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Ot = globalThis, qe = (t) => t, Kt = Ot.trustedTypes, He = Kt ? Kt.createPolicy("lit-html", { createHTML: (t) => t }) : void 0, yo = "$lit$", ot = `lit$${Math.random().toFixed(9).slice(2)}$`, Co = "?" + ot, wi = `<${Co}>`, pt = document, Tt = () => pt.createComment(""), It = (t) => t === null || typeof t != "object" && typeof t != "function", _e = Array.isArray, vi = (t) => _e(t) || typeof (t == null ? void 0 : t[Symbol.iterator]) == "function", de = `[ 	
\f\r]`, Pt = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, je = /-->/g, We = />/g, ct = RegExp(`>|${de}(?:([^\\s"'>=/]+)(${de}*=${de}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), Xe = /'/g, Ye = /"/g, Lo = /^(?:script|style|textarea|title)$/i, bi = (t) => (e, ...o) => ({ _$litType$: t, strings: e, values: o }), O = bi(1), ft = Symbol.for("lit-noChange"), k = Symbol.for("lit-nothing"), Ke = /* @__PURE__ */ new WeakMap(), ut = pt.createTreeWalker(pt, 129);
function xo(t, e) {
  if (!_e(t) || !t.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return He !== void 0 ? He.createHTML(e) : e;
}
const yi = (t, e) => {
  const o = t.length - 1, i = [];
  let n, a = e === 2 ? "<svg>" : e === 3 ? "<math>" : "", r = Pt;
  for (let s = 0; s < o; s++) {
    const l = t[s];
    let d, u, m = -1, f = 0;
    for (; f < l.length && (r.lastIndex = f, u = r.exec(l), u !== null); ) f = r.lastIndex, r === Pt ? u[1] === "!--" ? r = je : u[1] !== void 0 ? r = We : u[2] !== void 0 ? (Lo.test(u[2]) && (n = RegExp("</" + u[2], "g")), r = ct) : u[3] !== void 0 && (r = ct) : r === ct ? u[0] === ">" ? (r = n ?? Pt, m = -1) : u[1] === void 0 ? m = -2 : (m = r.lastIndex - u[2].length, d = u[1], r = u[3] === void 0 ? ct : u[3] === '"' ? Ye : Xe) : r === Ye || r === Xe ? r = ct : r === je || r === We ? r = Pt : (r = ct, n = void 0);
    const p = r === ct && t[s + 1].startsWith("/>") ? " " : "";
    a += r === Pt ? l + wi : m >= 0 ? (i.push(d), l.slice(0, m) + yo + l.slice(m) + ot + p) : l + ot + (m === -2 ? s : p);
  }
  return [xo(t, a + (t[o] || "<?>") + (e === 2 ? "</svg>" : e === 3 ? "</math>" : "")), i];
};
class Bt {
  constructor({ strings: e, _$litType$: o }, i) {
    let n;
    this.parts = [];
    let a = 0, r = 0;
    const s = e.length - 1, l = this.parts, [d, u] = yi(e, o);
    if (this.el = Bt.createElement(d, i), ut.currentNode = this.el.content, o === 2 || o === 3) {
      const m = this.el.content.firstChild;
      m.replaceWith(...m.childNodes);
    }
    for (; (n = ut.nextNode()) !== null && l.length < s; ) {
      if (n.nodeType === 1) {
        if (n.hasAttributes()) for (const m of n.getAttributeNames()) if (m.endsWith(yo)) {
          const f = u[r++], p = n.getAttribute(m).split(ot), g = /([.?@])?(.*)/.exec(f);
          l.push({ type: 1, index: a, name: g[2], strings: p, ctor: g[1] === "." ? Li : g[1] === "?" ? xi : g[1] === "@" ? Si : ee }), n.removeAttribute(m);
        } else m.startsWith(ot) && (l.push({ type: 6, index: a }), n.removeAttribute(m));
        if (Lo.test(n.tagName)) {
          const m = n.textContent.split(ot), f = m.length - 1;
          if (f > 0) {
            n.textContent = Kt ? Kt.emptyScript : "";
            for (let p = 0; p < f; p++) n.append(m[p], Tt()), ut.nextNode(), l.push({ type: 2, index: ++a });
            n.append(m[f], Tt());
          }
        }
      } else if (n.nodeType === 8) if (n.data === Co) l.push({ type: 2, index: a });
      else {
        let m = -1;
        for (; (m = n.data.indexOf(ot, m + 1)) !== -1; ) l.push({ type: 7, index: a }), m += ot.length - 1;
      }
      a++;
    }
  }
  static createElement(e, o) {
    const i = pt.createElement("template");
    return i.innerHTML = e, i;
  }
}
function xt(t, e, o = t, i) {
  var r, s;
  if (e === ft) return e;
  let n = i !== void 0 ? (r = o._$Co) == null ? void 0 : r[i] : o._$Cl;
  const a = It(e) ? void 0 : e._$litDirective$;
  return (n == null ? void 0 : n.constructor) !== a && ((s = n == null ? void 0 : n._$AO) == null || s.call(n, !1), a === void 0 ? n = void 0 : (n = new a(t), n._$AT(t, o, i)), i !== void 0 ? (o._$Co ?? (o._$Co = []))[i] = n : o._$Cl = n), n !== void 0 && (e = xt(t, n._$AS(t, e.values), n, i)), e;
}
class Ci {
  constructor(e, o) {
    this._$AV = [], this._$AN = void 0, this._$AD = e, this._$AM = o;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(e) {
    const { el: { content: o }, parts: i } = this._$AD, n = ((e == null ? void 0 : e.creationScope) ?? pt).importNode(o, !0);
    ut.currentNode = n;
    let a = ut.nextNode(), r = 0, s = 0, l = i[0];
    for (; l !== void 0; ) {
      if (r === l.index) {
        let d;
        l.type === 2 ? d = new Ut(a, a.nextSibling, this, e) : l.type === 1 ? d = new l.ctor(a, l.name, l.strings, this, e) : l.type === 6 && (d = new zi(a, this, e)), this._$AV.push(d), l = i[++s];
      }
      r !== (l == null ? void 0 : l.index) && (a = ut.nextNode(), r++);
    }
    return ut.currentNode = pt, n;
  }
  p(e) {
    let o = 0;
    for (const i of this._$AV) i !== void 0 && (i.strings !== void 0 ? (i._$AI(e, i, o), o += i.strings.length - 2) : i._$AI(e[o])), o++;
  }
}
class Ut {
  get _$AU() {
    var e;
    return ((e = this._$AM) == null ? void 0 : e._$AU) ?? this._$Cv;
  }
  constructor(e, o, i, n) {
    this.type = 2, this._$AH = k, this._$AN = void 0, this._$AA = e, this._$AB = o, this._$AM = i, this.options = n, this._$Cv = (n == null ? void 0 : n.isConnected) ?? !0;
  }
  get parentNode() {
    let e = this._$AA.parentNode;
    const o = this._$AM;
    return o !== void 0 && (e == null ? void 0 : e.nodeType) === 11 && (e = o.parentNode), e;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(e, o = this) {
    e = xt(this, e, o), It(e) ? e === k || e == null || e === "" ? (this._$AH !== k && this._$AR(), this._$AH = k) : e !== this._$AH && e !== ft && this._(e) : e._$litType$ !== void 0 ? this.$(e) : e.nodeType !== void 0 ? this.T(e) : vi(e) ? this.k(e) : this._(e);
  }
  O(e) {
    return this._$AA.parentNode.insertBefore(e, this._$AB);
  }
  T(e) {
    this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
  }
  _(e) {
    this._$AH !== k && It(this._$AH) ? this._$AA.nextSibling.data = e : this.T(pt.createTextNode(e)), this._$AH = e;
  }
  $(e) {
    var a;
    const { values: o, _$litType$: i } = e, n = typeof i == "number" ? this._$AC(e) : (i.el === void 0 && (i.el = Bt.createElement(xo(i.h, i.h[0]), this.options)), i);
    if (((a = this._$AH) == null ? void 0 : a._$AD) === n) this._$AH.p(o);
    else {
      const r = new Ci(n, this), s = r.u(this.options);
      r.p(o), this.T(s), this._$AH = r;
    }
  }
  _$AC(e) {
    let o = Ke.get(e.strings);
    return o === void 0 && Ke.set(e.strings, o = new Bt(e)), o;
  }
  k(e) {
    _e(this._$AH) || (this._$AH = [], this._$AR());
    const o = this._$AH;
    let i, n = 0;
    for (const a of e) n === o.length ? o.push(i = new Ut(this.O(Tt()), this.O(Tt()), this, this.options)) : i = o[n], i._$AI(a), n++;
    n < o.length && (this._$AR(i && i._$AB.nextSibling, n), o.length = n);
  }
  _$AR(e = this._$AA.nextSibling, o) {
    var i;
    for ((i = this._$AP) == null ? void 0 : i.call(this, !1, !0, o); e !== this._$AB; ) {
      const n = qe(e).nextSibling;
      qe(e).remove(), e = n;
    }
  }
  setConnected(e) {
    var o;
    this._$AM === void 0 && (this._$Cv = e, (o = this._$AP) == null || o.call(this, e));
  }
}
class ee {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(e, o, i, n, a) {
    this.type = 1, this._$AH = k, this._$AN = void 0, this.element = e, this.name = o, this._$AM = n, this.options = a, i.length > 2 || i[0] !== "" || i[1] !== "" ? (this._$AH = Array(i.length - 1).fill(new String()), this.strings = i) : this._$AH = k;
  }
  _$AI(e, o = this, i, n) {
    const a = this.strings;
    let r = !1;
    if (a === void 0) e = xt(this, e, o, 0), r = !It(e) || e !== this._$AH && e !== ft, r && (this._$AH = e);
    else {
      const s = e;
      let l, d;
      for (e = a[0], l = 0; l < a.length - 1; l++) d = xt(this, s[i + l], o, l), d === ft && (d = this._$AH[l]), r || (r = !It(d) || d !== this._$AH[l]), d === k ? e = k : e !== k && (e += (d ?? "") + a[l + 1]), this._$AH[l] = d;
    }
    r && !n && this.j(e);
  }
  j(e) {
    e === k ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
  }
}
class Li extends ee {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(e) {
    this.element[this.name] = e === k ? void 0 : e;
  }
}
class xi extends ee {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(e) {
    this.element.toggleAttribute(this.name, !!e && e !== k);
  }
}
class Si extends ee {
  constructor(e, o, i, n, a) {
    super(e, o, i, n, a), this.type = 5;
  }
  _$AI(e, o = this) {
    if ((e = xt(this, e, o, 0) ?? k) === ft) return;
    const i = this._$AH, n = e === k && i !== k || e.capture !== i.capture || e.once !== i.once || e.passive !== i.passive, a = e !== k && (i === k || n);
    n && this.element.removeEventListener(this.name, this, i), a && this.element.addEventListener(this.name, this, e), this._$AH = e;
  }
  handleEvent(e) {
    var o;
    typeof this._$AH == "function" ? this._$AH.call(((o = this.options) == null ? void 0 : o.host) ?? this.element, e) : this._$AH.handleEvent(e);
  }
}
class zi {
  constructor(e, o, i) {
    this.element = e, this.type = 6, this._$AN = void 0, this._$AM = o, this.options = i;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(e) {
    xt(this, e);
  }
}
const ue = Ot.litHtmlPolyfillSupport;
ue == null || ue(Bt, Ut), (Ot.litHtmlVersions ?? (Ot.litHtmlVersions = [])).push("3.3.3");
const Ai = (t, e, o) => {
  const i = (o == null ? void 0 : o.renderBefore) ?? e;
  let n = i._$litPart$;
  if (n === void 0) {
    const a = (o == null ? void 0 : o.renderBefore) ?? null;
    i._$litPart$ = n = new Ut(e.insertBefore(Tt(), a), a, void 0, o ?? {});
  }
  return n._$AI(t), n;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const ht = globalThis;
let Rt = class extends yt {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var o;
    const e = super.createRenderRoot();
    return (o = this.renderOptions).renderBefore ?? (o.renderBefore = e.firstChild), e;
  }
  update(e) {
    const o = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = Ai(o, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var e;
    super.connectedCallback(), (e = this._$Do) == null || e.setConnected(!0);
  }
  disconnectedCallback() {
    var e;
    super.disconnectedCallback(), (e = this._$Do) == null || e.setConnected(!1);
  }
  render() {
    return ft;
  }
};
var mo;
Rt._$litElement$ = !0, Rt.finalized = !0, (mo = ht.litElementHydrateSupport) == null || mo.call(ht, { LitElement: Rt });
const he = ht.litElementPolyfillSupport;
he == null || he({ LitElement: Rt });
(ht.litElementVersions ?? (ht.litElementVersions = [])).push("4.2.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const at = (t) => (e, o) => {
  o !== void 0 ? o.addInitializer(() => {
    customElements.define(t, e);
  }) : customElements.define(t, e);
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const $i = { attribute: !0, type: String, converter: Yt, reflect: !1, hasChanged: Ee }, ki = (t = $i, e, o) => {
  const { kind: i, metadata: n } = o;
  let a = globalThis.litPropertyMetadata.get(n);
  if (a === void 0 && globalThis.litPropertyMetadata.set(n, a = /* @__PURE__ */ new Map()), i === "setter" && ((t = Object.create(t)).wrapped = !0), a.set(o.name, t), i === "accessor") {
    const { name: r } = o;
    return { set(s) {
      const l = e.get.call(this);
      e.set.call(this, s), this.requestUpdate(r, l, t, !0, s);
    }, init(s) {
      return s !== void 0 && this.C(r, void 0, t, s), s;
    } };
  }
  if (i === "setter") {
    const { name: r } = o;
    return function(s) {
      const l = this[r];
      e.call(this, s), this.requestUpdate(r, l, t, !0, s);
    };
  }
  throw Error("Unsupported decorator location: " + i);
};
function h(t) {
  return (e, o) => typeof o == "object" ? ki(t, e, o) : ((i, n, a) => {
    const r = n.hasOwnProperty(a);
    return n.constructor.createProperty(a, i), r ? Object.getOwnPropertyDescriptor(n, a) : void 0;
  })(t, e, o);
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
function Vt(t) {
  return h({ ...t, state: !0, attribute: !1 });
}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Ei = (t, e, o) => (o.configurable = !0, o.enumerable = !0, Reflect.decorate && typeof e != "object" && Object.defineProperty(t, e, o), o);
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
function I(t, e) {
  return (o, i, n) => {
    const a = (r) => {
      var s;
      return ((s = r.renderRoot) == null ? void 0 : s.querySelector(t)) ?? null;
    };
    return Ei(o, i, { get() {
      return a(this);
    } });
  };
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var _i = V`
  :host {
    box-sizing: border-box;
  }

  :host *,
  :host *::before,
  :host *::after {
    box-sizing: inherit;
  }

  [hidden],
  :host([hidden]) {
    display: none !important;
  }
`, Pi = /;\s+$/;
function Mi(t) {
  return t.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`);
}
function Ge(t) {
  const { property: e, value: o, element: i } = t;
  if (o) {
    let n = i.getAttribute("style") || "";
    n && (n.match(Pi) || (n += ";"), n += " ");
    const a = `${e}: ${o}`;
    return n.includes(a) ? void 0 : `${n}${a};`;
  }
  return null;
}
var Wt, q = class extends Rt {
  constructor() {
    super(), ri(this, Wt, !1), this.initialReflectedProperties = /* @__PURE__ */ new Map(), this.didSSR = !!this.shadowRoot, this.customStates = {
      /** Adds or removes the specified custom state. */
      set: (e, o) => {
        var i;
        if ((i = this.internals) != null && i.states)
          try {
            o ? this.internals.states.add(e) : this.internals.states.delete(e);
          } catch (n) {
            if (String(n).includes("must start with '--'"))
              console.error("Your browser implements an outdated version of CustomStateSet. Consider using a polyfill");
            else
              throw n;
          }
      },
      /** Determines whether or not the element currently has the specified state. */
      has: (e) => {
        var o;
        if (!((o = this.internals) != null && o.states)) return !1;
        try {
          return this.internals.states.has(e);
        } catch {
          return !1;
        }
      }
    };
    try {
      this.internals = this.attachInternals();
    } catch {
      console.error("Element internals are not supported in your browser. Consider using a polyfill");
    }
    this.customStates.set("wa-defined", !0);
    let t = this.constructor;
    for (let [e, o] of t.elementProperties)
      o.default === "inherit" && o.initial !== void 0 && typeof e == "string" && this.customStates.set(`initial-${e}-${o.initial}`, !0);
  }
  /** Prepends host styles to the component's styles. */
  static get styles() {
    const t = Array.isArray(this.css) ? this.css : this.css ? [this.css] : [];
    return [_i, ...t];
  }
  connectedCallback() {
    var t;
    super.connectedCallback(), this.didSSR || (t = this.shadowRoot) == null || t.prepend(
      document.createComment(
        ` Web Awesome: https://webawesome.com/docs/components/${this.localName.replace("wa-", "")} `
      )
    ), this.didSSR && this.updateComplete.then(() => {
      var e;
      (e = this.shadowRoot) == null || e.prepend(
        document.createComment(
          ` Web Awesome: https://webawesome.com/docs/components/${this.localName.replace("wa-", "")} `
        )
      );
    });
  }
  attributeChangedCallback(t, e, o) {
    ai(this, Wt) || (this.constructor.elementProperties.forEach(
      (i, n) => {
        i.reflect && this[n] != null && this.initialReflectedProperties.set(n, this[n]);
      }
    ), si(this, Wt, !0)), super.attributeChangedCallback(t, e, o);
  }
  willUpdate(t) {
    super.willUpdate(t), this.initialReflectedProperties.forEach((e, o) => {
      t.has(o) && this[o] == null && (this[o] = e);
    });
  }
  firstUpdated(t) {
    var e;
    super.firstUpdated(t), this.didSSR && ((e = this.shadowRoot) == null || e.querySelectorAll("slot").forEach((o) => {
      o.dispatchEvent(new Event("slotchange", { bubbles: !0, composed: !1, cancelable: !1 }));
    }));
  }
  update(t) {
    try {
      super.update(t);
    } catch (e) {
      if (this.didSSR && !this.hasUpdated) {
        const o = new Event("lit-hydration-error", { bubbles: !0, composed: !0, cancelable: !1 });
        o.error = e, this.dispatchEvent(o);
      }
      throw e;
    }
  }
  /**
   * @internal
   * Internal way to set styles across both client and server
   */
  setStyle(t, e) {
    if (!this.style) {
      const o = Ge({
        // because this is going to be serialized to an HTML style attribute, need to transform the casing.
        property: Mi(t),
        value: e,
        element: this
      });
      o && this.setAttribute("style", o);
      return;
    }
    this.style[t] = e;
  }
  /**
   * @internal
   * Internal way to set a CSS custom property across both client and server.
   */
  setStyleProperty(t, e) {
    if (!this.style) {
      const o = Ge({
        // because this is going to be serialized to an HTML style attribute, need to transform the casing.
        property: t,
        value: e,
        element: this
      });
      o && this.setAttribute("style", o);
      return;
    }
    this.style.setProperty(t, e);
  }
  /**
   * @internal Given a native event, this function cancels it and dispatches it again from the host element using the desired
   * event options.
   */
  relayNativeEvent(t, e) {
    t.stopImmediatePropagation(), this.dispatchEvent(
      new t.constructor(t.type, {
        ...t,
        ...e
      })
    );
  }
};
Wt = /* @__PURE__ */ new WeakMap();
c([
  h()
], q.prototype, "dir", 2);
c([
  h()
], q.prototype, "lang", 2);
c([
  h({ type: Boolean, reflect: !0, attribute: "did-ssr" })
], q.prototype, "didSSR", 2);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Fi = () => ({
  observedAttributes: ["custom-error"],
  checkValidity(t) {
    const e = {
      message: "",
      isValid: !0,
      invalidKeys: []
    };
    return t.customError && (e.message = t.customError, e.isValid = !1, e.invalidKeys = ["customError"]), e;
  }
}), J = class extends q {
  constructor() {
    super(), this.name = null, this.disabled = !1, this.required = !1, this.assumeInteractionOn = ["input"], this.validators = [], this.valueHasChanged = !1, this.hasInteracted = !1, this.customError = null, this.emittedEvents = [], this.emitInvalid = (t) => {
      t.target === this && (this.hasInteracted = !0, this.dispatchEvent(new go()));
    }, this.handleInteraction = (t) => {
      var o;
      const e = this.emittedEvents;
      e.includes(t.type) || e.push(t.type), e.length === ((o = this.assumeInteractionOn) == null ? void 0 : o.length) && (this.hasInteracted = !0);
    }, "addEventListener" in this && this.addEventListener("invalid", this.emitInvalid);
  }
  /**
   * Validators are static because they have `observedAttributes`, essentially attributes to "watch"
   * for changes. Whenever these attributes change, we want to be notified and update the validator.
   */
  static get validators() {
    return [Fi()];
  }
  // Append all Validator "observedAttributes" into the "observedAttributes" so they can run.
  static get observedAttributes() {
    const t = new Set(super.observedAttributes || []);
    for (const e of this.validators)
      if (e.observedAttributes)
        for (const o of e.observedAttributes)
          t.add(o);
    return [...t];
  }
  connectedCallback() {
    super.connectedCallback(), this.didSSR && !this.hasUpdated ? this.updateComplete.then(() => {
      this.updateValidity();
    }) : this.updateValidity(), this.assumeInteractionOn.forEach((t) => {
      var e;
      (e = this.addEventListener) == null || e.call(this, t, this.handleInteraction);
    });
  }
  firstUpdated(...t) {
    super.firstUpdated(...t), this.updateValidity();
  }
  willUpdate(t) {
    if (t.has("customError") && (this.customError || (this.customError = null), this.setCustomValidity(this.customError || "")), t.has("value") || t.has("disabled") || t.has("defaultValue")) {
      const e = this.value;
      this.updateFormValue(e);
    }
    t.has("disabled") && (this.customStates.set("disabled", this.disabled), (this.hasAttribute("disabled") || !this.matches(":disabled")) && this.toggleAttribute("disabled", this.disabled)), super.willUpdate(t), this.didSSR && !this.hasUpdated ? this.updateComplete.then(() => this.updateValidity()) : this.updateValidity();
  }
  /**
   * @internal
   */
  updateFormValue(t) {
    if (Array.isArray(t)) {
      if (this.name) {
        const e = new FormData();
        for (const o of t)
          e.append(this.name, o);
        this.setValue(e, e);
      }
    } else
      this.setValue(t, t);
  }
  get labels() {
    return this.internals.labels;
  }
  getForm() {
    return this.internals.form;
  }
  /**
   * By default, form controls are associated with the nearest containing `<form>` element. This attribute allows you
   * to place the form control outside of a form and associate it with the form that has this `id`. The form must be in
   * the same document or shadow root for this to work.
   */
  set form(t) {
    t ? this.setAttribute("form", t) : this.removeAttribute("form");
  }
  get form() {
    return this.internals.form;
  }
  get validity() {
    return this.internals.validity;
  }
  // Not sure if this supports `novalidate`. Will need to test.
  get willValidate() {
    return this.internals.willValidate;
  }
  get validationMessage() {
    return this.internals.validationMessage;
  }
  checkValidity() {
    return this.updateValidity(), this.internals.checkValidity();
  }
  reportValidity() {
    return this.updateValidity(), this.hasInteracted = !0, this.internals.reportValidity();
  }
  /**
   * Override this to change where constraint validation popups are anchored.
   */
  get validationTarget() {
    return this.input || void 0;
  }
  setValidity(...t) {
    const e = t[0], o = t[1];
    let i = t[2];
    i || (i = this.validationTarget), this.internals.setValidity(e, o, i || void 0), this.requestUpdate("validity"), this.setCustomStates();
  }
  setCustomStates() {
    const t = !!this.required, e = this.internals.validity.valid, o = this.hasInteracted;
    this.customStates.set("required", t), this.customStates.set("optional", !t), this.customStates.set("invalid", !e), this.customStates.set("valid", e), this.customStates.set("user-invalid", !e && o), this.customStates.set("user-valid", e && o);
  }
  /**
   * Do not use this when creating a "Validator". This is intended for end users of components.
   * We track manually defined custom errors so we don't clear them on accident in our validators.
   *
   */
  setCustomValidity(t) {
    if (!t) {
      this.customError = null, this.setValidity({});
      return;
    }
    this.customError = t, this.setValidity({ customError: !0 }, t, this.validationTarget);
  }
  formResetCallback() {
    this.resetValidity(), this.hasInteracted = !1, this.valueHasChanged = !1, this.emittedEvents = [], this.updateValidity();
  }
  formDisabledCallback(t) {
    this.disabled = t, this.updateValidity();
  }
  /**
   * Called when the browser is trying to restore element’s state to state in which case reason is "restore", or when
   * the browser is trying to fulfill autofill on behalf of user in which case reason is "autocomplete". In the case of
   * "restore", state is a string, File, or FormData object previously set as the second argument to setFormValue.
   */
  formStateRestoreCallback(t, e) {
    this.didSSR && !this.hasUpdated ? this.updateComplete.then(() => {
      this.value = t, e === "restore" && this.resetValidity(), this.updateValidity();
    }) : (this.value = t, e === "restore" && this.resetValidity(), this.updateValidity());
  }
  setValue(...t) {
    const [e, o] = t;
    this.internals.setFormValue(e, o);
  }
  get allValidators() {
    const t = this.constructor.validators || [], e = this.validators || [];
    return [...t, ...e];
  }
  /**
   * Reset validity is a way of removing manual custom errors and native validation.
   */
  resetValidity() {
    this.setCustomValidity(""), this.setValidity({});
  }
  updateValidity() {
    if (this.disabled || this.hasAttribute("disabled") || !this.willValidate) {
      this.resetValidity();
      return;
    }
    const t = this.allValidators;
    if (!(t != null && t.length))
      return;
    const e = {
      // Don't trust custom errors from the Browser. Safari breaks the spec.
      customError: !!this.customError
    }, o = this.validationTarget || this.input || void 0;
    let i = "";
    for (const n of t) {
      const { isValid: a, message: r, invalidKeys: s } = n.checkValidity(this);
      a || (i || (i = r), (s == null ? void 0 : s.length) >= 0 && s.forEach((l) => e[l] = !0));
    }
    i || (i = this.validationMessage), this.setValidity(e, i, o);
  }
};
J.formAssociated = !0;
c([
  h({ reflect: !0 })
], J.prototype, "name", 2);
c([
  h({ type: Boolean })
], J.prototype, "disabled", 2);
c([
  h({ state: !0, attribute: !1 })
], J.prototype, "valueHasChanged", 2);
c([
  h({ state: !0, attribute: !1 })
], J.prototype, "hasInteracted", 2);
c([
  h({ attribute: "custom-error", reflect: !0 })
], J.prototype, "customError", 2);
c([
  h({ attribute: !1, state: !0, type: Object })
], J.prototype, "validity", 1);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Qe = {
  small: "s",
  medium: "m",
  large: "l"
}, Ze = /* @__PURE__ */ new Set();
function Pe(t, e) {
  e in Qe && !Ze.has(`${t}:${e}`) && (Ze.add(`${t}:${e}`), console.warn(
    `[${t}] size="${e}" is deprecated. Use size="${Qe[e]}" instead. The long-form value will be removed in the next major version.`
  ));
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var So = class {
  constructor(t, ...e) {
    this.slotNames = [], this.handleSlotChange = (o) => {
      const i = o.target;
      (this.slotNames.includes("[default]") && !i.name || i.name && this.slotNames.includes(i.name)) && this.host.requestUpdate();
    }, (this.host = t).addController(this), this.slotNames = e;
  }
  hasDefaultSlot() {
    return this.host.childNodes ? [...this.host.childNodes].some((t) => {
      if (t.nodeType === Node.TEXT_NODE && t.textContent.trim() !== "")
        return !0;
      if (t.nodeType === Node.ELEMENT_NODE) {
        const e = t;
        if (e.tagName.toLowerCase() === "wa-visually-hidden")
          return !1;
        if (!e.hasAttribute("slot"))
          return !0;
      }
      return !1;
    }) : !1;
  }
  hasNamedSlot(t) {
    var e, o;
    return ((o = (e = this.host).querySelector) == null ? void 0 : o.call(e, `:scope > [slot="${t}"]`)) !== null;
  }
  /**
   * @param slotName     - Name of the slot to look for
   * @param propertyName - Generally we infer via `withHeader` property on the host, but in cases where its different, you can specify a manual property name.
   */
  test(t, e) {
    return e && this.host.didSSR && !this.host.hasUpdated ? !!this.host[e] : t === "[default]" ? this.hasDefaultSlot() : this.hasNamedSlot(t);
  }
  hostConnected() {
    const t = this.host.shadowRoot;
    t && "addEventListener" in t && t.addEventListener("slotchange", this.handleSlotChange);
  }
  hostDisconnected() {
    const t = this.host.shadowRoot;
    t && "removeEventListener" in t && t.removeEventListener("slotchange", this.handleSlotChange);
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var zo = V`
  :host([size='xs']) {
    font-size: var(--wa-font-size-xs);
  }

  :host([size='s']),
  :host([size='small']) {
    font-size: var(--wa-font-size-s);
  }

  :host([size='m']),
  :host([size='medium']) {
    font-size: var(--wa-font-size-m);
  }

  :host([size='l']),
  :host([size='large']) {
    font-size: var(--wa-font-size-l);
  }

  :host([size='xl']) {
    font-size: var(--wa-font-size-xl);
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Oi = V`
  @layer wa-component {
    :host {
      display: inline-block;

      /* Workaround because Chrome doesn't like :host(:has()) below
       * https://issues.chromium.org/issues/40062355
       * Firefox doesn't like this nested rule, so both are needed */
      &:has(wa-badge) {
        position: relative;
      }
    }

    /* Apply relative positioning only when needed to position wa-badge
     * This avoids creating a new stacking context for every button */
    :host(:has(wa-badge)) {
      position: relative;
    }
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    vertical-align: middle;
    transition-property: background, border, box-shadow, color, opacity, transform;
    transition-duration: var(--wa-transition-fast);
    transition-timing-function: var(--wa-transition-easing);
    transform-origin: center;
    cursor: pointer;
    padding: 0 var(--wa-form-control-padding-inline);
    font-family: inherit;
    font-size: inherit;
    font-weight: var(--wa-font-weight-action);
    height: var(--wa-form-control-height);
    width: 100%;

    background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));

    border-color: transparent;
    color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-form-control-border-radius));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-form-control-border-radius));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-form-control-border-radius));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-form-control-border-radius));
    border-style: var(--wa-form-control-border-style);
    border-width: var(--wa-form-control-border-width);
  }

  /* Hover and active transforms */
  .button:not(.disabled):not(.loading) {
    @media (hover: hover) {
      &:hover {
        transform: var(--wa-button-transform-hover);
      }
    }
    &:active {
      transform: var(--wa-button-transform-active);
    }

    @media (prefers-reduced-motion: reduce) {
      &:hover,
      &:active {
        transform: none;
      }
    }
  }

  /* Appearance modifiers */
  :host([appearance='plain']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: transparent;
      border-color: var(--wa-color-border-loud, var(--wa-color-neutral-border-loud));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
        background-color: var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet));
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-quiet, var(--wa-color-neutral-on-quiet));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-quiet, var(--wa-color-neutral-fill-quiet)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='filled-outlined']) {
    /* Indentation overrides for grouping outlined */
    margin-inline-start: var(--_button-horizontal-indent-outlined);
    margin-block-start: var(--_button-vertical-indent-outlined);

    .button {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal));
      border-color: var(--wa-color-border-normal, var(--wa-color-neutral-border-normal));
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      color: var(--wa-color-on-normal, var(--wa-color-neutral-on-normal));
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-normal, var(--wa-color-neutral-fill-normal)),
        var(--wa-color-mix-active)
      );
    }
  }

  :host([appearance='accent']) {
    /* Indentation overrides for grouping */
    margin-inline-start: var(--_button-horizontal-indent);
    margin-block-start: var(--_button-vertical-indent);

    .button {
      color: var(--wa-color-on-loud, var(--wa-color-neutral-on-loud));
      background-color: var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud));
      border-color: transparent;
    }
    @media (hover: hover) {
      .button:not(.disabled):not(.loading):hover {
        background-color: color-mix(
          in oklab,
          var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
          var(--wa-color-mix-hover)
        );
      }
    }
    .button:not(.disabled):not(.loading):active {
      background-color: color-mix(
        in oklab,
        var(--wa-color-fill-loud, var(--wa-color-neutral-fill-loud)),
        var(--wa-color-mix-active)
      );
    }
  }

  /* Focus states */
  .button:focus {
    outline: none;
  }

  .button:focus-visible {
    outline: var(--wa-focus-ring);
    outline-offset: var(--wa-focus-ring-offset);
  }

  /* Disabled state */
  :host([disabled]) {
    opacity: 0.5;
    cursor: not-allowed;

    /* When disabled, prevent mouse events from bubbling up from children */
    .button {
      pointer-events: none;
    }
  }

  /* Keep it last so Safari doesn't stop parsing this block */
  .button::-moz-focus-inner {
    border: 0;
  }

  /* Icon buttons */
  .button.is-icon-button {
    outline-offset: 2px;
    width: var(--wa-form-control-height);
    aspect-ratio: 1;
  }

  /* Icon buttons with a caret need to grow to fit both the icon and the caret */
  .button.is-icon-button.caret {
    width: auto;
    aspect-ratio: auto;
    min-width: var(--wa-form-control-height);
  }

  /* Pill modifier */
  :host([pill]) .button {
    border-start-start-radius: var(--_button-start-start-radius, var(--wa-border-radius-pill));
    border-start-end-radius: var(--_button-start-end-radius, var(--wa-border-radius-pill));
    border-end-start-radius: var(--_button-end-start-radius, var(--wa-border-radius-pill));
    border-end-end-radius: var(--_button-end-end-radius, var(--wa-border-radius-pill));
  }

  /*
   * Label
   */

  .start,
  .end {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .label {
    display: inline-block;
  }

  .is-icon-button .label {
    display: flex;
    justify-content: center;
  }

  .label::slotted(wa-icon) {
    align-self: center;
  }

  /*
   * Caret modifier
   */

  wa-icon[part='caret'] {
    display: flex;
    align-self: center;
    align-items: center;

    &::part(svg) {
      width: 0.875em;
      height: 0.875em;
    }

    .button:has(&) .end {
      display: none;
    }
  }

  /*
   * Loading modifier
   */

  .loading {
    position: relative;
    cursor: wait;

    .start,
    .label,
    .end,
    .caret {
      /* Hidden with opacity, not visibility, so the label stays in the accessibility tree */
      opacity: 0;

      /* Unlike visibility: hidden, opacity leaves the content clickable */
      pointer-events: none;
    }

    wa-spinner {
      --indicator-color: currentColor;
      --track-color: color-mix(in oklab, currentColor, transparent 90%);

      position: absolute;
      font-size: 1em;
      height: 1em;
      width: 1em;
      top: calc(50% - 0.5em);
      left: calc(50% - 0.5em);
    }
  }

  /*
   * Badges
   */

  .button ::slotted(wa-badge) {
    border-color: var(--wa-color-surface-default);
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    translate: 50% -50%;
    pointer-events: none;
  }

  :host(:dir(rtl)) ::slotted(wa-badge) {
    translate: -50% -50%;
  }

  /*
  * Button spacing
  */

  slot[name='start']::slotted(*) {
    margin-inline-end: 0.75em;
  }

  slot[name='end']::slotted(*),
  .button:not(.visually-hidden-label) [part='caret'] {
    margin-inline-start: 0.75em;
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Ao = V`
  :where(:root),
  .wa-neutral,
  :host([variant='neutral']) {
    --wa-color-fill-loud: var(--wa-color-neutral-fill-loud);
    --wa-color-fill-normal: var(--wa-color-neutral-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-neutral-fill-quiet);
    --wa-color-border-loud: var(--wa-color-neutral-border-loud);
    --wa-color-border-normal: var(--wa-color-neutral-border-normal);
    --wa-color-border-quiet: var(--wa-color-neutral-border-quiet);
    --wa-color-on-loud: var(--wa-color-neutral-on-loud);
    --wa-color-on-normal: var(--wa-color-neutral-on-normal);
    --wa-color-on-quiet: var(--wa-color-neutral-on-quiet);
  }

  .wa-brand,
  :host([variant='brand']) {
    --wa-color-fill-loud: var(--wa-color-brand-fill-loud);
    --wa-color-fill-normal: var(--wa-color-brand-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-brand-fill-quiet);
    --wa-color-border-loud: var(--wa-color-brand-border-loud);
    --wa-color-border-normal: var(--wa-color-brand-border-normal);
    --wa-color-border-quiet: var(--wa-color-brand-border-quiet);
    --wa-color-on-loud: var(--wa-color-brand-on-loud);
    --wa-color-on-normal: var(--wa-color-brand-on-normal);
    --wa-color-on-quiet: var(--wa-color-brand-on-quiet);
  }

  .wa-success,
  :host([variant='success']) {
    --wa-color-fill-loud: var(--wa-color-success-fill-loud);
    --wa-color-fill-normal: var(--wa-color-success-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-success-fill-quiet);
    --wa-color-border-loud: var(--wa-color-success-border-loud);
    --wa-color-border-normal: var(--wa-color-success-border-normal);
    --wa-color-border-quiet: var(--wa-color-success-border-quiet);
    --wa-color-on-loud: var(--wa-color-success-on-loud);
    --wa-color-on-normal: var(--wa-color-success-on-normal);
    --wa-color-on-quiet: var(--wa-color-success-on-quiet);
  }

  .wa-warning,
  :host([variant='warning']) {
    --wa-color-fill-loud: var(--wa-color-warning-fill-loud);
    --wa-color-fill-normal: var(--wa-color-warning-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-warning-fill-quiet);
    --wa-color-border-loud: var(--wa-color-warning-border-loud);
    --wa-color-border-normal: var(--wa-color-warning-border-normal);
    --wa-color-border-quiet: var(--wa-color-warning-border-quiet);
    --wa-color-on-loud: var(--wa-color-warning-on-loud);
    --wa-color-on-normal: var(--wa-color-warning-on-normal);
    --wa-color-on-quiet: var(--wa-color-warning-on-quiet);
  }

  .wa-danger,
  :host([variant='danger']) {
    --wa-color-fill-loud: var(--wa-color-danger-fill-loud);
    --wa-color-fill-normal: var(--wa-color-danger-fill-normal);
    --wa-color-fill-quiet: var(--wa-color-danger-fill-quiet);
    --wa-color-border-loud: var(--wa-color-danger-border-loud);
    --wa-color-border-normal: var(--wa-color-danger-border-normal);
    --wa-color-border-quiet: var(--wa-color-danger-border-quiet);
    --wa-color-on-loud: var(--wa-color-danger-on-loud);
    --wa-color-on-normal: var(--wa-color-danger-on-normal);
    --wa-color-on-quiet: var(--wa-color-danger-on-quiet);
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function B(t, e) {
  const o = {
    waitUntilFirstUpdate: !1,
    ...e
  };
  return (i, n) => {
    const { update: a } = i, r = Array.isArray(t) ? t : [t];
    i.update = function(s) {
      r.forEach((l) => {
        const d = l;
        if (s.has(d)) {
          const u = s.get(d), m = this[d];
          u !== m && (!o.waitUntilFirstUpdate || this.hasUpdated) && this[n](u, m);
        }
      }), a.call(this, s);
    };
  };
}
const Le = /* @__PURE__ */ new Set(), Ct = /* @__PURE__ */ new Map();
let K, Me = "ltr", Fe = "en";
const $o = typeof MutationObserver < "u" && typeof document < "u" && typeof document.documentElement < "u";
if ($o) {
  const t = new MutationObserver(Eo);
  Me = document.documentElement.dir || "ltr", Fe = document.documentElement.lang || navigator.language, t.observe(document.documentElement, {
    attributes: !0,
    attributeFilter: ["dir", "lang"]
  });
}
function ko(...t) {
  t.map((e) => {
    const o = e.$code.toLowerCase();
    Ct.has(o) ? Ct.set(o, Object.assign(Object.assign({}, Ct.get(o)), e)) : Ct.set(o, e), K || (K = e);
  }), Eo();
}
function Eo() {
  $o && (Me = document.documentElement.dir || "ltr", Fe = document.documentElement.lang || navigator.language), [...Le.keys()].map((t) => {
    typeof t.requestUpdate == "function" && t.requestUpdate();
  });
}
let Ri = class {
  constructor(e) {
    this.host = e, this.host.addController(this);
  }
  hostConnected() {
    Le.add(this.host);
  }
  hostDisconnected() {
    Le.delete(this.host);
  }
  dir() {
    return `${this.host.dir || Me}`.toLowerCase();
  }
  lang() {
    const e = `${this.host.lang || Fe}`.toLowerCase().replace(/_/g, "-");
    try {
      return new Intl.Locale(e), e;
    } catch {
      return K ? K.$code.toLowerCase() : "en";
    }
  }
  getTranslationData(e) {
    var o, i;
    let n;
    try {
      n = new Intl.Locale(e.replace(/_/g, "-"));
    } catch {
      return { locale: void 0, language: "", region: "", primary: void 0, secondary: void 0 };
    }
    const a = n.language.toLowerCase(), r = (i = (o = n.region) === null || o === void 0 ? void 0 : o.toLowerCase()) !== null && i !== void 0 ? i : "", s = Ct.get(`${a}-${r}`), l = Ct.get(a);
    return { locale: n, language: a, region: r, primary: s, secondary: l };
  }
  exists(e, o) {
    var i;
    const { primary: n, secondary: a } = this.getTranslationData((i = o.lang) !== null && i !== void 0 ? i : this.lang());
    return o = Object.assign({ includeFallback: !1 }, o), !!(n && n[e] || a && a[e] || o.includeFallback && K && K[e]);
  }
  term(e, ...o) {
    const { primary: i, secondary: n } = this.getTranslationData(this.lang());
    let a;
    if (i && i[e])
      a = i[e];
    else if (n && n[e])
      a = n[e];
    else if (K && K[e])
      a = K[e];
    else
      return console.error(`No translation found for: ${String(e)}`), String(e);
    return typeof a == "function" ? a(...o) : a;
  }
  date(e, o) {
    return e = new Date(e), new Intl.DateTimeFormat(this.lang(), o).format(e);
  }
  number(e, o) {
    return e = Number(e), isNaN(e) ? "" : new Intl.NumberFormat(this.lang(), o).format(e);
  }
  relativeTime(e, o, i) {
    return new Intl.RelativeTimeFormat(this.lang(), i).format(e, o);
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var _o = {
  $code: "en",
  $name: "English",
  $dir: "ltr",
  allTagsRemoved: "All tags removed",
  am: "AM",
  autosizeColumn: "Autosize column",
  captions: "Captions",
  carousel: "Carousel",
  chooseDate: "Choose date",
  chooseDecade: "Choose decade",
  chooseMonth: "Choose month",
  chooseTime: "Choose time",
  chooseYear: "Choose year",
  clearEntry: "Clear entry",
  clearFilter: "Clear filter",
  clearSort: "Clear sort",
  close: "Close",
  closeCalendar: "Close calendar",
  closeTimeInput: "Close time picker",
  collapseRow: "Collapse row",
  columnMenu: "Column options",
  columnMovedToPosition: (t, e, o) => `${t} moved to position ${e} of ${o}`,
  columns: "Columns",
  compactPageXOfY: (t, e) => `${t} of ${e}`,
  completed: "Completed",
  copied: "Copied",
  copy: "Copy",
  createOption: (t) => `Create "${t}"`,
  currentlyPlaying: "currently playing",
  currentValue: "Current value",
  date: "Date",
  datePickerKeyboardHelp: "Use arrow keys to change values; press Alt+Down Arrow to open the calendar.",
  day: "Day",
  dayPeriod: "AM/PM",
  decrement: "Decrement",
  deselectAllRows: "Deselect all rows",
  disabled: "Disabled",
  dropFileHere: "Drop file here or click to browse",
  dropFilesHere: "Drop files here or click to browse",
  empty: "Empty",
  endDate: "End date",
  enterFullscreen: "Enter fullscreen",
  error: "Error",
  exitFullscreen: "Exit fullscreen",
  expandRow: "Expand row",
  filterByColumn: (t) => `Filter by ${t}`,
  filterFrom: "From",
  filterMax: "Max",
  filterMin: "Min",
  filterTo: "To",
  firstPage: "First page",
  goToSlide: (t, e) => `Go to slide ${t} of ${e}`,
  hideColumn: "Hide column",
  hidePassword: "Hide password",
  hour: "Hour",
  incompleteDate: "Enter a valid date.",
  increment: "Increment",
  jumpBackwardX: (t) => `Jump back ${t} pages`,
  jumpForwardX: (t) => `Jump forward ${t} pages`,
  lastPage: "Last page",
  loading: "Loading",
  locked: "Locked",
  minute: "Minute",
  month: "Month",
  moreOptions: "More Options",
  mute: "Mute",
  nextDecade: "Next decade",
  nextMonth: "Next month",
  nextPage: "Next page",
  nextSlide: "Next slide",
  nextVideo: "Next Video",
  nextYear: "Next year",
  noData: "No data",
  noOptions: "No options",
  noResults: "No matching results",
  notCompleted: "Not completed",
  now: "Now",
  numCharacters: (t) => t === 1 ? "1 character" : `${t} characters`,
  numCharactersRemaining: (t) => t === 1 ? "1 character remaining" : `${t} characters remaining`,
  numOptionsAvailable: (t) => t === 0 ? "No options available" : t === 1 ? "1 option available" : `${t} options available`,
  numOptionsSelected: (t) => t === 0 ? "No options selected" : t === 1 ? "1 option selected" : `${t} options selected`,
  numRowsCopied: (t) => t === 1 ? "1 row copied" : `${t} rows copied`,
  numRowsSelected: (t) => t === 1 ? "1 row selected" : `${t} rows selected`,
  optionPosition: (t, e, o) => `${t}, ${e} of ${o}`,
  optionsLoadError: "Options could not be loaded",
  pageXOfY: (t, e) => `Page ${t} of ${e}`,
  pagination: "Pagination",
  pause: "Pause",
  pauseAnimation: "Pause animation",
  pictureInPicture: "Picture in picture",
  pinLeft: "Pin left",
  pinRight: "Pin right",
  play: "Play",
  playAnimation: "Play animation",
  playbackSpeed: "Playback speed",
  playlist: "Playlist",
  pm: "PM",
  previousDecade: "Previous decade",
  previousMonth: "Previous month",
  previousPage: "Previous page",
  previousSlide: "Previous slide",
  previousVideo: "Previous video",
  previousYear: "Previous year",
  progress: "Progress",
  rangeTooLong: (t) => t === 1 ? "Select a range no longer than 1 day" : `Select a range no longer than ${t} days`,
  rangeTooShort: (t) => t === 1 ? "Select a range at least 1 day long" : `Select a range at least ${t} days long`,
  readonly: "Read-only",
  remove: "Remove",
  resetColumns: "Reset columns",
  resize: "Resize",
  resizeColumn: "Resize column",
  rowsPerPage: "Rows per page",
  scrollableRegion: "Scrollable region",
  scrollToEnd: "Scroll to end",
  scrollToStart: "Scroll to start",
  search: "Search",
  second: "Second",
  seek: "Seek",
  seekProgress: (t, e) => `${t} of ${e}`,
  selectAColorFromTheScreen: "Select a color from the screen",
  selectAllRows: "Select all rows",
  selected: "Selected",
  selectedDateLabel: (t) => `Selected: ${t}`,
  selectedRangeLabel: (t) => `Selected range: ${t}`,
  selectGroup: "Select group",
  selectionCleared: "Selection cleared",
  selectRow: "Select row",
  showingNofMRows: (t, e) => `Showing ${t} of ${e} rows`,
  showingXtoYofZ: (t, e, o) => `${t}–${e} of ${o}`,
  showPassword: "Show password",
  slideNum: (t) => `Slide ${t}`,
  sortAscending: "Sort ascending",
  sortColumn: "Sort column",
  sortDescending: "Sort descending",
  startDate: "Start date",
  steps: "Steps",
  stepXOfY: (t, e) => `Step ${t} of ${e}`,
  tagAdded: (t) => `${t} added`,
  tagAlreadyAdded: (t) => `${t} is already added`,
  tagInputKeyboardHelp: "Press Backspace or Delete to remove this tag.",
  tagRemoved: (t) => `${t} removed`,
  time: "Time",
  timeInputKeyboardHelp: "Use arrow keys to change values; press Alt+Down Arrow to open the time picker.",
  today: "Today",
  toggleColorFormat: "Toggle color format",
  tooFewTags: (t) => t === 1 ? "Add at least 1 tag" : `Add at least ${t} tags`,
  tooManyTags: (t) => t === 1 ? "Add no more than 1 tag" : `Add no more than ${t} tags`,
  unmute: "Unmute",
  unpin: "Unpin",
  unpinColumn: "Unpin column",
  videoPlayer: "Video player",
  volume: "Volume",
  year: "Year",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out"
};
ko(_o);
var Ti = _o;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var oe = class extends Ri {
  lang() {
    return this.host.didSSR && !this.host.hasUpdated ? this.host.lang || "en" : super.lang();
  }
};
ko(Ti);
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Ii = { ATTRIBUTE: 1 }, Bi = (t) => (...e) => ({ _$litDirective$: t, values: e });
let Di = class {
  constructor(e) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(e, o, i) {
    this._$Ct = e, this._$AM = o, this._$Ci = i;
  }
  _$AS(e, o) {
    return this.update(e, o);
  }
  update(e, o) {
    return this.render(...o);
  }
};
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Gt = Bi(class extends Di {
  constructor(t) {
    var e;
    if (super(t), t.type !== Ii.ATTRIBUTE || t.name !== "class" || ((e = t.strings) == null ? void 0 : e.length) > 2) throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.");
  }
  render(t) {
    return " " + Object.keys(t).filter((e) => t[e]).join(" ") + " ";
  }
  update(t, [e]) {
    var i, n;
    if (this.st === void 0) {
      this.st = /* @__PURE__ */ new Set(), t.strings !== void 0 && (this.nt = new Set(t.strings.join(" ").split(/\s/).filter((a) => a !== "")));
      for (const a in e) e[a] && !((i = this.nt) != null && i.has(a)) && this.st.add(a);
      return this.render(e);
    }
    const o = t.element.classList;
    for (const a of this.st) a in e || (o.remove(a), this.st.delete(a));
    for (const a in e) {
      const r = !!e[a];
      r === this.st.has(a) || (n = this.nt) != null && n.has(a) || (r ? (o.add(a), this.st.add(a)) : (o.remove(a), this.st.delete(a)));
    }
    return ft;
  }
});
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const T = (t) => t ?? k;
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Po = Symbol.for(""), Ni = (t) => {
  if ((t == null ? void 0 : t.r) === Po) return t == null ? void 0 : t._$litStatic$;
}, Je = (t, ...e) => ({ _$litStatic$: e.reduce((o, i, n) => o + ((a) => {
  if (a._$litStatic$ !== void 0) return a._$litStatic$;
  throw Error(`Value passed to 'literal' function must be a 'literal' result: ${a}. Use 'unsafeStatic' to pass non-literal values, but
            take care to ensure page security.`);
})(i) + t[n + 1], t[0]), r: Po }), to = /* @__PURE__ */ new Map(), Ui = (t) => (e, ...o) => {
  const i = o.length;
  let n, a;
  const r = [], s = [];
  let l, d = 0, u = !1;
  for (; d < i; ) {
    for (l = e[d]; d < i && (a = o[d], (n = Ni(a)) !== void 0); ) l += n + e[++d], u = !0;
    d !== i && s.push(a), r.push(l), d++;
  }
  if (d === i && r.push(e[i]), u) {
    const m = r.join("$$lit$$");
    (e = to.get(m)) === void 0 && (r.raw = r, to.set(m, e = r)), o = s;
  }
  return t(e, ...o);
}, me = Ui(O);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var b = class extends J {
  constructor() {
    super(...arguments), this.assumeInteractionOn = ["click"], this.hasSlotController = new So(this, "[default]", "start", "end"), this.localize = new oe(this), this.invalid = !1, this.isIconButton = !1, this.title = "", this.variant = "neutral", this.appearance = "accent", this.size = "m", this.withCaret = !1, this.withStart = !1, this.withEnd = !1, this.disabled = !1, this.loading = !1, this.pill = !1, this.type = "button";
  }
  static get validators() {
    return [...super.validators, oi()];
  }
  handleSizeChange() {
    Pe(this.localName, this.size);
  }
  constructLightDOMButton() {
    const t = document.createElement("button");
    for (const e of this.attributes)
      e.name !== "style" && t.setAttribute(e.name, e.value);
    return t.type = this.type, t.style.position = "absolute !important", t.style.width = "0 !important", t.style.height = "0 !important", t.style.clipPath = "inset(50%) !important", t.style.overflow = "hidden !important", t.style.whiteSpace = "nowrap !important", this.name && (t.name = this.name), t.value = this.value || "", t;
  }
  handleClick(t) {
    var i;
    if (this.disabled || this.loading) {
      t.preventDefault(), t.stopImmediatePropagation();
      return;
    }
    if (this.type !== "submit" && this.type !== "reset" || !this.getForm()) return;
    const o = this.constructLightDOMButton();
    (i = this.parentElement) == null || i.append(o), o.click(), o.remove();
  }
  handleInvalid() {
    this.dispatchEvent(new go());
  }
  handleLabelSlotChange() {
    const t = this.labelSlot.assignedNodes({ flatten: !0 });
    let e = !1, o = !1, i = !1, n = !1;
    [...t].forEach((a) => {
      var r;
      if (a.nodeType === Node.ELEMENT_NODE) {
        const s = a;
        s.localName === "wa-icon" ? (o = !0, e || (e = s.label !== void 0)) : n = !0;
      } else a.nodeType === Node.TEXT_NODE && (((r = a.textContent) == null ? void 0 : r.trim()) || "").length > 0 && (i = !0);
    }), this.isIconButton = o && !i && !n, this.customStates.set("icon-button", this.isIconButton), this.isIconButton && !e && console.warn(
      'Icon buttons must have a label for screen readers. Add <wa-icon label="..."> to remove this warning.',
      this
    );
  }
  isButton() {
    return !this.href;
  }
  isLink() {
    return !!this.href;
  }
  handleDisabledChange() {
    this.customStates.set("disabled", this.disabled), this.updateValidity();
  }
  handleHrefChange() {
    this.customStates.set("link", this.isLink());
  }
  handleLoadingChange() {
    this.customStates.set("loading", this.loading);
  }
  // eslint-disable-next-line
  setValue(...t) {
  }
  /** Simulates a click on the button. */
  click() {
    this.button.click();
  }
  /** Sets focus on the button. */
  focus(t) {
    this.button.focus(t);
  }
  /** Removes focus from the button. */
  blur() {
    this.button.blur();
  }
  render() {
    const t = this.isLink(), e = t ? Je`a` : Je`button`;
    return me`
      <${e}
        part="base button"
        class=${Gt({
      button: !0,
      caret: this.withCaret,
      disabled: this.disabled,
      loading: this.loading,
      rtl: this.localize.dir() === "rtl",
      "has-label": this.hasSlotController.test("[default]"),
      "has-start": this.hasSlotController.test("start", "withStart"),
      "has-end": this.hasSlotController.test("end", "withEnd"),
      "is-icon-button": this.isIconButton
    })}
        ?disabled=${T(t ? void 0 : this.disabled)}
        type=${T(t ? void 0 : this.type)}
        title=${this.title}
        name=${T(t ? void 0 : this.name)}
        value=${T(t ? void 0 : this.value)}
        href=${T(t ? this.href : void 0)}
        target=${T(t ? this.target : void 0)}
        download=${T(t ? this.download : void 0)}
        rel=${T(t && this.rel ? this.rel : void 0)}
        role=${T(t ? void 0 : "button")}
        aria-disabled=${T(t && this.disabled ? "true" : void 0)}
        aria-busy=${this.loading ? "true" : "false"}
        tabindex=${this.disabled ? "-1" : "0"}
        @invalid=${this.isButton() ? this.handleInvalid : null}
        @click=${this.handleClick}
      >
        <slot name="start" part="start" class="start"></slot>
        <slot part="label" class="label" @slotchange=${this.handleLabelSlotChange}></slot>
        <slot name="end" part="end" class="end"></slot>
        ${this.withCaret ? me`
                <wa-icon part="caret" class="caret" library="system" name="chevron-down" variant="solid"></wa-icon>
              ` : ""}
        ${this.loading ? me`<wa-spinner part="spinner"></wa-spinner>` : ""}
      </${e}>
    `;
  }
};
b.shadowRootOptions = { ...J.shadowRootOptions, delegatesFocus: !0 };
b.css = [Oi, Ao, zo];
c([
  I(".button")
], b.prototype, "button", 2);
c([
  I("slot:not([name])")
], b.prototype, "labelSlot", 2);
c([
  Vt()
], b.prototype, "invalid", 2);
c([
  Vt()
], b.prototype, "isIconButton", 2);
c([
  h()
], b.prototype, "title", 2);
c([
  h({ reflect: !0 })
], b.prototype, "variant", 2);
c([
  h({ reflect: !0 })
], b.prototype, "appearance", 2);
c([
  h({ reflect: !0 })
], b.prototype, "size", 2);
c([
  B("size")
], b.prototype, "handleSizeChange", 1);
c([
  h({ attribute: "with-caret", type: Boolean, reflect: !0 })
], b.prototype, "withCaret", 2);
c([
  h({ attribute: "with-start", type: Boolean })
], b.prototype, "withStart", 2);
c([
  h({ attribute: "with-end", type: Boolean })
], b.prototype, "withEnd", 2);
c([
  h({ type: Boolean })
], b.prototype, "disabled", 2);
c([
  h({ type: Boolean, reflect: !0 })
], b.prototype, "loading", 2);
c([
  h({ type: Boolean, reflect: !0 })
], b.prototype, "pill", 2);
c([
  h()
], b.prototype, "type", 2);
c([
  h({ reflect: !0 })
], b.prototype, "name", 2);
c([
  h({ reflect: !0 })
], b.prototype, "value", 2);
c([
  h({ reflect: !0 })
], b.prototype, "href", 2);
c([
  h()
], b.prototype, "target", 2);
c([
  h()
], b.prototype, "rel", 2);
c([
  h()
], b.prototype, "download", 2);
c([
  h({ attribute: "formaction" })
], b.prototype, "formAction", 2);
c([
  h({ attribute: "formenctype" })
], b.prototype, "formEnctype", 2);
c([
  h({ attribute: "formmethod" })
], b.prototype, "formMethod", 2);
c([
  h({ attribute: "formnovalidate", type: Boolean })
], b.prototype, "formNoValidate", 2);
c([
  h({ attribute: "formtarget" })
], b.prototype, "formTarget", 2);
c([
  B("disabled", { waitUntilFirstUpdate: !0 })
], b.prototype, "handleDisabledChange", 1);
c([
  B("href")
], b.prototype, "handleHrefChange", 1);
c([
  B("loading", { waitUntilFirstUpdate: !0 })
], b.prototype, "handleLoadingChange", 1);
b = c([
  at("wa-button")
], b);
var po;
(po = b.disableWarning) == null || po.call(b, "change-in-update");
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Vi = V`
  :host {
    --track-width: 2px;
    --track-color: var(--wa-color-neutral-fill-normal);
    --indicator-color: var(--wa-color-brand-fill-loud);
    --speed: 2s;
    --size: 1em;

    /*
      Resizing a spinner element using anything but font-size will break the animation because the animation uses em
      units. Therefore, if a spinner is used in a flex container without \`flex: none\` applied, the spinner can
      grow/shrink and break the animation. The use of \`flex: none\` on the host element prevents this by always having
      the spinner sized according to its actual dimensions.
    */
    flex: none;
    display: inline-flex;
    width: var(--size);
    height: var(--size);
  }

  svg {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    animation: spin var(--speed) linear infinite;
  }

  .track,
  .indicator {
    --radius: calc(var(--size) / 2 - var(--track-width) / 2);
    --circumference: calc(var(--radius) * 2 * 3.141592654);

    cx: calc(var(--size) / 2);
    cy: calc(var(--size) / 2);
    r: var(--radius);
    fill: none;
    stroke-width: var(--track-width);
  }

  .track {
    stroke: var(--track-color);
  }

  .indicator {
    stroke: var(--indicator-color);
    stroke-linecap: round;
    stroke-dasharray: calc(0.597 * var(--circumference)), calc(0.796 * var(--circumference));
    stroke-dashoffset: calc(-0.04 * var(--circumference));
    animation: dash 1.5s ease-in-out infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: calc(0.008 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.278 * var(--circumference));
    }
    100% {
      stroke-dasharray: calc(0.716 * var(--circumference)), calc(1.194 * var(--circumference));
      stroke-dashoffset: calc(-0.987 * var(--circumference));
    }
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var xe = class extends q {
  constructor() {
    super(...arguments), this.localize = new oe(this);
  }
  render() {
    return O`
      <svg
        part="base spinner"
        role="progressbar"
        aria-label=${this.localize.term("loading")}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle class="track" />
        <circle class="indicator" />
      </svg>
    `;
  }
};
xe.css = Vi;
xe = c([
  at("wa-spinner")
], xe);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var qi = class extends Event {
  constructor() {
    super("wa-error", { bubbles: !0, cancelable: !1, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Hi = class extends Event {
  constructor() {
    super("wa-load", { bubbles: !0, cancelable: !1, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var ji = V`
  :host {
    --primary-color: currentColor;
    --primary-opacity: 1;
    --secondary-color: currentColor;
    --secondary-opacity: 0.4;
    --rotate-angle: 0deg;

    box-sizing: content-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: -0.125em;
  }

  /* #region Canvas — the box the icon is centered within (mirrors Font Awesome's icon canvas). Orthogonal to font-size. */

  /* Fixed width (default): 1.25em × 1em (20 × 16px) */
  :host(:not([canvas])),
  :host([canvas='fixed']) {
    width: 1.25em;
    height: 1em;
    min-width: 1.25em; /* <-- this is what Safari respects for intrinsic */
    min-height: 1em;
  }

  /* Auto: hug the icon's width. \`auto-width\` is the deprecated alias for canvas="auto". */
  :host([canvas='auto']),
  :host([auto-width]:not([canvas])) {
    width: auto;
    height: 1em;
  }

  /* Square: 1.25em × 1.25em (20 × 20px) */
  :host([canvas='square']) {
    width: 1.25em;
    height: 1.25em;
    min-width: 1.25em;
    min-height: 1.25em;
  }

  /* Roomy: 1.5em × 1.5em (24 × 24px) */
  :host([canvas='roomy']) {
    width: 1.5em;
    height: 1.5em;
    min-width: 1.5em;
    min-height: 1.5em;
  }

  /* #endregion */

  svg {
    /* NOTE: Avoid setting fill here. A stylesheet rule beats SVG presentation attributes, breaking stroke-based
       libraries like Lucide (fill="none" stroke="currentColor") and attribute-based mutators (issue #1733). The default
       library applies fill="currentColor" in its mutator instead. */
    height: 1em;
    overflow: visible;
    width: auto;

    /* Duotone colors with path-specific opacity fallback */
    path[data-duotone-primary] {
      color: var(--primary-color);
      opacity: var(--path-opacity, var(--primary-opacity));
    }

    path[data-duotone-secondary] {
      color: var(--secondary-color);
      opacity: var(--path-opacity, var(--secondary-opacity));
    }
  }

  /* Rotation */
  :host([rotate]) {
    transform: rotate(var(--rotate-angle, 0deg));
  }

  /* Flipping */
  :host([flip='x']) {
    transform: scaleX(-1);
  }
  :host([flip='y']) {
    transform: scaleY(-1);
  }
  :host([flip='both']) {
    transform: scale(-1, -1);
  }

  /* Rotation and Flipping combined */
  :host([rotate][flip='x']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleX(-1);
  }
  :host([rotate][flip='y']) {
    transform: rotate(var(--rotate-angle, 0deg)) scaleY(-1);
  }
  :host([rotate][flip='both']) {
    transform: rotate(var(--rotate-angle, 0deg)) scale(-1, -1);
  }

  /* #region Animations — ported from Font Awesome 7.3 (--fa-* props mapped to wa-icon's --* names) */

  :host([animation='beat']) {
    animation-name: beat;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='bounce']) {
    animation-name: bounce;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));
  }

  :host([animation='fade']) {
    animation-name: fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='beat-fade']) {
    animation-name: beat-fade;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='flip']) {
    animation-name: flip;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1.5s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='flip-360']) {
    animation-name: flip-360;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='shake']) {
    animation-name: shake;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.75s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
  }

  :host([animation='spin']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-pulse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, steps(8));
  }

  /* spin-reverse is FA's reverse modifier expressed as a standalone value; reverse any spin via --animation-direction: reverse */
  :host([animation='spin-reverse']) {
    animation-name: spin;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, reverse);
    animation-duration: var(--animation-duration, 2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap']) {
    animation-name: spin-snap;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 3s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap-4']) {
    animation-name: spin-snap-4;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 2.4s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='spin-snap-8']) {
    animation-name: spin-snap-8;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 4s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='buzz']) {
    animation-name: buzz;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.6s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, linear);
  }

  :host([animation='wag']) {
    animation-name: wag;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.9s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
    transform-origin: bottom center;
  }

  :host([animation='float']) {
    animation-name: float;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 3s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-in-out);
    will-change: transform;
  }

  :host([animation='swing']) {
    animation-name: swing;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 1.2s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
    transform-origin: top center;
  }

  :host([animation='jello']) {
    animation-name: jello;
    animation-delay: var(--animation-delay, 0s);
    animation-direction: var(--animation-direction, normal);
    animation-duration: var(--animation-duration, 0.9s);
    animation-iteration-count: var(--animation-iteration-count, infinite);
    animation-timing-function: var(--animation-timing, ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    :host([animation='beat']),
    :host([animation='bounce']),
    :host([animation='fade']),
    :host([animation='beat-fade']),
    :host([animation='flip']),
    :host([animation='flip-360']),
    :host([animation='shake']),
    :host([animation='spin']),
    :host([animation='spin-pulse']),
    :host([animation='spin-reverse']),
    :host([animation='spin-snap']),
    :host([animation='spin-snap-4']),
    :host([animation='spin-snap-8']),
    :host([animation='buzz']),
    :host([animation='wag']),
    :host([animation='float']),
    :host([animation='swing']),
    :host([animation='jello']) {
      animation: none !important;
      transition: none !important;
    }
  }

  /* #endregion */

  /* #region Keyframes — ported verbatim from Font Awesome 7.3 */

  @keyframes beat {
    0% {
      transform: scale(1);
    }
    25% {
      transform: scale(calc(1.25 * var(--beat-scale, 1.25)));
    }
    45% {
      transform: scale(calc(1.22 * var(--beat-scale, 1.22)));
    }
    65% {
      transform: scale(calc(1.25 * var(--beat-scale, 1.25)));
    }
    90% {
      transform: scale(1);
    }
  }

  @keyframes bounce {
    0% {
      transform: scale(1, 1) translateY(0);
      /* No fallback by design (ported from FA 7.3): the first segment uses the user's --animation-timing or the CSS
         initial ease, while the explicit cubic-beziers on later stops drive the bounce physics. */
      animation-timing-function: var(--animation-timing);
    }
    14% {
      transform: scale(var(--bounce-start-scale-x, 1.06), var(--bounce-start-scale-y, 0.94))
        translateY(var(--bounce-anticipation, 3px));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    32% {
      transform: scale(var(--bounce-jump-scale-x, 0.94), var(--bounce-jump-scale-y, 1.12))
        translateY(calc(-1 * var(--bounce-height, 0.5em)));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    52% {
      transform: scale(1, 1) translateY(calc(-1 * var(--bounce-height, 0.5em) * 1.1));
      animation-timing-function: cubic-bezier(0.5, 0, 1, 0.5);
    }
    70% {
      transform: scale(var(--bounce-land-scale-x, 1.06), var(--bounce-land-scale-y, 0.92)) translateY(0);
      animation-timing-function: cubic-bezier(0.33, 0.33, 0.66, 1);
    }
    85% {
      transform: scale(0.98, 1.04) translateY(calc(-2px * var(--bounce-rebound, 1)));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: scale(1, 1) translateY(0);
    }
  }

  @keyframes fade {
    0% {
      opacity: 1;
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    40% {
      opacity: var(--fade-opacity, 0.4);
      transform: scale(0.98);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes beat-fade {
    0% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    25% {
      opacity: calc(var(--beat-fade-opacity, 0.4) + 0.4);
      transform: scale(var(--beat-fade-scale, 1.28));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    45% {
      opacity: 1;
      transform: scale(var(--beat-fade-scale, 1.25));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    65% {
      opacity: calc(var(--beat-fade-opacity, 0.4) + 0.4);
      transform: scale(var(--beat-fade-scale, 1.28));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    100% {
      opacity: var(--beat-fade-opacity, 0.4);
      transform: scale(1);
    }
  }

  @keyframes flip {
    0% {
      transform: perspective(2em) scale(1) rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    8% {
      transform: perspective(2em) scale(var(--flip-anticipation-scale, 0.95))
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    35% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.6));
      animation-timing-function: linear;
    }
    65% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.5));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    92% {
      transform: perspective(2em) scale(1)
        rotate3d(
          var(--flip-x, 0),
          var(--flip-y, 1),
          var(--flip-z, 0),
          calc(var(--flip-angle, -360deg) * var(--flip-overshoot, 1.04))
        );
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -360deg));
    }
  }

  @keyframes flip-360 {
    0% {
      transform: perspective(2em) scale(1) rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.4, 1);
    }
    8% {
      transform: perspective(2em) scale(var(--flip-anticipation-scale, 0.95))
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), 0deg);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    50% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), calc(var(--flip-angle, -360deg) * 0.6));
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    80% {
      transform: perspective(2em) scale(1)
        rotate3d(
          var(--flip-x, 0),
          var(--flip-y, 1),
          var(--flip-z, 0),
          calc(var(--flip-angle, -360deg) * var(--flip-overshoot, 1.04))
        );
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: perspective(2em) scale(1)
        rotate3d(var(--flip-x, 0), var(--flip-y, 1), var(--flip-z, 0), var(--flip-angle, -360deg));
    }
  }

  @keyframes shake {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    8% {
      transform: rotate(35deg) translateX(1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    20% {
      transform: rotate(-22deg) translateX(-1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    35% {
      transform: rotate(15deg) translateX(1px);
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    50% {
      transform: rotate(-9deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    65% {
      transform: rotate(5deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    78% {
      transform: rotate(-3deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    90% {
      transform: rotate(1deg);
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    12% {
      transform: rotate(60deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    16.67% {
      transform: rotate(60deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    28.67% {
      transform: rotate(120deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    33.33% {
      transform: rotate(120deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    45.33% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    62% {
      transform: rotate(240deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    66.67% {
      transform: rotate(240deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    78.67% {
      transform: rotate(300deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    83.33% {
      transform: rotate(300deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    95.33% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap-4 {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    15% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    25% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    40% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    65% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    75% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    90% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes spin-snap-8 {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    9% {
      transform: rotate(45deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    12.5% {
      transform: rotate(45deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    21.5% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    25% {
      transform: rotate(90deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    34% {
      transform: rotate(135deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    37.5% {
      transform: rotate(135deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    46.5% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: rotate(180deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    59% {
      transform: rotate(225deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    62.5% {
      transform: rotate(225deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    71.5% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    75% {
      transform: rotate(270deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    84% {
      transform: rotate(315deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    87.5% {
      transform: rotate(315deg);
      animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    }
    96.5% {
      transform: rotate(360deg);
      animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes buzz {
    0% {
      transform: translateX(0) rotate(0deg);
      animation-timing-function: cubic-bezier(0.1, 0, 0.9, 1);
    }
    5% {
      transform: translateX(var(--buzz-distance, 4px)) rotate(0.5deg);
    }
    10% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px))) rotate(-0.5deg);
    }
    15% {
      transform: translateX(var(--buzz-distance, 4px)) rotate(0.3deg);
    }
    20% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px))) rotate(-0.3deg);
    }
    25% {
      transform: translateX(calc(var(--buzz-distance, 4px) * 0.7)) rotate(0.2deg);
    }
    30% {
      transform: translateX(calc(-1 * var(--buzz-distance, 4px) * 0.7)) rotate(-0.2deg);
    }
    35% {
      transform: translateX(calc(var(--buzz-distance, 4px) * 0.4)) rotate(0.1deg);
    }
    40% {
      transform: translateX(0) rotate(0deg);
    }
    100% {
      transform: translateX(0) rotate(0deg);
    }
  }

  @keyframes wag {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    12% {
      transform: rotate(var(--wag-angle, 12deg));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    24% {
      transform: rotate(2deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    36% {
      transform: rotate(calc(var(--wag-angle, 12deg) * 0.85));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    48% {
      transform: rotate(1deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.6, 1);
    }
    58% {
      transform: rotate(calc(var(--wag-angle, 12deg) * 0.6));
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    68% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes float {
    0% {
      transform: translateY(0) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    15% {
      transform: translateY(calc(-0.4 * var(--float-height, 6px))) translateX(var(--float-drift, 1px))
        rotate(var(--float-tilt, 1deg)) scale(1, 1);
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    35% {
      transform: translateY(calc(-1 * var(--float-height, 6px))) translateX(0) rotate(0deg)
        scale(var(--float-stretch-x, 0.98), var(--float-stretch-y, 1.03));
      animation-timing-function: cubic-bezier(0.5, 0, 0.5, 0);
    }
    50% {
      transform: translateY(calc(-0.92 * var(--float-height, 6px))) translateX(calc(-0.5 * var(--float-drift, 1px)))
        rotate(calc(-0.5 * var(--float-tilt, 1deg))) scale(0.995, 1.01);
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
    }
    70% {
      transform: translateY(calc(-0.3 * var(--float-height, 6px))) translateX(calc(-1 * var(--float-drift, 1px)))
        rotate(calc(-1 * var(--float-tilt, 1deg))) scale(1, 1);
      animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
    }
    90% {
      transform: translateY(calc(0.05 * var(--float-height, 6px))) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
      animation-timing-function: cubic-bezier(0.33, 0, 0.66, 1);
    }
    100% {
      transform: translateY(0) translateX(0) rotate(0deg)
        scale(var(--float-squash-x, 1.02), var(--float-squash-y, 0.98));
    }
  }

  @keyframes swing {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    8% {
      transform: rotate(var(--swing-angle, 22deg));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    18% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.85));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    28% {
      transform: rotate(calc(var(--swing-angle, 22deg) * 0.65));
      animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
    }
    38% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.45));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    48% {
      transform: rotate(calc(var(--swing-angle, 22deg) * 0.25));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    56% {
      transform: rotate(calc(-1 * var(--swing-angle, 22deg) * 0.1));
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    64% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes jello {
    0% {
      transform: scale(1, 1);
      animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    }
    12% {
      transform: scale(var(--jello-scale-x, 1.15), calc(2 - var(--jello-scale-x, 1.15)));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    24% {
      transform: scale(calc(2 - var(--jello-scale-y, 1.12)), var(--jello-scale-y, 1.12));
      animation-timing-function: cubic-bezier(0.3, 0, 0.7, 1);
    }
    36% {
      transform: scale(
        calc(1 + (var(--jello-scale-x, 1.15) - 1) * 0.5),
        calc(2 - (1 + (var(--jello-scale-x, 1.15) - 1) * 0.5))
      );
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    48% {
      transform: scale(
        calc(2 - (1 + (var(--jello-scale-y, 1.12) - 1) * 0.3)),
        calc(1 + (var(--jello-scale-y, 1.12) - 1) * 0.3)
      );
      animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    }
    58% {
      transform: scale(1.02, 0.98);
      animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    }
    68% {
      transform: scale(1, 1);
    }
    100% {
      transform: scale(1, 1);
    }
  }

  /* #endregion */
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Wi = "", Se = "";
function Xi() {
  return Wi.replace(/\/$/, "");
}
function Yi(t) {
  Se = t;
}
function Ki() {
  if (!Se) {
    const t = document.querySelector("[data-fa-kit-code]");
    t && Yi(t.getAttribute("data-fa-kit-code") || "");
  }
  return Se;
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var eo = "7.3.0";
function Gi(t, e, o) {
  let i = "solid";
  return e === "chisel" && (i = "chisel-regular"), e === "etch" && (i = "etch-solid"), e === "graphite" && (i = "graphite-thin"), e === "jelly" && (i = "jelly-regular", o === "duo-regular" && (i = "jelly-duo-regular"), o === "fill-regular" && (i = "jelly-fill-regular")), e === "jelly-duo" && (i = "jelly-duo-regular"), e === "jelly-fill" && (i = "jelly-fill-regular"), e === "notdog" && (o === "solid" && (i = "notdog-solid"), o === "duo-solid" && (i = "notdog-duo-solid")), e === "notdog-duo" && (i = "notdog-duo-solid"), e === "slab" && ((o === "solid" || o === "regular") && (i = "slab-regular"), o === "press-regular" && (i = "slab-press-regular")), e === "slab-press" && (i = "slab-press-regular"), e === "slab-duo" && (i = "slab-duo-regular"), e === "slab-press-duo" && (i = "slab-press-duo-regular"), e === "thumbprint" && (i = "thumbprint-light"), e === "utility" && (i = "utility-semibold"), e === "utility-duo" && (i = "utility-duo-semibold"), e === "utility-fill" && (i = "utility-fill-semibold"), e === "whiteboard" && (i = "whiteboard-semibold"), e === "mosaic" && (i = "mosaic-solid"), e === "pixel" && (i = "pixel-regular"), e === "vellum" && (i = "vellum-solid"), e === "classic" && (o === "thin" && (i = "thin"), o === "light" && (i = "light"), o === "regular" && (i = "regular"), o === "solid" && (i = "solid")), e === "duotone" && (o === "thin" && (i = "duotone-thin"), o === "light" && (i = "duotone-light"), o === "regular" && (i = "duotone-regular"), o === "solid" && (i = "duotone")), e === "sharp" && (o === "thin" && (i = "sharp-thin"), o === "light" && (i = "sharp-light"), o === "regular" && (i = "sharp-regular"), o === "solid" && (i = "sharp-solid")), e === "sharp-duotone" && (o === "thin" && (i = "sharp-duotone-thin"), o === "light" && (i = "sharp-duotone-light"), o === "regular" && (i = "sharp-duotone-regular"), o === "solid" && (i = "sharp-duotone-solid")), e === "brands" && (i = "brands"), i;
}
function Qi(t, e, o) {
  const i = Gi(t, e, o), n = Xi();
  if (n)
    return `${n}/${i}/${t}.svg`;
  const a = Ki();
  return a.length > 0 ? `https://ka-p.fontawesome.com/releases/v${eo}/svgs/${i}/${t}.svg?token=${encodeURIComponent(a)}` : `https://ka-f.fontawesome.com/releases/v${eo}/svgs/${i}/${t}.svg`;
}
var Zi = {
  name: "default",
  resolver: (t, e = "classic", o = "solid") => Qi(t, e, o),
  mutator: (t, e) => {
    if (t.hasAttribute("fill") || t.setAttribute("fill", "currentColor"), e != null && e.family && !t.hasAttribute("data-duotone-initialized")) {
      const { family: o, variant: i } = e;
      if (
        // Duotone
        o === "duotone" || // Sharp duotone
        o === "sharp-duotone" || // Notdog duo (correct usage: family="notdog-duo")
        o === "notdog-duo" || // NOTE: family="notdog" variant="duo-solid" is deprecated
        o === "notdog" && i === "duo-solid" || // Jelly duo (correct usage: family="jelly-duo")
        o === "jelly-duo" || // NOTE: family="jelly" variant="duo-regular" is deprecated
        o === "jelly" && i === "duo-regular" || // Utility duo (correct usage: family="utility-duo")
        o === "utility-duo" || // Slab duo (new in 7.3)
        o === "slab-duo" || o === "slab-press-duo" || // Thumbprint
        o === "thumbprint"
      ) {
        const n = [...t.querySelectorAll("path")], a = n.find((s) => !s.hasAttribute("opacity")), r = n.find((s) => s.hasAttribute("opacity"));
        if (!a || !r) return;
        if (a.setAttribute("data-duotone-primary", ""), r.setAttribute("data-duotone-secondary", ""), e.swapOpacity && a && r) {
          const s = r.getAttribute("opacity") || "0.4";
          a.style.setProperty("--path-opacity", s), r.style.setProperty("--path-opacity", "1");
        }
        t.setAttribute("data-duotone-initialized", "");
      }
    }
  }
}, Ji = Zi;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function tn(t) {
  return `data:image/svg+xml,${encodeURIComponent(t)}`;
}
var pe = {
  //
  // Solid variant
  //
  solid: {
    "arrow-down": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M169.4 502.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 402.7 224 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 370.7-105.4-105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>',
    "arrow-up": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M214.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 109.3 160 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-370.7 105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z"/></svg>',
    backward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M236.3 107.1C247.9 96 265 92.9 279.7 99.2C294.4 105.5 304 120 304 136L304 272.3L476.3 107.2C487.9 96 505 92.9 519.7 99.2C534.4 105.5 544 120 544 136L544 504C544 520 534.4 534.5 519.7 540.8C505 547.1 487.9 544 476.3 532.9L304 367.7L304 504C304 520 294.4 534.5 279.7 540.8C265 547.1 247.9 544 236.3 532.9L44.3 348.9C36.5 341.3 32 330.9 32 320C32 309.1 36.5 298.7 44.3 291.1L236.3 107.1z"/></svg>',
    "backward-step": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M491 100.8C478.1 93.8 462.3 94.5 450 102.6L192 272.1L192 128C192 110.3 177.7 96 160 96C142.3 96 128 110.3 128 128L128 512C128 529.7 142.3 544 160 544C177.7 544 192 529.7 192 512L192 367.9L450 537.5C462.3 545.6 478 546.3 491 539.3C504 532.3 512 518.8 512 504.1L512 136.1C512 121.4 503.9 107.9 491 100.9z"/></svg>',
    bars: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2026 Fonticons, Inc. --><path d="M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"/></svg>',
    "angles-left": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M77.3 256 214.7 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256zm192 0L406.7 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L269.3 256z"/></svg>',
    "angles-right": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M434.7 256 297.3 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L434.7 256zm-192 0L105.3 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256z"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z"/></svg>',
    "chevron-down": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>',
    "chevron-left": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"/></svg>',
    "chevron-right": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>',
    circle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z"/></svg>',
    "closed-captioning": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M64 192C64 156.7 92.7 128 128 128L512 128C547.3 128 576 156.7 576 192L576 448C576 483.3 547.3 512 512 512L128 512C92.7 512 64 483.3 64 448L64 192zM216 272L248 272C252.4 272 256 275.6 256 280C256 293.3 266.7 304 280 304C293.3 304 304 293.3 304 280C304 249.1 278.9 224 248 224L216 224C185.1 224 160 249.1 160 280L160 360C160 390.9 185.1 416 216 416L248 416C278.9 416 304 390.9 304 360C304 346.7 293.3 336 280 336C266.7 336 256 346.7 256 360C256 364.4 252.4 368 248 368L216 368C211.6 368 208 364.4 208 360L208 280C208 275.6 211.6 272 216 272zM384 280C384 275.6 387.6 272 392 272L424 272C428.4 272 432 275.6 432 280C432 293.3 442.7 304 456 304C469.3 304 480 293.3 480 280C480 249.1 454.9 224 424 224L392 224C361.1 224 336 249.1 336 280L336 360C336 390.9 361.1 416 392 416L424 416C454.9 416 480 390.9 480 360C480 346.7 469.3 336 456 336C442.7 336 432 346.7 432 360C432 364.4 428.4 368 424 368L392 368C387.6 368 384 364.4 384 360L384 280z"/></svg>',
    "closed-captioning-slash": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M39 39.1C48.4 29.7 63.6 29.7 72.9 39.1L161.8 128L512 128C547.3 128 576 156.7 576 192L576 448C576 473.5 561.1 495.4 539.6 505.8L601 567.1C610.4 576.5 610.4 591.7 601 601C591.6 610.3 576.4 610.4 567.1 601L39 73.1C29.7 63.7 29.7 48.5 39 39.1zM384 350.1L384 279.9C384 275.5 387.6 271.9 392 271.9L424 271.9C428.4 271.9 432 275.5 432 279.9C432 293.2 442.7 303.9 456 303.9C469.3 303.9 480 293.2 480 279.9C480 249 454.9 223.9 424 223.9L392 223.9C361.1 223.9 336 249 336 279.9L336 302.1L384 350.1zM445.5 411.6C465.7 403.2 480 383.2 480 359.9C480 346.6 469.3 335.9 456 335.9C442.7 335.9 432 346.6 432 359.9C432 364.3 428.4 367.9 424 367.9L401.8 367.9L445.5 411.6zM162.3 264.1C160.8 269.1 160 274.5 160 280L160 360C160 390.9 185.1 416 216 416L248 416C266.1 416 282.1 407.5 292.4 394.2L410.2 512L128 512C92.7 512 64 483.3 64 448L64 192C64 184.2 65.4 176.7 68 169.8L162.3 264.1zM256.1 357.9C256 358.6 256 359.3 256 360C256 364.4 252.4 368 248 368L216 368C211.6 368 208 364.4 208 360L208 309.8L256.1 357.9z"/></svg>',
    compress: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M160 64c0-17.7-14.3-32-32-32S96 46.3 96 64l0 64-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-96zM32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0 0 64c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96c0-17.7-14.3-32-32-32l-96 0zM352 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-64 0 0-64zM320 320c-17.7 0-32 14.3-32 32l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-64 64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-96 0z"/></svg>',
    ellipsis: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M96 320C96 289.1 121.1 264 152 264C182.9 264 208 289.1 208 320C208 350.9 182.9 376 152 376C121.1 376 96 350.9 96 320zM264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320zM488 264C518.9 264 544 289.1 544 320C544 350.9 518.9 376 488 376C457.1 376 432 350.9 432 320C432 289.1 457.1 264 488 264z"/></svg>',
    "ellipsis-vertical": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M320 208C289.1 208 264 182.9 264 152C264 121.1 289.1 96 320 96C350.9 96 376 121.1 376 152C376 182.9 350.9 208 320 208zM320 432C350.9 432 376 457.1 376 488C376 518.9 350.9 544 320 544C289.1 544 264 518.9 264 488C264 457.1 289.1 432 320 432zM376 320C376 350.9 350.9 376 320 376C289.1 376 264 350.9 264 320C264 289.1 289.1 264 320 264C350.9 264 376 289.1 376 320z"/></svg>',
    expand: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 96C110.3 96 96 110.3 96 128L96 224C96 241.7 110.3 256 128 256C145.7 256 160 241.7 160 224L160 160L224 160C241.7 160 256 145.7 256 128C256 110.3 241.7 96 224 96L128 96zM160 416C160 398.3 145.7 384 128 384C110.3 384 96 398.3 96 416L96 512C96 529.7 110.3 544 128 544L224 544C241.7 544 256 529.7 256 512C256 494.3 241.7 480 224 480L160 480L160 416zM416 96C398.3 96 384 110.3 384 128C384 145.7 398.3 160 416 160L480 160L480 224C480 241.7 494.3 256 512 256C529.7 256 544 241.7 544 224L544 128C544 110.3 529.7 96 512 96L416 96zM544 416C544 398.3 529.7 384 512 384C494.3 384 480 398.3 480 416L480 480L416 480C398.3 480 384 494.3 384 512C384 529.7 398.3 544 416 544L512 544C529.7 544 544 529.7 544 512L544 416z"/></svg>',
    eyedropper: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M341.6 29.2l-101.6 101.6-9.4-9.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-9.4-9.4 101.6-101.6c39-39 39-102.2 0-141.1s-102.2-39-141.1 0zM55.4 323.3c-15 15-23.4 35.4-23.4 56.6l0 42.4-26.6 39.9c-8.5 12.7-6.8 29.6 4 40.4s27.7 12.5 40.4 4l39.9-26.6 42.4 0c21.2 0 41.6-8.4 56.6-23.4l109.4-109.4-45.3-45.3-109.4 109.4c-3 3-7.1 4.7-11.3 4.7l-36.1 0 0-36.1c0-4.2 1.7-8.3 4.7-11.3l109.4-109.4-45.3-45.3-109.4 109.4z"/></svg>',
    filter: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M32 64C19.1 64 7.4 71.8 2.4 83.8S.2 109.5 9.4 118.6L192 301.3 192 416c0 8.5 3.4 16.6 9.4 22.6l64 64c9.2 9.2 22.9 11.9 34.9 6.9S320 492.9 320 480l0-178.7 182.6-182.6c9.2-9.2 11.9-22.9 6.9-34.9S492.9 64 480 64L32 64z"/></svg>',
    forward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M403.7 107.1C392.1 96 375 92.9 360.3 99.2C345.6 105.5 336 120 336 136L336 272.3L163.7 107.2C152.1 96 135 92.9 120.3 99.2C105.6 105.5 96 120 96 136L96 504C96 520 105.6 534.5 120.3 540.8C135 547.1 152.1 544 163.7 532.9L336 367.7L336 504C336 520 345.6 534.5 360.3 540.8C375 547.1 392.1 544 403.7 532.9L595.7 348.9C603.6 341.4 608 330.9 608 320C608 309.1 603.5 298.7 595.7 291.1L403.7 107.1z"/></svg>',
    file: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M192 64C156.7 64 128 92.7 128 128L128 512C128 547.3 156.7 576 192 576L448 576C483.3 576 512 547.3 512 512L512 234.5C512 217.5 505.3 201.2 493.3 189.2L386.7 82.7C374.7 70.7 358.5 64 341.5 64L192 64zM453.5 240L360 240C346.7 240 336 229.3 336 216L336 122.5L453.5 240z"/></svg>',
    "file-audio": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM389.8 307.7C380.7 301.4 368.3 303.6 362 312.7C355.7 321.8 357.9 334.2 367 340.5C390.9 357.2 406.4 384.8 406.4 416C406.4 447.2 390.8 474.9 367 491.5C357.9 497.8 355.7 510.3 362 519.3C368.3 528.3 380.8 530.6 389.8 524.3C423.9 500.5 446.4 460.8 446.4 416C446.4 371.2 424 331.5 389.8 307.7zM208 376C199.2 376 192 383.2 192 392L192 440C192 448.8 199.2 456 208 456L232 456L259.2 490C262.2 493.8 266.8 496 271.7 496L272 496C280.8 496 288 488.8 288 480L288 352C288 343.2 280.8 336 272 336L271.7 336C266.8 336 262.2 338.2 259.2 342L232 376L208 376zM336 448.2C336 458.9 346.5 466.4 354.9 459.8C367.8 449.5 376 433.7 376 416C376 398.3 367.8 382.5 354.9 372.2C346.5 365.5 336 373.1 336 383.8L336 448.3z"/></svg>',
    "file-code": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM282.2 359.6C290.8 349.5 289.7 334.4 279.6 325.8C269.5 317.2 254.4 318.3 245.8 328.4L197.8 384.4C190.1 393.4 190.1 406.6 197.8 415.6L245.8 471.6C254.4 481.7 269.6 482.8 279.6 474.2C289.6 465.6 290.8 450.4 282.2 440.4L247.6 400L282.2 359.6zM394.2 328.4C385.6 318.3 370.4 317.2 360.4 325.8C350.4 334.4 349.2 349.6 357.8 359.6L392.4 400L357.8 440.4C349.2 450.5 350.3 465.6 360.4 474.2C370.5 482.8 385.6 481.7 394.2 471.6L442.2 415.6C449.9 406.6 449.9 393.4 442.2 384.4L394.2 328.4z"/></svg>',
    "file-excel": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM292 330.7C284.6 319.7 269.7 316.7 258.7 324C247.7 331.3 244.7 346.3 252 357.3L291.2 416L252 474.7C244.6 485.7 247.6 500.6 258.7 508C269.8 515.4 284.6 512.4 292 501.3L320 459.3L348 501.3C355.4 512.3 370.3 515.3 381.3 508C392.3 500.7 395.3 485.7 388 474.7L348.8 416L388 357.3C395.4 346.3 392.4 331.4 381.3 324C370.2 316.6 355.4 319.6 348 330.7L320 372.7L292 330.7z"/></svg>',
    "file-image": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM256 320C256 302.3 241.7 288 224 288C206.3 288 192 302.3 192 320C192 337.7 206.3 352 224 352C241.7 352 256 337.7 256 320zM220.6 512L419.4 512C435.2 512 448 499.2 448 483.4C448 476.1 445.2 469 440.1 463.7L343.3 361.9C337.3 355.6 328.9 352 320.1 352L319.8 352C311 352 302.7 355.6 296.6 361.9L199.9 463.7C194.8 469 192 476.1 192 483.4C192 499.2 204.8 512 220.6 512z"/></svg>',
    "file-pdf": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 64C92.7 64 64 92.7 64 128L64 512C64 547.3 92.7 576 128 576L208 576L208 464C208 428.7 236.7 400 272 400L448 400L448 234.5C448 217.5 441.3 201.2 429.3 189.2L322.7 82.7C310.7 70.7 294.5 64 277.5 64L128 64zM389.5 240L296 240C282.7 240 272 229.3 272 216L272 122.5L389.5 240zM272 444C261 444 252 453 252 464L252 592C252 603 261 612 272 612C283 612 292 603 292 592L292 564L304 564C337.1 564 364 537.1 364 504C364 470.9 337.1 444 304 444L272 444zM304 524L292 524L292 484L304 484C315 484 324 493 324 504C324 515 315 524 304 524zM400 444C389 444 380 453 380 464L380 592C380 603 389 612 400 612L432 612C460.7 612 484 588.7 484 560L484 496C484 467.3 460.7 444 432 444L400 444zM420 572L420 484L432 484C438.6 484 444 489.4 444 496L444 560C444 566.6 438.6 572 432 572L420 572zM508 464L508 592C508 603 517 612 528 612C539 612 548 603 548 592L548 548L576 548C587 548 596 539 596 528C596 517 587 508 576 508L548 508L548 484L576 484C587 484 596 475 596 464C596 453 587 444 576 444L528 444C517 444 508 453 508 464z"/></svg>',
    "file-powerpoint": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM280 320C266.7 320 256 330.7 256 344L256 488C256 501.3 266.7 512 280 512C293.3 512 304 501.3 304 488L304 464L328 464C367.8 464 400 431.8 400 392C400 352.2 367.8 320 328 320L280 320zM328 416L304 416L304 368L328 368C341.3 368 352 378.7 352 392C352 405.3 341.3 416 328 416z"/></svg>',
    "file-video": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM208 368L208 464C208 481.7 222.3 496 240 496L336 496C353.7 496 368 481.7 368 464L368 440L403 475C406.2 478.2 410.5 480 415 480C424.4 480 432 472.4 432 463L432 368.9C432 359.5 424.4 351.9 415 351.9C410.5 351.9 406.2 353.7 403 356.9L368 391.9L368 367.9C368 350.2 353.7 335.9 336 335.9L240 335.9C222.3 335.9 208 350.2 208 367.9z"/></svg>',
    "file-word": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM263.4 338.8C260.5 325.9 247.7 317.7 234.8 320.6C221.9 323.5 213.7 336.3 216.6 349.2L248.6 493.2C250.9 503.7 260 511.4 270.8 512C281.6 512.6 291.4 505.9 294.8 495.6L320 419.9L345.2 495.6C348.6 505.8 358.4 512.5 369.2 512C380 511.5 389.1 503.8 391.4 493.2L423.4 349.2C426.3 336.3 418.1 323.4 405.2 320.6C392.3 317.8 379.4 325.9 376.6 338.8L363.4 398.2L342.8 336.4C339.5 326.6 330.4 320 320 320C309.6 320 300.5 326.6 297.2 336.4L276.6 398.2L263.4 338.8z"/></svg>',
    "file-zipper": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M128 128C128 92.7 156.7 64 192 64L341.5 64C358.5 64 374.8 70.7 386.8 82.7L493.3 189.3C505.3 201.3 512 217.6 512 234.6L512 512C512 547.3 483.3 576 448 576L192 576C156.7 576 128 547.3 128 512L128 128zM336 122.5L336 216C336 229.3 346.7 240 360 240L453.5 240L336 122.5zM192 136C192 149.3 202.7 160 216 160L264 160C277.3 160 288 149.3 288 136C288 122.7 277.3 112 264 112L216 112C202.7 112 192 122.7 192 136zM192 232C192 245.3 202.7 256 216 256L264 256C277.3 256 288 245.3 288 232C288 218.7 277.3 208 264 208L216 208C202.7 208 192 218.7 192 232zM256 304L224 304C206.3 304 192 318.3 192 336L192 384C192 410.5 213.5 432 240 432C266.5 432 288 410.5 288 384L288 336C288 318.3 273.7 304 256 304zM240 368C248.8 368 256 375.2 256 384C256 392.8 248.8 400 240 400C231.2 400 224 392.8 224 384C224 375.2 231.2 368 240 368z"/></svg>',
    "forward-step": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M21 36.8c12.9-7 28.7-6.3 41 1.8L320 208.1 320 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 384c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-144.1-258 169.6c-12.3 8.1-28 8.8-41 1.8S0 454.7 0 440L0 72C0 57.3 8.1 43.8 21 36.8z"/></svg>',
    gauge: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm320 96c0-26.9-16.5-49.9-40-59.3L280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 172.7c-23.5 9.5-40 32.5-40 59.3 0 35.3 28.7 64 64 64s64-28.7 64-64zM144 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm-16 80a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm288 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zM400 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>',
    gear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z"/></svg>',
    "grip-vertical": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M128 40c0-22.1-17.9-40-40-40L40 0C17.9 0 0 17.9 0 40L0 88c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zm0 192c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM0 424l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 40c0-22.1-17.9-40-40-40L232 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48zM192 232l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40zM320 424c0-22.1-17.9-40-40-40l-48 0c-22.1 0-40 17.9-40 40l0 48c0 22.1 17.9 40 40 40l48 0c22.1 0 40-17.9 40-40l0-48z"/></svg>',
    indeterminate: '<svg part="indeterminate-icon" class="icon" viewBox="0 0 16 16"><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round"><g stroke="currentColor" stroke-width="2"><g transform="translate(2.285714 6.857143)"><path d="M10.2857143,1.14285714 L1.14285714,1.14285714"/></g></g></g></svg>',
    "magnifying-glass": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>',
    minus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg>',
    pause: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M48 32C21.5 32 0 53.5 0 80L0 432c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48L48 32zm224 0c-26.5 0-48 21.5-48 48l0 352c0 26.5 21.5 48 48 48l64 0c26.5 0 48-21.5 48-48l0-352c0-26.5-21.5-48-48-48l-64 0z"/></svg>',
    "picture-in-picture": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M448 32c35.3 0 64 28.7 64 64l0 112-64 0 0-112-384 0 0 320 144 0 0 64-144 0-6.5-.3c-30.1-3.1-54.1-27-57.1-57.1L0 416 0 96C0 62.9 25.2 35.6 57.5 32.3L64 32 448 32zm16 224c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48l-160 0c-26.5 0-48-21.5-48-48l0-128c0-26.5 21.5-48 48-48l160 0z"/></svg>',
    play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M91.2 36.9c-12.4-6.8-27.4-6.5-39.6 .7S32 57.9 32 72l0 368c0 14.1 7.5 27.2 19.6 34.4s27.2 7.5 39.6 .7l336-184c12.8-7 20.8-20.5 20.8-35.1s-8-28.1-20.8-35.1l-336-184z"/></svg>',
    "play-circle": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zM188.3 147.1c-7.6 4.2-12.3 12.3-12.3 20.9l0 176c0 8.7 4.7 16.7 12.3 20.9s16.8 4.1 24.3-.5l144-88c7.1-4.4 11.5-12.1 11.5-20.5s-4.4-16.1-11.5-20.5l-144-88c-7.4-4.5-16.7-4.7-24.3-.5z"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M352 128C352 110.3 337.7 96 320 96C302.3 96 288 110.3 288 128L288 288L128 288C110.3 288 96 302.3 96 320C96 337.7 110.3 352 128 352L288 352L288 512C288 529.7 302.3 544 320 544C337.7 544 352 529.7 352 512L352 352L512 352C529.7 352 544 337.7 544 320C544 302.3 529.7 288 512 288L352 288L352 128z"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M309.5-18.9c-4.1-8-12.4-13.1-21.4-13.1s-17.3 5.1-21.4 13.1L193.1 125.3 33.2 150.7c-8.9 1.4-16.3 7.7-19.1 16.3s-.5 18 5.8 24.4l114.4 114.5-25.2 159.9c-1.4 8.9 2.3 17.9 9.6 23.2s16.9 6.1 25 2L288.1 417.6 432.4 491c8 4.1 17.7 3.3 25-2s11-14.2 9.6-23.2L441.7 305.9 556.1 191.4c6.4-6.4 8.6-15.8 5.8-24.4s-10.1-14.9-19.1-16.3L383 125.3 309.5-18.9z"/></svg>',
    "table-columns": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm64 64l0 256 128 0 0-256-128 0zm320 0l-128 0 0 256 128 0 0-256z"/></svg>',
    thumbtack: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M32 32C32 14.3 46.3 0 64 0L320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-29.5 0 10.3 134.1c37.1 21.2 65.8 56.4 78.2 99.7l3.8 13.4c2.8 9.7 .8 20-5.2 28.1S362 352 352 352L32 352c-10 0-19.5-4.7-25.5-12.7s-8-18.4-5.2-28.1L5 297.8c12.4-43.3 41-78.5 78.2-99.7L93.5 64 64 64C46.3 64 32 49.7 32 32zM160 400l64 0 0 112c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-112z"/></svg>',
    "up-down": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M406.6 502.6l96-96c9.2-9.2 11.9-22.9 6.9-34.9S492.9 352 480 352l-64 0 0-320c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 320-64 0c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l96 96c12.5 12.5 32.8 12.5 45.3 0zM150.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-9.2 9.2-11.9 22.9-6.9 34.9S19.1 160 32 160l64 0 0 320c0 17.7 14.3 32 32 32s32-14.3 32-32l0-320 64 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-96-96z"/></svg>',
    upload: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free 7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M352 173.3L352 384C352 401.7 337.7 416 320 416C302.3 416 288 401.7 288 384L288 173.3L246.6 214.7C234.1 227.2 213.8 227.2 201.3 214.7C188.8 202.2 188.8 181.9 201.3 169.4L297.3 73.4C309.8 60.9 330.1 60.9 342.6 73.4L438.6 169.4C451.1 181.9 451.1 202.2 438.6 214.7C426.1 227.2 405.8 227.2 393.3 214.7L352 173.3zM320 464C364.2 464 400 428.2 400 384L480 384C515.3 384 544 412.7 544 448L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 448C96 412.7 124.7 384 160 384L240 384C240 428.2 275.8 464 320 464zM464 488C477.3 488 488 477.3 488 464C488 450.7 477.3 440 464 440C450.7 440 440 450.7 440 464C440 477.3 450.7 488 464 488z"/></svg>',
    user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z"/></svg>',
    volume: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM441.1 107c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C443.3 170.7 464 210.9 464 256s-20.7 85.3-53.2 111.8c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5c43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"/></svg>',
    "volume-low": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM380.6 181.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z"/></svg>',
    "volume-xmark": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM367 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>',
    xmark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"/></svg>'
  },
  //
  // Regular variant
  //
  regular: {
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M216 64C229.3 64 240 74.7 240 88L240 128L400 128L400 88C400 74.7 410.7 64 424 64C437.3 64 448 74.7 448 88L448 128L480 128C515.3 128 544 156.7 544 192L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 192C96 156.7 124.7 128 160 128L192 128L192 88C192 74.7 202.7 64 216 64zM216 176L160 176C151.2 176 144 183.2 144 192L144 240L496 240L496 192C496 183.2 488.8 176 480 176L216 176zM144 288L144 480C144 488.8 151.2 496 160 496L480 496C488.8 496 496 488.8 496 480L496 288L144 288z"/></svg>',
    "circle-question": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm256-80c-17.7 0-32 14.3-32 32 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-44.2 35.8-80 80-80s80 35.8 80 80c0 47.2-36 67.2-56 74.5l0 3.8c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-8.1c0-20.5 14.8-35.2 30.1-40.2 6.4-2.1 13.2-5.5 18.2-10.3 4.3-4.2 7.7-10 7.7-19.6 0-17.7-14.3-32-32-32zM224 368a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>',
    "circle-xmark": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM167 167c-9.4 9.4-9.4 24.6 0 33.9l55 55-55 55c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l55-55 55 55c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-55-55 55-55c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-55 55-55-55c-9.4-9.4-24.6-9.4-33.9 0z"/></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/></svg>',
    copy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M384 336l-192 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l133.5 0c4.2 0 8.3 1.7 11.3 4.7l58.5 58.5c3 3 4.7 7.1 4.7 11.3L400 320c0 8.8-7.2 16-16 16zM192 384l192 0c35.3 0 64-28.7 64-64l0-197.5c0-17-6.7-33.3-18.7-45.3L370.7 18.7C358.7 6.7 342.5 0 325.5 0L192 0c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l192 0c35.3 0 64-28.7 64-64l0-16-48 0 0 16c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l16 0 0-48-16 0z"/></svg>',
    eye: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M288 80C222.8 80 169.2 109.6 128.1 147.7 89.6 183.5 63 226 49.4 256 63 286 89.6 328.5 128.1 364.3 169.2 402.4 222.8 432 288 432s118.8-29.6 159.9-67.7C486.4 328.5 513 286 526.6 256 513 226 486.4 183.5 447.9 147.7 406.8 109.6 353.2 80 288 80zM95.4 112.6C142.5 68.8 207.2 32 288 32s145.5 36.8 192.6 80.6c46.8 43.5 78.1 95.4 93 131.1 3.3 7.9 3.3 16.7 0 24.6-14.9 35.7-46.2 87.7-93 131.1-47.1 43.7-111.8 80.6-192.6 80.6S142.5 443.2 95.4 399.4c-46.8-43.5-78.1-95.4-93-131.1-3.3-7.9-3.3-16.7 0-24.6 14.9-35.7 46.2-87.7 93-131.1zM288 336c44.2 0 80-35.8 80-80 0-29.6-16.1-55.5-40-69.3-1.4 59.7-49.6 107.9-109.3 109.3 13.8 23.9 39.7 40 69.3 40zm-79.6-88.4c2.5 .3 5 .4 7.6 .4 35.3 0 64-28.7 64-64 0-2.6-.2-5.1-.4-7.6-37.4 3.9-67.2 33.7-71.1 71.1zm45.6-115c10.8-3 22.2-4.5 33.9-4.5 8.8 0 17.5 .9 25.8 2.6 .3 .1 .5 .1 .8 .2 57.9 12.2 101.4 63.7 101.4 125.2 0 70.7-57.3 128-128 128-61.6 0-113-43.5-125.2-101.4-1.8-8.6-2.8-17.5-2.8-26.6 0-11 1.4-21.8 4-32 .2-.7 .3-1.3 .5-1.9 11.9-43.4 46.1-77.6 89.5-89.5z"/></svg>',
    "eye-slash": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M41-24.9c-9.4-9.4-24.6-9.4-33.9 0S-2.3-.3 7 9.1l528 528c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-96.4-96.4c2.7-2.4 5.4-4.8 8-7.2 46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6-56.8 0-105.6 18.2-146 44.2L41-24.9zM176.9 111.1c32.1-18.9 69.2-31.1 111.1-31.1 65.2 0 118.8 29.6 159.9 67.7 38.5 35.7 65.1 78.3 78.6 108.3-13.6 30-40.2 72.5-78.6 108.3-3.1 2.8-6.2 5.6-9.4 8.4L393.8 328c14-20.5 22.2-45.3 22.2-72 0-70.7-57.3-128-128-128-26.7 0-51.5 8.2-72 22.2l-39.1-39.1zm182 182l-108-108c11.1-5.8 23.7-9.1 37.1-9.1 44.2 0 80 35.8 80 80 0 13.4-3.3 26-9.1 37.1zM103.4 173.2l-34-34c-32.6 36.8-55 75.8-66.9 104.5-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6 37.3 0 71.2-7.9 101.5-20.6L352.2 422c-20 6.4-41.4 10-64.2 10-65.2 0-118.8-29.6-159.9-67.7-38.5-35.7-65.1-78.3-78.6-108.3 10.4-23.1 28.6-53.6 54-82.8z"/></svg>',
    star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Free 7.0.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc. --><path d="M288.1-32c9 0 17.3 5.1 21.4 13.1L383 125.3 542.9 150.7c8.9 1.4 16.3 7.7 19.1 16.3s.5 18-5.8 24.4L441.7 305.9 467 465.8c1.4 8.9-2.3 17.9-9.6 23.2s-17 6.1-25 2L288.1 417.6 143.8 491c-8 4.1-17.7 3.3-25-2s-11-14.2-9.6-23.2L134.4 305.9 20 191.4c-6.4-6.4-8.6-15.8-5.8-24.4s10.1-14.9 19.1-16.3l159.9-25.4 73.6-144.2c4.1-8 12.4-13.1 21.4-13.1zm0 76.8L230.3 158c-3.5 6.8-10 11.6-17.6 12.8l-125.5 20 89.8 89.9c5.4 5.4 7.9 13.1 6.7 20.7l-19.8 125.5 113.3-57.6c6.8-3.5 14.9-3.5 21.8 0l113.3 57.6-19.8-125.5c-1.2-7.6 1.3-15.3 6.7-20.7l89.8-89.9-125.5-20c-7.6-1.2-14.1-6-17.6-12.8L288.1 44.8z"/></svg>'
  }
}, en = {
  name: "system",
  resolver: (t, e = "classic", o = "solid") => {
    let n = pe[o][t] ?? pe.regular[t] ?? pe.regular["circle-question"];
    return n ? tn(n) : "";
  },
  mutator: (t) => {
    t.hasAttribute("fill") || t.setAttribute("fill", "currentColor");
  }
}, on = en;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var nn = "classic", Qt = [Ji, on], Oe = /* @__PURE__ */ new Set();
function an(t) {
  Oe.add(t);
}
function rn(t) {
  Oe.delete(t);
}
function fe(t) {
  return Qt.find((e) => e.name === t);
}
function sn(t, e) {
  ln(t), Qt.push({
    name: t,
    resolver: e.resolver,
    mutator: e.mutator,
    spriteSheet: e.spriteSheet
  }), Oe.forEach((o) => {
    o.library === t && o.setIcon();
  });
}
function ln(t) {
  Qt = Qt.filter((e) => e.name !== t);
}
function cn() {
  return nn;
}
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const dn = (t, e) => (t == null ? void 0 : t._$litType$) !== void 0;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Mt = Symbol(), qt = Symbol(), ge, we = /* @__PURE__ */ new Map(), E = class extends q {
  constructor() {
    super(...arguments), this.svg = null, this.autoWidth = !1, this.swapOpacity = !1, this.label = "", this.library = "default", this.rotate = 0, this.resolveIcon = async (t, e) => {
      var i;
      let o;
      if (e != null && e.spriteSheet) {
        this.hasUpdated || await this.updateComplete, this.svg = O`<svg part="svg">
        <use part="use" href="${t}"></use>
      </svg>`, await this.updateComplete;
        const n = this.shadowRoot.querySelector("[part='svg']");
        return typeof e.mutator == "function" && e.mutator(n, this), this.svg;
      }
      try {
        if (o = await fetch(t, { mode: "cors" }), !o.ok) return o.status === 410 ? Mt : qt;
      } catch {
        return qt;
      }
      try {
        const n = document.createElement("div");
        n.innerHTML = await o.text();
        const a = n.firstElementChild;
        if (((i = a == null ? void 0 : a.tagName) == null ? void 0 : i.toLowerCase()) !== "svg") return Mt;
        ge || (ge = new DOMParser());
        const s = ge.parseFromString(a.outerHTML, "text/html").body.querySelector("svg");
        return s ? (s.part.add("svg"), document.adoptNode(s)) : Mt;
      } catch {
        return Mt;
      }
    };
  }
  connectedCallback() {
    super.connectedCallback(), an(this);
  }
  firstUpdated(t) {
    super.firstUpdated(t), this.hasAttribute("rotate") && this.style.setProperty("--rotate-angle", `${this.rotate}deg`), this.setIcon();
  }
  disconnectedCallback() {
    super.disconnectedCallback(), rn(this);
  }
  async getIconSource() {
    const t = fe(this.library), e = this.family || cn();
    if (this.name && t) {
      const o = this.canvas === "auto" || this.autoWidth;
      let i;
      try {
        i = await t.resolver(this.name, e, this.variant, o);
      } catch {
        i = void 0;
      }
      return { url: i, fromLibrary: !0 };
    }
    return {
      url: this.src,
      fromLibrary: !1
    };
  }
  handleLabelChange() {
    typeof this.label == "string" && this.label.length > 0 ? (this.setAttribute("role", "img"), this.setAttribute("aria-label", this.label), this.removeAttribute("aria-hidden")) : (this.removeAttribute("role"), this.removeAttribute("aria-label"), this.setAttribute("aria-hidden", "true"));
  }
  async setIcon() {
    var r;
    const { url: t, fromLibrary: e } = await this.getIconSource(), o = e ? fe(this.library) : void 0;
    if (!t) {
      this.svg = null;
      return;
    }
    let i = we.get(t);
    i || (i = this.resolveIcon(t, o), we.set(t, i));
    const n = await i;
    n === qt && we.delete(t);
    const a = await this.getIconSource();
    if (t === a.url) {
      if (dn(n)) {
        this.svg = n;
        return;
      }
      switch (n) {
        case qt:
        case Mt:
          this.svg = null, this.dispatchEvent(new qi());
          break;
        default:
          this.svg = n.cloneNode(!0), (r = o == null ? void 0 : o.mutator) == null || r.call(o, this.svg, this), this.dispatchEvent(new Hi());
      }
    }
  }
  willUpdate(t) {
    return this.style || this.setStyleProperty("--rotate-angle", `${this.rotate}deg`), super.willUpdate(t);
  }
  updated(t) {
    var i, n;
    super.updated(t);
    const e = fe(this.library);
    this.hasAttribute("rotate") && this.style.setProperty("--rotate-angle", `${this.rotate}deg`);
    const o = (i = this.shadowRoot) == null ? void 0 : i.querySelector("svg");
    o && ((n = e == null ? void 0 : e.mutator) == null || n.call(e, o, this));
  }
  render() {
    return this.hasUpdated ? this.svg : O`<svg part="svg" width="16" height="16" viewBox="0 0 16 16"></svg>`;
  }
};
E.css = ji;
c([
  Vt()
], E.prototype, "svg", 2);
c([
  h({ reflect: !0 })
], E.prototype, "name", 2);
c([
  h({ reflect: !0 })
], E.prototype, "family", 2);
c([
  h({ reflect: !0 })
], E.prototype, "variant", 2);
c([
  h({ reflect: !0 })
], E.prototype, "canvas", 2);
c([
  h({ attribute: "auto-width", type: Boolean, reflect: !0 })
], E.prototype, "autoWidth", 2);
c([
  h({ attribute: "swap-opacity", type: Boolean, reflect: !0 })
], E.prototype, "swapOpacity", 2);
c([
  h()
], E.prototype, "src", 2);
c([
  h()
], E.prototype, "label", 2);
c([
  h({ reflect: !0 })
], E.prototype, "library", 2);
c([
  h({ type: Number, reflect: !0 })
], E.prototype, "rotate", 2);
c([
  h({ type: String, reflect: !0 })
], E.prototype, "flip", 2);
c([
  h({ type: String, reflect: !0 })
], E.prototype, "animation", 2);
c([
  B("label")
], E.prototype, "handleLabelChange", 1);
c([
  B(["family", "name", "library", "variant", "src", "autoWidth", "canvas", "swapOpacity"], {
    waitUntilFirstUpdate: !0
  })
], E.prototype, "setIcon", 1);
E = c([
  at("wa-icon")
], E);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var un = V`
  :host {
    --pulse-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));

    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.375em 0.625em;
    color: var(--wa-color-on-loud, var(--wa-color-brand-on-loud));
    font-size: max(var(--wa-font-size-3xs), 0.75em);
    font-weight: var(--wa-font-weight-semibold);
    line-height: 1;
    vertical-align: middle;
    white-space: nowrap;
    background-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));
    border-color: transparent;
    border-radius: var(--wa-border-radius-s);
    border-style: var(--wa-border-style);
    border-width: var(--wa-border-width-s);
    user-select: none;
    -webkit-user-select: none;
    cursor: inherit;

    min-width: 1.25em; /* <-- this is what Safari respects for intrinsic */
    min-height: 1em;
  }

  /* Appearance modifiers */
  :host([appearance='outlined']) {
    --pulse-color: var(--wa-color-border-loud, var(--wa-color-brand-border-loud));

    color: var(--wa-color-on-quiet, var(--wa-color-brand-on-quiet));
    background-color: transparent;
    border-color: var(--wa-color-border-loud, var(--wa-color-brand-border-loud));
  }

  :host([appearance='filled']) {
    --pulse-color: var(--wa-color-fill-normal, var(--wa-color-brand-fill-normal));

    color: var(--wa-color-on-normal, var(--wa-color-brand-on-normal));
    background-color: var(--wa-color-fill-normal, var(--wa-color-brand-fill-normal));
    border-color: transparent;
  }

  :host([appearance='filled-outlined']) {
    --pulse-color: var(--wa-color-border-normal, var(--wa-color-brand-border-normal));

    color: var(--wa-color-on-normal, var(--wa-color-brand-on-normal));
    background-color: var(--wa-color-fill-normal, var(--wa-color-brand-fill-normal));
    border-color: var(--wa-color-border-normal, var(--wa-color-brand-border-normal));
  }

  :host([appearance='accent']) {
    --pulse-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));

    color: var(--wa-color-on-loud, var(--wa-color-brand-on-loud));
    background-color: var(--wa-color-fill-loud, var(--wa-color-brand-fill-loud));
    border-color: transparent;
  }

  /* Pill modifier */
  :host([pill]) {
    border-radius: var(--wa-border-radius-pill);
  }

  /* Pulse attention */
  :host([attention='pulse']) {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 var(--pulse-color);
    }
    70% {
      box-shadow: 0 0 0 0.5rem transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  /* Bounce attention */
  :host([attention='bounce']) {
    animation: bounce 1s cubic-bezier(0.28, 0.84, 0.42, 1) infinite;
  }

  @keyframes bounce {
    0%,
    20%,
    50%,
    80%,
    100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-5px);
    }
    60% {
      transform: translateY(-2px);
    }
  }

  /* Prevents vertical space when icons with vertical-align are slotted in - https://github.com/shoelace-style/webawesome/issues/2280 */
  [part='start'],
  [part='end'] {
    line-height: 0;
  }

  slot[name='start']::slotted(*) {
    margin-inline-end: 0.375em;
  }

  slot[name='end']::slotted(*) {
    margin-inline-start: 0.375em;
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var gt = class extends q {
  constructor() {
    super(...arguments), this.variant = "brand", this.appearance = "accent", this.pill = !1, this.attention = "none";
  }
  render() {
    return O`
      <span part="start">
        <slot name="start"></slot>
      </span>

      <span part="base badge" role="status">
        <slot></slot>
      </span>

      <span part="end">
        <slot name="end"></slot>
      </span>
    `;
  }
};
gt.css = [Ao, un];
c([
  h({ reflect: !0 })
], gt.prototype, "variant", 2);
c([
  h({ reflect: !0 })
], gt.prototype, "appearance", 2);
c([
  h({ type: Boolean, reflect: !0 })
], gt.prototype, "pill", 2);
c([
  h({ reflect: !0 })
], gt.prototype, "attention", 2);
gt = c([
  at("wa-badge")
], gt);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var hn = class extends Event {
  constructor(t) {
    super("wa-select", { bubbles: !0, cancelable: !0, composed: !0 }), this.detail = t;
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function* Mo(t = document.activeElement) {
  t != null && (yield t, "shadowRoot" in t && t.shadowRoot && t.shadowRoot.mode !== "closed" && (yield* Mo(t.shadowRoot.activeElement)));
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var mn = V`
  :host {
    --show-duration: var(--wa-transition-fast);
    --hide-duration: var(--wa-transition-fast);
    display: contents;
  }

  #menu {
    display: flex;
    flex-direction: column;
    width: max-content;
    margin: 0;
    padding: 0.25em;
    border: var(--wa-border-style) var(--wa-border-width-s) var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-m);
    background-color: var(--wa-color-surface-raised);
    box-shadow: var(--wa-shadow-m);
    color: var(--wa-color-text-normal);
    text-align: start;
    user-select: none;
    overflow: auto;
    max-width: var(--auto-size-available-width) !important;
    max-height: var(--auto-size-available-height) !important;

    &.show {
      animation: show var(--show-duration) ease;
    }

    &.hide {
      animation: show var(--hide-duration) ease reverse;
    }

    ::slotted(h1),
    ::slotted(h2),
    ::slotted(h3),
    ::slotted(h4),
    ::slotted(h5),
    ::slotted(h6) {
      display: block !important;
      margin: 0.25em 0 !important;
      padding: 0.25em 0.75em !important;
      color: var(--wa-color-text-quiet);
      font-family: var(--wa-font-family-body) !important;
      font-weight: var(--wa-font-weight-semibold) !important;
      font-size: var(--wa-font-size-smaller) !important;
    }

    ::slotted(wa-divider) {
      --spacing: 0.25em; /* Component-specific, left as-is */
    }
  }

  wa-popup[data-current-placement^='top'] #menu {
    transform-origin: bottom;
  }

  wa-popup[data-current-placement^='bottom'] #menu {
    transform-origin: top;
  }

  wa-popup[data-current-placement^='left'] #menu {
    transform-origin: right;
  }

  wa-popup[data-current-placement^='right'] #menu {
    transform-origin: left;
  }

  wa-popup[data-current-placement='left-start'] #menu {
    transform-origin: right top;
  }

  wa-popup[data-current-placement='left-end'] #menu {
    transform-origin: right bottom;
  }

  wa-popup[data-current-placement='right-start'] #menu {
    transform-origin: left top;
  }

  wa-popup[data-current-placement='right-end'] #menu {
    transform-origin: left bottom;
  }

  @keyframes show {
    from {
      scale: 0.9;
      opacity: 0;
    }
    to {
      scale: 1;
      opacity: 1;
    }
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Fo = class extends Event {
  constructor() {
    super("wa-show", { bubbles: !0, cancelable: !0, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Oo = class extends Event {
  constructor(t) {
    super("wa-hide", { bubbles: !0, cancelable: !0, composed: !0 }), this.detail = t;
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var Ro = class extends Event {
  constructor() {
    super("wa-after-hide", { bubbles: !0, cancelable: !1, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var To = class extends Event {
  constructor() {
    super("wa-after-show", { bubbles: !0, cancelable: !1, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var mt = [];
function Io(t) {
  Dt(t), mt.push(t);
}
function Dt(t) {
  for (let e = mt.length - 1; e >= 0; e--)
    if (mt[e] === t) {
      mt.splice(e, 1);
      break;
    }
}
function Bo(t) {
  return mt.length > 0 && mt[mt.length - 1] === t;
}
let pn = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict", fn = (t = 21) => {
  let e = "", o = crypto.getRandomValues(new Uint8Array(t |= 0));
  for (; t--; )
    e += pn[o[t] & 63];
  return e;
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function Do(t = "") {
  return `${t}${fn()}`;
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function St(t, e) {
  return new Promise((o) => {
    const i = new AbortController(), { signal: n } = i;
    if (t.classList.contains(e))
      return;
    t.classList.add(e);
    let a = !1, r = () => {
      a || (a = !0, t.classList.remove(e), o(), i.abort());
    };
    t.addEventListener("animationend", r, { once: !0, signal: n }), t.addEventListener("animationcancel", r, { once: !0, signal: n }), requestAnimationFrame(() => {
      !a && t.getAnimations().length === 0 && r();
    });
  });
}
const nt = Math.min, Q = Math.max, Zt = Math.round, Ht = Math.floor, Z = (t) => ({
  x: t,
  y: t
}), gn = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function No(t, e, o) {
  return Q(t, nt(e, o));
}
function At(t, e) {
  return typeof t == "function" ? t(e) : t;
}
function wt(t) {
  return t.split("-")[0];
}
function $t(t) {
  return t.split("-")[1];
}
function Uo(t) {
  return t === "x" ? "y" : "x";
}
function Re(t) {
  return t === "y" ? "height" : "width";
}
function G(t) {
  const e = t[0];
  return e === "t" || e === "b" ? "y" : "x";
}
function Te(t) {
  return Uo(G(t));
}
function wn(t, e, o) {
  o === void 0 && (o = !1);
  const i = $t(t), n = Te(t), a = Re(n);
  let r = n === "x" ? i === (o ? "end" : "start") ? "right" : "left" : i === "start" ? "bottom" : "top";
  return e.reference[a] > e.floating[a] && (r = Jt(r)), [r, Jt(r)];
}
function vn(t) {
  const e = Jt(t);
  return [ze(t), e, ze(e)];
}
function ze(t) {
  return t.includes("start") ? t.replace("start", "end") : t.replace("end", "start");
}
const oo = ["left", "right"], io = ["right", "left"], bn = ["top", "bottom"], yn = ["bottom", "top"];
function Cn(t, e, o) {
  switch (t) {
    case "top":
    case "bottom":
      return o ? e ? io : oo : e ? oo : io;
    case "left":
    case "right":
      return e ? bn : yn;
    default:
      return [];
  }
}
function Ln(t, e, o, i) {
  const n = $t(t);
  let a = Cn(wt(t), o === "start", i);
  return n && (a = a.map((r) => r + "-" + n), e && (a = a.concat(a.map(ze)))), a;
}
function Jt(t) {
  const e = wt(t);
  return gn[e] + t.slice(e.length);
}
function xn(t) {
  var e, o, i, n;
  return {
    top: (e = t.top) != null ? e : 0,
    right: (o = t.right) != null ? o : 0,
    bottom: (i = t.bottom) != null ? i : 0,
    left: (n = t.left) != null ? n : 0
  };
}
function Vo(t) {
  return typeof t != "number" ? xn(t) : {
    top: t,
    right: t,
    bottom: t,
    left: t
  };
}
function te(t) {
  const {
    x: e,
    y: o,
    width: i,
    height: n
  } = t;
  return {
    width: i,
    height: n,
    top: o,
    left: e,
    right: e + i,
    bottom: o + n,
    x: e,
    y: o
  };
}
function no(t, e, o) {
  let {
    reference: i,
    floating: n
  } = t;
  const a = G(e), r = Te(e), s = Re(r), l = wt(e), d = a === "y", u = i.x + i.width / 2 - n.width / 2, m = i.y + i.height / 2 - n.height / 2, f = i[s] / 2 - n[s] / 2;
  let p;
  switch (l) {
    case "top":
      p = {
        x: u,
        y: i.y - n.height
      };
      break;
    case "bottom":
      p = {
        x: u,
        y: i.y + i.height
      };
      break;
    case "right":
      p = {
        x: i.x + i.width,
        y: m
      };
      break;
    case "left":
      p = {
        x: i.x - n.width,
        y: m
      };
      break;
    default:
      p = {
        x: i.x,
        y: i.y
      };
  }
  const g = $t(e);
  return g && (p[r] += f * (g === "end" ? 1 : -1) * (o && d ? -1 : 1)), p;
}
async function Sn(t, e) {
  var o;
  e === void 0 && (e = {});
  const {
    x: i,
    y: n,
    platform: a,
    rects: r,
    elements: s,
    strategy: l
  } = t, {
    boundary: d = "clippingAncestors",
    rootBoundary: u = "viewport",
    elementContext: m = "floating",
    altBoundary: f = !1,
    padding: p = 0
  } = At(e, t), g = Vo(p), y = s[f ? m === "floating" ? "reference" : "floating" : m], v = te(await a.getClippingRect({
    element: (o = await (a.isElement == null ? void 0 : a.isElement(y))) == null || o ? y : y.contextElement || await (a.getDocumentElement == null ? void 0 : a.getDocumentElement(s.floating)),
    boundary: d,
    rootBoundary: u,
    strategy: l
  })), L = m === "floating" ? {
    x: i,
    y: n,
    width: r.floating.width,
    height: r.floating.height
  } : r.reference, x = await (a.getOffsetParent == null ? void 0 : a.getOffsetParent(s.floating)), S = await (a.isElement == null ? void 0 : a.isElement(x)) && await (a.getScale == null ? void 0 : a.getScale(x)) || {
    x: 1,
    y: 1
  }, M = te(a.convertOffsetParentRelativeRectToViewportRelativeRect ? await a.convertOffsetParentRelativeRectToViewportRelativeRect({
    elements: s,
    rect: L,
    offsetParent: x,
    strategy: l
  }) : L);
  return {
    top: (v.top - M.top + g.top) / S.y,
    bottom: (M.bottom - v.bottom + g.bottom) / S.y,
    left: (v.left - M.left + g.left) / S.x,
    right: (M.right - v.right + g.right) / S.x
  };
}
const zn = 50, An = async (t, e, o) => {
  const {
    placement: i = "bottom",
    strategy: n = "absolute",
    middleware: a = [],
    platform: r
  } = o, s = r.detectOverflow ? r : {
    ...r,
    detectOverflow: Sn
  }, l = await (r.isRTL == null ? void 0 : r.isRTL(e));
  let d = await r.getElementRects({
    reference: t,
    floating: e,
    strategy: n
  }), {
    x: u,
    y: m
  } = no(d, i, l), f = i, p = 0;
  const g = {};
  for (let w = 0; w < a.length; w++) {
    const y = a[w];
    if (!y)
      continue;
    const {
      name: v,
      fn: L
    } = y, {
      x,
      y: S,
      data: M,
      reset: A
    } = await L({
      x: u,
      y: m,
      initialPlacement: i,
      placement: f,
      strategy: n,
      middlewareData: g,
      rects: d,
      platform: s,
      elements: {
        reference: t,
        floating: e
      }
    });
    u = x ?? u, m = S ?? m, g[v] = {
      ...g[v],
      ...M
    }, A && p < zn && (p++, typeof A == "object" && (A.placement && (f = A.placement), A.rects && (d = A.rects === !0 ? await r.getElementRects({
      reference: t,
      floating: e,
      strategy: n
    }) : A.rects), {
      x: u,
      y: m
    } = no(d, f, l)), w = -1);
  }
  return {
    x: u,
    y: m,
    placement: f,
    strategy: n,
    middlewareData: g
  };
}, $n = (t) => ({
  name: "arrow",
  options: t,
  async fn(e) {
    const {
      x: o,
      y: i,
      placement: n,
      rects: a,
      platform: r,
      elements: s,
      middlewareData: l
    } = e, {
      element: d,
      padding: u = 0
    } = At(t, e) || {};
    if (d == null)
      return {};
    const m = Vo(u), f = {
      x: o,
      y: i
    }, p = Te(n), g = Re(p), w = await r.getDimensions(d), y = p === "y", v = y ? "top" : "left", L = y ? "bottom" : "right", x = y ? "clientHeight" : "clientWidth", S = a.reference[g] + a.reference[p] - f[p] - a.floating[g], M = f[p] - a.reference[p], A = await (r.getOffsetParent == null ? void 0 : r.getOffsetParent(d));
    let F = A ? A[x] : 0;
    (!F || !await (r.isElement == null ? void 0 : r.isElement(A))) && (F = s.floating[x] || a.floating[g]);
    const D = S / 2 - M / 2, H = F / 2 - w[g] / 2 - 1, _ = nt(m[v], H), Et = nt(m[L], H), _t = F - w[g] - Et, j = F / 2 - w[g] / 2 + D, N = No(_, j, _t), st = !l.arrow && $t(n) != null && j !== N && a.reference[g] / 2 - (j < _ ? _ : Et) - w[g] / 2 < 0, Y = st ? j < _ ? j - _ : j - _t : 0;
    return {
      [p]: f[p] + Y,
      data: {
        [p]: N,
        centerOffset: j - N - Y,
        ...st && {
          alignmentOffset: Y
        }
      },
      reset: st
    };
  }
}), kn = function(t) {
  return t === void 0 && (t = {}), {
    name: "flip",
    options: t,
    async fn(e) {
      var o, i;
      const {
        placement: n,
        middlewareData: a,
        rects: r,
        initialPlacement: s,
        platform: l,
        elements: d
      } = e, {
        mainAxis: u = !0,
        crossAxis: m = !0,
        fallbackPlacements: f,
        fallbackStrategy: p = "bestFit",
        fallbackAxisSideDirection: g = "none",
        flipAlignment: w = !0,
        ...y
      } = At(t, e);
      if ((o = a.arrow) != null && o.alignmentOffset)
        return {};
      const v = wt(n), L = G(s), x = wt(s) === s, S = await (l.isRTL == null ? void 0 : l.isRTL(d.floating)), M = f || (x || !w ? [Jt(s)] : vn(s)), A = g !== "none";
      !f && A && M.push(...Ln(s, w, g, S));
      const F = [s, ...M], D = await l.detectOverflow(e, y), H = [];
      let _ = ((i = a.flip) == null ? void 0 : i.overflows) || [];
      if (u && H.push(D[v]), m) {
        const N = wn(n, r, S);
        H.push(D[N[0]], D[N[1]]);
      }
      if (_ = [..._, {
        placement: n,
        overflows: H
      }], !H.every((N) => N <= 0)) {
        var Et, _t;
        const N = (((Et = a.flip) == null ? void 0 : Et.index) || 0) + 1, st = F[N];
        if (st && (!(m === "alignment" ? L !== G(st) : !1) || // We leave the current main axis only if every placement on that axis
        // overflows the main axis.
        _.every((U) => G(U.placement) === L ? U.overflows[0] > 0 : !0)))
          return {
            data: {
              index: N,
              overflows: _
            },
            reset: {
              placement: st
            }
          };
        let Y = (_t = _.filter((lt) => lt.overflows[0] <= 0).sort((lt, U) => lt.overflows[1] - U.overflows[1])[0]) == null ? void 0 : _t.placement;
        if (!Y)
          switch (p) {
            case "bestFit": {
              var j;
              const lt = (j = _.filter((U) => {
                if (A) {
                  const et = G(U.placement);
                  return et === L || // Create a bias to the `y` side axis due to horizontal
                  // reading directions favoring greater width.
                  et === "y";
                }
                return !0;
              }).map((U) => [U.placement, U.overflows.filter((et) => et > 0).reduce((et, ei) => et + ei, 0)]).sort((U, et) => U[1] - et[1])[0]) == null ? void 0 : j[0];
              lt && (Y = lt);
              break;
            }
            case "initialPlacement":
              Y = s;
              break;
          }
        if (n !== Y)
          return {
            reset: {
              placement: Y
            }
          };
      }
      return {};
    }
  };
}, En = /* @__PURE__ */ new Set(["left", "top"]);
async function _n(t, e) {
  const {
    placement: o,
    platform: i,
    elements: n
  } = t, a = await (i.isRTL == null ? void 0 : i.isRTL(n.floating)), r = wt(o), s = $t(o), l = G(o) === "y", d = En.has(r) ? -1 : 1, u = a && l ? -1 : 1, m = At(e, t);
  let {
    mainAxis: f,
    crossAxis: p,
    alignmentAxis: g
  } = typeof m == "number" ? {
    mainAxis: m,
    crossAxis: 0,
    alignmentAxis: null
  } : {
    mainAxis: m.mainAxis || 0,
    crossAxis: m.crossAxis || 0,
    alignmentAxis: m.alignmentAxis
  };
  return s && typeof g == "number" && (p = s === "end" ? g * -1 : g), l ? {
    x: p * u,
    y: f * d
  } : {
    x: f * d,
    y: p * u
  };
}
const Pn = function(t) {
  return t === void 0 && (t = 0), {
    name: "offset",
    options: t,
    async fn(e) {
      var o, i;
      const {
        x: n,
        y: a,
        placement: r,
        middlewareData: s
      } = e, l = await _n(e, t);
      return r === ((o = s.offset) == null ? void 0 : o.placement) && (i = s.arrow) != null && i.alignmentOffset ? {} : {
        x: n + l.x,
        y: a + l.y,
        data: {
          ...l,
          placement: r
        }
      };
    }
  };
}, Mn = function(t) {
  return t === void 0 && (t = {}), {
    name: "shift",
    options: t,
    async fn(e) {
      const {
        x: o,
        y: i,
        placement: n,
        platform: a
      } = e, {
        mainAxis: r = !0,
        crossAxis: s = !1,
        limiter: l = {
          fn: (L) => {
            let {
              x,
              y: S
            } = L;
            return {
              x,
              y: S
            };
          }
        },
        ...d
      } = At(t, e), u = {
        x: o,
        y: i
      }, m = await a.detectOverflow(e, d), f = G(n), p = Uo(f);
      let g = u[p], w = u[f];
      const y = (L, x) => No(x + m[L === "y" ? "top" : "left"], x, x - m[L === "y" ? "bottom" : "right"]);
      r && (g = y(p, g)), s && (w = y(f, w));
      const v = l.fn({
        ...e,
        [p]: g,
        [f]: w
      });
      return {
        ...v,
        data: {
          x: v.x - o,
          y: v.y - i,
          enabled: {
            [p]: r,
            [f]: s
          }
        }
      };
    }
  };
}, Fn = function(t) {
  return t === void 0 && (t = {}), {
    name: "size",
    options: t,
    async fn(e) {
      const {
        placement: o,
        rects: i,
        platform: n,
        elements: a
      } = e, {
        apply: r = () => {
        },
        ...s
      } = At(t, e), l = await n.detectOverflow(e, s), d = wt(o), u = $t(o), m = G(o) === "y", {
        width: f,
        height: p
      } = i.floating;
      let g, w;
      d === "top" || d === "bottom" ? (g = d, w = u === (await (n.isRTL == null ? void 0 : n.isRTL(a.floating)) ? "start" : "end") ? "left" : "right") : (w = d, g = u === "end" ? "top" : "bottom");
      const y = p - l.top - l.bottom, v = f - l.left - l.right, L = nt(p - l[g], y), x = nt(f - l[w], v), S = e.middlewareData.shift, M = !S;
      let A = L, F = x;
      S != null && S.enabled.x && (F = v), S != null && S.enabled.y && (A = y), M && !u && (m ? F = f - 2 * Q(l.left, l.right) : A = p - 2 * Q(l.top, l.bottom)), await r({
        ...e,
        availableWidth: F,
        availableHeight: A
      });
      const D = await n.getDimensions(a.floating);
      return f !== D.width || p !== D.height ? {
        reset: {
          rects: !0
        }
      } : {};
    }
  };
};
function ie() {
  return typeof window < "u";
}
function kt(t) {
  return qo(t) ? (t.nodeName || "").toLowerCase() : "#document";
}
function R(t) {
  var e;
  return (t == null || (e = t.ownerDocument) == null ? void 0 : e.defaultView) || window;
}
function tt(t) {
  var e;
  return (e = (qo(t) ? t.ownerDocument : t.document) || window.document) == null ? void 0 : e.documentElement;
}
function qo(t) {
  return ie() ? t instanceof Node || t instanceof R(t).Node : !1;
}
function W(t) {
  return ie() ? t instanceof Element || t instanceof R(t).Element : !1;
}
function rt(t) {
  return ie() ? t instanceof HTMLElement || t instanceof R(t).HTMLElement : !1;
}
function ao(t) {
  return !ie() || typeof ShadowRoot > "u" ? !1 : t instanceof ShadowRoot || t instanceof R(t).ShadowRoot;
}
function ne(t) {
  const {
    overflow: e,
    overflowX: o,
    overflowY: i,
    display: n
  } = X(t);
  return /auto|scroll|overlay|hidden|clip/.test(e + i + o) && n !== "inline" && n !== "contents";
}
function On(t) {
  return /^(table|td|th)$/.test(kt(t));
}
function ae(t) {
  try {
    if (t.matches(":popover-open"))
      return !0;
  } catch {
  }
  try {
    return t.matches(":modal");
  } catch {
    return !1;
  }
}
const Rn = /transform|translate|scale|rotate|perspective|filter/, Tn = /paint|layout|strict|content/, dt = (t) => !!t && t !== "none";
let ve;
function re(t) {
  const e = W(t) ? X(t) : t;
  return dt(e.transform) || dt(e.translate) || dt(e.scale) || dt(e.rotate) || dt(e.perspective) || !Ie() && (dt(e.backdropFilter) || dt(e.filter)) || Rn.test(e.willChange || "") || Tn.test(e.contain || "");
}
function In(t) {
  let e = vt(t);
  for (; rt(e) && !Nt(e); ) {
    if (re(e))
      return e;
    if (ae(e))
      return null;
    e = vt(e);
  }
  return null;
}
function Ie() {
  return ve == null && (ve = typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none")), ve;
}
function Nt(t) {
  return /^(html|body|#document)$/.test(kt(t));
}
function X(t) {
  return R(t).getComputedStyle(t);
}
function se(t) {
  return W(t) ? {
    scrollLeft: t.scrollLeft,
    scrollTop: t.scrollTop
  } : {
    scrollLeft: t.scrollX,
    scrollTop: t.scrollY
  };
}
function vt(t) {
  if (kt(t) === "html")
    return t;
  const e = (
    // Step into the shadow DOM of the parent of a slotted node.
    t.assignedSlot || // DOM Element detected.
    t.parentNode || // ShadowRoot detected.
    ao(t) && t.host || // Fallback.
    tt(t)
  );
  return ao(e) ? e.host : e;
}
function Ho(t) {
  const e = vt(t);
  return Nt(e) ? (t.ownerDocument || t).body : rt(e) && ne(e) ? e : Ho(e);
}
function zt(t, e, o) {
  var i;
  e === void 0 && (e = []), o === void 0 && (o = !0);
  const n = Ho(t), a = n === ((i = t.ownerDocument) == null ? void 0 : i.body), r = R(n);
  if (a) {
    const s = Ae(r);
    return e.concat(r, r.visualViewport || [], ne(n) ? n : [], s && o ? zt(s) : []);
  } else
    return e.concat(n, zt(n, [], o));
}
function Ae(t) {
  return t.parent && Object.getPrototypeOf(t.parent) ? t.frameElement : null;
}
function jo(t) {
  const e = X(t);
  let o = parseFloat(e.width) || 0, i = parseFloat(e.height) || 0;
  const n = rt(t), a = n ? t.offsetWidth : o, r = n ? t.offsetHeight : i, s = Zt(o) !== a || Zt(i) !== r;
  return s && (o = a, i = r), {
    width: o,
    height: i,
    $: s
  };
}
function Be(t) {
  return W(t) ? t : t.contextElement;
}
function Lt(t) {
  const e = Be(t);
  if (!rt(e))
    return Z(1);
  const o = e.getBoundingClientRect(), {
    width: i,
    height: n,
    $: a
  } = jo(e);
  let r = (a ? Zt(o.width) : o.width) / i, s = (a ? Zt(o.height) : o.height) / n;
  return (!r || !Number.isFinite(r)) && (r = 1), (!s || !Number.isFinite(s)) && (s = 1), {
    x: r,
    y: s
  };
}
const Bn = /* @__PURE__ */ Z(0);
function Wo(t) {
  const e = R(t);
  return !Ie() || !e.visualViewport ? Bn : {
    x: e.visualViewport.offsetLeft,
    y: e.visualViewport.offsetTop
  };
}
function Dn(t, e, o) {
  return e === void 0 && (e = !1), !!o && e && o === R(t);
}
function bt(t, e, o, i) {
  e === void 0 && (e = !1), o === void 0 && (o = !1);
  const n = t.getBoundingClientRect(), a = Be(t);
  let r = Z(1);
  e && (i ? W(i) && (r = Lt(i)) : r = Lt(t));
  const s = Dn(a, o, i) ? Wo(a) : Z(0);
  let l = (n.left + s.x) / r.x, d = (n.top + s.y) / r.y, u = n.width / r.x, m = n.height / r.y;
  if (a && i) {
    const f = R(a), p = W(i) ? R(i) : i;
    let g = f, w = Ae(g);
    for (; w && p !== g; ) {
      const y = Lt(w), v = w.getBoundingClientRect(), L = X(w), x = v.left + (w.clientLeft + parseFloat(L.paddingLeft)) * y.x, S = v.top + (w.clientTop + parseFloat(L.paddingTop)) * y.y;
      l *= y.x, d *= y.y, u *= y.x, m *= y.y, l += x, d += S, g = R(w), w = Ae(g);
    }
  }
  return te({
    width: u,
    height: m,
    x: l,
    y: d
  });
}
function le(t, e) {
  const o = se(t).scrollLeft;
  return e ? e.left + o : bt(tt(t)).left + o;
}
function Xo(t, e) {
  const o = t.getBoundingClientRect(), i = o.left + e.scrollLeft - le(t, o), n = o.top + e.scrollTop;
  return {
    x: i,
    y: n
  };
}
function Nn(t) {
  let {
    elements: e,
    rect: o,
    offsetParent: i,
    strategy: n
  } = t;
  const a = n === "fixed", r = tt(i), s = e ? ae(e.floating) : !1;
  if (i === r || s && a)
    return o;
  let l = {
    scrollLeft: 0,
    scrollTop: 0
  }, d = Z(1);
  const u = Z(0), m = rt(i);
  if ((m || !a) && ((kt(i) !== "body" || ne(r)) && (l = se(i)), m)) {
    const p = bt(i);
    d = Lt(i), u.x = p.x + i.clientLeft, u.y = p.y + i.clientTop;
  }
  const f = r && !m && !a ? Xo(r, l) : Z(0);
  return {
    width: o.width * d.x,
    height: o.height * d.y,
    x: o.x * d.x - l.scrollLeft * d.x + u.x + f.x,
    y: o.y * d.y - l.scrollTop * d.y + u.y + f.y
  };
}
function Un(t) {
  return t.getClientRects ? Array.from(t.getClientRects()) : [];
}
function Vn(t) {
  const e = se(t), o = t.ownerDocument.body, i = Q(t.scrollWidth, t.clientWidth, o.scrollWidth, o.clientWidth), n = Q(t.scrollHeight, t.clientHeight, o.scrollHeight, o.clientHeight);
  let a = -e.scrollLeft + le(t);
  const r = -e.scrollTop;
  return X(o).direction === "rtl" && (a += Q(t.clientWidth, o.clientWidth) - i), {
    width: i,
    height: n,
    x: a,
    y: r
  };
}
const qn = 25;
function Hn(t, e, o) {
  o === void 0 && (o = "viewport");
  const i = o === "layoutViewport", n = R(t), a = tt(t), r = n.visualViewport;
  let s = a.clientWidth, l = a.clientHeight, d = 0, u = 0;
  if (r) {
    const f = !Ie() || e === "fixed";
    i ? f || (d = -r.offsetLeft, u = -r.offsetTop) : (s = r.width, l = r.height, f && (d = r.offsetLeft, u = r.offsetTop));
  }
  if (le(a) <= 0) {
    const f = a.ownerDocument, p = f.body, g = getComputedStyle(p), w = f.compatMode === "CSS1Compat" && parseFloat(g.marginLeft) + parseFloat(g.marginRight) || 0, y = Math.abs(a.clientWidth - p.clientWidth - w), v = getComputedStyle(a).scrollbarGutter === "stable both-edges" ? y / 2 : y;
    v <= qn && (s -= v);
  }
  return {
    width: s,
    height: l,
    x: d,
    y: u
  };
}
function jn(t, e) {
  const o = bt(t, !0, e === "fixed"), i = o.top + t.clientTop, n = o.left + t.clientLeft, a = Lt(t), r = t.clientWidth * a.x, s = t.clientHeight * a.y, l = n * a.x, d = i * a.y;
  return {
    width: r,
    height: s,
    x: l,
    y: d
  };
}
function ro(t, e, o) {
  let i;
  if (e === "viewport" || e === "layoutViewport")
    i = Hn(t, o, e);
  else if (e === "document")
    i = Vn(tt(t));
  else if (W(e))
    i = jn(e, o);
  else {
    const n = Wo(t);
    i = {
      x: e.x - n.x,
      y: e.y - n.y,
      width: e.width,
      height: e.height
    };
  }
  return te(i);
}
function Wn(t, e) {
  const o = e.get(t);
  if (o)
    return o;
  let i = zt(t, [], !1).filter((s) => W(s) && kt(s) !== "body"), n = null;
  const a = X(t).position === "fixed";
  let r = a ? vt(t) : t;
  for (; W(r) && !Nt(r); ) {
    const s = X(r), l = re(r), d = n ? n.position : a ? "fixed" : "";
    !l && (d === "fixed" || d === "absolute" && s.position === "static") ? i = i.filter((m) => m !== r) : n = s, r = vt(r);
  }
  return e.set(t, i), i;
}
function Xn(t) {
  let {
    element: e,
    boundary: o,
    rootBoundary: i,
    strategy: n
  } = t;
  const r = [...o === "clippingAncestors" ? ae(e) ? [] : Wn(e, this._c) : [].concat(o), i], s = ro(e, r[0], n);
  let l = s.top, d = s.right, u = s.bottom, m = s.left;
  for (let f = 1; f < r.length; f++) {
    const p = ro(e, r[f], n);
    l = Q(p.top, l), d = nt(p.right, d), u = nt(p.bottom, u), m = Q(p.left, m);
  }
  return {
    width: d - m,
    height: u - l,
    x: m,
    y: l
  };
}
function Yn(t) {
  const {
    width: e,
    height: o
  } = jo(t);
  return {
    width: e,
    height: o
  };
}
function Kn(t, e, o) {
  const i = rt(e), n = tt(e), a = o === "fixed", r = bt(t, !0, a, e);
  let s = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const l = Z(0);
  if ((i || !a) && ((kt(e) !== "body" || ne(n)) && (s = se(e)), i)) {
    const f = bt(e, !0, a, e);
    l.x = f.x + e.clientLeft, l.y = f.y + e.clientTop;
  }
  !i && n && (l.x = le(n));
  const d = n && !i && !a ? Xo(n, s) : Z(0), u = r.left + s.scrollLeft - l.x - d.x, m = r.top + s.scrollTop - l.y - d.y;
  return {
    x: u,
    y: m,
    width: r.width,
    height: r.height
  };
}
function be(t) {
  return X(t).position === "static";
}
function so(t, e) {
  if (!rt(t) || X(t).position === "fixed")
    return null;
  if (e)
    return e(t);
  let o = t.offsetParent;
  return tt(t) === o && (o = o.ownerDocument.body), o;
}
function Yo(t, e) {
  const o = R(t);
  if (ae(t))
    return o;
  if (!rt(t)) {
    let n = vt(t);
    for (; n && !Nt(n); ) {
      if (W(n) && !be(n))
        return n;
      n = vt(n);
    }
    return o;
  }
  let i = so(t, e);
  for (; i && On(i) && be(i); )
    i = so(i, e);
  return i && Nt(i) && be(i) && !re(i) ? o : i || In(t) || o;
}
const Gn = async function(t) {
  const e = this.getOffsetParent || Yo, o = this.getDimensions, i = await o(t.floating);
  return {
    reference: Kn(t.reference, await e(t.floating), t.strategy),
    floating: {
      x: 0,
      y: 0,
      width: i.width,
      height: i.height
    }
  };
};
function Qn(t) {
  return X(t).direction === "rtl";
}
const Xt = {
  convertOffsetParentRelativeRectToViewportRelativeRect: Nn,
  getDocumentElement: tt,
  getClippingRect: Xn,
  getOffsetParent: Yo,
  getElementRects: Gn,
  getClientRects: Un,
  getDimensions: Yn,
  getScale: Lt,
  isElement: W,
  isRTL: Qn
};
function Ko(t, e) {
  return t.x === e.x && t.y === e.y && t.width === e.width && t.height === e.height;
}
function Zn(t, e, o) {
  let i = null, n;
  const a = tt(t);
  function r() {
    var u;
    clearTimeout(n), (u = i) == null || u.disconnect(), i = null;
  }
  function s(u, m) {
    u === void 0 && (u = !1), m === void 0 && (m = 1), r();
    const f = t.getBoundingClientRect(), {
      left: p,
      top: g,
      width: w,
      height: y
    } = f;
    if (u || e(), !w || !y)
      return;
    const v = Ht(g), L = Ht(a.clientWidth - (p + w)), x = Ht(a.clientHeight - (g + y)), S = Ht(p), A = {
      rootMargin: -v + "px " + -L + "px " + -x + "px " + -S + "px",
      threshold: Q(0, nt(1, m)) || 1
    };
    let F = !0;
    function D(H) {
      const _ = H[0].intersectionRatio;
      if (!Ko(f, t.getBoundingClientRect()))
        return s();
      if (_ !== m) {
        if (!F)
          return s();
        _ ? s(!1, _) : n = setTimeout(() => {
          s(!1, 1e-7);
        }, 1e3);
      }
      F = !1;
    }
    try {
      i = new IntersectionObserver(D, {
        ...A,
        // Handle <iframe>s
        root: a.ownerDocument
      });
    } catch {
      i = new IntersectionObserver(D, A);
    }
    i.observe(t);
  }
  const l = R(t), d = () => s(o);
  return l.addEventListener("resize", d), s(!0), () => {
    l.removeEventListener("resize", d), r();
  };
}
function Go(t, e, o, i) {
  i === void 0 && (i = {});
  const {
    ancestorScroll: n = !0,
    ancestorResize: a = !0,
    elementResize: r = typeof ResizeObserver == "function",
    layoutShift: s = typeof IntersectionObserver == "function",
    animationFrame: l = !1
  } = i, d = Be(t), u = n || a ? [...d ? zt(d) : [], ...e ? zt(e) : []] : [];
  u.forEach((v) => {
    n && v.addEventListener("scroll", o), a && v.addEventListener("resize", o);
  });
  const m = d && s ? Zn(d, o, a) : null;
  let f = -1, p = null;
  r && (p = new ResizeObserver((v) => {
    let [L] = v;
    L && L.target === d && p && e && (p.unobserve(e), cancelAnimationFrame(f), f = requestAnimationFrame(() => {
      var x;
      (x = p) == null || x.observe(e);
    })), o();
  }), d && !l && p.observe(d), e && p.observe(e));
  let g, w = l ? bt(t) : null;
  l && y();
  function y() {
    const v = bt(t);
    w && !Ko(w, v) && o(), w = v, g = requestAnimationFrame(y);
  }
  return o(), () => {
    var v;
    u.forEach((L) => {
      n && L.removeEventListener("scroll", o), a && L.removeEventListener("resize", o);
    }), m == null || m(), (v = p) == null || v.disconnect(), p = null, l && cancelAnimationFrame(g);
  };
}
const Qo = Pn, Zo = Mn, Jo = kn, lo = Fn, Jn = $n, ti = (t, e, o) => {
  const i = /* @__PURE__ */ new Map(), n = o ?? {}, a = {
    ...Xt,
    ...n.platform,
    _c: i
  };
  return An(t, e, {
    ...n,
    platform: a
  });
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var ye = /* @__PURE__ */ new Set(), P = class extends q {
  constructor() {
    super(...arguments), this.submenuCleanups = /* @__PURE__ */ new Map(), this.localize = new oe(this), this.userTypedQuery = "", this.openSubmenuStack = [], this.open = !1, this.size = "m", this.placement = "bottom-start", this.distance = 0, this.skidding = 0, this.handleDocumentKeyDown = async (t) => {
      const e = this.localize.dir() === "rtl";
      if (t.key === "Escape" && this.open && Bo(this)) {
        const u = this.getTrigger();
        t.preventDefault(), t.stopPropagation(), this.open = !1, u == null || u.focus({ preventScroll: !0 });
        return;
      }
      const o = [...Mo()].find((u) => u.localName === "wa-dropdown-item"), i = (o == null ? void 0 : o.localName) === "wa-dropdown-item", n = this.getCurrentSubmenuItem(), a = !!n;
      let r, s, l;
      a ? (r = this.getSubmenuItems(n), s = r.find((u) => u.active || u === o), l = s ? r.indexOf(s) : -1) : (r = this.getItems(), s = r.find((u) => u.active || u === o), l = s ? r.indexOf(s) : -1);
      let d;
      if (t.key === "ArrowUp" && (t.preventDefault(), t.stopPropagation(), l > 0 ? d = r[l - 1] : d = r[r.length - 1]), t.key === "ArrowDown" && (t.preventDefault(), t.stopPropagation(), l !== -1 && l < r.length - 1 ? d = r[l + 1] : d = r[0]), t.key === (e ? "ArrowLeft" : "ArrowRight") && i && s && s.hasSubmenu) {
        t.preventDefault(), t.stopPropagation(), s.submenuOpen = !0, this.addToSubmenuStack(s), setTimeout(() => {
          const u = this.getSubmenuItems(s);
          u.length > 0 && (u.forEach((m, f) => m.active = f === 0), u[0].focus({ preventScroll: !0 }));
        }, 0);
        return;
      }
      if (t.key === (e ? "ArrowRight" : "ArrowLeft") && a) {
        t.preventDefault(), t.stopPropagation();
        const u = this.removeFromSubmenuStack();
        u && (u.submenuOpen = !1, setTimeout(() => {
          u.focus({ preventScroll: !0 }), u.active = !0, (u.slot === "submenu" ? this.getSubmenuItems(u.parentElement) : this.getItems()).forEach((f) => {
            f !== u && (f.active = !1);
          });
        }, 0));
        return;
      }
      if ((t.key === "Home" || t.key === "End") && (t.preventDefault(), t.stopPropagation(), d = t.key === "Home" ? r[0] : r[r.length - 1]), t.key === "Tab" && await this.hideMenu(), t.key.length === 1 && !(t.metaKey || t.ctrlKey || t.altKey) && !(t.key === " " && this.userTypedQuery === "") && (clearTimeout(this.userTypedTimeout), this.userTypedTimeout = setTimeout(() => {
        this.userTypedQuery = "";
      }, 1e3), this.userTypedQuery += t.key, r.some((u) => {
        const m = (u.textContent || "").trim().toLowerCase(), f = this.userTypedQuery.trim().toLowerCase();
        return m.startsWith(f) ? (d = u, !0) : !1;
      })), d) {
        t.preventDefault(), t.stopPropagation(), r.forEach((u) => u.active = u === d), d.focus({ preventScroll: !0 }), d.scrollIntoView({ block: "nearest" });
        return;
      }
      (t.key === "Enter" || t.key === " " && this.userTypedQuery === "") && i && s && (t.preventDefault(), t.stopPropagation(), s.hasSubmenu ? (s.submenuOpen = !0, this.addToSubmenuStack(s), setTimeout(() => {
        const u = this.getSubmenuItems(s);
        u.length > 0 && (u.forEach((m, f) => m.active = f === 0), u[0].focus({ preventScroll: !0 }));
      }, 0)) : this.makeSelection(s, t));
    }, this.handleDocumentPointerDown = (t) => {
      t.composedPath().some((i) => i instanceof HTMLElement ? i === this || i.closest('wa-dropdown, [part="submenu"]') : !1) || (this.open = !1);
    }, this.handleGlobalMouseMove = (t) => {
      var f;
      const e = this.getCurrentSubmenuItem();
      if (!(e != null && e.submenuOpen) || !e.submenuElement) return;
      const o = e.submenuElement.getBoundingClientRect(), i = this.localize.dir() === "rtl", n = i ? o.right : o.left, a = i ? Math.max(t.clientX, n) : Math.min(t.clientX, n), r = Math.max(o.top, Math.min(t.clientY, o.bottom));
      e.submenuElement.style.setProperty("--safe-triangle-cursor-x", `${a}px`), e.submenuElement.style.setProperty("--safe-triangle-cursor-y", `${r}px`);
      const s = t.composedPath(), l = e.matches(":hover"), d = !!((f = e.submenuElement) != null && f.matches(":hover")), u = l || !!s.find((p) => p === e), m = d || !!s.find(
        (p) => p instanceof HTMLElement && p.closest('[part="submenu"]') === e.submenuElement
      );
      !u && !m && setTimeout(() => {
        !l && !d && (e.submenuOpen = !1);
      }, 100);
    };
  }
  handleSizeChange() {
    Pe(this.localName, this.size);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), clearInterval(this.userTypedTimeout), this.closeAllSubmenus(), this.submenuCleanups.forEach((t) => t()), this.submenuCleanups.clear(), document.removeEventListener("mousemove", this.handleGlobalMouseMove), document.removeEventListener("keydown", this.handleDocumentKeyDown), document.removeEventListener("pointerdown", this.handleDocumentPointerDown), Dt(this);
  }
  firstUpdated(t) {
    super.firstUpdated(t), this.syncAriaAttributes();
  }
  async updated(t) {
    if (t.has("open")) {
      const e = t.get("open");
      if (e === this.open || e === void 0 && this.open === !1)
        return;
      this.customStates.set("open", this.open), this.open ? await this.showMenu() : (this.closeAllSubmenus(), await this.hideMenu());
    }
    t.has("size") && this.syncItemSizes();
  }
  /** Gets all dropdown items slotted in the menu. */
  getItems(t = !1) {
    var o;
    const e = (((o = this.defaultSlot) == null ? void 0 : o.assignedElements({ flatten: !0 })) ?? []).filter(
      (i) => i.localName === "wa-dropdown-item"
    );
    return t ? e : e.filter((i) => !i.disabled);
  }
  /** Gets all dropdown items in a specific submenu. */
  getSubmenuItems(t, e = !1) {
    var n;
    const o = ((n = t.shadowRoot) == null ? void 0 : n.querySelector('slot[name="submenu"]')) || t.querySelector('slot[name="submenu"]');
    if (!o)
      return [];
    const i = o.assignedElements({ flatten: !0 }).filter((a) => a.localName === "wa-dropdown-item");
    return e ? i : i.filter((a) => !a.disabled);
  }
  /** Syncs item sizes with the dropdown's size property. */
  syncItemSizes() {
    var e;
    (((e = this.defaultSlot) == null ? void 0 : e.assignedElements({ flatten: !0 })) ?? []).filter(
      (o) => o.localName === "wa-dropdown-item"
    ).forEach((o) => o.size = this.size);
  }
  /** Handles the submenu navigation stack */
  addToSubmenuStack(t) {
    const e = this.openSubmenuStack.indexOf(t);
    e !== -1 ? this.openSubmenuStack = this.openSubmenuStack.slice(0, e + 1) : this.openSubmenuStack.push(t);
  }
  /** Removes the last item from the submenu stack */
  removeFromSubmenuStack() {
    return this.openSubmenuStack.pop();
  }
  /** Gets the current active submenu item */
  getCurrentSubmenuItem() {
    return this.openSubmenuStack.length > 0 ? this.openSubmenuStack[this.openSubmenuStack.length - 1] : void 0;
  }
  /** Closes all submenus in the dropdown. */
  closeAllSubmenus() {
    this.getItems(!0).forEach((e) => {
      e.submenuOpen = !1;
    }), this.openSubmenuStack = [];
  }
  /** Closes sibling submenus at the same level as the specified item. */
  closeSiblingSubmenus(t) {
    const e = t.closest('wa-dropdown-item:not([slot="submenu"])');
    let o;
    e ? o = this.getSubmenuItems(e, !0) : o = this.getItems(!0), o.forEach((i) => {
      i !== t && i.submenuOpen && (i.submenuOpen = !1);
    }), this.openSubmenuStack.includes(t) || this.openSubmenuStack.push(t);
  }
  /** Get the slotted trigger button, a <wa-button> or <button> element */
  getTrigger() {
    return this.querySelector('[slot="trigger"]');
  }
  /** Shows the dropdown menu. This should only be called from within updated(). */
  async showMenu() {
    if (!this.getTrigger() || !this.popup || !this.menu) return;
    const e = new Fo();
    if (this.dispatchEvent(e), e.defaultPrevented) {
      this.open = !1;
      return;
    }
    if (this.popup.active)
      return;
    ye.forEach((i) => i.open = !1), this.popup.active = !0, this.open = !0, ye.add(this), Io(this), this.syncAriaAttributes(), document.addEventListener("keydown", this.handleDocumentKeyDown), document.addEventListener("pointerdown", this.handleDocumentPointerDown), document.addEventListener("mousemove", this.handleGlobalMouseMove), this.menu.classList.remove("hide"), await St(this.menu, "show");
    const o = this.getItems();
    o.length > 0 && (o.forEach((i, n) => i.active = n === 0), o[0].focus({ preventScroll: !0 })), this.dispatchEvent(new To());
  }
  /** Hides the dropdown menu. This should only be called from within updated(). */
  async hideMenu() {
    if (!this.popup || !this.menu) return;
    const t = new Oo({ source: this });
    if (this.dispatchEvent(t), t.defaultPrevented) {
      this.open = !0;
      return;
    }
    this.open = !1, ye.delete(this), Dt(this), this.syncAriaAttributes(), document.removeEventListener("keydown", this.handleDocumentKeyDown), document.removeEventListener("pointerdown", this.handleDocumentPointerDown), document.removeEventListener("mousemove", this.handleGlobalMouseMove), this.menu.classList.remove("show"), await St(this.menu, "hide"), this.popup.active = this.open, this.dispatchEvent(new Ro());
  }
  /** Handles clicks on the menu. */
  handleMenuClick(t) {
    const e = t.target.closest("wa-dropdown-item");
    if (!(!e || e.disabled)) {
      if (e.hasSubmenu) {
        e.submenuOpen || (this.closeSiblingSubmenus(e), this.addToSubmenuStack(e), e.submenuOpen = !0), t.stopPropagation();
        return;
      }
      this.makeSelection(e, t);
    }
  }
  /** Prepares dropdown items when they get added or removed */
  async handleMenuSlotChange() {
    const t = this.getItems(!0);
    await Promise.all(t.map((i) => i.updateComplete)), this.syncItemSizes();
    const e = t.some((i) => i.type === "checkbox"), o = t.some((i) => i.hasSubmenu);
    t.forEach((i, n) => {
      i.setAttribute("aria-posinset", String(n + 1)), i.setAttribute("aria-setsize", String(t.length)), i.active = n === 0, i.checkboxAdjacent = e, i.submenuAdjacent = o;
    });
  }
  /** Toggles the dropdown menu */
  handleTriggerClick() {
    this.open = !this.open;
  }
  /** Handles submenu opening events */
  handleSubmenuOpening(t) {
    const e = t.detail.item;
    this.closeSiblingSubmenus(e), this.addToSubmenuStack(e), this.setupSubmenuPosition(e), this.processSubmenuItems(e);
  }
  /** Sets up submenu positioning with autoUpdate */
  setupSubmenuPosition(t) {
    if (!t.submenuElement) return;
    this.cleanupSubmenuPosition(t);
    const e = Go(t, t.submenuElement, () => {
      this.positionSubmenu(t), this.updateSafeTriangleCoordinates(t);
    });
    this.submenuCleanups.set(t, e);
    const o = t.submenuElement.querySelector('slot[name="submenu"]');
    o && (o.removeEventListener("slotchange", P.handleSubmenuSlotChange), o.addEventListener("slotchange", P.handleSubmenuSlotChange), P.handleSubmenuSlotChange({ target: o }));
  }
  static handleSubmenuSlotChange(t) {
    const e = t.target;
    if (!e) return;
    const o = e.assignedElements().filter((a) => a.localName === "wa-dropdown-item");
    if (o.length === 0) return;
    const i = o.some((a) => a.hasSubmenu), n = o.some((a) => a.type === "checkbox");
    o.forEach((a) => {
      a.submenuAdjacent = i, a.checkboxAdjacent = n;
    });
  }
  processSubmenuItems(t) {
    if (!t.submenuElement) return;
    const e = this.getSubmenuItems(t, !0), o = e.some((i) => i.hasSubmenu);
    e.forEach((i) => {
      i.submenuAdjacent = o;
    });
  }
  /** Cleans up submenu positioning */
  cleanupSubmenuPosition(t) {
    const e = this.submenuCleanups.get(t);
    e && (e(), this.submenuCleanups.delete(t));
  }
  /** Positions a submenu relative to its parent item */
  positionSubmenu(t) {
    if (!t.submenuElement) return;
    const o = this.localize.dir() === "rtl" ? "left-start" : "right-start";
    ti(t, t.submenuElement, {
      placement: o,
      middleware: [
        Qo({
          mainAxis: 0,
          crossAxis: -5
        }),
        Jo({
          fallbackStrategy: "bestFit"
        }),
        Zo({
          padding: 8,
          crossAxis: !0
        })
      ]
    }).then(({ x: i, y: n, placement: a }) => {
      t.submenuElement.setAttribute("data-placement", a), Object.assign(t.submenuElement.style, {
        left: `${i}px`,
        top: `${n}px`
      });
    });
  }
  /** Updates the safe triangle coordinates for a submenu */
  updateSafeTriangleCoordinates(t) {
    var n;
    if (!t.submenuElement || !t.submenuOpen) return;
    if ((n = document.activeElement) == null ? void 0 : n.matches(":focus-visible")) {
      t.submenuElement.style.setProperty("--safe-triangle-visible", "none");
      return;
    }
    t.submenuElement.style.setProperty("--safe-triangle-visible", "block");
    const o = t.submenuElement.getBoundingClientRect(), i = this.localize.dir() === "rtl";
    t.submenuElement.style.setProperty(
      "--safe-triangle-submenu-start-x",
      `${i ? o.right : o.left}px`
    ), t.submenuElement.style.setProperty("--safe-triangle-submenu-start-y", `${o.top}px`), t.submenuElement.style.setProperty(
      "--safe-triangle-submenu-end-x",
      `${i ? o.right : o.left}px`
    ), t.submenuElement.style.setProperty("--safe-triangle-submenu-end-y", `${o.bottom}px`);
  }
  /** Makes a selection, emits the wa-select event, and closes the dropdown. */
  makeSelection(t, e) {
    const o = this.getTrigger();
    if (t.disabled)
      return;
    t.type === "checkbox" && (t.checked = !t.checked);
    const i = new hn({ item: t });
    this.dispatchEvent(i), i.defaultPrevented || (t.navigate(e), this.open = !1, o == null || o.focus({ preventScroll: !0 }));
  }
  /** Syncs aria attributes on the slotted trigger element and the menu based on the dropdown's current state */
  async syncAriaAttributes() {
    var o;
    const t = this.getTrigger();
    let e;
    t && (t.localName === "wa-button" ? (await customElements.whenDefined("wa-button"), await t.updateComplete, e = t.shadowRoot.querySelector('[part~="base"]')) : e = t, e.hasAttribute("id") || e.setAttribute("id", Do("wa-dropdown-trigger-")), e.setAttribute("aria-haspopup", "menu"), e.setAttribute("aria-expanded", this.open ? "true" : "false"), (o = this.menu) == null || o.setAttribute("aria-expanded", "false"));
  }
  render() {
    var e;
    let t = this.didSSR && !this.hasUpdated ? this.open : (e = this.popup) == null ? void 0 : e.active;
    return O`
      <wa-popup
        placement=${this.placement}
        distance=${this.distance}
        skidding=${this.skidding}
        ?active=${t}
        flip
        flip-fallback-strategy="best-fit"
        shift
        shift-padding="10"
        auto-size="vertical"
        auto-size-padding="10"
      >
        <slot
          name="trigger"
          slot="anchor"
          @click=${this.handleTriggerClick}
          @slotchange=${this.syncAriaAttributes}
        ></slot>
        <div
          id="menu"
          part="menu"
          role="menu"
          tabindex="-1"
          aria-orientation="vertical"
          @click=${this.handleMenuClick}
          @submenu-opening=${this.handleSubmenuOpening}
        >
          <slot @slotchange=${this.handleMenuSlotChange}></slot>
        </div>
      </wa-popup>
    `;
  }
};
P.css = [zo, mn];
c([
  I("slot:not([name])")
], P.prototype, "defaultSlot", 2);
c([
  I("#menu")
], P.prototype, "menu", 2);
c([
  I("wa-popup")
], P.prototype, "popup", 2);
c([
  h({ type: Boolean, reflect: !0 })
], P.prototype, "open", 2);
c([
  h({ reflect: !0 })
], P.prototype, "size", 2);
c([
  B("size")
], P.prototype, "handleSizeChange", 1);
c([
  h({ reflect: !0 })
], P.prototype, "placement", 2);
c([
  h({ type: Number })
], P.prototype, "distance", 2);
c([
  h({ type: Number })
], P.prototype, "skidding", 2);
P = c([
  at("wa-dropdown")
], P);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var ta = V`
  :host {
    display: flex;
    position: relative;
    align-items: center;
    padding: 0.5em 1em;
    border-radius: var(--wa-border-radius-s);
    isolation: isolate;
    color: var(--wa-color-text-normal);
    line-height: var(--wa-line-height-condensed);
    cursor: pointer;
    transition:
      var(--wa-transition-fast) background-color var(--wa-transition-easing),
      var(--wa-transition-fast) color var(--wa-transition-easing);
  }

  @media (hover: hover) {
    :host(:hover:not(:state(disabled))) {
      background-color: var(--wa-color-neutral-fill-normal);
    }
  }

  :host(:state(submenu-open)) {
    background-color: var(--wa-color-neutral-fill-normal);
  }

  :host(:focus-visible) {
    z-index: 1;
    outline: var(--wa-focus-ring);
    background-color: var(--wa-color-neutral-fill-normal);
  }

  :host(:state(disabled)),
  :host([disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Danger variant */
  :host([variant='danger']),
  :host([variant='danger']) #details {
    color: var(--wa-color-danger-on-quiet);
  }

  @media (hover: hover) {
    :host([variant='danger']:hover) {
      background-color: var(--wa-color-danger-fill-normal);
      color: var(--wa-color-danger-on-normal);
    }
  }

  :host([variant='danger']:state(submenu-open)),
  :host([variant='danger']:focus-visible) {
    background-color: var(--wa-color-danger-fill-normal);
    color: var(--wa-color-danger-on-normal);
  }

  :host([checkbox-adjacent]) {
    padding-inline-start: 2em;
  }

  /* Only add padding when item actually has a submenu */
  :host([submenu-adjacent]:not(:state(has-submenu))) #details {
    padding-inline-end: 0;
  }

  :host(:state(has-submenu)[submenu-adjacent]) #details {
    padding-inline-end: 1.75em;
  }

  /* The link only exists to be clicked programmatically. */
  #link {
    display: none;
  }

  #check {
    visibility: hidden;
    margin-inline-start: -1.5em;
    margin-inline-end: 0.5em;
    font-size: var(--wa-font-size-smaller);
  }

  :host(:state(checked)) #check {
    visibility: visible;
  }

  #icon ::slotted(*) {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    margin-inline-end: 0.75em !important;
    font-size: var(--wa-font-size-smaller);
  }

  #label {
    flex: 1 1 auto;
    min-width: 0;
  }

  #details {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: end;
    color: var(--wa-color-text-quiet);
    font-size: var(--wa-font-size-smaller) !important;
  }

  #details ::slotted(*) {
    margin-inline-start: 2em !important;
  }

  /* Submenu indicator icon */
  #submenu-indicator {
    position: absolute;
    inset-inline-end: 1em;
    color: var(--wa-color-neutral-on-quiet);
    font-size: var(--wa-font-size-smaller);
  }

  /* Flip chevron icon when RTL */
  :host(:dir(rtl)) #submenu-indicator {
    transform: scaleX(-1);
  }

  /* Submenu styles */
  #submenu {
    display: flex;
    z-index: 10;
    position: absolute;
    top: 0;
    left: 0;
    flex-direction: column;
    width: max-content;
    margin: 0;
    padding: 0.25em;
    border: var(--wa-border-style) var(--wa-border-width-s) var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-m);
    background-color: var(--wa-color-surface-raised);
    box-shadow: var(--wa-shadow-m);
    color: var(--wa-color-text-normal);
    text-align: start;
    user-select: none;

    /* Override default popover styles */
    &[popover] {
      margin: 0;
      inset: auto;
      padding: 0.25em;
      overflow: visible;
      border-radius: var(--wa-border-radius-m);
    }

    &.show {
      animation: submenu-show var(--show-duration, var(--wa-transition-fast)) ease;
    }

    &.hide {
      animation: submenu-show var(--show-duration, var(--wa-transition-fast)) ease reverse;
    }

    /* Submenu placement transform origins */
    &[data-placement^='top'] {
      transform-origin: bottom;
    }

    &[data-placement^='bottom'] {
      transform-origin: top;
    }

    &[data-placement^='left'] {
      transform-origin: right;
    }

    &[data-placement^='right'] {
      transform-origin: left;
    }

    &[data-placement='left-start'] {
      transform-origin: right top;
    }

    &[data-placement='left-end'] {
      transform-origin: right bottom;
    }

    &[data-placement='right-start'] {
      transform-origin: left top;
    }

    &[data-placement='right-end'] {
      transform-origin: left bottom;
    }

    /* Safe triangle styling */
    &::before {
      display: none;
      z-index: 9;
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background-color: transparent;
      content: '';
      clip-path: polygon(
        var(--safe-triangle-cursor-x, 0) var(--safe-triangle-cursor-y, 0),
        var(--safe-triangle-submenu-start-x, 0) var(--safe-triangle-submenu-start-y, 0),
        var(--safe-triangle-submenu-end-x, 0) var(--safe-triangle-submenu-end-y, 0)
      );
      pointer-events: auto; /* Enable mouse events on the triangle */
    }

    &[data-visible]::before {
      display: block;
    }
  }

  ::slotted(wa-dropdown-item) {
    font-size: inherit;
  }

  ::slotted(wa-divider) {
    --spacing: 0.25em;
  }

  @keyframes submenu-show {
    from {
      scale: 0.9;
      opacity: 0;
    }
    to {
      scale: 1;
      opacity: 1;
    }
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var $ = class extends q {
  constructor() {
    super(...arguments), this.hasSlotController = new So(this, "[default]", "start", "end"), this.active = !1, this.variant = "default", this.size = "m", this.checkboxAdjacent = !1, this.submenuAdjacent = !1, this.type = "normal", this.checked = !1, this.disabled = !1, this.submenuOpen = !1, this.hasSubmenu = !1, this.handleSlotChange = () => {
      this.hasSubmenu = this.hasSlotController.test("submenu"), this.updateHasSubmenuState(), this.hasSubmenu ? (this.setAttribute("aria-haspopup", "menu"), this.setAttribute("aria-expanded", this.submenuOpen ? "true" : "false")) : (this.removeAttribute("aria-haspopup"), this.removeAttribute("aria-expanded"));
    }, this.handleHostClick = (t) => {
      this.disabled && (t.preventDefault(), t.stopImmediatePropagation());
    }, this.handleClick = (t) => {
      this.disabled && (t.preventDefault(), t.stopImmediatePropagation());
    }, this.handlePointerEnter = (t) => {
      t.pointerType === "mouse" && this.hasSubmenu && !this.disabled && (this.notifyParentOfOpening(), this.submenuOpen = !0);
    };
  }
  handleSizeChange() {
    Pe(this.localName, this.size);
  }
  connectedCallback() {
    var t, e, o, i, n, a;
    super.connectedCallback(), (t = this.addEventListener) == null || t.call(this, "click", this.handleHostClick), (e = this.addEventListener) == null || e.call(this, "pointerenter", this.handlePointerEnter), (i = (o = this.shadowRoot) == null ? void 0 : o.addEventListener) == null || i.call(o, "click", this.handleClick, { capture: !0 }), (a = (n = this.shadowRoot) == null ? void 0 : n.addEventListener) == null || a.call(n, "slotchange", this.handleSlotChange);
  }
  disconnectedCallback() {
    var t, e, o, i, n, a;
    super.disconnectedCallback(), this.closeSubmenu(), (t = this.removeEventListener) == null || t.call(this, "click", this.handleHostClick), (e = this.removeEventListener) == null || e.call(this, "pointerenter", this.handlePointerEnter), (i = (o = this.shadowRoot) == null ? void 0 : o.removeEventListener) == null || i.call(o, "click", this.handleClick, { capture: !0 }), (a = (n = this.shadowRoot) == null ? void 0 : n.removeEventListener) == null || a.call(n, "slotchange", this.handleSlotChange);
  }
  firstUpdated(t) {
    super.firstUpdated(t), this.setAttribute("tabindex", "-1"), this.hasSubmenu = this.hasSlotController.test("submenu"), this.updateHasSubmenuState();
  }
  updated(t) {
    t.has("active") && (this.setAttribute("tabindex", this.active ? "0" : "-1"), this.customStates.set("active", this.active)), t.has("checked") && (this.type === "checkbox" ? this.setAttribute("aria-checked", this.checked ? "true" : "false") : this.removeAttribute("aria-checked"), this.customStates.set("checked", this.checked)), t.has("disabled") && (this.setAttribute("aria-disabled", this.disabled ? "true" : "false"), this.customStates.set("disabled", this.disabled)), t.has("type") && (this.type === "checkbox" ? (this.setAttribute("role", "menuitemcheckbox"), this.setAttribute("aria-checked", this.checked ? "true" : "false")) : (this.setAttribute("role", "menuitem"), this.removeAttribute("aria-checked"))), (t.has("href") || t.has("hasSubmenu")) && this.customStates.set("link", this.isLink()), t.has("submenuOpen") && (this.customStates.set("submenu-open", this.submenuOpen), this.submenuOpen ? this.openSubmenu() : this.closeSubmenu());
  }
  /** Update the has-submenu custom state */
  updateHasSubmenuState() {
    this.customStates.set("has-submenu", this.hasSubmenu);
  }
  /** Opens the submenu. */
  async openSubmenu() {
    var e;
    const t = this.submenuElement;
    !this.hasSubmenu || !t || !this.isConnected || (this.notifyParentOfOpening(), (e = t.showPopover) == null || e.call(t), t.hidden = !1, t.setAttribute("data-visible", ""), this.submenuOpen = !0, this.setAttribute("aria-expanded", "true"), await St(t, "show"), setTimeout(() => {
      const o = this.getSubmenuItems();
      o.length > 0 && (o.forEach((i, n) => i.active = n === 0), o[0].focus({ preventScroll: !0 }));
    }, 0));
  }
  /** Notifies the parent dropdown that this item is opening its submenu */
  notifyParentOfOpening() {
    const t = new CustomEvent("submenu-opening", {
      bubbles: !0,
      composed: !0,
      detail: { item: this }
    });
    this.dispatchEvent(t);
    const e = this.parentElement;
    e && [...e.children].filter(
      (i) => i !== this && i.localName === "wa-dropdown-item" && i.getAttribute("slot") === this.getAttribute("slot") && i.submenuOpen
    ).forEach((i) => {
      i.submenuOpen = !1;
    });
  }
  /** Closes the submenu. */
  async closeSubmenu() {
    var e;
    const t = this.submenuElement;
    !this.hasSubmenu || !t || (this.submenuOpen = !1, this.setAttribute("aria-expanded", "false"), t.hidden || (await St(t, "hide"), t != null && t.isConnected && (t.hidden = !0, t.removeAttribute("data-visible"), (e = t.hidePopover) == null || e.call(t))));
  }
  /** Determines whether the item navigates when selected. Items with submenus never navigate. */
  isLink() {
    return !!this.href && !this.hasSubmenu;
  }
  /**
   * @internal Navigates to the item's `href` by clicking the hidden link in the shadow root. The event that triggered
   * the selection is passed along so modifier keys, such as pressing Command or Control to open a new tab, are honored.
   * Note that Safari ignores modifier keys on synthetic clicks.
   */
  navigate(t) {
    const e = this.linkElement;
    !this.isLink() || this.disabled || !e || e.dispatchEvent(
      new MouseEvent("click", {
        bubbles: !1,
        cancelable: !0,
        composed: !1,
        altKey: (t == null ? void 0 : t.altKey) ?? !1,
        ctrlKey: (t == null ? void 0 : t.ctrlKey) ?? !1,
        metaKey: (t == null ? void 0 : t.metaKey) ?? !1,
        shiftKey: (t == null ? void 0 : t.shiftKey) ?? !1
      })
    );
  }
  /** Gets all dropdown items in the submenu. */
  getSubmenuItems() {
    return [...this.children].filter(
      (t) => t.localName === "wa-dropdown-item" && t.getAttribute("slot") === "submenu" && !t.hasAttribute("disabled")
    );
  }
  render() {
    return O`
      ${this.href ? O`
            <a
              id="link"
              href=${this.href}
              target=${T(this.target)}
              rel=${T(this.rel)}
              download=${T(this.download)}
              tabindex="-1"
              aria-hidden="true"
            ></a>
          ` : ""}
      ${this.type === "checkbox" ? O`
            <wa-icon
              id="check"
              part="checkmark"
              exportparts="svg:checkmark__svg"
              library="system"
              name="check"
            ></wa-icon>
          ` : ""}

      <span id="icon" part="icon">
        <slot name="icon"></slot>
      </span>

      <span id="label" part="label">
        <slot></slot>
      </span>

      <span id="details" part="details">
        <slot name="details"></slot>
      </span>

      ${this.hasSubmenu ? O`
            <wa-icon
              id="submenu-indicator"
              part="submenu-icon"
              exportparts="svg:submenu-icon__svg"
              library="system"
              name="chevron-right"
            ></wa-icon>
          ` : ""}
      ${this.hasSubmenu ? O`
            <div
              id="submenu"
              part="submenu"
              popover="manual"
              role="menu"
              tabindex="-1"
              aria-orientation="vertical"
              hidden
            >
              <slot name="submenu"></slot>
            </div>
          ` : ""}
    `;
  }
};
$.css = ta;
c([
  I("#submenu")
], $.prototype, "submenuElement", 2);
c([
  I("#link")
], $.prototype, "linkElement", 2);
c([
  h({ type: Boolean })
], $.prototype, "active", 2);
c([
  h({ reflect: !0 })
], $.prototype, "variant", 2);
c([
  h({ reflect: !0 })
], $.prototype, "size", 2);
c([
  B("size")
], $.prototype, "handleSizeChange", 1);
c([
  h({ attribute: "checkbox-adjacent", type: Boolean, reflect: !0 })
], $.prototype, "checkboxAdjacent", 2);
c([
  h({ attribute: "submenu-adjacent", type: Boolean, reflect: !0 })
], $.prototype, "submenuAdjacent", 2);
c([
  h()
], $.prototype, "value", 2);
c([
  h({ reflect: !0 })
], $.prototype, "type", 2);
c([
  h({ type: Boolean })
], $.prototype, "checked", 2);
c([
  h({ type: Boolean, reflect: !0 })
], $.prototype, "disabled", 2);
c([
  h({ type: Boolean, reflect: !0 })
], $.prototype, "submenuOpen", 2);
c([
  h({ reflect: !0 })
], $.prototype, "href", 2);
c([
  h()
], $.prototype, "target", 2);
c([
  h()
], $.prototype, "rel", 2);
c([
  h()
], $.prototype, "download", 2);
c([
  Vt()
], $.prototype, "hasSubmenu", 2);
$ = c([
  at("wa-dropdown-item")
], $);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var ea = class extends Event {
  constructor() {
    super("wa-reposition", { bubbles: !0, cancelable: !1, composed: !0 });
  }
};
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var oa = V`
  :host {
    --arrow-color: black;
    --arrow-size: var(--wa-tooltip-arrow-size);
    --popup-border-width: 0px;
    --show-duration: var(--wa-transition-fast);
    --hide-duration: var(--wa-transition-fast);

    /*
     * These properties are computed to account for the arrow's dimensions after being rotated 45º. The constant
     * 0.7071 is derived from sin(45) to calculate the length of the arrow after rotation.
     *
     * The diamond will be translated inward by --arrow-base-offset, the border thickness, to centralise it on
     * the inner edge of the popup border. This also means we need to increase the size of the arrow by the
     * same amount to compensate.
     *
     * A diamond shaped clipping mask is used to avoid overlap of popup content. This extends slightly inward so
     * the popup border is covered with no sub-pixel rounding artifacts. The diamond corners are mitred at 22.5º
     * to properly merge any arrow border with the popup border. The constant 1.4142 is derived from 1 + tan(22.5).
     *
     */
    --arrow-base-offset: var(--popup-border-width);
    --arrow-size-diagonal: calc((var(--arrow-size) + var(--arrow-base-offset)) * 0.7071);
    --arrow-padding-offset: calc(var(--arrow-size-diagonal) - var(--arrow-size));
    --arrow-size-div: calc(var(--arrow-size-diagonal) * 2);
    --arrow-clipping-corner: calc(var(--arrow-base-offset) * 1.4142);

    display: contents;
  }

  .popup {
    position: absolute;
    isolation: isolate;
    max-width: var(--auto-size-available-width, none);
    max-height: var(--auto-size-available-height, none);

    /* Clear UA styles for [popover] */
    :where(&) {
      inset: unset;
      padding: unset;
      margin: unset;
      width: unset;
      height: unset;
      color: unset;
      background: unset;
      border: unset;
      overflow: unset;
    }
  }

  .popup-fixed {
    position: fixed;
  }

  .popup:not(.popup-active) {
    display: none;
  }

  .arrow {
    position: absolute;
    width: var(--arrow-size-div);
    height: var(--arrow-size-div);
    background: var(--arrow-color);
    z-index: 3;
    clip-path: polygon(
      var(--arrow-clipping-corner) 100%,
      var(--arrow-base-offset) calc(100% - var(--arrow-base-offset)),
      calc(var(--arrow-base-offset) - 2px) calc(100% - var(--arrow-base-offset)),
      calc(100% - var(--arrow-base-offset)) calc(var(--arrow-base-offset) - 2px),
      calc(100% - var(--arrow-base-offset)) var(--arrow-base-offset),
      100% var(--arrow-clipping-corner),
      100% 100%
    );
    rotate: 45deg;
  }

  :host([data-current-placement|='left']) .arrow {
    rotate: -45deg;
  }

  :host([data-current-placement|='right']) .arrow {
    rotate: 135deg;
  }

  :host([data-current-placement|='bottom']) .arrow {
    rotate: 225deg;
  }

  /* Hover bridge */
  .popup-hover-bridge:not(.popup-hover-bridge-visible) {
    display: none;
  }

  .popup-hover-bridge {
    position: fixed;
    z-index: 899;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    clip-path: polygon(
      var(--hover-bridge-top-left-x, 0) var(--hover-bridge-top-left-y, 0),
      var(--hover-bridge-top-right-x, 0) var(--hover-bridge-top-right-y, 0),
      var(--hover-bridge-bottom-right-x, 0) var(--hover-bridge-bottom-right-y, 0),
      var(--hover-bridge-bottom-left-x, 0) var(--hover-bridge-bottom-left-y, 0)
    );
  }

  /* Built-in animations */
  .show {
    animation: show var(--show-duration) ease;
  }

  .hide {
    animation: show var(--hide-duration) ease reverse;
  }

  @keyframes show {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .show-with-scale {
    animation: show-with-scale var(--show-duration) ease;
  }

  .hide-with-scale {
    animation: show-with-scale var(--hide-duration) ease reverse;
  }

  @keyframes show-with-scale {
    from {
      opacity: 0;
      scale: 0.8;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
`;
function ia(t) {
  return na(t);
}
function Ce(t) {
  return t.assignedSlot ? t.assignedSlot : t.parentNode instanceof ShadowRoot ? t.parentNode.host : t.parentNode;
}
function na(t) {
  for (let e = t; e; e = Ce(e)) if (e instanceof Element && getComputedStyle(e).display === "none") return null;
  for (let e = Ce(t); e; e = Ce(e)) {
    if (!(e instanceof Element)) continue;
    const o = getComputedStyle(e);
    if (o.display !== "contents" && (o.position !== "static" || re(o) || e.tagName === "BODY"))
      return e;
  }
  return null;
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function co(t) {
  return t !== null && typeof t == "object" && "getBoundingClientRect" in t && ("contextElement" in t ? t instanceof Element : !0);
}
var fo, aa = !!((fo = globalThis == null ? void 0 : globalThis.HTMLElement) != null && fo.prototype.hasOwnProperty("popover")), C = class extends q {
  constructor() {
    super(...arguments), this.localize = new oe(this), this.SUPPORTS_POPOVER = !1, this.active = !1, this.placement = "top", this.boundary = "viewport", this.distance = 0, this.skidding = 0, this.arrow = !1, this.arrowPlacement = "anchor", this.arrowPadding = 10, this.flip = !1, this.flipFallbackPlacements = "", this.flipFallbackStrategy = "best-fit", this.flipPadding = 0, this.shift = !1, this.shiftPadding = 0, this.autoSizePadding = 0, this.hoverBridge = !1, this.updateHoverBridge = () => {
      if (this.hoverBridge && this.anchorEl && this.popup) {
        const t = this.anchorEl.getBoundingClientRect(), e = this.popup.getBoundingClientRect(), o = this.placement.includes("top") || this.placement.includes("bottom");
        let i = 0, n = 0, a = 0, r = 0, s = 0, l = 0, d = 0, u = 0;
        o ? t.top < e.top ? (i = t.left, n = t.bottom, a = t.right, r = t.bottom, s = e.left, l = e.top, d = e.right, u = e.top) : (i = e.left, n = e.bottom, a = e.right, r = e.bottom, s = t.left, l = t.top, d = t.right, u = t.top) : t.left < e.left ? (i = t.right, n = t.top, a = e.left, r = e.top, s = t.right, l = t.bottom, d = e.left, u = e.bottom) : (i = e.right, n = e.top, a = t.left, r = t.top, s = e.right, l = e.bottom, d = t.left, u = t.bottom), this.style.setProperty("--hover-bridge-top-left-x", `${i}px`), this.style.setProperty("--hover-bridge-top-left-y", `${n}px`), this.style.setProperty("--hover-bridge-top-right-x", `${a}px`), this.style.setProperty("--hover-bridge-top-right-y", `${r}px`), this.style.setProperty("--hover-bridge-bottom-left-x", `${s}px`), this.style.setProperty("--hover-bridge-bottom-left-y", `${l}px`), this.style.setProperty("--hover-bridge-bottom-right-x", `${d}px`), this.style.setProperty("--hover-bridge-bottom-right-y", `${u}px`);
      }
    };
  }
  async connectedCallback() {
    super.connectedCallback(), await this.updateComplete, this.SUPPORTS_POPOVER = aa, this.start();
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this.stop();
  }
  async updated(t) {
    super.updated(t), t.has("active") && (this.active ? this.start() : this.stop()), t.has("anchor") && this.handleAnchorChange(), this.active && (await this.updateComplete, this.reposition());
  }
  async handleAnchorChange() {
    if (await this.stop(), this.anchor && typeof this.anchor == "string") {
      const t = this.getRootNode();
      this.anchorEl = t.getElementById(this.anchor);
    } else this.anchor instanceof Element || co(this.anchor) ? this.anchorEl = this.anchor : this.anchorEl = this.querySelector('[slot="anchor"]');
    this.anchorEl instanceof HTMLSlotElement && (this.anchorEl = this.anchorEl.assignedElements({ flatten: !0 })[0]), this.anchorEl && this.start();
  }
  start() {
    var t, e;
    !this.anchorEl || !this.active || !this.isConnected || ((e = (t = this.popup) == null ? void 0 : t.showPopover) == null || e.call(t), this.cleanup = Go(this.anchorEl, this.popup, () => {
      this.reposition();
    }));
  }
  async stop() {
    return new Promise((t) => {
      var e, o;
      (o = (e = this.popup) == null ? void 0 : e.hidePopover) == null || o.call(e), this.cleanup ? (this.cleanup(), this.cleanup = void 0, this.removeAttribute("data-current-placement"), this.style.removeProperty("--auto-size-available-width"), this.style.removeProperty("--auto-size-available-height"), requestAnimationFrame(() => t())) : t();
    });
  }
  /** Forces the popup to recalculate and reposition itself. */
  reposition() {
    if (!this.active || !this.anchorEl || !this.popup)
      return;
    const t = [
      // The offset middleware goes first
      Qo({ mainAxis: this.distance, crossAxis: this.skidding })
    ];
    this.sync ? t.push(
      lo({
        apply: ({ rects: i }) => {
          const n = this.sync === "width" || this.sync === "both", a = this.sync === "height" || this.sync === "both";
          this.popup.style.width = n ? `${i.reference.width}px` : "", this.popup.style.height = a ? `${i.reference.height}px` : "";
        }
      })
    ) : (this.popup.style.width = "", this.popup.style.height = "");
    let e;
    this.SUPPORTS_POPOVER && !co(this.anchor) && this.boundary === "scroll" && (e = zt(this.anchorEl).filter((i) => i instanceof Element)), this.flip && t.push(
      Jo({
        boundary: this.flipBoundary || e,
        // @ts-expect-error - We're converting a string attribute to an array here
        fallbackPlacements: this.flipFallbackPlacements,
        fallbackStrategy: this.flipFallbackStrategy === "best-fit" ? "bestFit" : "initialPlacement",
        padding: this.flipPadding
      })
    ), this.shift && t.push(
      Zo({
        boundary: this.shiftBoundary || e,
        padding: this.shiftPadding
      })
    ), this.autoSize ? t.push(
      lo({
        boundary: this.autoSizeBoundary || e,
        padding: this.autoSizePadding,
        apply: ({ availableWidth: i, availableHeight: n }) => {
          this.autoSize === "vertical" || this.autoSize === "both" ? this.style.setProperty("--auto-size-available-height", `${n}px`) : this.style.removeProperty("--auto-size-available-height"), this.autoSize === "horizontal" || this.autoSize === "both" ? this.style.setProperty("--auto-size-available-width", `${i}px`) : this.style.removeProperty("--auto-size-available-width");
        }
      })
    ) : (this.style.removeProperty("--auto-size-available-width"), this.style.removeProperty("--auto-size-available-height")), this.arrow && t.push(
      Jn({
        element: this.arrowEl,
        padding: this.arrowPadding
      })
    );
    const o = this.SUPPORTS_POPOVER ? (i) => Xt.getOffsetParent(i, ia) : Xt.getOffsetParent;
    ti(this.anchorEl, this.popup, {
      placement: this.placement,
      middleware: t,
      strategy: this.SUPPORTS_POPOVER ? "absolute" : "fixed",
      platform: {
        ...Xt,
        getOffsetParent: o
      }
    }).then(({ x: i, y: n, middlewareData: a, placement: r }) => {
      const s = this.localize.dir() === "rtl", l = { top: "bottom", right: "left", bottom: "top", left: "right" }[r.split("-")[0]];
      if (this.setAttribute("data-current-placement", r), Object.assign(this.popup.style, {
        left: `${i}px`,
        top: `${n}px`
      }), this.arrow) {
        const d = a.arrow.x, u = a.arrow.y;
        let m = "", f = "", p = "", g = "";
        if (this.arrowPlacement === "start") {
          const w = typeof d == "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
          m = typeof u == "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "", f = s ? w : "", g = s ? "" : w;
        } else if (this.arrowPlacement === "end") {
          const w = typeof d == "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
          f = s ? "" : w, g = s ? w : "", p = typeof u == "number" ? `calc(${this.arrowPadding}px - var(--arrow-padding-offset))` : "";
        } else this.arrowPlacement === "center" ? (g = typeof d == "number" ? "calc(50% - var(--arrow-size-diagonal))" : "", m = typeof u == "number" ? "calc(50% - var(--arrow-size-diagonal))" : "") : (g = typeof d == "number" ? `${d}px` : "", m = typeof u == "number" ? `${u}px` : "");
        Object.assign(this.arrowEl.style, {
          top: m,
          right: f,
          bottom: p,
          left: g,
          [l]: "calc(var(--arrow-base-offset) - var(--arrow-size-diagonal))"
        });
      }
    }), requestAnimationFrame(() => this.updateHoverBridge()), this.dispatchEvent(new ea());
  }
  render() {
    return O`
      <slot name="anchor" @slotchange=${this.handleAnchorChange}></slot>

      <span
        part="hover-bridge"
        class=${Gt({
      "popup-hover-bridge": !0,
      "popup-hover-bridge-visible": this.hoverBridge && this.active
    })}
      ></span>

      <div
        popover="manual"
        part="popup"
        class=${Gt({
      popup: !0,
      "popup-active": this.active,
      "popup-fixed": !this.SUPPORTS_POPOVER,
      "popup-has-arrow": this.arrow
    })}
      >
        <slot></slot>
        ${this.arrow ? O`<div part="arrow" class="arrow" role="presentation"></div>` : ""}
      </div>
    `;
  }
};
C.css = oa;
c([
  I(".popup")
], C.prototype, "popup", 2);
c([
  I(".arrow")
], C.prototype, "arrowEl", 2);
c([
  h({ attribute: !1, type: Boolean })
], C.prototype, "SUPPORTS_POPOVER", 2);
c([
  h()
], C.prototype, "anchor", 2);
c([
  h({ type: Boolean, reflect: !0 })
], C.prototype, "active", 2);
c([
  h({ reflect: !0 })
], C.prototype, "placement", 2);
c([
  h()
], C.prototype, "boundary", 2);
c([
  h({ type: Number })
], C.prototype, "distance", 2);
c([
  h({ type: Number })
], C.prototype, "skidding", 2);
c([
  h({ type: Boolean })
], C.prototype, "arrow", 2);
c([
  h({ attribute: "arrow-placement" })
], C.prototype, "arrowPlacement", 2);
c([
  h({ attribute: "arrow-padding", type: Number })
], C.prototype, "arrowPadding", 2);
c([
  h({ type: Boolean })
], C.prototype, "flip", 2);
c([
  h({
    attribute: "flip-fallback-placements",
    converter: {
      fromAttribute: (t) => t.split(" ").map((e) => e.trim()).filter((e) => e !== ""),
      toAttribute: (t) => t.join(" ")
    }
  })
], C.prototype, "flipFallbackPlacements", 2);
c([
  h({ attribute: "flip-fallback-strategy" })
], C.prototype, "flipFallbackStrategy", 2);
c([
  h({ type: Object })
], C.prototype, "flipBoundary", 2);
c([
  h({ attribute: "flip-padding", type: Number })
], C.prototype, "flipPadding", 2);
c([
  h({ type: Boolean })
], C.prototype, "shift", 2);
c([
  h({ type: Object })
], C.prototype, "shiftBoundary", 2);
c([
  h({ attribute: "shift-padding", type: Number })
], C.prototype, "shiftPadding", 2);
c([
  h({ attribute: "auto-size" })
], C.prototype, "autoSize", 2);
c([
  h()
], C.prototype, "sync", 2);
c([
  h({ type: Object })
], C.prototype, "autoSizeBoundary", 2);
c([
  h({ attribute: "auto-size-padding", type: Number })
], C.prototype, "autoSizePadding", 2);
c([
  h({ attribute: "hover-bridge", type: Boolean })
], C.prototype, "hoverBridge", 2);
C = c([
  at("wa-popup")
], C);
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
var ra = V`
  :host {
    --max-width: 30ch;

    /** These styles are added so we don't interfere in the DOM. */
    display: inline-block;
    position: absolute;

    /** Defaults for inherited CSS properties */
    color: var(--wa-tooltip-content-color);
    font-size: var(--wa-tooltip-font-size);
    line-height: var(--wa-tooltip-line-height);
    text-align: start;
    white-space: normal;
  }

  .tooltip {
    --arrow-size: var(--wa-tooltip-arrow-size);
    --arrow-color: var(--wa-tooltip-background-color);
  }

  .tooltip::part(popup) {
    z-index: 1000;
  }

  .tooltip[placement^='top']::part(popup) {
    transform-origin: bottom;
  }

  .tooltip[placement^='bottom']::part(popup) {
    transform-origin: top;
  }

  .tooltip[placement^='left']::part(popup) {
    transform-origin: right;
  }

  .tooltip[placement^='right']::part(popup) {
    transform-origin: left;
  }

  .body {
    display: block;
    width: max-content;
    max-width: var(--max-width);
    border-radius: var(--wa-tooltip-border-radius);
    background-color: var(--wa-tooltip-background-color);
    border: var(--wa-tooltip-border-width) var(--wa-tooltip-border-style) var(--wa-tooltip-border-color);
    padding: 0.25em 0.5em;
    user-select: none;
    -webkit-user-select: none;
  }

  .tooltip {
    --popup-border-width: var(--wa-tooltip-border-width);

    /* Inset box-shadow, not a border: Safari seams a clip-path edge that runs along a border. */
    &::part(arrow) {
      box-shadow: inset calc(-1 * var(--wa-tooltip-border-width)) calc(-1 * var(--wa-tooltip-border-width)) 0 0
        var(--wa-tooltip-border-color);
    }
  }
`;
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function uo(t, e) {
  return new Promise((o) => {
    function i(n) {
      n.target === t && (t.removeEventListener(e, i), o());
    }
    t.addEventListener(e, i);
  });
}
/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
function ho(t, e) {
  for (; e; ) {
    if (e === t)
      return !0;
    e instanceof Element && e.assignedSlot ? e = e.assignedSlot : e.parentNode ? e = e.parentNode : e instanceof ShadowRoot ? e = e.host : e = null;
  }
  return !1;
}
var z = class extends q {
  constructor() {
    super(...arguments), this.dismissedByPress = !1, this.placement = "top", this.disabled = !1, this.distance = 8, this.open = !1, this.skidding = 0, this.showDelay = 150, this.hideDelay = 0, this.trigger = "hover focus", this.withoutArrow = !1, this.for = null, this.anchor = null, this.eventController = new AbortController(), this.handleBlur = () => {
      this.dismissedByPress = !1, this.hasTrigger("focus") && this.hide();
    }, this.handleClick = () => {
      if (this.hasTrigger("click")) {
        this.open ? this.hide() : this.show();
        return;
      }
      this.hasTrigger("manual") || this.lightDismiss();
    }, this.handleFocus = () => {
      this.dismissedByPress || this.hasTrigger("focus") && this.show();
    }, this.handleMouseDown = () => {
      this.hasTrigger("click") || this.hasTrigger("manual") || this.lightDismiss();
    }, this.handleDocumentKeyDown = (t) => {
      this.hasTrigger("manual") || t.key === "Escape" && this.open && Bo(this) && (t.preventDefault(), t.stopPropagation(), this.hide());
    }, this.handleDocumentClick = (t) => {
      this.hasTrigger("manual") || this.anchor && t.composedPath().includes(this.anchor) || this.hide();
    }, this.handleMouseOver = () => {
      this.dismissedByPress || this.hasTrigger("hover") && (clearTimeout(this.hoverTimeout), this.hoverTimeout = window.setTimeout(() => this.show(), this.showDelay));
    }, this.handleMouseOut = (t) => {
      const e = t.relatedTarget, o = !!(e && this.anchor && ho(this.anchor, e)), i = !!(e && ho(this, e));
      o || i || (this.dismissedByPress = !1, this.hasTrigger("hover") && (clearTimeout(this.hoverTimeout), this.hoverTimeout = window.setTimeout(() => {
        this.hide();
      }, this.hideDelay)));
    };
  }
  connectedCallback() {
    super.connectedCallback(), typeof document < "u" && (this.eventController.signal.aborted && (this.eventController = new AbortController()), this.addEventListener("mouseout", this.handleMouseOut), this.dismissedByPress = !1, this.open && (this.open = !1, this.updateComplete.then(() => {
      this.open = !0;
    })), this.id || (this.id = Do("wa-tooltip-")), this.for && this.anchor ? (this.anchor = null, this.handleForChange()) : this.for && this.handleForChange());
  }
  disconnectedCallback() {
    super.disconnectedCallback(), document.removeEventListener("keydown", this.handleDocumentKeyDown), document.removeEventListener("click", this.handleDocumentClick), Dt(this), this.eventController.abort(), this.anchor && this.removeFromAriaLabelledBy(this.anchor, this.id);
  }
  firstUpdated(t) {
    this.body.hidden = !this.open, this.open && (this.popup.active = !0, this.popup.reposition()), super.firstUpdated(t);
  }
  /** Hides the tooltip, or cancels a pending show, and keeps it hidden until re-armed. */
  lightDismiss() {
    clearTimeout(this.hoverTimeout), this.dismissedByPress = !0, this.hide();
  }
  hasTrigger(t) {
    return this.trigger.split(" ").includes(t);
  }
  /** Adds the tooltip ID to the aria-labelledby attribute */
  addToAriaLabelledBy(t, e) {
    const i = (t.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    i.includes(e) || (i.push(e), t.setAttribute("aria-labelledby", i.join(" ")));
  }
  /** Removes the tooltip ID from the aria-labelledby attribute */
  removeFromAriaLabelledBy(t, e) {
    const n = (t.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).filter((a) => a !== e);
    n.length > 0 ? t.setAttribute("aria-labelledby", n.join(" ")) : t.removeAttribute("aria-labelledby");
  }
  async handleOpenChange() {
    if (this.open) {
      if (this.disabled)
        return;
      const t = new Fo();
      if (this.dispatchEvent(t), t.defaultPrevented) {
        this.open = !1;
        return;
      }
      this.hasTrigger("manual") || (document.addEventListener("keydown", this.handleDocumentKeyDown, { signal: this.eventController.signal }), document.addEventListener("click", this.handleDocumentClick, { signal: this.eventController.signal }), Io(this)), this.body.hidden = !1, this.popup.active = !0, await St(this.popup.popup, "show-with-scale"), this.popup.reposition(), this.dispatchEvent(new To());
    } else {
      const t = new Oo();
      if (this.dispatchEvent(t), t.defaultPrevented) {
        this.open = !0;
        return;
      }
      document.removeEventListener("keydown", this.handleDocumentKeyDown), document.removeEventListener("click", this.handleDocumentClick), Dt(this), await St(this.popup.popup, "hide-with-scale"), this.popup.active = !1, this.body.hidden = !0, this.dispatchEvent(new Ro());
    }
  }
  handleForChange() {
    var n, a;
    const t = (n = this.getRootNode) == null ? void 0 : n.call(this);
    if (!t)
      return;
    const e = this.for ? (a = t.getElementById) == null ? void 0 : a.call(t, this.for) : null, o = this.anchor;
    if (e === o)
      return;
    this.dismissedByPress = !1;
    const { signal: i } = this.eventController;
    e && (this.addToAriaLabelledBy(e, this.id), e.addEventListener("blur", this.handleBlur, { capture: !0, signal: i }), e.addEventListener("focus", this.handleFocus, { capture: !0, signal: i }), e.addEventListener("click", this.handleClick, { signal: i }), e.addEventListener("mousedown", this.handleMouseDown, { signal: i }), e.addEventListener("mouseover", this.handleMouseOver, { signal: i }), e.addEventListener("mouseout", this.handleMouseOut, { signal: i })), o && (this.removeFromAriaLabelledBy(o, this.id), o.removeEventListener("blur", this.handleBlur, { capture: !0 }), o.removeEventListener("focus", this.handleFocus, { capture: !0 }), o.removeEventListener("click", this.handleClick), o.removeEventListener("mousedown", this.handleMouseDown), o.removeEventListener("mouseover", this.handleMouseOver), o.removeEventListener("mouseout", this.handleMouseOut)), this.anchor = e;
  }
  async handleOptionsChange() {
    this.hasUpdated && (await this.updateComplete, this.popup.reposition());
  }
  handleDisabledChange() {
    this.disabled && this.open && this.hide();
  }
  /** Shows the tooltip. */
  async show() {
    if (!this.open)
      return this.open = !0, uo(this, "wa-after-show");
  }
  /** Hides the tooltip */
  async hide() {
    if (this.open)
      return this.open = !1, uo(this, "wa-after-hide");
  }
  render() {
    return O`
      <wa-popup
        part="base tooltip"
        exportparts="
          popup:base__popup,
          arrow:base__arrow
        "
        class=${Gt({
      tooltip: !0,
      "tooltip-open": this.open
    })}
        placement=${this.placement}
        distance=${this.distance}
        skidding=${this.skidding}
        flip
        shift
        ?arrow=${!this.withoutArrow}
        hover-bridge
        .anchor=${this.anchor}
      >
        <div part="body" class="body">
          <slot></slot>
        </div>
      </wa-popup>
    `;
  }
};
z.css = ra;
z.dependencies = { "wa-popup": C };
c([
  I("slot:not([name])")
], z.prototype, "defaultSlot", 2);
c([
  I(".body")
], z.prototype, "body", 2);
c([
  I("wa-popup")
], z.prototype, "popup", 2);
c([
  h()
], z.prototype, "placement", 2);
c([
  h({ type: Boolean, reflect: !0 })
], z.prototype, "disabled", 2);
c([
  h({ type: Number })
], z.prototype, "distance", 2);
c([
  h({ type: Boolean, reflect: !0 })
], z.prototype, "open", 2);
c([
  h({ type: Number })
], z.prototype, "skidding", 2);
c([
  h({ attribute: "show-delay", type: Number })
], z.prototype, "showDelay", 2);
c([
  h({ attribute: "hide-delay", type: Number })
], z.prototype, "hideDelay", 2);
c([
  h()
], z.prototype, "trigger", 2);
c([
  h({ attribute: "without-arrow", type: Boolean, reflect: !0 })
], z.prototype, "withoutArrow", 2);
c([
  h()
], z.prototype, "for", 2);
c([
  Vt()
], z.prototype, "anchor", 2);
c([
  B("open", { waitUntilFirstUpdate: !0 })
], z.prototype, "handleOpenChange", 1);
c([
  B("for")
], z.prototype, "handleForChange", 1);
c([
  B(["distance", "placement", "skidding"])
], z.prototype, "handleOptionsChange", 1);
c([
  B("disabled")
], z.prototype, "handleDisabledChange", 1);
z = c([
  at("wa-tooltip")
], z);
sn("default", { resolver: () => "" });
