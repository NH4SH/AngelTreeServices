"use client";
import { useEffect, useRef, useState } from "react";
import { loadPrivateFile } from "@/lib/files/private-file-client";

export function PrivateFileImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLSpanElement>(null); const [url, setUrl] = useState<string>(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); let objectUrl: string | undefined; setUrl(undefined); setFailed(false);
    const load = async () => { try { const file = await loadPrivateFile(src, abort.signal);
      if (!file.info.mimeType.startsWith("image/")) throw new Error("Image unavailable");
      if (!abort.signal.aborted) { objectUrl = URL.createObjectURL(file.blob); setUrl(objectUrl); }
    } catch { if (!abort.signal.aborted) setFailed(true); } };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); } });
    if (ref.current) observer.observe(ref.current);
    return () => { abort.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  return <span ref={ref} style={{ display: "block", minHeight: "44px" }}>{url ? <img src={url} alt={alt}/> : <span className="photo-thumbnail-unavailable" role="status">{failed ? "Preview unavailable. Open file to try again." : "Loading photo…"}</span>}</span>;
}
