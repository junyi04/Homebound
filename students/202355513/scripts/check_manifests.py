"""Check portable submission contracts and exact runtime/source parity."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
objects = {p.stem: json.loads(p.read_text(encoding='utf-8')) for p in (root/'k8s').glob('*.yaml')}
assert len(objects) == 7
for name, obj in objects.items():
    for key in ['namespace','uid','resourceVersion','creationTimestamp','managedFields']:
        assert key not in obj['metadata'], (name, key)
    assert 'status' not in obj
    assert obj['metadata']['labels']['app'] == 'homebound'
assert 'host' not in objects['route']['spec']
assert objects['route']['spec']['to']['name'] == objects['service']['metadata']['name']
deployment = objects['deployment']['spec']
assert deployment['selector']['matchLabels'] == deployment['template']['metadata']['labels'] == objects['service']['spec']['selector']
container = deployment['template']['spec']['containers'][0]
assert container['resources']['requests'] and container['resources']['limits']
assert container['ports'][0]['name'] == objects['service']['spec']['ports'][0]['targetPort']
assert objects['route']['spec']['port']['targetPort'] == objects['service']['spec']['ports'][0]['name']
for key in ['startupProbe','readinessProbe','livenessProbe']:
    assert container[key]['httpGet']['port'] == 'http'
assert container['env'][0]['valueFrom']['secretKeyRef']['name'] == objects['secret']['metadata']['name']
assert deployment['template']['spec']['volumes'][1]['persistentVolumeClaim']['claimName'] == objects['pvc']['metadata']['name']
assert deployment['replicas'] == 1 and deployment['strategy']['type'] == 'Recreate'
assets = objects['app-configmap']['data']
assert sum(len(text.encode()) for text in assets.values()) < 1024*1024
for name, text in assets.items():
    assert text == (root/'app'/name).read_text(encoding='utf-8'), f'Regenerate ConfigMap: {name}'
print('PASS: 7 portable resources, matching selectors/ports/references, resource limits, 3 probes, exact embedded source parity.')
