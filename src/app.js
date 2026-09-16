import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true 
}))

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))
app.use(cookieParser()) 
 

//routes import

import userRouter from './routes/user.routes.js'
import authRouter from "./routes/auth.routes.js";
import videoRouter from "./routes/video.routes.js";
import likeRouter from "./routes/like.routes.js";
import commentRouter from "./routes/comment.routes.js";
import subscribeRouter from "./routes/subscribe.routes.js";
import watchHistoryRouter from "./routes/watchHistory.routes.js";
import playlistRouter from "./routes/playlist.routes.js";


// routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/videos", videoRouter);
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/subscribes", subscribeRouter);
app.use("/api/v1/watch-history", watchHistoryRouter);
app.use("/api/v1/playlists", playlistRouter);


app.use((req, res) => {
    return res.status(404).json({
        success: false,
        statusCode: 404,
        message: "Route not found",
        errors: []
    });
});

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        statusCode,
        message: err.message || "Internal Server Error",
        errors: err.errors || []
    });
});

export default app;