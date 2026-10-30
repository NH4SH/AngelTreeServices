export const stagingBucket = "platform-upload-staging";
export const maxTransferBytes = 25 * 1024 * 1024;
const prefix = "ats-upload:v1:";
export type UploadReference = { id: string; name: string; type: string };
export function isUploadReference(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(prefix);
}
export function encodeUploadReference(value: UploadReference) {
  return prefix + JSON.stringify(value);
}
export function parseUploadReference(value: string): UploadReference {
  if (!isUploadReference(value) || value.length > 1200) throw new Error("Invalid upload reference.");
  const parsed = JSON.parse(value.slice(prefix.length));
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(parsed.id)
    || typeof parsed.name !== "string" || parsed.name.length > 255 || !parsed.name
    || typeof parsed.type !== "string" || parsed.type.length > 150) throw new Error("Invalid upload reference.");
  return { id: parsed.id, name: parsed.name, type: parsed.type };
}
