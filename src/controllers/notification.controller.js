import mongoose from "mongoose";

import { Notification } from "../models/notification.model.js";

import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

//====================== getMyNotifications ============================//

const getMyNotifications = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const rawPage = req.query.page;
    const rawLimit = req.query.limit;
    const rawIsRead = req.query.isRead;

    //====================== PAGINATION ============================//

    let page = 1;
    let limit = 20;

    if (rawPage !== undefined) {
        if (
            typeof rawPage !== "string" ||
            !/^[1-9]\d*$/.test(rawPage)
        ) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }

        page = Number(rawPage);

        if (!Number.isSafeInteger(page)) {
            throw new ApiError(
                400,
                "Page value is too large"
            );
        }
    }

    if (rawLimit !== undefined) {
        if (
            typeof rawLimit !== "string" ||
            !/^[1-9]\d*$/.test(rawLimit)
        ) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        limit = Number(rawLimit);

        if (!Number.isSafeInteger(limit)) {
            throw new ApiError(
                400,
                "Limit value is too large"
            );
        }

        // Maximum 50 notifications per request
        limit = Math.min(limit, 50);
    }

    //====================== FILTER ============================//

    const filter = {
        recipient: userId,
    };

    if (rawIsRead !== undefined) {
        if (
            rawIsRead !== "true" &&
            rawIsRead !== "false"
        ) {
            throw new ApiError(
                400,
                "isRead must be either true or false"
            );
        }

        filter.isRead = rawIsRead === "true";
    }

    //====================== PAGINATION ============================//

    const skip = (page - 1) * limit;

    const [notifications, totalNotifications, unreadCount] =
        await Promise.all([
            Notification.find(filter)
                .populate({
                    path: "actor",
                    select: "_id username fullName avatar",
                })
                .sort({
                    createdAt: -1,
                    _id: -1,
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            Notification.countDocuments(filter),

            Notification.countDocuments({
                recipient: userId,
                isRead: false,
            }),
        ]);

    //====================== PAGINATION INFO ============================//

    const totalPages =
        totalNotifications === 0
            ? 0
            : Math.ceil(totalNotifications / limit);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                notifications,

                pagination: {
                    currentPage: page,
                    limit,
                    totalNotifications,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },

                unreadCount,
            },
            "Notifications fetched successfully"
        )
    );
});

//====================== getUnreadNotifications ============================//

const getUnreadNotifications = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const rawPage = req.query.page;
    const rawLimit = req.query.limit;

    let page = 1;
    let limit = 20;

    //====================== PAGE ============================//

    if (rawPage !== undefined) {
        if (
            typeof rawPage !== "string" ||
            !/^[1-9]\d*$/.test(rawPage)
        ) {
            throw new ApiError(
                400,
                "Page must be a positive integer"
            );
        }

        page = Number(rawPage);

        if (!Number.isSafeInteger(page)) {
            throw new ApiError(
                400,
                "Page value is too large"
            );
        }
    }

    //====================== LIMIT ============================//

    if (rawLimit !== undefined) {
        if (
            typeof rawLimit !== "string" ||
            !/^[1-9]\d*$/.test(rawLimit)
        ) {
            throw new ApiError(
                400,
                "Limit must be a positive integer"
            );
        }

        limit = Number(rawLimit);

        if (!Number.isSafeInteger(limit)) {
            throw new ApiError(
                400,
                "Limit value is too large"
            );
        }

        limit = Math.min(limit, 50);
    }

    //====================== QUERY ============================//

    const filter = {
        recipient: userId,
        isRead: false,
    };

    const skip = (page - 1) * limit;

    const [notifications, totalUnread] = await Promise.all([
        Notification.find(filter)
            .populate({
                path: "actor",
                select: "_id username fullName avatar",
            })
            .sort({
                createdAt: -1,
                _id: -1,
            })
            .skip(skip)
            .limit(limit)
            .lean(),

        Notification.countDocuments(filter),
    ]);

    const totalPages =
        totalUnread === 0
            ? 0
            : Math.ceil(totalUnread / limit);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                notifications,

                pagination: {
                    currentPage: page,
                    limit,
                    totalUnread,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
            },
            "Unread notifications fetched successfully"
        )
    );
});

//====================== getUnreadNotificationCount ============================//

const getUnreadNotificationCount = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                unreadCount,
            },
            "Unread notification count fetched successfully"
        )
    );
});

//====================== markNotificationAsRead ============================//

const markNotificationAsRead = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { notificationId } = req.params;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!notificationId) {
        throw new ApiError(
            400,
            "Notification ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        throw new ApiError(
            400,
            "Invalid notification ID"
        );
    }

    const notification = await Notification.findOneAndUpdate(
        {
            _id: notificationId,
            recipient: userId,
            isRead: false,
        },
        {
            $set: {
                isRead: true,
                readAt: new Date(),
            },
        },
        {
            new: true,
        }
    )
        .populate({
            path: "actor",
            select: "_id username fullName avatar",
        })
        .lean();

    if (!notification) {
        throw new ApiError(
            404,
            "Unread notification not found"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            notification,
            "Notification marked as read successfully"
        )
    );
});

//====================== markAllNotificationsAsRead ============================//

const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const result = await Notification.updateMany(
        {
            recipient: userId,
            isRead: false,
        },
        {
            $set: {
                isRead: true,
                readAt: new Date(),
            },
        }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                modifiedCount: result.modifiedCount,
            },
            "All notifications marked as read successfully"
        )
    );
});

//====================== deleteNotification ============================//

const deleteNotification = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { notificationId } = req.params;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    if (!notificationId) {
        throw new ApiError(
            400,
            "Notification ID is required"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        throw new ApiError(
            400,
            "Invalid notification ID"
        );
    }

    const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId,
    });

    if (!notification) {
        throw new ApiError(
            404,
            "Notification not found"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                notificationId: notification._id,
            },
            "Notification deleted successfully"
        )
    );
});

//====================== clearAllNotifications ============================//

const clearAllNotifications = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const result = await Notification.deleteMany({
        recipient: userId,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                deletedCount: result.deletedCount,
            },
            "All notifications cleared successfully"
        )
    );
});

//====================== EXPORTS ============================//

export {
    getMyNotifications,
    getUnreadNotifications,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearAllNotifications,
};