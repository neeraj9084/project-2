import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";

    // Configuration
    cloudinary.config({ 
        cloud_name: process.env.COLUDINARY_CLOUD_NAME, 
        api_key: process.env.COLUDINARY_API_KEY, 
        api_secret:process.env.COLUDINARY_API_SECRET
    });

 // Upload an file
     const uploadOnCloudinary = async (locaFilePath) => {
        try {
            if (!locaFilePath) return null
            
           const response = await cloudinary.uploader.upload(locaFilePath,{
                resource_type: "auto"
            })
            console.log("file is uploaded on cloudinary",response.url);
            return response;
        } catch (error) {
            fs.unlinkSync(localFilePath)
            return null;
        }
     }
      
    export {cloudinary, uploadOnCloudinary}