"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPrivateFile } from "@/lib/files/private-file-client";

export function PrivateFileViewer({ path }: { path: string }) {
  const [attempt, setAttempt] = useState(0); const [error, setError] = useState("");
  const [file, setFile] = useState<{ url: string; name: string; label: string; image: boolean; canOpen: boolean }>();
  useEffect(() => {
    const abort = new AbortController(); let url: string | undefined; setFile(undefined); setError("");
    void loadPrivateFile(path, abort.signal).then(result => { if (abort.signal.aborted) return;
      url = URL.createObjectURL(result.blob); setFile({ url, name: result.info.name, label: result.info.label,
        image: result.info.mimeType.startsWith("image/"), canOpen: ["application/pdf", "text/plain"].includes(result.info.mimeType) });
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "The download was interrupted. Try again."); });
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [path, attempt]);
  return <>
    <section className="page-heading"><h1>{file?.label || "Open file"}</h1><Link className="secondary-action" href="/files?view=all">Back to File checks</Link></section>
    {error ? <section className="empty-state" aria-live="polite"><h2>File unavailable</h2><p>{error}</p><button className="secondary-action" onClick={() => setAttempt(value => value + 1)}>Try again</button></section>
      : !file ? <p role="status">Opening your file…</p> : <section className="private-file-preview">
        <div className="file-open-actions"><a className="secondary-action" href={file.url} download={file.name}>Download file</a>
          {file.canOpen ? <a className="secondary-action" href={file.url} target="_blank" rel="noreferrer">Open file</a> : null}</div>
        {file.image ? <img src={file.url} alt={file.label}/> : <p>Your file is ready. Save a copy to use it.</p>}
      </section>}
  </>;
}
