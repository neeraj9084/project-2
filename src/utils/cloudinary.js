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

const deleteFromCloudinary = async (
    publicId,
    resourceType = "image"
) => {
    try {

        if (!publicId) {
            return null;
        }

        const response =
            await cloudinary.uploader.destroy(
                publicId,
                {
                    resource_type: resourceType
                }
            );

        console.log(
            "Cloudinary delete response:",
            response
        );

        return response;

    } catch (error) {

        console.log(
            "CLOUDINARY DELETE ERROR:",
            error
        );

        return null;
    }
};


export {
    cloudinary,
    uploadOnCloudinary,
    deleteFromCloudinary
};