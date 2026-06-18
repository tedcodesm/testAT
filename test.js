import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
// import AfricasTalkingModule from "africastalking";
import africastalking from "africastalking";
import { connectDB } from "./lib/db.js";
import cors from "cors";


dotenv.config({ debug: true });

// ==============================
// AFRICAS TALKING CONFIG (SANDBOX)
// ==============================
//const africastalking = {
//  apiKey: process.env.AFRICASTALKING_API_KEY,
//  username: process.env.AFRICASTALKING_NAME, //  REQUIRED for sandbox
//};

const app = express();

//const AfricasTalking = AfricasTalkingModule(credentials);
//const sms = AfricasTalking.SMS;


// async function sendMessage(to, message) {
//   const options = {
//     to: [to], // must be verified in sandbox
//     message,
//     from: "AFRICASTKNG", //  sandbox sender ID
//   };

//   try {
//     const response = await sms.send(options);
//     console.log("SMS sent:", response);
//     return response;
//   } catch (error) {
//     console.error("SMS error:", error);
//     throw error;
//   }
// }

// const VoteSchema = new mongoose.Schema({
//   phone: String,
//   answer: String,
//   createdAt: { type: Date, default: Date.now },
// });
// const Vote = mongoose.model("Vote", VoteSchema);

// const ReportSchema = new mongoose.Schema({
//   phone: String,
//   category: String,
//   details: String,
//   createdAt: { type: Date, default: Date.now },
// });
// const Report = mongoose.model("Report", ReportSchema);

// // ==============================
// // APP SETUP
// // ==============================
// const app = express();
// app.use(express.urlencoded({ extended: true }));
// app.use(express.json());



// // ==============================
// // USSD ROUTE
// // ==============================
// app.post("/ussd", async (req, res) => {
//   const { phoneNumber, text } = req.body;
//   let response = "";

//   try {
//     if (text === "") {
//       response =
//         `CON Welcome to UWAZI\n` +
//         `1. Vote on upcoming bills\n` +
//         `2. Report police brutality\n` +
//         `3. Missing person\n` +
//         `4. Report corruption\n` +
//         `6. Exit`;

//     } else if (text === "1") {
//       response =
//         `CON Vote on upcoming bills:\n` +
//         `1. Housing bill\n` +
//         `2. Financial bill`;

//     } else if (text === "1*1") {
//       response = `CON Do you support the housing bill?\n1. Yes\n2. No`;

//     } else if (text === "1*1*1") {
//       await Vote.create({ phone: phoneNumber, answer: "Housing: Yes" });
//       await sendMessage(phoneNumber, "You voted YES for Housing Bill");
//       response = `END Thank you for voting YES`;

//     } else if (text === "1*1*2") {
//       await Vote.create({ phone: phoneNumber, answer: "Housing: No" });
//       await sendMessage(phoneNumber, "You voted NO for Housing Bill");
//       response = `END Thank you for voting NO`;

//     } else if (text === "2") {
//       response =
//         `CON Report police brutality:\n` +
//         `1. Describe incident`;

//     } else if (text === "2*1") {
//       response = `CON Enter description:`;

//     } else if (text.startsWith("2*1*")) {
//       const details = text.split("2*1*")[1];
//       await Report.create({
//         phone: phoneNumber,
//         category: "Incident",
//         details,
//       });

//       await sendMessage(phoneNumber, "Your report has been received");

//       response = `END Report submitted`;

//     } else if (text === "6") {
//       response = `END Goodbye`;

//     } else {
//       response = `END Invalid input`;
//     }

//   } catch (error) {
//     console.error(error);
//     response = `END Error occurred`;
//   }

//   res.set("Content-Type", "text/plain");
//   res.send(response);
// });

// // ==============================
// // RESULTS ROUTE (FIXED)
// // ==============================
// app.get("/results", async (req, res) => {
//   const votes = await Vote.find();

//   const yesVotes = votes.filter(v => v.answer.includes("Yes")).length;
//   const noVotes = votes.filter(v => v.answer.includes("No")).length;

//   res.json({ yesVotes, noVotes });
// });

// ==============================
// TEST SMS ROUTE
// ==============================

const port = process.env.PORT || 3000;

const africastalking = africastalking({
    apiKey: process.env.AFRICASTALKING_API_KEY,
    username:process.env.AFRICASTALKING_USERNAME
})

app.use(express.json());
app.use(cors());

app.post('/send-sms',async(req,res) =>{
   
    const {phoneNumber} = req.body
    if(!phoneNumber){
        return res.status(404).json({ message: 'Phone number not found' });
    }
    try{

        const result = await africastalking.SMS.send({
            from:process.env.AFRICASTALKING_SENDER_ID,//Your Alphanumeric Sender ID, it will be different
            to:phoneNumber,
            message:"Hey Welcome to Africastalking"
        });

        res.status(200).json({
            status: "success",
            data: {
                result
            }
        })

    }catch(error){
      console.log("Error",error);
      res.status(500).json({message:'An error occured while sending SMS'})
    }
})

app.listen(port,()=>{
    console.log(`Server is running on Port ${port}`)
})


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});