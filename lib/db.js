import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
import mongoose from "mongoose";
export const connectDB = async ()=>{
    try {
     const conn  = await mongoose.connect(process.env.MONGO_URI);
        console.log(`Mongodb connected to the database ${conn.connection.host}`)
    } catch (error) {
        console.log("error connecting to database",error);

        
    }
}