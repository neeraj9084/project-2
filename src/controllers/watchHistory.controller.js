import mongoose from "mongoose";

import { WatchHistory } from "../models/watchHistory.model.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

//==================== addToWatchHistory ====================//

const addToWatchHistory = asyncHandler(async(req, res) => { 

    const { videoId } = req.params; 

    if(!videoId) { 
        throw new ApiError(400, "Video ID is required") 
    } 

    const video = await Video.findOne({
        _id: videoId,
        isPublished: true
    });

    if(!video) { 
        throw new ApiError(404, "Video not found") 
    }

    const userId = req.user._id;

    const watchHistory = await WatchHistory.findOne({
        user: userId,
        video: videoId
    });

    let history;

    if(!watchHistory){
        history = await WatchHistory.create({
            user: userId,
            video: videoId
        });
    }else{
        watchHistory.watchedAt = new Date();
        history = await watchHistory.save();
    }
    
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
              history,
            "Video added to watch history successfully"
        )
    )

});

//===================== getWatchHistory ========================//

const getWatchHistory = asyncHandler(async(req, res) => {

    const userId = req.user._id;

    const history = await WatchHistory.find({
        user: userId
    })
    .populate("video")
    .sort({ watchedAt: -1 });
    
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            history,
            "Watch history fetched successfully"
        )
    );
});

//===================== removeFromWatchHistory ======================//

const removeFromWatchHistory = asyncHandler(async(req, res) => {

    const { videoId } = req.params;

    if(!videoId) {
        throw new ApiError(400, " Video ID is required")
    }
    
    const userId = req.user._id;

    const watchHistory = await WatchHistory.findOneAndDelete({
        user: userId,
        video: videoId
    })

     if(!watchHistory) {
    throw new ApiError(404, "Video not found in the watch history")
 }
  
  return res
  .status(200)
  .json(
    new ApiResponse(
        200,
         watchHistory,
        "video removed from history successfully"
    )
  )
  })

 //==================== ClearWatchHistory ============================//
 
 const  clearWatchHistory = asyncHandler(async(req, res) => {

    const userId = req.user._id;

   const result = await WatchHistory.deleteMany({
    user: userId
   });

   if(result.deletedCount === 0) {
    throw new ApiError (404, "Watch history is already empty")
   }

   return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            result,
            "Watch history cleared successfully"
        )
    );
 })
export{
    addToWatchHistory,
    getWatchHistory,
    removeFromWatchHistory,
    clearWatchHistory 

}
