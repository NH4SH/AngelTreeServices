// Old isolated photo/HR schemas deliberately predate PR18. Keep their tests
// focused on original upload authorization/audit behavior. The production scan
// wrapper is exercised separately against real Auth, Storage and ClamAV.
export const isolatedUploadOnly = {
 async uploadCheckedAttachment(client,bucket,path,upload,_actor,options={}) {
  return client.storage.from(bucket).upload(path,upload.bytes,{contentType:upload.contentType,upsert:false,...options});
 }
};
