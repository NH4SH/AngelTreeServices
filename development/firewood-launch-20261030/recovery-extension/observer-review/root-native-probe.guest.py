import base64, hashlib, json, os, socket, subprocess, time
assert socket.gethostname() == 'lima-ats-firewood-qa' and os.getuid() == 501
SQL_BASE64 = '__SQL_BASE64__'
query = base64.b64decode(SQL_BASE64, validate=True)
assert hashlib.sha256(query).hexdigest() == 'fbb2cf2cc5d5c9469d5ee0af8742d4eb1806a33534c561566588441f087909a8'
base = ['/usr/bin/docker', '--host', 'unix:///run/user/501/docker.sock']
name = 'ats-full175-qa-24ba32d50d46-db'

def run(arguments, data=None):
    result = subprocess.run(base + arguments, input=data, capture_output=True, timeout=25)
    if result.returncode:
        safe_errors = [line for line in result.stderr.decode('utf-8', 'replace').splitlines()
                       if line.startswith(('ERROR:', 'FATAL:'))]
        raise RuntimeError(json.dumps({'exit': result.returncode, 'errors': safe_errors,
                                       'stderrSha256': hashlib.sha256(result.stderr).hexdigest()}))
    return result.stdout

fmt = '{"Id":{{json .Id}},"Image":{{json .Image}},"Labels":{{json .Config.Labels}},"Network":{{json .HostConfig.NetworkMode}},"ReadOnly":{{json .HostConfig.ReadonlyRootfs}},"Running":{{json .State.Running}}}'
seen = json.loads(run(['inspect', '--format', fmt, name]))
assert seen['Id'] == '13738e7877b63828f48870d74b9dbe1f50a7304360a8bc8f985c4eb6844e7b1a'
assert seen['Image'] == 'sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706'
assert seen['Labels']['ats-target'] == '24ba32d50d46' and seen['Network'] == 'none'
assert seen['ReadOnly'] is True and seen['Running'] is False

try:
    run(['start', name])
    for _ in range(40):
        ready = subprocess.run(base + ['exec', '--user=postgres', name, 'pg_isready', '-h', '/qa/socket',
                                       '-U', 'ats_qa_restore_operator', '-d', 'postgres'], capture_output=True, timeout=5)
        if ready.returncode == 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError('Owned observer target not ready')

    def psql(sql):
        return run(['exec', '-i', '--user=postgres', name, 'psql', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1',
                    '-h', '/qa/socket', '-U', 'ats_qa_restore_operator', '-d', 'postgres'], sql)

    identity = json.loads(psql(b"select jsonb_build_object('sid',(select system_identifier::text from pg_control_system()),'marker',(select shobj_description(oid,'pg_database')from pg_database where datname=current_database()));").strip())
    assert identity['sid'] == '7702467451076612106'
    assert identity['marker'] == 'ats-full175-qa:b5c42073-c80c-4e8d-a371-1d9dc336ede9:synthetic-only'
    started_at = time.monotonic()
    output = psql(b"begin read only;set local search_path=pg_catalog;set local timezone='UTC';set local statement_timeout='5s';set local lock_timeout='1s';set local jit=off;\n" + query + b'\nrollback;\n')
    elapsed = (time.monotonic() - started_at) * 1000
    value = json.loads(next(line for line in output.splitlines() if line.startswith(b'{')))
    print(json.dumps({'passed': True, 'targetId': '24ba32d50d46', 'qaSid': identity['sid'],
                      'querySha256': hashlib.sha256(query).hexdigest(), 'elapsedMs': round(elapsed, 2),
                      'result': value, 'jitDisabledForProbe': True, 'baselineStillKnownAclMismatch': True, 'productionAdmission': False}))
finally:
    run(['stop', '--timeout', '15', name])
