import type { Category, Priority, Role, Status } from "@/lib/domain/constants";

export type ReportDto = {
  id: string;
  clientId: string;
  category: Category;
  description: string;
  location: string;
  priority: Priority;
  status: Status;
  reportedAt: string;
  reportedTimezone: string | null;
  serverReceivedAt: string;
  version: number;
  reporterName: string | null;
  assigneeName: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  createdAt: string;
  updatedAt: string;
};

export type HistoryDto = {
  id: string;
  reportId: string;
  action: string;
  actorRole: string;
  actorName: string | null;
  fromValue: string | null;
  toValue: string | null;
  message: string;
  sequence: number;
  createdAt: string;
};

export type AttachmentDto = {
  id: string;
  reportId: string;
  clientAttachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
};

export type SyncSessionDto = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  successCount: number;
  failureCount: number;
  conflictCount: number;
  actorRole: string | null;
};

export type HistoryWrite = {
  action: string;
  actorRole: string;
  actorName?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  message: string;
};

export type ReportPatch = {
  category?: Category;
  description?: string;
  location?: string;
  priority?: Priority;
  status?: Status;
  assigneeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
};

export type CreateReportData = {
  clientId: string;
  category: Category;
  description: string;
  location: string;
  priority: Priority;
  reportedAt: string;
  reportedTimezone?: string | null;
  reporterName: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  actorRole: Role;
  actorName: string;
  history: HistoryWrite[];
};

export type ListParams = {
  status?: Status;
  priority?: Priority;
  category?: Category;
  q?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
  reporterName?: string;
  sort: "reportedAt" | "updatedAt" | "priority";
  direction: "asc" | "desc";
};

export type MutationOutcome =
  | { kind: "ok"; report: ReportDto }
  | { kind: "not_found" }
  | { kind: "conflict"; report: ReportDto }
  | { kind: "replay"; report: ReportDto };

export type AttachmentInput = {
  reportId: string;
  clientAttachmentId: string;
  fileName: string;
  mimeType: string;
  checksum: string;
  content: Uint8Array;
  history: HistoryWrite[];
};

export type SeedReport = CreateReportData & {
  id: string;
  status: Status;
  assigneeName?: string | null;
  serverReceivedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  extraHistory?: HistoryWrite[];
};

export interface ReportRepository {
  readiness(): Promise<boolean>;
  list(params: ListParams): Promise<{ items: ReportDto[]; total: number }>;
  getById(id: string): Promise<ReportDto | null>;
  getByClientId(clientId: string): Promise<ReportDto | null>;
  getByAnyId(id: string): Promise<ReportDto | null>;
  createSubmitted(
    input: CreateReportData,
    operationId?: string,
  ): Promise<{ report: ReportDto; idempotent: boolean }>;
  applyMutation(input: {
    id: string;
    expectedVersion: number;
    patch: ReportPatch;
    history: HistoryWrite[];
    operationId?: string;
    force?: boolean;
  }): Promise<MutationOutcome>;
  listHistory(reportId: string): Promise<HistoryDto[]>;
  hasHistoryMessage(reportId: string, action: string, snippet: string): Promise<boolean>;
  appendHistory(reportId: string, history: HistoryWrite[]): Promise<void>;
  addAttachment(
    input: AttachmentInput,
    operationId?: string,
  ): Promise<
    | { kind: "ok"; attachment: AttachmentDto; idempotent: boolean }
    | { kind: "not_found" }
    | { kind: "duplicate" }
  >;
  listAttachments(reportId: string): Promise<AttachmentDto[]>;
  getAttachment(
    attachmentId: string,
  ): Promise<(AttachmentDto & { content: Uint8Array }) | null>;
  recordSyncSession(input: {
    successCount: number;
    failureCount: number;
    conflictCount: number;
    actorRole: string | null;
  }): Promise<SyncSessionDto>;
  recentSyncSessions(limit: number): Promise<SyncSessionDto[]>;
  resetAndSeed(records: SeedReport[]): Promise<number>;
  diverge(clientId: string, actorRole: string, actorName: string): Promise<ReportDto | null>;
  /** Test helper: insert a row the public create API would refuse, such as a draft. */
  insertRaw?(report: ReportDto): Promise<void>;
}
