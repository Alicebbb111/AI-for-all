'use strict';
(function () {
  const host=document.getElementById('operations-panel');
  host.innerHTML='<h2>Bus Bunching AI</h2><div class="flex"><label>แหล่งข้อมูล <select id="ops-mode"><option value="simulation">Simulation</option><option value="live">Live</option><option value="replay">Replay</option></select></label><input id="ops-run" placeholder="Replay run ID" aria-label="Replay run ID"><input id="ops-token" type="password" placeholder="Operations token (ถ้าตั้งค่าไว้)" autocomplete="off" aria-label="Operations token"></div><p id="ops-source"></p><div id="ops-map" style="height:280px" aria-label="แผนที่รถตามแหล่งข้อมูลที่เลือก"></div><div class="table-wrap"><table class="data"><thead><tr><th>รถ</th><th>Headway หน้า / หลัง (วิ)</th><th>คาดการณ์ (วิ)</th><th>ความเสี่ยง</th><th>ผู้โดยสาร</th><th>คุณภาพข้อมูล</th></tr></thead><tbody id="ops-rows"></tbody></table></div><div id="ops-recs"></div><pre id="ops-copilot" style="white-space:pre-wrap"></pre><section><h3>External Context Intelligence</h3><div class="ops-context-grid"><article class="card tight"><h4>Weather · Open-Meteo</h4><div id="ops-weather">ยังไม่ได้โหลดข้อมูล</div></article><article class="card tight"><h4>Upcoming Events</h4><div id="ops-events">ยังไม่มีข้อมูลกิจกรรม</div></article></div><p class="muted">ข้อมูลภายนอกเป็นปัจจัยประกอบ ไม่ใช่ข้อสรุปสาเหตุ และไม่สั่ง Holding/Dispatch โดยตรง</p></section><h3>Digital Twin — Simulation เท่านั้น</h3><p class="muted">เปรียบเทียบ 4 นโยบาย ค่าเริ่มต้น 30 seeds และ 30 นาทีต่อสถานการณ์ ผลอาจแย่กว่า Baseline และจะแสดงตามจริง ไม่มีจุด Holding ที่อนุมัติ = ไม่ทดลองสั่ง Holding</p><button class="btn" id="ops-twin">ทดลอง Digital Twin</button><div class="table-wrap" id="ops-twin-result"></div>';
  const $=id=>document.getElementById(id),esc=OT.esc;
  const originalPost=OT.post;
  OT.post=async(url,body)=>{
    if(!$('ops-token').value)return originalPost(url,body);
    try{return await post(url,body);}catch(e){return {ok:false,error:e.message};}
  };
  $('ops-twin').insertAdjacentHTML('beforebegin','<label>สถานการณ์จำลอง <select id="ops-scenario"><option value="normal">Normal — เงื่อนไขเริ่มต้นเดิม</option><option value="bunching">Bunching — รถคันหน้าช้าและช่องไฟเริ่มต้นลดลง</option></select></label> ');
  let current=null,busy=false,externalStream=null;
  for(const [value,label] of [['traffic_heavy','รถติดมาก'],['traffic_light','รถติดน้อย'],['passengers_high','ผู้โดยสารมาก'],['passengers_low','ผู้โดยสารน้อย'],['late_departure','รถต้นทางล่าช้า 5 นาที']]) {
    const option=document.createElement('option');option.value=value;option.textContent=label;$('ops-scenario').appendChild(option);
  }
  for(const [value,label] of [['normal_weather','อากาศปกติ (สมมติฐาน)'],['light_rain','ฝนเล็กน้อย (สมมติฐาน)'],['heavy_rain','ฝนหนัก (สมมติฐาน)'],['large_public_event','กิจกรรมขนาดใหญ่ (สมมติฐาน)'],['confirmed_road_closure','ปิดถนนยืนยันแล้ว (สมมติฐาน)'],['rain_public_event','ฝน + กิจกรรม (สมมติฐาน)']]) {const option=document.createElement('option');option.value=value;option.textContent=label;$('ops-scenario').appendChild(option);}
  $('ops-twin').insertAdjacentHTML('beforebegin','<label>จำนวน Seeds <input id="ops-seeds" type="number" min="1" max="100" value="30"></label> ');
  const map=L.map('ops-map').setView([13.765,100.533],12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  const markers=L.layerGroup().addTo(map);
  const contextMarkers=L.layerGroup().addTo(map);
  const num=v=>Number.isFinite(v)?Math.round(v):'ไม่มีข้อมูล';
  function summaryTable(result) {
    if(!result.summary)return '';
    const sd=x=>x?.mean==null?'ไม่มีข้อมูล':`${num(x.mean)} ± ${num(x.sd)} [${num(x.p10)}, ${num(x.p90)}]`;
    return '<h3>ค่าเฉลี่ย ± SD [P10, P90] — Simulation</h3><p>แต่ละนโยบายใช้ข้อมูลเริ่มต้นและเหตุการณ์ภายนอกตรงกัน: '+(result.matchedExogenous?'ตรวจ hash ผ่าน':'ตรวจไม่ผ่าน')+'</p><table class="data"><thead><tr><th>นโยบาย</th><th>รอเฉลี่ย (วิ)</th><th>Passenger time (คน-วิ)</th><th>Onboard delay (วิ)</th><th>Headway variance</th><th>Bunching</th><th>มาตรการ</th><th>Holding เฉลี่ย (วิ)</th></tr></thead><tbody>'+result.summary.map(x=>`<tr><td>${esc(x.strategy)}</td><td>${sd(x.averagePassengerWaitingTimeSec)}</td><td>${sd(x.totalPassengerTimeSec)}</td><td>${sd(x.averageOnboardDelaySec)}</td><td>${sd(x.headwayVarianceSec2)}</td><td>${sd(x.bunchingEvents)}</td><td>${sd(x.interventions)}</td><td>${sd(x.averageHoldingDurationSec)}</td></tr>`).join('')+'</tbody></table><p>'+result.paired.map(x=>`${esc(x.strategy)}: ดีขึ้น ${x.improved} / แย่ลง ${x.worse} / เท่าเดิม ${x.unchanged} seeds · Δ Passenger time ${num(x.deltaPassengerTimeSec.mean)} คน-วิ`).join(' · ')+'</p><p>ค่า Holding ไม่มีข้อมูลหมายถึงไม่มีการจอดรอจริง จำนวนมาตรการนับการเปลี่ยนเวลาที่เกิดขึ้น ไม่ใช่จำนวนการอนุมัติ</p><h3>ผลแต่ละ Seed</h3>';
  }
  function render(s) {
    current=s;
    $('ops-source').textContent=`${s.mode.toUpperCase()} · ${s.cameraStatus} · จุด Holding ที่อนุมัติ: ${s.approvedHoldingStops.join(', ')||'ไม่มี'} · ${s.limitations}`;
    markers.clearLayers();
    for(const v of s.vehicles)if(Number.isFinite(v.lat)&&Number.isFinite(v.lng))L.circleMarker([v.lat,v.lng],{radius:7,color:v.gpsOk?'#2fae6e':'#888'}).bindTooltip(`${esc(v.busId)} · ${esc(s.mode)}`).addTo(markers);
    $('ops-rows').innerHTML=s.vehicles.map(v=>{
      const h=s.headways.find(x=>x.busId===v.busId),p=s.predictions.find(x=>x.busId===v.busId);
      return `<tr><td>${esc(v.busId)}</td><td>${num(h?.frontHeadwaySec)} / ${num(h?.backHeadwaySec)}</td><td>${num(p?.predictedHeadwaySec)}</td><td>${esc(p?.riskLevel||'unknown')}</td><td>${num(v.onboardEst)}</td><td>${esc(p?.dataQuality||'insufficient')}</td></tr>`;
    }).join('')||'<tr><td colspan="6">ยังไม่มีข้อมูลรถสำหรับแหล่งข้อมูลนี้</td></tr>';
    $('ops-recs').innerHTML=s.recommendations.map(r=>`<div class="card tight"><b>${esc(r.type)} · ${esc(r.busId)}</b><p>${r.type==='holding'?`รอเพิ่ม ${num(r.holdSec)} วินาที · ต้นทุนคนบนรถ ${num(r.passengerDelaySec)} คน-วินาที`:`ปล่อยที่เวลาจำลอง ${OT.simSecToClock(r.releaseAtSec)} · รถพร้อม ${r.readyCount} คัน`}</p><p>คาดว่าลด Passenger time ${num(r.estimatedGainPassengerSec)} คน-วินาที · ${esc(r.reason||'')}</p><span>${esc(r.status)}</span> ${r.status==='pending'?`<button class="btn small" data-ops-id="${esc(r.id)}" data-decision="approved">อนุมัติใน Simulation</button> <button class="btn small" data-ops-id="${esc(r.id)}" data-decision="rejected">ปฏิเสธ</button>`:''}</div>`).join('')||`<p><b>No Intervention</b> — ยังไม่มีหลักฐานว่ามาตรการที่ผ่านข้อจำกัดจะลดเวลารวมผู้โดยสารได้</p><p>${esc([...(s.decision?.holdingReasons||[]),...(s.decision?.dispatchReasons||[])].join(' · '))}</p>`;
  }
  async function post(url,body) {
    const token=$('ops-token').value;
    return fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}).then(r=>r.json());
  }
  host.addEventListener('click',async event=>{
    const b=event.target.closest('[data-ops-id]');if(!b)return;
    const r=await post('/api/dispatch',{recId:b.dataset.opsId,decision:b.dataset.decision,note:'Dispatcher Bus Bunching panel'}).catch(e=>({ok:false,error:e.message}));
    if(!r.ok)alert(r.error);await refresh();
  });
  async function refresh() {
    if(busy)return;busy=true;
    try{
      const query=`mode=${encodeURIComponent($('ops-mode').value)}&runId=${encodeURIComponent($('ops-run').value)}`;
      const s=await OT.get('/api/operations/state?'+query);
      if(s.error){$('ops-source').textContent=s.error;return;}render(s);
      const c=await OT.get('/api/operations/copilot?'+query);$('ops-copilot').textContent=c.text||c.error;
    }finally{busy=false;}
  }
  async function refreshContext() {
    try{
      const [weather,impacts]=await Promise.all([OT.get('/api/context/weather'),OT.get('/api/context/impacts?radiusM=1000')]);
      const w=weather.current;$('ops-weather').innerHTML=w?`<p><b>${esc(w.weatherCondition)}</b> · ${num(w.temperatureC)} °C · ฝน ${num(w.precipitationMm)} มม. · โอกาส ${num(w.precipitationProbability)}%</p><p>ผลกระทบเชิงบริบท: ${esc(w.weatherImpactLevel)} · อัปเดต ${esc(weather.lastUpdated||'ไม่ทราบ')}</p><p>${esc(weather.attribution||'Weather data by Open-Meteo.com')}</p>`:`<p><b>Weather Data ${esc(weather.status||'Unavailable')}</b></p>`;
      contextMarkers.clearLayers();
      for(const p of weather.points||[])if(p.current?.weatherCondition==='rain')L.circleMarker([p.latitude,p.longitude],{radius:8,color:'#2a78d6'}).bindTooltip('จุดตัวแทนพยากรณ์ฝน · ไม่ใช่แผนที่ฝนระดับถนน').addTo(contextMarkers);
      const relevant=(impacts.impacts||[]).filter(x=>x.impactLevel!=='none').slice(0,10);
      $('ops-events').innerHTML=relevant.map(x=>{const e=x.event;if(Number.isFinite(e.latitude))L.marker([e.latitude,e.longitude]).bindTooltip(`${esc(e.eventName)} · ${esc(x.impactLevel)}`).addTo(contextMarkers);return `<p><b>${esc(e.eventName)}</b><br>${esc(e.eventType)} · ${esc(e.eventDate||'ไม่ทราบวัน')} ${esc(e.startTime||'')} · ${esc(e.location||'ตำแหน่งไม่ชัดเจน')}<br>R1: ${esc(x.impactLevel)} · ${esc(e.verificationStatus)} ${e.sourceUrl?`· <a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">แหล่งข่าว</a>`:''}</p>`;}).join('')||'<p>ยังไม่พบกิจกรรมที่จับคู่เส้นทางได้ หรือยังไม่ได้ดึง GDELT</p>';
    }catch(e){$('ops-weather').textContent='Weather Data Unavailable: '+e.message;$('ops-events').textContent='Event Data Unavailable';}
  }
  function reconnect() {
    if(externalStream){externalStream.close();externalStream=null;}
    const mode=$('ops-mode').value,runId=$('ops-run').value;
    if(mode!=='simulation'&&(mode!=='replay'||runId)) {
      externalStream=new EventSource(`/api/events?scope=public&mode=${encodeURIComponent(mode)}&runId=${encodeURIComponent(runId)}`);
      externalStream.addEventListener('state',event=>{const s=JSON.parse(event.data);if(s.operations?.mode===$('ops-mode').value)render(s.operations);});
    }
    refresh();
  }
  $('ops-mode').addEventListener('change',reconnect);$('ops-run').addEventListener('change',reconnect);
  OT.onState(s=>{if($('ops-mode').value==='simulation'&&s.operations)render(s.operations);});
  $('ops-twin').addEventListener('click',async()=>{
    const b=$('ops-twin');b.disabled=true;$('ops-twin-result').textContent='กำลังคำนวณจาก Simulation…';
    const progress=setInterval(async()=>{const job=await OT.get('/api/operations/twin');if(b.disabled&&job.status==='running')$('ops-twin-result').textContent=`กำลังคำนวณใน Worker: ${job.progress?.completed||0}/${job.progress?.total||'?'} · Dashboard และ SSE ยังทำงานได้`;},1000);
    try{
      const r=await post('/api/operations/twin',{seeds:Array.from({length:Math.max(1,Math.min(100,Number($('ops-seeds').value)||30))},(_,i)=>String(i+1)),durationSec:1800,scenario:$('ops-scenario').value});
      $('ops-twin-result').innerHTML=r.error?esc(r.error):summaryTable(r)+'<table class="data"><thead><tr><th>Seed / นโยบาย</th><th>รอเฉลี่ย (วิ)</th><th>Headway variance</th><th>Bunching</th><th>Onboard delay (วิ/คนรับขึ้น)</th><th>Passenger time (คน-วิ)</th><th>Prediction MAE / n</th></tr></thead><tbody>'+r.results.map(x=>`<tr><td>${esc(x.seed)} / ${esc(x.strategy)}</td><td>${num(x.averagePassengerWaitingTimeSec)}</td><td>${num(x.headwayVarianceSec2)}</td><td>${x.bunchingEvents}</td><td>${num(x.averageOnboardDelaySec)}</td><td>${num(x.totalPassengerTimeSec)}</td><td>${num(x.predictionMaeSec)} / ${x.predictionSamples}</td></tr>`).join('')+'</tbody></table><p>'+r.limitations.map(esc).join(' · ')+'</p>';
    }catch(e){$('ops-twin-result').textContent=e.message;}finally{clearInterval(progress);b.disabled=false;}
  });
  refresh();refreshContext();setInterval(refresh,5000);setInterval(refreshContext,15*60*1000);
})();
