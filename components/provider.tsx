"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Category, Priority, Role, Status } from "@/lib/domain/constants";
import { apiFetch, probeReady } from "@/lib/client/api";
import { getDb, type LocalAttachment, type LocalOperation, type LocalReport } from "@/lib/offline/db";
import { blobToBase64, prepareEvidence, sha256 } from "@/lib/offline/images";
import { synchronizeQueue } from "@/lib/offline/sync-engine";
import {
  clearLocalWork,
  fromServer,
  persistSyncUpdate,
  queueConflictResolution,
  queueStatusChange,
  readMeta,
  recoverInterrupted,
  rememberActivity,
  saveAttachment,
  saveDraft,
  StorageError,
  submitLocalReport,
  writeMeta,
} from "@/lib/offline/store";
import type { ReportDto } from "@/lib/server/repository";

type Notice = { tone: "ok" | "error"; text: string } | null;

type YetimValue = {
  booted: boolean;
  role: Role;
  actor: string;
  online: boolean;
  simulatedOffline: boolean;
  syncing: boolean;
  pendingFault: string | null;
  notice: Notice;
  lastSuccess: string | null;
  lastAttempt: string | null;
  reports: LocalReport[];
  outbox: LocalOperation[];
  activity: { id: string; at: string; level: "info" | "error" | "ok"; message: string }[];
  attachments: LocalAttachment[];
  setRole: (role: Role) => void;
  setActor: (name: string) => void;
  setSimulatedOffline: (value: boolean) => void;
  armFault: (fault: "timeout" | "503" | "validation" | null) => void;
  saveDraft: (input: DraftInput) => Promise<void>;
  submit: (input: DraftInput & { category: Category; priority: Priority }) => Promise<void>;
  syncNow: () => Promise<void>;
  queueStatus: (report: LocalReport, to: Status, extra?: { assigneeName?: string; reason?: string }) => Promise<void>;
  queueUpdate: (report: LocalReport, patch: Record<string, unknown>) => Promise<void>;
  resolveConflict: (report: LocalReport, strategy: "KEEP_SERVER" | "APPLY_LOCAL", patch?: Record<string, unknown>) => Promise<void>;
  addEvidence: (clientId: string, file: File) => Promise<void>;
  clearLocal: () => Promise<void>;
  loadDemo: () => Promise<void>;
  simulateConflict: (clientId: string) => Promise<void>;
  attemptInvalid: (report: LocalReport) => Promise<string>;
  dismissNotice: () => void;
};

type DraftInput = {
  clientId: string;
  category?: Category;
  description: string;
  location: string;
  priority?: Priority;
  reportedAt: string;
  reporterName?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
};

const YetimContext = createContext<YetimValue | null>(null);

export function YetimProvider({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);
  useEffect(() => setBooted(true), []);
  if (!booted) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <p className="text-sm text-muted">Opening Yetim…</p>
      </div>
    );
  }
  return <BrowserState>{children}</BrowserState>;
}

function BrowserState({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("DEMO_REVIEWER");
  const [actor, setActorState] = useState("Alem Worku");
  const [online, setOnline] = useState(true);
  const [simulatedOffline, setSimulatedState] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingFault, setPendingFault] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);
  const lock = useRef(false);
  const roleRef = useRef(role);
  const actorRef = useRef(actor);
  const offlineRef = useRef(simulatedOffline);
  roleRef.current = role;
  actorRef.current = actor;
  offlineRef.current = simulatedOffline;

  const reportRows = useLiveQuery(() => getDb().reports.orderBy("updatedAt").reverse().toArray(), []);
  const outboxRows = useLiveQuery(() => getDb().outbox.orderBy("createdAt").toArray(), []);
  const activityRows = useLiveQuery(() => getDb().activity.orderBy("at").reverse().limit(12).toArray(), []);
  const attachmentRows = useLiveQuery(() => getDb().attachments.toArray(), []);
  const reports = useMemo(() => reportRows ?? [], [reportRows]);
  const outbox = useMemo(() => outboxRows ?? [], [outboxRows]);
  const activity = useMemo(() => activityRows ?? [], [activityRows]);
  const attachments = useMemo(() => attachmentRows ?? [], [attachmentRows]);

  useEffect(() => {
    const storedRole = window.localStorage.getItem("yetim.role") as Role | null;
    const storedActor = window.localStorage.getItem("yetim.actor");
    const storedOffline = window.localStorage.getItem("yetim.offline") === "1";
    if (storedRole) setRoleState(storedRole);
    if (storedActor) setActorState(storedActor);
    setSimulatedState(storedOffline);
    void recoverInterrupted();
    void readMeta("lastSuccess").then(setLastSuccess);
    void readMeta("lastAttempt").then(setLastAttempt);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const pullServer = useCallback(async () => {
    const response = await apiFetch("/api/reports?pageSize=100", {
      role: roleRef.current,
      actor: actorRef.current,
    });
    if (response.status !== 200 || !response.body || typeof response.body !== "object") return;
    const items = ((response.body as { data?: { items?: ReportDto[] } }).data?.items ?? []);
    const db = getDb();
    await db.transaction("rw", db.reports, db.outbox, async () => {
      for (const item of items) {
        const local = await db.reports.get(item.clientId);
        const open = await db.outbox
          .where("reportClientId")
          .equals(item.clientId)
          .filter((op) => op.status !== "SYNCHRONIZED")
          .count();
        if (!local) {
          await db.reports.put(fromServer(item));
        } else if (open === 0 && local.status !== "DRAFT") {
          await db.reports.put({ ...fromServer(item), localHistory: local.localHistory });
        } else {
          await db.reports.update(item.clientId, { serverId: item.id, serverSnapshot: item });
        }
      }
    });
  }, []);

  const runSync = useCallback(async (manual: boolean) => {
    if (lock.current || offlineRef.current) return;
    const reachable = await probeReady(false);
    setOnline(reachable);
    if (!reachable) return;
    lock.current = true;
    setSyncing(true);
    let fault = window.sessionStorage.getItem("yetim.fault");
    try {
      await recoverInterrupted();
      const ops = await getDb().outbox.toArray();
      const summary = await synchronizeQueue({
        ops,
        now: Date.now(),
        manual,
        fault,
        send: async (op) => {
          const useFault = fault;
          fault = null;
          window.sessionStorage.removeItem("yetim.fault");
          setPendingFault(null);
          let payload = op.payload;
          if (op.type === "UPLOAD_ATTACHMENT") {
            const attachmentId = (op.payload as { clientAttachmentId?: string }).clientAttachmentId;
            const file = attachmentId ? await getDb().attachments.get(attachmentId) : null;
            if (!file) {
              return {
                httpStatus: 422,
                body: {
                  data: {
                    results: [
                      {
                        ok: false,
                        httpStatus: 422,
                        error: { code: "ATTACHMENT_UNSUPPORTED", message: "That image is no longer on this device." },
                      },
                    ],
                  },
                },
              };
            }
            payload = {
              clientAttachmentId: file.clientAttachmentId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              checksum: file.checksum,
              contentBase64: await blobToBase64(file.blob),
            };
          }
          try {
            const response = await apiFetch("/api/sync", {
              method: "POST",
              role: roleRef.current,
              actor: actorRef.current,
              fault: useFault,
              body: {
                operations: [
                  {
                    clientOperationId: op.clientOperationId,
                    type: op.type,
                    reportClientId: op.reportClientId,
                    baseVersion: op.baseVersion,
                    payload,
                  },
                ],
              },
            });
            return { httpStatus: response.status, body: response.body };
          } catch (error) {
            return { network: true as const, message: error instanceof Error ? error.message : "Network error" };
          }
        },
        persist: persistSyncUpdate,
      });
      const now = new Date().toISOString();
      await writeMeta("lastAttempt", now);
      setLastAttempt(now);
      if (summary.synchronized > 0 && summary.failed === 0 && summary.conflict === 0) {
        await writeMeta("lastSuccess", now);
        setLastSuccess(now);
      }
      if (summary.attempted > 0) {
        await rememberActivity(
          `Sync finished. ${summary.synchronized} synchronized, ${summary.failed} failed, ${summary.conflict} conflict.`,
          summary.failed || summary.conflict ? "error" : "ok",
        );
      }
      await pullServer();
    } finally {
      lock.current = false;
      setSyncing(false);
    }
  }, [pullServer]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const reachable = await probeReady(offlineRef.current);
      if (!stopped) setOnline(reachable);
      if (reachable) await runSync(false);
    };
    void tick();
    const onWake = () => void tick();
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const timer = window.setInterval(() => void tick(), 30_000);
    return () => {
      stopped = true;
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      window.clearInterval(timer);
    };
  }, [runSync]);

  const value = useMemo<YetimValue>(() => ({
    booted: true,
    role,
    actor,
    online,
    simulatedOffline,
    syncing,
    pendingFault,
    notice,
    lastSuccess,
    lastAttempt,
    reports,
    outbox,
    activity,
    attachments,
    setRole: (next) => {
      setRoleState(next);
      window.localStorage.setItem("yetim.role", next);
    },
    setActor: (next) => {
      const name = next.trim().slice(0, 80) || "Alem Worku";
      setActorState(name);
      window.localStorage.setItem("yetim.actor", name);
    },
    setSimulatedOffline: (next) => {
      setSimulatedState(next);
      offlineRef.current = next;
      window.localStorage.setItem("yetim.offline", next ? "1" : "0");
      if (next) setOnline(false);
      else void probeReady(false).then(setOnline);
    },
    armFault: (fault) => {
      if (!fault) {
        window.sessionStorage.removeItem("yetim.fault");
        setPendingFault(null);
        return;
      }
      window.sessionStorage.setItem("yetim.fault", fault);
      setPendingFault(fault);
      setNotice({ tone: "ok", text: `Simulated ${fault} is armed for the next sync. No data will be discarded.` });
    },
    saveDraft: async (input) => {
      try {
        await saveDraft({ ...input, reportedTimezone: timeZone(), role, actor });
        setNotice({ tone: "ok", text: "Saved safely on this device." });
      } catch (error) {
        throw error;
      }
    },
    submit: async (input) => {
      await submitLocalReport({ ...input, reportedTimezone: timeZone(), role, actor });
      setNotice({
        tone: "ok",
        text: online && !simulatedOffline ? "Saved safely on this device. Waiting to sync." : "Saved safely on this device. Waiting to sync.",
      });
      if (!simulatedOffline) void runSync(true);
    },
    syncNow: () => runSync(true),
    queueStatus: async (report, to, extra) => {
      await queueStatusChange({ report, to, assigneeName: extra?.assigneeName, reason: extra?.reason, role, actor });
      if (!simulatedOffline) await runSync(true);
    },
    queueUpdate: async (report, patch) => {
      const db = getDb();
      const now = new Date().toISOString();
      await db.transaction("rw", db.reports, db.outbox, async () => {
        await db.outbox.put({
          clientOperationId: crypto.randomUUID(),
          reportClientId: report.clientId,
          type: "UPDATE_REPORT",
          baseVersion: report.version,
          payload: { ...patch, baseVersion: report.version },
          status: "PENDING",
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        });
        await db.reports.update(report.clientId, {
          ...patch,
          syncState: "PENDING",
          updatedAt: now,
        });
      });
      if (!simulatedOffline) await runSync(true);
    },
    resolveConflict: async (report, strategy, patch) => {
      await queueConflictResolution({ report, strategy, patch, role, actor });
      if (!simulatedOffline) await runSync(true);
    },
    addEvidence: async (clientId, file) => {
      try {
        const prepared = await prepareEvidence(file);
        const checksum = await sha256(prepared.blob);
        await saveAttachment({
          clientAttachmentId: crypto.randomUUID(),
          reportClientId: clientId,
          fileName: file.name || "evidence.jpg",
          mimeType: prepared.mimeType,
          sizeBytes: prepared.blob.size,
          checksum,
          blob: prepared.blob,
          status: "PENDING",
          createdAt: new Date().toISOString(),
        });
        setNotice({ tone: "ok", text: "Photo stored on this device. It will upload after the report syncs." });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "ATTACHMENT_TOO_LARGE") throw new StorageError("That image is too large. Use a smaller photo.");
        if (code === "ATTACHMENT_UNSUPPORTED") throw new StorageError("Use a JPEG, PNG, or WebP image.");
        throw error;
      }
    },
    clearLocal: async () => {
      await clearLocalWork();
      setNotice({ tone: "ok", text: "Local reports and the sync queue were cleared from this device." });
    },
    loadDemo: async () => {
      const response = await apiFetch("/api/demo/reset", {
        method: "POST",
        role,
        actor,
      });
      if (response.status >= 400) {
        setNotice({ tone: "error", text: "Demo data could not be loaded. Check that the database is ready." });
        return;
      }
      await pullServer();
      setNotice({ tone: "ok", text: "Demonstration reports are loaded on the server." });
    },
    simulateConflict: async (clientId) => {
      const report = reports.find((item) => item.clientId === clientId);
      if (!report?.serverId) {
        setNotice({ tone: "error", text: "Sync a report first, then simulate a conflict." });
        return;
      }
      const diverged = await apiFetch("/api/demo/diverge", {
        method: "POST",
        role,
        actor,
        body: { clientId },
      });
      if (diverged.status >= 400) {
        setNotice({ tone: "error", text: "The simulated server edit was refused." });
        return;
      }
      await valueQueueLocalNote(report);
      await runSync(true);
      setNotice({ tone: "ok", text: "Simulated conflict: the server changed this report while a local edit was waiting." });
    },
    attemptInvalid: async (report) => {
      if (!report.serverId) return "Sync the report before trying a server transition.";
      const response = await apiFetch(`/api/reports/${report.serverId}/status`, {
        method: "POST",
        role,
        actor,
        body: { to: "RESOLVED", baseVersion: report.version || 1 },
      });
      const error = (response.body as { error?: { message?: string } } | null)?.error?.message;
      return error ?? "The server accepted a transition it should have rejected.";
    },
    dismissNotice: () => setNotice(null),
  }), [activity, actor, attachments, lastAttempt, lastSuccess, notice, online, outbox, pendingFault, pullServer, reports, role, runSync, simulatedOffline, syncing]);

  return <YetimContext.Provider value={value}>{children}</YetimContext.Provider>;
}

async function valueQueueLocalNote(report: LocalReport) {
  const db = getDb();
  const now = new Date().toISOString();
  const description = `${report.description} Field note added offline.`;
  await db.transaction("rw", db.reports, db.outbox, async () => {
    await db.outbox.put({
      clientOperationId: crypto.randomUUID(),
      reportClientId: report.clientId,
      type: "UPDATE_REPORT",
      baseVersion: report.version,
      payload: { description, baseVersion: report.version },
      status: "PENDING",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.reports.update(report.clientId, { description, syncState: "PENDING", updatedAt: now });
  });
}

function timeZone(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function useYetim(): YetimValue {
  const value = useContext(YetimContext);
  if (!value) throw new Error("Yetim is still starting.");
  return value;
}
