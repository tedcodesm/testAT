require('dotenv').config();
const axios = require('axios');
const qs = require('querystring');

const user = process.env.AFRICASTALKING_USERNAME;
const key = process.env.AFRICASTALKING_API_KEY;
if (!user || !key) {
  console.error('Missing AFRICASTALKING_USERNAME or AFRICASTALKING_API_KEY in env');
  process.exit(1);
}

const auth = Buffer.from(`${user}:${key}`).toString('base64');

axios.post('https://api.africastalking.com/version1/messaging',
  qs.stringify({
    username: user,
    to: '+254743080538',
    message: 'Hello from test-at.js'
  }),
  {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    },
    validateStatus: () => true
  }
).then(res => {
  console.log('STATUS', res.status);
  console.log('HEADERS', res.headers);
  console.log('DATA', res.data);
}).catch(err => {
  console.error('REQUEST ERROR', err.message);
});
