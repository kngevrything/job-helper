"use client";

import { useEffect, useState } from "react";
import { JOB_APPLICATION_STATUSES } from "@/lib/jobApplicationStatuses";

type Application = {
  _id: string;
  company: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  status: string;
  notes: string;
  createdAt: string;
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

export default function Home() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sortOrder, setSortOrder] = useState<string>("newest");
  const [isEditing, setIsEditing] = useState(false);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editJobUrl, setEditJobUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [company, setCompany] = useState("");
  const [jobId, setJobId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

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

  function daysSince(dateStr: string) {
    const created = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - created.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
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

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Copy failed.");
    }
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 24 }}>
      <section style={{ border: "1px solid #ccc", padding: 16 }}>
        <h1>Job Application Tracker</h1>

        <form onSubmit={handleCreate} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <input
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
          />

          <input
            placeholder="Job ID"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            required
          />

          <input
            placeholder="Job Title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
          />

          <input
            placeholder="Job URL"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            required
          />

          <button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Application"}
          </button>
        </form>

        {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

        {createResult && (
          <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
            <p style={{ color: "green" }}>Application created successfully.</p>

            {createResult.folderPath && (
              <p>
                <strong>Folder:</strong> {createResult.folderPath}
              </p>
            )}

            <div>
              <h3>Excel Row</h3>
              <textarea
                value={createResult.excelRowText}
                readOnly
                rows={2}
                style={{ width: "100%" }}
              />
              <button type="button" onClick={() => copy(createResult.excelRowText)}>
                Copy Excel Row
              </button>
            </div>

            <div>
              <h3>Starter Prompt</h3>
              <textarea
                value={createResult.starterPromptText}
                readOnly
                rows={3}
                style={{ width: "100%" }}
              />
              <button type="button" onClick={() => copy(createResult.starterPromptText)}>
                Copy Prompt
              </button>
            </div>

            {(createResult.resumePath || createResult.coverLetterPath) && (
              <div>
                <h3>Created Files</h3>
                {createResult.resumePath && (
                  <p>
                    <strong>Resume:</strong> {createResult.resumePath}
                  </p>
                )}
                {createResult.coverLetterPath && (
                  <p>
                    <strong>Cover Letter:</strong> {createResult.coverLetterPath}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

    

      <section style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ width: 350 }}>
          <h2>Applications</h2>
          <input
            placeholder="Search company, title, or job ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          >
            <option value="All">All Statuses</option>
            {JOB_APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="company-asc">Company A-Z</option>
            <option value="company-desc">Company Z-A</option>
          </select>
          {loading && <p>Loading...</p>}
  
          {!loading && visibleApplications.length === 0 && (
            <p>No matching applications.</p>
          )}
          {!loading &&
            visibleApplications.map((app) => (
              <div
                key={app._id}
                onClick={() => {
                  setSelected(app);
                  setIsEditing(false);
                }}
                style={{
                  padding: 10,
                  marginBottom: 8,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: selected?._id === app._id ? "#eee" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <div>
                  <strong>{app.company}</strong>
                  <div>{app.jobTitle}</div>
                  <div style={{ fontSize: 12 }}>{app.status}</div>
                </div>

                <div style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {daysSince(app.createdAt)}d
                </div>
              </div>
            ))}
        </div>

        <div style={{ flex: 1 }}>
          <h2>Details</h2>

          {!selected && <p>Select an application</p>}

          {selected && (
            <div style={{ display: "grid", gap: 12 }}>
              <div>
              <strong>Company:</strong> {selected.company}
                </div>

                <div>
                  <strong>Job ID:</strong> {selected.jobId}
                </div>

                <div>
                  <strong>Job Title:</strong>{" "}
                  {isEditing ? (
                    <input
                      value={editJobTitle}
                      onChange={(e) => setEditJobTitle(e.target.value)}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  ) : (
                    selected.jobTitle
                  )}
                </div>

                <div>
                  <strong>Link:</strong>{" "}
                  {isEditing ? (
                    <input
                      value={editJobUrl}
                      onChange={(e) => setEditJobUrl(e.target.value)}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  ) : (
                    <a href={selected.jobUrl} target="_blank" rel="noreferrer">
                      {selected.jobUrl}
                    </a>
                  )}
                </div>

              <div>
                <strong>Status:</strong>{" "}
                <select
                  value={selected.status}
                  onChange={(e) => updateStatus(selected._id, e.target.value)}
                  disabled={updating}
                >
                  {JOB_APPLICATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              </div>

              <div>
                <strong>Days Since Applied:</strong> {daysSince(selected.createdAt)}
              </div>
              <div>
              <strong>Notes:</strong>
              {isEditing ? (
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={6}
                  style={{ width: "100%", marginTop: 4, border: "1px solid #ccc" }}
                />
              ) : (
                <div
                  style={{
                    marginTop: 4,
                    padding: 8,
                    border: "1px solid #ccc",
                    minHeight: 100,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {selected.notes?.trim() ? selected.notes : "No notes yet."}
                </div>
              )}
            </div>
              
            {!isEditing ? (
              <button type="button" onClick={startEditing}>
                Edit
              </button>
            ) : (
              <>
                <button type="button" onClick={saveEdits} disabled={updating}>
                  {updating ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={cancelEditing} disabled={updating}>
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
            >
              Open Folder
            </button>
          </div>
          </div>
        )}
        </div>
      </section>
    </main>
  );
}