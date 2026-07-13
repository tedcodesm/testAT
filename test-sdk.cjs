require('dotenv').config();
const africastalking = require('africastalking');

const credentials = {
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME,
};

const AT = africastalking(credentials);
const sms = AT.SMS;

sms.send({
  to: ['+254743080538'],
  message: 'Hello from SDK test',
}).then(res => console.log('SDK OK', JSON.stringify(res, null, 2))).catch(err => {
  console.error('SDK ERR', err.message || err);
  if (err.response) console.error('SDK ERR DATA', err.response.data);
});

