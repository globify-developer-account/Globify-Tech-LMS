import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { prisma } from "@/server/db/prisma";
import { generateToken } from "@/server/auth/password";
import { emailLayout, emailProvider } from "@/server/providers/email";
import { enforceRateLimit } from "@/server/rate-limit";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * POST /api/v1/auth/forgot-password — emails a reset link. Always answers
 * success so accounts cannot be enumerated; the link opens the website's
 * reset page, which also works from a phone.
 */
export const POST = handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await enforceRateLimit(`reset:${ip}`, 5, 900);
  const { email } = z.object({ email: z.string().email() }).parse(await readJson(req));
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, name: true, email: true, status: true } });
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
  return jsonOk({ sent: true });
});
