import { createRequire } from "module";
import { config } from "dotenv";

config();

const require = createRequire(import.meta.url);

const AT_apiKey = process.env.AFRICASTALKING_API_KEY;
const AT_username = process.env.AFRICASTALKING_USERNAME;

const credentials = {
  apiKey: AT_apiKey,
  username: AT_username,
};

const africastalking = require("africastalking")(credentials);
const voice = africastalking.VOICE;

const APP_URL = process.env.URL;

function makeCall(callTo) {
  const options = {
    callFrom: process.env.VIRTUAL_NUMBER,
    callTo: callTo,
    callbackUrl: `${APP_URL}/response-callback`,
  };

  return voice.call(options);
}

export { makeCall };