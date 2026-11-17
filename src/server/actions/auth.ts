"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { ok, fail, AppError, type ActionResult } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";
import { requestMeta } from "@/server/audit";
import { generateToken, hashPassword, hashToken, verifyPassword } from "@/server/auth/password";
import { createStudentAccount, bumpSessionVersion } from "@/server/services/users";
import { applyReferralAtSignup } from "@/server/services/referrals";
import { REFERRAL_COOKIE } from "@/lib/referrals";
import { emailLayout, emailProvider } from "@/server/providers/email";
import { requireUser } from "@/server/auth/session";
import { changePasswordSchema, requestResetSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors } from "@/lib/validation/common";
import { absoluteUrl } from "@/lib/utils";
import { homeForPrincipal, type RoleKey } from "@/lib/rbac";
import { audit } from "@/server/audit";
import { log } from "@/server/log";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function safeNext(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function signInAction(_prev: ActionResult<{ redirectTo: string }> | null, formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));

  const { ip } = await requestMeta();
  try {
    await enforceRateLimit(`signin:${ip ?? "unknown"}:${parsed.data.email}`, 8, 60);
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      const cause = (error.cause as { err?: Error } | undefined)?.err?.message ?? "";
      if (cause.includes("LOCKED")) return fail(new AppError("RATE_LIMITED", "Too many attempts. Please try again in 15 minutes."));
      if (cause.includes("SUSPENDED")) return fail(new AppError("FORBIDDEN", "This account is suspended. Contact support for help."));
      if (cause.includes("RATE_LIMITED")) return fail(AppError.rateLimited());
      return fail(new AppError("UNAUTHENTICATED", "That email and password combination doesn't match."));
    }
    return fail(error);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, roles: { select: { role: { select: { key: true } } } } },
  });
  const roles = (user?.roles.map((r) => r.role.key) ?? []) as RoleKey[];
  const redirectTo = safeNext(parsed.data.next) ?? homeForPrincipal({ id: user?.id ?? "", roles });
  return ok({ redirectTo });
}

export async function signUpAction(_prev: ActionResult<{ redirectTo: string }> | null, formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms") === "on",
  });
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));

  const { ip } = await requestMeta();
  try {
    await enforceRateLimit(`signup:${ip ?? "unknown"}`, 5, 600);
    const { user } = await createStudentAccount({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: parsed.data.phone || null,
    });
    // Credit the friend whose /r/:code link brought this visitor here.
    const cookieStore = await cookies();
    const referralCode = cookieStore.get(REFERRAL_COOKIE)?.value;
    if (referralCode) {
      await applyReferralAtSignup(user.id, referralCode).catch((error: Error) => log.warn("signup referral failed", { userId: user.id, error: error.message }));
      cookieStore.delete(REFERRAL_COOKIE);
    }
    await sendVerificationEmail(user.id, user.email, user.name);
    await audit({ actorId: user.id, actorRoles: ["STUDENT"], action: "auth.signup", entityType: "User", entityId: user.id });
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
    return ok({ redirectTo: "/student/dashboard" });
  } catch (error) {
    return fail(error);
  }
}

export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/");
}

export async function sendVerificationEmail(userId: string, email: string, name: string) {
  const { token, tokenHash } = generateToken();
  await prisma.verificationToken.create({
    data: { identifier: email, tokenHash, purpose: "EMAIL_VERIFY", userId, expires: new Date(Date.now() + 24 * TOKEN_TTL_MS) },
  });
  const href = absoluteUrl(`/verify-email?token=${token}`);
  await emailProvider().send({
    to: email,
    subject: "Verify your Globify Tech email",
    html: emailLayout({
      title: `Welcome, ${name.split(" ")[0]}.`,
      body: "Confirm your email address to unlock your learning space. This link is valid for 24 hours.",
      cta: { label: "Verify email", href },
    }),
    text: `Verify your email: ${href}`,
  });
}

export async function verifyEmailAction(token: string): Promise<ActionResult<undefined>> {
  try {
    const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.purpose !== "EMAIL_VERIFY" || record.usedAt || record.expires < new Date() || !record.userId) {
      return fail(AppError.validation("This verification link is invalid or has expired."));
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function resendVerificationAction(): Promise<ActionResult<undefined>> {
  try {
    const session = await requireUser();
    await enforceRateLimit(`verify-resend:${session.id}`, 3, 600);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id }, select: { email: true, name: true, emailVerifiedAt: true } });
    if (user.emailVerifiedAt) return ok(undefined);
    await sendVerificationEmail(session.id, user.email, user.name);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function requestPasswordResetAction(_prev: ActionResult<undefined> | null, formData: FormData): Promise<ActionResult<undefined>> {
  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  const { ip } = await requestMeta();
  try {
    await enforceRateLimit(`reset:${ip ?? "unknown"}`, 5, 900);
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, name: true, email: true, status: true } });
    // Always respond success to avoid account enumeration.
    if (user && user.status === "ACTIVE") {
      const { token, tokenHash } = generateToken();
      await prisma.verificationToken.create({
        data: { identifier: user.email, tokenHash, purpose: "PASSWORD_RESET", userId: user.id, expires: new Date(Date.now() + TOKEN_TTL_MS) },
      });
      const href = absoluteUrl(`/reset-password?token=${token}`);
      await emailProvider().send({
        to: user.email,
        subject: "Reset your Globify Tech password",
        html: emailLayout({
          title: "Reset your password",
          body: "We received a request to reset your password. This link is valid for one hour. If you didn't request it, you can ignore this email.",
          cta: { label: "Choose a new password", href },
        }),
        text: `Reset your password: ${href}`,
      });
    }
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function resetPasswordAction(_prev: ActionResult<undefined> | null, formData: FormData): Promise<ActionResult<undefined>> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
    if (!record || record.purpose !== "PASSWORD_RESET" || record.usedAt || record.expires < new Date() || !record.userId) {
      return fail(AppError.validation("This reset link is invalid or has expired."));
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLogins: 0, lockedUntil: null, sessionVersion: { increment: 1 }, emailVerifiedAt: new Date() },
      }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    await audit({ actorId: record.userId, action: "auth.password_reset", entityType: "User", entityId: record.userId });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function changePasswordAction(_prev: ActionResult<undefined> | null, formData: FormData): Promise<ActionResult<undefined>> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fail(AppError.validation(undefined, fieldErrors(parsed.error)));
  try {
    const session = await requireUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return fail(AppError.validation(undefined, { currentPassword: ["Current password is incorrect"] }));
    }
    await prisma.user.update({ where: { id: session.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    await audit({ actorId: session.id, actorRoles: session.roles, action: "auth.password_change", entityType: "User", entityId: session.id });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function signOutEverywhereAction(): Promise<ActionResult<undefined>> {
  try {
    const session = await requireUser();
    await bumpSessionVersion(session.id);
    log.info("auth.signout_everywhere", { userId: session.id });
    await signOut({ redirect: false });
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}
