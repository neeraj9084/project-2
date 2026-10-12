import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true,
    })
);

app.use(express.json({ limit: "16kb" }));

app.use(
    express.urlencoded({
        extended: true,
        limit: "16kb",
    })
);

app.use(express.static("public"));

app.use(cookieParser());


// ==================== ROUTES IMPORT ====================

import userRouter from "./routes/user.routes.js";
import authRouter from "./routes/auth.routes.js";
import videoRouter from "./routes/video.routes.js";
import likeRouter from "./routes/like.routes.js";
import commentRouter from "./routes/comment.routes.js";
import subscribeRouter from "./routes/subscribe.routes.js";
import watchHistoryRouter from "./routes/watchHistory.routes.js";
import playlistRouter from "./routes/playlist.routes.js";
import conversationRouter from "./routes/conversation.routes.js";
import shareRouter from "./routes/share.routes.js";
import conversationMemberRouter from "./routes/conversationMember.routes.js";
import messageRouter from "./routes/message.routes.js";
import messageReactionRouter from "./routes/messageReaction.routes.js";
import blockUserRouter from "./routes/blockUser.routes.js";
import adminRouter from "./routes/admin.routes.js";

import reportRouter from "./routes/report.routes.js";
import userReportRouter from "./routes/userReport.routes.js";

import copyrightClaimRouter from "./routes/copyrightClaim.routes.js";
import notificationRouter from "./routes/notification.route.js";
import momentRouter from "./routes/moment.routes.js";
import musicRouter from "./routes/music.routes.js";



// ==================== ROUTES DECLARATION ====================

app.use("/api/v1/users", userRouter);

app.use("/api/v1/users/block", blockUserRouter);

app.use("/api/v1/auth", authRouter);

app.use("/api/v1/videos", videoRouter);

app.use("/api/v1/likes", likeRouter);

app.use("/api/v1/comments", commentRouter);

app.use("/api/v1/subscribes", subscribeRouter);

app.use("/api/v1/watch-history", watchHistoryRouter);

app.use("/api/v1/playlists", playlistRouter);

app.use("/api/v1/conversations", conversationRouter);

app.use("/api/v1/shares", shareRouter);

app.use(
    "/api/v1/conversation-members",
    conversationMemberRouter
);

app.use("/api/v1/messages", messageRouter);

app.use("/api/v1/message-reactions", messageReactionRouter);

app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use(
    "/api/v1/moments",
    momentRouter
);

app.use(
    "/api/v1/music",
    musicRouter
);


// ==================== REPORT ROUTES ====================

// Video Reports
app.use("/api/v1/reports", reportRouter);

app.use("/api/v1/user-reports", userReportRouter);

// Copyright Claims
app.use("/api/v1/copyright-claims", copyrightClaimRouter);


// ==================== 404 HANDLER ====================

app.use((req, res) => {
    return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "Route not found",
        errors: [],
    });
});


// ==================== GLOBAL ERROR HANDLER ====================

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        statusCode,
        message: err.message || "Internal Server Error",
        errors: err.errors || [],
    });
});


export default app;