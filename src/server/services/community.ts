import "server-only";
import { prisma, type Prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors";
import { sanitizeRichText } from "@/lib/sanitize";
import { notify } from "./notifications";
import { slugify } from "@/lib/utils";

/** Can the user see a discussion scope? Students need enrollment/batch membership; staff pass. */
async function assertScope(userId: string, scope: { courseId?: string | null; batchId?: string | null; groupId?: string | null }, isStaff: boolean) {
  if (isStaff) return;
  const student = await prisma.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw AppError.forbidden();
  if (scope.batchId) {
    const m = await prisma.batchStudent.findUnique({ where: { batchId_studentId: { batchId: scope.batchId, studentId: student.id } } });
    if (!m || m.leftAt) throw AppError.forbidden("You're not part of this batch.");
  } else if (scope.courseId) {
    const e = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId: scope.courseId } } });
    if (!e) throw AppError.forbidden("You're not enrolled in this course.");
  } else if (scope.groupId) {
    const g = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: scope.groupId, userId } } });
    const group = await prisma.group.findUnique({ where: { id: scope.groupId } });
    if (group?.isPrivate && !g) throw AppError.forbidden("This group is private.");
  }
}

export async function createDiscussion(input: { authorId: string; isStaff: boolean; courseId?: string | null; batchId?: string | null; lessonId?: string | null; groupId?: string | null; title: string; body: string; isQuestion: boolean }) {
  await assertScope(input.authorId, input, input.isStaff);
  const requireApproval = await prisma.setting.findUnique({ where: { key: "community.requireApproval" } });
  void requireApproval;
  return prisma.discussion.create({ data: { authorId: input.authorId, courseId: input.courseId ?? null, batchId: input.batchId ?? null, lessonId: input.lessonId ?? null, groupId: input.groupId ?? null, title: input.title, body: sanitizeRichText(input.body), isQuestion: input.isQuestion } });
}

export async function replyToDiscussion(input: { authorId: string; isStaff: boolean; discussionId: string; parentId?: string | null; body: string }) {
  const d = await prisma.discussion.findUnique({ where: { id: input.discussionId }, select: { id: true, courseId: true, batchId: true, groupId: true, isLocked: true, authorId: true, title: true } });
  if (!d) throw AppError.notFound("Discussion");
  if (d.isLocked) throw AppError.conflict("This discussion is locked.");
  await assertScope(input.authorId, d, input.isStaff);
  const reply = await prisma.$transaction(async (tx) => {
    const r = await tx.discussionReply.create({ data: { discussionId: d.id, authorId: input.authorId, parentId: input.parentId ?? null, body: sanitizeRichText(input.body) } });
    await tx.discussion.update({ where: { id: d.id }, data: { replyCount: { increment: 1 }, lastReplyAt: new Date() } });
    return r;
  });
  if (d.authorId !== input.authorId) {
    await notify({ userId: d.authorId, event: "MESSAGE", data: { title: d.title }, href: `/student/community/${d.id}`, fallback: { title: `New reply on "${d.title}"`, body: input.body.replace(/<[^>]+>/g, "").slice(0, 140) }, channels: ["IN_APP"] });
  }
  return reply;
}

export async function toggleReaction(input: { userId: string; discussionId?: string | null; replyId?: string | null; emoji: string }) {
  const existing = await prisma.reaction.findFirst({ where: { userId: input.userId, discussionId: input.discussionId ?? null, replyId: input.replyId ?? null, emoji: input.emoji } });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return { reacted: false };
  }
  await prisma.reaction.create({ data: { userId: input.userId, discussionId: input.discussionId ?? null, replyId: input.replyId ?? null, emoji: input.emoji } });
  return { reacted: true };
}

export async function moderate(input: { actorId: string; discussionId?: string | null; replyId?: string | null; action: "PIN" | "UNPIN" | "LOCK" | "UNLOCK" | "RESOLVE" | "DELETE" | "ACCEPT_ANSWER" }) {
  if (input.replyId) {
    if (input.action === "DELETE") return prisma.discussionReply.update({ where: { id: input.replyId }, data: { deletedAt: new Date() } });
    if (input.action === "ACCEPT_ANSWER") {
      const r = await prisma.discussionReply.findUniqueOrThrow({ where: { id: input.replyId } });
      await prisma.$transaction([prisma.discussionReply.updateMany({ where: { discussionId: r.discussionId }, data: { isAccepted: false } }), prisma.discussionReply.update({ where: { id: r.id }, data: { isAccepted: true } }), prisma.discussion.update({ where: { id: r.discussionId }, data: { isResolved: true } })]);
      return r;
    }
    throw AppError.validation("Unsupported action for a reply.");
  }
  if (!input.discussionId) throw AppError.validation("Nothing to moderate.");
  const data: Prisma.DiscussionUpdateInput =
    input.action === "PIN" ? { isPinned: true } : input.action === "UNPIN" ? { isPinned: false } : input.action === "LOCK" ? { isLocked: true } : input.action === "UNLOCK" ? { isLocked: false } : input.action === "RESOLVE" ? { isResolved: true } : { deletedAt: new Date() };
  return prisma.discussion.update({ where: { id: input.discussionId }, data });
}

export async function fileReport(input: { reporterId: string; discussionId?: string | null; replyId?: string | null; reason: string }) {
  return prisma.report.create({ data: { reporterId: input.reporterId, discussionId: input.discussionId ?? null, replyId: input.replyId ?? null, reason: input.reason } });
}

export async function resolveReport(reportId: string, resolvedById: string, dismiss: boolean) {
  return prisma.report.update({ where: { id: reportId }, data: { status: dismiss ? "DISMISSED" : "RESOLVED", resolvedById, resolvedAt: new Date() } });
}

/** Discussions visible to a student across all their courses and batches. */
export async function feedForStudent(studentId: string, params: { courseId?: string; batchId?: string; q?: string; page?: number; pageSize?: number }) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const [enrollments, memberships, groups] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId }, select: { courseId: true } }),
    prisma.batchStudent.findMany({ where: { studentId, leftAt: null }, select: { batchId: true } }),
    prisma.studentProfile.findUnique({ where: { id: studentId }, select: { user: { select: { groupMemberships: { select: { groupId: true } } } } } }),
  ]);
  const where: Prisma.DiscussionWhereInput = {
    deletedAt: null,
    ...(params.q ? { OR: [{ title: { contains: params.q } }, { body: { contains: params.q } }] } : {}),
    ...(params.courseId ? { courseId: params.courseId } : params.batchId ? { batchId: params.batchId } : { OR: [{ courseId: { in: enrollments.map((e) => e.courseId) } }, { batchId: { in: memberships.map((m) => m.batchId) } }, { groupId: { in: groups?.user.groupMemberships.map((g) => g.groupId) ?? [] } }, { group: { isPrivate: false } }] }),
  };
  const [items, total] = await Promise.all([
    prisma.discussion.findMany({ where, orderBy: [{ isPinned: "desc" }, { lastReplyAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { author: { select: { name: true, avatar: { select: { url: true } } } }, course: { select: { title: true } }, batch: { select: { code: true } }, group: { select: { name: true } }, _count: { select: { reactions: true } } } }),
    prisma.discussion.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getDiscussion(id: string) {
  const d = await prisma.discussion.findFirst({ where: { id, deletedAt: null }, include: { author: { select: { id: true, name: true, avatar: { select: { url: true } } } }, course: { select: { id: true, title: true } }, batch: { select: { id: true, code: true } }, lesson: { select: { id: true, title: true } }, replies: { where: { deletedAt: null }, orderBy: [{ isAccepted: "desc" }, { createdAt: "asc" }], include: { author: { select: { id: true, name: true, avatar: { select: { url: true } } } }, reactions: true } }, reactions: true } });
  if (!d) throw AppError.notFound("Discussion");
  return d;
}

// ───────────── Direct messages ─────────────

export async function startConversation(input: { userId: string; participantIds: string[]; title?: string; body: string }) {
  const participants = [...new Set([input.userId, ...input.participantIds])];
  if (participants.length === 2) {
    const existing = await prisma.conversation.findFirst({ where: { isGroup: false, participants: { every: { userId: { in: participants } } }, AND: participants.map((id) => ({ participants: { some: { userId: id } } })) } });
    if (existing) {
      await sendMessage({ conversationId: existing.id, senderId: input.userId, body: input.body });
      return existing;
    }
  }
  const conversation = await prisma.conversation.create({ data: { title: input.title || null, isGroup: participants.length > 2, participants: { create: participants.map((userId) => ({ userId })) } } });
  await sendMessage({ conversationId: conversation.id, senderId: input.userId, body: input.body });
  return conversation;
}

export async function sendMessage(input: { conversationId: string; senderId: string; body: string; attachmentId?: string | null }) {
  const member = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: input.conversationId, userId: input.senderId } } });
  if (!member) throw AppError.forbidden();
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId: input.conversationId, senderId: input.senderId, body: input.body.trim(), attachmentId: input.attachmentId ?? null } });
    await tx.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: new Date() } });
    await tx.conversationParticipant.update({ where: { conversationId_userId: { conversationId: input.conversationId, userId: input.senderId } }, data: { lastReadAt: new Date() } });
    return m;
  });
  const others = await prisma.conversationParticipant.findMany({ where: { conversationId: input.conversationId, NOT: { userId: input.senderId }, isMuted: false }, select: { userId: true } });
  const sender = await prisma.user.findUnique({ where: { id: input.senderId }, select: { name: true } });
  await Promise.all(others.map((o) => notify({ userId: o.userId, event: "MESSAGE", data: { from: sender?.name ?? "" }, href: `/messages/${input.conversationId}`, fallback: { title: `Message from ${sender?.name}`, body: input.body.slice(0, 140) }, channels: ["IN_APP"] })));
  return message;
}

export async function listConversations(userId: string) {
  const rows = await prisma.conversationParticipant.findMany({ where: { userId }, include: { conversation: { include: { participants: { include: { user: { select: { id: true, name: true, avatar: { select: { url: true } } } } } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } } } }, orderBy: { conversation: { lastMessageAt: { sort: "desc", nulls: "last" } } } });
  return Promise.all(
    rows.map(async (r) => {
      const unread = await prisma.message.count({ where: { conversationId: r.conversationId, NOT: { senderId: userId }, createdAt: { gt: r.lastReadAt ?? new Date(0) } } });
      return { ...r.conversation, unread, others: r.conversation.participants.filter((p) => p.userId !== userId).map((p) => p.user), last: r.conversation.messages[0] ?? null };
    }),
  );
}

export async function getConversation(conversationId: string, userId: string) {
  const member = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!member) throw AppError.forbidden();
  const [conversation, messages] = await Promise.all([
    prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { participants: { include: { user: { select: { id: true, name: true, avatar: { select: { url: true } } } } } } } }),
    prisma.message.findMany({ where: { conversationId, deletedAt: null }, orderBy: { createdAt: "asc" }, take: 200, include: { sender: { select: { id: true, name: true, avatar: { select: { url: true } } } }, attachment: true } }),
  ]);
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: new Date() } });
  return { conversation, messages };
}

export async function unreadMessageCount(userId: string) {
  const rows = await prisma.conversationParticipant.findMany({ where: { userId }, select: { conversationId: true, lastReadAt: true } });
  let total = 0;
  for (const r of rows) total += await prisma.message.count({ where: { conversationId: r.conversationId, NOT: { senderId: userId }, createdAt: { gt: r.lastReadAt ?? new Date(0) } } });
  return total;
}

// ───────────── Announcements & groups ─────────────

export async function postAnnouncement(input: { authorId: string; courseId?: string | null; batchId?: string | null; title: string; body: string; isPinned: boolean; expiresAt?: Date | null; notify: boolean }) {
  const a = await prisma.announcement.create({ data: { authorId: input.authorId, courseId: input.courseId ?? null, batchId: input.batchId ?? null, title: input.title, body: sanitizeRichText(input.body), isPinned: input.isPinned, expiresAt: input.expiresAt ?? null } });
  if (input.notify) {
    const students = input.batchId
      ? (await prisma.batchStudent.findMany({ where: { batchId: input.batchId, leftAt: null }, select: { student: { select: { userId: true } } } })).map((b) => b.student.userId)
      : input.courseId
        ? (await prisma.enrollment.findMany({ where: { courseId: input.courseId, status: "ACTIVE" }, select: { student: { select: { userId: true } } } })).map((e) => e.student.userId)
        : (await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: "STUDENT" } } } }, select: { id: true } })).map((u) => u.id);
    await Promise.all(students.map((userId) => notify({ userId, event: "ANNOUNCEMENT", data: { title: input.title }, href: "/student/community", fallback: { title: input.title, body: input.body.replace(/<[^>]+>/g, "").slice(0, 160) } })));
  }
  return a;
}

export async function announcementsForStudent(studentId: string) {
  const [enrollments, memberships] = await Promise.all([prisma.enrollment.findMany({ where: { studentId }, select: { courseId: true } }), prisma.batchStudent.findMany({ where: { studentId, leftAt: null }, select: { batchId: true } })]);
  return prisma.announcement.findMany({
    where: {
      AND: [
        { OR: [{ courseId: null, batchId: null }, { courseId: { in: enrollments.map((e) => e.courseId) } }, { batchId: { in: memberships.map((m) => m.batchId) } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      ],
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 20,
    include: { author: { select: { name: true } }, course: { select: { title: true } }, batch: { select: { code: true } } },
  });
}

export async function upsertGroup(input: { id?: string; name: string; slug?: string; description?: string; isPrivate: boolean }, creatorId: string) {
  const data = { name: input.name, description: input.description || null, isPrivate: input.isPrivate };
  if (input.id) return prisma.group.update({ where: { id: input.id }, data });
  let slug = input.slug ?? slugify(input.name);
  let i = 2;
  while (await prisma.group.findUnique({ where: { slug } })) slug = `${slugify(input.name)}-${i++}`;
  return prisma.group.create({ data: { ...data, slug, members: { create: { userId: creatorId, role: "MODERATOR" } } } });
}

export async function joinGroup(groupId: string, userId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw AppError.notFound("Group");
  if (group.isPrivate) throw AppError.forbidden("This group is invite-only.");
  return prisma.groupMember.upsert({ where: { groupId_userId: { groupId, userId } }, update: {}, create: { groupId, userId } });
}
