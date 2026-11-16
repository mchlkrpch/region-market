'use strict';
const $ = id => document.getElementById(id);
function traceColor(id){
 const index=catalog?.series?.findIndex(series=>series.id===id);
 let hash=0;for(const character of id)hash=(hash*31+character.charCodeAt(0))>>>0;
 const hue=index>=0?((index+1)*137.508)%360:hash%360;
 return `hsl(${hue}, 66%, 43%)`;
}
let catalog, activeId, counter = 0, charts = [], grid={rows:1,cols:1}, selected=new Set(), selectedRows=new Set(), selectedColumns=new Set(), rowAnchor=0, columnAnchor=0;
const format = (n, digits=2) => Number.isFinite(n) ? n.toLocaleString('ru-RU',{maximumFractionDigits:digits}) : '—';
const stamp = value => new Date(value*1000).toISOString().slice(0,16);
const timeText = t => new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(t*1000));
const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current = () => charts.find(c=>c.id===activeId);
function configOf(c){return {name:c.name,assets:[...c.assets],regions:[...c.regions],start:c.start,end:c.end,step:c.step,kind:c.kind,scale:c.scale,yRange:c.yRange?[...c.yRange]:null,bases:{...c.bases},col:c.col,row:c.row,cols:c.cols,rows:c.rows,newsIds:[...(c.newsIds||[])],study:c.study||null};}
function save(){try{localStorage.setItem('crypto-workspace-v2',JSON.stringify({grid,charts:charts.map(configOf)}));}catch{}}
function controls(){const c=current();$('active-name').textContent=c?`${columnName(c.col)}${c.row+1}`:'пустой ячейки';if(c){rangeLabels(c);toolLabels(c);}}
function toolLabels(c){const root=c.tools||c.card,kind=root.querySelector('.tool-kind'),scale=root.querySelector('.tool-scale');kind.textContent=c.kind==='line'?'∿':'╫';kind.title=c.kind==='line'?'Линии · переключить на свечи':'Свечи · переключить на линии';kind.setAttribute('aria-label',kind.title);scale.textContent=c.scale==='percent'?'%':'¤';scale.title=c.scale==='percent'?'Изменение, % · переключить на цену':'Цена в валюте пары · переключить на проценты';scale.setAttribute('aria-label',scale.title);}
function rangeLabels(c){for(const key of ['start','end']){const input=c.card.querySelector(`.input-${key}`);if(input)DateInput.refresh(input,c[key]);}}
function activate(c){if(activeId===c.id)return;activeId=c.id;document.querySelectorAll('.chart-card').forEach(el=>el.classList.toggle('active',el.dataset.id===c.id));controls();sidebar();}
function selectedIds(c){return catalog.series.filter(s=>c.assets.has(s.asset)&&c.regions.has(s.region)).map(s=>s.id);}
function eligibleAssets(c){const regions=[...c.regions];return regions.length?catalog.assets.filter(asset=>regions.every(region=>asset.regions.includes(region))):[];}
function constrainAssets(c){const allowed=new Set(eligibleAssets(c).map(asset=>asset.symbol));for(const asset of c.assets)if(!allowed.has(asset))c.assets.delete(asset);}
function sidebar(){
 const c=current(), query=$('search').value.trim().toLowerCase();if(!c)return;
 const available=eligibleAssets(c),all=$('all-coins');all.disabled=!available.length;all.checked=available.length>0&&c.assets.size===available.length;all.indeterminate=c.assets.size>0&&!all.checked;
 $('selected-count').textContent=`${c.assets.size} / ${available.length}`;
 const open=new Set([...$('groups').querySelectorAll('details[open]')].map(d=>d.dataset.group));
 const groups=new Map();for(const a of available){if(!groups.has(a.group))groups.set(a.group,{label:a.groupLabel,assets:[]});groups.get(a.group).assets.push(a);}
 $('groups').innerHTML='';
 for(const [key,g] of groups){const shown=g.assets.filter(a=>a.symbol.toLowerCase().includes(query)||g.label.toLowerCase().includes(query));if(!shown.length)continue;
  const chosen=g.assets.filter(a=>c.assets.has(a.symbol)).length;
  const details=document.createElement('details');details.dataset.group=key;details.open=query.length>0||open.has(key);
  const summary=document.createElement('summary');summary.innerHTML=`<input type="checkbox" aria-label="Выбрать группу ${escapeHTML(g.label)}"><span>${escapeHTML(g.label)}</span><span class="count">${chosen}/${g.assets.length}</span>`;
  const input=summary.querySelector('input');input.checked=chosen===g.assets.length;input.indeterminate=chosen>0&&chosen<g.assets.length;
  input.addEventListener('click',e=>e.stopPropagation());input.addEventListener('change',()=>{for(const a of g.assets)input.checked?c.assets.add(a.symbol):c.assets.delete(a.symbol);selectionChanged(c);});details.append(summary);
  for(const a of shown.sort((a,b)=>a.symbol.localeCompare(b.symbol))){const row=document.createElement('label');row.className='coin';row.innerHTML=`<input type="checkbox" ${c.assets.has(a.symbol)?'checked':''}><strong>${escapeHTML(a.symbol)}</strong><small title="Доступна во всех выбранных регионах">${c.regions.size} рын.</small>`;row.querySelector('input').addEventListener('change',e=>{e.target.checked?c.assets.add(a.symbol):c.assets.delete(a.symbol);selectionChanged(c);});details.append(row);}
  $('groups').append(details);
 }
 if(query)$('coins-tree').open=true;
 if(!available.length){const empty=document.createElement('p');empty.className='news-empty';empty.textContent=c.regions.size?'Общих монет для выбранных регионов нет':'Сначала выберите регионы';$('groups').append(empty);}
 const regionOpen=new Set([...$('regions').querySelectorAll('details[open]')].map(node=>node.dataset.marketSet));$('regions').innerHTML='';
 const allRegions=$('all-regions'),regionIds=Object.keys(catalog.regions);allRegions.checked=c.regions.size===regionIds.length;allRegions.indeterminate=c.regions.size>0&&!allRegions.checked;
 function marketRow(id,parent){const count=catalog.assets.filter(a=>a.regions.includes(id)).length,row=document.createElement('label');row.className='market tree-leaf';row.innerHTML=`<input type="checkbox" ${c.regions.has(id)?'checked':''}><span>${catalog.regions[id]}</span><small>${count} монет</small>`;row.querySelector('input').addEventListener('change',e=>{e.target.checked?c.regions.add(id):c.regions.delete(id);selectionChanged(c);});parent.append(row);}
 for(const set of catalog.marketSets||[]){const ids=set.regions,section=document.createElement('details');section.className='market-branch';section.dataset.marketSet=set.id;section.open=regionOpen.has(set.id);const summary=document.createElement('summary');summary.innerHTML=`<input type="checkbox" aria-label="Выбрать набор ${escapeHTML(set.label)}"><span>${escapeHTML(set.label)}</span><span class="count" title="Фактически доступно / исходный размер набора">${set.availableCount}/${set.plannedCount}</span>`;const groupCheck=summary.querySelector('input'),chosen=ids.filter(id=>c.regions.has(id)).length;groupCheck.checked=chosen===ids.length;groupCheck.indeterminate=chosen>0&&chosen<ids.length;groupCheck.addEventListener('click',e=>e.stopPropagation());groupCheck.addEventListener('change',()=>{for(const id of ids)groupCheck.checked?c.regions.add(id):c.regions.delete(id);selectionChanged(c);});section.append(summary);for(const id of ids)marketRow(id,section);if(set.id==='cn_hk_26'){const note=document.createElement('small');note.className='market-note';note.textContent='Китай — через котировки Гонконга';section.append(note);}$('regions').append(section);}
 if(typeof NewsDesk!=='undefined')NewsDesk.sidebar(c);

}
function selectionChanged(c){constrainAssets(c);sidebar();save();if(typeof NewsDesk!=='undefined')NewsDesk.changed(c);load(c);}
function newChart(config={},render=true){
 const c={id:`chart-${++counter}`,name:config.name||`График ${counter}`,assets:new Set(config.assets||['BTC','ETH','SOL']),regions:new Set(config.regions||['US']),start:config.start??catalog.start,end:config.end??(catalog.start+7*86400),step:config.step||900,kind:config.kind||'line',scale:config.scale||'percent',hidden:new Set(),yRange:config.yRange||null,bases:config.bases||{},data:null,controller:null,token:0,col:config.col??0,row:config.row??0,cols:config.cols||1,rows:config.rows||1};
 constrainAssets(c);
 charts.push(c);
 const card=document.createElement('section');card.className='chart-card';card.dataset.id=c.id;
 const intervals=[[900,'15 минут'],[1800,'30 минут'],[3600,'1 час'],[7200,'2 часа'],[14400,'4 часа'],[21600,'6 часов'],[43200,'12 часов'],[86400,'1 день'],[604800,'7 дней']];
 card.innerHTML=`<button class="remove-chart" aria-label="Удалить график">×</button><div class="plot-row"><div class="chart-tools"><button class="tool-kind" aria-label="Вид графика"></button><button class="tool-scale" aria-label="Шкала цены"></button></div><div class="chart-body"><canvas aria-label="Интерактивный график курсов"></canvas><div class="chart-state">Загрузка…</div></div></div><div class="chart-foot"><div class="date-start">От <input class="input-start utc-date" type="text" inputmode="numeric" aria-label="Начало периода UTC"></div><label class="interval-control">Свеча <select aria-label="Размер свечи">${intervals.map(([value,label])=>`<option value="${value}" ${value===c.step?'selected':''}>${label}</option>`).join('')}</select></label><div class="date-end">До <input class="input-end utc-date" type="text" inputmode="numeric" aria-label="Конец периода UTC исключительно"> UTC</div></div>${['n','e','s','w','ne','nw','se','sw'].map(edge=>`<span class="resize-handle handle-${edge}" data-edge="${edge}" role="button" tabindex="0" aria-label="Изменить размер ${edge}"></span>`).join('')}`;

 c.card=card;c.tools=card.querySelector('.chart-tools');c.tools.addEventListener('pointerdown',()=>activate(c));c.canvas=card.querySelector('canvas');c.state=card.querySelector('.chart-state');
 card.addEventListener('pointerdown',e=>{if(e.metaKey){e.preventDefault();selected.has(c.id)?selected.delete(c.id):selected.add(c.id);selectionClasses();}activate(c);});

 card.querySelector('.remove-chart').addEventListener('click',()=>{discardChart(c);refreshLayout();});
 card.querySelector('.tool-kind').addEventListener('click',()=>{c.kind=c.kind==='line'?'candles':'line';toolLabels(c);save();load(c);});
 card.querySelector('.tool-scale').addEventListener('click',()=>{c.scale=c.scale==='percent'?'price':'percent';c.yRange=null;toolLabels(c);draw(c);save();});
 if(typeof NewsDesk!=='undefined')NewsDesk.attach(c,config);
 bindFoot(c);$('charts').append(card);c.resize=new ResizeObserver(()=>draw(c));c.resize.observe(c.canvas);bindChart(c);bindResize(c);toolLabels(c);activate(c);load(c);if(render){renderGrid();save();}return c;

}
async function load(c){
 c.controller?.abort();clearTimeout(c.loadTimer);const token=++c.token;const ids=selectedIds(c);
 draw(c);c.state.hidden=false;c.state.className='chart-state';
 rangeLabels(c);
 if(!ids.length){c.data=null;draw(c);c.state.textContent=c.assets.size?'Выберите рынок с доступными парами':'Выберите монеты слева';return;}
 c.state.textContent=ids.length>20?`Загружаются ${ids.length} серий…`:'Загрузка свечей…';
 const requestStart=Math.max(catalog.start,Math.floor(c.start/900)*900),requestEnd=Math.min(catalog.end,Math.ceil(c.end/900)*900);
 if(requestEnd-requestStart<c.step){c.data=null;draw(c);c.state.textContent='Вне доступной истории или нет полной свечи';return;}
 c.controller=new AbortController();
 try{
  const response=await fetch('/api/series',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,start:requestStart,end:requestEnd,step:c.step,kind:c.kind}),signal:c.controller.signal});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Ошибка загрузки');if(c.token!==token)return;
  data.kind=c.kind;c.data=data;c.state.hidden=true;
  c.traces=data.series.map(s=>({...s,color:traceColor(s.id),base:(s.bars.find(b=>b!==null)??null)}));
  for(const t of c.traces){if(Array.isArray(t.base))t.base=t.base[3];if(c.bases[t.id])t.base=c.bases[t.id];else if(t.base)c.bases[t.id]=t.base;t.lod=PlotLOD.prepare(t.bars,data.kind);}
  const valid=data.series.reduce((n,s)=>n+s.valid,0);
  rangeLabels(c);
  if(!valid){c.state.hidden=false;c.state.textContent='В этом окне нет полных свечей с торгами';}
  draw(c);save();if(typeof NewsDesk!=='undefined')NewsDesk.changed(c);
 }catch(e){if(e.name==='AbortError'||c.token!==token)return;c.state.hidden=false;c.state.className='chart-state error';c.state.textContent=e.message;}
}
function valueOf(c,t,value){return c.scale==='percent'?(value/t.base-1)*100:value;}
function draw(c){
 if(!window.requestAnimationFrame){paint(c);return;}
 if(c.drawFrame||c.disposed)return;
 c.drawFrame=window.requestAnimationFrame(()=>{c.drawFrame=null;if(!c.disposed)paint(c);});
}
function paint(c){
 const canvas=c.canvas, w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 const dpr=window.devicePixelRatio||1,pixelWidth=Math.round(w*dpr),pixelHeight=Math.round(h*dpr);if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const left=6,right=w-10,top=12,bottom=h-6;c.plot={left,right,top,bottom,w,h};
 ctx.font='10px Inter, system-ui, sans-serif';ctx.lineWidth=1;
 if(!c.yRange&&c.data)c.yRange=fitRange(c);
 const [low,high]=c.yRange||[-1,1];c.plot.low=low;c.plot.high=high;

 const X=t=>left+(t-c.start)/(c.end-c.start)*(right-left),Y=v=>bottom-(v-low)/(high-low)*(bottom-top);
 c.plot.X=X;c.plot.Y=Y;
 const yStep=niceStep((high-low)/5);
 const yLabels=[];
 for(let value=Math.ceil(low/yStep)*yStep;value<=high;value+=yStep){const y=Y(value);ctx.strokeStyle='#e9e9e9';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();yLabels.push([format(value,c.scale==='percent'?2:Math.abs(value)<1?6:2)+(c.scale==='percent'?'%':''),y]);}
 const xStep=timeStep((c.end-c.start)/(w<500?3:6)),xLabels=[];
 for(let time=Math.ceil(c.start/xStep)*xStep;time<=c.end;time+=xStep){const x=X(time);ctx.strokeStyle='#efefef';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();const d=new Date(time*1000);const label=(c.end-c.start)>3*86400?d.toISOString().slice(5,10).split('-').reverse().join('.') :d.toISOString().slice(11,16);xLabels.push([label,x]);}
 ctx.textAlign='left';
 ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
 if(typeof NewsDesk!=='undefined')NewsDesk.draw(c,ctx,X,c.plot);
 if(c.data){const neighbor=c.data.kind==='line'?1:0,from=Math.max(0,Math.ceil((c.start-c.data.start)/c.data.step)-neighbor),to=Math.min(c.traces[0]?.bars.length||0,Math.ceil((c.end-c.data.start)/c.data.step)+neighbor),budget=Math.max(64,Math.floor((right-left)/Math.min(4,Math.max(1,Math.sqrt(c.traces.length/4)))));
 for(const t of c.traces){if(c.hidden.has(t.id)||!t.base)continue;ctx.strokeStyle=t.color;ctx.fillStyle=t.color;ctx.lineWidth=1.35;
  const segments=PlotLOD.sample(t.lod||PlotLOD.prepare(t.bars,c.data.kind),from,to,budget);
  if(c.data.kind==='line'){ctx.beginPath();for(const buckets of segments){let connected=false;for(const i of PlotLOD.vertices(buckets)){const x=X(c.data.start+(i+.5)*c.data.step),y=Y(valueOf(c,t,t.bars[i]));if(connected)ctx.lineTo(x,y);else ctx.moveTo(x,y);connected=true;}}ctx.stroke();}
  else{ctx.globalAlpha=c.traces.length>8?.55:.85;for(const buckets of segments)for(const b of buckets){const first=t.bars[b.first],last=t.bars[b.last],width=Math.max(.6,Math.min(12,(right-left)*(b.last-b.first+1)*c.data.step/(c.end-c.start)*.65)),x=X(c.data.start+(b.first+b.last+1)*c.data.step/2),o=Y(valueOf(c,t,first[0])),hi=Y(valueOf(c,t,t.bars[b.max][1])),lo=Y(valueOf(c,t,t.bars[b.min][2])),close=Y(valueOf(c,t,last[3]));ctx.beginPath();ctx.moveTo(x,hi);ctx.lineTo(x,lo);ctx.stroke();const upper=Math.min(o,close),height=Math.max(1,Math.abs(o-close));if(last[3]>=first[0])ctx.strokeRect(x-width/2,upper,width,height);else ctx.fillRect(x-width/2,upper,width,height);}ctx.globalAlpha=1;}
 }}
 ctx.restore();
 // Labels are painted last, inside the plot, with a white halo over series/news.
 ctx.save();ctx.font='600 10px Inter, system-ui, sans-serif';ctx.textAlign='left';ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.95)';ctx.fillStyle='#222';for(const [text,y] of yLabels){ctx.strokeText(text,left+4,y+3);ctx.fillText(text,left+4,y+3);}ctx.textAlign='center';for(const [text,x] of xLabels){const inside=Math.max(left+20,Math.min(right-20,x));ctx.strokeText(text,inside,bottom-5);ctx.fillText(text,inside,bottom-5);}ctx.restore();
}
function niceStep(size){const power=10**Math.floor(Math.log10(size));const ratio=size/power;return (ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power;}
function timeStep(size){const steps=[60,300,900,1800,3600,7200,14400,21600,43200,86400,172800,604800,1209600,2592000,7776000,31536000];return steps.find(s=>s>=size)||niceStep(size);}
function fitRange(c){let low=Infinity,high=-Infinity;for(const t of c.traces||[]){if(c.hidden.has(t.id)||!t.base)continue;for(let i=0;i<t.bars.length;i++){const time=c.data.start+i*c.data.step;if(time<c.start||time>=c.end)continue;const bar=t.bars[i];if(bar===null)continue;for(const v of Array.isArray(bar)?[bar[1],bar[2]]:[bar]){const y=valueOf(c,t,v);low=Math.min(low,y);high=Math.max(high,y);}}}if(!Number.isFinite(low))return null;const padding=(high-low)*.09||Math.abs(low)*.02||1;return [low-padding,high+padding];}
function moveRange(c,start,end){
 c.controller?.abort();++c.token;
 const width=Math.max(900,end-start);c.start=Math.round(start/60)*60;c.end=Math.round((start+width)/60)*60;
 if(c.id===activeId)controls();else rangeLabels(c);save();draw(c);
 if(typeof NewsDesk!=='undefined'){NewsDesk.changed(c);if(c.id===activeId)NewsDesk.sidebar(c);}
 clearTimeout(c.loadTimer);c.loadTimer=setTimeout(()=>load(c),160);
}
function shiftSurface(c,dx,dy){
 const p=c.plot;if(!p)return;const width=c.end-c.start,range=c.yRange||[-1,1];const dt=-dx/(p.right-p.left)*width,price=dy/(p.bottom-p.top)*(range[1]-range[0]);
 c.start+=dt;c.end+=dt;c.yRange=[range[0]+price,range[1]+price];rangeLabels(c);draw(c);
 if(dx){c.controller?.abort();++c.token;clearTimeout(c.loadTimer);c.loadTimer=setTimeout(()=>load(c),180);}clearTimeout(c.saveTimer);c.saveTimer=setTimeout(()=>{save();if(typeof NewsDesk!=='undefined'){NewsDesk.changed(c);if(c.id===activeId)NewsDesk.sidebar(c);}},220);
}
function zoomSurface(c,factor,x,y){const p=c.plot;if(!p||!Number.isFinite(factor)||factor<=0)return;const fraction=Math.max(0,Math.min(1,(x-p.left)/(p.right-p.left))),width=c.end-c.start;const next=Math.max(c.step*2,Math.min((catalog.end-catalog.start)*4,width*factor)),anchor=c.start+width*fraction;
 if(c.yRange){const yf=Math.max(0,Math.min(1,(p.bottom-y)/(p.bottom-p.top))),span=c.yRange[1]-c.yRange[0],at=c.yRange[0]+span*yf,scaled=span*factor;if(scaled>1e-12&&scaled<1e15)c.yRange=[at-scaled*yf,at+scaled*(1-yf)];}
 moveRange(c,anchor-next*fraction,anchor+next*(1-fraction));
}
function bindChart(c){
 const canvas=c.canvas;
 canvas.addEventListener('wheel',e=>{
  e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;
  if(e.metaKey&&!e.ctrlKey){const workspace=document.querySelector('main');workspace.scrollLeft+=e.deltaX*unit;workspace.scrollTop+=e.deltaY*unit;}
  else{activate(c);if(e.ctrlKey)zoomSurface(c,Math.exp(Math.max(-100,Math.min(100,e.deltaY))*(.22/30)),e.offsetX,e.offsetY);else shiftSurface(c,-e.deltaX*unit,-e.deltaY*unit);}
  $('tooltip').hidden=true;
 },{passive:false});
 let gestureScale=1;
 canvas.addEventListener('gesturestart',e=>{e.preventDefault();gestureScale=1;},{passive:false});
 canvas.addEventListener('gesturechange',e=>{e.preventDefault();const rect=canvas.getBoundingClientRect();zoomSurface(c,gestureScale/e.scale,e.clientX-rect.left,e.clientY-rect.top);gestureScale=e.scale;},{passive:false});
 canvas.addEventListener('pointerdown',e=>{if(e.metaKey||e.button!==0||!c.plot)return;const p=c.plot;if(e.offsetX<p.left||e.offsetX>p.right)return;activate(c);canvas.setPointerCapture(e.pointerId);c.drag={x:e.offsetX,y:e.offsetY,now:e.offsetX,nowY:e.offsetY,start:c.start,end:c.end,range:[...(c.yRange||[-1,1])]};$('tooltip').hidden=true;});
 canvas.addEventListener('pointermove',e=>{
  if(c.drag){const d=c.drag;d.now=e.offsetX;d.nowY=e.offsetY;if(!d.moved){if(Math.hypot(d.now-d.x,d.nowY-d.y)<4)return;d.moved=true;c.controller?.abort();++c.token;clearTimeout(c.loadTimer);}const dx=(d.x-e.offsetX)/(c.plot.right-c.plot.left)*(d.end-d.start),dy=(e.offsetY-d.y)/(c.plot.bottom-c.plot.top)*(d.range[1]-d.range[0]);c.start=d.start+dx;c.end=d.end+dx;c.yRange=[d.range[0]+dy,d.range[1]+dy];rangeLabels(c);draw(c);return;}
  hover(c,e);
 });
 canvas.addEventListener('pointerup',()=>{if(!c.drag)return;const d=c.drag;c.drag=null;if(d.moved)moveRange(c,c.start,c.end);else draw(c);});
 canvas.addEventListener('pointercancel',()=>{if(c.drag){const d=c.drag;c.drag=null;c.start=d.start;c.end=d.end;c.yRange=d.range;rangeLabels(c);draw(c);if(d.moved)load(c);}});
 canvas.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
}
function bindFoot(c){
 c.card.querySelector('.interval-control select').addEventListener('change',e=>{c.step=Number(e.target.value);save();load(c);});
 for(const key of ['start','end'])DateInput.bind(c.card.querySelector(`.input-${key}`),()=>c[key],time=>{
  const start=key==='start'?time:c.start,end=key==='end'?time:c.end;
  if(start>=end)return 'Начало должно быть раньше конца';
  if(end-start<900)return 'Период должен быть не меньше 15 минут';
  moveRange(c,start,end);return '';
 });
 rangeLabels(c);
}
function hover(c,e){
 const p=c.plot;if(!c.data||e.offsetX<p.left||e.offsetX>p.right||e.offsetY<p.top||e.offsetY>p.bottom){$('tooltip').hidden=true;return;}
 const time=c.start+(e.offsetX-p.left)/(p.right-p.left)*(c.end-c.start),i=Math.floor((time-c.data.start)/c.data.step);if(i<0){$('tooltip').hidden=true;return;}
 const values=[];for(const t of c.traces){if(c.hidden.has(t.id))continue;const b=t.bars[i];if(b===undefined)continue;const close=b===null?null:Array.isArray(b)?b[3]:b;values.push(`<div><span style="color:${t.color}">${escapeHTML(t.asset)} · ${t.region}</span><span>${close===null?'пропуск':format(valueOf(c,t,close),c.scale==='percent'?3:6)+(c.scale==='percent'?'%':' '+t.quote)}</span></div>`);}
 const tip=$('tooltip');tip.innerHTML=`<strong>${timeText(c.data.start+i*c.data.step)} UTC</strong>${values.slice(0,12).join('')}${values.length>12?`<div>Ещё ${values.length-12} серий</div>`:''}`;if(typeof NewsDesk!=='undefined')tip.innerHTML+=NewsDesk.tooltip(c,time,(c.end-c.start)/(p.right-p.left)*6);tip.hidden=false;const rect=tip.getBoundingClientRect();tip.style.left=`${Math.max(5,Math.min(innerWidth-rect.width-10,e.clientX+18))}px`;tip.style.top=`${Math.max(5,Math.min(innerHeight-rect.height-10,e.clientY+12))}px`;
}
function selectionClasses(){for(const c of charts)c.card.classList.toggle('selected',selected.has(c.id));}
function positionCard(c,rect=c){c.card.style.gridColumn=`${rect.col+1} / span ${rect.cols}`;c.card.style.gridRow=`${rect.row+1} / span ${rect.rows}`;}
function ensureTrackSizes(){
 const available=document.querySelector('main').clientWidth-37;
 const defaultWidth=Math.max(440,available/grid.cols),defaultHeight=Math.max(380,window.innerHeight-44);
 const widths=Array.isArray(grid.columnSizes)?grid.columnSizes:[],heights=Array.isArray(grid.rowSizes)?grid.rowSizes:[];
 grid.columnSizes=Array.from({length:grid.cols},(_,i)=>Number.isFinite(widths[i])&&widths[i]>=280?widths[i]:widths.at(-1)>=280?widths.at(-1):defaultWidth);
 grid.rowSizes=Array.from({length:grid.rows},(_,i)=>Number.isFinite(heights[i])&&heights[i]>=180?heights[i]:heights.at(-1)>=180?heights.at(-1):defaultHeight);
}
function applyTrackSizes(){
 const columns=grid.columnSizes.map(v=>`${v}px`).join(' '),rows=grid.rowSizes.map(v=>`${v}px`).join(' ');
 $('charts').style.gridTemplateColumns=columns;$('charts').style.gridTemplateRows=rows;
 $('column-heads').style.gridTemplateColumns=columns;$('row-heads').style.gridTemplateRows=rows;
 const workspace=document.querySelector('.grid-workspace');workspace.style.width=`${grid.columnSizes.reduce((sum,n)=>sum+n,0)+37}px`;workspace.style.minWidth=workspace.style.width;
}
function columnName(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
function trackClasses(){
 for(const [axis,container,selection] of [['row',$('row-heads'),selectedRows],['column',$('column-heads'),selectedColumns]])for(const head of container.querySelectorAll('.track-head')){const checked=selection.has(Number(head.dataset.index));head.classList.toggle('track-selected',checked);head.setAttribute('aria-pressed',String(checked));}
}
function selectTrack(axis,index,event){
 const selection=axis==='row'?selectedRows:selectedColumns,anchor=axis==='row'?rowAnchor:columnAnchor;
 if(event.shiftKey){if(!event.metaKey)selection.clear();for(let i=Math.min(anchor,index);i<=Math.max(anchor,index);i++)selection.add(i);}
 else if(event.metaKey){selection.has(index)?selection.delete(index):selection.add(index);}
 else{selection.clear();selection.add(index);}
 if(!event.shiftKey){if(axis==='row')rowAnchor=index;else columnAnchor=index;}
 trackClasses();
}
function renderTrackHeaders(){
 for(const axis of ['row','column']){
  const container=$(axis==='row'?'row-heads':'column-heads'),count=axis==='row'?grid.rows:grid.cols;
  container.replaceChildren();
  for(let index=0;index<count;index++){
   const head=document.createElement('div');head.className='track-head';head.dataset.index=index;head.style.gridColumn=axis==='row'?'1':String(index+1);head.style.gridRow=axis==='row'?String(index+1):'1';head.setAttribute('role','button');head.setAttribute('tabindex','0');head.textContent=axis==='row'?index+1:columnName(index);head.setAttribute('aria-label',`${axis==='row'?'Строка':'Столбец'} ${head.textContent}`);
   const handle=document.createElement('span');handle.className=`track-resize ${axis}`;handle.setAttribute('role','button');handle.setAttribute('tabindex','0');handle.setAttribute('aria-label',`Изменить ${axis==='row'?'высоту строки':'ширину столбца'} ${head.textContent}`);head.append(handle);
   head.addEventListener('click',e=>{if(e.target===handle)return;selectTrack(axis,index,e);});
   head.addEventListener('keydown',e=>{if(e.target!==head||!['Enter',' '].includes(e.key))return;e.preventDefault();selectTrack(axis,index,e);});
   head.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();selectTrack(axis,index,{metaKey:false,shiftKey:false});openGridMenu(e.clientX,e.clientY,axis==='column'?index:(current()?.col||0),axis==='row'?index:(current()?.row||0),axis);});
   head.addEventListener('keydown',e=>{if(e.key!=='ContextMenu'&&!(e.shiftKey&&e.key==='F10'))return;e.preventDefault();const rect=head.getBoundingClientRect();openGridMenu(rect.left,rect.top+22,axis==='column'?index:(current()?.col||0),axis==='row'?index:(current()?.row||0),axis);});
   bindTrackResize(handle,axis,index);container.append(head);
  }
 }
 trackClasses();
}
function bindTrackResize(handle,axis,index){
 const key=axis==='row'?'rowSizes':'columnSizes',minimum=axis==='row'?180:280,selection=axis==='row'?selectedRows:selectedColumns;
 let drag=null;
 handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();if(!selection.has(index))selectTrack(axis,index,{shiftKey:false,metaKey:false});drag={position:axis==='row'?e.clientY:e.clientX,sizes:[...grid[key]],indices:[...selection]};handle.setPointerCapture(e.pointerId);document.body.classList.add(axis==='row'?'resizing-rows':'resizing-columns');});
 handle.addEventListener('pointermove',e=>{if(!drag)return;const delta=(axis==='row'?e.clientY:e.clientX)-drag.position;grid[key]=GridLayout.resizeTracks(drag.sizes,drag.indices,delta,minimum);applyTrackSizes();});
 handle.addEventListener('pointerup',()=>{if(!drag)return;drag=null;document.body.classList.remove('resizing-rows','resizing-columns');save();});
 handle.addEventListener('pointercancel',()=>{if(!drag)return;grid[key]=drag.sizes;drag=null;document.body.classList.remove('resizing-rows','resizing-columns');applyTrackSizes();});
 handle.addEventListener('keydown',e=>{const negative=axis==='row'?'ArrowUp':'ArrowLeft',positive=axis==='row'?'ArrowDown':'ArrowRight';if(e.key!==negative&&e.key!==positive)return;e.preventDefault();if(!selection.has(index))selectTrack(axis,index,{shiftKey:false,metaKey:false});grid[key]=GridLayout.resizeTracks(grid[key],[...selection],(e.key===positive?1:-1)*(e.shiftKey?50:10),minimum);applyTrackSizes();save();});
}

function placeToolRails(){
 for(const c of charts){
  const first=c.col===0;c.tools.classList.toggle('first-column-tools',first);
  if(first){c.tools.style.gridRow=`${c.row+1} / span ${c.rows}`;c.tools.style.gridColumn='1';$('row-heads').append(c.tools);}
  else{c.tools.style.gridRow='';c.tools.style.gridColumn='';c.card.querySelector('.plot-row').prepend(c.tools);}
 }
}
function discardChart(c){
 c.disposed=true;if(c.drawFrame&&window.cancelAnimationFrame)window.cancelAnimationFrame(c.drawFrame);
 if(typeof NewsDesk!=='undefined')NewsDesk.dispose(c);
 c.controller?.abort();clearTimeout(c.loadTimer);clearTimeout(c.saveTimer);c.resize.disconnect();c.tools.remove();c.card.remove();charts=charts.filter(item=>item!==c);selected.delete(c.id);
}
function refreshLayout(){
 renderGrid();const target=current()||charts[0];activeId=null;
 if(target)activate(target);
 else{controls();$('selected-count').textContent='0 / '+catalog.assets.length;$('groups').replaceChildren();$('regions').replaceChildren();$('all-coins').checked=false;$('all-coins').indeterminate=false;if(typeof NewsDesk!=='undefined')NewsDesk.sidebar(null);}
 save();
}
function insertTrackAt(axis,index){
 ensureTrackSizes();const count=axis==='row'?'rows':'cols',sizes=axis==='row'?'rowSizes':'columnSizes';
 if(!Number.isInteger(index)||index<0||index>grid[count])return;
 const size=grid[sizes][Math.min(index,grid[count]-1)];
 for(const c of charts)Object.assign(c,GridLayout.insertTrack(c,axis,index));
 grid[sizes].splice(index,0,size);grid[count]++;
 if(axis==='row'){selectedRows=new Set([...selectedRows].map(i=>i>=index?i+1:i));if(rowAnchor>=index)rowAnchor++;}
 else{selectedColumns=new Set([...selectedColumns].map(i=>i>=index?i+1:i));if(columnAnchor>=index)columnAnchor++;}
 refreshLayout();
}
function deleteColumnAt(index){deleteTrackAt('column',index);}
function deleteTrackAt(axis,index){
 const count=axis==='row'?'rows':'cols',sizes=axis==='row'?'rowSizes':'columnSizes';
 if(!Number.isInteger(index)||index<0||index>=grid[count])return;
 ensureTrackSizes();
 for(const c of [...charts]){const rect=GridLayout.deleteTrack(c,axis,index);if(rect)Object.assign(c,rect);else discardChart(c);}
 grid[sizes].splice(index,1);grid[count]=Math.max(1,grid[count]-1);
 const previous=axis==='row'?selectedRows:selectedColumns;
 const remaining=new Set([...previous].filter(i=>i!==index).map(i=>i>index?i-1:i));
 if(axis==='row'){selectedRows=remaining;rowAnchor=Math.min(grid.rows-1,Math.max(0,rowAnchor-(rowAnchor>=index?1:0)));}
 else{selectedColumns=remaining;columnAnchor=Math.min(grid.cols-1,Math.max(0,columnAnchor-(columnAnchor>=index?1:0)));}
 refreshLayout();
}
function closeGridMenu(){const menu=$('grid-menu');menu.hidden=true;}
function openGridMenu(x,y,col,row,axis=null){
 const menu=$('grid-menu');menu.replaceChildren();
 const columnOperations=[
  ['Вставить столбец слева',()=>insertTrackAt('column',col)],
  ['Вставить столбец справа',()=>insertTrackAt('column',col+1)],
  [`Удалить столбец ${columnName(col)}`,()=>deleteColumnAt(col)]
 ];
 const rowOperations=[
  ['Вставить строку сверху',()=>insertTrackAt('row',row)],
  ['Вставить строку снизу',()=>insertTrackAt('row',row+1)],
  [`Удалить строку ${row+1}`,()=>deleteTrackAt('row',row)]
 ];
 const operations=axis==='column'?columnOperations:axis==='row'?rowOperations:[...columnOperations.slice(0,2),...rowOperations.slice(0,2),columnOperations[2],rowOperations[2]];
 for(const [label,action] of operations){const button=document.createElement('button');button.type='button';if(label.startsWith('Удалить'))button.className='menu-delete';button.setAttribute('role','menuitem');button.textContent=label;button.addEventListener('click',()=>{closeGridMenu();action();});menu.append(button);}
 menu.hidden=false;const bounds=menu.getBoundingClientRect();menu.style.left=`${Math.max(4,Math.min(x,window.innerWidth-bounds.width-4))}px`;menu.style.top=`${Math.max(4,Math.min(y,window.innerHeight-bounds.height-4))}px`;menu.firstElementChild.focus();
}
function bindGridMenu(){
 const menu=$('grid-menu'),workspace=document.querySelector('main');
 $('charts').addEventListener('contextmenu',e=>{
  if(e.target.closest('input,select'))return;
  e.preventDefault();const bounds=$('charts').getBoundingClientRect();
  function indexAt(sizes,position){let end=0;for(let i=0;i<sizes.length;i++){end+=sizes[i];if(position<end)return i;}return sizes.length-1;}
  openGridMenu(e.clientX,e.clientY,indexAt(grid.columnSizes,e.clientX-bounds.left),indexAt(grid.rowSizes,e.clientY-bounds.top));
 });
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))closeGridMenu();});workspace.addEventListener('scroll',closeGridMenu,{passive:true});window.addEventListener('resize',closeGridMenu);
 menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closeGridMenu();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}else if(e.key==='Tab')closeGridMenu();});
}

function renderGrid(){
 const container=$('charts');ensureTrackSizes();applyTrackSizes();renderTrackHeaders();placeToolRails();
 container.querySelectorAll('.empty-cell').forEach(el=>el.remove());for(const c of charts)positionCard(c);
 for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++){const rect={col,row,cols:1,rows:1};if(!GridLayout.canPlace(rect,charts,grid))continue;const empty=document.createElement('button');empty.className='empty-cell';empty.textContent='＋';empty.setAttribute('aria-label',`Добавить график в строку ${row+1}, колонку ${col+1}`);empty.style.gridColumn=col+1;empty.style.gridRow=row+1;empty.addEventListener('click',()=>{const source=current();newChart({...(source?configOf(source):{}),name:undefined,...rect});});container.append(empty);}
 selectionClasses();
}
function addTrack(direction){
 const source=current(),config=source?configOf(source):{};let first;
 if(direction==='row'){const row=grid.rows++;for(let col=0;col<grid.cols;col++){const c=newChart({...config,name:undefined,col,row,cols:1,rows:1},false);first??=c;}}
 else{const col=grid.cols++;for(let row=0;row<grid.rows;row++){const c=newChart({...config,name:undefined,col,row,cols:1,rows:1},false);first??=c;}}
 if(first)activate(first);renderGrid();save();first?.card.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
}
function bindResize(c){
 for(const handle of c.card.querySelectorAll('.resize-handle')){
  const edge=handle.dataset.edge;let drag=null;
  handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();ensureTrackSizes();drag={x:e.clientX,y:e.clientY,original:{col:c.col,row:c.row,cols:c.cols,rows:c.rows},candidate:null,widths:[...grid.columnSizes],heights:[...grid.rowSizes]};handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(!drag)return;const rect=GridLayout.resizePixels(drag.original,edge,e.clientX-drag.x,e.clientY-drag.y,drag.widths,drag.heights);const allowed=GridLayout.canPlace(rect,charts,grid,c.id);c.card.classList.toggle('resize-blocked',!allowed);if(allowed){drag.candidate=rect;positionCard(c,rect);}});
  handle.addEventListener('pointerup',()=>{if(!drag)return;if(drag.candidate)Object.assign(c,drag.candidate);drag=null;c.card.classList.remove('resize-blocked');renderGrid();save();});
  handle.addEventListener('pointercancel',()=>{drag=null;c.card.classList.remove('resize-blocked');positionCard(c);});
  handle.addEventListener('keydown',e=>{const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!arrows[e.key])return;e.preventDefault();const rect=GridLayout.resize(c,edge,...arrows[e.key],grid);if(GridLayout.canPlace(rect,charts,grid,c.id)){Object.assign(c,rect);renderGrid();save();}});
 }
}

function initSidebarTabs(){
 const tabs=[...document.querySelectorAll('.sidebar-tabs [role="tab"]')],scroller=document.querySelector('.sections');
 const positions=new Map();let active=tabs[0];
 function select(tab,focus=false){
  positions.set(active.id,scroller.scrollTop);active=tab;
  for(const item of tabs){const chosen=item===tab;item.setAttribute('aria-selected',String(chosen));item.tabIndex=chosen?0:-1;$(item.getAttribute('aria-controls')).hidden=!chosen;}
  scroller.scrollTop=positions.get(tab.id)||0;if(focus)tab.focus();
  try{localStorage.setItem('crypto-sidebar-tab',tab.id);}catch{}
 }
 for(const tab of tabs){tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',event=>{const index=tabs.indexOf(tab);let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();select(tabs[next],true);});}
 let previous;try{previous=localStorage.getItem('crypto-sidebar-tab');}catch{}
 select(tabs.find(tab=>tab.id===previous)||tabs[0]);
}
async function init(){
 initSidebarTabs();
 try{const response=await fetch('/api/catalog');if(!response.ok)throw Error('Не удалось получить каталог данных');catalog=await response.json();$('catalog-status').textContent=`${catalog.assets.length} монет · ${Object.keys(catalog.regions).length} рынков\nИюль 2025 — июнь 2026`;
  if(typeof NewsDesk!=='undefined')await NewsDesk.init();
  if(typeof EventStudy!=='undefined')await EventStudy.init();
  let saved;try{saved=JSON.parse(localStorage.getItem('crypto-workspace-v2'));}catch{}
  if(saved&&saved.grid&&Array.isArray(saved.charts)){grid={rows:Math.max(1,Math.floor(saved.grid.rows)||1),cols:Math.max(1,Math.floor(saved.grid.cols)||1),rowSizes:saved.grid.rowSizes,columnSizes:saved.grid.columnSizes};for(const config of saved.charts)if(Number.isFinite(config.start)&&config.start<config.end&&GridLayout.canPlace(config,charts,grid))newChart(config,false);}
  else{let legacy;try{legacy=JSON.parse(localStorage.getItem('crypto-workspace-v1'));}catch{}if(Array.isArray(legacy)&&legacy.length){grid.rows=legacy.length;legacy.forEach((config,row)=>newChart({...config,col:0,row,cols:1,rows:1},false));}else newChart({},false);}
  renderGrid();save();
  bindGridMenu();
  $('add-row').addEventListener('click',()=>addTrack('row'));
  $('add-column').addEventListener('click',()=>addTrack('column'));
  $('search').addEventListener('input',sidebar);
  for(const id of ['all-coins','all-regions','news-all'])$(id).addEventListener('click',e=>e.stopPropagation());
  $('all-coins').addEventListener('change',e=>{const c=current();if(!c)return;c.assets=e.target.checked?new Set(eligibleAssets(c).map(a=>a.symbol)):new Set();selectionChanged(c);});
  $('all-regions').addEventListener('change',e=>{const c=current();if(!c)return;c.regions=e.target.checked?new Set(Object.keys(catalog.regions)):new Set();selectionChanged(c);});

 }catch(e){$('global-error').hidden=false;$('global-error').textContent=e.message;$('catalog-status').textContent='Ошибка загрузки';}
}
init();
