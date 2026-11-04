"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createBrowser } from "@/lib/supabase/browser";
import { registerMedia } from "../actions";

const MAX_MB = 50;

// Drag & drop photos/videos: uploads straight to Supabase Storage, then registers them.
export function MediaUploader({ code }: { code: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createBrowser();
    let done = 0;
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
      if (!kind) { setStatus(`${file.name}: formato no admitido`); continue; }
      if (file.size > MAX_MB * 1024 * 1024) { setStatus(`${file.name}: supera ${MAX_MB} MB`); continue; }
      setStatus(`Subiendo ${file.name}…`);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${code}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-media").upload(path, file, { contentType: file.type });
      if (error) { setStatus(`Error con ${file.name}: ${error.message}`); continue; }
      await registerMedia(code, path, kind);
      done++;
    }
    setStatus(done ? `${done} archivo(s) subidos` : null);
    router.refresh();
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${over ? "border-gold bg-gold-soft/20" : "border-border"}`}
    >
      <p className="font-medium">Arrastra aquí fotos o vídeos</p>
      <p className="text-xs text-muted">o haz clic para elegirlos · JPG, PNG, WebP, MP4, WebM, MOV · máx. {MAX_MB} MB</p>
      {status && <p className="mt-2 text-xs text-gold" aria-live="polite">{status}</p>}
      <input ref={inputRef} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
