"""Generate closed fixture foundation from the authenticated rowless capsule.

No IO, SQL executor or provider operation. This preserves source role attributes,
membership options/grantors and GUC bytes, while keeping every ordinary role
NOLOGIN. The new owned bootstrap supabase_admin is the only operator login.
"""
import re

def ident(value):
    assert isinstance(value,str)and re.fullmatch('[a-z][a-z0-9_]{0,62}',value)
    return '"'+value+'"'

ATTRS=[('super','SUPERUSER'),('inherit','INHERIT'),('createRole','CREATEROLE'),('createDb','CREATEDB'),('replication','REPLICATION'),('bypassRls','BYPASSRLS')]
KEYS={'statement_timeout','lock_timeout','search_path','log_statement','idle_in_transaction_session_timeout','default_transaction_read_only','session_preload_libraries','app.settings.jwt_exp'}

def foundation_sql(catalog,settings,manifest,existing):
    roles=catalog['roles'];assert len(roles)==manifest['sourceRoles']==33
    assert len({r['name']for r in roles})==len(roles)
    ordinary={'ats_firewood_request','ats_firewood_worker','ats_firewood_health'}
    assert all(not any(r[k]for k,_ in ATTRS)for r in roles if r['name']in ordinary)
    assert not any(m['member']in ordinary for m in catalog['memberships'])
    current={r['name']:r for r in existing};commands=['BEGIN;']
    for r in roles:
        name=ident(r['name']);assert all(type(r[k])is bool for k,_ in ATTRS)
        assert r['validUntil']is None and type(r['connectionLimit'])is int and r['connectionLimit']>=-1
        if r['name']in current:
            assert all(current[r['name']][k]==r[k]for k,_ in ATTRS),'Fresh built-in/bootstrap role differs from captured attributes'
            assert current[r['name']]['connectionLimit']==r['connectionLimit']
            assert current[r['name']]['login']==(r['name']=='supabase_admin')
            continue
        assert not r['name'].startswith('pg_'),'Missing built-in role'
        opts=' '.join((''if r[k]else'NO')+option for k,option in ATTRS)
        commands.append('CREATE ROLE '+name+' '+opts+' NOLOGIN CONNECTION LIMIT '+str(r['connectionLimit'])+';')
    for m in catalog['memberships']:
        for field,option in [('admin','ADMIN'),('inherit','INHERIT'),('set','SET')]:
            assert type(m[field])is bool
            commands.append('GRANT '+ident(m['role'])+' TO '+ident(m['member'])+' WITH '+option+' '+str(m[field]).upper()+' GRANTED BY '+ident(m['grantor'])+';')
    db=manifest['sourceFoundation']['database'];assert db['name']=='postgres'and db['owner']=='postgres'
    commands.append('ALTER DATABASE postgres OWNER TO postgres;')
    commands.append('SET SESSION AUTHORIZATION postgres;')
    for name in ['PUBLIC']+[r['name']for r in roles]:
        commands.append('REVOKE ALL ON DATABASE postgres FROM '+('PUBLIC'if name=='PUBLIC'else ident(name))+';')
    for a in manifest['sourceDatabaseAclEntries']:
        assert a['grantor']=='postgres'and a['privilege']in ['CREATE','CONNECT','TEMPORARY']and type(a['grantable'])is bool
        target='PUBLIC'if a['grantee']=='PUBLIC'else ident(a['grantee'])
        commands.append('GRANT '+a['privilege']+' ON DATABASE postgres TO '+target+(' WITH GRANT OPTION'if a['grantable']else'')+';')
    commands+=['RESET SESSION AUTHORIZATION;','COMMIT;']
    for r in settings['roles']:
        for value in r['settings']:
            assert isinstance(value,str)and len(value.encode())<=2048
            key,text=value.split('=',1);assert key in KEYS and key!='app.settings.jwt_exp'
            if key in ['search_path','session_preload_libraries']:
                # List quoting is significant; the separately accepted native
                # probes prove these exact strings survive FROM CURRENT.
                hextext=text.encode().hex()
                commands.append("BEGIN;SELECT pg_catalog.set_config('"+key+"',pg_catalog.convert_from(pg_catalog.decode('"+hextext+"','hex'),'UTF8'),true);ALTER ROLE "+ident(r['name'])+' SET "'+key+'" FROM CURRENT;COMMIT;')
            else:
                # FROM CURRENT formats durations (60000 -> 1min). Preserve the
                # original literal for non-list GUCs; read back rolconfig later.
                assert re.fullmatch(r'[A-Za-z0-9_-]{1,64}',text)
                commands.append('ALTER ROLE '+ident(r['name'])+' SET "'+key+'" TO '+"'"+text+"';")
    scopes=manifest['sourceFoundation']['databaseSettings']
    dbscopes=[x for x in scopes if x['database']is not None]
    assert len(dbscopes)==1 and dbscopes[0]['database']=='postgres'and dbscopes[0]['role']is None
    assert dbscopes[0]['unknownSettingCount']==0
    value=dbscopes[0]['allowedSettings'];assert len(value)==1
    assert re.fullmatch(r'app\.settings\.jwt_exp=[0-9]{1,8}',value[0])
    text=value[0].split('=',1)[1]
    commands.append("BEGIN;SELECT pg_catalog.set_config('app.settings.jwt_exp','"+text+"',true);ALTER DATABASE postgres SET \"app.settings.jwt_exp\" FROM CURRENT;COMMIT;")
    return '\n'.join(commands)+'\n'
