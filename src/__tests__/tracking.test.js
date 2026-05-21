const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { trackParcel, parseResponse, labelForCode } = require('../lib/dpd-api');

// --- parseResponse ---

describe('parseResponse', () => {
  it('parses a valid DPD API response', () => {
    const fixture = {
      data: {
        parcelStatusData: [
          {
            parcelNumber: '098660968969741',
            predictedDelivery: '2024-12-20T10:00:00Z',
            parcelEvents: [
              {
                eventDate: '2024-12-18T08:00:00Z',
                description: 'Encomenda recebida',
                city: 'Lisboa',
                country: 'PT',
                remark: null,
              },
              {
                eventDate: '2024-12-19T14:30:00Z',
                description: 'Em entrega',
                city: 'Porto',
                country: 'PT',
                remark: null,
              },
            ],
          },
        ],
      },
    };

    const result = parseResponse(fixture);

    assert.equal(result.trackingNumber, '098660968969741');
    assert.equal(result.currentStatus, 'Em entrega');
    assert.equal(result.estimatedDelivery, '2024-12-20T10:00:00Z');
    assert.equal(result.events.length, 2);
    // Most recent first
    assert.equal(result.events[0].status, 'Em entrega');
    assert.equal(result.events[0].location, 'Porto, PT');
    assert.equal(result.events[1].status, 'Encomenda recebida');
  });

  it('throws when parcel data is missing', () => {
    assert.throws(
      () => parseResponse({}),
      /Nenhuma informação encontrada/
    );
  });

  it('handles empty events array', () => {
    const fixture = {
      data: {
        parcelStatusData: [
          {
            parcelNumber: '123',
            parcelEvents: [],
          },
        ],
      },
    };
    const result = parseResponse(fixture);
    assert.equal(result.currentStatus, 'Desconhecido');
    assert.deepEqual(result.events, []);
  });
});

// --- labelForCode ---

describe('labelForCode', () => {
  it('returns known label for code 4', () => {
    assert.equal(labelForCode(4), 'Entregue');
  });

  it('returns fallback for unknown code', () => {
    assert.equal(labelForCode(99), 'Evento 99');
  });
});

// --- trackParcel with mocked fetch ---

describe('trackParcel', () => {
  const mockResponse = {
    data: {
      parcelStatusData: [
        {
          parcelNumber: '098660968969741',
          predictedDelivery: null,
          parcelEvents: [
            {
              eventDate: '2024-12-19T10:00:00Z',
              description: 'Em trânsito',
              city: 'Coimbra',
              country: 'PT',
            },
          ],
        },
      ],
    },
  };

  function makeMockFetch(response, ok = true) {
    return async () => ({
      ok,
      status: ok ? 200 : 503,
      statusText: ok ? 'OK' : 'Service Unavailable',
      json: async () => response,
    });
  }

  it('returns parsed result on success', async () => {
    const result = await trackParcel('098660968969741', {
      fetch: makeMockFetch(mockResponse),
    });
    assert.equal(result.trackingNumber, '098660968969741');
    assert.equal(result.currentStatus, 'Em trânsito');
  });

  it('throws TypeError for missing tracking number', async () => {
    await assert.rejects(
      () => trackParcel(''),
      TypeError
    );
  });

  it('falls back to second endpoint when first fails', async () => {
    let callCount = 0;
    const fetch = async (url) => {
      callCount++;
      if (callCount === 1) throw new Error('connection refused');
      return {
        ok: true,
        status: 200,
        json: async () => mockResponse,
      };
    };

    const result = await trackParcel('098660968969741', { fetch });
    assert.equal(callCount, 2);
    assert.equal(result.currentStatus, 'Em trânsito');
  });

  it('throws after all endpoints fail', async () => {
    const fetch = async () => { throw new Error('network error'); };
    await assert.rejects(
      () => trackParcel('098660968969741', { fetch }),
      /network error/
    );
  });
});
