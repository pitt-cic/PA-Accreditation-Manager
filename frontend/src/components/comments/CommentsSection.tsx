import { useState, useEffect } from 'react';
import { standardsApi } from '../../api/standards';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import type { Comment, CommentTargetType } from '../../types/evidence';

interface CommentsSectionProps {
  comments: Comment[];
  standardId: string;
  targetType: CommentTargetType;
  targetIndex: number | null;
  targetPath?: string;
  currentUserEmail: string;
  onCommentsChange?: (comments: Comment[]) => void;
}

/**
 * Comments section with optimistic updates and delete functionality
 */
export function CommentsSection({
  comments,
  standardId,
  targetType,
  targetIndex,
  targetPath,
  currentUserEmail,
  onCommentsChange,
}: CommentsSectionProps) {
  const [localComments, setLocalComments] = useState<Comment[]>(comments);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Sync with props when they change
  useEffect(() => {
    setLocalComments(comments);
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    const commentText = newComment.trim();
    setIsSubmitting(true);
    setNewComment('');

    // Optimistically add comment to UI immediately
    const optimisticComment: Comment = {
      comment_id: 'temp-' + Date.now(),
      author: currentUserEmail,
      initials: currentUserEmail.split('@')[0].slice(0, 2).toUpperCase(),
      time: new Date().toISOString(),
      text: commentText,
    };
    const previousComments = localComments;
    setLocalComments(prev => [...prev, optimisticComment]);

    try {
      const response = await standardsApi.addComment(standardId, targetType, targetIndex, commentText, targetPath);
      // Replace optimistic comment with real one from server
      setLocalComments(prev => prev.map(c =>
        c.comment_id === optimisticComment.comment_id ? response.comment : c
      ));
      showToast('Comment added', 'success');
      onCommentsChange?.(localComments);
    } catch (err) {
      // Rollback on error
      setLocalComments(previousComments);
      const message = err instanceof ApiError
        ? (err.data as any)?.error || err.message
        : err instanceof Error ? err.message : 'Failed to add comment';
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setDeletingId(commentId);

    // Store comment for potential rollback
    const commentToDelete = localComments.find(c => c.comment_id === commentId);
    const previousComments = localComments;

    // Optimistically remove from UI
    setLocalComments(prev => prev.filter(c => c.comment_id !== commentId));

    try {
      await standardsApi.deleteComment(standardId, commentId);
      showToast('Comment deleted', 'success');
      onCommentsChange?.(localComments.filter(c => c.comment_id !== commentId));
    } catch (err) {
      // Rollback on error
      if (commentToDelete) {
        setLocalComments(previousComments);
      }
      const message = err instanceof ApiError
        ? (err.data as any)?.error || err.message
        : err instanceof Error ? err.message : 'Failed to delete comment';
      showToast(message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="border-t border-dashed border-border pt-4 mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Comments
        </span>
        <span className="text-xs font-semibold text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded-full">
          {localComments.length}
        </span>
      </div>

      {/* Comments list */}
      {localComments.length > 0 && (
        <div className="space-y-4 mb-4">
          {localComments.map((comment) => (
            <div key={comment.comment_id} className="flex gap-3 group">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {comment.initials || comment.author.split(' ').map(n => n[0]).join('')}
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-text-primary">
                    {comment.author}
                  </span>
                  <span className="text-xs text-text-muted">
                    {comment.time}
                  </span>
                  {/* Delete button - only show for user's own comments */}
                  {comment.author === currentUserEmail && (
                    <button
                      onClick={() => handleDelete(comment.comment_id)}
                      disabled={deletingId === comment.comment_id}
                      className="text-text-muted hover:text-red-500 transition-colors p-1 -ml-1"
                      title="Delete comment"
                    >
                      {deletingId === comment.comment_id ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  {comment.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          disabled={isSubmitting}
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!newComment.trim() || isSubmitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Posting...' : 'Post'}
        </button>
      </form>
    </div>
  );
}
