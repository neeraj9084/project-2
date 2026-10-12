import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export const sendEmail = async ({
    to,
    subject,
    text,
    html,
}) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
            text: text,
            html: html,
        });

        console.log("✅ MAIL SENT");
        console.log("MESSAGE ID:", info.messageId);
        console.log("ACCEPTED:", info.accepted);
        console.log("REJECTED:", info.rejected);
        console.log("RESPONSE:", info.response);

        return info;

    } catch (error) {
        console.log("❌ MAIL ERROR:", error);
        throw error;
    }
};