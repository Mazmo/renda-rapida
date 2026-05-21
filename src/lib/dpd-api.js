/**
 * DPD Portugal tracking API client.
 *
 * DPD Portugal uses the DPD Group tracking API:
 *   https://tracking.dpd.pt/parcelstatus?query={trackingNumber}&messageLanguage=pt
 *
 * Falls back to the pan-European DPD endpoint if the PT-specific one fails.
 */

const ENDPOINTS = [
  'https://tracking.dpd.pt/parcelstatus',
  'https://tracking.dpd.de/parcelstatus',
];

const LANGUAGE = 'pt';

/**
 * @typedef {Object} TrackingEvent
 * @property {string} timestamp - ISO 8601 date-time string
 * @property {string} status    - Human-readable status label
 * @property {string} location  - City / depot where the event occurred
 * @property {string} [description] - Optional extra detail
 */

/**
 * @typedef {Object} TrackingResult
 * @property {string}          trackingNumber
 * @property {string}          currentStatus
 * @property {string|null}     estimatedDelivery
 * @property {TrackingEvent[]} events
 */

/**
 * Maps DPD event codes to Portuguese labels.
 * Source: DPD Group REST API documentation and observed responses.
 */
const EVENT_LABELS = {
  1:  'Encomenda recebida',
  2:  'Em trânsito',
  3:  'Em entrega',
  4:  'Entregue',
  5:  'Ausência na entrega',
  6:  'Entrega agendada',
  7:  'Devolvida ao remetente',
  8:  'Recolhida no depósito',
  9:  'Em processamento no depósito',
  10: 'Saiu do depósito',
  11: 'Atraso na entrega',
  12: 'Encomenda retida na alfândega',
};

function labelForCode(code) {
  return EVENT_LABELS[code] ?? `Evento ${code}`;
}

function parseResponse(json) {
  const parcel = json?.data?.parcelStatusData?.[0];
  if (!parcel) {
    throw new Error('Nenhuma informação encontrada para este número de rastreamento.');
  }

  const events = (parcel.parcelEvents ?? []).map((e) => ({
    timestamp: e.eventDate ?? e.date ?? null,
    status: e.description ?? labelForCode(e.eventCode),
    location: [e.city, e.country].filter(Boolean).join(', '),
    description: e.remark ?? null,
  }));

  // DPD returns events oldest-first; reverse for most-recent-first display.
  events.reverse();

  const latest = events[0];
  return {
    trackingNumber: parcel.parcelNumber,
    currentStatus: latest?.status ?? 'Desconhecido',
    estimatedDelivery: parcel.predictedDelivery ?? null,
    events,
  };
}

/**
 * Fetch tracking data for a DPD Portugal parcel.
 *
 * @param {string} trackingNumber
 * @param {{ fetch?: Function }} [options] - Inject a custom fetch (useful in tests)
 * @returns {Promise<TrackingResult>}
 */
async function trackParcel(trackingNumber, options = {}) {
  if (!trackingNumber || typeof trackingNumber !== 'string') {
    throw new TypeError('trackingNumber deve ser uma string não-vazia.');
  }

  const fetchFn = options.fetch ?? (await import('node-fetch')).default;

  let lastError;
  for (const base of ENDPOINTS) {
    const url = `${base}?query=${encodeURIComponent(trackingNumber)}&messageLanguage=${LANGUAGE}`;
    try {
      const res = await fetchFn(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'dpd-portugal-tracking/1.0',
        },
        // 10-second timeout via AbortController
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      return parseResponse(json);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

module.exports = { trackParcel, parseResponse, labelForCode };
