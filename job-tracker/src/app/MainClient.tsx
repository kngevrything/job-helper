"use client";

import { useEffect, useState } from "react";
import { APPLICATION_STATUSES } from "@/lib/status";

type Application = {
  _id: string;
  company: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  status: string;
  notes?: string;
  createdAt: string;
  endedAt?: string | null;
  excelRowText?: string;
  starterPromptText?: string;
  folderPath?: string | null;
  resumePath?: string | null;
  coverLetterPath?: string | null;
};

type CreateResult = {
  excelRowText: string;
  starterPromptText: string;
  folderPath?: string | null;
  resumePath?: string | null;
  coverLetterPath?: string | null;
};

export default function MainClient() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);

  const [company, setCompany] = useState("");
  const [jobId, setJobId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sortOrder, setSortOrder] = useState<string>("newest");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editJobUrl, setEditJobUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");

  async function loadApplications() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/job-applications");
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load applications.");
      }

      setApplications(data.data);

      setSelected((current) => {
        if (!current) return data.data[0] ?? null;
        const refreshed = data.data.find((app: Application) => app._id === current._id);
        return refreshed ?? data.data[0] ?? null;
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load applications.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
  }, []);

  function isTerminalStatus(status: string) {
    return [
      "Rejected, No Interview",
      "Closed, No Interview",
      "1st Round Exit",
      "2nd Round Exit",
      "3rd Round Exit",
      "Final Round Exit",
      "No Response, Job Closed",
      "Ghosted",
      "Disappeared",
      "2nd Round, Declined to Proceed",
    ].includes(status);
  }

  function getDurationDays(app: Application): number | null {
    const created = new Date(app.createdAt);

    if (app.endedAt) {
      const ended = new Date(app.endedAt);
      return Math.floor(
        (ended.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    if (isTerminalStatus(app.status)) {
      return null;
    }

    const now = new Date();
    return Math.floor(
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(true);
    setError(null);

    try {
      const res = await fetch(`/api/job-applications/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to update status.");
      }

      setApplications((current) =>
        current.map((app) => (app._id === id ? data.data : app))
      );

      setSelected((current) => (current?._id === id ? data.data : current));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update status.";
      setError(message);
    } finally {
      setUpdating(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    setCreating(true);
    setError(null);
    setCreateResult(null);

    try {
      const res = await fetch("/api/job-applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company,
          jobId,
          jobTitle,
          jobUrl,
          createFiles: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error("That application already exists.");
        }
        throw new Error(data.error || "Failed to create application.");
      }

      setCreateResult({
        excelRowText: data.data.excelRowText,
        starterPromptText: data.data.starterPromptText,
        folderPath: data.data.folderPath,
        resumePath: data.data.resumePath,
        coverLetterPath: data.data.coverLetterPath,
      });

      setCompany("");
      setJobId("");
      setJobTitle("");
      setJobUrl("");

      await loadApplications();
      setSelected(data.data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create application.";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  function startEditing() {
    if (!selected) return;

    setEditJobTitle(selected.jobTitle);
    setEditJobUrl(selected.jobUrl);
    setEditNotes(selected.notes ?? "");
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditJobTitle("");
    setEditJobUrl("");
    setEditNotes("");
  }

  async function saveEdits() {
    if (!selected) return;

    setUpdating(true);
    setError(null);

    try {
      const res = await fetch(`/api/job-applications/${selected._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobTitle: editJobTitle,
          jobUrl: editJobUrl,
          notes: editNotes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to update application.");
      }

      setApplications((current) =>
        current.map((app) => (app._id === selected._id ? data.data : app))
      );

      setSelected(data.data);
      setIsEditing(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update application.";
      setError(message);
    } finally {
      setUpdating(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Copy failed.");
    }
  }

  const filteredApplications = applications.filter((app) => {
    const search = searchTerm.trim().toLowerCase();

    const matchesSearch =
      `${app.company} ${app.jobTitle} ${app.jobId} ${app.jobUrl}`
        .toLowerCase()
        .includes(search);

    const matchesStatus =
      statusFilter === "All" || app.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const visibleApplications = [...filteredApplications].sort((a, b) => {
    switch (sortOrder) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "company-asc":
        return a.company.localeCompare(b.company);
      case "company-desc":
        return b.company.localeCompare(a.company);
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  
  });

  
  const summaryCounts = {
    total: applications.length,
    applied: applications.filter((app) => app.status === "Applied").length,
    interviewing: applications.filter((app) =>
      ["1st Interview Done", "Final Round Scheduled"].includes(app.status)
    ).length,
    exited: applications.filter((app) =>
      [
        "1st Round Exit",
        "2nd Round Exit",
        "3rd Round Exit",
        "Final Round Exit",
        "Rejected, No Interview",
        "Closed, No Interview",
        "No Response, Job Closed",
        "Ghosted",
        "Disappeared",
        "2nd Round, Declined to Proceed",
      ].includes(app.status)
    ).length,
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-9xl flex-col gap-6 px-6 py-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Job Application Tracker
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Track applications, generate job folders, and manage interview progress.
            </p>
          </div>

          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Company</label>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Job ID</label>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Job Title</label>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Job Title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Job URL</label>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Job URL"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                required
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Application"}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {createResult && (
            <div className="mt-6 grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-800">
                Application created successfully.
              </p>

              {createResult.folderPath && (
                <div className="text-sm text-slate-700">
                  <span className="font-medium text-slate-900">Folder:</span>{" "}
                  {createResult.folderPath}
                </div>
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">Excel Row</h3>
                  <button
                    type="button"
                    onClick={() => copy(createResult.excelRowText)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  value={createResult.excelRowText}
                  readOnly
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">Starter Prompt</h3>
                  <button
                    type="button"
                    onClick={() => copy(createResult.starterPromptText)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Copy
                  </button>
                </div>
                <textarea
                  value={createResult.starterPromptText}
                  readOnly
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                />
              </div>

              {(createResult.resumePath || createResult.coverLetterPath) && (
                <div className="grid gap-1 text-sm text-slate-700">
                  <h3 className="font-semibold text-slate-900">Created Files</h3>
                  {createResult.resumePath && (
                    <p>
                      <span className="font-medium text-slate-900">Resume:</span>{" "}
                      {createResult.resumePath}
                    </p>
                  )}
                  {createResult.coverLetterPath && (
                    <p>
                      <span className="font-medium text-slate-900">Cover Letter:</span>{" "}
                      {createResult.coverLetterPath}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Applications</h2>
              <p className="mt-1 text-sm text-slate-500">
                Search, filter, and sort your active history.
              </p>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Total {summaryCounts.total}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Applied {summaryCounts.applied}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Interviewing {summaryCounts.interviewing}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Exited {summaryCounts.exited}
              </span>
            </div>

            <div className="mb-4 grid gap-3">
              <input
                placeholder="Search company, title, job ID, or URL"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="All">All Statuses</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="company-asc">Company A-Z</option>
                <option value="company-desc">Company Z-A</option>
              </select>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_110px_56px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div>Company</div>
                <div>Title</div>
                <div>Status</div>
                <div className="text-right">Days</div>
              </div>

              <div className="max-h-175 overflow-y-auto">
                {loading && <p className="p-3 text-sm text-slate-500">Loading...</p>}

                {!loading && visibleApplications.length === 0 && (
                  <p className="p-3 text-sm text-slate-500">No matching applications.</p>
                )}

                {!loading &&
                  visibleApplications.map((app) => {
                    const isSelected = selected?._id === app._id;
                    const duration = getDurationDays(app);

                    return (
                      <button
                        key={app._id}
                        type="button"
                        onClick={() => {
                          setSelected(app);
                          setIsEditing(false);
                        }}
                        className={`grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_110px_56px] gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm transition last:border-b-0 ${
                          isSelected
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <div className="truncate font-medium">{app.company}</div>
                        <div className={isSelected ? "truncate text-slate-200" : "truncate text-slate-600"}>
                          {app.jobTitle}
                        </div>
                        <div className={isSelected ? "truncate text-slate-300" : "truncate text-slate-500"}>
                          {app.status}
                        </div>
                        <div className={isSelected ? "text-right text-slate-300" : "text-right text-slate-500"}>
                          {duration === null ? "—" : `${duration}d`}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Details</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review status, notes, and application details.
              </p>
            </div>

            {!selected && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                Select an application to view details.
              </div>
            )}

            {selected && (
              <div className="grid gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Company
                    </div>
                    <div className="mt-1 text-sm text-slate-900">{selected.company}</div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Job ID
                    </div>
                    <div className="mt-1 text-sm text-slate-900">{selected.jobId}</div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Job Title
                    </div>
                    <div className="mt-1">
                      {isEditing ? (
                        <input
                          value={editJobTitle}
                          onChange={(e) => setEditJobTitle(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      ) : (
                        <div className="text-sm text-slate-900">{selected.jobTitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Job URL
                    </div>
                    <div className="mt-1">
                      {isEditing ? (
                        <input
                          value={editJobUrl}
                          onChange={(e) => setEditJobUrl(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      ) : (
                        <a
                          href={selected.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900"
                        >
                          {selected.jobUrl}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </div>
                    <div className="mt-2">
                      <select
                        value={selected.status}
                        onChange={(e) => updateStatus(selected._id, e.target.value)}
                        disabled={updating}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Duration
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {(() => {
                        const duration = getDurationDays(selected);
                        return duration === null ? "—" : `${duration}d`;
                      })()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Applied On
                    </div>
                    <div className="mt-2 text-sm text-slate-900">
                      {selected.createdAt
                        ? new Date(selected.createdAt).toLocaleDateString()
                        : "Unknown"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ended On
                    </div>
                    <div className="mt-2 text-sm text-slate-900">
                      {selected.endedAt
                        ? new Date(selected.endedAt).toLocaleDateString()
                        : isTerminalStatus(selected.status)
                        ? "Unknown"
                        : "Active"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notes
                  </div>
                  <div className="mt-2">
                    {isEditing ? (
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={8}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    ) : (
                      <div className="min-h-[160px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                        {selected.notes?.trim() ? selected.notes : "No notes yet."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={saveEdits}
                        disabled={updating}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updating ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={updating}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      if (!selected) return;

                      await fetch(`/api/job-applications/${selected._id}/open-folder`, {
                        method: "POST",
                      });
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Open Folder
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}