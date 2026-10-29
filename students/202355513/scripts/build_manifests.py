"""Generate deployable YAML-compatible JSON using only the Python standard library."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
K8S = ROOT / 'k8s'

def resource(kind, name, api='v1', **fields):
    return {'apiVersion': api, 'kind': kind, 'metadata': {'name': name, 'labels': {'app': 'homebound'}}, **fields}

def write(name, value):
    (K8S / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

def probe(path, period, failures):
    return {'httpGet': {'path': path, 'port': 'http'}, 'periodSeconds': period, 'timeoutSeconds': 2, 'failureThreshold': failures}

def build():
    K8S.mkdir(exist_ok=True)
    assets = {name: (ROOT / 'app' / name).read_text(encoding='utf-8')
              for name in ['server.py', 'index.html', 'style.css', 'engine.js', 'game.js']}
    write('app-configmap.yaml', resource('ConfigMap', 'homebound-app', data=assets))
    write('configmap.yaml', resource('ConfigMap', 'homebound-config', data={
        'GAME_TITLE': '집 가는 길', 'DEADLINE_SECONDS': '18', 'TRAFFIC_SPEED': '1', 'PORT': '8080'}))
    # This is an explicitly public classroom-demo credential, not a production secret.
    write('secret.yaml', resource('Secret', 'homebound-secret', type='Opaque',
                                 stringData={'ADMIN_PASSWORD': 'homebound-demo-2026!'}))
    write('pvc.yaml', resource('PersistentVolumeClaim', 'homebound-data', spec={
        'accessModes': ['ReadWriteOnce'], 'resources': {'requests': {'storage': '500Mi'}}}))
    write('service.yaml', resource('Service', 'homebound', spec={
        'selector': {'app': 'homebound'}, 'ports': [{'name': 'http', 'port': 8080, 'targetPort': 'http'}], 'type': 'ClusterIP'}))
    write('route.yaml', resource('Route', 'homebound', api='route.openshift.io/v1', spec={
        'to': {'kind': 'Service', 'name': 'homebound'}, 'port': {'targetPort': 'http'},
        'tls': {'termination': 'edge', 'insecureEdgeTerminationPolicy': 'Redirect'}}))
    write('deployment.yaml', resource('Deployment', 'homebound', api='apps/v1', spec={
        'replicas': 1, 'strategy': {'type': 'Recreate'}, 'selector': {'matchLabels': {'app': 'homebound'}},
        'template': {'metadata': {'labels': {'app': 'homebound'}}, 'spec': {
            'automountServiceAccountToken': False,
            'securityContext': {'runAsNonRoot': True, 'seccompProfile': {'type': 'RuntimeDefault'}},
            'containers': [{
                'name': 'homebound', 'image': 'registry.access.redhat.com/ubi9/python-312:latest', 'imagePullPolicy': 'Always',
                'command': ['python', '/app/server.py'], 'ports': [{'name': 'http', 'containerPort': 8080}],
                'envFrom': [{'configMapRef': {'name': 'homebound-config'}}],
                'env': [{'name': 'ADMIN_PASSWORD', 'valueFrom': {'secretKeyRef': {'name': 'homebound-secret', 'key': 'ADMIN_PASSWORD'}}},
                        {'name': 'DATA_DIR', 'value': '/data'}, {'name': 'PYTHONDONTWRITEBYTECODE', 'value': '1'},
                        {'name': 'PYTHONUNBUFFERED', 'value': '1'}],
                'securityContext': {'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True, 'capabilities': {'drop': ['ALL']}},
                'volumeMounts': [{'name': 'app-code', 'mountPath': '/app', 'readOnly': True},
                                 {'name': 'game-data', 'mountPath': '/data'}, {'name': 'temp', 'mountPath': '/tmp'}],
                'startupProbe': probe('/health/ready', 2, 30), 'readinessProbe': probe('/health/ready', 5, 3),
                'livenessProbe': probe('/health/live', 10, 3),
                'resources': {'requests': {'cpu': '50m', 'memory': '64Mi'}, 'limits': {'cpu': '500m', 'memory': '256Mi'}}}],
            'volumes': [{'name': 'app-code', 'configMap': {'name': 'homebound-app'}},
                        {'name': 'game-data', 'persistentVolumeClaim': {'claimName': 'homebound-data'}},
                        {'name': 'temp', 'emptyDir': {'sizeLimit': '16Mi'}}]}}}))
    print('Generated 7 manifests. Deploy using: oc apply -f k8s/')

if __name__ == '__main__':
    build()
