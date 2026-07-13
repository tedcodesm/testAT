import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import africastalking from "africastalking";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── Africa's Talking Setup ─────────────────────────
const credentials = {
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME,
};

const AT = africastalking(credentials);
const voice = AT.VOICE;

const APP_URL = "https://f867-41-89-51-26.ngrok-free.app";

// ─────────────────────────────────────────────────────
// 1. INBOUND CALL ENTRY
// ─────────────────────────────────────────────────────
app.post("/voice/callback", (req, res) => {
  try {
    console.log("Inbound call:", req.body);

    const response = `
<Response>
  <GetDigits timeout="15" finishOnKey="#">
    <Say voice="woman">
      Welcome to Africa's Talking Call Center. Press 1 for help, or 2 for emergency.
    </Say>
  </GetDigits>
  <Say>No input received. Goodbye.</Say>
</Response>`;

    res.setHeader("Content-Type", "text/xml");
    return res.send(response);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

// ─────────────────────────────────────────────────────
// 2. MAIN DTMF HANDLER
// ─────────────────────────────────────────────────────
app.post("/talking-center", (req, res) => {
  const digits = req.body.dtmfDigits;

  if (!digits) {
    return res.end();
  }

  let response = "";

  switch (digits) {
    case "1":
      response = `
<Response>
  <Say>Connecting you to support. Please wait.</Say>
</Response>`;
      break;

    case "2":
      response = `
<Response>
  <GetSpeech>
    <Say>Please describe your emergency after the beep.</Say>
  </GetSpeech>
</Response>`;
      break;

    default:
      response = `
<Response>
  <Say>Invalid option. Goodbye.</Say>
</Response>`;
  }

  res.setHeader("Content-Type", "text/xml");
  res.send(response);
});

// ─────────────────────────────────────────────────────
// 3. EMERGENCY CAPTURE
// ─────────────────────────────────────────────────────
app.post("/emergency", (req, res) => {
  const speech = req.body.speechResult || "No speech captured";

  console.log("Emergency report:", speech);

  const response = `
<Response>
  <Say>Thank you. Your emergency has been recorded. Help is on the way.</Say>
</Response>`;

  res.setHeader("Content-Type", "text/xml");
  res.send(response);
});

// ─────────────────────────────────────────────────────
// 4. OUTBOUND CALL FUNCTION (FIXED)
// ─────────────────────────────────────────────────────
app.post("/make-call", async (req, res) => {
  const { callTo } = req.body;

  if (!callTo) {
    return res.status(400).json({
      success: false,
      message: "Phone number required",
    });
  }

  try {
    const result = await voice.call({
      callFrom: process.env.VIRTUAL_NUMBER,
      callTo: callTo,
    });

    console.log("Call result:", result);

    res.json({
      success: true,
      message: "Call initiated",
      data: result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Call failed",
    });
  }
});

// ─────────────────────────────────────────────────────
// 5. HEALTH CHECK
// ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Voice server running ");
});

// ─────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});