CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED','CLONING','BUILDING','STARTING','VERIFYING','SUCCEEDED','FAILED');
CREATE TYPE "RuntimeStatus" AS ENUM ('NOT_DEPLOYED','RUNNING','STOPPED','DEGRADED','UNKNOWN');
CREATE TABLE "Project" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL UNIQUE,
 "repositoryUrl" TEXT NOT NULL, "branch" TEXT NOT NULL DEFAULT '',
 "containerPort" INTEGER NOT NULL DEFAULT 3000, "healthPath" TEXT NOT NULL DEFAULT '/',
 "runtimeStatus" "RuntimeStatus" NOT NULL DEFAULT 'NOT_DEPLOYED',
 "currentDeploymentId" TEXT UNIQUE, "activeDeploymentId" TEXT UNIQUE, "operationToken" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "Deployment" (
 "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "repositoryUrl" TEXT NOT NULL, "branch" TEXT NOT NULL, "containerPort" INTEGER NOT NULL, "healthPath" TEXT NOT NULL,
 "status" "DeploymentStatus" NOT NULL DEFAULT 'QUEUED', "commitSha" TEXT, "imageTag" TEXT, "containerId" TEXT, "hostPort" INTEGER, "errorMessage" TEXT,
 "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentDeploymentId_fkey" FOREIGN KEY ("currentDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_activeDeploymentId_fkey" FOREIGN KEY ("activeDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "DeploymentEvent" (
 "id" SERIAL PRIMARY KEY, "deploymentId" TEXT NOT NULL REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "type" TEXT NOT NULL, "level" TEXT NOT NULL DEFAULT 'info', "message" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Deployment_projectId_createdAt_idx" ON "Deployment"("projectId","createdAt");
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");
CREATE INDEX "DeploymentEvent_deploymentId_id_idx" ON "DeploymentEvent"("deploymentId","id");
