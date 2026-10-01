"use client";

import { useEffect, useState } from "react";
import { APP_VERSION, ROLE_LABELS } from "@/lib/domain/constants";
import { useYetim } from "@/components/provider";

export function SettingsView() {
  const yetim = useYetim();
  const [confirm, setConfirm] = useState("");
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [environment, setEnvironment] = useState("unknown");
  const synced = yetim.reports.find((report) => report.syncState === "SYNCHRONIZED" && report.serverId);

  useEffect(() => {
    void navigator.storage?.estimate().then((value) => setEstimate({ usage: value.usage, quota: value.quota }));
    void fetch("/api/health").then(async (response) => {
      const body = (await response.json()) as { data?: { version?: string } };
      setEnvironment(body.data?.version ? `app ${body.data.version}` : "health unreachable");
    }).catch(() => setEnvironment("health unreachable"));
  }, [yetim.reports.length]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Settings and diagnostics</h1>
        <p className="mt-2 text-sm text-muted">Role is a real permission check on the server, sent as <code>x-yetim-role</code>. It is not an account system.</p>
      </header>
      <section className="rounded-2xl border border-line bg-card p-5 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Role" value={ROLE_LABELS[yetim.role]} />
          <Item label="Connection" value={yetim.simulatedOffline ? "Simulated offline" : yetim.online ? "Backend reachable" : "Offline"} />
          <Item label="Pending queue" value={String(yetim.outbox.filter((op) => op.status === "PENDING").length)} />
          <Item label="Failed queue" value={String(yetim.outbox.filter((op) => op.status === "FAILED").length)} />
          <Item label="Last sync" value={yetim.lastSuccess ?? "Not yet"} />
          <Item label="Application version" value={APP_VERSION} />
          <Item label="Environment" value={environment} />
          <Item label="Local storage" value={estimate?.usage != null ? `${Math.round(estimate.usage / 1024)} KB used` : "Unavailable"} />
        </dl>
        <label className="mt-4 block">
          Your name on reports
          <input className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={yetim.actor} onChange={(event) => yetim.setActor(event.target.value)} />
        </label>
      </section>
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">Simulated conditions</h2>
        <p className="mt-1 text-sm text-muted">These are labeled simulations. They do not delete saved reports.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => yetim.setSimulatedOffline(true)}>Toggle offline</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => yetim.setSimulatedOffline(false)}>Toggle online</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => yetim.armFault("timeout")}>Simulate timeout</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => yetim.armFault("503")}>Simulate 503</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => yetim.armFault("validation")}>Simulate validation failure</button>
          <button type="button" data-testid="simulate-conflict" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => synced && void yetim.simulateConflict(synced.clientId)}>Simulate conflict</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => void yetim.loadDemo()}>Seed demo data</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => void yetim.loadDemo()}>Reset demo state</button>
        </div>
      </section>
      <section className="rounded-2xl border border-clay/30 bg-card p-5">
        <h2 className="text-lg font-semibold">Clear local data</h2>
        <p className="mt-1 text-sm text-muted">This removes reports, photos, and the queue from this browser. Server records stay. Type CLEAR to confirm.</p>
        <label className="mt-3 block text-sm" htmlFor="clear-confirm">Confirmation</label>
        <input id="clear-confirm" className="mt-1 w-full rounded-xl border border-line px-3 py-2" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        <button
          type="button"
          className="mt-3 rounded-xl bg-clay px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          disabled={confirm !== "CLEAR"}
          onClick={() => {
            void yetim.clearLocal();
            setConfirm("");
          }}
        >
          Clear local data
        </button>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium break-all">{value}</dd>
    </div>
  );
}
