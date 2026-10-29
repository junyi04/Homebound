"""Homebound: standard-library-only HTTP server and persistent leaderboard."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).parent
DATA = Path(os.environ.get('DATA_DIR', ROOT.parent / '.local-data'))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'homebound.db'
ADMIN = os.environ.get('ADMIN_PASSWORD', '')
KST = timezone(timedelta(hours=9))
CONFIG = {'title': os.environ.get('GAME_TITLE', '집 가는 길'),
          'deadlineSeconds': max(10, min(60, int(os.environ.get('DEADLINE_SECONDS', '18')))),
          'trafficSpeed': max(.5, min(2, float(os.environ.get('TRAFFIC_SPEED', '1'))))}


@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize():
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
          CREATE TABLE IF NOT EXISTS runs (
            token TEXT PRIMARY KEY, mode TEXT NOT NULL, day TEXT NOT NULL,
            seed INTEGER NOT NULL, started REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL,
            distance INTEGER NOT NULL, mode TEXT NOT NULL, day TEXT NOT NULL,
            created TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS score_order ON scores(mode, day, score DESC);
        ''')


def day():
    return datetime.now(KST).strftime('%Y-%m-%d')


class Handler(BaseHTTPRequestHandler):
    server_version = 'Homebound/1.0'

    def send(self, status, value, content_type='application/json; charset=utf-8'):
        body = json.dumps(value, ensure_ascii=False).encode() if isinstance(value, (dict, list)) else value
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-store' if content_type.startswith('application/json') else 'no-cache')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/health/live':
            return self.send(200, {'status': 'alive'})
        if url.path == '/health/ready':
            try:
                with connect() as db:
                    db.execute('SELECT COUNT(*) FROM scores').fetchone()
                return self.send(200, {'status': 'ready'})
            except sqlite3.Error:
                return self.send(503, {'status': 'database unavailable'})
        if url.path == '/api/config':
            return self.send(200, {**CONFIG, 'day': day()})
        if url.path == '/api/leaderboard':
            mode = parse_qs(url.query).get('mode', ['daily'])[0]
            if mode not in ('daily', 'endless'):
                return self.send(400, {'error': '잘못된 게임 모드입니다.'})
            try:
                with connect() as db:
                    where = 'mode = ?' + (' AND day = ?' if mode == 'daily' else '')
                    args = [mode, day()] if mode == 'daily' else [mode]
                    rows = db.execute(f'''SELECT name, MAX(score) AS score, MAX(distance) AS distance
                        FROM scores WHERE {where} GROUP BY name
                        ORDER BY score DESC, name ASC LIMIT 10''', args).fetchall()
                return self.send(200, {'entries': [dict(r) for r in rows], 'day': day()})
            except sqlite3.Error:
                return self.send(503, {'error': '기록 보관소에 연결할 수 없습니다.'})
        files = {'/': ('index.html', 'text/html; charset=utf-8'),
                 '/style.css': ('style.css', 'text/css; charset=utf-8'),
                 '/game.js': ('game.js', 'text/javascript; charset=utf-8'),
                 '/engine.js': ('engine.js', 'text/javascript; charset=utf-8')}
        if url.path in files:
            filename, mime = files[url.path]
            return self.send(200, (ROOT / filename).read_bytes(), mime)
        self.send(404, {'error': '찾을 수 없는 경로입니다.'})

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 4096:
                return self.send(413, {'error': '요청 크기가 올바르지 않습니다.'})
            if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.send(415, {'error': 'JSON 요청만 허용됩니다.'})
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError()
            self.post_json(urlparse(self.path).path, body)
        except (ValueError, TypeError, KeyError, UnicodeDecodeError):
            self.send(400, {'error': '입력값을 확인해 주세요.'})
        except sqlite3.Error:
            self.send(503, {'error': '기록 보관소가 잠시 바쁩니다. 다시 시도해 주세요.'})

    def post_json(self, path, body):
        if path == '/api/runs':
            mode = body.get('mode', 'daily')
            if mode not in ('daily', 'endless'):
                raise ValueError()
            today = day()
            seed = int(hashlib.sha256(('homebound-v1-' + today).encode()).hexdigest()[:8], 16) if mode == 'daily' else secrets.randbits(32)
            token = secrets.token_urlsafe(24)
            with connect() as db:
                db.execute('DELETE FROM runs WHERE started < ?', (time.time() - 86400,))
                db.execute('INSERT INTO runs(token, mode, day, seed, started) VALUES (?,?,?,?,?)',
                           (token, mode, today, seed, time.time()))
            return self.send(201, {'token': token, 'seed': seed, 'day': today, 'config': CONFIG})
        if path == '/api/scores':
            name = body.get('name', '').strip()
            distance, cards = body.get('distance'), body.get('cards')
            if not re.fullmatch(r'[\w가-힣 .-]{1,12}', name) or type(distance) is not int or type(cards) is not int:
                raise ValueError()
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                run = db.execute('SELECT * FROM runs WHERE token = ?', (body.get('token', ''),)).fetchone()
                if not run or run['used']:
                    return self.send(409, {'error': '이미 저장했거나 만료된 게임입니다.'})
                elapsed = time.time() - run['started']
                if elapsed > 86400 or not 0 <= distance <= min(100000, int(elapsed * 9) + 3) or not 0 <= cards <= distance // 7 + 1:
                    return self.send(400, {'error': '게임 기록을 확인할 수 없습니다.'})
                score = distance * 10 + cards * 50
                db.execute('INSERT INTO scores(name,score,distance,mode,day,created) VALUES (?,?,?,?,?,?)',
                           (name, score, distance, run['mode'], run['day'], datetime.now(KST).isoformat()))
                db.execute('UPDATE runs SET used=1 WHERE token=?', (run['token'],))
            return self.send(201, {'score': score})
        if path == '/api/admin/reset':
            supplied = self.headers.get('Authorization', '').removeprefix('Bearer ')
            if not ADMIN or not hmac.compare_digest(supplied.encode(), ADMIN.encode()):
                return self.send(403, {'error': '관리자 비밀번호가 올바르지 않습니다.'})
            if body.get('confirm') != 'RESET':
                raise ValueError()
            with connect() as db:
                db.execute('DELETE FROM scores')
                db.execute('DELETE FROM runs')
            return self.send(200, {'status': 'reset'})
        self.send(404, {'error': '찾을 수 없는 경로입니다.'})


if __name__ == '__main__':
    initialize()
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler)
    print('Homebound listening on port', server.server_port, flush=True)
    server.serve_forever()
