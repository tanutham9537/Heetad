const $ = id => document.getElementById(id);
let map, marker, accuracyCircle, watchId=null, latestPosition=null, historyItems=[], lastGpsLog=0;
const GPS_LOG_INTERVAL_MS=30000;
const toast = msg => { $('toast').textContent=msg; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2600); };
const fmt = (n,d=1) => Number.isFinite(n) ? n.toFixed(d) : '--';
function initMap(){
  if(!window.L){ $('map').innerHTML='<div style="padding:18px;color:#8a82b5">โหลดแผนที่ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต</div>'; return; }
  map=L.map('map').setView([13.7563,100.5018],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
}
function updateConnection(){
  const online=navigator.onLine; $('onlineBadge').textContent=online?'ONLINE':'OFFLINE'; $('onlineBadge').className='pill '+(online?'ok':'bad');
  $('onlineText').textContent=online?'เชื่อมต่ออยู่':'ออฟไลน์';
  const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  $('connectionType').textContent=c?(c.type==='wifi'?'Wi-Fi':(c.effectiveType||c.type||'เชื่อมต่ออยู่').toUpperCase()): (online?'เชื่อมต่ออยู่':'ออฟไลน์');
  $('effectiveType').textContent=c?[c.type||'',c.effectiveType||''].filter(Boolean).join(' / ')||'ไม่เปิดเผย':'เบราว์เซอร์ไม่รองรับ';
  $('browserRtt').textContent=c&&c.rtt?c.rtt+' ms':'--'; $('downlink').textContent=c&&c.downlink?fmt(c.downlink,1)+' Mbps':'-- Mbps';
  $('saveData').textContent=c?(c.saveData?'เปิด':'ปิด'):'ไม่รองรับ';
}
function initDevice(){ $('device').textContent=(navigator.userAgentData?.platform||navigator.platform||'Unknown')+' · '+(navigator.userAgent.includes('Chrome')?'Chrome/Chromium':'Browser'); }
async function pingTest(){
  if(!navigator.onLine) return toast('ไม่มีอินเทอร์เน็ต');
  $('pingBtn').disabled=true; $('testState').textContent='กำลังทดสอบ Ping…';
  const vals=[];
  try{
    const url=()=>'https://www.cloudflare.com/cdn-cgi/trace?x='+Math.random();
    await fetch(url(),{cache:'no-store',mode:'no-cors'}); // warm-up: ตัดเวลา DNS/TLS handshake ของครั้งแรกออก
    for(let i=0;i<5;i++){const t=performance.now(); await fetch(url(),{cache:'no-store',mode:'no-cors'}); vals.push(performance.now()-t);}
    const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const jitter=vals.slice(1).reduce((a,v,i)=>a+Math.abs(v-vals[i]),0)/(vals.length-1); // ค่าเฉลี่ยความต่างระหว่างครั้งที่อยู่ติดกัน
    $('latency').textContent=Math.round(avg)+' ms'; $('jitter').textContent=Math.round(jitter)+' ms';
    addHistory('Ping',`${Math.round(avg)} ms`,`${Math.round(jitter)} ms`); $('testState').textContent='ทดสอบแล้ว';
  }catch(e){toast('Ping ไม่สำเร็จ ลองใหม่อีกครั้ง');$('testState').textContent='ทดสอบไม่สำเร็จ';}
  $('pingBtn').disabled=false;
}
async function speedTest(){
  if(!navigator.onLine)return toast('ไม่มีอินเทอร์เน็ต');
  $('speedBtn').disabled=true;$('testState').textContent='กำลังทดสอบ…';
  try{
    const host='https://speed.cloudflare.com';
    // warm-up: เปิดการเชื่อมต่อไว้ก่อน เพื่อไม่ให้เวลา handshake ถูกนับรวมในความเร็ว
    await (await fetch(host+'/__down?bytes=100000&cache='+Math.random(),{cache:'no-store'})).arrayBuffer();
    $('testState').textContent='กำลังทดสอบดาวน์โหลด…';
    const bytes=8*1024*1024;
    const r=await fetch(host+'/__down?bytes='+bytes+'&cache='+Math.random(),{cache:'no-store'});
    if(!r.ok)throw new Error('download failed');
    let got=0,t0=null,t1=null;
    if(r.body&&r.body.getReader){
      const reader=r.body.getReader();
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        if(t0===null){t0=performance.now();continue;} // เริ่มจับเวลาหลังได้ byte แรก (ตัด TTFB)
        got+=value.length;t1=performance.now();
      }
    }
    if(!got||!(t1>t0)){ // fallback เมื่อ browser ไม่รองรับ stream
      const s0=performance.now();const buf=await (await fetch(host+'/__down?bytes='+bytes+'&cache='+Math.random(),{cache:'no-store'})).arrayBuffer();
      got=buf.byteLength;t0=s0;t1=performance.now();
    }
    const down=got*8/((t1-t0)/1000)/1e6;
    $('download').textContent=fmt(down,2);
    $('testState').textContent='กำลังทดสอบอัปโหลด…';
    const upBytes=4*1024*1024, payload=new Blob([new Uint8Array(upBytes)]);
    const ustart=performance.now();
    const ur=await fetch(host+'/__up',{method:'POST',body:payload,cache:'no-store'});
    if(!ur.ok)throw new Error('upload failed');
    const usec=(performance.now()-ustart)/1000, up=upBytes*8/usec/1e6;
    $('upload').textContent=fmt(up,2);
    addHistory('Speed Test',fmt(down,2)+' Mbps',fmt(up,2)+' Mbps');$('testState').textContent='เสร็จสิ้น';
  }catch(e){toast('Speed Test ไม่สำเร็จ เครือข่ายอาจบล็อกปลายทาง');$('testState').textContent='ทดสอบไม่สำเร็จ';}
  $('speedBtn').disabled=false;
}
function startGPS(){
  if(!('geolocation' in navigator))return toast('อุปกรณ์หรือเบราว์เซอร์ไม่รองรับ GPS');
  if(!window.isSecureContext)return toast('GPS ต้องเปิดผ่าน HTTPS หรือ localhost');
  if(watchId!==null)return;
  lastGpsLog=0;
  $('gpsBadge').textContent='กำลังค้นหาตำแหน่ง';$('gpsBadge').className='pill warn';
  watchId=navigator.geolocation.watchPosition(pos=>{
    latestPosition=pos;const c=pos.coords,lat=c.latitude,lon=c.longitude;
    $('gpsBadge').textContent='กำลังติดตาม';$('gpsBadge').className='pill ok';
    $('accuracy').textContent=fmt(c.accuracy,0)+' m';
    $('gpsSpeed').textContent=c.speed===null?'-- km/h':fmt(c.speed*3.6,1)+' km/h';
    $('heading').textContent=c.heading===null?'--':fmt(c.heading,0)+'°';
    $('coords').textContent=lat.toFixed(6)+', '+lon.toFixed(6);$('copyCoords').disabled=false;
    if(map){const ll=[lat,lon];if(!marker){marker=L.marker(ll).addTo(map);accuracyCircle=L.circle(ll,{radius:c.accuracy,color:'#ff2bd6',fillColor:'#ff2bd6',fillOpacity:.15}).addTo(map);}else{marker.setLatLng(ll);accuracyCircle.setLatLng(ll).setRadius(c.accuracy);}map.setView(ll,Math.max(map.getZoom(),16));}
    const now=Date.now();
    if(now-lastGpsLog>=GPS_LOG_INTERVAL_MS){lastGpsLog=now;addHistory('GPS',`±${Math.round(c.accuracy)} m`,`${lat.toFixed(5)}, ${lon.toFixed(5)}`);} // บันทึกทุก 30 วินาที ไม่ให้ประวัติท่วม
  },err=>{
    const msg={1:'ยังไม่ได้อนุญาตตำแหน่ง',2:'ระบุตำแหน่งไม่ได้ ตรวจสอบ GPS',3:'ค้นหาตำแหน่งหมดเวลา'}[err.code]||err.message;toast(msg);
    if(err.code===1){$('gpsBadge').textContent='GPS มีปัญหา';$('gpsBadge').className='pill bad';stopGPS();} // ปฏิเสธสิทธิ์ = หยุดจริง
    else{$('gpsBadge').textContent='สัญญาณ GPS ไม่เสถียร';$('gpsBadge').className='pill warn';} // timeout/ชั่วคราว = ติดตามต่อ
  },{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
  $('gpsStart').disabled=true;$('gpsStop').disabled=false;
}
function stopGPS(){if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;$('gpsStart').disabled=false;$('gpsStop').disabled=true;if(latestPosition){$('gpsBadge').textContent='หยุดติดตาม';$('gpsBadge').className='pill warn';}}
function addHistory(type,a,b,quiet=false){
  const item={time:new Date().toLocaleString('th-TH'),type,a,b};historyItems.unshift(item);historyItems=historyItems.slice(0,60);renderHistory();
}
function renderHistory(){
  $('history').innerHTML=historyItems.length?historyItems.map(x=>`<div class="history-item"><div class="muted">${escapeHtml(x.time)} · ${escapeHtml(x.type)}</div><b>${escapeHtml(x.a)}</b> <span class="muted">${escapeHtml(x.b)}</span></div>`).join(''):'<p class="muted">ยังไม่มีผลตรวจ</p>';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('speedBtn').onclick=speedTest;$('pingBtn').onclick=pingTest;$('gpsStart').onclick=startGPS;$('gpsStop').onclick=stopGPS;
$('copyCoords').onclick=()=>{if(latestPosition){const c=latestPosition.coords; navigator.clipboard?.writeText(`${c.latitude}, ${c.longitude}`).then(()=>toast('คัดลอกพิกัดแล้ว')).catch(()=>toast('คัดลอกไม่ได้'));}};
$('clearHistory').onclick=()=>{historyItems=[];renderHistory();};
$('exportBtn').onclick=()=>{if(!historyItems.length)return toast('ยังไม่มีประวัติ');const csv=['เวลา,ประเภท,ผล 1,ผล 2',...historyItems.map(x=>[x.time,x.type,x.a,x.b].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='rider-signal-history.csv';a.click();URL.revokeObjectURL(a.href);};
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);
if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
initMap();updateConnection();initDevice();
