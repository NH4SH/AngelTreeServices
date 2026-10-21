export type PrivateFileInfo = { name: string; label: string; size: number; mimeType: string; version: string; chunkBytes: number };
export async function loadPrivateFile(path: string, signal: AbortSignal): Promise<{ blob: Blob; info: PrivateFileInfo }> {
  if (!/^\/files\/[a-z_]+\/[a-f0-9-]{36}$/i.test(path)) throw new Error("File unavailable.");
  const infoResponse = await fetch(`${path}?info=1`, { cache: "no-store", credentials: "same-origin", signal });
  if (!infoResponse.ok) throw new Error("This file cannot be opened. Check its status or ask an administrator for help.");
  const info = await infoResponse.json() as PrivateFileInfo;
  if (!Number.isSafeInteger(info.size) || info.size < 1 || info.size > 25 * 1024 * 1024 || info.chunkBytes !== 1024 * 1024) throw new Error("File unavailable.");
  const parts: Blob[] = [];
  for (let start = 0; start < info.size; start += info.chunkBytes) {
    const end = Math.min(start + info.chunkBytes, info.size) - 1;
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", signal,
      headers: { Range: `bytes=${start}-${end}`, "x-ats-file-version": info.version } });
    if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${start}-${end}/${info.size}`
      || response.headers.get("x-ats-file-version") !== info.version) throw new Error("The file changed or access is no longer available. Open it again.");
    const part = await response.blob(); if (part.size !== end - start + 1) throw new Error("The download was interrupted. Try again.");
    parts.push(part);
  }
  return { blob: new Blob(parts, { type: info.mimeType }), info };
}
