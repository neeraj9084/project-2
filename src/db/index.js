import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);


const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
            
            console.log(`\n MongoDB connected !! DB HOST:${connectionInstance.connection.host}`);
            
    } catch (error) {
        console.log("MONGODB connection error" , error);
        process.exit(1)
        
    }
}

export default connectDB