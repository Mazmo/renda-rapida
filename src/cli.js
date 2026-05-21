#!/usr/bin/env node

const { trackParcel } = require('./lib/dpd-api');

const trackingNumber = process.argv[2];

if (!trackingNumber) {
  console.error('Uso: dpd-track <número-de-rastreamento>');
  console.error('Exemplo: dpd-track 098660968969741');
  process.exit(1);
}

(async () => {
  console.log(`\nA rastrear encomenda: ${trackingNumber}\n`);

  try {
    const result = await trackParcel(trackingNumber);

    console.log(`Estado atual : ${result.currentStatus}`);
    if (result.estimatedDelivery) {
      console.log(`Entrega prevista: ${new Date(result.estimatedDelivery).toLocaleString('pt-PT')}`);
    }

    if (result.events.length > 0) {
      console.log('\nHistórico de eventos:');
      console.log('─'.repeat(60));
      for (const ev of result.events) {
        const when = ev.timestamp
          ? new Date(ev.timestamp).toLocaleString('pt-PT')
          : 'Data desconhecida';
        console.log(`${when}`);
        console.log(`  ${ev.status}${ev.location ? ` — ${ev.location}` : ''}`);
        if (ev.description) console.log(`  (${ev.description})`);
      }
    }
  } catch (err) {
    console.error(`\nErro: ${err.message}`);
    process.exit(1);
  }
})();
