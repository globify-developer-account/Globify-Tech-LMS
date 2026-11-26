-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `passwordHash` TEXT NULL,
    `name` TEXT NOT NULL,
    `firstName` TEXT NULL,
    `lastName` TEXT NULL,
    `avatarMediaId` CHAR(36) NULL,
    `phone` TEXT NULL,
    `whatsapp` TEXT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Karachi',
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `sessionVersion` INTEGER NOT NULL DEFAULT 1,
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_status_idx`(`status`),
    INDEX `users_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` TEXT NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` TEXT NULL,
    `scope` TEXT NULL,
    `id_token` TEXT NULL,
    `session_state` TEXT NULL,

    INDEX `accounts_userId_idx`(`userId`),
    UNIQUE INDEX `accounts_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(36) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_sessionToken_key`(`sessionToken`),
    INDEX `sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_tokens` (
    `id` CHAR(36) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `userId` CHAR(36) NULL,
    `expires` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `verification_tokens_tokenHash_key`(`tokenHash`),
    INDEX `verification_tokens_identifier_purpose_idx`(`identifier`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `key` ENUM('SUPER_ADMIN', 'ADMIN', 'ACADEMIC_MANAGER', 'ADMISSIONS_MANAGER', 'FINANCE_MANAGER', 'CONTENT_MANAGER', 'MARKETING_MANAGER', 'CAREER_MANAGER', 'INSTRUCTOR', 'TEACHING_ASSISTANT', 'COUNSELLOR', 'STUDENT', 'ALUMNI', 'EMPLOYER', 'GUEST') NOT NULL,
    `name` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `action` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_key_key`(`key`),
    INDEX `permissions_resource_idx`(`resource`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `roleId` CHAR(36) NOT NULL,
    `permissionId` CHAR(36) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `campusId` CHAR(36) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_roles_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `studentNumber` VARCHAR(191) NOT NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `gender` TEXT NULL,
    `city` TEXT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'PK',
    `address` TEXT NULL,
    `education` TEXT NULL,
    `guardianName` TEXT NULL,
    `guardianPhone` TEXT NULL,
    `bio` MEDIUMTEXT NULL,
    `headline` TEXT NULL,
    `githubUrl` TEXT NULL,
    `linkedinUrl` TEXT NULL,
    `websiteUrl` TEXT NULL,
    `cvMediaId` CHAR(36) NULL,
    `freelanceProfiles` JSON NULL,
    `campusId` CHAR(36) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `referralCode` VARCHAR(191) NULL,

    UNIQUE INDEX `students_userId_key`(`userId`),
    UNIQUE INDEX `students_studentNumber_key`(`studentNumber`),
    UNIQUE INDEX `students_referralCode_key`(`referralCode`),
    INDEX `students_campusId_idx`(`campusId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instructors` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NULL,
    `bio` MEDIUMTEXT NULL,
    `expertise` JSON NOT NULL,
    `yearsExperience` INTEGER NULL,
    `linkedinUrl` TEXT NULL,
    `websiteUrl` TEXT NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `campusId` CHAR(36) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `instructors_userId_key`(`userId`),
    UNIQUE INDEX `instructors_slug_key`(`slug`),
    INDEX `instructors_campusId_idx`(`campusId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `jobTitle` TEXT NULL,
    `department` TEXT NULL,
    `campusId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `staff_userId_key`(`userId`),
    UNIQUE INDEX `staff_employeeId_key`(`employeeId`),
    INDEX `staff_campusId_idx`(`campusId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campuses` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `address` TEXT NULL,
    `city` TEXT NOT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'PK',
    `phone` TEXT NULL,
    `email` TEXT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Karachi',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `campuses_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classrooms` (
    `id` CHAR(36) NOT NULL,
    `campusId` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 18,
    `floor` TEXT NULL,
    `equipment` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `classrooms_campusId_name_key`(`campusId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `artworkKey` VARCHAR(191) NOT NULL DEFAULT 'ai',
    `order` INTEGER NOT NULL DEFAULT 0,
    `parentId` CHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skills` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `skills_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `courses` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `subtitle` TEXT NULL,
    `description` MEDIUMTEXT NULL,
    `shortDescription` MEDIUMTEXT NULL,
    `categoryId` CHAR(36) NULL,
    `level` ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED') NOT NULL DEFAULT 'BEGINNER',
    `mode` ENUM('ON_CAMPUS', 'LIVE_ONLINE', 'HYBRID', 'SELF_PACED') NOT NULL DEFAULT 'HYBRID',
    `durationWeeks` INTEGER NULL,
    `hoursPerWeek` INTEGER NULL,
    `language` VARCHAR(191) NOT NULL DEFAULT 'en',
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountPrice` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `artworkMediaId` CHAR(36) NULL,
    `promoVideoMediaId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `outcomes` JSON NOT NULL,
    `prerequisites` JSON NOT NULL,
    `careerOutcomes` JSON NOT NULL,
    `faqs` JSON NULL,
    `seoTitle` TEXT NULL,
    `seoDescription` MEDIUMTEXT NULL,
    `ogImageMediaId` CHAR(36) NULL,
    `noindex` BOOLEAN NOT NULL DEFAULT false,
    `ratingAvg` DECIMAL(3, 2) NOT NULL DEFAULT 0,
    `ratingCount` INTEGER NOT NULL DEFAULT 0,
    `studentCount` INTEGER NOT NULL DEFAULT 0,
    `leaderboardEnabled` BOOLEAN NOT NULL DEFAULT false,
    `campusId` CHAR(36) NULL,
    `createdById` CHAR(36) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `courses_slug_key`(`slug`),
    INDEX `courses_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `courses_categoryId_idx`(`categoryId`),
    INDEX `courses_featured_idx`(`featured`),
    FULLTEXT INDEX `courses_title_subtitle_shortDescription_description_idx`(`title`, `subtitle`, `shortDescription`, `description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_skills` (
    `courseId` CHAR(36) NOT NULL,
    `skillId` CHAR(36) NOT NULL,

    PRIMARY KEY (`courseId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instructor_courses` (
    `instructorId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`instructorId`, `courseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_modules` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `course_modules_courseId_order_idx`(`courseId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_units` (
    `id` CHAR(36) NOT NULL,
    `moduleId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `course_units_moduleId_order_idx`(`moduleId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lessons` (
    `id` CHAR(36) NOT NULL,
    `unitId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `type` ENUM('VIDEO', 'TEXT', 'LIVE', 'QUIZ', 'ASSIGNMENT', 'PROJECT', 'RESOURCE') NOT NULL DEFAULT 'VIDEO',
    `content` MEDIUMTEXT NULL,
    `videoMediaId` CHAR(36) NULL,
    `videoUrl` TEXT NULL,
    `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    `order` INTEGER NOT NULL DEFAULT 0,
    `isPreview` BOOLEAN NOT NULL DEFAULT false,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `objectives` JSON NOT NULL,
    `quizId` CHAR(36) NULL,
    `assignmentId` CHAR(36) NULL,
    `projectId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lessons_quizId_key`(`quizId`),
    UNIQUE INDEX `lessons_assignmentId_key`(`assignmentId`),
    UNIQUE INDEX `lessons_projectId_key`(`projectId`),
    INDEX `lessons_unitId_order_idx`(`unitId`, `order`),
    UNIQUE INDEX `lessons_unitId_slug_key`(`unitId`, `slug`),
    FULLTEXT INDEX `lessons_title_content_idx`(`title`, `content`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_resources` (
    `id` CHAR(36) NOT NULL,
    `lessonId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `type` ENUM('FILE', 'LINK', 'VIDEO', 'CODE') NOT NULL DEFAULT 'FILE',
    `mediaId` CHAR(36) NULL,
    `url` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lesson_resources_lessonId_idx`(`lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `programs` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `subtitle` TEXT NULL,
    `description` MEDIUMTEXT NULL,
    `artworkMediaId` CHAR(36) NULL,
    `durationWeeks` INTEGER NULL,
    `price` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `status` ENUM('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `outcomes` JSON NOT NULL,
    `seoTitle` TEXT NULL,
    `seoDescription` MEDIUMTEXT NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `programs_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `program_courses` (
    `programId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`programId`, `courseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_paths` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `careerGoal` TEXT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `artworkKey` VARCHAR(191) NOT NULL DEFAULT 'ai',
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `learning_paths_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_path_steps` (
    `id` CHAR(36) NOT NULL,
    `pathId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `isOptional` BOOLEAN NOT NULL DEFAULT false,

    INDEX `learning_path_steps_pathId_order_idx`(`pathId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_completion_rules` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `requireAllLessons` BOOLEAN NOT NULL DEFAULT true,
    `minAttendancePercent` INTEGER NULL,
    `minQuizPercent` INTEGER NULL,
    `minExamPercent` INTEGER NULL,
    `requireProjects` BOOLEAN NOT NULL DEFAULT false,
    `requirePaymentClear` BOOLEAN NOT NULL DEFAULT false,
    `autoIssueCertificate` BOOLEAN NOT NULL DEFAULT true,
    `certificateValidityMonths` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `course_completion_rules_courseId_key`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_plans` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fee_plans_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_installments` (
    `id` CHAR(36) NOT NULL,
    `feePlanId` CHAR(36) NOT NULL,
    `label` TEXT NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `dueAfterDays` INTEGER NOT NULL DEFAULT 0,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `fee_installments_feePlanId_idx`(`feePlanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `rating` INTEGER NOT NULL,
    `title` TEXT NULL,
    `body` MEDIUMTEXT NULL,
    `isApproved` BOOLEAN NOT NULL DEFAULT false,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reviews_courseId_studentId_key`(`courseId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quizzes` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `timeLimitMinutes` INTEGER NULL,
    `attemptLimit` INTEGER NOT NULL DEFAULT 3,
    `passingScore` INTEGER NOT NULL DEFAULT 60,
    `negativeMarking` DECIMAL(4, 2) NOT NULL DEFAULT 0,
    `shuffleQuestions` BOOLEAN NOT NULL DEFAULT true,
    `shuffleOptions` BOOLEAN NOT NULL DEFAULT true,
    `questionsPerAttempt` INTEGER NULL,
    `showAnswersAfter` BOOLEAN NOT NULL DEFAULT true,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `availableFrom` DATETIME(3) NULL,
    `availableTo` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `quizzes_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` CHAR(36) NOT NULL,
    `quizId` CHAR(36) NULL,
    `examId` CHAR(36) NULL,
    `type` ENUM('MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'SHORT_ANSWER', 'LONG_ANSWER', 'FILL_BLANK', 'MATCHING', 'ORDERING', 'IMAGE', 'CODE') NOT NULL,
    `prompt` MEDIUMTEXT NOT NULL,
    `explanation` MEDIUMTEXT NULL,
    `imageMediaId` CHAR(36) NULL,
    `codeLanguage` TEXT NULL,
    `codeStarter` TEXT NULL,
    `topic` TEXT NULL,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL DEFAULT 'MEDIUM',
    `points` DECIMAL(6, 2) NOT NULL DEFAULT 1,
    `order` INTEGER NOT NULL DEFAULT 0,
    `answerKey` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `questions_quizId_order_idx`(`quizId`, `order`),
    INDEX `questions_examId_order_idx`(`examId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_options` (
    `id` CHAR(36) NOT NULL,
    `questionId` CHAR(36) NOT NULL,
    `text` MEDIUMTEXT NOT NULL,
    `isCorrect` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `matchKey` TEXT NULL,

    INDEX `question_options_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_attempts` (
    `id` CHAR(36) NOT NULL,
    `quizId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `attemptNumber` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED') NOT NULL DEFAULT 'IN_PROGRESS',
    `questionIds` JSON NOT NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `maxScore` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `passed` BOOLEAN NOT NULL DEFAULT false,
    `weakTopics` JSON NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `gradedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,

    INDEX `quiz_attempts_quizId_studentId_idx`(`quizId`, `studentId`),
    INDEX `quiz_attempts_enrollmentId_idx`(`enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quiz_answers` (
    `id` CHAR(36) NOT NULL,
    `attemptId` CHAR(36) NOT NULL,
    `questionId` CHAR(36) NOT NULL,
    `selectedOptionIds` JSON NOT NULL,
    `textAnswer` MEDIUMTEXT NULL,
    `structured` JSON NULL,
    `isCorrect` BOOLEAN NULL,
    `pointsAwarded` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `needsManualGrading` BOOLEAN NOT NULL DEFAULT false,
    `graderNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quiz_answers_attemptId_questionId_key`(`attemptId`, `questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubrics` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubric_criteria` (
    `id` CHAR(36) NOT NULL,
    `rubricId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `maxPoints` DECIMAL(6, 2) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `rubric_criteria_rubricId_idx`(`rubricId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignments` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `instructions` MEDIUMTEXT NULL,
    `allowedKinds` JSON NOT NULL,
    `maxPoints` DECIMAL(6, 2) NOT NULL DEFAULT 100,
    `dueAt` DATETIME(3) NULL,
    `allowLate` BOOLEAN NOT NULL DEFAULT true,
    `latePenaltyPercent` INTEGER NOT NULL DEFAULT 0,
    `rubricId` CHAR(36) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assignments_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_submissions` (
    `id` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `kind` ENUM('TEXT', 'FILE', 'URL', 'GITHUB', 'WEBSITE') NOT NULL DEFAULT 'TEXT',
    `text` MEDIUMTEXT NULL,
    `url` TEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `score` DECIMAL(6, 2) NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` CHAR(36) NULL,
    `isLate` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assignment_submissions_assignmentId_studentId_idx`(`assignmentId`, `studentId`),
    INDEX `assignment_submissions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submission_files` (
    `id` CHAR(36) NOT NULL,
    `submissionId` CHAR(36) NULL,
    `projectSubmissionId` CHAR(36) NULL,
    `mediaId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `submission_files_submissionId_idx`(`submissionId`),
    INDEX `submission_files_projectSubmissionId_idx`(`projectSubmissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_feedback` (
    `id` CHAR(36) NOT NULL,
    `submissionId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assignment_feedback_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rubric_scores` (
    `id` CHAR(36) NOT NULL,
    `criterionId` CHAR(36) NOT NULL,
    `submissionId` CHAR(36) NULL,
    `projectSubmissionId` CHAR(36) NULL,
    `points` DECIMAL(6, 2) NOT NULL,
    `comment` TEXT NULL,

    INDEX `rubric_scores_submissionId_idx`(`submissionId`),
    INDEX `rubric_scores_projectSubmissionId_idx`(`projectSubmissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `overview` TEXT NULL,
    `requirements` TEXT NULL,
    `skills` JSON NOT NULL,
    `resources` JSON NULL,
    `deadline` DATETIME(3) NULL,
    `maxPoints` DECIMAL(6, 2) NOT NULL DEFAULT 100,
    `rubricId` CHAR(36) NULL,
    `addToPortfolio` BOOLEAN NOT NULL DEFAULT true,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_milestones` (
    `id` CHAR(36) NOT NULL,
    `projectId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `dueAt` DATETIME(3) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `project_milestones_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_submissions` (
    `id` CHAR(36) NOT NULL,
    `projectId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `title` TEXT NULL,
    `description` MEDIUMTEXT NULL,
    `repoUrl` TEXT NULL,
    `liveUrl` TEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `score` DECIMAL(6, 2) NULL,
    `milestonesDone` JSON NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` CHAR(36) NULL,
    `portfolioProjectId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_submissions_portfolioProjectId_key`(`portfolioProjectId`),
    INDEX `project_submissions_projectId_studentId_idx`(`projectId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_feedback` (
    `id` CHAR(36) NOT NULL,
    `submissionId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `project_feedback_submissionId_idx`(`submissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exams` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `batchId` CHAR(36) NULL,
    `title` TEXT NOT NULL,
    `kind` ENUM('MIDTERM', 'FINAL', 'PRACTICAL', 'MOCK') NOT NULL DEFAULT 'FINAL',
    `description` MEDIUMTEXT NULL,
    `scheduledAt` DATETIME(3) NULL,
    `durationMinutes` INTEGER NOT NULL DEFAULT 60,
    `passingScore` INTEGER NOT NULL DEFAULT 50,
    `attemptLimit` INTEGER NOT NULL DEFAULT 1,
    `negativeMarking` DECIMAL(4, 2) NOT NULL DEFAULT 0,
    `shuffleQuestions` BOOLEAN NOT NULL DEFAULT true,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `exams_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_attempts` (
    `id` CHAR(36) NOT NULL,
    `examId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'EXPIRED') NOT NULL DEFAULT 'IN_PROGRESS',
    `answers` JSON NULL,
    `score` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `maxScore` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `passed` BOOLEAN NOT NULL DEFAULT false,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `gradedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,

    INDEX `exam_attempts_examId_studentId_idx`(`examId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `batchId` CHAR(36) NULL,
    `source` ENUM('ADMISSION', 'DIRECT', 'SCHOLARSHIP', 'MANUAL') NOT NULL DEFAULT 'DIRECT',
    `status` ENUM('ACTIVE', 'COMPLETED', 'PAUSED', 'DROPPED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `enrollments_courseId_status_idx`(`courseId`, `status`),
    INDEX `enrollments_batchId_idx`(`batchId`),
    UNIQUE INDEX `enrollments_studentId_courseId_key`(`studentId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_progress` (
    `id` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `lessonsCompleted` INTEGER NOT NULL DEFAULT 0,
    `lessonsTotal` INTEGER NOT NULL DEFAULT 0,
    `secondsSpent` INTEGER NOT NULL DEFAULT 0,
    `lastLessonId` CHAR(36) NULL,
    `lastActivityAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `course_progress_enrollmentId_key`(`enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_progress` (
    `id` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `lessonId` CHAR(36) NOT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `secondsSpent` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lesson_progress_lessonId_idx`(`lessonId`),
    UNIQUE INDEX `lesson_progress_enrollmentId_lessonId_key`(`enrollmentId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_progress` (
    `id` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `lessonId` CHAR(36) NOT NULL,
    `positionSeconds` INTEGER NOT NULL DEFAULT 0,
    `percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `video_progress_enrollmentId_lessonId_key`(`enrollmentId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_notes` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `lessonId` CHAR(36) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `timestampSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lesson_notes_studentId_lessonId_idx`(`studentId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_bookmarks` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `lessonId` CHAR(36) NOT NULL,
    `timestampSeconds` INTEGER NOT NULL DEFAULT 0,
    `label` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lesson_bookmarks_studentId_lessonId_idx`(`studentId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_completions` (
    `id` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finalPercent` DECIMAL(5, 2) NULL,
    `attendancePercent` DECIMAL(5, 2) NULL,
    `evaluation` JSON NOT NULL,

    UNIQUE INDEX `course_completions_enrollmentId_key`(`enrollmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batches` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `campusId` CHAR(36) NULL,
    `classroomId` CHAR(36) NULL,
    `instructorId` CHAR(36) NULL,
    `mode` ENUM('ON_CAMPUS', 'LIVE_ONLINE', 'HYBRID', 'SELF_PACED') NOT NULL DEFAULT 'HYBRID',
    `capacity` INTEGER NOT NULL DEFAULT 18,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `status` ENUM('PLANNED', 'OPEN', 'RUNNING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Karachi',
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `batches_code_key`(`code`),
    INDEX `batches_courseId_status_idx`(`courseId`, `status`),
    INDEX `batches_campusId_idx`(`campusId`),
    INDEX `batches_instructorId_idx`(`instructorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_students` (
    `batchId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,

    INDEX `batch_students_studentId_idx`(`studentId`),
    PRIMARY KEY (`batchId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch_schedule` (
    `id` CHAR(36) NOT NULL,
    `batchId` CHAR(36) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `startTime` TEXT NOT NULL,
    `endTime` TEXT NOT NULL,

    INDEX `batch_schedule_batchId_idx`(`batchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_classes` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `batchId` CHAR(36) NULL,
    `lessonId` CHAR(36) NULL,
    `hostId` CHAR(36) NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `provider` ENUM('ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'MANUAL') NOT NULL DEFAULT 'MANUAL',
    `meetingUrl` TEXT NULL,
    `meetingId` TEXT NULL,
    `meetingPasscode` TEXT NULL,
    `status` ENUM('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `notes` MEDIUMTEXT NULL,
    `aiSummary` MEDIUMTEXT NULL,
    `transcript` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `live_classes_batchId_startsAt_idx`(`batchId`, `startsAt`),
    INDEX `live_classes_startsAt_idx`(`startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_class_recordings` (
    `id` CHAR(36) NOT NULL,
    `liveClassId` CHAR(36) NOT NULL,
    `mediaId` CHAR(36) NULL,
    `url` TEXT NULL,
    `durationSeconds` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `live_class_recordings_liveClassId_idx`(`liveClassId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_class_attendance` (
    `liveClassId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,

    PRIMARY KEY (`liveClassId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` CHAR(36) NOT NULL,
    `batchId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `sessionDate` DATE NOT NULL,
    `liveClassId` CHAR(36) NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') NOT NULL DEFAULT 'PRESENT',
    `method` ENUM('MANUAL', 'QR', 'STUDENT_PORTAL', 'INSTRUCTOR_PORTAL') NOT NULL DEFAULT 'MANUAL',
    `markedById` CHAR(36) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `attendance_studentId_idx`(`studentId`),
    UNIQUE INDEX `attendance_batchId_sessionDate_studentId_key`(`batchId`, `sessionDate`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `source` ENUM('WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'PHONE', 'EVENT', 'ORGANIC') NOT NULL,
    `utmSource` TEXT NULL,
    `utmMedium` TEXT NULL,
    `utmCampaign` TEXT NULL,
    `budget` DECIMAL(12, 2) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `phone` VARCHAR(191) NULL,
    `whatsapp` TEXT NULL,
    `email` VARCHAR(191) NULL,
    `city` TEXT NULL,
    `education` TEXT NULL,
    `courseId` CHAR(36) NULL,
    `interest` TEXT NULL,
    `source` ENUM('WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'PHONE', 'EVENT', 'ORGANIC') NOT NULL DEFAULT 'WEBSITE',
    `campaignId` CHAR(36) NULL,
    `stage` ENUM('NEW', 'CONTACTED', 'COUNSELLING', 'INTERESTED', 'APPLICATION', 'APPROVED', 'FEE_PENDING', 'ENROLLED', 'LOST') NOT NULL DEFAULT 'NEW',
    `lostReason` MEDIUMTEXT NULL,
    `counsellorId` CHAR(36) NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `message` MEDIUMTEXT NULL,
    `preferredMode` ENUM('ON_CAMPUS', 'LIVE_ONLINE', 'HYBRID', 'SELF_PACED') NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `lastContactedAt` DATETIME(3) NULL,
    `convertedUserId` CHAR(36) NULL,
    `applicationId` CHAR(36) NULL,
    `metadata` JSON NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `leads_applicationId_key`(`applicationId`),
    INDEX `leads_stage_counsellorId_idx`(`stage`, `counsellorId`),
    INDEX `leads_source_idx`(`source`),
    INDEX `leads_phone_idx`(`phone`),
    INDEX `leads_email_idx`(`email`),
    INDEX `leads_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_activities` (
    `id` CHAR(36) NOT NULL,
    `leadId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `type` ENUM('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE', 'STAGE_CHANGE', 'TASK', 'SYSTEM') NOT NULL,
    `summary` MEDIUMTEXT NOT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_activities_leadId_createdAt_idx`(`leadId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_tasks` (
    `id` CHAR(36) NOT NULL,
    `leadId` CHAR(36) NOT NULL,
    `assigneeId` CHAR(36) NULL,
    `title` TEXT NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_tasks_assigneeId_status_dueAt_idx`(`assigneeId`, `status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_notes` (
    `id` CHAR(36) NOT NULL,
    `leadId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NULL,
    `body` MEDIUMTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_notes_leadId_idx`(`leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `applications` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `applicantUserId` CHAR(36) NULL,
    `courseId` CHAR(36) NOT NULL,
    `preferredMode` ENUM('ON_CAMPUS', 'LIVE_ONLINE', 'HYBRID', 'SELF_PACED') NOT NULL DEFAULT 'HYBRID',
    `preferredBatchId` CHAR(36) NULL,
    `personal` JSON NOT NULL,
    `education` JSON NOT NULL,
    `experience` JSON NULL,
    `goals` TEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WAITLISTED', 'ENROLLED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `enrollmentId` CHAR(36) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `applications_number_key`(`number`),
    UNIQUE INDEX `applications_enrollmentId_key`(`enrollmentId`),
    INDEX `applications_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `applications_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application_documents` (
    `id` CHAR(36) NOT NULL,
    `applicationId` CHAR(36) NOT NULL,
    `kind` TEXT NOT NULL,
    `mediaId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `application_documents_applicationId_idx`(`applicationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `feePlanId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `amountPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountId` CHAR(36) NULL,
    `scholarshipAwardId` CHAR(36) NULL,
    `issuedAt` DATETIME(3) NULL,
    `dueDate` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` MEDIUMTEXT NULL,
    `issuedById` CHAR(36) NULL,
    `pdfMediaId` CHAR(36) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `invoices_number_key`(`number`),
    INDEX `invoices_studentId_idx`(`studentId`),
    INDEX `invoices_status_dueDate_idx`(`status`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_lines` (
    `id` CHAR(36) NOT NULL,
    `invoiceId` CHAR(36) NOT NULL,
    `description` MEDIUMTEXT NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitAmount` DECIMAL(12, 2) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `invoice_lines_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `invoiceId` CHAR(36) NOT NULL,
    `provider` ENUM('STRIPE', 'PAYPAL', 'JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'CASH') NOT NULL,
    `providerRef` VARCHAR(191) NULL,
    `method` TEXT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `failureReason` MEDIUMTEXT NULL,
    `recordedById` CHAR(36) NULL,
    `metadata` JSON NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payments_invoiceId_idx`(`invoiceId`),
    INDEX `payments_status_idx`(`status`),
    UNIQUE INDEX `payments_provider_providerRef_key`(`provider`, `providerRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipts` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `paymentId` CHAR(36) NOT NULL,
    `pdfMediaId` CHAR(36) NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `receipts_number_key`(`number`),
    UNIQUE INDEX `receipts_paymentId_key`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refunds` (
    `id` CHAR(36) NOT NULL,
    `invoiceId` CHAR(36) NOT NULL,
    `paymentId` CHAR(36) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `reason` MEDIUMTEXT NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING',
    `providerRef` TEXT NULL,
    `processedById` CHAR(36) NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `refunds_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discounts` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `type` ENUM('PERCENT', 'FIXED') NOT NULL DEFAULT 'PERCENT',
    `value` DECIMAL(12, 2) NOT NULL,
    `maxUses` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `courseIds` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `discounts_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scholarships` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `type` ENUM('PERCENT', 'FIXED') NOT NULL DEFAULT 'PERCENT',
    `value` DECIMAL(12, 2) NOT NULL,
    `seats` INTEGER NULL,
    `criteria` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scholarship_awards` (
    `id` CHAR(36) NOT NULL,
    `scholarshipId` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` TEXT NULL,

    UNIQUE INDEX `scholarship_awards_scholarshipId_studentId_key`(`scholarshipId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificates` (
    `id` CHAR(36) NOT NULL,
    `certificateNumber` VARCHAR(191) NOT NULL,
    `verificationCode` VARCHAR(191) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `status` ENUM('VALID', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'VALID',
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` MEDIUMTEXT NULL,
    `signedById` CHAR(36) NULL,
    `pdfMediaId` CHAR(36) NULL,
    `metadata` JSON NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `certificates_certificateNumber_key`(`certificateNumber`),
    UNIQUE INDEX `certificates_verificationCode_key`(`verificationCode`),
    UNIQUE INDEX `certificates_enrollmentId_key`(`enrollmentId`),
    INDEX `certificates_studentId_idx`(`studentId`),
    INDEX `certificates_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificate_verifications` (
    `id` CHAR(36) NOT NULL,
    `certificateId` CHAR(36) NOT NULL,
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` TEXT NULL,
    `userAgent` TEXT NULL,

    INDEX `certificate_verifications_certificateId_idx`(`certificateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employers` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `website` TEXT NULL,
    `industry` TEXT NULL,
    `city` TEXT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'PK',
    `logoMediaId` CHAR(36) NULL,
    `description` MEDIUMTEXT NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `isHiringPartner` BOOLEAN NOT NULL DEFAULT false,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employers_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employer_profiles` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `employerId` CHAR(36) NOT NULL,
    `jobTitle` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `employer_profiles_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` CHAR(36) NOT NULL,
    `employerId` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `type` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'REMOTE') NOT NULL DEFAULT 'FULL_TIME',
    `location` TEXT NULL,
    `isRemote` BOOLEAN NOT NULL DEFAULT false,
    `salaryMin` DECIMAL(12, 2) NULL,
    `salaryMax` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `postedAt` DATETIME(3) NULL,
    `closesAt` DATETIME(3) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `jobs_slug_key`(`slug`),
    INDEX `jobs_status_postedAt_idx`(`status`, `postedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internships` (
    `id` CHAR(36) NOT NULL,
    `employerId` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `durationWeeks` INTEGER NULL,
    `stipend` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PKR',
    `location` TEXT NULL,
    `isRemote` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `postedAt` DATETIME(3) NULL,
    `closesAt` DATETIME(3) NULL,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `internships_slug_key`(`slug`),
    INDEX `internships_status_postedAt_idx`(`status`, `postedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_skills` (
    `id` CHAR(36) NOT NULL,
    `jobId` CHAR(36) NULL,
    `internshipId` CHAR(36) NULL,
    `skillId` CHAR(36) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,

    INDEX `job_skills_jobId_idx`(`jobId`),
    INDEX `job_skills_internshipId_idx`(`internshipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_applications` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `jobId` CHAR(36) NULL,
    `internshipId` CHAR(36) NULL,
    `coverLetter` TEXT NULL,
    `cvMediaId` CHAR(36) NULL,
    `status` ENUM('APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'APPLIED',
    `matchScore` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_applications_studentId_idx`(`studentId`),
    INDEX `job_applications_jobId_idx`(`jobId`),
    INDEX `job_applications_internshipId_idx`(`internshipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_skills` (
    `studentId` CHAR(36) NOT NULL,
    `skillId` CHAR(36) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `source` VARCHAR(191) NOT NULL DEFAULT 'SELF',
    `verified` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`studentId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `portfolios` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `headline` TEXT NULL,
    `about` TEXT NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `showCertificates` BOOLEAN NOT NULL DEFAULT true,
    `showSkills` BOOLEAN NOT NULL DEFAULT true,
    `theme` VARCHAR(191) NOT NULL DEFAULT 'default',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `portfolios_studentId_key`(`studentId`),
    UNIQUE INDEX `portfolios_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `portfolio_projects` (
    `id` CHAR(36) NOT NULL,
    `portfolioId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `coverMediaId` CHAR(36) NULL,
    `repoUrl` TEXT NULL,
    `liveUrl` TEXT NULL,
    `skills` JSON NOT NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `portfolio_projects_portfolioId_order_idx`(`portfolioId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pages` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `status` ENUM('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `seoTitle` TEXT NULL,
    `seoDescription` MEDIUMTEXT NULL,
    `canonicalUrl` TEXT NULL,
    `ogImageMediaId` CHAR(36) NULL,
    `noindex` BOOLEAN NOT NULL DEFAULT false,
    `schemaJson` JSON NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `pages_slug_key`(`slug`),
    INDEX `pages_status_idx`(`status`),
    FULLTEXT INDEX `pages_title_seoDescription_idx`(`title`, `seoDescription`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_sections` (
    `id` CHAR(36) NOT NULL,
    `pageId` CHAR(36) NOT NULL,
    `type` ENUM('HERO', 'TEXT', 'IMAGE', 'VIDEO', 'COURSE_GRID', 'PROGRAM_GRID', 'INSTRUCTOR_GRID', 'STATS', 'TESTIMONIALS', 'FAQ', 'CTA', 'BLOG', 'GALLERY', 'TIMELINE', 'LOGO_CLOUD', 'FEATURES', 'LEARNING_PATHS', 'EVENTS', 'SUCCESS_STORIES') NOT NULL,
    `name` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `data` JSON NOT NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `page_sections_pageId_order_idx`(`pageId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `navigation` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `navigation_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `navigation_items` (
    `id` CHAR(36) NOT NULL,
    `navigationId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `label` TEXT NOT NULL,
    `href` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `openInNewTab` BOOLEAN NOT NULL DEFAULT false,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,

    INDEX `navigation_items_navigationId_order_idx`(`navigationId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_categories` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `blog_categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_tags` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,

    UNIQUE INDEX `blog_tags_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_posts` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `excerpt` TEXT NULL,
    `content` MEDIUMTEXT NULL,
    `authorId` CHAR(36) NULL,
    `categoryId` CHAR(36) NULL,
    `featuredMediaId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `readingMinutes` INTEGER NULL,
    `seoTitle` TEXT NULL,
    `seoDescription` MEDIUMTEXT NULL,
    `canonicalUrl` TEXT NULL,
    `ogImageMediaId` CHAR(36) NULL,
    `noindex` BOOLEAN NOT NULL DEFAULT false,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `blog_posts_slug_key`(`slug`),
    INDEX `blog_posts_status_publishedAt_idx`(`status`, `publishedAt`),
    FULLTEXT INDEX `blog_posts_title_excerpt_content_idx`(`title`, `excerpt`, `content`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_post_tags` (
    `postId` CHAR(36) NOT NULL,
    `tagId` CHAR(36) NOT NULL,

    PRIMARY KEY (`postId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_folders` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `parentId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(512) NOT NULL,
    `url` TEXT NOT NULL,
    `kind` ENUM('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER') NOT NULL DEFAULT 'IMAGE',
    `mime` TEXT NOT NULL,
    `size` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationSeconds` INTEGER NULL,
    `fileName` TEXT NOT NULL,
    `alt` TEXT NULL,
    `caption` TEXT NULL,
    `tags` JSON NOT NULL,
    `folderId` CHAR(36) NULL,
    `uploadedById` CHAR(36) NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `media_key_key`(`key`),
    INDEX `media_kind_idx`(`kind`),
    INDEX `media_folderId_idx`(`folderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `location` TEXT NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `meetingUrl` TEXT NULL,
    `capacity` INTEGER NULL,
    `coverMediaId` CHAR(36) NULL,
    `campusId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `events_slug_key`(`slug`),
    INDEX `events_status_startsAt_idx`(`status`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_registrations` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `name` TEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` TEXT NULL,
    `attended` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `event_registrations_eventId_email_key`(`eventId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `testimonials` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `role` TEXT NULL,
    `company` TEXT NULL,
    `quote` TEXT NOT NULL,
    `rating` INTEGER NOT NULL DEFAULT 5,
    `avatarMediaId` CHAR(36) NULL,
    `courseTitle` TEXT NULL,
    `outcome` TEXT NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isApproved` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faqs` (
    `id` CHAR(36) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` MEDIUMTEXT NOT NULL,
    `group` VARCHAR(191) NOT NULL DEFAULT 'general',
    `order` INTEGER NOT NULL DEFAULT 0,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `success_stories` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `headline` TEXT NOT NULL,
    `story` TEXT NOT NULL,
    `outcome` TEXT NULL,
    `courseTitle` TEXT NULL,
    `coverMediaId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isTestData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `success_stories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NULL,
    `isGroup` BOOLEAN NOT NULL DEFAULT false,
    `lastMessageAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `conversations_lastMessageAt_idx`(`lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_participants` (
    `conversationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReadAt` DATETIME(3) NULL,
    `isMuted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `conversation_participants_userId_idx`(`userId`),
    PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `senderId` CHAR(36) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `attachmentId` CHAR(36) NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discussions` (
    `id` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NULL,
    `batchId` CHAR(36) NULL,
    `lessonId` CHAR(36) NULL,
    `groupId` CHAR(36) NULL,
    `authorId` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `isQuestion` BOOLEAN NOT NULL DEFAULT false,
    `isResolved` BOOLEAN NOT NULL DEFAULT false,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `replyCount` INTEGER NOT NULL DEFAULT 0,
    `lastReplyAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `discussions_courseId_createdAt_idx`(`courseId`, `createdAt`),
    INDEX `discussions_batchId_createdAt_idx`(`batchId`, `createdAt`),
    INDEX `discussions_lessonId_idx`(`lessonId`),
    FULLTEXT INDEX `discussions_title_body_idx`(`title`, `body`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discussion_replies` (
    `id` CHAR(36) NOT NULL,
    `discussionId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `body` MEDIUMTEXT NOT NULL,
    `isAccepted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `discussion_replies_discussionId_createdAt_idx`(`discussionId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reactions` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `discussionId` CHAR(36) NULL,
    `replyId` CHAR(36) NULL,
    `emoji` VARCHAR(191) NOT NULL DEFAULT '👍',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `reactions_userId_discussionId_replyId_emoji_key`(`userId`, `discussionId`, `replyId`, `emoji`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NULL,
    `batchId` CHAR(36) NULL,
    `title` TEXT NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `announcements_courseId_publishedAt_idx`(`courseId`, `publishedAt`),
    INDEX `announcements_batchId_publishedAt_idx`(`batchId`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `groups` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `isPrivate` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `groups_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_members` (
    `groupId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'MEMBER',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`groupId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` CHAR(36) NOT NULL,
    `reporterId` CHAR(36) NOT NULL,
    `discussionId` CHAR(36) NULL,
    `replyId` CHAR(36) NULL,
    `reason` MEDIUMTEXT NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    `resolvedById` CHAR(36) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reports_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_conversations` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `contextType` ENUM('TUTOR', 'COURSE_BUILDER', 'ADMIN_ASSISTANT', 'SUCCESS_ENGINE', 'GENERAL') NOT NULL DEFAULT 'GENERAL',
    `courseId` CHAR(36) NULL,
    `lessonId` CHAR(36) NULL,
    `title` TEXT NULL,
    `provider` TEXT NULL,
    `model` TEXT NULL,
    `tokensUsed` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ai_conversations_userId_updatedAt_idx`(`userId`, `updatedAt`),
    INDEX `ai_conversations_userId_contextType_idx`(`userId`, `contextType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_messages` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `role` ENUM('SYSTEM', 'USER', 'ASSISTANT', 'TOOL') NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `toolCalls` JSON NULL,
    `tokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generations` (
    `id` CHAR(36) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `requestedById` CHAR(36) NOT NULL,
    `courseId` CHAR(36) NULL,
    `input` JSON NOT NULL,
    `output` JSON NOT NULL,
    `provider` TEXT NULL,
    `model` TEXT NULL,
    `status` ENUM('DRAFT', 'APPROVED', 'REJECTED', 'APPLIED') NOT NULL DEFAULT 'DRAFT',
    `approvedById` CHAR(36) NULL,
    `approvedAt` DATETIME(3) NULL,
    `appliedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ai_generations_status_kind_idx`(`status`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_risk_scores` (
    `id` CHAR(36) NOT NULL,
    `studentId` CHAR(36) NOT NULL,
    `enrollmentId` CHAR(36) NULL,
    `score` INTEGER NOT NULL,
    `level` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
    `reasons` JSON NOT NULL,
    `recommendation` TEXT NULL,
    `signals` JSON NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedById` CHAR(36) NULL,
    `acknowledgedAt` DATETIME(3) NULL,

    INDEX `student_risk_scores_studentId_computedAt_idx`(`studentId`, `computedAt`),
    INDEX `student_risk_scores_level_computedAt_idx`(`level`, `computedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_templates` (
    `id` CHAR(36) NOT NULL,
    `event` ENUM('WELCOME', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ENROLLMENT', 'PAYMENT_RECEIVED', 'PAYMENT_DUE', 'CLASS_REMINDER', 'ASSIGNMENT_DEADLINE', 'QUIZ_AVAILABLE', 'EXAM_SCHEDULED', 'CERTIFICATE_ISSUED', 'ATTENDANCE_WARNING', 'ANNOUNCEMENT', 'MESSAGE', 'APPLICATION_STATUS', 'LEAD_ASSIGNED', 'RISK_ALERT', 'BACKUP_ALERT', 'REFERRAL', 'SYSTEM') NOT NULL,
    `channel` ENUM('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH') NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `subject` TEXT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notification_templates_event_channel_locale_key`(`event`, `channel`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `event` ENUM('WELCOME', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ENROLLMENT', 'PAYMENT_RECEIVED', 'PAYMENT_DUE', 'CLASS_REMINDER', 'ASSIGNMENT_DEADLINE', 'QUIZ_AVAILABLE', 'EXAM_SCHEDULED', 'CERTIFICATE_ISSUED', 'ATTENDANCE_WARNING', 'ANNOUNCEMENT', 'MESSAGE', 'APPLICATION_STATUS', 'LEAD_ASSIGNED', 'RISK_ALERT', 'BACKUP_ALERT', 'REFERRAL', 'SYSTEM') NOT NULL,
    `channel` ENUM('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH') NOT NULL DEFAULT 'IN_APP',
    `title` TEXT NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `href` TEXT NULL,
    `data` JSON NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED', 'READ') NOT NULL DEFAULT 'QUEUED',
    `sentAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `error` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    INDEX `notifications_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `actorRoles` JSON NOT NULL,
    `action` TEXT NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip` TEXT NULL,
    `userAgent` TEXT NULL,
    `requestId` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_logs_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `group` VARCHAR(191) NOT NULL DEFAULT 'general',
    `description` MEDIUMTEXT NULL,
    `updatedById` CHAR(36) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badges` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `description` MEDIUMTEXT NULL,
    `icon` VARCHAR(191) NOT NULL DEFAULT 'award',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `badges_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_badges` (
    `userId` CHAR(36) NOT NULL,
    `badgeId` CHAR(36) NOT NULL,
    `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `context` JSON NULL,

    PRIMARY KEY (`userId`, `badgeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `streaks` (
    `userId` CHAR(36) NOT NULL,
    `current` INTEGER NOT NULL DEFAULT 0,
    `longest` INTEGER NOT NULL DEFAULT 0,
    `lastActiveDate` DATE NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_events` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerEventId` VARCHAR(191) NOT NULL,
    `type` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `error` MEDIUMTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `webhook_events_provider_providerEventId_key`(`provider`, `providerEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_activity` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `seconds` INTEGER NOT NULL DEFAULT 0,
    `lessons` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `learning_activity_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_tokens` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `token` VARCHAR(512) NOT NULL,
    `platform` ENUM('ANDROID', 'IOS') NOT NULL,
    `appVersion` TEXT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `device_tokens_token_key`(`token`),
    INDEX `device_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referrals` (
    `id` CHAR(36) NOT NULL,
    `referrerId` CHAR(36) NOT NULL,
    `refereeUserId` CHAR(36) NOT NULL,
    `code` TEXT NOT NULL,
    `status` ENUM('SIGNED_UP', 'REWARDED', 'VOID') NOT NULL DEFAULT 'SIGNED_UP',
    `friendDiscountId` CHAR(36) NULL,
    `referrerDiscountId` CHAR(36) NULL,
    `enrollmentId` CHAR(36) NULL,
    `rewardedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `referrals_refereeUserId_key`(`refereeUserId`),
    UNIQUE INDEX `referrals_friendDiscountId_key`(`friendDiscountId`),
    UNIQUE INDEX `referrals_referrerDiscountId_key`(`referrerDiscountId`),
    INDEX `referrals_referrerId_createdAt_idx`(`referrerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_avatarMediaId_fkey` FOREIGN KEY (`avatarMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_tokens` ADD CONSTRAINT `verification_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_cvMediaId_fkey` FOREIGN KEY (`cvMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructors` ADD CONSTRAINT `instructors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructors` ADD CONSTRAINT `instructors_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_artworkMediaId_fkey` FOREIGN KEY (`artworkMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_promoVideoMediaId_fkey` FOREIGN KEY (`promoVideoMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_skills` ADD CONSTRAINT `course_skills_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_skills` ADD CONSTRAINT `course_skills_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_courses` ADD CONSTRAINT `instructor_courses_instructorId_fkey` FOREIGN KEY (`instructorId`) REFERENCES `instructors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_courses` ADD CONSTRAINT `instructor_courses_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_modules` ADD CONSTRAINT `course_modules_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_units` ADD CONSTRAINT `course_units_moduleId_fkey` FOREIGN KEY (`moduleId`) REFERENCES `course_modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `course_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_videoMediaId_fkey` FOREIGN KEY (`videoMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `quizzes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_resources` ADD CONSTRAINT `lesson_resources_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_resources` ADD CONSTRAINT `lesson_resources_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `programs` ADD CONSTRAINT `programs_artworkMediaId_fkey` FOREIGN KEY (`artworkMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `program_courses` ADD CONSTRAINT `program_courses_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `programs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `program_courses` ADD CONSTRAINT `program_courses_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_steps` ADD CONSTRAINT `learning_path_steps_pathId_fkey` FOREIGN KEY (`pathId`) REFERENCES `learning_paths`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_steps` ADD CONSTRAINT `learning_path_steps_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_completion_rules` ADD CONSTRAINT `course_completion_rules_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_plans` ADD CONSTRAINT `fee_plans_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_installments` ADD CONSTRAINT `fee_installments_feePlanId_fkey` FOREIGN KEY (`feePlanId`) REFERENCES `fee_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quizzes` ADD CONSTRAINT `quizzes_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `quizzes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_imageMediaId_fkey` FOREIGN KEY (`imageMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `question_options` ADD CONSTRAINT `question_options_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_quizId_fkey` FOREIGN KEY (`quizId`) REFERENCES `quizzes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_attempts` ADD CONSTRAINT `quiz_attempts_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_answers` ADD CONSTRAINT `quiz_answers_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `quiz_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quiz_answers` ADD CONSTRAINT `quiz_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_criteria` ADD CONSTRAINT `rubric_criteria_rubricId_fkey` FOREIGN KEY (`rubricId`) REFERENCES `rubrics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_rubricId_fkey` FOREIGN KEY (`rubricId`) REFERENCES `rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_submissions` ADD CONSTRAINT `assignment_submissions_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_submissions` ADD CONSTRAINT `assignment_submissions_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_submissions` ADD CONSTRAINT `assignment_submissions_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_submissions` ADD CONSTRAINT `assignment_submissions_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_files` ADD CONSTRAINT `submission_files_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `assignment_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_files` ADD CONSTRAINT `submission_files_projectSubmissionId_fkey` FOREIGN KEY (`projectSubmissionId`) REFERENCES `project_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submission_files` ADD CONSTRAINT `submission_files_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_feedback` ADD CONSTRAINT `assignment_feedback_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `assignment_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_criterionId_fkey` FOREIGN KEY (`criterionId`) REFERENCES `rubric_criteria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `assignment_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rubric_scores` ADD CONSTRAINT `rubric_scores_projectSubmissionId_fkey` FOREIGN KEY (`projectSubmissionId`) REFERENCES `project_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_rubricId_fkey` FOREIGN KEY (`rubricId`) REFERENCES `rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_milestones` ADD CONSTRAINT `project_milestones_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_submissions` ADD CONSTRAINT `project_submissions_portfolioProjectId_fkey` FOREIGN KEY (`portfolioProjectId`) REFERENCES `portfolio_projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_feedback` ADD CONSTRAINT `project_feedback_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `project_submissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attempts` ADD CONSTRAINT `exam_attempts_examId_fkey` FOREIGN KEY (`examId`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attempts` ADD CONSTRAINT `exam_attempts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_progress` ADD CONSTRAINT `course_progress_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_progress` ADD CONSTRAINT `video_progress_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_progress` ADD CONSTRAINT `video_progress_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_notes` ADD CONSTRAINT `lesson_notes_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_notes` ADD CONSTRAINT `lesson_notes_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_bookmarks` ADD CONSTRAINT `lesson_bookmarks_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_bookmarks` ADD CONSTRAINT `lesson_bookmarks_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_completions` ADD CONSTRAINT `course_completions_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_classroomId_fkey` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batches` ADD CONSTRAINT `batches_instructorId_fkey` FOREIGN KEY (`instructorId`) REFERENCES `instructors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_students` ADD CONSTRAINT `batch_students_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_students` ADD CONSTRAINT `batch_students_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_schedule` ADD CONSTRAINT `batch_schedule_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_classes` ADD CONSTRAINT `live_classes_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_classes` ADD CONSTRAINT `live_classes_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_classes` ADD CONSTRAINT `live_classes_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_classes` ADD CONSTRAINT `live_classes_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_class_recordings` ADD CONSTRAINT `live_class_recordings_liveClassId_fkey` FOREIGN KEY (`liveClassId`) REFERENCES `live_classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_class_recordings` ADD CONSTRAINT `live_class_recordings_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_class_attendance` ADD CONSTRAINT `live_class_attendance_liveClassId_fkey` FOREIGN KEY (`liveClassId`) REFERENCES `live_classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_class_attendance` ADD CONSTRAINT `live_class_attendance_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_liveClassId_fkey` FOREIGN KEY (`liveClassId`) REFERENCES `live_classes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_markedById_fkey` FOREIGN KEY (`markedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_counsellorId_fkey` FOREIGN KEY (`counsellorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_convertedUserId_fkey` FOREIGN KEY (`convertedUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tasks` ADD CONSTRAINT `lead_tasks_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tasks` ADD CONSTRAINT `lead_tasks_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_notes` ADD CONSTRAINT `lead_notes_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_notes` ADD CONSTRAINT `lead_notes_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_applicantUserId_fkey` FOREIGN KEY (`applicantUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_preferredBatchId_fkey` FOREIGN KEY (`preferredBatchId`) REFERENCES `batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_documents` ADD CONSTRAINT `application_documents_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_documents` ADD CONSTRAINT `application_documents_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_feePlanId_fkey` FOREIGN KEY (`feePlanId`) REFERENCES `fee_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_discountId_fkey` FOREIGN KEY (`discountId`) REFERENCES `discounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_scholarshipAwardId_fkey` FOREIGN KEY (`scholarshipAwardId`) REFERENCES `scholarship_awards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_pdfMediaId_fkey` FOREIGN KEY (`pdfMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_processedById_fkey` FOREIGN KEY (`processedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scholarship_awards` ADD CONSTRAINT `scholarship_awards_scholarshipId_fkey` FOREIGN KEY (`scholarshipId`) REFERENCES `scholarships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scholarship_awards` ADD CONSTRAINT `scholarship_awards_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_enrollmentId_fkey` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_signedById_fkey` FOREIGN KEY (`signedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_pdfMediaId_fkey` FOREIGN KEY (`pdfMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certificate_verifications` ADD CONSTRAINT `certificate_verifications_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `certificates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employers` ADD CONSTRAINT `employers_logoMediaId_fkey` FOREIGN KEY (`logoMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employer_profiles` ADD CONSTRAINT `employer_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employer_profiles` ADD CONSTRAINT `employer_profiles_employerId_fkey` FOREIGN KEY (`employerId`) REFERENCES `employers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_employerId_fkey` FOREIGN KEY (`employerId`) REFERENCES `employers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_employerId_fkey` FOREIGN KEY (`employerId`) REFERENCES `employers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_skills` ADD CONSTRAINT `job_skills_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_skills` ADD CONSTRAINT `job_skills_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_skills` ADD CONSTRAINT `job_skills_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_applications` ADD CONSTRAINT `job_applications_internshipId_fkey` FOREIGN KEY (`internshipId`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_skills` ADD CONSTRAINT `student_skills_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_skills` ADD CONSTRAINT `student_skills_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `skills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portfolios` ADD CONSTRAINT `portfolios_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portfolio_projects` ADD CONSTRAINT `portfolio_projects_portfolioId_fkey` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portfolio_projects` ADD CONSTRAINT `portfolio_projects_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pages` ADD CONSTRAINT `pages_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pages` ADD CONSTRAINT `pages_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `page_sections` ADD CONSTRAINT `page_sections_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `navigation_items` ADD CONSTRAINT `navigation_items_navigationId_fkey` FOREIGN KEY (`navigationId`) REFERENCES `navigation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `navigation_items` ADD CONSTRAINT `navigation_items_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `navigation_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blog_posts` ADD CONSTRAINT `blog_posts_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blog_posts` ADD CONSTRAINT `blog_posts_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `blog_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blog_posts` ADD CONSTRAINT `blog_posts_featuredMediaId_fkey` FOREIGN KEY (`featuredMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blog_posts` ADD CONSTRAINT `blog_posts_ogImageMediaId_fkey` FOREIGN KEY (`ogImageMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blog_post_tags` ADD CONSTRAINT `blog_post_tags_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `blog_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blog_post_tags` ADD CONSTRAINT `blog_post_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `blog_tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_folders` ADD CONSTRAINT `media_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `media_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `media_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_campusId_fkey` FOREIGN KEY (`campusId`) REFERENCES `campuses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_registrations` ADD CONSTRAINT `event_registrations_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_registrations` ADD CONSTRAINT `event_registrations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `testimonials` ADD CONSTRAINT `testimonials_avatarMediaId_fkey` FOREIGN KEY (`avatarMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `success_stories` ADD CONSTRAINT `success_stories_coverMediaId_fkey` FOREIGN KEY (`coverMediaId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_attachmentId_fkey` FOREIGN KEY (`attachmentId`) REFERENCES `media`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussions` ADD CONSTRAINT `discussions_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussions` ADD CONSTRAINT `discussions_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussions` ADD CONSTRAINT `discussions_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussions` ADD CONSTRAINT `discussions_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussions` ADD CONSTRAINT `discussions_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussion_replies` ADD CONSTRAINT `discussion_replies_discussionId_fkey` FOREIGN KEY (`discussionId`) REFERENCES `discussions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussion_replies` ADD CONSTRAINT `discussion_replies_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discussion_replies` ADD CONSTRAINT `discussion_replies_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `discussion_replies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reactions` ADD CONSTRAINT `reactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reactions` ADD CONSTRAINT `reactions_discussionId_fkey` FOREIGN KEY (`discussionId`) REFERENCES `discussions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reactions` ADD CONSTRAINT `reactions_replyId_fkey` FOREIGN KEY (`replyId`) REFERENCES `discussion_replies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_discussionId_fkey` FOREIGN KEY (`discussionId`) REFERENCES `discussions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_replyId_fkey` FOREIGN KEY (`replyId`) REFERENCES `discussion_replies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_conversations` ADD CONSTRAINT `ai_conversations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_messages` ADD CONSTRAINT `ai_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generations` ADD CONSTRAINT `ai_generations_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generations` ADD CONSTRAINT `ai_generations_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generations` ADD CONSTRAINT `ai_generations_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_risk_scores` ADD CONSTRAINT `student_risk_scores_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settings` ADD CONSTRAINT `settings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_badgeId_fkey` FOREIGN KEY (`badgeId`) REFERENCES `badges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `streaks` ADD CONSTRAINT `streaks_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_tokens` ADD CONSTRAINT `device_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `students`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_refereeUserId_fkey` FOREIGN KEY (`refereeUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_friendDiscountId_fkey` FOREIGN KEY (`friendDiscountId`) REFERENCES `discounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrerDiscountId_fkey` FOREIGN KEY (`referrerDiscountId`) REFERENCES `discounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────── Emoji must compare exactly ─────────────
-- Written by hand: Prisma cannot express a per-column collation.
--
-- Under utf8mb4_unicode_ci every emoji compares equal to every other, so the
-- unique index would let a person react to a post with only one emoji, and
-- removing one reaction could remove a different one. A binary collation
-- compares the exact characters.
ALTER TABLE `reactions` MODIFY `emoji` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '👍';

-- ───────────── Records that must not change ─────────────
-- Written by hand: Prisma cannot express triggers.
--
-- Audit rows may be inserted and read, never changed or removed. The triggers
-- block UPDATE and DELETE for every account, including the application's own.
-- Deliberate retention pruning must be done by dropping the trigger first,
-- running the DELETE, and recreating it.
--
-- MySQL and MariaDB do not fire triggers for foreign-key actions, so deleting
-- a user still sets audit_logs.actorId to NULL as the schema asks.

CREATE TRIGGER `audit_logs_no_update` BEFORE UPDATE ON `audit_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: UPDATE is not permitted';

CREATE TRIGGER `audit_logs_no_delete` BEFORE DELETE ON `audit_logs` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: DELETE is not permitted';

-- Receipts are records of fact too.
CREATE TRIGGER `receipts_no_update` BEFORE UPDATE ON `receipts` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receipts are append-only: UPDATE is not permitted';
