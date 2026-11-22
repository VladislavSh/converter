// "Purchase" tab: the form and a readable breakdown of calcPurchase().
// All numbers come from core/purchase.js; this file only formats and binds.
import { isExpression, sanitizeExpression } from '../core/expression.js';
import { formatMoney, formatNumber, plainNumber } from '../core/format.js';
import { parsePastedAmount, pastedPrice, takeConverterAmount } from '../core/pasted-amount.js';
import { calcPurchase, parseNumber } from '../core/purchase.js';
import { breakdownLines, purchaseShareText } from '../core/share-text.js';
import { $, $$, copyText, escapeHtml, readClipboardText } from './dom.js';

const MIN_LEFTOVER = 0.004; // below half a cent there is nothing to explain

export function createPurchaseView(app) {
  const el = {
    price: $('#sh-price'),
    paste: $('#sh-paste'),
    copy: $('#sh-copy'),
    share: $('#sh-share'),
    currency: $('#sh-cur'),
    card: $('#sh-card'),
    presets: $('#sh-presets'),
    feePercent: $('#sh-svc'),
    feeFree: $('#sh-free'),
    feeMin: $('#sh-min'),
    feeExplain: $('#sh-fee-explain'),
    bank: $('#sh-bank'),
    buffer: $('#sh-buf'),
    dlOn: $('#dl-on'),
    dlHint: $('#dl-hint'),
    dlBody: $('#dl-body'),
    dlMethod: $('#dl-method'),
    dlAirLabel: $('#dl-air-lbl'),
    dlAutoLabel: $('#dl-auto-lbl'),
    dlWeight: $('#dl-weight'),
    dlUnit: $('#dl-unit'),
    dlAir: $('#dl-air'),
    dlAuto: $('#dl-auto'),
    dlStep: $('#dl-step'),
    dlPayCard: $('#dl-paycard'),
    dlRows: $('#dl-break'),
    rows: $('#sh-break'),
    topup: $('#sh-topup'),
    alt: $('#sh-alt'),
    rates: $('#sh-rates'),
    tip: $('#sh-tip'),
    summary: $('#sh-grand')
  };
  const shop = () => app.state.shop;

  // Each text field mirrors one string in state.shop
  const TEXT_FIELDS = [
    [el.price, 'price'], [el.feePercent, 'svcPct'], [el.feeFree, 'freeBelow'], [el.feeMin, 'svcMin'],
    [el.bank, 'bankPct'], [el.buffer, 'bufPct'],
    [el.dlWeight, 'dlWeight'], [el.dlAir, 'dlAir'], [el.dlAuto, 'dlAuto']
  ];
  // Button groups where exactly one option is selected
  const CHOICES = [[el.card, 'card'], [el.dlMethod, 'dlMethod'], [el.dlUnit, 'dlUnit']];

  const changed = () => { app.save(); render(); };

  // ---------- rendering ----------

  const rowHtml = (label, valueHtml, { strong = false, good = false } = {}) =>
    `<div class="rrow${strong ? ' is-strong' : ''}"><span>${escapeHtml(label)}</span><b${good ? ' class="is-good"' : ''}>${valueHtml}</b></div>`;

  function syncControls() {
    const s = shop();
    for (const [box, key] of CHOICES) {
      for (const button of $$('button[data-val]', box)) {
        const active = button.dataset.val === s[key];
        button.classList.toggle('is-active', active);
        button.setAttribute(button.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(active));
      }
    }
    const rule = [s.svcPct, s.freeBelow, s.svcMin].map(parseNumber).join(',');
    for (const button of $$('button[data-p]', el.presets)) {
      const active = button.dataset.p === rule;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    el.dlOn.checked = s.dlOn;
    el.dlPayCard.checked = s.dlPayCard;
    el.dlBody.hidden = !s.dlOn;
    el.dlHint.hidden = s.dlOn;
  }

  function renderDelivery(delivery, money) {
    const { t } = app;
    const locale = app.locale();
    el.dlAirLabel.textContent = t('dlPerKg', { v: money(delivery.airRate, 'USD') });
    el.dlAutoLabel.textContent = t('dlPerKg', { v: money(delivery.autoRate, 'USD') });
    if (!(delivery.kg > 0)) {
      el.dlRows.innerHTML = '';
      return;
    }
    const methodName = method => t(method === 'air' ? 'dlAir' : 'dlAuto');
    const other = delivery.method === 'air' ? 'auto' : 'air';
    const kilos = kg => `${formatNumber(kg, locale, 3)} ${t('dlKg')}`;

    let billed = kilos(delivery.billedKg);
    if (Math.abs(delivery.billedKg - delivery.kg) > 1e-9) {
      const actual = delivery.kg < 1 ? `${formatNumber(delivery.kg * 1000, locale, 0)} ${t('dlG')}` : kilos(delivery.kg);
      billed += ` <span class="rrow__note">${escapeHtml(t('dlFact', { w: actual }))}</span>`;
    }
    const inUzs = app.convert(delivery.cost, 'USD', 'UZS');
    const rows = [
      rowHtml(t('dlBilled'), billed),
      rowHtml(
        t('dlCost', { method: methodName(delivery.method).toLowerCase() }),
        `${money(delivery.cost, 'USD')} $${inUzs == null ? '' : ` ≈ ${money(inUzs, 'UZS')} UZS`}`,
        { strong: true }
      )
    ];
    if (delivery.otherRate > 0 && delivery.otherRate !== delivery.rate) {
      const cheaper = delivery.otherCost < delivery.cost;
      const diff = `${money(Math.abs(delivery.cost - delivery.otherCost), 'USD')} $`;
      rows.push(rowHtml(
        t('dlWould', { method: methodName(other) }),
        `${money(delivery.otherCost, 'USD')} $, ${escapeHtml(t(cheaper ? 'dlCheaper' : 'dlPricier', { d: diff }))}`,
        { good: cheaper }
      ));
    }
    el.dlRows.innerHTML = rows.join('');
  }

  /** The fee rule in plain words, then the arithmetic for the current price. */
  function renderFeeExplain(fee) {
    const { t } = app;
    const yuan = value => `${formatNumber(value, app.locale(), 2)} ¥`;
    const bold = text => `<b>${text}</b>`;
    if (fee.percent <= 0) {
      el.feeExplain.textContent = t('feeNone');
      return;
    }
    const percent = formatNumber(fee.percent, app.locale(), 2);
    let html = t('feeRule', { p: bold(`${percent}%`) });
    if (fee.freeBelow > 0) html += t('feeFree', { lim: bold(yuan(fee.freeBelow)) });
    if (fee.minimum > 0) html += t('feeMin', { min: bold(yuan(fee.minimum)) });
    html += `. ${t('feePerPay')}`;

    if (fee.priceCny > 0) {
      let calc;
      if (fee.feeCny === 0) {
        calc = t('feeCalcFree', { a: yuan(fee.priceCny), lim: yuan(fee.freeBelow) });
      } else {
        const over = fee.freeBelow > 0 ? ` &gt; ${yuan(fee.freeBelow)}` : '';
        calc = `${yuan(fee.priceCny)}${over} → ${percent}% × ${yuan(fee.priceCny)} = ${yuan(fee.rawFeeCny)}`;
        if (fee.isMinimum) calc += ` &lt; ${yuan(fee.minimum)} → ${t('feeCalcMin', { min: yuan(fee.minimum) })}`;
      }
      html += `<span class="calc">${t('feeNow', { calc })}</span>`;
    }
    el.feeExplain.innerHTML = html;
  }

  function renderBreakdown(r, money) {
    const { card } = r;
    // The same lines go into the share message, so they are built in one place
    el.rows.innerHTML = breakdownLines(r, { t: app.t, locale: app.locale() })
      .map(line => rowHtml(line.label, escapeHtml(line.value), { strong: line.strong }))
      .join('');
    el.share.hidden = !r.hasTopup && !(r.delivery.cost > 0);

    el.topup.textContent = r.hasTopup ? `${money(r.topup, card)} ${card}` : '—';
    el.copy.hidden = !r.hasTopup;
    el.alt.textContent = r.topupAlt == null ? '' : `≈ ${money(r.topupAlt, r.altCurrency)} ${r.altCurrency}`;

    const usdCny = app.convert(1, 'USD', 'CNY');
    const cnyUzs = app.convert(1, 'CNY', 'UZS');
    el.rates.textContent = [
      usdCny == null ? '' : `1 USD = ${money(usdCny, 'CNY')} CNY`,
      cnyUzs == null ? '' : `1 CNY = ${money(cnyUzs, 'CNY')} UZS`
    ].filter(Boolean).join(', ');
  }

  function renderTip(r, money) {
    el.tip.hidden = !r.split;
    if (!r.split) return;
    el.tip.innerHTML = app.t('shTip', {
      n: r.split.parts,
      lim: formatNumber(r.fee.freeBelow, app.locale(), 2),
      save: `<b>${money(r.split.saved, r.card)} ${r.card}</b>`
    });
  }

  /** "Top up + delivery = total needed", so every line on screen adds up. */
  function renderSummary(r, money) {
    const { t } = app;
    const { summary, card } = r;
    let html = '';
    if (summary) {
      const line = (label, value, kind) => `<div class="grand__row ${kind}"><span>${escapeHtml(label)}</span><b>${value}</b></div>`;
      if (summary.showParts) {
        if (r.hasTopup) html += line(t('sumTopup'), `${money(r.topup, card)} ${card}`, 'is-part');
        html += line(t('sumDelivery'), `${money(r.delivery.cost, 'USD')} USD`, 'is-part');
        html += line(t('sumTotal'), `${money(summary.needUsd, 'USD')} USD`, 'is-total');
        if (summary.needUzs != null) html += `<div class="grand__sub">≈ ${money(summary.needUzs, 'UZS')} UZS</div>`;
      }
      if (summary.leftover > MIN_LEFTOVER) {
        html += `<div class="grand__note">${escapeHtml(t('sumNote', {
          real: `${money(summary.exactUsd, 'USD')} $`,
          left: `${money(summary.leftover, card)} ${card === 'USD' ? '$' : card}`
        }))}</div>`;
      }
    }
    el.summary.innerHTML = html;
    el.summary.hidden = !html;
  }

  let lastResult = null;

  function render() {
    const locale = app.locale();
    const money = (value, code) => formatMoney(value, code, locale);
    const result = calcPurchase(shop(), app.convert);
    lastResult = result;
    syncControls();
    renderDelivery(result.delivery, money);
    renderFeeExplain(result.fee);
    renderBreakdown(result, money);
    renderTip(result, money);
    renderSummary(result, money);
  }

  // ---------- events ----------

  for (const [input, key] of TEXT_FIELDS) {
    input.value = shop()[key];
    input.addEventListener('input', () => {
      const clean = sanitizeExpression(input.value);
      if (clean !== input.value) input.value = clean;
      shop()[key] = clean;
      changed();
    });
  }
  for (const [box, key] of CHOICES) {
    box.addEventListener('click', event => {
      const button = event.target.closest('button[data-val]');
      if (!button || shop()[key] === button.dataset.val) return;
      shop()[key] = button.dataset.val;
      changed();
    });
  }
  el.currency.value = shop().priceCur;
  el.currency.addEventListener('change', () => { shop().priceCur = el.currency.value; changed(); });
  el.dlStep.value = shop().dlStep;
  el.dlStep.addEventListener('change', () => { shop().dlStep = el.dlStep.value; changed(); });

  // --- pasting a price copied from the shop: "¥1,299.00", "$12.99", "1 500 ₽" ---
  const hasRate = code => app.convert(1, 'USD', code) != null;

  /** Shows a price that was put into the form and says where it came from. */
  function showNewPrice(result, sourceValue, plainKey, convertedKey) {
    el.price.value = result.price;
    el.currency.value = result.currency;
    changed();
    const money = (value, code) => `${formatMoney(value, code, app.locale())} ${code}`;
    const price = money(Number(result.price), result.currency);
    app.toast(result.convertedFrom
      ? app.t(convertedKey, { from: money(sourceValue, result.convertedFrom), to: price })
      : app.t(plainKey, { text: price }));
  }

  /** Puts a pasted price into the form and says what was understood. */
  function replacePrice(pasted) {
    const result = pastedPrice(pasted, shop(), app.convert);
    Object.assign(shop(), { price: result.price, priceCur: result.currency });
    showNewPrice(result, pasted.value, 'pasted', 'pastedConverted');
  }

  /** The tab was opened: an amount just typed on the main screen becomes the price. */
  function takeAmount() {
    const taken = takeConverterAmount(app.state, app.convert);
    if (taken) showNewPrice(taken, taken.value, 'carried', 'carriedConverted');
  }

  el.paste.addEventListener('click', async () => {
    const text = await readClipboardText();
    if (text == null) {
      app.toast(app.t('pasteDenied'));
      el.price.focus();
      return;
    }
    const pasted = parsePastedAmount(text, hasRate);
    if (pasted) replacePrice(pasted);
    else app.toast(app.t('pasteEmpty'));
  });

  // The system paste (long press, Ctrl+V) goes through the same parser
  el.price.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text') ?? '';
    const pasted = parsePastedAmount(text, hasRate);
    // A calculation ("89.9*2") is pasted as typed; the input handler cleans it up
    if (!pasted || (!pasted.currency && isExpression(text.trim()))) return;
    event.preventDefault();
    if (pasted.currency && pasted.currency !== shop().priceCur) {
      replacePrice(pasted);
      return;
    }
    el.price.setRangeText(plainNumber(pasted.value), el.price.selectionStart, el.price.selectionEnd, 'end');
    shop().price = sanitizeExpression(el.price.value);
    changed();
  });

  el.copy.addEventListener('click', async () => {
    if (!lastResult?.hasTopup) return;
    const text = plainNumber(lastResult.topup);
    const copied = await copyText(text);
    app.toast(copied ? app.t('copied', { text: `${text} ${lastResult.card}` }) : app.t('copyFailed'));
  });

  el.share.addEventListener('click', () => {
    const text = lastResult && purchaseShareText({
      result: lastResult,
      convert: app.convert,
      t: app.t,
      locale: app.locale(),
      customRate: app.customRate(),
      url: app.link()
    });
    if (text) app.share(text);
    else app.toast(app.t('shareEmpty'));
  });

  el.presets.addEventListener('click', event => {
    const button = event.target.closest('button[data-p]');
    if (!button) return;
    const [percent, free, minimum] = button.dataset.p.split(',');
    Object.assign(shop(), { svcPct: percent, freeBelow: free, svcMin: minimum });
    el.feePercent.value = percent;
    el.feeFree.value = free;
    el.feeMin.value = minimum;
    changed();
  });

  // Switching delivery off clears it, so nothing of it lingers in the totals
  el.dlOn.addEventListener('change', () => {
    shop().dlOn = el.dlOn.checked;
    if (!el.dlOn.checked) {
      Object.assign(shop(), { dlWeight: '', dlPayCard: false });
      el.dlWeight.value = '';
    }
    changed();
  });
  el.dlPayCard.addEventListener('change', () => { shop().dlPayCard = el.dlPayCard.checked; changed(); });

  return { render, takeAmount };
}
