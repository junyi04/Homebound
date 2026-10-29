"""Save the current deployment resource status for the submission."""
from datetime import datetime, timezone
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
command = ['oc', 'get', 'deployment,pod,replicaset,service,route,pvc', '-l', 'app=homebound', '--request-timeout=15s']
result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', timeout=90, check=True)
sections = [datetime.now(timezone.utc).isoformat(), '$ ' + ' '.join(command) + '\n' + result.stdout]
(root/'evidence/current-resources.txt').write_text('\n\n'.join(sections)+'\n', encoding='utf-8', newline='\n')
print('Saved current deployment resource status.')
