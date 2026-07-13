require('dotenv').config();
const key = process.env.AFRICASTALKING_API_KEY || '';
const user = process.env.AFRICASTALKING_USERNAME || '';
console.log('USERNAME:', user);
console.log('API KEY length:', key.length);
console.log('API KEY startsWith atsk:', key.startsWith('atsk_'));
console.log('API KEY equals trimmed:', key === key.trim());
if (!key) process.exit(1);
