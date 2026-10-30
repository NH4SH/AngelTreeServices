import Link from "next/link";
export function AttachmentCheckLink({bucket,sourceType,sourceId}:{bucket:string;sourceType?:string;sourceId?:string}) {
  const query = new URLSearchParams(sourceType && sourceId ? {source:sourceType,id:sourceId,view:"all"} : {bucket});
  return <Link className="secondary-action" href={`/files?${query}`}>Review file checks</Link>;
}
