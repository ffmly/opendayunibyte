"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { call } from "@/lib/supabase/callable";
import { Button } from "@/components/ui/button";
import { UserCheck, Pencil, X, Upload, Image as ImageIcon, Link as LinkIcon, AlertCircle, CheckCircle2 } from "lucide-react";

interface WorkshopRow {
  id: string;
  code: string;
  title: string;
  location?: string;
  xp: number;
  active: boolean;
  attendanceCount?: number;
  summary?: string;
  postImageUrl?: string;
  contentUrl?: string;
}

async function uploadToCloudinary(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (PNG, JPG, WebP, etc.).");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("The image must be smaller than 10 MB.");
  }
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary environment variables are missing.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "unibyte-open-day/workshops");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const result = (await response.json()) as { secure_url?: string; error?: { message?: string } };
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || "Image upload failed.");
  }
  return result.secure_url;
}

export default function AdminWorkshopsPage() {
  const [workshops, setWorkshops] = useState<WorkshopRow[]>([]);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [message, setMessage] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Edit modal state
  const [editingWorkshop, setEditingWorkshop] = useState<WorkshopRow | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editPostImageUrl, setEditPostImageUrl] = useState("");
  const [editContentUrl, setEditContentUrl] = useState("");
  const [editXp, setEditXp] = useState(100);
  const [editActive, setEditActive] = useState(true);
  const [editBusy, setEditBusy] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function uploadWorkshopImage(file: File) {
    setUploading(true);
    setMessage({});
    try {
      const url = await uploadToCloudinary(file);
      setPostImageUrl(url);
      setMessage({ ok: "Image uploaded. Create the workshop when the form is ready." });
    } catch (error) {
      setMessage({ err: (error as Error).message });
    } finally {
      setUploading(false);
    }
  }

  async function uploadEditWorkshopImage(file: File) {
    setEditUploading(true);
    setEditError(null);
    try {
      const url = await uploadToCloudinary(file);
      setEditPostImageUrl(url);
    } catch (error) {
      setEditError((error as Error).message);
    } finally {
      setEditUploading(false);
    }
  }

  const loadWorkshops = useCallback(async () => {
    try {
      const result = await call<unknown, { workshops: WorkshopRow[] }>("adminListWorkshops");
      setWorkshops(result.workshops);
    } catch (err) {
      console.error("Failed to load workshops", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await call<unknown, { workshops: WorkshopRow[] }>("adminListWorkshops");
        if (!cancelled) setWorkshops(result.workshops);
      } catch {
        // ignore transient poll error
      }
    };
    void load();
    const timer = window.setInterval(load, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function openEditModal(w: WorkshopRow) {
    setEditingWorkshop(w);
    setEditCode(w.code || "");
    setEditTitle(w.title || "");
    setEditLocation(w.location || "");
    setEditSummary(w.summary || "");
    setEditPostImageUrl(w.postImageUrl || "");
    setEditContentUrl(w.contentUrl || "");
    setEditXp(w.xp ?? 100);
    setEditActive(w.active ?? true);
    setEditError(null);
  }

  function closeEditModal() {
    setEditingWorkshop(null);
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingWorkshop) return;
    setEditBusy(true);
    setEditError(null);

    try {
      await call("adminUpdateWorkshop", {
        workshopId: editingWorkshop.id,
        code: editCode.trim(),
        title: editTitle.trim(),
        location: editLocation.trim(),
        summary: editSummary.trim(),
        postImageUrl: editPostImageUrl.trim(),
        contentUrl: editContentUrl.trim(),
        xp: Number(editXp) || 100,
        active: editActive,
      });

      setMessage({ ok: `Workshop "${editTitle.trim()}" updated successfully!` });
      closeEditModal();
      await loadWorkshops();
    } catch (err) {
      setEditError((err as { message?: string }).message ?? "Failed to update workshop");
    } finally {
      setEditBusy(false);
    }
  }

  async function toggleActive(w: WorkshopRow) {
    try {
      await call("adminUpdateWorkshop", {
        workshopId: w.id,
        active: !w.active,
      });
      setMessage({ ok: `Workshop ${w.code} is now ${!w.active ? "Active" : "Inactive"}.` });
      await loadWorkshops();
    } catch (err) {
      setMessage({ err: (err as { message?: string }).message ?? "Failed to toggle status" });
    }
  }

  async function createWorkshop(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage({});
    try {
      const res = await call<unknown, { workshopId: string }>("adminCreateWorkshop", {
        code,
        title,
        location: location || undefined,
        summary: summary || undefined,
        postImageUrl: postImageUrl || undefined,
        contentUrl: contentUrl || undefined,
      });
      setMessage({ ok: `Workshop created: ${res.workshopId}` });
      setCode("");
      setTitle("");
      setLocation("");
      setSummary("");
      setPostImageUrl("");
      setContentUrl("");
      await loadWorkshops();
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Workshops</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Manage workshops, edit descriptions and pictures, and view auto-generated check-in QR codes.
          </p>
        </div>
        <Link
          href="/admin/attendance"
          className="btn btn-outline btn-sm inline-flex items-center gap-1.5"
        >
          <UserCheck className="h-4 w-4" />
          <span>View All Attendance</span>
        </Link>
      </header>

      {message.ok && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3.5 py-2.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message.ok}</span>
        </div>
      )}
      {message.err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{message.err}</span>
        </div>
      )}

      {/* Create Workshop Form */}
      <form onSubmit={createWorkshop} className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-base font-bold text-ink">Create New Workshop</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Code *</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="WS-01" required />
          </div>
          <div>
            <label className="label">Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Web Dev 101" required />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lab B" />
          </div>
        </div>
        <div>
          <label className="label">Activity summary / description</label>
          <textarea className="input min-h-24 py-3" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What participants will discover in this workshop…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Workshop image (optional)</label>
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-primary/35 bg-primary-tint px-4 text-sm font-bold text-primary transition hover:bg-primary-soft">
              <Upload className="me-2 h-4 w-4" />
              {uploading ? "Uploading to Cloudinary…" : "Choose an image file"}
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadWorkshopImage(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="mt-1 text-xs text-ink-soft">One centered image, uploaded directly to Cloudinary.</p>
          </div>
          <div>
            <label className="label">Or paste an image URL</label>
            <input className="input" type="url" value={postImageUrl} onChange={(e) => setPostImageUrl(e.target.value)} placeholder="https://…/post.jpg" />
          </div>
        </div>
        {postImageUrl && (
          <div className="rounded-2xl border border-primary/15 bg-primary-tint/40 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={postImageUrl} alt="Workshop preview" className="mx-auto max-h-72 max-w-full rounded-xl object-contain" />
            <button type="button" className="mt-2 text-sm font-bold text-danger hover:underline block mx-auto" onClick={() => setPostImageUrl("")}>Remove image</button>
          </div>
        )}
        <div>
          <label className="label">Website or Instagram link (optional)</label>
          <input className="input" type="url" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="https://instagram.com/… or your website" />
        </div>
        <Button type="submit" loading={busy || uploading}>Create workshop + QR</Button>
      </form>

      {/* Workshops List */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="border-b border-line px-4 py-3 bg-surface-muted/30">
          <h2 className="text-sm font-bold text-ink">Existing Workshops ({workshops.length})</h2>
        </div>
        <ul className="divide-y divide-line">
          {workshops.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 hover:bg-ink/[0.01]">
              <div className="flex items-center gap-3">
                {w.postImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.postImageUrl}
                    alt={w.title}
                    className="h-12 w-12 rounded-xl object-cover border border-line shrink-0"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary font-black text-xs shrink-0">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink" dir="auto">{w.title}</p>
                    <span className="rounded-md bg-ink/5 px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                      {w.code}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {w.location ? `${w.location} · ` : ""}{w.xp} XP
                  </p>
                  {w.summary && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft/80 max-w-md" dir="auto">
                      {w.summary}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/admin/attendance"
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20"
                  title="View attendance details"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>{w.attendanceCount ?? 0} {w.attendanceCount === 1 ? "attendee" : "attendees"}</span>
                </Link>

                <button
                  type="button"
                  onClick={() => openEditModal(w)}
                  className="btn btn-outline btn-sm inline-flex items-center gap-1"
                  title="Edit title, description, image, or XP"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleActive(w)}
                  className={"badge cursor-pointer transition hover:opacity-80 " + (w.active ? "badge-success" : "badge-danger")}
                  title={w.active ? "Click to deactivate" : "Click to activate"}
                >
                  {w.active ? "Active" : "Inactive"}
                </button>
              </div>
            </li>
          ))}
          {workshops.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-ink-soft">No workshops yet.</li>
          )}
        </ul>
      </div>

      {/* Edit Workshop Modal */}
      {editingWorkshop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Edit Workshop</h3>
                  <p className="text-xs text-ink-soft">
                    Update title, description, picture, location, or XP for {editingWorkshop.code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-black/5 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">Code *</label>
                  <input
                    className="input"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    required
                    disabled={editBusy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Title *</label>
                  <input
                    className="input"
                    dir="auto"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    disabled={editBusy}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Location</label>
                  <input
                    className="input"
                    dir="auto"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="e.g. Lab B, Main Hall"
                    disabled={editBusy}
                  />
                </div>
                <div>
                  <label className="label">XP Reward</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="5"
                    value={editXp}
                    onChange={(e) => setEditXp(Number(e.target.value))}
                    disabled={editBusy}
                  />
                </div>
              </div>

              <div>
                <label className="label">Activity summary / description</label>
                <textarea
                  className="input min-h-28 py-2.5 text-sm leading-relaxed"
                  dir="auto"
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  placeholder="What participants will experience and learn in this workshop…"
                  disabled={editBusy}
                />
              </div>

              {/* Workshop Image Section */}
              <div className="space-y-2 rounded-xl border border-line bg-surface-muted/30 p-3.5">
                <label className="label font-bold text-ink">Workshop Image</label>

                {editPostImageUrl ? (
                  <div className="relative rounded-xl border border-primary/20 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editPostImageUrl}
                      alt="Workshop preview"
                      className="mx-auto max-h-56 rounded-lg object-contain"
                    />
                    <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs">
                      <span className="truncate text-ink-soft max-w-[280px]">{editPostImageUrl}</span>
                      <button
                        type="button"
                        onClick={() => setEditPostImageUrl("")}
                        className="font-bold text-danger hover:underline"
                        disabled={editBusy}
                      >
                        Remove image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-white p-4 text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-ink-soft/40" />
                    <p className="mt-1 text-xs text-ink-soft">No image currently set for this workshop.</p>
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2 pt-1">
                  <div>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-primary/35 bg-primary-tint px-3 text-xs font-bold text-primary transition hover:bg-primary-soft">
                      <Upload className="me-1.5 h-3.5 w-3.5" />
                      {editUploading ? "Uploading new picture…" : "Upload new image"}
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        disabled={editUploading || editBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadEditWorkshopImage(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <input
                      className="input h-11 text-xs"
                      type="url"
                      value={editPostImageUrl}
                      onChange={(e) => setEditPostImageUrl(e.target.value)}
                      placeholder="Or paste image URL"
                      disabled={editBusy}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Website or Instagram link (optional)</label>
                <div className="relative">
                  <LinkIcon className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
                  <input
                    className="input ps-9"
                    type="url"
                    value={editContentUrl}
                    onChange={(e) => setEditContentUrl(e.target.value)}
                    placeholder="https://instagram.com/… or website"
                    disabled={editBusy}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editWorkshopActive"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  disabled={editBusy}
                />
                <label htmlFor="editWorkshopActive" className="text-xs font-semibold text-ink cursor-pointer">
                  Workshop is active and open for attendee check-ins
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn btn-outline btn-sm"
                  disabled={editBusy || editUploading}
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  loading={editBusy || editUploading}
                  className="btn-sm"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
