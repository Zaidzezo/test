ALTER TABLE "Project" ADD COLUMN "desiredRunning" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "healthFailures" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lastCheckedAt" TIMESTAMP(3), ADD COLUMN "healthMessage" TEXT,
 ADD COLUMN "shareEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "publicUrl" TEXT,
 ADD COLUMN "sharingStatus" TEXT NOT NULL DEFAULT 'DISABLED', ADD COLUMN "sharingError" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DEPLOY', ADD COLUMN "sourceDeploymentId" TEXT,
 ADD COLUMN "environmentSnapshot" TEXT, ADD COLUMN "cleanupPending" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "cleanupError" TEXT, ADD COLUMN "workspacePath" TEXT;
CREATE TABLE "ProjectVariable" (
 "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" TEXT NOT NULL, "encryptedValue" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ProjectVariable_projectId_name_key" UNIQUE ("projectId","name")
);
CREATE TABLE "HealthCheck" (
 "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "deploymentId" TEXT NOT NULL, "status" "RuntimeStatus" NOT NULL, "httpStatus" INTEGER, "responseTimeMs" INTEGER,
 "message" TEXT, "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthCheck_projectId_checkedAt_idx" ON "HealthCheck"("projectId","checkedAt");
