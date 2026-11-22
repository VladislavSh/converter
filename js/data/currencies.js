// Currency metadata. Fiat names come from Intl.DisplayNames (core/names.js),
// with names of our own for the popular ones; crypto is listed here because
// Intl does not know it.

export const CRYPTO = Object.freeze([
  { code: 'BTC',  id: 'bitcoin',          sym: '₿',  color: ['#F7931A', '#C46A00'], name: { ru: 'Биткоин', en: 'Bitcoin' } },
  { code: 'ETH',  id: 'ethereum',         sym: 'Ξ',  color: ['#8A92B2', '#454A75'], name: { ru: 'Эфириум', en: 'Ethereum' } },
  { code: 'USDT', id: 'tether',           sym: '₮',  color: ['#26A17B', '#137355'], name: { ru: 'Tether', en: 'Tether' } },
  { code: 'BNB',  id: 'binancecoin',      sym: 'B',  color: ['#F3BA2F', '#B38612'], name: { ru: 'BNB', en: 'BNB' } },
  { code: 'SOL',  id: 'solana',           sym: 'S',  color: ['#9945FF', '#14F195'], name: { ru: 'Solana', en: 'Solana' } },
  { code: 'XRP',  id: 'ripple',           sym: 'X',  color: ['#23292F', '#4A5560'], name: { ru: 'XRP', en: 'XRP' } },
  { code: 'USDC', id: 'usd-coin',         sym: '$',  color: ['#2775CA', '#1A4E8A'], name: { ru: 'USD Coin', en: 'USD Coin' } },
  { code: 'TON',  id: 'the-open-network', sym: '◆',  color: ['#0098EA', '#005E91'], name: { ru: 'Toncoin', en: 'Toncoin' } },
  { code: 'DOGE', id: 'dogecoin',         sym: 'Ð',  color: ['#C2A633', '#8A7520'], name: { ru: 'Dogecoin', en: 'Dogecoin' } },
  { code: 'ADA',  id: 'cardano',          sym: '₳',  color: ['#0033AD', '#00207A'], name: { ru: 'Cardano', en: 'Cardano' } },
  { code: 'TRX',  id: 'tron',             sym: 'T',  color: ['#EF0027', '#A3001B'], name: { ru: 'TRON', en: 'TRON' } },
  { code: 'LTC',  id: 'litecoin',         sym: 'Ł',  color: ['#345D9D', '#1F3A66'], name: { ru: 'Лайткоин', en: 'Litecoin' } },
  { code: 'DOT',  id: 'polkadot',         sym: '●',  color: ['#E6007A', '#9C0053'], name: { ru: 'Polkadot', en: 'Polkadot' } },
  { code: 'AVAX', id: 'avalanche-2',      sym: 'A',  color: ['#E84142', '#A32B2C'], name: { ru: 'Avalanche', en: 'Avalanche' } },
  { code: 'LINK', id: 'chainlink',        sym: '⬡',  color: ['#2A5ADA', '#1B3B91'], name: { ru: 'Chainlink', en: 'Chainlink' } },
  { code: 'XMR',  id: 'monero',           sym: 'ɱ',  color: ['#FF6600', '#B34700'], name: { ru: 'Monero', en: 'Monero' } },
  { code: 'SHIB', id: 'shiba-inu',        sym: 'S',  color: ['#FFA409', '#B36F00'], name: { ru: 'Shiba Inu', en: 'Shiba Inu' } },
  { code: 'PAXG', id: 'pax-gold',         sym: 'Au', color: ['#E4C26A', '#A8862F'], name: { ru: 'PAX Gold', en: 'PAX Gold' } }
]);

export const CRYPTO_BY_CODE = Object.freeze(Object.fromEntries(CRYPTO.map(c => [c.code, c])));
export const isCrypto = code => Object.hasOwn(CRYPTO_BY_CODE, code);

// Fiat shown first in the picker
export const POPULAR = Object.freeze([
  'USD', 'EUR', 'RUB', 'UZS', 'KZT', 'UAH', 'BYN', 'GBP', 'CNY', 'JPY', 'TRY', 'AED',
  'GEL', 'AMD', 'AZN', 'KGS', 'TJS', 'PLN', 'CHF', 'CAD', 'INR', 'KRW', 'THB', 'VND'
]);

// Currency code -> ISO country code of the flag, when it is not the first two letters
export const FLAG_OVERRIDE = Object.freeze({ EUR: 'eu', ANG: 'cw', XCD: 'ag', XAF: 'cm', XOF: 'sn', XPF: 'pf', BTN: 'bt' });

/**
 * Active ISO 4217 currency codes. Whether the app knows a currency must not
 * depend on the phone: some browsers ship Intl data that cannot name rarer
 * currencies — the sum among them — and the app used to drop those.
 */
export const ISO_FIAT = new Set(`
  AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD
  CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD
  GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT
  LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR
  NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD
  SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD
  XCG XOF XPF YER ZAR ZMW ZWG ZWL
`.trim().split(/\s+/));

/** Names of the popular currencies, for phones whose Intl data has none. */
export const FIAT_NAMES = Object.freeze({
  USD: { ru: 'Доллар США', en: 'US Dollar' },
  EUR: { ru: 'Евро', en: 'Euro' },
  RUB: { ru: 'Российский рубль', en: 'Russian Ruble' },
  UZS: { ru: 'Узбекский сум', en: 'Uzbekistani Som' },
  KZT: { ru: 'Казахстанский тенге', en: 'Kazakhstani Tenge' },
  UAH: { ru: 'Украинская гривна', en: 'Ukrainian Hryvnia' },
  BYN: { ru: 'Белорусский рубль', en: 'Belarusian Ruble' },
  GBP: { ru: 'Британский фунт стерлингов', en: 'British Pound' },
  CNY: { ru: 'Китайский юань', en: 'Chinese Yuan' },
  JPY: { ru: 'Японская иена', en: 'Japanese Yen' },
  TRY: { ru: 'Турецкая лира', en: 'Turkish Lira' },
  AED: { ru: 'Дирхам ОАЭ', en: 'UAE Dirham' },
  GEL: { ru: 'Грузинский лари', en: 'Georgian Lari' },
  AMD: { ru: 'Армянский драм', en: 'Armenian Dram' },
  AZN: { ru: 'Азербайджанский манат', en: 'Azerbaijani Manat' },
  KGS: { ru: 'Киргизский сом', en: 'Kyrgystani Som' },
  TJS: { ru: 'Таджикский сомони', en: 'Tajikistani Somoni' },
  PLN: { ru: 'Польский злотый', en: 'Polish Zloty' },
  CHF: { ru: 'Швейцарский франк', en: 'Swiss Franc' },
  CAD: { ru: 'Канадский доллар', en: 'Canadian Dollar' },
  INR: { ru: 'Индийская рупия', en: 'Indian Rupee' },
  KRW: { ru: 'Южнокорейская вона', en: 'South Korean Won' },
  THB: { ru: 'Таиландский бат', en: 'Thai Baht' },
  VND: { ru: 'Вьетнамский донг', en: 'Vietnamese Dong' }
});

// Names for codes Intl.DisplayNames does not know
export const FIAT_EXTRA = Object.freeze({
  CNH: { ru: 'Китайский юань (офшор)', en: 'Chinese Yuan (Offshore)' }
});

export const DEFAULT_LIST = Object.freeze(['USD', 'CNY', 'UZS', 'RUB']);
