import {lane, obstacles, collision, score, random} from './engine.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let mode = 'daily', phase = 'welcome', run = null, config = {deadlineSeconds:18,trafficSpeed:1};
let x = 4, row = 0, distance = 0, cards = 0, elapsed = 0, lastProgress = 0, lastMove = -1;
let shield = false, boostUntil = 0, invincibleUntil = 0, effectUntil = 0, camera = 0, visualX = 4, visualRow = 0;
let collected = new Set(), lanes = new Map(), lastFrame = 0, previewTime = 0, sound = false, audio;
let best = 0, rankRequest = 0;
const shell = $('game-shell');
const lobbyElements = document.querySelectorAll('.header, .intro, aside, .notes, footer');
let focused = false, nativeFullscreen = false;
function setFocused(value) {
  focused = value;
  document.body.classList.toggle('is-playing', value);
  shell.classList.toggle('is-focused', value);
  lobbyElements.forEach(element => { element.inert = value; });
  if (!value && document.fullscreenElement === shell) document.exitFullscreen().catch(() => {});
}
function showLobby() {
  pause();
  setFocused(false);
  if (phase === 'paused') $('resume').focus({preventScroll:true});
  else if (phase === 'over') $('back').focus({preventScroll:true});
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === shell) await document.exitFullscreen();
    else if (shell.requestFullscreen && document.fullscreenEnabled) await shell.requestFullscreen();
    else toast('이 브라우저에서는 현재 크기의 게임 화면을 사용해 주세요.', 4);
  } catch { toast('전체화면을 열 수 없어요. 현재 화면에서 계속 즐겨 주세요.', 4); }
}
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === shell;
  $('fullscreen').setAttribute('aria-pressed', String(active));
  $('fullscreen').querySelector('span').textContent = active ? '전체화면 해제' : '전체화면';
  if (nativeFullscreen && !active) showLobby();
  nativeFullscreen = active;
});
try { best = Number(localStorage.getItem('homebound-best')) || 0; $('nickname').value = localStorage.getItem('homebound-name') || ''; } catch {}
$('best').innerHTML = `내 최고 <b>${best}</b>`;
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: {'Content-Type':'application/json', ...options.headers}, signal:AbortSignal.timeout(10000)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '서버에 연결할 수 없습니다.');
  return data;
}
function beep(freq = 440, duration = .06) {
  if (!sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = freq; gain.gain.setValueAtTime(.045,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime+duration); } catch {}
}
function toast(message, seconds = 2) { $('effect').textContent = message; effectUntil = elapsed + seconds; }
function getLane(r) { if (!lanes.has(r)) lanes.set(r,lane(run?.seed || 1729,r)); return lanes.get(r); }
function updateHUD() {
  $('distance').innerHTML = `${distance} <small>m</small>`;
  $('score').textContent = String(score(distance,cards)).padStart(4,'0');
  $('zone').textContent = row < 30 ? '01 / 캠퍼스 정문' : row < 65 ? '02 / 대학가 골목' : '03 / 집 앞 공사 구간';
  $('deadline-bar').max = config.deadlineSeconds;
  $('deadline-bar').value = Math.max(0,config.deadlineSeconds - (elapsed-lastProgress));
}
async function refreshRanking() {
  const request = ++rankRequest;
  $('ranking-description').textContent = mode === 'daily' ? '같은 길, 다른 기록. 오늘의 귀가왕은?' : '어디까지 가 봤니? 역대 최고 귀가 기록.';
  try {
    const data = await api(`/api/leaderboard?mode=${mode}`);
    if (request !== rankRequest) return;
    $('rankings').replaceChildren();
    if (!data.entries.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 발자국이 없어요. 첫 번째 귀가왕이 되어 보세요!'; $('rankings').append(li); }
    data.entries.forEach((entry,i) => { const li = document.createElement('li'), rank = document.createElement('span'), name = document.createElement('span'), points = document.createElement('strong'); rank.className = 'rank'; rank.textContent = String(i+1).padStart(2,'0'); name.className = 'name'; name.textContent = entry.name; points.textContent = entry.score.toLocaleString(); li.append(rank,name,points); $('rankings').append(li); });
    $('day').textContent = data.day.replaceAll('-','.');
  } catch { if (request !== rankRequest) return; $('rankings').replaceChildren(); const li = document.createElement('li'); li.className = 'empty'; li.textContent = '랭킹 연결 실패. ↻ 버튼으로 다시 시도하세요.'; $('rankings').append(li); }
}
function setMode(next) {
  if (phase === 'playing' || phase === 'paused' || phase === 'starting') return;
  mode = next;
  for (const m of ['daily','endless']) { $(m).classList.toggle('selected',m===mode); $(m).setAttribute('aria-pressed',String(m===mode)); }
  refreshRanking();
}
async function start() {
  if (phase === 'starting') return;
  phase = 'starting'; $('start-error').textContent = ''; $('save-message').textContent = ''; $('start').disabled = true; $('retry').disabled = true;
  $('exit-focus').disabled = true;
  setFocused(true);
  try {
    run = await api('/api/runs',{method:'POST',body:JSON.stringify({mode})}); config = run.config;
    x=4;row=0;distance=0;cards=0;elapsed=0;lastProgress=0;lastMove=-1;camera=0;visualX=4;visualRow=0;shield=false;boostUntil=0;invincibleUntil=0;collected=new Set();lanes=new Map();
    $('welcome').hidden=true; $('result').hidden=true; $('paused').hidden=true; $('pause').hidden=false; $('deadline').hidden=false; $('effect').textContent=''; $('save').disabled=false; $('save-form').hidden=false;
    $('daily').disabled=true; $('endless').disabled=true; phase='playing'; updateHUD(); canvas.focus({preventScroll:true}); beep(660,.1);
  } catch (error) { phase='welcome'; setFocused(false); $('daily').disabled=false; $('endless').disabled=false; $('result').hidden=true; $('welcome').hidden=false; $('start-error').textContent=`출발 준비 실패: ${error.message} 다시 눌러 주세요.`; }
  finally { $('start').disabled=false; $('retry').disabled=false; $('exit-focus').disabled=false; }
}
function finish(reason) {
  if (phase!=='playing') return;
  phase='over'; $('pause').hidden=true; $('deadline').hidden=true; $('effect').textContent=''; $('result').hidden=false;
  $('reason').textContent=reason; $('final-score').textContent=score(distance,cards).toLocaleString(); $('final-distance').textContent=`${distance}m 걸음 · 학생증 ${cards}개 수집`;
  $('result-title').textContent = distance >= 65 ? '귀가의 달인 인정!' : distance >= 30 ? '집이 보일 뻔했는데!' : '오늘의 귀가 종료!';
  best=Math.max(best,score(distance,cards)); try { localStorage.setItem('homebound-best',String(best)); } catch {}
  $('best').innerHTML=`내 최고 <b>${best}</b>`; beep(150,.25); $('nickname').focus({preventScroll:true});
}
function pause() { if(phase==='playing'){phase='paused';$('paused').hidden=false;$('resume').focus({preventScroll:true});} }
function resume() { if(phase==='paused'){setFocused(true);phase='playing';$('paused').hidden=true;canvas.focus({preventScroll:true});} }
function move(direction) {
  const inputTime = performance.now() / 1000;
  if(phase!=='playing' || inputTime-lastMove < (elapsed<boostUntil?.115:.17)) return;
  const [dx,dy]={up:[0,1],down:[0,-1],left:[-1,0],right:[1,0]}[direction];
  const nextX=x+dx,nextRow=row+dy;
  if(nextX<0 || nextX>8 || nextRow<Math.max(0,distance-5)) return;
  x=nextX;row=nextRow;lastMove=inputTime;
  if(row>distance){distance=row;lastProgress=elapsed;}
  const l=getLane(row);
  if(l.item && l.itemX===x && !collected.has(row)){
    collected.add(row);
    if(l.item==='card'){cards++;toast('학생증 발견! +50점');beep(990,.12);}
    if(l.item==='coffee'){boostUntil=elapsed+6;toast('카페인 충전! 6초 동안 빠른 발걸음');beep(880,.12);}
    if(l.item==='umbrella'){shield=true;toast('우산 장착! 한 번은 괜찮아');beep(770,.12);}
  }
  beep(300+row%8*35,.035); updateHUD();
}
function tick(dt) {
  elapsed+=dt;
  if(elapsed-lastProgress>=config.deadlineSeconds){finish('과제 마감에 붙잡혔어요. 앞으로 나아가면 시간을 벌 수 있어요!');return;}
  const l=getLane(row);
  if(elapsed>=invincibleUntil && collision(l,x,elapsed,config.trafficSpeed)){
    if(l.type==='walk'){ lastProgress-=2; invincibleUntil=elapsed+1.5; toast(l.variant==='drunk'?'갈지자 걸음에 길이 막혔어요… -2초!':'잠깐 설문 하나만… 마감 시간 -2초!'); }
    else if(shield){shield=false;invincibleUntil=elapsed+1.8;toast('우산이 막아 줬어요! 지금 탈출하세요.');beep(180,.1);}
    else {finish(l.type==='water'?'물웅덩이에 풍덩! 오늘의 신발은 조기 퇴근.':row>=65?'공사 차량 등장! 안전거리를 확보하세요.':'차가 먼저 지나갔어야 했는데… 다음엔 한 박자 쉬어 가요.');return;}
  }
  if(elapsed>effectUntil) $('effect').textContent=shield?'☂ 우산 보호 중':elapsed<boostUntil?'☕ 카페인 충전 중':'';
  updateHUD();
  // Keep memory bounded even during a long run.
  for(const r of lanes.keys()) if(r<distance-12) lanes.delete(r);
}
// Original canvas artwork: a small isometric campus, drawn without external assets.
let W=800,H=640,S=1;
function point(px,r){return [W*.46+(px-4)*46*S+(r-camera)*16*S,H*.70+(px-4)*13*S-(r-camera)*31*S];}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6*S;ctx.stroke();}}
function tile(px,r,color){polygon([point(px-.5,r-.5),point(px+.5,r-.5),point(px+.5,r+.5),point(px-.5,r+.5)],color);}
function box(px,r,width,depth,height,color,top=color,base=0){
  const raised=(x,y)=>{const p=point(x,y);p[1]-=base*S;return p;};
  const a=raised(px-width/2,r-depth/2),b=raised(px+width/2,r-depth/2),c=raised(px+width/2,r+depth/2),d=raised(px-width/2,r+depth/2),h=height*S;
  polygon([a,b,[b[0],b[1]-h],[a[0],a[1]-h]],color);
  polygon([b,c,[c[0],c[1]-h],[b[0],b[1]-h]],shade(color,-25));
  polygon([[a[0],a[1]-h],[b[0],b[1]-h],[c[0],c[1]-h],[d[0],d[1]-h]],top);
}
function shade(hex,amount){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,v+amount)).toString(16).padStart(2,'0')).join('');}
function tree(px,r,variant=0){box(px,r,.16,.16,20,'#74634b');box(px,r,.7,.65,22,variant?'#547b53':'#3e7455','#739567',20);box(px,r,.48,.45,14,'#4d8058','#87a670',42);}
function person(px,r,player=false){
  const [sx,sy]=point(px,r);ctx.fillStyle='#20352c35';ctx.beginPath();ctx.ellipse(sx,sy+2*S,12*S,5*S,.2,0,Math.PI*2);ctx.fill();
  box(px-.11,r,.15,.24,5,'#34434b');box(px+.12,r,.15,.24,5,'#34434b');
  box(px,r,.43,.33,19,player?'#eee9cc':'#b590d3',player?'#fffae3':'#d4b2ee',5);
  box(px,r,.34,.30,12,'#dcb083','#efd0a2',24);box(px,r,.38,.32,6,'#35413b','#495448',36);
  if(player){box(px,r-.2,.28,.16,16,'#cf794c','#edaa66',8);if(shield){ctx.strokeStyle='#d9f67a';ctx.lineWidth=2*S;ctx.beginPath();ctx.ellipse(sx,sy-20*S,24*S,34*S,0,0,Math.PI*2);ctx.stroke();}}
}
function vehicle(px,r,l){
  const colors=['#e7bd6b','#e0e4d6','#c27966','#7fa5a4'],c=colors[l.color];
  if(l.variant==='scooter'){
    box(px-.28,r,.19,.22,9,'#34433f');box(px+.28,r,.19,.22,9,'#34433f');
    box(px,r,.72,.23,8,'#46796e','#78a897',7);box(px-.22*l.direction,r,.32,.33,16,'#d47746','#f6b672',15);
    box(px+.1*l.direction,r,.22,.23,14,'#e1d3b5','#f5e7cf',14);box(px+.1*l.direction,r,.27,.26,9,'#e5b958','#ffe093',28);return;
  }
  if(r>=65){box(px,r,1.35,.55,16,'#dba157','#f0c971');box(px-.25*l.direction,r,.6,.48,32,'#dba157','#f1cf8f');}
  else {box(px,r,l.length,.56,16,c,shade(c,20));box(px-.12*l.direction,r,.63,.45,13,c,shade(c,35),16);box(px-.18*l.direction,r-.23,.38,.035,8,'#3f6268','#82a6a5',17);}
  box(px-.45,r-.30,.22,.10,8,'#34433f');box(px+.45,r-.30,.22,.10,8,'#34433f');
}
function render(dt){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  W=rect.width;H=rect.height;S=Math.min(W/660,H/540);ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#a2bb8c';ctx.fillRect(0,0,W,H);
  camera+=(distance-camera)*Math.min(1,dt*7);visualX+=(x-visualX)*Math.min(1,dt*22);visualRow+=(row-visualRow)*Math.min(1,dt*22);
  const t=phase==='welcome'||phase==='starting'?previewTime:elapsed;
  const top=Math.floor(camera)+23,bottom=Math.floor(camera)-12;
  for(let r=top;r>=bottom;r--){const l=getLane(r),rng=random(r*53+7);for(let col=-14;col<19;col++){
    let color= (col+r)%2===0?'#a0b989':'#9bb584';
    if(col>=0&&col<=8){color=l.type==='road'?(r>=65?'#777d71':'#727f78'):l.type==='water'?'#c1c3a0':l.type==='walk'?'#c6c5a4':(r+col)%2?'#a5c18a':'#aec892';}
    if(col===-1||col===9)color=l.type==='road'?'#b9bda6':'#91ad7c';tile(col,r,color);
  }
  if(l.type==='road')for(let col=0;col<9;col+=2)box(col,r,.55,.045,.3,'#d7d5b7');
  if(l.type==='grass' && r%5===0)for(let col=0;col<9;col++)if(rng()<.25)box(col,r,.08,.1,2,'#769c65');
  }
  // Scenery and actors are painted from far to near for depth.
  let playerDrawn=false;
  for(let r=top;r>=bottom;r--){const l=getLane(r);
    if(r%3===0){tree(-2.3,r,r%2);tree(10.6,r+1,r%2);}
    if(r%13===0){box(-4,r,2.8,2,70,'#a0a899','#d2ceb1');box(-4,r,2.9,2.1,77,'#778a79','#a9b39c');for(let j=0;j<3;j++)box(-4.8+j*.7,r-1,.38,.03,52,'#577a77');}
    if(r%11===0){box(10,r,.12,.12,66,'#637c65');const [sx,sy]=point(10,r);ctx.fillStyle='#e9edcf';ctx.fillRect(sx-9*S,sy-69*S,21*S,6*S);}
    if(r===0){box(1.3,r,.12,.12,40,'#5c7659');box(7.5,r,.12,.12,40,'#5c7659');}
    for(const pos of obstacles(l,t,config.trafficSpeed))if(pos>-.8&&pos<9.8){if(l.type==='water'){const [sx,sy]=point(pos,r);ctx.fillStyle='#659caa';ctx.beginPath();ctx.ellipse(sx,sy,25*S,9*S,.27,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a9d5d7';ctx.beginPath();ctx.ellipse(sx,sy,14*S,4*S,.27,0,Math.PI*2);ctx.stroke();}else if(l.type==='walk'){person(pos,r);if(l.variant==='drunk'){box(pos+.3,r,.1,.1,10,'#647d4b','#91ae64',13);const [sx,sy]=point(pos,r);ctx.fillStyle='#fff4cc';ctx.font=`${12*S}px sans-serif`;ctx.fillText('~',sx,sy-47*S);}else box(pos+.35,r,.25,.1,13,'#d4d9b9','#eef2d6',10);}else vehicle(pos,r,l);}
    if(l.item&&!collected.has(r)){const [sx,sy]=point(l.itemX,r);ctx.fillStyle='#fff7bb';ctx.beginPath();ctx.ellipse(sx,sy,14*S,7*S,.2,0,Math.PI*2);ctx.fill();ctx.font=`${22*S}px sans-serif`;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText(l.item==='coffee'?'☕':l.item==='umbrella'?'☂':'▣',sx,sy-9*S+Math.sin(t*3)*2*S);}
    if(!playerDrawn&&r<=visualRow){if(elapsed>=invincibleUntil||Math.floor(elapsed*10)%2===0)person(visualX,visualRow,true);playerDrawn=true;}
  }
  const gradient=ctx.createLinearGradient(0,0,0,H);gradient.addColorStop(0,'#e7ebc61a');gradient.addColorStop(.7,'#122b1200');gradient.addColorStop(1,'#1b3d2333');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
}
function frame(timestamp){const dt=Math.min((timestamp-lastFrame)/1000||0,.05);lastFrame=timestamp;if(phase==='playing')tick(dt);if(phase==='welcome'||phase==='starting')previewTime+=dt;render(dt);requestAnimationFrame(frame);}
$('start').onclick=start;$('retry').onclick=start;$('pause').onclick=pause;$('resume').onclick=resume;
$('exit-focus').onclick=showLobby;$('fullscreen').onclick=toggleFullscreen;
$('daily').onclick=()=>setMode('daily');$('endless').onclick=()=>setMode('endless');$('refresh').onclick=refreshRanking;
$('back').onclick=()=>{phase='welcome';setFocused(false);run=null;lanes.clear();row=0;distance=0;cards=0;x=4;camera=0;shield=false;invincibleUntil=0;$('result').hidden=true;$('welcome').hidden=false;$('daily').disabled=false;$('endless').disabled=false;updateHUD();$('start').focus({preventScroll:true});};
$('sound').onclick=()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').querySelector('span').textContent=sound?'ON':'OFF';$('sound').title=sound?'효과음 끄기':'효과음 켜기';beep(700);};
document.addEventListener('keydown',event=>{if($('admin-dialog').open)return;const key=event.key.toLowerCase();if(key==='escape'&&focused&&!document.fullscreenElement){event.preventDefault();showLobby();return;}if(['INPUT','TEXTAREA'].includes(event.target.tagName))return;const directions={arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'};if(directions[key]&&phase==='playing'){event.preventDefault();move(directions[key]);}if(key==='p'&&!event.repeat){if(phase==='playing')pause();else if(phase==='paused')resume();}});
document.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('pointerdown',event=>{event.preventDefault();move(button.dataset.move);}));
let touchStart=null;canvas.addEventListener('pointerdown',event=>{touchStart=[event.clientX,event.clientY];});canvas.addEventListener('pointerup',event=>{if(!touchStart)return;const dx=event.clientX-touchStart[0],dy=event.clientY-touchStart[1];touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<15)move('up');else move(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});canvas.addEventListener('pointercancel',()=>touchStart=null);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('save-form').onsubmit=async event=>{event.preventDefault();if(!run||phase!=='over')return;$('save').disabled=true;$('save-message').textContent='발자국 저장 중…';try{const name=$('nickname').value.trim();const data=await api('/api/scores',{method:'POST',body:JSON.stringify({token:run.token,name,distance,cards})});$('save-message').textContent=`${data.score}점 저장 완료! 명예의 전당에서 만나요.`;$('save-form').hidden=true;try{localStorage.setItem('homebound-name',name);}catch{}refreshRanking();}catch(error){$('save-message').textContent=error.message;$('save').disabled=false;}};
$('admin-open').onclick=()=>{pause();$('admin-message').textContent='';$('admin-dialog').showModal();};$('admin-close').onclick=()=>$('admin-dialog').close();$('admin-dialog').addEventListener('close',()=>{$('admin-password').value='';$('admin-confirm').checked=false;});
$('admin-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api('/api/admin/reset',{method:'POST',headers:{Authorization:`Bearer ${$('admin-password').value}`},body:JSON.stringify({confirm:'RESET'})});$('admin-message').textContent='전체 기록을 초기화했습니다.';$('admin-password').value='';refreshRanking();}catch(error){$('admin-message').textContent=error.message;}finally{button.disabled=false;}};
api('/api/config').then(data=>{config=data;$('day').textContent=data.day.replaceAll('-','.');document.title=`${data.title} · HOMEBOUND`;}).catch(()=>{$('day').textContent='서버 연결 확인 필요';});
refreshRanking();requestAnimationFrame(frame);
