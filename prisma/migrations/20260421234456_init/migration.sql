-- CreateEnum
CREATE TYPE "StressLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "career" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartRateAvg" DOUBLE PRECISION NOT NULL,
    "sleepHours" DOUBLE PRECISION NOT NULL,
    "steps" INTEGER NOT NULL,
    "screenTimeMinutes" INTEGER NOT NULL,
    "socialMediaMin" INTEGER NOT NULL,
    "moodScore" INTEGER NOT NULL,
    "perceivedStress" INTEGER NOT NULL,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicLoad" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "examsPending" INTEGER NOT NULL,
    "assignmentsDue" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,

    CONSTRAINT "AcademicLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StressPrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "level" "StressLevel" NOT NULL,
    "triggerFactor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StressPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicLoad" ADD CONSTRAINT "AcademicLoad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StressPrediction" ADD CONSTRAINT "StressPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
