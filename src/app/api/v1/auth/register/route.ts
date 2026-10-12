import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { createStudentAccount } from "@/server/services/users";
import { sendVerificationEmail } from "@/server/actions/auth";
import { issueMobileToken } from "@/server/api/mobile-token";
import { enforceRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { passwordProblem } from "@/server/auth/password";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(200),
  acceptTerms: z.literal(true),
  device: z.string().max(120).optional(),
});

/**
 * POST /api/v1/auth/register — student self-registration from the mobile app.
 * Creates the same account the web sign-up creates, sends the verification
 * email, and signs the new student straight in with a bearer token.
 */
export const POST = handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await enforceRateLimit(`signup:${ip}`, 5, 600);
  const input = schema.parse(await readJson(req));
  const problem = passwordProblem(input.password);
  if (problem) throw AppError.validation(problem);
  const { user } = await createStudentAccount({ name: input.name, email: input.email, password: input.password, phone: input.phone || null });
  // The account exists either way: a broken mail provider must not fail the
  // sign-up (the student can resend the verification email later).
  try {
    await sendVerificationEmail(user.id, user.email, user.name);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", msg: "signup verification email failed", err: (error as Error)?.message }));
  }
  await audit({ actorId: user.id, actorRoles: ["STUDENT"], action: "auth.signup", entityType: "User", entityId: user.id });
  return jsonOk(await issueMobileToken(user.id));
});
