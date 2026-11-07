"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { call } from "@/lib/supabase/callable";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";

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

  async function uploadWorkshopImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setMessage({ err: "Choose an image file." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ err: "The image must be smaller than 10 MB." });
      return;
    }
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      setMessage({ err: "Cloudinary environment variables are missing." });
      return;
    }
    setUploading(true);
    setMessage({});
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", uploadPreset);
      form.append("folder", "unibyte-open-day/workshops");
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form,
      });
      const result = await response.json() as { secure_url?: string; error?: { message?: string } };
      if (!response.ok || !result.secure_url) {
        throw new Error(result.error?.message || "Image upload failed.");
      }
      setPostImageUrl(result.secure_url);
      setMessage({ ok: "Image uploaded. Create the workshop when the form is ready." });
    } catch (error) {
      setMessage({ err: (error as Error).message });
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<unknown, { workshops: WorkshopRow[] }>("adminListWorkshops");
      if (!cancelled) setWorkshops(result.workshops);
    };
    void load();
    const timer = window.setInterval(load, 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

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
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-ink">Workshops</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Each workshop auto-generates a check-in QR code.
        </p>
      </header>

      {message.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-success">{message.ok}</p>}
      {message.err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{message.err}</p>}

      <form onSubmit={createWorkshop} className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Code</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="WS-01" required />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Web Dev 101" required />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lab B" />
          </div>
        </div>
        <div>
          <label className="label">Activity summary</label>
          <textarea className="input min-h-24 py-3" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What participants will discover in this workshop…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Workshop image (optional)</label>
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-primary/35 bg-primary-tint px-4 text-sm font-bold text-primary transition hover:bg-primary-soft">
              {uploading ? "Uploading…" : "Choose an image"}
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
            <p className="mt-1 text-xs text-ink-soft">One centered image, uploaded to Cloudinary.</p>
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
            <button type="button" className="mt-2 text-sm font-bold text-danger" onClick={() => setPostImageUrl("")}>Remove image</button>
          </div>
        )}
        <div>
          <label className="label">Website or Instagram link (optional)</label>
          <input className="input" type="url" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="https://instagram.com/… or your website" />
        </div>
        <Button type="submit" loading={busy || uploading}>Create workshop + QR</Button>
      </form>

      <div className="rounded-2xl border border-line bg-white">
        <ul className="divide-y divide-line">
          {workshops.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink">{w.title}</p>
                <p className="text-xs text-ink-soft">
                  {w.code} {w.location && `· ${w.location}`} · {w.xp} XP
                </p>
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
                <span className={"badge " + (w.active ? "badge-success" : "badge-danger")}>
                  {w.active ? "Active" : "Inactive"}
                </span>
              </div>
            </li>
          ))}
          {workshops.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-ink-soft">No workshops yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
