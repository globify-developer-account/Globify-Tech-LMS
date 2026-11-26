// Types for the JSON columns that hold lists. MySQL has no array columns, so
// fields such as Course.outcomes or Media.tags are stored as JSON arrays and
// `prisma-json-types-generator` (see the `json` generator in
// prisma/schema.prisma) gives them these types instead of the loose JsonValue.
import type { SubmissionKind } from "@prisma/client";

declare global {
  namespace PrismaJson {
    type StringList = string[];
    type SubmissionKindList = SubmissionKind[];
  }
}

export {};
