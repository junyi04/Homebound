"""HTTP integration tests, including persistence across a real process restart."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{cls.port}'
        cls.start_server()

    @classmethod
    def start_server(cls):
        cls.process = subprocess.Popen([sys.executable, str(ROOT / 'app/server.py')],
            env={**os.environ, 'PORT': str(cls.port), 'DATA_DIR': cls.temp.name, 'ADMIN_PASSWORD': 'test-admin'},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urlopen(cls.base+'/health/ready', timeout=1) as response:
                    if response.status == 200:
                        return
            except OSError:
                time.sleep(.05)
        raise RuntimeError('Server failed to start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.temp.cleanup()

    def request(self, path, body=None, headers=None):
        request = Request(self.base+path, data=None if body is None else json.dumps(body).encode(),
                          headers={'Content-Type':'application/json', **(headers or {})})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            data = response.read()
            return response.status, json.loads(data) if response.headers['Content-Type'].startswith('application/json') else data

    def test_health_static_and_path_traversal(self):
        for path in ['/health/live', '/health/ready', '/', '/game.js', '/engine.js', '/audio.js', '/style.css']:
            self.assertEqual(self.request(path)[0], 200)
        self.assertEqual(self.request('/../server.py')[0], 404)

    def test_daily_seed_and_modes(self):
        a = self.request('/api/runs', {'mode':'daily'})[1]
        b = self.request('/api/runs', {'mode':'daily'})[1]
        self.assertEqual(a['seed'], b['seed'])
        self.assertNotEqual(a['token'], b['token'])
        self.assertEqual(self.request('/api/runs', {'mode':'wrong'})[0], 400)
        self.assertEqual(self.request('/api/leaderboard?mode=wrong')[0], 400)

    def test_score_validation_and_replay(self):
        run = self.request('/api/runs', {'mode':'daily'})[1]
        payload = {'token':run['token'], 'name':'tester', 'distance':1, 'cards':0}
        self.assertEqual(self.request('/api/scores', {**payload, 'distance':10000})[0], 400)
        self.assertEqual(self.request('/api/scores', {**payload, 'name':'<script>'})[0], 400)
        self.assertEqual(self.request('/api/scores', {**payload, 'cards':100})[0], 400)
        self.assertEqual(self.request('/api/scores', {**payload, 'distance':True})[0], 400)
        self.assertEqual(self.request('/api/scores', payload), (201, {'score':10}))
        self.assertEqual(self.request('/api/scores', payload)[0], 409)

    def test_admin_requires_secret_and_explicit_confirmation(self):
        self.assertEqual(self.request('/api/admin/reset', {'confirm':'RESET'})[0], 403)
        self.assertEqual(self.request('/api/admin/reset', {'confirm':'RESET'}, {'Authorization':'Bearer wrong'})[0], 403)
        self.assertEqual(self.request('/api/admin/reset', {'confirm':'NO'}, {'Authorization':'Bearer test-admin'})[0], 400)
        self.assertEqual(self.request('/api/admin/reset', {'confirm':'RESET'}, {'Authorization':'Bearer test-admin'})[0], 200)

    def test_z_persistence_across_process_restart(self):
        run = self.request('/api/runs', {'mode':'endless'})[1]
        self.assertEqual(self.request('/api/scores', {'token':run['token'],'name':'persistent','distance':2,'cards':0})[0], 201)
        self.process.terminate()
        self.process.wait(timeout=5)
        self.__class__.start_server()
        entries = self.request('/api/leaderboard?mode=endless')[1]['entries']
        self.assertTrue(any(r['name']=='persistent' and r['score']==20 for r in entries))
        # Readiness checks DB availability, while liveness is process-only.
        Path(self.temp.name, 'homebound.db').rename(Path(self.temp.name, 'saved.db'))
        self.assertEqual(self.request('/health/ready')[0], 503)
        self.assertEqual(self.request('/health/live')[0], 200)

if __name__ == '__main__':
    unittest.main(verbosity=2)
