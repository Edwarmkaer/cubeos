#!/usr/bin/env bash
set -euo pipefail
scratch=${1:?Pass exclusive private gate scratch}
python3 - "$scratch" <<'PY'
import hashlib, json, os, pathlib, subprocess, sys, time, urllib.error, urllib.request, uuid
scratch=pathlib.Path(sys.argv[1]).resolve()
suffix=uuid.uuid4().hex
network='cubeos-railway-'+suffix
pg=os.environ['RECOVERY_GATE_PG_CONTAINER']
api='cubeos-railway-api-'+suffix
web='cubeos-railway-web-'+suffix
apiport=int(os.environ.get('RECOVERY_API_PORT','8147'))
webport=int(os.environ.get('RECOVERY_WEB_PORT','3147'))
password=os.environ['POSTGRES_PASSWORD']
def run(args, **kw):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw).stdout
def envfile(name,values):
    p=scratch/name;p.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));p.chmod(0o600);return str(p)
def status(port,path,host=None):
    req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,headers={'Host':host} if host else {})
    try:
        with urllib.request.urlopen(req,timeout=2) as r:return r.status
    except urllib.error.HTTPError as e:return e.code
def wait(port,path,want,host=None):
    for _ in range(100):
        try:
            if status(port,path,host)==want:return
        except (OSError,urllib.error.URLError):pass
        time.sleep(.1)
    raise RuntimeError('container readiness did not reach expected state')
base={'DEPLOYMENT_MODE':'public','AUTH_MODE':'clerk','LISTEN_HOST':'0.0.0.0','PORT':str(apiport),
      'DATABASE_URL':'postgres://postgres:'+password+'@'+pg+':5432/railway_container?sslmode=disable',
      'PUBLIC_API_HOST':'api.fixture','ALLOWED_ORIGIN':'https://web.fixture','RAILWAY_HEALTHCHECK':'true',
      'CLERK_ISSUER':'https://auth.fixture','CLERK_JWKS_URL':'https://auth.fixture/.well-known/jwks.json',
      'CLERK_AUDIENCE':'cubeos','CLERK_SECRET_KEY':'fixture-only','MEDIA_STORAGE':'s3',
      'MEDIA_S3_ENDPOINT':'https://objects.fixture','MEDIA_S3_BUCKET':'private-fixture','MEDIA_S3_REGION':'us-east-1',
      'MEDIA_S3_ACCESS_KEY':'fixture-only','MEDIA_S3_SECRET_KEY':'fixture-only'}
run(['docker','network','create',network]);run(['docker','network','connect',network,pg])
try:
    for image in ['cubeos-recovery-api:gate','cubeos-recovery-web:gate','cubeos-recovery-tool:gate']:
        user=run(['docker','image','inspect','--format','{{.Config.User}}',image]).decode().strip()
        if user in ('','root','0','0:0'):raise RuntimeError('root image')
    # Every required public field must fail closed in the built API image.
    for field in ['CLERK_SECRET_KEY','MEDIA_S3_SECRET_KEY','PUBLIC_API_HOST']:
        incomplete=dict(base);incomplete.pop(field)
        p=subprocess.run(['docker','run','--rm','--network',network,'--env-file',envfile('missing-'+field+'.env',incomplete),'cubeos-recovery-api:gate'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
        if p.returncode==0 or password.encode() in p.stdout+p.stderr:raise RuntimeError('public env validation/leak')
    config=envfile('api.env',base)
    run(['docker','run','-d','--name',api,'--network',network,'--env-file',config,'-p','127.0.0.1:'+str(apiport)+':'+str(apiport),'cubeos-recovery-api:gate'])
    wait(apiport,'/readyz',503,'api.fixture')
    run(['docker','run','--rm','--network',network,'--env-file',config,'cubeos-recovery-api:gate','migrate'])
    wait(apiport,'/readyz',200,'healthcheck.railway.app')
    assert status(apiport,'/api/v1/devices','healthcheck.railway.app')==403
    assert status(apiport,'/api/v1/devices','api.fixture')==401
    assert run(['docker','exec',api,'id','-u']).strip()!=b'0'
    run(['docker','restart',api]);wait(apiport,'/readyz',200,'api.fixture')
    for mode,key,want in [('local','',200),('public','',503),('public','pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk',200)]:
        conf=envfile('web-'+mode+str(want)+'.env',{'DEPLOYMENT_MODE':mode,'CLERK_PUBLISHABLE_KEY':key,'PORT':str(webport),'HOSTNAME':'0.0.0.0'})
        run(['docker','run','-d','--name',web,'--network',network,'--env-file',conf,'-p','127.0.0.1:'+str(webport)+':'+str(webport),'cubeos-recovery-web:gate'])
        wait(webport,'/healthz',want)
        assert run(['docker','exec',web,'id','-u']).strip()!=b'0'
        run(['docker','stop',web]);run(['docker','rm',web])
    # Exercise the packaged recovery CLI and real PG17 clients, not just Go tests.
    archives=sorted((scratch/'archives').glob('local-*/manifest.json'))
    if not archives:raise RuntimeError('nonempty local recovery evidence required')
    archive=archives[-1].parent
    restoreid=uuid.uuid4()
    db='cubeos_restore_'+restoreid.hex
    run(['docker','exec',pg,'createdb','-U','postgres',db])
    target=scratch/('cubeos-restore-'+str(restoreid));target.mkdir(mode=0o700)
    # Test runner owns this new disposable mount; recovery remains non-root.
    os.chmod(target,0o700)
    recovery={'RECOVERY_DATABASE_URL':os.environ['TEST_RECOVERY_DATABASE_URL'].replace('/postgres?','/'+db+'?'),
              'RECOVERY_STORAGE':'local','RECOVERY_LOCAL_ROOT':str(target)}
    conf=envfile('recovery.env',recovery)
    run(['docker','run','--rm','--network','host','--user',str(os.getuid())+':'+str(os.getgid()),'--env-file',conf,
         '-v',str(scratch)+':'+str(scratch),'cubeos-recovery-tool:gate','restore',str(archive),'--new-disposable-target'])
    manifest=json.loads((archive/'manifest.json').read_text())
    assert len(manifest['objects'])>=4
    for entry in manifest['objects']:
        raw=(target/entry['key']).read_bytes()
        assert len(raw)==entry['size'] and hashlib.sha256(raw).hexdigest()==entry['sha256']
    count=run(['docker','exec',pg,'psql','-U','postgres','-d',db,'-XAt','-c','SELECT count(*) FROM received_packets']).strip()
    assert int(count)>=2
    # No overwrite on a retry of the exact same packaged command.
    p=subprocess.run(['docker','run','--rm','--network','host','--user',str(os.getuid())+':'+str(os.getgid()),'--env-file',conf,
                      '-v',str(scratch)+':'+str(scratch),'cubeos-recovery-tool:gate','restore',str(archive),'--new-disposable-target'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    assert p.returncode!=0 and password.encode() not in p.stdout+p.stderr
    print('PASS containers: nonroot/PORT/migration/readiness/runtime auth/failclosed; packaged DB+nonempty objects restore/SHA/refusal')
finally:
    subprocess.run(['docker','stop',api,web],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.run(['docker','network','disconnect',network,pg],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
PY
