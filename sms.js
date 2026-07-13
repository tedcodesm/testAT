import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import AfricasTalking from 'africastalking';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Debug env values
console.log('USERNAME:', process.env.AFRICASTALKING_USERNAME);
console.log(
  'API KEY EXISTS:',
  process.env.AFRICASTALKING_API_KEY ? 'YES' : 'NO'
);

const africastalking = AfricasTalking({
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME,
});

const sms = africastalking.SMS;

app.post('/send-sms', async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required',
    });
  }

  try {
    const result = await sms.send({
      to: [phoneNumber],
      message: 'Hello im devtrix test if its working!',
    });

    console.log('SMS API RESULT:', JSON.stringify(result, null, 2));

    const recipient = result?.SMSMessageData?.Recipients?.[0];
    // If recipient is blacklisted, return actionable 409 so callers can handle it
    if (recipient?.status === 'UserInBlacklist' || recipient?.statusCode === 406) {
      return res.status(409).json({
        success: false,
        message: 'Recipient is blacklisted (opted-out) and did not receive the message',
        recipient: {
          number: recipient.number,
          status: recipient.status,
          statusCode: recipient.statusCode,
          messageId: recipient.messageId,
        },
        guidance: {
          dashboard: 'Remove the number from AfricasTalking dashboard opt-outs/blacklist',
          userAction: 'Ask the recipient to opt in (e.g. reply START) per AfricasTalking flow',
        },
      });
    }

    return res.status(200).json({
      success: true,
      result,
      recipientStatus: recipient?.status,
      recipientStatusCode: recipient?.statusCode,
      messageId: recipient?.messageId,
    });
  } catch (error) {
    const atData = error.response?.data || null;
    console.error('AfricaTalking error:', JSON.stringify(atData || error.message, null, 2));

    // If AT returned a structured response, forward that so callers can act on it
    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to send SMS',
      africastalking: atData || { message: error.message },
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});