const http = require('http');

const post = (path, data, token) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  }, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject);
  req.write(JSON.stringify(data));
  req.end();
});

async function test() {
  try {
    const login = await post('/auth/login', { email: 'admin@verris.pl', password: 'admin123' });
    console.log('Login status:', login.status);
    if (!login.body.includes('access_token')) {
      console.log('Login failed:', login.body);
      return;
    }
    const token = JSON.parse(login.body).access_token;
    
    const ticket = await post('/tickets', { subject: 'Test sub', message: 'Test message123' }, token);
    console.log('Ticket status:', ticket.status);
    console.log('Ticket response:', ticket.body);
  } catch (e) {
    console.error(e);
  }
}
test();
