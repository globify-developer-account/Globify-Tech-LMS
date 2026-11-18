-- Phones with the app but nobody signed in (guests) can register for push,
-- so admins can broadcast to everyone who has the app installed.
-- AlterTable
ALTER TABLE "device_tokens" ALTER COLUMN "userId" DROP NOT NULL;
