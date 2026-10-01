"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS, type Category, type Priority } from "@/lib/domain/constants";
import { deviceTimezone, isoToLocalInput, localInputToIso } from "@/lib/client/format";
import { StorageError } from "@/lib/offline/store";
import { useYetim } from "@/components/provider";

export function ReportForm() {
  const yetim = useYetim();
  const router = useRouter();
  const [clientId] = useState(() => crypto.randomUUID());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [priority, setPriority] = useState("");
  const [reportedAt, setReportedAt] = useState(isoToLocalInput());
  const [reporterName, setReporterName] = useState(yetim.actor);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracyMeters: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [locating, setLocating] = useState(false);

  function payload() {
    return {
      clientId,
      category: (category || undefined) as Category | undefined,
      description,
      location,
      priority: (priority || undefined) as Priority | undefined,
      reportedAt: localInputToIso(reportedAt),
      reporterName,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      accuracyMeters: coords?.accuracyMeters ?? null,
    };
  }

  async function onDraft() {
    setErrors({});
    setFormError("");
    try {
      await yetim.saveDraft(payload());
      router.push(`/reports/${clientId}`);
    } catch (error) {
      setFormError(error instanceof StorageError ? error.message : "The draft was not saved.");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError("");
    if (!category || !priority || !description.trim() || !location.trim() || !localInputToIso(reportedAt)) {
      setErrors({
        ...(category ? {} : { category: "Category is required" }),
        ...(description.trim() ? {} : { description: "Description is required" }),
        ...(location.trim() ? {} : { location: "Location is required" }),
        ...(priority ? {} : { priority: "Priority is required" }),
        ...(localInputToIso(reportedAt) ? {} : { reportedAt: "Invalid date/time" }),
      });
      return;
    }
    try {
      await yetim.submit({ ...payload(), category: category as (typeof CATEGORIES)[number], priority: priority as (typeof PRIORITIES)[number] });
      router.push(`/reports/${clientId}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The report was not saved.");
    }
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setFormError("This browser cannot read a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(position.coords.accuracy),
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setFormError("Location permission was denied. You can still submit without coordinates.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <form data-testid="report-form" onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-5" noValidate>
      <div>
        <h1 className="text-3xl font-semibold">New field report</h1>
        <p className="mt-2 text-sm text-muted">A draft stays on this device. Submit queues it for the server. Nothing is called uploaded until Yetim receives an acknowledgement.</p>
      </div>
      {formError ? <p role="alert" className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">{formError}</p> : null}
      <Field label="Category" error={errors.category} htmlFor="category">
        <select id="category" data-testid="category" className="w-full rounded-xl border border-line bg-card px-3 py-3" value={category} onChange={(event) => setCategory(event.target.value)} aria-invalid={Boolean(errors.category)}>
          <option value="">Select a category</option>
          {CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
        </select>
      </Field>
      <Field label="Description" error={errors.description} htmlFor="description">
        <textarea id="description" data-testid="description" className="min-h-32 w-full rounded-xl border border-line bg-card px-3 py-3" value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={Boolean(errors.description)} />
      </Field>
      <Field label="Location" error={errors.location} htmlFor="location">
        <input id="location" data-testid="location" className="w-full rounded-xl border border-line bg-card px-3 py-3" value={location} onChange={(event) => setLocation(event.target.value)} aria-invalid={Boolean(errors.location)} />
      </Field>
      <fieldset>
        <legend className="text-sm font-semibold">Priority</legend>
        {errors.priority ? <p id="priority-error" className="text-sm text-clay">{errors.priority}</p> : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PRIORITIES.map((item) => (
            <label key={item} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm ${priority === item ? "border-teal bg-sky" : "border-line bg-card"}`}>
              <input type="radio" name="priority" value={item} checked={priority === item} onChange={() => setPriority(item)} aria-describedby={errors.priority ? "priority-error" : undefined} />
              {PRIORITY_LABELS[item]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Reported date and time" error={errors.reportedAt} htmlFor="reportedAt">
        <input id="reportedAt" type="datetime-local" className="w-full rounded-xl border border-line bg-card px-3 py-3" value={reportedAt} onChange={(event) => setReportedAt(event.target.value)} />
        <p className="mt-1 text-xs text-muted">Stored in UTC. This device offset is {deviceTimezone()}.</p>
      </Field>
      <Field label="Reporter" error="" htmlFor="reporter">
        <input id="reporter" className="w-full rounded-xl border border-line bg-card px-3 py-3" value={reporterName} onChange={(event) => setReporterName(event.target.value)} />
      </Field>
      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-semibold">Status</p>
        <p className="mt-1 text-sm text-muted">Draft until you submit. Submitting changes it to Submitted.</p>
        <p className="mt-3 text-xs text-muted">Client ID {clientId}</p>
      </div>
      <div className="rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Coordinates</p>
            <p className="text-sm text-muted">{coords ? `${coords.latitude}, ${coords.longitude} (±${coords.accuracyMeters} m)` : "Not captured. Location is optional."}</p>
          </div>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={captureLocation} disabled={locating}>
            {locating ? "Asking permission…" : coords ? "Update location" : "Use my location"}
          </button>
        </div>
      </div>
      <Evidence clientId={clientId} />
      <div className="flex flex-wrap gap-3">
        <button type="button" data-testid="save-draft" className="rounded-xl border border-line bg-card px-4 py-3 text-sm font-semibold" onClick={() => void onDraft()}>
          Save draft
        </button>
        <button type="submit" data-testid="submit-report" className="rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white">
          Submit report
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold" htmlFor={htmlFor}>
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {error ? <p role="alert" className="mt-1 font-normal text-clay">{error}</p> : null}
    </label>
  );
}

function Evidence({ clientId }: { clientId: string }) {
  const yetim = useYetim();
  const [message, setMessage] = useState("");
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <label className="text-sm font-semibold" htmlFor="evidence">Evidence photo <span className="font-normal text-muted">(optional)</span></label>
      <input
        id="evidence"
        className="mt-2 block w-full text-sm"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void yetim.addEvidence(clientId, file).then(() => setMessage("Stored on this device.")).catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : "The photo was not stored.");
          });
        }}
      />
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
