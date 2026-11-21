/* Currency metadata. Fiat names come from Intl.DisplayNames; crypto is listed here. */
window.CRYPTO = [
  { code: 'BTC',  id: 'bitcoin',        sym: '₿', color: ['#F7931A', '#C46A00'], name: { ru: 'Биткоин', en: 'Bitcoin' } },
  { code: 'ETH',  id: 'ethereum',       sym: 'Ξ', color: ['#8A92B2', '#454A75'], name: { ru: 'Эфириум', en: 'Ethereum' } },
  { code: 'USDT', id: 'tether',         sym: '₮', color: ['#26A17B', '#137355'], name: { ru: 'Tether', en: 'Tether' } },
  { code: 'BNB',  id: 'binancecoin',    sym: 'B', color: ['#F3BA2F', '#B38612'], name: { ru: 'BNB', en: 'BNB' } },
  { code: 'SOL',  id: 'solana',         sym: 'S', color: ['#9945FF', '#14F195'], name: { ru: 'Solana', en: 'Solana' } },
  { code: 'XRP',  id: 'ripple',         sym: 'X', color: ['#23292F', '#4A5560'], name: { ru: 'XRP', en: 'XRP' } },
  { code: 'USDC', id: 'usd-coin',       sym: '$', color: ['#2775CA', '#1A4E8A'], name: { ru: 'USD Coin', en: 'USD Coin' } },
  { code: 'TON',  id: 'the-open-network', sym: '◆', color: ['#0098EA', '#005E91'], name: { ru: 'Toncoin', en: 'Toncoin' } },
  { code: 'DOGE', id: 'dogecoin',       sym: 'Ð', color: ['#C2A633', '#8A7520'], name: { ru: 'Dogecoin', en: 'Dogecoin' } },
  { code: 'ADA',  id: 'cardano',        sym: '₳', color: ['#0033AD', '#00207A'], name: { ru: 'Cardano', en: 'Cardano' } },
  { code: 'TRX',  id: 'tron',           sym: 'T', color: ['#EF0027', '#A3001B'], name: { ru: 'TRON', en: 'TRON' } },
  { code: 'LTC',  id: 'litecoin',       sym: 'Ł', color: ['#345D9D', '#1F3A66'], name: { ru: 'Лайткоин', en: 'Litecoin' } },
  { code: 'DOT',  id: 'polkadot',       sym: '●', color: ['#E6007A', '#9C0053'], name: { ru: 'Polkadot', en: 'Polkadot' } },
  { code: 'AVAX', id: 'avalanche-2',    sym: 'A', color: ['#E84142', '#A32B2C'], name: { ru: 'Avalanche', en: 'Avalanche' } },
  { code: 'LINK', id: 'chainlink',      sym: '⬡', color: ['#2A5ADA', '#1B3B91'], name: { ru: 'Chainlink', en: 'Chainlink' } },
  { code: 'XMR',  id: 'monero',         sym: 'ɱ', color: ['#FF6600', '#B34700'], name: { ru: 'Monero', en: 'Monero' } },
  { code: 'SHIB', id: 'shiba-inu',      sym: 'S', color: ['#FFA409', '#B36F00'], name: { ru: 'Shiba Inu', en: 'Shiba Inu' } },
  { code: 'PAXG', id: 'pax-gold',       sym: 'Au', color: ['#E4C26A', '#A8862F'], name: { ru: 'PAX Gold', en: 'PAX Gold' } }
];

/* Fiat shown first in the picker */
window.POPULAR = ['USD', 'EUR', 'RUB', 'UZS', 'KZT', 'UAH', 'BYN', 'GBP', 'CNY', 'JPY', 'TRY', 'AED', 'GEL', 'AMD', 'AZN', 'KGS', 'TJS', 'PLN', 'CHF', 'CAD', 'INR', 'KRW', 'THB', 'VND'];

/* Currency code -> ISO country code for the flag (when it isn't the first two letters) */
window.FLAG_OVERRIDE = { EUR: 'eu', ANG: 'cw', XCD: 'ag', XAF: 'cm', XOF: 'sn', XPF: 'pf', BTN: 'bt' };

/* Fallback names for codes Intl doesn't know */
window.FIAT_EXTRA = {
  CNH: { ru: 'Китайский юань (офшор)', en: 'Chinese Yuan (Offshore)' }
};

window.DEFAULT_LIST = ['USD', 'CNY', 'UZS', 'EUR', 'RUB', 'BTC'];
