import multer from "multer";
import crypto from "crypto";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./public/temp");
    },

    filename: function (req, file, cb) {
        const uniqueName =
            `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${file.originalname}`;

        cb(null, uniqueName);
    }
});


const fileFilter = (req, file, cb) => {

    if (file.fieldname === "videoFile") {

        const allowedVideoTypes = [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-matroska"
        ];

        const allowedVideoExtensions = [
            ".mp4",
            ".webm",
            ".mov",
            ".mkv"
        ]

        const extension = file.originalname
        .toLowerCase()
        .slice(file.originalname.lastIndexOf("."))

        const isValidMimeType = allowedVideoTypes.includes(file.mimetype);
         
         const isValidExtension = allowedVideoExtensions.includes(extension);

         if (!isValidMimeType && !isValidExtension) {
            return cb(
                new Error("Only MP4, WebM, MOV and MKV videos are allowed"),
                false
            );
        }
    }


    if (file.fieldname === "thumbnail") {

    const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    const allowedExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    ];

    const extension = file.originalname
        .toLowerCase()
        .slice(file.originalname.lastIndexOf("."));

    const isValidMimeType =
        allowedImageTypes.includes(file.mimetype);

    const isValidExtension =
        allowedExtensions.includes(extension);

    if (!isValidMimeType && !isValidExtension) {
        return cb(
            new Error(
                "Only JPEG, PNG and WebP images are allowed"
            ),
            false
        );
    }
}


    cb(null, true);
};


export const upload = multer({
    storage,

    limits: {
        fileSize: 500 * 1024 * 1024,
        files: 2
    },

    fileFilter
});