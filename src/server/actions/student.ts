"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, AppError, type ActionResult } from "@/server/errors";
import { requireStudentProfile, requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { fieldErrors, uuid } from "@/lib/validation/common";
import { submissionSchema, projectSubmissionSchema, quizSubmitSchema } from "@/lib/validation/assessment";
import { profileSchema } from "@/lib/validation/auth";
import { portfolioSchema, portfolioProjectSchema, studentSkillsSchema, jobApplySchema, careerProfileSchema } from "@/lib/validation/career";
import { discussionSchema, replySchema, reactionSchema, reportSchema, messageSchema, startConversationSchema } from "@/lib/validation/community";
import { checkoutSchema } from "@/lib/validation/finance";
import { qrAttendanceSchema } from "@/lib/validation/delivery";
import { reviewSchema } from "@/lib/validation/course";
import * as progress from "@/server/services/progress";
import * as quizzes from "@/server/services/quizzes";
import * as exams from "@/server/services/exams";
import * as assignments from "@/server/services/assignments";
import * as projects from "@/server/services/projects";
import * as career from "@/server/services/career";
import * as community from "@/server/services/community";
import * as finance from "@/server/services/finance";
import { enforceRateLimit } from "@/server/rate-limit";
import { joinLiveClass } from "@/server/services/live-classes";
import { studentCheckIn } from "@/server/services/batches";
import { markRead } from "@/server/services/notifications";
import { recomputeCourseStats } from "@/server/services/courses";
import { audit } from "@/server/audit";

// ───────────── Progress ─────────────

export async function saveVideoProgressAction(input: { lessonId: string; positionSeconds: number; percent: number; secondsWatched?: number }): Promise<ActionResult<undefined>> {
  try {
    const { user, studentId } = await requireStudentProfile();
    await progress.saveVideoProgress({ studentId, userId: user.id, ...input });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function startLessonAction(lessonId: string): Promise<ActionResult<undefined>> {
  try {
    const { user, studentId } = await requireStudentProfile();
    await progress.startLesson({ studentId, userId: user.id, lessonId });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function completeLessonAction(lessonId: string, courseId: string): Promise<ActionResult<{ percent: number; completed: number; total: number }>> {
  try {
    const { user, studentId } = await requireStudentProfile();
    const r = await progress.completeLesson({ studentId, userId: user.id, lessonId });
    revalidatePath(`/student/course/${courseId}`);
    revalidatePath("/student/dashboard");
    return ok({ percent: Number(r.progress.percent), completed: r.progress.lessonsCompleted, total: r.progress.lessonsTotal });
  } catch (error) {
    return fail(error);
  }
}

export async function saveNoteAction(input: { lessonId: string; body: string; timestampSeconds?: number | null; noteId?: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const { studentId } = await requireStudentProfile();
    if (!input.body.trim()) return fail(AppError.validation("Write something first."));
    const note = await progress.saveNote({ studentId, ...input });
    return ok({ id: note.id });
  } catch (error) {
    return fail(error);
  }
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult<undefined>> {
  try {
    const { studentId } = await requireStudentProfile();
    await progress.deleteNote(studentId, noteId);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function addBookmarkAction(input: { lessonId: string; timestampSeconds: number; label?: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const { studentId } = await requireStudentProfile();
    const b = await progress.addBookmark({ studentId, ...input });
    return ok({ id: b.id });
  } catch (error) {
    return fail(error);
  }
}

export async function removeBookmarkAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { studentId } = await requireStudentProfile();
    await progress.removeBookmark(studentId, id);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Quizzes & exams ─────────────

export async function startQuizAction(quizId: string): Promise<ActionResult<{ attemptId: string }>> {
  try {
    const { user, studentId } = await requireStudentProfile();
    const attempt = await quizzes.startAttempt({ quizId, studentId, userId: user.id });
    return ok({ attemptId: attempt.id });
  } catch (error) {
    return fail(error);
  }
}

export async function submitQuizAction(input: z.infer<typeof quizSubmitSchema>): Promise<ActionResult<Awaited<ReturnType<typeof quizzes.submitAttempt>>>> {
  const parsed = quizSubmitSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { user, studentId } = await requireStudentProfile();
    const result = await quizzes.submitAttempt({ attemptId: parsed.data.attemptId, studentId, userId: user.id, answers: parsed.data.answers });
    revalidatePath("/student/quizzes");
    revalidatePath("/student/dashboard");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function startExamAction(examId: string): Promise<ActionResult<{ attemptId: string }>> {
  try {
    const { studentId } = await requireStudentProfile();
    const attempt = await exams.startExamAttempt(examId, studentId);
    return ok({ attemptId: attempt.id });
  } catch (error) {
    return fail(error);
  }
}

export async function submitExamAction(input: z.infer<typeof quizSubmitSchema>): Promise<ActionResult<{ percent: number; passed: boolean; needsManualGrading: boolean }>> {
  const parsed = quizSubmitSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    const { result } = await exams.submitExamAttempt(parsed.data.attemptId, studentId, parsed.data.answers);
    revalidatePath("/student/exams");
    return ok({ percent: result.percent, passed: result.passed, needsManualGrading: result.needsManualGrading });
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Assignments & projects ─────────────

export async function submitAssignmentAction(input: z.infer<typeof submissionSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { user, studentId } = await requireStudentProfile();
    const s = await assignments.submitAssignment({ studentId, userId: user.id, assignmentId: parsed.data.assignmentId, kind: parsed.data.kind, text: parsed.data.text || undefined, url: parsed.data.url || undefined, mediaIds: parsed.data.mediaIds, submit: parsed.data.submit });
    revalidatePath(`/student/assignments/${parsed.data.assignmentId}`);
    revalidatePath("/student/assignments");
    return ok({ id: s.id, status: s.status });
  } catch (error) {
    return fail(error);
  }
}

export async function submitProjectAction(input: z.infer<typeof projectSubmissionSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = projectSubmissionSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { user, studentId } = await requireStudentProfile();
    const s = await projects.submitProject({ studentId, userId: user.id, projectId: parsed.data.projectId, title: parsed.data.title || undefined, description: parsed.data.description || undefined, repoUrl: parsed.data.repoUrl || undefined, liveUrl: parsed.data.liveUrl || undefined, mediaIds: parsed.data.mediaIds, milestonesDone: parsed.data.milestonesDone, submit: parsed.data.submit });
    revalidatePath(`/student/projects/${parsed.data.projectId}`);
    revalidatePath("/student/projects");
    return ok({ id: s.id, status: s.status });
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Live classes & attendance ─────────────

export async function joinLiveClassAction(liveClassId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { studentId } = await requireStudentProfile();
    const url = await joinLiveClass(liveClassId, studentId);
    return ok({ url });
  } catch (error) {
    return fail(error);
  }
}

export async function qrCheckInAction(token: string): Promise<ActionResult<undefined>> {
  const parsed = qrAttendanceSchema.safeParse({ token });
  if (!parsed.success) return fail(AppError.validation("Invalid QR code."));
  try {
    const { studentId } = await requireStudentProfile();
    await studentCheckIn(studentId, parsed.data.token);
    revalidatePath("/student/attendance");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Payments ─────────────

export async function startCheckoutAction(input: z.infer<typeof checkoutSchema>): Promise<ActionResult<Awaited<ReturnType<typeof finance.startCheckout>>>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    if (parsed.data.provider === "CASH") return fail(AppError.validation("Cash is recorded by finance staff at the campus."));
    const session = await finance.startCheckout({ invoiceId: parsed.data.invoiceId, studentId, provider: parsed.data.provider });
    return ok(session);
  } catch (error) {
    return fail(error);
  }
}

const discountCodeSchema = z.object({ invoiceId: uuid, code: z.string().trim().min(2, "Enter a code.").max(40) });

/** Student adds a discount code (offer or referral coupon) to their own unpaid invoice. */
export async function applyDiscountCodeAction(input: z.infer<typeof discountCodeSchema>): Promise<ActionResult<{ code: string; discountAmount: number; total: number }>> {
  const parsed = discountCodeSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    // Codes are guessable by trial and error; cap attempts per student.
    await enforceRateLimit(`discount-code:${studentId}`, 10, 3600);
    const result = await finance.applyDiscountToInvoice({ invoiceId: parsed.data.invoiceId, studentId, code: parsed.data.code });
    revalidatePath(`/student/payments/${parsed.data.invoiceId}`);
    revalidatePath("/student/payments");
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Career & portfolio ─────────────

export async function updateCareerProfileAction(input: z.infer<typeof careerProfileSchema>): Promise<ActionResult<undefined>> {
  const parsed = careerProfileSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    await prisma.studentProfile.update({ where: { id: studentId }, data: { headline: parsed.data.headline || null, bio: parsed.data.bio || null, githubUrl: parsed.data.githubUrl || null, linkedinUrl: parsed.data.linkedinUrl || null, websiteUrl: parsed.data.websiteUrl || null, cvMediaId: parsed.data.cvMediaId ?? null, freelanceProfiles: parsed.data.freelanceProfiles as never } });
    revalidatePath("/student/career");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function setSkillsAction(input: z.infer<typeof studentSkillsSchema>): Promise<ActionResult<undefined>> {
  const parsed = studentSkillsSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    await career.setStudentSkills(studentId, parsed.data.skills);
    revalidatePath("/student/career");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function applyToJobAction(input: z.infer<typeof jobApplySchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = jobApplySchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    const a = await career.applyToOpportunity(studentId, parsed.data);
    revalidatePath("/student/career");
    return ok({ id: a.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updatePortfolioAction(input: z.infer<typeof portfolioSchema>): Promise<ActionResult<{ username: string }>> {
  const parsed = portfolioSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    const p = await career.updatePortfolio(studentId, parsed.data);
    revalidatePath("/student/portfolio");
    revalidatePath(`/portfolio/${p.username}`);
    return ok({ username: p.username });
  } catch (error) {
    return fail(error);
  }
}

export async function upsertPortfolioProjectAction(input: z.infer<typeof portfolioProjectSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = portfolioProjectSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    const p = await career.upsertPortfolioProject(studentId, parsed.data);
    revalidatePath("/student/portfolio");
    return ok({ id: p.id });
  } catch (error) {
    return fail(error);
  }
}

export async function deletePortfolioProjectAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const { studentId } = await requireStudentProfile();
    await career.deletePortfolioProject(studentId, id);
    revalidatePath("/student/portfolio");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Community & messages ─────────────

export async function createDiscussionAction(input: z.infer<typeof discussionSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = discussionSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const user = await requireUser();
    const d = await community.createDiscussion({ authorId: user.id, isStaff: !user.roles.includes("STUDENT") && !user.roles.includes("ALUMNI"), ...parsed.data });
    revalidatePath("/student/community");
    return ok({ id: d.id });
  } catch (error) {
    return fail(error);
  }
}

export async function replyAction(input: z.infer<typeof replySchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const user = await requireUser();
    const r = await community.replyToDiscussion({ authorId: user.id, isStaff: !user.roles.includes("STUDENT"), ...parsed.data });
    revalidatePath(`/student/community/${parsed.data.discussionId}`);
    return ok({ id: r.id });
  } catch (error) {
    return fail(error);
  }
}

export async function reactAction(input: z.infer<typeof reactionSchema>): Promise<ActionResult<{ reacted: boolean }>> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation());
  try {
    const user = await requireUser();
    return ok(await community.toggleReaction({ userId: user.id, ...parsed.data }));
  } catch (error) {
    return fail(error);
  }
}

export async function reportAction(input: z.infer<typeof reportSchema>): Promise<ActionResult<undefined>> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const user = await requireUser();
    await community.fileReport({ reporterId: user.id, ...parsed.data });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function sendMessageAction(input: z.infer<typeof messageSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const user = await requireUser();
    const m = await community.sendMessage({ senderId: user.id, ...parsed.data });
    revalidatePath(`/student/messages/${parsed.data.conversationId}`);
    revalidatePath(`/instructor/messages/${parsed.data.conversationId}`);
    revalidatePath(`/admin/messages/${parsed.data.conversationId}`);
    return ok({ id: m.id });
  } catch (error) {
    return fail(error);
  }
}

export async function startConversationAction(input: z.infer<typeof startConversationSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = startConversationSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const user = await requireUser();
    const c = await community.startConversation({ userId: user.id, participantIds: parsed.data.participantIds, title: parsed.data.title || undefined, body: parsed.data.body });
    return ok({ id: c.id });
  } catch (error) {
    return fail(error);
  }
}

// ───────────── Notifications, profile, reviews ─────────────

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult<undefined>> {
  try {
    const user = await requireUser();
    await markRead(user.id, ids);
    revalidatePath("/student/notifications");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function updateProfileAction(input: z.infer<typeof profileSchema>): Promise<ActionResult<undefined>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name, phone: parsed.data.phone || null, whatsapp: parsed.data.whatsapp || null, locale: parsed.data.locale, timezone: parsed.data.timezone } });
    const student = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (student) await prisma.studentProfile.update({ where: { id: student.id }, data: { headline: parsed.data.headline || null, bio: parsed.data.bio || null, city: parsed.data.city || null, githubUrl: parsed.data.githubUrl || null, linkedinUrl: parsed.data.linkedinUrl || null, websiteUrl: parsed.data.websiteUrl || null } });
    await audit({ actorId: user.id, actorRoles: user.roles, action: "profile.update", entityType: "User", entityId: user.id });
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function updateAvatarAction(mediaId: string | null): Promise<ActionResult<undefined>> {
  try {
    const user = await requireUser();
    if (mediaId && !uuid.safeParse(mediaId).success) return fail(AppError.validation("Invalid image."));
    await prisma.user.update({ where: { id: user.id }, data: { avatarMediaId: mediaId } });
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function submitReviewAction(input: z.infer<typeof reviewSchema>): Promise<ActionResult<undefined>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const { studentId } = await requireStudentProfile();
    const enrollment = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: parsed.data.courseId } } });
    if (!enrollment) return fail(AppError.forbidden("Enroll in the course before reviewing it."));
    await prisma.review.upsert({ where: { courseId_studentId: { courseId: parsed.data.courseId, studentId } }, update: { rating: parsed.data.rating, title: parsed.data.title || null, body: parsed.data.body || null, isApproved: false }, create: { courseId: parsed.data.courseId, studentId, rating: parsed.data.rating, title: parsed.data.title || null, body: parsed.data.body || null } });
    await recomputeCourseStats(parsed.data.courseId);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}
