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

          {loading && <p>Loading...</p>}

          {!loading &&
            applications.map((app) => (
              <div
                key={app._id}
                onClick={() => setSelected(app)}
                style={{
                  padding: 10,
                  marginBottom: 8,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: selected?._id === app._id ? "#eee" : "transparent",
                }}
              >
                <strong>{app.company}</strong>
                <div>{app.jobTitle}</div>
                <div style={{ fontSize: 12 }}>{app.status}</div>
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
                <strong>Job Title:</strong> {selected.jobTitle}
              </div>

              <div>
                <strong>Job ID:</strong> {selected.jobId}
              </div>

              <div>
                <strong>Link:</strong>{" "}
                <a href={selected.jobUrl} target="_blank" rel="noreferrer">
                  {selected.jobUrl}
                </a>
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
              </div>

              <div>
                <strong>Days Since Applied:</strong> {daysSince(selected.createdAt)}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}