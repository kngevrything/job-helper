"use client";

import { useEffect, useMemo, useState } from "react";
import { APPLICATION_STATUSES, STATUS_GROUPS, isTerminalStatus } from "@/lib/status";
import { ClearableInput, TypeaheadInput } from "@/lib/InputFieldComponents";
import { CopyButton } from "./CopyButton";


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
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editJobUrl, setEditJobUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [creatingDoc, setCreatingDoc] = useState<"resume" | "coverLetter" | null>(null);

  // silent=true is used for background refreshes (polling, tab focus) so
  // they don't flash "Loading..." over the table or surface a transient
  // network blip as a user-facing error banner.
  async function loadApplications(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

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
      if (!silent) {
        setError(message);
      } else {
        console.error("Background refresh failed:", message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
  }, []);

  // Background sync: the server pushes a "changed" event over SSE the
  // moment a write lands (including from the Chrome extension), so this
  // fires near-instantly instead of on a timer. Silent refreshes reuse
  // loadApplications's existing merge logic, which already preserves
  // `selected` by id and leaves search, filters, sort, and any
  // in-progress edit fields untouched. The focus/visibility refresh is a
  // cheap fallback in case the SSE connection dropped silently (e.g. the
  // machine slept) -- EventSource reconnects on its own, this just covers
  // the gap.
  useEffect(() => {
    const source = new EventSource("/api/job-applications/events");

    source.onmessage = (event) => {
      if (event.data === "changed") {
        loadApplications(true);
      }
    };

    function handleVisible() {
      if (document.visibilityState === "visible") {
        loadApplications(true);
      }
    }

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);

    return () => {
      source.close();
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, []);

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

  async function deleteApplication() {
    if (!selected) return;

    const confirmed = window.confirm(
      `Remove application for ${selected.company} — ${selected.jobTitle}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/job-applications/${selected._id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to remove application.");
      }

      const removedId = selected._id;
      setApplications((current) => current.filter((app) => app._id !== removedId));
      setSelected(null);
      setIsEditing(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove application.";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function createDocument(type: "resume" | "coverLetter") {
    if (!selected) return;
    setCreatingDoc(type);
    setError(null);
    try {
      const res = await fetch(`/api/job-applications/${selected._id}/create-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to create document.");
      }
      setApplications((current) =>
        current.map((app) => (app._id === selected._id ? data.data : app))
      );
      setSelected(data.data);
      const newPath = type === "resume" ? data.data.resumePath : data.data.coverLetterPath;
      if (newPath) await openFile(newPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create document.";
      setError(message);
    } finally {
      setCreatingDoc(null);
    }
  }

  async function openFile(filePath: string) {
    await fetch(`/api/job-applications/${selected?._id}/open-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    });
  }

  async function openFolder() {
    if (!selected) return;
    await fetch(`/api/job-applications/${selected._id}/open-folder`, {
      method: "POST",
    });
  }

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const search = searchTerm.trim().toLowerCase();

      const matchesSearch =
        `${app.company} ${app.jobTitle} ${app.jobId} ${app.jobUrl}`
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        statusFilter === "All" || app.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [applications, searchTerm, statusFilter]);

  const visibleApplications = useMemo(() => {
    return [...filteredApplications].sort((a, b) => {
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
  }, [filteredApplications, sortOrder]);

  const summaryCounts = useMemo(() => ({
    total: applications.length,
    applied: applications.filter((app) => app.status === "Applied").length,
    interviewing: applications.filter((app) =>
      app.status.includes("Round") && !isTerminalStatus(app.status)
    ).length,
    exited: applications.filter((app) => isTerminalStatus(app.status)).length,
  }), [applications]);

  const companySuggestions = useMemo(() => {
    return Array.from(
      new Set(applications.map((app) => app.company?.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [applications]);

  const jobTitleSuggestions = useMemo(() => {
    return Array.from(
      new Set(applications.map((app) => app.jobTitle?.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [applications]);

  const searchSuggestions = useMemo(() => {
    return [
      ...companySuggestions,
      ...jobTitleSuggestions.filter(
        (jobTitle) => !companySuggestions.includes(jobTitle)
      ),
    ];
  }, [companySuggestions, jobTitleSuggestions]);

  return (
    <div className="min-h-screen bg-slate-100">
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
               <TypeaheadInput
                  name="company"
                  value={company}
                  onChange={setCompany}
                  suggestions={companySuggestions}
                  placeholder="Company"
                  required
                />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Job ID</label>
               <ClearableInput
                  name="jobId"
                  value={jobId}
                  onChange={setJobId}
                  placeholder="Job ID"
                  required
                />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Job Title</label>
              <TypeaheadInput
                  name="jobTitle"
                  value={jobTitle}
                  onChange={setJobTitle}
                  suggestions={jobTitleSuggestions}
                  placeholder="Job Title"
                  required
                />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Job URL</label>
               <ClearableInput
                name="jobUrl"
                value={jobUrl}
                onChange={setJobUrl}
                placeholder="Job URL"
                required
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
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
                  <CopyButton
                    value={createResult.excelRowText}
                    label="Copy"
                    copiedLabel="Row Copied..."
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:cursor-pointer"
                  />
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
                  <CopyButton
                    value={createResult.starterPromptText}
                    label="Copy"
                    copiedLabel="Chat Copied..."
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:cursor-pointer"
                  />
                </div>
                <textarea
                  value={createResult.starterPromptText}
                  readOnly
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                />
              </div>
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
              <TypeaheadInput
                name="search"
                value={searchTerm}
                onChange={setSearchTerm}
                suggestions={searchSuggestions}
                placeholder="Search company, title, job ID, or URL"
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
              <div className="grid grid-cols-[minmax(0,0.6fr)_minmax(0,0.3fr)_minmax(0,2.0fr)_210px_56px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div>Company</div>
                <div>ID</div>
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
                        className={`hover:cursor-pointer grid w-full grid-cols-[minmax(0,0.6fr)_minmax(0,0.3fr)_minmax(0,2.0fr)_210px_56px] gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm transition last:border-b-0 ${
                          isSelected
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <div className="truncate font-medium">{app.company}</div>
                        <div className="truncate [direction:rtl] font-medium">{app.jobId}</div>
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

                {/* Document cards */}
                <div className="flex items-center gap-3">
                  {/* Resume card */}
                  {selected.resumePath ? (
                    <button
                      type="button"
                      onClick={() => openFile(selected.resumePath!)}
                      className="flex flex-col items-center gap-2 rounded-xl border border-slate-300 bg-white p-4 w-32 hover:bg-slate-50 hover:cursor-pointer transition"
                      title="Open Resume"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-600">Resume</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => createDocument("resume")}
                      disabled={creatingDoc !== null}
                      className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 w-32 hover:bg-slate-50 hover:cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Create Resume"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-400">
                        {creatingDoc === "resume" ? "Creating..." : "Create Resume"}
                      </span>
                    </button>
                  )}

                  {/* Cover Letter card */}
                  {selected.coverLetterPath ? (
                    <button
                      type="button"
                      onClick={() => openFile(selected.coverLetterPath!)}
                      className="flex flex-col items-center gap-2 rounded-xl border border-slate-300 bg-white p-4 w-32 hover:bg-slate-50 hover:cursor-pointer transition"
                      title="Open Cover Letter"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-600">Cover Letter</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => createDocument("coverLetter")}
                      disabled={creatingDoc !== null}
                      className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 w-32 hover:bg-slate-50 hover:cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Create Cover Letter"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-xs font-medium text-slate-400">
                        {creatingDoc === "coverLetter" ? "Creating..." : "Cover Letter"}
                      </span>
                    </button>
                  )}

                  {/* Folder button */}
                  <button
                    type="button"
                    onClick={openFolder}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 w-32 hover:bg-slate-50 hover:cursor-pointer transition"
                    title="Open Folder"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <span className="text-xs font-medium text-slate-600">Open Folder</span>
                  </button>
                </div>

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
                        {STATUS_GROUPS.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                                {group.options.map((statusOption) => (
                                <option key={statusOption} value={statusOption}>
                                    {statusOption}
                                </option>
                                ))}
                            </optgroup>
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
                      <div className="min-h-40 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                        {selected.notes?.trim() ? selected.notes : "No notes yet."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={startEditing}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 hover:cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={deleteApplication}
                        disabled={deleting}
                        className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
                      >
                        {deleting ? "Removing..." : "Remove"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={saveEdits}
                        disabled={updating}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
                      >
                        {updating ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={updating}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 hover:cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
