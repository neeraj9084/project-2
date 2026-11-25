import { useState } from "react";
import { UserRound, Send, X } from "lucide-react";

export default function CommentForm({
  currentUser = null,
  commentText = "",
  commentBusy = false,
  onCommentTextChange,
  onSubmitComment,
  onCancelComment,
}) {
  const [avatarError, setAvatarError] = useState(false);

  const fullName =
    currentUser?.fullName ||
    currentUser?.username ||
    "User";

  const avatar =
    currentUser?.avatar ||
    currentUser?.avatarUrl ||
    "";

  const hasText = commentText.trim().length > 0;

  return (
    <form
      onSubmit={onSubmitComment}
      className="mt-5 flex items-start gap-3"
    >
      {/* Profile Avatar */}
      <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-100">
          {avatar && !avatarError ? (
            <img
              src={avatar}
              alt={fullName}
              loading="lazy"
              onError={() => setAvatarError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserRound
              size={19}
              className="text-gray-500"
            />
          )}
        </div>
      </div>

      {/* Input and Actions */}
      <div className="min-w-0 flex-1">
        <textarea
          value={commentText}
          onChange={(event) =>
            onCommentTextChange?.(event.target.value)
          }
          placeholder={
            currentUser
              ? "Add a comment..."
              : "Sign in to comment"
          }
          maxLength={1000}
          rows={2}
          disabled={!currentUser || commentBusy}
          aria-label="Write a comment"
          className="block w-full resize-y border-b border-gray-300 bg-transparent px-1 py-2 text-sm leading-5 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {/* Character Count */}
        {commentText.length > 900 && (
          <p className="mt-1 text-right text-xs text-gray-500">
            {commentText.length}/1000
          </p>
        )}

        {/* Action Buttons */}
        {(hasText || commentBusy) && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {/* Cancel Button */}
            <button
              type="button"
              onClick={onCancelComment}
              disabled={commentBusy}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={15} />
              Cancel
            </button>

            {/* Transparent Glass / Water Bubble Comment Button */}
            <button
              type="submit"
              disabled={
                !currentUser ||
                !hasText ||
                commentBusy
              }
              className="
                group relative isolate inline-flex
                items-center justify-center gap-2
                overflow-hidden rounded-full
                border border-white/70
                bg-white/20
                px-5 py-2.5
                text-sm font-semibold text-black
                shadow-[inset_0_1px_1px_rgba(255,255,255,0.85),0_2px_8px_rgba(0,0,0,0.06)]
                backdrop-blur-md
                transition-all duration-300 ease-out
                hover:border-white
                hover:bg-white/60
                hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.95),0_4px_14px_rgba(0,0,0,0.10)]
                active:scale-95
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {/* Glossy bubble highlight */}
              <span
                aria-hidden="true"
                className="
                  pointer-events-none absolute inset-0 -z-10
                  rounded-full
                  bg-gradient-to-b
                  from-white/70 via-white/10 to-transparent
                  opacity-50
                  transition-opacity duration-300
                  group-hover:opacity-100
                "
              />

              {/* Soft light reflection */}
              <span
                aria-hidden="true"
                className="
                  pointer-events-none absolute -left-1/3 top-0
                  h-full w-1/3 -skew-x-12
                  bg-gradient-to-r
                  from-transparent via-white/70 to-transparent
                  opacity-0 blur-sm
                  transition-all duration-500
                  group-hover:left-full
                  group-hover:opacity-100
                "
              />

              <Send
                size={14}
                strokeWidth={1.8}
                className="shrink-0 text-black"
              />

              <span className="text-black">
                {commentBusy ? "Posting..." : "Comment"}
              </span>
            </button>
          </div>
        )}
      </div>
    </form>
  );
}