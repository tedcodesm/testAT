import express from "express";
import cors from "cors";
import fs from "fs";
import { createRequire } from "module";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { VoiceHelper } from "./utils/VoiceHelper.js";

config({ path: ".env" });

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const AT_apiKey = process.env.AFRICASTALKING_API_KEY;
const AT_username = process.env.AFRICASTALKING_USERNAME;
const AT_virtualNumber = process.env.VIRTUAL_NUMBER;

const atVoice = new VoiceHelper({
  AT_apiKey,
  AT_username,
  AT_virtualNumber,
});

const credentials = {
  apiKey: AT_apiKey,
  username: AT_username,
};

const africastalking = require("africastalking")(credentials);
const voice = africastalking.VOICE;

let APP_URL = "https://7ced-102-204-13-213.ngrok-free.app";

app.post("/response-callback", async (req, res) => {
  const phoneNumber = req.body.entries[0].phoneNumber;

  const message =
    "Welcome to Africa's Talking Call Center How may we assist you today?";
  const response = `<Response><Say>${message}</Say><Hangup/></Response>`;

  res.send(response);
});

app.post("/voice/callback", async (req, res) => {
  try {
    console.log("Incoming call request:", req.body);

    const callback_url = `${APP_URL}/talking-center`;
    const { direction } = req.body;

    let callActions;

    if (direction === "Inbound") {
      callActions = atVoice.ongea({
        textPrompt:
          "Welcome to Africa's Talking Call Center. How may we assist you today?",
        finishOnKey: "#",
        timeout: 15,
        callbackUrl: callback_url,
      });

      const responseAction = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${callActions}
</Response>`;

      return res.send(responseAction);
    }

    if (direction === "Outbound") {
      callActions = atVoice.ongea({
        textPrompt: "I am the Africastalking assistant here to help",
        finishOnKey: "#",
        timeout: 15,
        callbackUrl: `${APP_URL}/response-callback`,
      });

      const responseAction = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${callActions}
</Response>`;

      return res.send(responseAction);
    }

    return res.status(400).send("Invalid direction"); // safety fallback
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
});

app.post("/talking-center", (req, res) => {
  let callActions;
  let done = false;
  let pressedKey = req.body.dtmfDigits;

  if (pressedKey === "undefined") {
    return res.end();
  }

  if (!isNaN(pressedKey)) {
    pressedKey = Number(pressedKey);
    console.log(`Number pressed ${pressedKey}`);

    switch (pressedKey) {
      case 1:
        callActions = atVoice.ongea({
          textPrompt: "Hello, how can I help you?",
          finishOnKey: "#",
          timeout: 15,
          callbackUrl: `${APP_URL}/emergency`,
        });
        done = true;
        break;

      default:
        callActions = atVoice.saySomething({
          speech: "Sorry, our system has some difficulty",
        });
    }
  }

  if (!done) {
    callActions = atVoice.saySomething({
      speech: "Sorry, you have pressed an invalid key",
    });
  }

  const responseAction = `<?xml version="1.0" encoding="UTF-8"?><Response>${callActions}</Response>`;
  return res.send(responseAction);
});

app.post("/make-call", async (req, res) => {
  const callTo = req.body.callTo;

  if (!callTo) {
    return res
      .status(400)
      .json({ success: false, message: "Phone number is required." });
  }

  try {
    const callResponse = await makeCall(callTo);
    console.log("Call response:", callResponse);
    res.json({ success: true, message: "Call initiated successfully." });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Failed to initiate the call." });
  }
});

app.post("/emergency", (req, res) => {
  let callActions;
  let done = false;
  let pressedKey = req.body.dtmfDigits;

  if (pressedKey === "undefined") {
    return res.end();
  }

  if (!isNaN(pressedKey)) {
    pressedKey = Number(pressedKey);
    console.log(`Number pressed ${pressedKey}`);

    switch (pressedKey) {
      case 1:
        callActions = atVoice.recordAudio({
          introductionText:
            "Can you describe your emergency and then press the hashkey, after the Beep",
          audioProcessingUrl: `${APP_URL}/emergency-response`,
        });
        done = true;
        break;

      case 2:
        callActions = atVoice.recordAudio({
          introductionText:
            "Can you describe your emergency and then press the hashkey.",
          audioProcessingUrl: `${APP_URL}/emergency-response`,
        });
        done = true;
        break;

      case 3:
        callActions = atVoice.recordAudio({
          introductionText:
            "Can you describe your emergency and then press the hashkey.",
          audioProcessingUrl: `${APP_URL}/emergency-response`,
        });
        done = true;
        break;

      default:
        callActions = atVoice.saySomething({
          speech: "Sorry, our system has some difficulty",
        });
    }
  }

  if (!done) {
    callActions = atVoice.saySomething({
      speech: "Sorry you did not press any key goodBye",
    });
  }

  const responseAction = `<?xml version="1.0" encoding="UTF-8"?><Response>${callActions}</Response>`;
  return res.send(responseAction);
});

// Start the server
const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
