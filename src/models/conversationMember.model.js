import mongoose from "mongoose";

const conversationMemberSchema = new mongoose.Schema({

    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true,
        index: true
    },  

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },  

    role: {
        type: String,   
        enum: ["admin", "member"],  
        default: "member",
    },

    joinedAt: {
        type: Date,
        default: Date.now
    },

    isActive: {
        type: Boolean,
        default: true
    },

    lastReadAt: {
        type: Date,
        default: null
    },

    mutedUntil: {
        type: Date,
        default: null
    }
},
{
    timestamps: true,
    versionkey: false
}
);

conversationMemberSchema.index(
    { 
        conversation: 1,
         user: 1 
        }, 
        {
             unique: true 
            }
        );

  export const ConversationMember = 
  mongoose.model("ConversationMember", conversationMemberSchema);      