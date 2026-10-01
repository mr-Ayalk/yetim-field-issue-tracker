import Dexie, { type Table } from "dexie";
import type { Category, OutboxType, Priority, Status, SyncState } from "@/lib/domain/constants";
import type { FailureClass } from "@/lib/domain/types";
import type { ReportDto } from "@/lib/server/repository";

export type LocalHistoryEvent = {
  id: string;
  action: string;
  message: string;
  at: string;
  actorRole: string;
  actorName: string;
  fromValue?: string | null;
  toValue?: string | null;
  deviceOnly?: boolean;
};

export type LocalReport = {
  clientId: string;
  serverId?: string | null;
  category?: Category;
  description: string;
  location: string;
  priority?: Priority;
  status: Status;
  reportedAt: string;
  reportedTimezone?: string | null;
  serverReceivedAt?: string | null;
  version: number;
  reporterName?: string | null;
  assigneeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  syncState: SyncState | "LOCAL";
  syncError?: string | null;
  syncErrorCode?: string | null;
  syncDetail?: string | null;
  serverSnapshot?: ReportDto | null;
  localHistory: LocalHistoryEvent[];
  createdAt: string;
  updatedAt: string;
};

export type LocalOperation = {
  clientOperationId: string;
  reportClientId: string;
  type: OutboxType;
  payload: unknown;
  baseVersion?: number;
  status: "PENDING" | "SYNCING" | "FAILED" | "CONFLICT" | "SYNCHRONIZED";
  attempts: number;
  lastError?: string | null;
  lastErrorCode?: string | null;
  failureClass?: FailureClass | null;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
};

export type LocalAttachment = {
  clientAttachmentId: string;
  reportClientId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  blob: Blob;
  status: "PENDING" | "SYNCHRONIZED" | "FAILED";
  serverAttachmentId?: string | null;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  at: string;
  level: "info" | "error" | "ok";
  message: string;
};

export type MetaRow = { key: string; value: string };

class YetimDatabase extends Dexie {
  reports!: Table<LocalReport, string>;
  outbox!: Table<LocalOperation, string>;
  attachments!: Table<LocalAttachment, string>;
  activity!: Table<ActivityEntry, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("yetim");
    this.version(1).stores({
      reports: "clientId, status, syncState, updatedAt, serverId",
      outbox: "clientOperationId, reportClientId, status, createdAt",
      attachments: "clientAttachmentId, reportClientId, checksum",
      activity: "id, at",
      meta: "key",
    });
  }
}

let database: YetimDatabase | null = null;

export function getDb(): YetimDatabase {
  if (!database) database = new YetimDatabase();
  return database;
}

export function resetDbForTests(): void {
  database = null;
}
