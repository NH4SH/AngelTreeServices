// Read-only preliminary host inspection. Does not install, start, deploy,
// configure a firewall, read credentials, or approve an environment for use.
import { readFileSync } from 'node:fs';
import { availableParallelism, arch, platform, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { isAbsolute, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const GiB = 1024 ** 3;
const architecture = value => ({ aarch64:'arm64', arm64:'arm64', x86_64:'amd64', amd64:'amd64', x64:'amd64' })[value];

export function socketArgument(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || !path.endsWith('.sock') || /[\s\x00-\x1f]/.test(path)) {
    throw Error('Use an explicit absolute local Unix socket path.');
  }
  return 'unix://' + path;
}

export function assessHost(facts) {
  const checks = {
    linuxUbuntu2404: facts.platform === 'linux' && facts.osId === 'ubuntu' && facts.osVersion === '24.04',
    supportedArchitecture: ['arm64','amd64'].includes(facts.architecture),
    hostCpu: Number.isInteger(facts.cpus) && facts.cpus >= 2,
    // An 8 GiB VM reserves some RAM for the kernel. This is usable-memory
    // screening, not a replacement for the purchased nominal 8 GiB requirement.
    hostUsableMemory: Number.isFinite(facts.memoryBytes) && facts.memoryBytes >= 7.5 * GiB,
    noActiveSwap: facts.activeSwapDevices === 0,
    dockerLinux: facts.dockerOS === 'linux',
    dockerSameArchitecture: facts.dockerArchitecture === facts.architecture && ['arm64','amd64'].includes(facts.architecture),
    dockerCpu: Number.isInteger(facts.dockerCpus) && facts.dockerCpus >= 2,
    dockerUsableMemory: Number.isFinite(facts.dockerMemoryBytes) && facts.dockerMemoryBytes >= 7.5 * GiB,
    rootlessDocker: facts.dockerRootless === true,
    cgroupV2Systemd: facts.dockerCgroupVersion === '2' && facts.dockerCgroupDriver === 'systemd',
  };
  return { preliminaryHostSuitable: Object.values(checks).every(Boolean), checks,
    architecture: facts.architecture ?? null, requiredNominalMemoryGiB:8,
    readyForActivation:false, changesApplied:false,
    pendingEvidence:[
      'Approved company account, host identity, cost and named operator',
      'Native image build/runtime and enforced cgroup limits on the actual host',
      'Two concurrent 25 MiB scans during definition update/reload within application timeout',
      'TLS/renewal and external firewall checks for IPv4 and IPv6; no bypass ports',
      'Reviewed rootless binding of public port 443 without a broad host security change',
      'Private credential mapping, no-swap/coredump policy and bounded logs',
      'Monitoring delivery, operator response and paired source-object/database recovery',
    ] };
}

export function inspectHost({ socket, dockerBin = 'docker' }) {
  const host = socketArgument(socket);
  if (platform() !== 'linux') throw Error('Run on the candidate Linux host, not the Mac or a container.');
  const release = Object.fromEntries(readFileSync('/etc/os-release','utf8').split('\n').filter(x=>x.includes('=')).map(x=> {
    const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];
  }));
  const swaps = readFileSync('/proc/swaps','utf8').trim().split('\n');
  if (!swaps[0]?.startsWith('Filename')) throw Error('Could not determine active swap state.');
  const info = JSON.parse(execFileSync(dockerBin,['--host',host,'info','--format','{{json .}}'],
    { encoding:'utf8',timeout:15000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe'] }));
  // Deliberately omit names, addresses, registry/auth data and the raw daemon
  // response. No environment or secret file is collected.
  const facts = { platform:platform(), architecture:architecture(arch()), osId:release.ID, osVersion:release.VERSION_ID,
    cpus:availableParallelism(), memoryBytes:totalmem(), activeSwapDevices:swaps.length-1,
    dockerOS:info.OSType, dockerArchitecture:architecture(info.Architecture), dockerCpus:info.NCPU,
    dockerMemoryBytes:info.MemTotal, dockerRootless:info.SecurityOptions?.includes('name=rootless') ?? false,
    dockerCgroupVersion:info.CgroupVersion, dockerCgroupDriver:info.CgroupDriver };
  return { scope:'preliminary host facts only; manually bind to the approved candidate host',facts,...assessHost(facts) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2);
    if (args.length===1 && args[0]==='--help') {
      console.log('inspect-host.mjs --socket /absolute/local/docker.sock [--docker-bin /path/to/docker]\nRead-only Linux host inspection. Never installs, starts, deploys, reads secrets or marks staging ready.');
    } else {
      if (![2,4].includes(args.length) || args[0]!=='--socket' || (args.length===4 && args[2]!=='--docker-bin')) throw Error('Invalid arguments.');
      const result=inspectHost({socket:args[1],dockerBin:args[3]});
      console.log(JSON.stringify(result,null,2)); if (!result.preliminaryHostSuitable) process.exitCode=1;
    }
  } catch { console.error('Host inspection could not verify the candidate. No settings changed; inspect the Linux host, local Docker socket and permissions privately.'); process.exitCode=1; }
}
