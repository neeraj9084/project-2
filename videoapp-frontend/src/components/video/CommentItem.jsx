import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  UserRound,
  Heart,
  MoreHorizontal,
  Send,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  X,
  Check,
  CornerDownRight,
} from "lucide-react";

import {
  updateVideoComment,
  deleteVideoComment,
} from "../../services/video/commentService";

// ==================== Helpers ====================

function getOwner(comment) {
  return comment?.owner && typeof comment.owner === "object"
    ? comment.owner
    : {};
}

function getCommentId(comment) {
  return String(comment?._id || comment?.id || "");
}

function getUserId(user) {
  if (!user) return "";

  if (typeof user === "string") {
    return user;
  }

  return String(user?._id || user?.id || "");
}

function formatRelativeTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  );

  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

// ==================== Comment Item ====================

export default function CommentItem({
  comment,
  currentUser = null,
  onReplySubmit,
  onLikeComment,
  onCommentUpdated,
  onCommentDeleted,
}) {
  const navigate = useNavigate();

  const [imageError, setImageError] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment?.content || "");
  const [editBusy, setEditBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [actionError, setActionError] = useState("");

  if (!comment) return null;

  const owner = getOwner(comment);

  const name = owner.username || owner.fullName || "User";

  const username = String(owner.username || "").replace(/^@+/, "");

  const avatar = owner.avatar || owner.avatarUrl;

  const commentId = getCommentId(comment);
  const ownerId = getUserId(owner);
  const currentUserId = getUserId(currentUser);

  const isOwnComment =
    Boolean(ownerId && currentUserId) &&
    ownerId === currentUserId;

  const replies = Array.isArray(comment.replies)
    ? comment.replies
    : [];

  const likes = Array.isArray(comment.likes)
    ? comment.likes
    : [];

  const likeCount = Number(
    comment.likeCount ??
      comment.likesCount ??
      likes.length
  );

  const isLiked = Boolean(comment.isLiked);

  // ==================== Profile Navigation ====================

  function handleProfileClick() {
    if (!username) return;

    const currentUsername = String(
      currentUser?.username || ""
    ).replace(/^@+/, "");

    if (
      currentUserId &&
      currentUsername.toLowerCase() === username.toLowerCase()
    ) {
      navigate("/profile");
      return;
    }

    navigate(`/profile/${encodeURIComponent(username)}`);
  }

  // ==================== Submit Reply ====================

  async function handleReplySubmit(event) {
    event.preventDefault();

    const content = replyText.trim();

    if (
      !content ||
      content.length > 1000 ||
      !currentUser ||
      !commentId ||
      !onReplySubmit ||
      replyBusy
    ) {
      return;
    }

    setReplyBusy(true);
    setActionError("");

    try {
      // Reply to this exact comment or nested reply.
      await onReplySubmit(commentId, content);

      setReplyText("");
      setReplyOpen(false);
      setShowReplies(true);
    } catch (error) {
      setActionError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to send reply."
      );
    } finally {
      setReplyBusy(false);
    }
  }

  // ==================== Update Comment ====================

  async function handleUpdateComment(event) {
    event.preventDefault();

    const content = editText.trim();

    if (
      !commentId ||
      !content ||
      content.length > 1000 ||
      !isOwnComment ||
      editBusy
    ) {
      return;
    }

    setEditBusy(true);
    setActionError("");

    try {
      const response = await updateVideoComment(
        commentId,
        content
      );

      const updatedComment =
        response?.data?.data ?? response?.data;

      setEditing(false);

      if (typeof onCommentUpdated === "function") {
        onCommentUpdated(updatedComment);
      }
    } catch (error) {
      setActionError(
        error?.response?.data?.message ||
          "Unable to update comment."
      );
    } finally {
      setEditBusy(false);
    }
  }

  // ==================== Delete Comment ====================

  async function handleDeleteComment() {
    if (!commentId || !isOwnComment || deleteBusy) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this comment?"
    );

    if (!confirmed) return;

    setDeleteBusy(true);
    setActionError("");

    try {
      await deleteVideoComment(commentId);

      if (typeof onCommentDeleted === "function") {
        onCommentDeleted(commentId);
      }

      setMenuOpen(false);
    } catch (error) {
      setActionError(
        error?.response?.data?.message ||
          "Unable to delete comment."
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  // ==================== Render ====================

  return (
    <div
      className="w-full min-w-0"
      data-comment-id={commentId}
    >
      {/* Comment Row */}
      <article className="flex w-full min-w-0 items-start gap-2.5">
        {/* Avatar */}
        <button
          type="button"
          onClick={handleProfileClick}
          disabled={!username}
          aria-label={`Open ${name}'s profile`}
          className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]"
        >
          <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-gray-100">
            {avatar && !imageError ? (
              <img
                src={avatar}
                alt={name}
                loading="lazy"
                onError={() => setImageError(true)}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <UserRound
                  size={20}
                  className="text-gray-500"
                />
              </div>
            )}
          </div>
        </button>

        {/* Comment Details */}
        <div className="min-w-0 flex-1">
          {/* Username: no blue verification tick */}
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <button
              type="button"
              onClick={handleProfileClick}
              disabled={!username}
              className="text-sm font-semibold text-gray-950 hover:underline"
            >
              {name}
            </button>

            {username && (
              <button
                type="button"
                onClick={handleProfileClick}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                @{username}
              </button>
            )}
          </div>

          {/* Comment Text / Edit Form */}
          {editing ? (
            <form
              onSubmit={handleUpdateComment}
              className="mt-2 space-y-2"
            >
              <textarea
                value={editText}
                onChange={(event) =>
                  setEditText(event.target.value)
                }
                maxLength={1000}
                rows={3}
                autoFocus
                disabled={editBusy}
                className="w-full resize-y rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              />

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!editText.trim() || editBusy}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Check size={14} />
                  {editBusy ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditText(comment.content || "");
                    setActionError("");
                  }}
                  disabled={editBusy}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-gray-900">
              {comment.content || ""}
            </p>
          )}

          {/* Time and Actions */}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-500">
            <time dateTime={comment.createdAt}>
              {formatRelativeTime(comment.createdAt)}
            </time>

            {likeCount > 0 && (
              <span>
                {likeCount} {likeCount === 1 ? "like" : "likes"}
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setReplyOpen((open) => !open);
                setActionError("");
              }}
              className="transition hover:text-gray-900"
            >
              Reply
            </button>

            {/* More Menu */}
            <div className="relative">
              <button
                type="button"
                aria-label="More comment options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="rounded-full transition hover:text-gray-900"
              >
                <MoreHorizontal size={18} />
              </button>

              {menuOpen && (
                <div className="absolute left-0 top-6 z-20 min-w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {isOwnComment && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(true);
                          setEditText(comment.content || "");
                          setMenuOpen(false);
                          setActionError("");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil size={14} />
                        Edit comment
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteComment}
                        disabled={deleteBusy}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {deleteBusy ? "Deleting..." : "Delete comment"}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="w-full px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Close menu
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Reply Input */}
          {replyOpen && (
            <form
              onSubmit={handleReplySubmit}
              className="mt-3 flex items-center gap-2"
            >
              <input
                type="text"
                value={replyText}
                onChange={(event) => {
                  setReplyText(event.target.value);
                  setActionError("");
                }}
                placeholder={
                  currentUser
                    ? `Reply to ${name}...`
                    : "Sign in to reply"
                }
                maxLength={1000}
                disabled={
                  !currentUser ||
                  replyBusy ||
                  !onReplySubmit
                }
                className="min-w-0 flex-1 border-b border-gray-300 bg-transparent py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 disabled:opacity-50"
              />

              <button
                type="submit"
                aria-label="Send reply"
                disabled={
                  !currentUser ||
                  !replyText.trim() ||
                  replyBusy ||
                  !onReplySubmit
                }
                className="rounded-full p-2 text-gray-900 transition hover:bg-gray-100 disabled:opacity-40"
              >
                <Send
                  size={16}
                  className={replyBusy ? "animate-pulse" : ""}
                />
              </button>
            </form>
          )}

          {/* Error Message */}
          {actionError && (
            <p
              role="alert"
              className="mt-2 text-xs text-red-600"
            >
              {actionError}
            </p>
          )}

          {/* Replies Toggle */}
          {replies.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setShowReplies((show) => !show)
              }
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition hover:text-gray-900"
            >
              {showReplies ? (
                <ChevronUp size={15} />
              ) : (
                <ChevronDown size={15} />
              )}

              {showReplies ? "Hide replies" : "View replies"} (
              {replies.length})
            </button>
          )}
        </div>

        {/* Like Button */}
        <button
          type="button"
          aria-label={isLiked ? "Unlike comment" : "Like comment"}
          aria-pressed={isLiked}
          onClick={() => onLikeComment?.(commentId)}
          disabled={
            !currentUser ||
            !commentId ||
            !onLikeComment
          }
          className="mt-1 shrink-0 rounded-full p-1 text-gray-700 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Heart
            size={18}
            strokeWidth={1.8}
            className={
              isLiked ? "fill-red-500 text-red-500" : ""
            }
          />
        </button>
      </article>

      {/* Nested Replies
          Kept OUTSIDE the comment's flex row.
          No increasing left padding at deeper levels.
      */}
      {showReplies && replies.length > 0 && (
        <div className="mt-3 w-full min-w-0 space-y-3">
          {replies.map((reply) => (
            <div
              key={getCommentId(reply)}
              className="w-full min-w-0 border-l border-gray-200 pl-2"
            >
              <div className="mb-1 flex items-center gap-1 text-[11px] text-gray-400">
                <CornerDownRight size={12} />
                <span>Reply</span>
              </div>

              <CommentItem
                comment={reply}
                currentUser={currentUser}
                onReplySubmit={onReplySubmit}
                onLikeComment={onLikeComment}
                onCommentUpdated={onCommentUpdated}
                onCommentDeleted={onCommentDeleted}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}