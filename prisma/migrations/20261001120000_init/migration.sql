-- Yetim initial schema. PostgreSQL enums and unique client_id are the duplicate-prevention boundary.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "report_category" AS ENUM ('WATER_POINT', 'EQUIPMENT', 'SERVICE_INTERRUPTION', 'SAFETY_CONCERN', 'MAINTENANCE', 'OTHER');
CREATE TYPE "priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "report_status" AS ENUM ('DRAFT', 'SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

CREATE TABLE "reports" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "category" "report_category" NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "priority" "priority" NOT NULL,
  "status" "report_status" NOT NULL,
  "reported_at" TIMESTAMP(3) NOT NULL,
  "reported_timezone" TEXT,
  "server_received_at" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "reporter_name" TEXT,
  "assignee_name" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracy_meters" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_history" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "actor_name" TEXT,
  "from_value" TEXT,
  "to_value" TEXT,
  "message" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attachments" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "client_attachment_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_operations" (
  "client_operation_id" TEXT NOT NULL,
  "report_client_id" TEXT NOT NULL,
  "response_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_operations_pkey" PRIMARY KEY ("client_operation_id")
);

CREATE TABLE "sync_sessions" (
  "id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "conflict_count" INTEGER NOT NULL DEFAULT 0,
  "actor_role" TEXT,
  CONSTRAINT "sync_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reports_client_id_key" ON "reports"("client_id");
CREATE INDEX "reports_status_idx" ON "reports"("status");
CREATE INDEX "reports_priority_idx" ON "reports"("priority");
CREATE INDEX "reports_category_idx" ON "reports"("category");
CREATE INDEX "reports_reported_at_idx" ON "reports"("reported_at");
CREATE INDEX "reports_updated_at_idx" ON "reports"("updated_at");
CREATE INDEX "reports_reporter_name_idx" ON "reports"("reporter_name");
CREATE INDEX "report_history_report_id_sequence_idx" ON "report_history"("report_id", "sequence");
CREATE INDEX "report_history_report_id_created_at_idx" ON "report_history"("report_id", "created_at");
CREATE UNIQUE INDEX "attachments_client_attachment_id_key" ON "attachments"("client_attachment_id");
CREATE UNIQUE INDEX "attachments_report_id_checksum_key" ON "attachments"("report_id", "checksum");
CREATE INDEX "attachments_report_id_idx" ON "attachments"("report_id");
CREATE INDEX "processed_operations_report_client_id_idx" ON "processed_operations"("report_client_id");
CREATE INDEX "sync_sessions_started_at_idx" ON "sync_sessions"("started_at");

ALTER TABLE "reports" ADD CONSTRAINT "reports_version_positive" CHECK ("version" >= 1);
ALTER TABLE "reports" ADD CONSTRAINT "reports_description_present" CHECK (char_length(btrim("description")) >= 1);
ALTER TABLE "reports" ADD CONSTRAINT "reports_location_present" CHECK (char_length(btrim("location")) >= 1);

ALTER TABLE "report_history" ADD CONSTRAINT "report_history_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
