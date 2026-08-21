const fetch = require('node-fetch');

async function test() {
  try {
    // 1. Zaloguj admina
    const loginRes = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@verris.pl', password: 'admin123' })
    });
    const { accessToken } = await loginRes.json();
    console.log('Got token');

    // 2. Utwórz ticket
    const ticketRes = await fetch('http://localhost:3000/tickets', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ subject: 'Problem123', message: 'Wiadomosc1234567890' })
    });
    
    console.log('Ticket Status:', ticketRes.status);
    const body = await ticketRes.text();
    console.log('Ticket Response:', body);
  } catch (err) {
    console.error(err);
  }
}
test();
