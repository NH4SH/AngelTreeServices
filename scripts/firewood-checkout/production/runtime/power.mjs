import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export function powerStatus(text){const m=String(text).match(/(\d+)%;/u),ac=String(text).includes("'AC Power'");
  const percent=m?Number(m[1]):null;return {ac,percent,allowed:ac||percent!==null&&percent>10};}
export async function requirePower(){const {stdout}=await promisify(execFile)('/usr/bin/pmset',['-g','batt'],{timeout:5000,maxBuffer:16384});const status=powerStatus(stdout);if(!status.allowed)throw Error('power_below_owner_approved_threshold');return status;}
