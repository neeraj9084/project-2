import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";


dotenv.config({
    path: "./.env"
});


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        });

        console.log("File is uploaded on Cloudinary", response.url);

       
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        return response;

    } catch (error) {
        console.log("CLOUDINARY ERROR:", error);


        if (localFilePath && fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        return null;
    }
};

//================ Delete From Cloudinary =================//

const deleteFromCloudinary = async () => {
    throw new Error("Direct Cloudinary deletion is disabled; use the media cleanup queue");
};

const getCloudinaryCloudName = () => cloudinary.config().cloud_name;


export {
    getCloudinaryCloudName,
    uploadOnCloudinary,
    deleteFromCloudinary
};
