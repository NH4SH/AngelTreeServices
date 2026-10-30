import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import {pathToFileURL}from'node:url';
import{archiveReferencedPaths}from'./firewood-recovery-backup-utility.mjs';
// The deployed hosting runtime is intentionally separate from this feature tree.
const source=process.env.ATS_BACKUP_REVIEW_SOURCE;assert.ok(source?.startsWith('/'),'Set ATS_BACKUP_REVIEW_SOURCE to the reviewed private hosting source copy');
const {buildNativeFilePatch,verifyNativeFilePatchArchive}=await import(pathToFileURL(source+'/native-file-patch.mjs'));
const {verifyPrivateArchive}=await import(pathToFileURL(source+'/cloud-archive.mjs'));
test('native full-file and incremental verifiers accept the exact new empty archive',async()=>{const dir=fs.mkdtempSync(os.tmpdir()+'/ats-backup-format-'),file=dir+'/objects.tar';archiveReferencedPaths({},file,[],[]);assert.deepEqual(await verifyPrivateArchive(fs.createReadStream(file),[]),{files:0,bytes:0});const patch=buildNativeFilePatch([],[]),result=await verifyNativeFilePatchArchive(fs.createReadStream(file),[],patch);assert.equal(result.newFilesVerified,0);assert.equal(result.newBytesVerified,0);assert.equal(result.completeRecoveryPackage,false);});
