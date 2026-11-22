(() => {
  'use strict';

  // Bump together with VERSION in sw.js on every release
  const APP_VERSION = '1.5.0';

  /* ================= i18n ================= */
  const I18N = {
    ru: {
      subtitle: 'Конвертер валют', manage: 'Добавить валюту', currencies: 'Валюты',
      search: 'Поиск: доллар, BTC, евро…', all: 'Все', fiat: 'Фиат', crypto: 'Крипто', selected: 'Выбранные',
      hint: 'Подсказка: можно вводить выражения, например 120*3+15', install: 'Установить',
      loading: 'Загружаем курсы…', updated: 'Курсы обновлены', offline: 'Офлайн · курсы от',
      error: 'Не удалось загрузить курсы', noRates: 'Нет данных о курсах', copied: 'Скопировано',
      popular: 'Популярные', otherFiat: 'Другие валюты', nothing: 'Ничего не найдено',
      empty: 'Список пуст — добавьте валюту', refreshed: 'Курсы обновлены', source: 'Источники',
      version: 'версия', updatedTo: 'Приложение обновлено до версии',
      removed: 'удалена', added: 'добавлена', copy: 'Копировать', remove: 'Удалить', drag: 'Перетащить',
      vConvert: 'Конвертер', vShop: 'Покупка',
      shPrice: 'Цена товара', shShip: 'Доставка', shSvc: 'Процент',
      shFree: 'Бесплатно до, ¥', shMin: 'Минимум, ¥', shFeeTitle: 'Комиссия за оплату иностранной картой',
      pr200: '3% от 200 ¥', prAll: '3% всегда', prNone: 'Без комиссии',
      feeNone: 'Комиссия за оплату не берётся.',
      feeRule: 'Платёжный сервис (Alipay / WeChat Pay) берёт {p} со всей суммы оплаты',
      feeFree: ', если она больше {lim}; оплата до {lim} включительно — без комиссии',
      feeMin: ', но не меньше {min}',
      feePerPay: 'Порог считается для каждой оплаты отдельно.',
      feeNow: 'Сейчас', feeCalcFree: '{a} ≤ {lim} → комиссии нет', feeCalcMin: 'берётся минимум',
      shMinLbl: 'минимум', shFreeLbl: '0 · до {lim} ¥ бесплатно',
      shTip: '💡 Если оплатить товары {n} отдельными заказами до {lim} ¥ каждый, комиссии не будет — экономия ≈ {save}.',
      shBank: 'Комиссия банка, %', shBuf: 'Запас на курс, %', shCard: 'Карта',
      shGoods: 'Товар', shSvcLine: 'Комиссия оплаты', shOrder: 'Итого заказ',
      dlOff: 'Доставка не учитывается. Включите, чтобы посчитать.',
      sumTopup: 'Пополнить карту', sumDelivery: 'Доставка iPost (оплата отдельно)', sumTotal: 'Всего понадобится',
      sumNote: 'Точная стоимость ≈ {real}. Запас ≈ {left} нужен на случай, если курс будет хуже; не потратится — останется на карте.',
      dlOnlyTitle: 'Доставка iPost', dlOnlySub: 'оплачивается отдельно от товара',
      dlTitle: 'Доставка iPost', dlAir: 'Авиа', dlAuto: 'Авто', dlWeight: 'Вес посылки', dlG: 'г', dlKg: 'кг',
      dlAirRate: 'Авиа, $/кг', dlAutoRate: 'Авто, $/кг', dlStep: 'Округление',
      st100: 'до 100 г', st500: 'до 500 г', st1k: 'до 1 кг', st0: 'нет',
      dlPayCard: 'Оплачиваю доставку этой же картой', dlBilled: 'Вес к оплате', dlFact: 'факт.',
      dlCost: 'Доставка', dlWould: 'вышло бы', dlCheaper: 'дешевле на {d}', dlPricier: 'дороже на {d}',
      grandTitle: 'Покупка с доставкой', grandSub: 'доставка {dl} оплачивается отдельно',
      shBankLine: 'Комиссия банка', shCharged: 'Спишется с карты', shBufLine: 'Запас на курс',
      shTopup: 'Пополнить карту',
      shHint: 'Комиссия считается с каждой оплаты отдельно. Пополнение округлено вверх с запасом: курс Visa и банка может отличаться от рыночного.'
    },
    en: {
      subtitle: 'Currency converter', manage: 'Add currency', currencies: 'Currencies',
      search: 'Search: dollar, BTC, euro…', all: 'All', fiat: 'Fiat', crypto: 'Crypto', selected: 'Selected',
      hint: 'Tip: you can type expressions, e.g. 120*3+15', install: 'Install',
      loading: 'Loading rates…', updated: 'Rates updated', offline: 'Offline · rates from',
      error: 'Failed to load rates', noRates: 'No rate data', copied: 'Copied',
      popular: 'Popular', otherFiat: 'Other currencies', nothing: 'Nothing found',
      empty: 'The list is empty — add a currency', refreshed: 'Rates updated', source: 'Sources',
      version: 'version', updatedTo: 'App updated to version',
      removed: 'removed', added: 'added', copy: 'Copy', remove: 'Remove', drag: 'Drag',
      vConvert: 'Converter', vShop: 'Purchase',
      shPrice: 'Item price', shShip: 'Shipping', shSvc: 'Percent',
      shFree: 'Free below, ¥', shMin: 'Minimum, ¥', shFeeTitle: 'Foreign card payment fee',
      pr200: '3% from 200 ¥', prAll: '3% always', prNone: 'No fee',
      feeNone: 'No payment fee is charged.',
      feeRule: 'The payment service (Alipay / WeChat Pay) charges {p} of the whole payment',
      feeFree: ' if it is over {lim}; payments up to {lim} inclusive are free',
      feeMin: ', but at least {min}',
      feePerPay: 'The threshold applies to each payment separately.',
      feeNow: 'Now', feeCalcFree: '{a} ≤ {lim} → no fee', feeCalcMin: 'minimum applies',
      shMinLbl: 'minimum', shFreeLbl: '0 · free below {lim} ¥',
      shTip: '💡 Pay for the items as {n} separate orders of up to {lim} ¥ each and there is no fee — you save ≈ {save}.',
      shBank: 'Bank fee, %', shBuf: 'Rate buffer, %', shCard: 'Card',
      shGoods: 'Items', shSvcLine: 'Payment fee', shOrder: 'Order total',
      dlOff: 'Delivery is not included. Turn it on to calculate.',
      sumTopup: 'Top up card', sumDelivery: 'iPost delivery (paid separately)', sumTotal: 'Total needed',
      sumNote: 'Exact cost ≈ {real}. The ≈ {left} buffer covers a worse rate; if unused it stays on the card.',
      dlOnlyTitle: 'iPost delivery', dlOnlySub: 'paid separately from the items',
      dlTitle: 'iPost delivery', dlAir: 'Air', dlAuto: 'Road', dlWeight: 'Parcel weight', dlG: 'g', dlKg: 'kg',
      dlAirRate: 'Air, $/kg', dlAutoRate: 'Road, $/kg', dlStep: 'Rounding',
      st100: 'to 100 g', st500: 'to 500 g', st1k: 'to 1 kg', st0: 'none',
      dlPayCard: 'I pay for delivery with the same card', dlBilled: 'Chargeable weight', dlFact: 'actual',
      dlCost: 'Delivery', dlWould: 'would be', dlCheaper: '{d} cheaper', dlPricier: '{d} more',
      grandTitle: 'Purchase with delivery', grandSub: 'delivery {dl} is paid separately',
      shBankLine: 'Bank fee', shCharged: 'Card will be charged', shBufLine: 'Rate buffer',
      shTopup: 'Top up card',
      shHint: 'The fee applies to each payment separately. The top-up is rounded up with a buffer: Visa and bank rates may differ from the market rate.'
    }
  };

  /* ================= State ================= */
  const STORE = 'flux_state';
  const RATES_STORE = 'flux_rates';
  const CRYPTO_MAP = Object.fromEntries(CRYPTO.map(c => [c.code, c]));

  const saved = load(STORE) || {};
  const state = {
    theme: saved.theme || document.documentElement.dataset.theme || 'dark',
    lang: saved.lang || (/^(ru|uk|be|kk|uz)/.test(navigator.language || 'ru') ? 'ru' : 'en'),
    list: (() => {
      const l = Array.isArray(saved.list) ? [...new Set(saved.list.filter(c => typeof c === 'string' && /^[A-Z]{3,5}$/.test(c)))] : [];
      return l.length ? l : DEFAULT_LIST.slice();
    })(),
    base: typeof saved.base === 'string' && /^[A-Z]{3,5}$/.test(saved.base) ? saved.base : 'USD',
    input: typeof saved.input === 'string' ? saved.input : '100'
  };
  state.view = saved.view === 'shop' ? 'shop' : 'convert';
  state.shop = Object.assign(
    {
      price: '', priceCur: 'CNY', svcPct: '3', freeBelow: '200', svcMin: '0', card: 'USD', bankPct: '0', bufPct: '2',
      dlOn: false, dlMethod: 'air', dlWeight: '', dlUnit: 'kg', dlAir: '10', dlAuto: '6', dlStep: '0.1', dlPayCard: false
    },
    saved.shop || {}
  );
  delete state.shop.ship; // seller shipping field removed (delivery is via iPost)
  // v3: fee rule moved to percent / free threshold / minimum (WeChat Pay & Alipay: 3% from 200 ¥)
  if ((saved.v || 1) < 3) {
    Object.assign(state.shop, { svcPct: '3', freeBelow: '200', svcMin: '0' });
    delete state.shop.svcFix;
  }
  // v2: CNY added to the default list, pinned order USD → CNY → UZS
  if ((saved.v || 1) < 2) {
    if (!state.list.includes('CNY')) state.list.splice(1, 0, 'CNY');
    const head = ['USD', 'CNY', 'UZS'].filter(c => state.list.includes(c));
    state.list = head.concat(state.list.filter(c => !head.includes(c)));
  }
  // v5: delivery has an on/off switch (off by default), method is a radio: air | auto
  if ((saved.v || 1) < 5) state.shop.dlOn = false;
  if (state.shop.dlMethod !== 'air' && state.shop.dlMethod !== 'auto') state.shop.dlMethod = 'air';
  // v6: "3%, min 2 ¥" preset removed — no such minimum exists (Alipay/WeChat: 3% above 200 ¥, no floor)
  const n0 = x => parseFloat(String(x).replace(',', '.')) || 0;
  if ((saved.v || 1) < 6 && n0(state.shop.svcMin) === 2 && n0(state.shop.freeBelow) === 0) {
    Object.assign(state.shop, { svcPct: '3', freeBelow: '200', svcMin: '0' });
  }
  state.v = 6;
  let rates = load(RATES_STORE); // { rates: {CODE: units per 1 USD}, ts, source }
  if (!rates || typeof rates !== 'object' || !rates.rates || !Number.isFinite(rates.ts)) rates = null;

  const t = k => (I18N[state.lang] && I18N[state.lang][k]) || I18N.ru[k] || k;
  const locale = () => (state.lang === 'ru' ? 'ru-RU' : 'en-US');

  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
  }

  /* ================= DOM ================= */
  const $ = s => document.querySelector(s);
  const el = {
    splash: $('#splash'), splashText: $('#splash-text'),
    list: $('#list'), status: $('#status'), statusText: $('#status-text'), refresh: $('#refresh-btn'),
    theme: $('#theme-btn'), lang: $('#lang-btn'), langLabel: $('#lang-label'),
    manage: $('#manage-btn'), sheet: $('#sheet'), search: $('#search'), picker: $('#picker'),
    toast: $('#toast'), install: $('#install-btn'), source: $('#source-text'), metaTheme: $('#meta-theme')
  };
  const sh = {
    price: $('#sh-price'), cur: $('#sh-cur'), ship: $('#sh-ship'), svc: $('#sh-svc'),
    free: $('#sh-free'), min: $('#sh-min'), feeExplain: $('#sh-fee-explain'), tip: $('#sh-tip'), bank: $('#sh-bank'), buf: $('#sh-buf'), card: $('#sh-card'),
    rows: $('#sh-break'), topup: $('#sh-topup'), alt: $('#sh-alt'),
    tabs: document.querySelectorAll('.view-tab'),
    convertView: $('#view-convert'), shopView: $('#view-shop'), grand: $('#sh-grand'),
    dlOn: $('#dl-on'), dlBody: $('#dl-body'), dlHint: $('#dl-hint'), dlMethod: $('#dl-method'), dlWeight: $('#dl-weight'),
    dlUnit: $('#dl-unit'), dlAir: $('#dl-air'), dlAuto: $('#dl-auto'), dlStep: $('#dl-step'),
    dlPayCard: $('#dl-paycard'), dlRows: $('#dl-break'), dlAirLbl: $('#dl-air-lbl'), dlAutoLbl: $('#dl-auto-lbl')
  };

  /* ================= Names / badges ================= */
  const dnCache = {};
  function displayNames(lang) {
    if (!dnCache[lang]) {
      try { dnCache[lang] = new Intl.DisplayNames([lang], { type: 'currency' }); } catch (_) { dnCache[lang] = null; }
    }
    return dnCache[lang];
  }
  function fiatName(code, lang = state.lang) {
    if (FIAT_EXTRA[code]) return FIAT_EXTRA[code][lang] || FIAT_EXTRA[code].en;
    const dn = displayNames(lang);
    const n = dn ? dn.of(code) : code;
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code;
  }
  function isKnownFiat(code) {
    if (CRYPTO_MAP[code]) return false;
    if (FIAT_EXTRA[code]) return true;
    const dn = displayNames('en');
    return !!dn && dn.of(code) !== code;
  }
  function nameOf(code, lang = state.lang) {
    const c = CRYPTO_MAP[code];
    return c ? (c.name[lang] || c.name.en) : fiatName(code, lang);
  }
  function symbolOf(code) {
    try {
      const p = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0).find(x => x.type === 'currency');
      if (p && p.value !== code && p.value.length <= 3) return p.value;
    } catch (_) {}
    return code.slice(0, 2);
  }
  function hue(code) {
    let h = 0;
    for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }
  function badgeHTML(code) {
    const c = CRYPTO_MAP[code];
    if (c) {
      return `<span class="badge" style="--badge:linear-gradient(135deg,${c.color[0]},${c.color[1]})">${c.sym.length > 1 ? `<small>${c.sym}</small>` : c.sym}</span>`;
    }
    const h = hue(code);
    const bg = `linear-gradient(135deg,hsl(${h} 70% 58%),hsl(${(h + 40) % 360} 70% 42%))`;
    const sym = symbolOf(code);
    const mono = sym.length > 1 ? `<small>${esc(sym)}</small>` : esc(sym);
    const cc = FLAG_OVERRIDE[code] || (code[0] !== 'X' ? code.slice(0, 2).toLowerCase() : null);
    if (!cc || !/^[a-z]{2}$/.test(cc)) return `<span class="badge" style="--badge:${bg}">${mono}</span>`;
    // Self-hosted flag (flag-icons, MIT); falls back to the monogram via the error listener below
    return `<span class="badge" style="--badge:${bg}" data-mono="${esc(sym)}"><img src="icons/flags/${cc}.svg" alt="" loading="lazy" decoding="async"></span>`;
  }
  // Missing flag → show the currency symbol instead (no inline onerror, CSP-friendly)
  document.addEventListener('error', e => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.parentNode && img.parentNode.classList.contains('badge')) {
      img.parentNode.textContent = img.parentNode.dataset.mono || '';
    }
  }, true);

  // Anything coming from the network or storage is checked before it can reach the DOM
  const CODE_RE = /^[A-Z]{3,5}$/;
  const isCode = c => typeof c === 'string' && CODE_RE.test(c);
  function cleanRates(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
      if (isCode(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  /* ================= Math ================= */
  // Safe expression evaluator: numbers, + - * / % ^ ( )
  function evaluate(str) {
    const src = String(str).replace(/[\s  ]/g, '').replace(/,/g, '.').replace(/[×xх]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-');
    if (!src) return null;
    let i = 0;
    const peek = () => src[i];
    function num() {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?|^\d+\.?/i.exec(src.slice(i));
      if (!m) throw 0;
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function factor() {
      const c = peek();
      if (c === '-') { i++; return -factor(); }
      if (c === '+') { i++; return factor(); }
      let v;
      if (c === '(') { i++; v = expr(); if (peek() === ')') i++; }
      else v = num();
      if (peek() === '%') { i++; v = v / 100; }
      if (peek() === '^') { i++; v = Math.pow(v, factor()); }
      return v;
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') {
        const op = src[i++];
        const r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = src[i++];
        if (i >= src.length) break; // trailing operator while typing
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    try {
      let v = expr();
      // tolerate trailing operator while typing
      if (i < src.length && !/^[+\-*/^]$/.test(src.slice(i))) return null;
      return Number.isFinite(v) ? v : null;
    } catch (_) { return null; }
  }
  const isExpr = s => /\d\s*[+\-*/^%×÷(]|[()]/.test(String(s).replace(/^\s*-/, ''));

  function convert(value, from, to) {
    const r = rates && rates.rates;
    if (!r || !r[from] || !r[to]) return null;
    return value / r[from] * r[to];
  }

  function fmt(v, code, opts = {}) {
    if (v == null || !Number.isFinite(v)) return '';
    const a = Math.abs(v);
    let o;
    if (a === 0) o = { maximumFractionDigits: 0 };
    else if (a >= 1) o = { maximumFractionDigits: CRYPTO_MAP[code] ? (a >= 1000 ? 2 : 6) : 2 };
    else o = { maximumSignificantDigits: CRYPTO_MAP[code] ? 6 : 4 };
    if (opts.plain) return new Intl.NumberFormat('en-US', { ...o, useGrouping: false }).format(v);
    return new Intl.NumberFormat(locale(), o).format(v);
  }

  /* ================= Rendering ================= */
  const ICONS = {
    grip: '<svg viewBox="0 0 24 24"><circle cx="8" cy="6" r="1.8"/><circle cx="16" cy="6" r="1.8"/><circle cx="8" cy="12" r="1.8"/><circle cx="16" cy="12" r="1.8"/><circle cx="8" cy="18" r="1.8"/><circle cx="16" cy="18" r="1.8"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
  };

  function renderList(animate = true) {
    el.list.classList.toggle('no-anim', !animate);
    if (!state.list.length) {
      el.list.innerHTML = `<li class="empty">${t('empty')}</li>`;
      return;
    }
    el.list.innerHTML = state.list.map((code, idx) => `
      <li class="row${code === state.base ? ' is-active' : ''}" data-code="${code}" style="animation-delay:${animate ? idx * 45 : 0}ms${animate ? '' : ';animation:none'}">
        <span class="handle" aria-label="${t('drag')}">${ICONS.grip}</span>
        ${badgeHTML(code)}
        <div class="meta">
          <div class="meta__code">${code}</div>
          <div class="meta__name">${esc(nameOf(code))}</div>
        </div>
        <label class="amount">
          <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0" aria-label="${code}">
          <span class="amount__sub"></span>
        </label>
        <div class="row__actions">
          <button class="mini-btn" data-act="copy" aria-label="${t('copy')}" title="${t('copy')}">${ICONS.copy}</button>
          <button class="mini-btn is-del" data-act="del" aria-label="${t('remove')}" title="${t('remove')}">${ICONS.del}</button>
        </div>
      </li>`).join('');
    updateValues();
  }

  function updateValues() {
    const baseVal = evaluate(state.input);
    el.list.querySelectorAll('.row').forEach(row => {
      const code = row.dataset.code;
      const input = row.querySelector('input');
      const sub = row.querySelector('.amount__sub');
      const active = code === state.base;
      row.classList.toggle('is-active', active);
      if (active) {
        if (document.activeElement !== input) input.value = isExpr(state.input) ? state.input : (baseVal == null ? state.input : fmt(baseVal, code));
        if (isExpr(state.input) && baseVal != null) {
          sub.textContent = '= ' + fmt(baseVal, code);
          sub.classList.add('is-expr');
        } else {
          sub.textContent = '';
          sub.classList.remove('is-expr');
        }
      } else {
        const v = baseVal == null ? null : convert(baseVal, state.base, code);
        input.value = v == null ? '' : fmt(v, code);
        const one = convert(1, state.base, code);
        if (one == null) sub.textContent = rates ? '—' : '';
        else if (one < 0.01) sub.textContent = `1 ${code} = ${fmt(1 / one, state.base)} ${state.base}`;
        else sub.textContent = `1 ${state.base} = ${fmt(one, code)} ${code}`;
        sub.classList.remove('is-expr');
      }
    });
    updateShop();
  }

  /* ================= Shop calculator ================= */
  const pct = x => {
    const n = parseFloat(String(x).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  function setView(v) {
    state.view = v;
    sh.tabs.forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
    sh.convertView.hidden = v !== 'convert';
    sh.shopView.hidden = v !== 'shop';
    persist();
    if (v === 'shop') updateShop();
  }

  // money: 2 decimals for fiat, whole numbers for UZS
  const money = (v, code) => new Intl.NumberFormat(locale(), {
    minimumFractionDigits: code === 'UZS' ? 0 : 2,
    maximumFractionDigits: code === 'UZS' ? 0 : 2
  }).format(v);

  function updateShop() {
    if (!sh.topup) return;
    const s = state.shop;
    const cur = s.priceCur;
    const fmt = money;
    const card = s.card;
    const alt = card === 'USD' ? 'UZS' : 'USD';
    const price = evaluate(s.price) || 0;
    const dl = updateDelivery();
    const dlInCard = dl.cost > 0 ? convert(dl.cost, 'USD', card) : 0;
    const dlInTopup = s.dlPayCard && dl.cost > 0 && dlInCard > 0;
    const svcP = pct(s.svcPct), freeBelow = pct(s.freeBelow), svcMin = pct(s.svcMin);
    const bankP = pct(s.bankPct), bufP = pct(s.bufPct);

    // highlight the preset matching the current fee rule
    const key = [svcP, freeBelow, svcMin].join(',');
    document.querySelectorAll('#sh-presets button').forEach(b => b.classList.toggle('is-active', b.dataset.p === key));

    // The fee rule is defined in CNY (the platform charges in yuan), per single payment
    // Alipay / WeChat Pay: a payment of up to the threshold (inclusive) is free,
    // above it the percent applies to the WHOLE amount, not just the excess.
    const feeCny = cny => {
      if (!(cny > 0) || svcP <= 0) return 0;
      if (freeBelow > 0 && cny <= freeBelow) return 0;
      return Math.max(cny * svcP / 100, svcMin);
    };

    const base = price;
    const baseCny = cur === 'CNY' ? base : convert(base, cur, 'CNY');
    const svcCny = baseCny == null ? 0 : feeCny(baseCny);
    const svc = cur === 'CNY' ? svcCny : (convert(svcCny, 'CNY', cur) || 0);
    const total = base + svc;
    const inCard = total > 0 ? convert(total, cur, card) : null;

    // Plain-language explanation of the current fee rule + this order's calculation
    const y = v => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(v)} ¥`;
    let rule;
    if (svcP <= 0) rule = t('feeNone');
    else {
      rule = t('feeRule').replace('{p}', `<b>${svcP}%</b>`);
      if (freeBelow > 0) rule += t('feeFree').replace(/\{lim\}/g, `<b>${y(freeBelow)}</b>`);
      if (svcMin > 0) rule += t('feeMin').replace('{min}', `<b>${y(svcMin)}</b>`);
      rule += '. ' + t('feePerPay');
    }
    let calc = '';
    if (baseCny > 0 && svcP > 0) {
      if (svcCny === 0) calc = t('feeCalcFree').replace('{a}', y(baseCny)).replace('{lim}', y(freeBelow));
      else {
        const raw = baseCny * svcP / 100;
        calc = `${y(baseCny)}${freeBelow > 0 ? ` > ${y(freeBelow)}` : ''} → ${svcP}% × ${y(baseCny)} = ${y(raw)}`;
        if (svcMin > 0 && raw < svcMin) calc += ` < ${y(svcMin)} → ${t('feeCalcMin')} ${y(svcMin)}`;
      }
      calc = `<span class="calc">${t('feeNow')}: ${calc}</span>`;
    }
    sh.feeExplain.innerHTML = rule + calc;

    // Splitting tip: N separate payments, each under the free threshold
    sh.tip.hidden = true;
    if (svcCny > 0 && freeBelow > 0 && baseCny > freeBelow) {
      const parts = Math.ceil(baseCny / freeBelow);
      const saved = convert(svcCny, 'CNY', card);
      if (saved != null) {
        sh.tip.innerHTML = t('shTip')
          .replace('{n}', parts)
          .replace('{lim}', fmt(freeBelow, 'UZS'))
          .replace('{save}', `<b>${fmt(saved, card)} ${card}</b>`);
        sh.tip.hidden = false;
      }
    }

    const rateBits = [];
    const usdCny = convert(1, 'USD', 'CNY');
    const cnyUzs = convert(1, 'CNY', 'UZS');
    if (usdCny != null) rateBits.push(`1 USD = ${money(usdCny, 'CNY')} CNY`);
    if (cnyUzs != null) rateBits.push(`1 CNY = ${money(cnyUzs, 'CNY')} UZS`);

    sh.grand.hidden = true;
    const hasGoods = inCard != null && inCard > 0;
    if (!hasGoods && !(dl.cost > 0)) {
      sh.rows.innerHTML = '';
      sh.topup.textContent = '—';
      sh.alt.textContent = rateBits.join(' · ');
      return;
    }

    // Goods: converted at the payment-system rate → bank fee → buffer for rate drift
    const goodsInCard = hasGoods ? inCard : 0;
    const bankFee = goodsInCard * bankP / 100;
    const goodsCharged = goodsInCard + bankFee;
    const goodsBuf = goodsCharged * bufP / 100;
    // Delivery: iPost bills a fixed USD amount — a USD card pays it as is,
    // a UZS card converts it, so only then the rate buffer applies.
    const dlPart = dlInTopup ? dlInCard : 0;
    const dlBuf = dlInTopup && card !== 'USD' ? dlPart * bufP / 100 : 0;
    const charged = goodsCharged + dlPart;
    const withBuf = charged + goodsBuf + dlBuf;
    const step = card === 'UZS' ? 1000 : 1;
    const topup = Math.ceil(withBuf / step - 1e-9) * step;

    const rows = [];
    const row = (label, val, strong) =>
      rows.push(`<div class="rrow${strong ? ' is-strong' : ''}"><span>${label}</span><b>${val}</b></div>`);

    if (hasGoods) {
      row(t('shGoods'), `${fmt(base, cur)} ${cur}`);
      if (svc > 0) {
        const isMin = svcMin > 0 && svcCny <= svcMin + 1e-9;
        row(`${t('shSvcLine')} (${isMin ? t('shMinLbl') : svcP + '%'})`, `+${fmt(svc, cur)} ${cur}`);
      } else if (svcP > 0 && freeBelow > 0) {
        row(`${t('shSvcLine')}`, t('shFreeLbl').replace('{lim}', fmt(freeBelow, 'UZS')));
      }
      row(t('shOrder'), `${fmt(total, cur)} ${cur}${cur !== card ? ` ≈ ${fmt(inCard, card)} ${card}` : ''}`, true);
      if (bankP > 0) row(`${t('shBankLine')} (${bankP}%)`, `+${fmt(bankFee, card)} ${card}`);
    }
    if (dlInTopup) row(`${t('dlTitle')} (${t(s.dlMethod === 'air' ? 'dlAir' : 'dlAuto').toLowerCase()})`, `+${fmt(dlPart, card)} ${card}`);

    if (hasGoods || dlInTopup) {
      row(t('shCharged'), `≈ ${fmt(charged, card)} ${card}`, true);
      if (goodsBuf + dlBuf > 0) row(`${t('shBufLine')} (${bufP}%)`, `+${fmt(goodsBuf + dlBuf, card)} ${card}`);
      sh.topup.textContent = `${fmt(topup, card)} ${card}`;
      // the line under the big number shows the SAME top-up amount in the other currency
      const altV = convert(topup, card, alt);
      sh.alt.textContent = (altV != null ? [`≈ ${fmt(altV, alt)} ${alt}`] : []).concat(rateBits).join(' · ');
    } else {
      // only delivery, paid separately: nothing to top up on the card
      sh.topup.textContent = '—';
      sh.alt.textContent = rateBits.join(' · ');
    }
    sh.rows.innerHTML = rows.join('');

    // Final summary: what you actually need = top-up + delivery paid separately.
    // Every line here adds up; the exact cost (without the rate buffer) is a note.
    const topupPart = hasGoods || dlInTopup;
    const dlSeparate = dl.cost > 0 && !dlInTopup;
    if (dlSeparate || (topupPart && withBuf > charged + 1e-9)) {
      const topupUsd = topupPart ? (convert(topup, card, 'USD') || 0) : 0;
      const needUsd = topupUsd + (dlSeparate ? dl.cost : 0);
      const realUsd = (topupPart ? (convert(charged, card, 'USD') || 0) : 0) + (dlSeparate ? dl.cost : 0);
      const needUzs = convert(needUsd, 'USD', 'UZS');
      const leftover = topupPart ? topup - charged : 0;
      const g = (label, val, cls = '') => `<div class="grand__row ${cls}"><span>${label}</span><b>${val}</b></div>`;
      let html = '';
      if (dlSeparate) { // two separate payments → show how they add up
        if (topupPart) html += g(t('sumTopup'), `${fmt(topup, card)} ${card}`, 'is-part');
        html += g(t('sumDelivery'), `${fmt(dl.cost, 'USD')} USD`, 'is-part');
        html += g(t('sumTotal'), `${fmt(needUsd, 'USD')} USD`, 'is-total');
        if (needUzs != null) html += `<div class="grand__sub">≈ ${fmt(needUzs, 'UZS')} UZS</div>`;
      }
      if (leftover > 0.004) {
        html += `<div class="grand__note">${t('sumNote')
          .replace('{real}', `${fmt(realUsd, 'USD')} $`)
          .replace('{left}', `${fmt(leftover, card)} ${card === 'USD' ? '$' : card}`)}</div>`;
      }
      sh.grand.innerHTML = html;
      sh.grand.hidden = false;
    }
  }

  /* ---------- iPost delivery ---------- */
  function updateDelivery() {
    const s = state.shop;
    const air = pct(s.dlAir), auto = pct(s.dlAuto);
    const perKg = n => `${money(n, 'USD')} $/${t('dlKg')}`;
    sh.dlAirLbl.textContent = perKg(air);
    sh.dlAutoLbl.textContent = perKg(auto);
    sh.dlOn.checked = !!s.dlOn;
    sh.dlBody.hidden = !s.dlOn;
    sh.dlHint.hidden = !!s.dlOn;
    if (!s.dlOn) { sh.dlRows.innerHTML = ''; return { cost: 0 }; }

    const w = evaluate(s.dlWeight) || 0;
    const kg = Math.max(0, s.dlUnit === 'g' ? w / 1000 : w);
    const step = parseFloat(s.dlStep) || 0;
    // round the chargeable weight UP to the step (0.34 kg → 0.4 kg)
    const billed = step > 0 ? Math.round(Math.ceil(kg / step - 1e-9) * step * 1000) / 1000 : kg;
    if (!(kg > 0)) { sh.dlRows.innerHTML = ''; return { cost: 0 }; }

    const isAir = s.dlMethod === 'air';
    const rate = isAir ? air : auto, otherRate = isAir ? auto : air;
    const cost = billed * rate, other = billed * otherRate;
    const kgFmt = v => new Intl.NumberFormat(locale(), { maximumFractionDigits: 3 }).format(v);
    const gFmt = v => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(v * 1000);
    const uzs = convert(cost, 'USD', 'UZS');

    const rows = [];
    const row = (label, val, strong, cls = '') =>
      rows.push(`<div class="rrow${strong ? ' is-strong' : ''}"><span>${label}</span><b class="${cls}">${val}</b></div>`);
    row(t('dlBilled'), `${kgFmt(billed)} ${t('dlKg')}` + (Math.abs(billed - kg) > 1e-9 ? ` <span style="color:var(--text-3);font-weight:500">(${t('dlFact')} ${kg < 1 ? gFmt(kg) + ' ' + t('dlG') : kgFmt(kg) + ' ' + t('dlKg')})</span>` : ''));
    row(`${t('dlCost')} · ${t(isAir ? 'dlAir' : 'dlAuto').toLowerCase()}`, `${money(cost, 'USD')} $${uzs != null ? ` ≈ ${money(uzs, 'UZS')} UZS` : ''}`, true);
    if (otherRate > 0 && otherRate !== rate) {
      const diff = Math.abs(cost - other);
      const label = t(isAir ? 'dlAuto' : 'dlAir');
      const note = other < cost
        ? t('dlCheaper').replace('{d}', `${money(diff, 'USD')} $`)
        : t('dlPricier').replace('{d}', `${money(diff, 'USD')} $`);
      row(`${label} ${t('dlWould')}`, `${money(other, 'USD')} $ · ${note}`, false, other < cost ? 'is-good' : '');
    }
    sh.dlRows.innerHTML = rows.join('');
    return { cost, billed };
  }

  function applyI18n() {
    document.documentElement.lang = state.lang;
    el.langLabel.textContent = state.lang.toUpperCase();
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
    el.splashText.textContent = t('loading');
    el.source.textContent = `${t('source')}: exchangerate.fun · open.er-api.com · CoinGecko · ${t('version')} ${APP_VERSION}`;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    el.metaTheme.setAttribute('content', state.theme === 'light' ? '#F4F5FB' : '#0B0B14');
    // replay icon animation
    el.theme.innerHTML = el.theme.innerHTML;
  }

  function setStatus(kind) {
    el.status.classList.remove('is-offline', 'is-error');
    if (!rates) {
      el.status.classList.add('is-error');
      el.statusText.textContent = kind === 'loading' ? t('loading') : t('noRates');
      return;
    }
    const d = new Date(rates.ts);
    const when = d.toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (kind === 'offline' || kind === 'error') {
      el.status.classList.add(navigator.onLine ? 'is-error' : 'is-offline');
      el.statusText.textContent = `${t('offline')} ${when}`;
    } else {
      el.statusText.textContent = `${t('updated')} · ${when}`;
    }
  }

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-show'), 1800);
  }

  /* ================= Rates ================= */
  function withTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .finally(() => clearTimeout(id));
  }

  async function fetchFiat() {
    try {
      const d = await withTimeout('https://api.exchangerate.fun/latest?base=USD');
      const r = cleanRates(d && d.rates);
      if (r.EUR) return { rates: r, src: 'exchangerate.fun' };
    } catch (_) {}
    const d = await withTimeout('https://open.er-api.com/v6/latest/USD');
    const r = cleanRates(d && d.rates);
    if (r.EUR) return { rates: r, src: 'open.er-api.com' };
    throw new Error('fiat');
  }

  async function fetchCrypto() {
    const ids = CRYPTO.map(c => c.id).join(',');
    const d = await withTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const out = {};
    CRYPTO.forEach(c => {
      const p = d && d[c.id] && d[c.id].usd;
      if (typeof p === 'number' && Number.isFinite(p) && p > 0) out[c.code] = 1 / p;
    });
    if (!Object.keys(out).length) throw new Error('crypto');
    return out;
  }

  let loading = false;
  async function refreshRates(manual = false) {
    if (loading) return;
    loading = true;
    el.refresh.classList.add('is-spinning');
    if (!rates) setStatus('loading');
    const [fiat, crypto] = await Promise.allSettled([fetchFiat(), fetchCrypto()]);
    let ok = false;
    if (fiat.status === 'fulfilled') {
      const merged = { ...fiat.value.rates, USD: 1 };
      if (crypto.status === 'fulfilled') Object.assign(merged, crypto.value);
      else if (rates) CRYPTO.forEach(c => { if (!merged[c.code] && rates.rates[c.code]) merged[c.code] = rates.rates[c.code]; });
      rates = { rates: merged, ts: Date.now(), source: fiat.value.src };
      try { localStorage.setItem(RATES_STORE, JSON.stringify(rates)); } catch (_) {}
      ok = true;
    } else if (crypto.status === 'fulfilled' && rates) {
      Object.assign(rates.rates, crypto.value);
    }
    loading = false;
    el.refresh.classList.remove('is-spinning');
    setStatus(ok ? 'ok' : 'error');
    updateValues();
    if (manual) toast(ok ? t('refreshed') : t('error'));
    return ok;
  }

  /* ================= Picker sheet ================= */
  let tab = 'all';
  function allFiat() {
    const codes = rates ? Object.keys(rates.rates) : POPULAR.slice();
    return codes.filter(isKnownFiat);
  }
  function pickItem(code) {
    const on = state.list.includes(code);
    return `<li class="pick${on ? ' is-on' : ''}" data-code="${code}" role="checkbox" aria-checked="${on}" tabindex="0">
      ${badgeHTML(code)}
      <div class="pick__txt"><div class="pick__code">${code}</div><div class="pick__name">${esc(nameOf(code))}</div></div>
      <span class="check">${ICONS.check}</span>
    </li>`;
  }
  function renderPicker() {
    const q = el.search.value.trim().toLowerCase();
    const match = code => !q || code.toLowerCase().includes(q) ||
      nameOf(code, 'ru').toLowerCase().includes(q) || nameOf(code, 'en').toLowerCase().includes(q);
    const fiat = allFiat();
    const popular = POPULAR.filter(c => fiat.includes(c) || !rates);
    const other = fiat.filter(c => !POPULAR.includes(c)).sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale()));
    const crypto = CRYPTO.map(c => c.code);
    const sections = [];
    if (tab === 'selected') sections.push(['', state.list]);
    else {
      if (tab !== 'crypto') sections.push([t('popular'), popular]);
      if (tab !== 'fiat') sections.push([t('crypto'), crypto]);
      if (tab !== 'crypto') sections.push([t('otherFiat'), other]);
    }
    let html = '';
    sections.forEach(([title, codes]) => {
      const items = codes.filter(match);
      if (!items.length) return;
      if (title) html += `<li class="picker__section">${title}</li>`;
      html += items.map(pickItem).join('');
    });
    el.picker.innerHTML = html || `<li class="empty">${t('nothing')}</li>`;
  }
  function openSheet() {
    el.search.value = '';
    renderPicker();
    el.picker.scrollTop = 0;
    el.sheet.classList.add('is-open');
    el.sheet.setAttribute('aria-hidden', 'false');
    if (matchMedia('(hover: hover)').matches) setTimeout(() => el.search.focus(), 250);
  }
  function closeSheet() {
    el.sheet.classList.remove('is-open');
    el.sheet.setAttribute('aria-hidden', 'true');
  }
  function toggleCurrency(code) {
    const i = state.list.indexOf(code);
    if (i >= 0) state.list.splice(i, 1);
    else state.list.push(code);
    if (!state.list.includes(state.base) && state.list.length) {
      switchBase(state.list[0]);
    }
    persist();
    renderList(false);
  }

  function switchBase(code) {
    if (code === state.base) return;
    const v = evaluate(state.input);
    const nv = v == null ? null : convert(v, state.base, code);
    state.base = code;
    state.input = nv == null ? '' : fmt(nv, code, { plain: true });
    persist();
  }

  /* ================= Drag to reorder ================= */
  let drag = null;
  function onDragStart(e) {
    const handle = e.target.closest('.handle');
    if (!handle) return;
    e.preventDefault();
    const row = handle.closest('.row');
    const rows = [...el.list.querySelectorAll('.row')];
    const idx = rows.indexOf(row);
    const rects = rows.map(r => r.getBoundingClientRect());
    const step = rows.length > 1 ? Math.abs(rects[Math.min(1, rows.length - 1)].top - rects[0].top) : rects[0].height;
    drag = { row, rows, idx, rects, step, startY: e.clientY, to: idx, pid: e.pointerId };
    handle.setPointerCapture(e.pointerId);
    row.classList.add('is-dragging');
    rows.forEach(r => { if (r !== row) r.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)'; });
    if (navigator.vibrate) navigator.vibrate(8);
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const dy = e.clientY - drag.startY;
    const { row, rows, idx, rects, step } = drag;
    row.style.transform = `translateY(${dy}px) scale(1.03)`;
    const center = rects[idx].top + rects[idx].height / 2 + dy;
    let to = idx;
    rects.forEach((r, i) => {
      const mid = r.top + r.height / 2;
      if (i < idx && center < mid) to = Math.min(to, i);
      if (i > idx && center > mid) to = Math.max(to, i);
    });
    drag.to = to;
    rows.forEach((r, i) => {
      if (i === idx) return;
      let s = 0;
      if (idx < i && i <= to) s = -step;
      else if (to <= i && i < idx) s = step;
      r.style.transform = s ? `translateY(${s}px)` : '';
    });
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const { idx, to } = drag;
    drag = null;
    if (to !== idx) {
      const [m] = state.list.splice(idx, 1);
      state.list.splice(to, 0, m);
      persist();
    }
    renderList(false);
  }

  /* ================= Events ================= */
  el.list.addEventListener('focusin', e => {
    const input = e.target.closest('input');
    if (!input) return;
    const code = input.closest('.row').dataset.code;
    switchBase(code);
    input.value = state.input;
    updateValues();
    input.select();
    // keep the selection after the click's mouseup
    input.addEventListener('mouseup', ev => ev.preventDefault(), { once: true });
  });
  el.list.addEventListener('focusout', e => {
    if (e.target.closest('input')) setTimeout(updateValues, 0);
  });
  el.list.addEventListener('input', e => {
    const input = e.target.closest('input');
    if (!input) return;
    // allow only digits, separators and operators
    const clean = input.value.replace(/[^0-9.,+\-*/×÷%^()\s]/g, '');
    if (clean !== input.value) input.value = clean;
    state.input = input.value;
    persist();
    updateValues();
  });
  el.list.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) {
      const v = evaluate(state.input);
      if (v != null) { state.input = fmt(v, state.base, { plain: true }); persist(); }
      e.target.blur();
    }
  });
  el.list.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.row');
    const code = row.dataset.code;
    if (btn.dataset.act === 'copy') {
      const val = row.querySelector('input').value;
      const text = code === state.base ? fmt(evaluate(state.input), code, { plain: true }) : val.replace(/[\s  ]/g, '');
      navigator.clipboard && navigator.clipboard.writeText(text).then(() => toast(`${t('copied')}: ${text} ${code}`), () => {});
    } else if (btn.dataset.act === 'del') {
      row.classList.add('is-removing');
      setTimeout(() => toggleCurrency(code), 260);
    }
  });
  el.list.addEventListener('pointerdown', onDragStart);
  el.list.addEventListener('pointermove', onDragMove);
  el.list.addEventListener('pointerup', onDragEnd);
  el.list.addEventListener('pointercancel', onDragEnd);

  el.theme.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); persist();
  });
  el.lang.addEventListener('click', () => {
    state.lang = state.lang === 'ru' ? 'en' : 'ru';
    applyI18n(); renderList(false); setStatus(rates ? 'ok' : 'error'); persist();
  });
  el.refresh.addEventListener('click', () => refreshRates(true));
  sh.tabs.forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.getElementById('sh-presets').addEventListener('click', e => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    const [p, f, m] = b.dataset.p.split(',');
    Object.assign(state.shop, { svcPct: p, freeBelow: f, svcMin: m });
    sh.svc.value = p; sh.free.value = f; sh.min.value = m;
    persist();
    updateShop();
  });
  // iPost delivery controls
  // optional = clicking the selected button clears the choice
  const segBind = (box, key, optional = false) => {
    const sync = () => box.querySelectorAll('button').forEach(x => {
      const on = x.dataset.val === state.shop[key];
      x.classList.toggle('is-active', on);
      if (optional) x.setAttribute('aria-pressed', on);
    });
    sync();
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      state.shop[key] = optional && state.shop[key] === b.dataset.val ? '' : b.dataset.val;
      sync(); persist(); updateShop();
    });
  };
  segBind(sh.dlMethod, 'dlMethod');
  segBind(sh.dlUnit, 'dlUnit');
  // Delivery switch: turning it off clears the delivery so nothing of it is counted
  sh.dlOn.addEventListener('change', () => {
    state.shop.dlOn = sh.dlOn.checked;
    if (!sh.dlOn.checked) {
      state.shop.dlWeight = '';
      state.shop.dlPayCard = false;
      sh.dlWeight.value = '';
      sh.dlPayCard.checked = false;
    }
    persist();
    updateShop();
  });
  [['dlPayCard', 'dlPayCard']].forEach(([elKey, key]) => {
    sh[elKey].checked = !!state.shop[key];
    sh[elKey].addEventListener('change', () => { state.shop[key] = sh[elKey].checked; persist(); updateShop(); });
  });
  sh.dlStep.value = state.shop.dlStep;
  sh.dlStep.addEventListener('change', () => { state.shop.dlStep = sh.dlStep.value; persist(); updateShop(); });

  [['price', 'price'], ['svc', 'svcPct'], ['free', 'freeBelow'], ['min', 'svcMin'], ['bank', 'bankPct'], ['buf', 'bufPct'],
   ['dlWeight', 'dlWeight'], ['dlAir', 'dlAir'], ['dlAuto', 'dlAuto']]
    .forEach(([elKey, key]) => {
      const inp = sh[elKey];
      inp.value = state.shop[key];
      inp.addEventListener('input', () => {
        const clean = inp.value.replace(/[^0-9.,+\-*/×÷%^()\s]/g, '');
        if (clean !== inp.value) inp.value = clean;
        state.shop[key] = inp.value;
        persist();
        updateShop();
      });
    });
  sh.cur.value = state.shop.priceCur;
  sh.cur.addEventListener('change', () => { state.shop.priceCur = sh.cur.value; persist(); updateShop(); });
  sh.card.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x.dataset.val === state.shop.card));
  sh.card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.shop.card = b.dataset.val;
    sh.card.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
    persist();
    updateShop();
  });
  el.manage.addEventListener('click', openSheet);
  el.sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  el.search.addEventListener('input', renderPicker);
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('is-active', x === b));
    tab = b.dataset.tab;
    renderPicker();
  }));
  el.picker.addEventListener('click', e => {
    const item = e.target.closest('.pick');
    if (!item) return;
    const code = item.dataset.code;
    toggleCurrency(code);
    const on = state.list.includes(code);
    item.classList.toggle('is-on', on);
    item.setAttribute('aria-checked', on);
  });
  el.picker.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pick')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.sheet.classList.contains('is-open')) closeSheet();
  });
  window.addEventListener('online', () => refreshRates());
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && rates && Date.now() - rates.ts > 10 * 60e3) refreshRates();
  });
  setInterval(() => { if (!document.hidden) refreshRates(); }, 15 * 60e3);

  // PWA install
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    el.install.hidden = false;
  });
  el.install.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    el.install.hidden = true;
  });
  // Service worker + auto-update: an installed app on a phone is often resumed
  // from memory instead of reloaded, so we check for a new version whenever it
  // comes back to the foreground and reload once the new worker takes over.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return; // first install: nothing old to replace
      reloading = true;
      try { sessionStorage.setItem('flux_updated', '1'); } catch (_) {}
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
        const check = () => { if (!document.hidden) reg.update().catch(() => {}); };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        setInterval(check, 30 * 60e3);
      }).catch(() => {});
    });
  }

  /* ================= Boot ================= */
  if (rates) rates.rates = cleanRates(rates.rates);
  if (!state.list.includes(state.base)) state.base = state.list[0] || 'USD';
  applyTheme();
  applyI18n();
  setView(state.view);
  setStatus(rates ? (navigator.onLine ? 'ok' : 'offline') : 'loading');
  try {
    if (sessionStorage.getItem('flux_updated')) {
      sessionStorage.removeItem('flux_updated');
      setTimeout(() => toast(`${t('updatedTo')} ${APP_VERSION}`), 1800);
    }
  } catch (_) {}

  const started = performance.now();
  let splashDone = false;
  const hideSplash = () => {
    if (splashDone) return;
    splashDone = true;
    const wait = Math.max(0, 1400 - (performance.now() - started));
    setTimeout(() => {
      el.splash.classList.add('is-hidden');
      renderList(true);
      setTimeout(() => el.splash.remove(), 700);
    }, wait);
  };
  const maxWait = setTimeout(hideSplash, rates ? 1800 : 7000);
  refreshRates().then(() => { clearTimeout(maxWait); hideSplash(); });
})();
