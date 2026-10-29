"""Verify the assignment on the logged-in OpenShift project.

--recreate deletes ONLY the seven homebound resources (including its data PVC).
Do not use that option on a deployment containing records you want to keep.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--recreate', action='store_true')
args = parser.parse_args()
log = []

def oc(*arguments, timeout=180):
    command = ['oc', *arguments]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    log.append('$ ' + ' '.join(command) + '\n' + result.stdout.strip())
    print(result.stdout.strip(), flush=True)
    return result.stdout.strip()

if args.recreate:
    allowed = {'homebound', 'homebound-app', 'homebound-config', 'homebound-secret', 'homebound-data'}
    for path in (ROOT / 'k8s').glob('*.yaml'):
        obj = json.loads(path.read_text(encoding='utf-8'))
        assert obj['metadata']['name'] in allowed, 'Refusing to delete unrelated resources'
    oc('delete', '-f', 'k8s/', '--ignore-not-found', '--wait=true', '--timeout=90s')
oc('apply', '-f', 'k8s/')
oc('rollout', 'status', 'deployment/homebound', '--timeout=120s')
host = oc('get', 'route', 'homebound', '-o', 'jsonpath={.spec.host}')
base = 'https://' + host

def api(path, payload=None):
    request = Request(base + path, data=None if payload is None else json.dumps(payload).encode(),
                      headers={'Content-Type':'application/json'})
    with urlopen(request, timeout=15) as response:
        return json.load(response)

for attempt in range(30):
    try:
        assert api('/health/ready')['status'] == 'ready'
        break
    except Exception:
        if attempt == 29:
            raise
        time.sleep(2)

run = api('/api/runs', {'mode':'endless'})
saved = api('/api/scores', {'token':run['token'], 'name':'배포검증', 'distance':2, 'cards':0})
before = api('/api/leaderboard?mode=endless')
old_uid = oc('get', 'pod', '-l', 'app=homebound', '-o', 'jsonpath={.items[0].metadata.uid}')
oc('delete', 'pod', '-l', 'app=homebound', '--wait=true', '--timeout=60s')
oc('rollout', 'status', 'deployment/homebound', '--timeout=120s')
new_uid = oc('get', 'pod', '-l', 'app=homebound', '-o', 'jsonpath={.items[0].metadata.uid}')
assert old_uid != new_uid
for attempt in range(30):
    try:
        after = api('/api/leaderboard?mode=endless')
        break
    except Exception:
        if attempt == 29:
            raise
        time.sleep(2)
assert before == after, 'Leaderboard changed after Pod replacement'
assert any(entry['name'] == '배포검증' and entry['score'] == 20 for entry in after['entries'])
status = oc('get', 'deployment,pod,service,route,pvc', '-l', 'app=homebound', '-o', 'wide')
pod = json.loads(subprocess.check_output(['oc', 'get', 'pod', '-l', 'app=homebound', '-o', 'json'], encoding='utf-8'))['items'][0]
report = {'verified_at':datetime.now(timezone.utc).isoformat(), 'route':base,
          'clean_redeploy':args.recreate, 'https_readiness':'passed', 'score_saved':saved,
          'old_pod_uid':old_uid, 'new_pod_uid':new_uid, 'pvc_persistence':'passed',
          'leaderboard_before':before, 'leaderboard_after':after,
          'running_image':pod['status']['containerStatuses'][0]['imageID']}
(EVIDENCE / 'deployment-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
(EVIDENCE / 'openshift-status.txt').write_text('\n\n'.join(log)+'\n',encoding='utf-8')
print('PASS: clean deployment, HTTPS, score storage, and PVC persistence verified.',flush=True)
