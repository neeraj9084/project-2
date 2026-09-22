import { BlockedUser } from "../models/blockedUser.model.js";

const isBlockedBetweenUsers = async (userA, userB) => {

    const blocked = await BlockedUser.exists({
        $or: [
            {
                blocker: userA,
                blockedUser: userB
            },
            {
                blocker: userB,
                blockedUser: userA
            }
        ]
    });

    return Boolean(blocked);
};

export {
    isBlockedBetweenUsers
};