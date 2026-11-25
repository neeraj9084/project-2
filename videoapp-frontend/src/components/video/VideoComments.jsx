import {
  MessageCircle,
  RefreshCw,
} from "lucide-react";

import CommentForm from "./CommentForm";
import CommentItem from "./CommentItem";

// ==================== Video Comments ====================

export default function VideoComments({
  comments = [],
  commentsLoading = false,
  commentsError = "",
  currentUser = null,
  commentText = "",
  commentBusy = false,
  onCommentTextChange,
  onSubmitComment,
  onCancelComment,
  onRetry,
  onReplySubmit,
  onLikeComment,
  onCommentDeleted,
  onCommentUpdated,
}) {
  const safeComments = Array.isArray(comments)
    ? comments.filter(Boolean)
    : [];

  // Count top-level comments and replies.
  const countReplies = (items) =>
    items.reduce((total, item) => {
      const replies = Array.isArray(item.replies)
        ? item.replies
        : [];

      return total + replies.length + countReplies(replies);
    }, 0);

  const totalComments =
    safeComments.length + countReplies(safeComments);

  return (
    <section className="mt-8 border-t border-gray-200 pt-5">
      {/* Heading */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-gray-950">
          Comments
        </h2>

        <span className="text-sm font-medium text-gray-500">
          {totalComments.toLocaleString("en-IN")}
        </span>
      </div>

      {/* Add Comment */}
      <CommentForm
        currentUser={currentUser}
        commentText={commentText}
        commentBusy={commentBusy}
        onCommentTextChange={onCommentTextChange}
        onSubmitComment={onSubmitComment}
        onCancelComment={onCancelComment}
      />

      {/* Loading */}
      {commentsLoading && (
        <div
          role="status"
          className="mt-6 flex items-center gap-2 text-sm text-gray-500"
        >
          <RefreshCw size={16} className="animate-spin" />
          Loading comments...
        </div>
      )}

      {/* Error */}
      {commentsError && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="text-sm text-red-600">
            {commentsError}
          </p>

          <button
            type="button"
            onClick={onRetry}
            disabled={commentsLoading}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Comments List */}
      {!commentsLoading && !commentsError && (
        <div className="mt-6 space-y-6">
          {safeComments.length === 0 ? (
            <div className="py-8 text-center">
              <MessageCircle
                size={28}
                className="mx-auto text-gray-400"
                strokeWidth={1.5}
              />

              <p className="mt-3 text-sm font-semibold text-gray-900">
                No comments yet
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Be the first to comment on this video.
              </p>
            </div>
          ) : (
            safeComments.map((comment, index) => {
              const commentId =
                comment._id ||
                comment.id ||
                `${comment.createdAt || "comment"}-${index}`;

              return (
                <CommentItem
                  key={commentId}
                  comment={comment}
                  currentUser={currentUser}
                  onReplySubmit={onReplySubmit}
                  onLikeComment={onLikeComment}
                  onCommentDeleted={onCommentDeleted}
                  onCommentUpdated={onCommentUpdated}
                />
              );
            })
          )}
        </div>
      )}
    </section>
  );
}