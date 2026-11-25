import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getVideoComments,
  addVideoComment,
  likeVideoComment,
  unlikeVideoComment,
} from "../services/video/commentService";

// ==================== Helpers ====================

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function getList(payload) {
  if (Array.isArray(payload)) return payload;

  const options = [
    payload?.comments,
    payload?.docs,
    payload?.results,
    payload?.data?.comments,
    payload?.data?.docs,
  ];

  return options.find(Array.isArray) || [];
}

function getCommentId(comment) {
  return String(comment?._id || comment?.id || "");
}

function getUserId(user) {
  if (!user) return "";

  if (typeof user === "string") return user;

  return String(user?._id || user?.id || "");
}

function normalizeComment(comment, currentUserId) {
  const likes = Array.isArray(comment?.likes)
    ? comment.likes
    : [];

  const isLiked = currentUserId
    ? likes.some((user) => {
        const id =
          typeof user === "object"
            ? getUserId(user)
            : String(user);

        return id === currentUserId;
      })
    : false;

  const replies = Array.isArray(comment?.replies)
    ? comment.replies.map((reply) =>
        normalizeComment(reply, currentUserId)
      )
    : [];

  return {
    ...comment,
    replies,
    likeCount:
      comment?.likeCount ??
      comment?.likesCount ??
      likes.length,
    isLiked:
      typeof comment?.isLiked === "boolean"
        ? comment.isLiked
        : isLiked,
  };
}

// Recursively update any comment at any nesting depth.
function updateCommentInTree(comments, commentId, updater) {
  return comments.map((comment) => {
    if (getCommentId(comment) === commentId) {
      return updater(comment);
    }

    if (Array.isArray(comment.replies)) {
      return {
        ...comment,
        replies: updateCommentInTree(
          comment.replies,
          commentId,
          updater
        ),
      };
    }

    return comment;
  });
}

// Recursively remove a comment from any nesting depth.
function removeCommentFromTree(comments, commentId) {
  return comments
    .filter((comment) => getCommentId(comment) !== commentId)
    .map((comment) => ({
      ...comment,
      replies: Array.isArray(comment.replies)
        ? removeCommentFromTree(comment.replies, commentId)
        : [],
    }));
}

// ==================== useVideoComments ====================

export default function useVideoComments(videoId, currentUser) {
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const requestIdRef = useRef(0);
  const submitBusyRef = useRef(false);
  const likingCommentsRef = useRef(new Set());

  const currentUserId = getUserId(currentUser);

  // ==================== Load Comments ====================

  const loadComments = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!videoId) {
      setComments([]);
      setCommentsError("Video ID is missing.");
      setCommentsLoading(false);
      return;
    }

    setCommentsLoading(true);
    setCommentsError("");

    try {
      const response = await getVideoComments(videoId);
      const items = getList(unwrap(response));

      if (requestId !== requestIdRef.current) return;

      setComments(
        items.map((comment) =>
          normalizeComment(comment, currentUserId)
        )
      );
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      setCommentsError(
        error.response?.data?.message ||
          "Unable to load comments."
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setCommentsLoading(false);
      }
    }
  }, [videoId, currentUserId]);

  useEffect(() => {
    setComments([]);
    setCommentText("");
    setCommentBusy(false);
    setCommentsError("");

    submitBusyRef.current = false;
    likingCommentsRef.current.clear();

    loadComments();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadComments]);

  // ==================== Add Top-Level Comment ====================

  const handleCommentSubmit = useCallback(
    async (event) => {
      event?.preventDefault?.();

      const content = commentText.trim();

      if (
        !videoId ||
        !content ||
        content.length > 1000 ||
        !currentUser ||
        submitBusyRef.current
      ) {
        return;
      }

      submitBusyRef.current = true;
      setCommentBusy(true);
      setCommentsError("");

      try {
        await addVideoComment(videoId, content);

        setCommentText("");
        await loadComments();
      } catch (error) {
        setCommentsError(
          error.response?.data?.message ||
            error.message ||
            "Unable to post comment."
        );
      } finally {
        submitBusyRef.current = false;
        setCommentBusy(false);
      }
    },
    [videoId, commentText, currentUser, loadComments]
  );

  // ==================== Add Reply At Any Depth ====================

  const handleReplySubmit = useCallback(
    async (parentCommentId, content) => {
      const parentId = String(parentCommentId || "").trim();
      const trimmedContent =
        typeof content === "string" ? content.trim() : "";

      if (!videoId) {
        throw new Error("Video ID is missing.");
      }

      if (!currentUser) {
        throw new Error("Please log in to reply.");
      }

      if (!parentId) {
        throw new Error("Parent comment ID is required.");
      }

      if (!trimmedContent || trimmedContent.length > 1000) {
        throw new Error(
          "Reply must contain 1 to 1000 characters."
        );
      }

      setCommentsError("");

      try {
        // The selected comment/reply ID becomes parentComment.
        await addVideoComment(
          videoId,
          trimmedContent,
          parentId
        );

        await loadComments();
      } catch (error) {
        const message =
          error.response?.data?.message ||
          error.message ||
          "Unable to post reply.";

        setCommentsError(message);
        throw error;
      }
    },
    [videoId, currentUser, loadComments]
  );

  // ==================== Like / Unlike Any Comment ====================

  const handleCommentLike = useCallback(
    async (commentId) => {
      const id = String(commentId || "");

      if (
        !id ||
        !currentUser ||
        likingCommentsRef.current.has(id)
      ) {
        return;
      }

      let targetComment = null;

      function findComment(items) {
        for (const item of items) {
          if (getCommentId(item) === id) {
            return item;
          }

          const found = findComment(
            Array.isArray(item.replies) ? item.replies : []
          );

          if (found) return found;
        }

        return null;
      }

      targetComment = findComment(comments);

      if (!targetComment) return;

      const wasLiked = Boolean(targetComment.isLiked);
      const previousCount = Number(targetComment.likeCount) || 0;

      likingCommentsRef.current.add(id);

      setComments((previous) =>
        updateCommentInTree(previous, id, (item) => ({
          ...item,
          isLiked: !wasLiked,
          likeCount: Math.max(
            0,
            previousCount + (wasLiked ? -1 : 1)
          ),
        }))
      );

      try {
        const response = wasLiked
          ? await unlikeVideoComment(id)
          : await likeVideoComment(id);

        const result = unwrap(response);

        setComments((previous) =>
          updateCommentInTree(previous, id, (item) => ({
            ...item,
            isLiked:
              typeof result?.isLiked === "boolean"
                ? result.isLiked
                : !wasLiked,
            likeCount:
              typeof result?.likeCount === "number"
                ? result.likeCount
                : item.likeCount,
          }))
        );
      } catch (error) {
        setComments((previous) =>
          updateCommentInTree(previous, id, (item) => ({
            ...item,
            isLiked: wasLiked,
            likeCount: previousCount,
          }))
        );

        setCommentsError(
          error.response?.data?.message ||
            "Unable to update comment like."
        );
      } finally {
        likingCommentsRef.current.delete(id);
      }
    },
    [comments, currentUser]
  );

  // ==================== Delete At Any Depth ====================

  const handleCommentDeleted = useCallback((commentId) => {
    const id = String(commentId || "");

    if (!id) return;

    setComments((previous) =>
      removeCommentFromTree(previous, id)
    );

    setCommentsError("");
  }, []);

  // ==================== Update At Any Depth ====================

  const handleCommentUpdated = useCallback((updatedComment) => {
    const id = getCommentId(updatedComment);

    if (!id) return;

    setComments((previous) =>
      updateCommentInTree(previous, id, (existing) => {
        const merged = {
          ...existing,
          ...updatedComment,
          owner: updatedComment.owner || existing.owner,
          replies: existing.replies || [],
        };

        return normalizeComment(
          merged,
          currentUserId
        );
      })
    );

    setCommentsError("");
  }, [currentUserId]);

  // ==================== Return ====================

  return {
    comments,
    setComments,
    commentsLoading,
    commentsError,
    setCommentsError,
    commentText,
    setCommentText,
    commentBusy,

    handleCommentSubmit,
    handleReplySubmit,
    handleCommentLike,
    handleCommentDeleted,
    handleCommentUpdated,

    loadComments,
  };
}