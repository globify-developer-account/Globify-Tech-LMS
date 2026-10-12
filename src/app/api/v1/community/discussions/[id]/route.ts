import { z } from "zod";
import { handle, jsonOk, readJson } from "@/lib/api/respond";
import { requireApiUser } from "@/server/api/principal";
import { getDiscussion, replyToDiscussion, toggleReaction } from "@/server/services/community";
import { enforceRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/v1/community/discussions/:id — one discussion with its replies and reactions. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiUser(req);
  const discussion = await getDiscussion((await ctx.params).id);
  return jsonOk(discussion);
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(1).max(20000), parentId: z.string().uuid().nullable().optional() }),
  z.object({ action: z.literal("react"), emoji: z.string().min(1).max(16), replyId: z.string().uuid().nullable().optional() }),
]);

/** POST /api/v1/community/discussions/:id — reply, or toggle a reaction on the discussion or one of its replies. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  await enforceRateLimit(`discussion-post:${user.id}`, 60, 3600);
  const { id } = await ctx.params;
  const input = bodySchema.parse(await readJson(req));
  if (input.action === "reply") {
    const reply = await replyToDiscussion({ authorId: user.id, isStaff: false, discussionId: id, parentId: input.parentId ?? null, body: input.body });
    return jsonOk({ id: reply.id });
  }
  return jsonOk(await toggleReaction({ userId: user.id, discussionId: input.replyId ? null : id, replyId: input.replyId ?? null, emoji: input.emoji }));
});
