import type { AdminFeedbackRow, AdminRawFeedback } from "./admin-stats";

export interface AdminFeedbacksSnapshot {
  total: number;
  feedbacks: AdminFeedbackRow[];
}

export function buildAdminFeedbacksList(
  rows: AdminRawFeedback[],
  userEmails: Map<string, string>,
  userNames: Map<string, string>,
): AdminFeedbacksSnapshot {
  const feedbacks: AdminFeedbackRow[] = rows
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((f) => ({
      id: f.id,
      userId: f.userId,
      email: userEmails.get(f.userId) ?? "",
      name: userNames.get(f.userId),
      message: f.message,
      mood: f.mood,
      source: f.source,
      createdAt: f.createdAt,
    }));

  return { total: feedbacks.length, feedbacks };
}
