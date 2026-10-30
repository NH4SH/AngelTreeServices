import sharp from "sharp";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const extensionsByType: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};

export type PreparedUpload = {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  size: number;
  scanStatus: "content_validated_not_malware_scanned";
};

export async function prepareSafeUpload(
  file: File,
  options: { maxBytes: number; allowDocuments?: boolean },
): Promise<{ data: PreparedUpload | null; error: string | null }> {
  if (!file.name || file.name.includes("/") || file.name.includes("\\") || file.name.includes("..")) {
    return rejected("The file name is not safe. Rename the file and try again.");
  }
  if (file.size <= 0 || file.size > options.maxBytes) {
    return rejected(`The file must be smaller than ${Math.floor(options.maxBytes / 1024 / 1024)} MB.`);
  }
  if (!imageTypes.has(file.type) && !(options.allowDocuments && documentTypes.has(file.type))) {
    return rejected("The selected file type is not supported.");
  }

  const allowedExtensions = extensionsByType[file.type] ?? [];
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!allowedExtensions.includes(extension)) {
    return rejected("The file extension does not match its declared type.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(file.type, input)) {
    return rejected("The file contents do not match the selected file type.");
  }

  if (imageTypes.has(file.type)) {
    try {
      const pipeline = sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 }).rotate();
      const output = file.type === "image/png"
        ? await pipeline.png().toBuffer()
        : file.type === "image/webp"
          ? await pipeline.webp({ quality: 90 }).toBuffer()
          : await pipeline.jpeg({ quality: 90 }).toBuffer();
      if (output.byteLength > options.maxBytes) return rejected("The normalized image is too large to upload.");
      return accepted(output, file.type, file.name);
    } catch {
      return rejected("The image is damaged or contains unsupported content.");
    }
  }

  return accepted(input, file.type, file.name);
}

// This interface is the deliberate integration point for a future managed
// malware scanner. Signature validation is not represented as a malware scan.
export async function scanPreparedUpload(_upload: PreparedUpload) {
  return { status: "not_configured" as const };
}

function matchesSignature(contentType: string, bytes: Buffer) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (contentType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "text/plain") {
    const start = bytes.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
    return !start.startsWith("<") && !start.startsWith("mz") && !start.includes("<script");
  }
  if (contentType.includes("openxmlformats")) return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (contentType === "application/msword" || contentType === "application/vnd.ms-excel") {
    return bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  return false;
}

function accepted(bytes: Uint8Array, contentType: string, fileName: string) {
  return {
    data: { bytes, contentType, fileName, size: bytes.byteLength, scanStatus: "content_validated_not_malware_scanned" as const },
    error: null,
  };
}

function rejected(error: string) {
  return { data: null, error };
}
