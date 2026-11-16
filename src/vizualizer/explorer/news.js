'use strict';
const NewsDesk=(()=>{
 let events=[],families={},index=new Map(),offsetStart=0,offsetEnd=15;
 const expanded=new Set();
 const element=id=>document.getElementById(id);
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=value=>value===null||!Number.isFinite(value)?'—':(value>0?'+':'')+value.toLocaleString('ru-RU',{maximumFractionDigits:3})+'%';
 const clock=event=>event.time?event.time.replace('T',' ').replace('Z',' UTC'):event.date+' · время неизвестно';
 function inView(c){const [start,end]=typeof EventStudy!=='undefined'?EventStudy.bounds(c):[c.start,c.end];return events.filter(e=>e.anchor>=start&&e.anchor<end);}
 async function init(){
  try{const response=await fetch('/api/news');if(!response.ok)throw Error('Не удалось загрузить новости');const data=await response.json();events=data.events;families=data.families;index=new Map(events.map(e=>[e.id,e]));}
  catch(error){element('news-groups').textContent=error.message;}
  try{const saved=JSON.parse(localStorage.getItem('crypto-news-window'));if(saved&&Number.isInteger(saved.from)&&Number.isInteger(saved.to)&&saved.from%15===0&&saved.to%15===0&&saved.from<saved.to&&saved.from>=-10080&&saved.to<=10080){offsetStart=saved.from;offsetEnd=saved.to;}}catch{}
  if(element('news-offset-from')){element('news-offset-from').value=offsetStart;element('news-offset-to').value=offsetEnd;
  for(const id of ['news-offset-from','news-offset-to'])element(id).addEventListener('change',()=>{
   const from=Number(element('news-offset-from').value),to=Number(element('news-offset-to').value);
   if(!Number.isInteger(from)||!Number.isInteger(to)||from%15||to%15||from>=to||from< -10080||to>10080){element('news-window-error').textContent='Нужно От < До, шаг 15 минут, диапазон ±7 дней';element('news-window-error').hidden=false;return;}
   element('news-window-error').hidden=true;offsetStart=from;offsetEnd=to;try{localStorage.setItem('crypto-news-window',JSON.stringify({from,to}));}catch{}
   for(const c of charts){draw(c);changed(c);}
  });}
  element('news-search').addEventListener('input',()=>sidebar(current()));
  element('news-all').addEventListener('change',e=>{const c=current();if(!c)return;for(const event of filtered(c))e.target.checked?c.newsIds.add(event.id):c.newsIds.delete(event.id);selectionChanged(c);});
 }
 function filtered(c){const query=element('news-search').value.trim().toLowerCase();return inView(c).filter(e=>!query||`${e.title} ${e.region} ${e.source} ${families[e.family]}`.toLowerCase().includes(query));}
 function selectionChanged(c){save();draw(c);changed(c);sidebar(c);}
 function sidebar(c){
  if(typeof EventStudy!=='undefined')EventStudy.sidebar(c);
  if(!c){element('news-groups').replaceChildren();element('news-count').textContent='0';element('news-all').checked=false;element('news-all').indeterminate=false;return;}const visible=filtered(c),all=element('news-all'),selectedVisible=visible.filter(e=>c.newsIds.has(e.id));
  element('news-count').textContent=`${selectedVisible.length} / ${visible.length}`;all.checked=visible.length>0&&selectedVisible.length===visible.length;all.indeterminate=selectedVisible.length>0&&!all.checked;
  const container=element('news-groups'),open=new Set([...container.querySelectorAll('details[open]')].map(d=>d.dataset.family));container.replaceChildren();
  if(!visible.length){const note=document.createElement('p');note.className='news-empty';note.textContent='В периоде графика нет подходящих новостей';container.append(note);return;}
  for(const [key,label] of Object.entries(families)){
   const rows=visible.filter(e=>e.family===key);if(!rows.length)continue;
   const searching=!!element('news-search').value.trim();if(searching)element('news-tree').open=true;
   const details=document.createElement('details');details.dataset.family=key;details.open=open.has(key)||searching;
   const summary=document.createElement('summary'),count=rows.filter(e=>c.newsIds.has(e.id)).length;
   summary.innerHTML=`<input type="checkbox" aria-label="Все новости группы ${safe(label)}"><span>${safe(label)}</span><span class="count">${count}/${rows.length}</span>`;
   const checkbox=summary.querySelector('input');checkbox.checked=count===rows.length;checkbox.indeterminate=count>0&&count<rows.length;checkbox.addEventListener('click',e=>e.stopPropagation());checkbox.addEventListener('change',()=>{for(const event of rows)checkbox.checked?c.newsIds.add(event.id):c.newsIds.delete(event.id);selectionChanged(c);});
   const list=document.createElement('div');let built=false;
   function build(){if(built)return;built=true;for(const event of rows)list.append(newsRow(c,event));}
   details.append(summary,list);details.addEventListener('toggle',()=>{if(details.open)build();});if(details.open)build();container.append(details);
  }
 }
 function newsRow(c,event){
  const row=document.createElement('div');row.className='news-item';
  const heading=document.createElement('div');heading.className='news-heading';heading.innerHTML=`<input type="checkbox" ${c.newsIds.has(event.id)?'checked':''} aria-label="Отметить ${safe(event.title)}"><button class="news-title" aria-expanded="false">${safe(event.title)}<small>${safe(clock(event))} · ${safe(event.region)}</small></button>`;
  const body=document.createElement('div');body.className='news-body';body.hidden=true;
  const hide=document.createElement('button');hide.className='news-hide';hide.textContent='Скрыть';body.append(hide);
  const text=document.createElement('div');text.innerHTML=`<p>${safe(event.description||event.title)}</p>${event.reference?`<p>Период данных · ${safe(event.reference)}</p>`:''}${event.actual?`<p>Значение · ${safe(event.actual)} ${safe(event.unit)}</p>`:''}<p>Источник · ${safe(event.source)}</p><p>${safe(clock(event))}</p><p class="news-quality">${event.precision==='scheduled'?'Время из расписания или эмбарго.':event.precision==='publication'?'Время сообщения в сохранённой ленте.':'Сохранена только дата. Для 15-минутной реакции точного времени недостаточно.'}</p>${event.note?`<p class="news-quality">Примечание архива · ${safe(event.note)}</p>`:''}${!event.body_available?'<p class="news-quality news-no-body">В архиве сохранены заголовок и параметры события. Полный текст доступен у источника.</p>':''}`;
  const source=document.createElement('a');source.textContent='Открыть источник ↗';source.href=/^https?:\/\//i.test(event.url)?event.url:'#';source.target='_blank';source.rel='noopener noreferrer';text.append(source);const savedText=document.createElement('div');savedText.className='news-saved-text';body.append(savedText,text);let detailLoaded=false;
  const title=heading.querySelector('.news-title');
  function show(){expanded.add(event.id);body.hidden=false;title.setAttribute('aria-expanded','true');if(!detailLoaded){detailLoaded=true;savedText.textContent='Загрузка сохранённого текста…';fetch('/api/news-detail?id='+encodeURIComponent(event.id)).then(response=>{if(!response.ok)throw Error('Ошибка загрузки');return response.json();}).then(detail=>{savedText.textContent=detail.available?detail.text+(detail.truncated?'\nСохранённый фрагмент. Продолжение у источника.':''):'';if(detail.available)text.querySelector('.news-no-body')?.remove();}).catch(()=>{detailLoaded=false;savedText.textContent='Текст пока недоступен. Сведения и ссылка приведены ниже.';});}}
  hide.addEventListener('click',()=>{expanded.delete(event.id);body.hidden=true;title.setAttribute('aria-expanded','false');});title.addEventListener('click',show);
  const checkbox=heading.querySelector('input');let timer,held=false;
  checkbox.addEventListener('pointerdown',e=>{if(e.button!==0)return;held=false;timer=setTimeout(()=>{held=true;show();},550);});
  for(const type of ['pointerup','pointercancel','pointerleave'])checkbox.addEventListener(type,()=>clearTimeout(timer));
  checkbox.addEventListener('click',e=>{if(held){e.preventDefault();held=false;}});
  checkbox.addEventListener('change',()=>{checkbox.checked?c.newsIds.add(event.id):c.newsIds.delete(event.id);selectionChanged(c);});
  row.append(heading,body);if(expanded.has(event.id))show();return row;
 }
 function attach(c,config){
  c.newsIds=new Set((config.newsIds||[]).filter(id=>index.has(id)));
  const stats=document.createElement('details');stats.className='news-statistics';stats.hidden=true;stats.innerHTML='<summary></summary><div class="news-stat-content"></div>';c.card.append(stats);c.newsElement=stats;changed(c);
  if(typeof EventStudy!=='undefined')EventStudy.attach(c,config);
 }
 function changed(c){if(typeof EventStudy!=='undefined'){EventStudy.changed(c);return;}clearTimeout(c.newsTimer);c.newsTimer=setTimeout(()=>update(c),200);}
 async function update(c){
  const chosen=inView(c).filter(e=>c.newsIds.has(e.id)),node=c.newsElement;if(!node)return;
  if(!chosen.length){c.newsController?.abort();c.newsLastKey=null;c.newsPendingKey=null;node.hidden=true;return;}
  const ids=selectedIds(c);const body={ids,newsIds:chosen.map(e=>e.id),start:Math.floor(c.start),end:Math.ceil(c.end),offsetStart,offsetEnd},key=JSON.stringify(body);
  if(c.newsLastKey===key||c.newsPendingKey===key)return;
  c.newsController?.abort();c.newsController=new AbortController();c.newsPendingKey=key;c.newsLastKey=null;node.hidden=false;node.querySelector('.news-stat-content').textContent='';node.querySelector('summary').textContent='Расчёт реакции на новости…';
  try{const response=await fetch('/api/news-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:key,signal:c.newsController.signal});const result=await response.json();if(!response.ok)throw Error(result.error);if(c.newsPendingKey!==key)return;
   c.newsLastKey=key;c.newsPendingKey=null;
   node.querySelector('summary').textContent=`t${offsetStart>=0?'+':''}${offsetStart}…t${offsetEnd>=0?'+':''}${offsetEnd} мин · Δ ${number(result.mean)} · |Δ| ${number(result.absolute)} · новостей ${result.events} · окон ${result.usable}/${result.windows} · ${result.pairs} пар`;
   const table=node.querySelector('.news-stat-content');table.innerHTML='<p>Описательные средние по уникальным моментам выхода. В каждом окне равный вес пригодных пар. Дата без времени и точки внутри свечи исключены. Опора — сохранённое время события или публикации.</p><table><thead><tr><th>Событие</th><th>Пар</th><th>Δ</th><th>|Δ|</th></tr></thead><tbody>'+result.rows.map(row=>{const event=index.get(row.id),reason=Object.keys(row.excluded).map(code=>({date_only:'только дата',intrabar_time:'время внутри свечи',outside_history:'граница истории',missing_trades:'пропуски торгов'}[code]||code)).join(', ');return `<tr><td>${safe(event.title)}<small>${safe(clock(event))}${reason?' · '+safe(reason):''}</small></td><td>${row.n}</td><td>${number(row.mean)}</td><td>${number(row.absolute)}</td></tr>`;}).join('')+'</tbody></table>';
  }catch(error){if(error.name!=='AbortError'){node.querySelector('summary').textContent=error.message||'Ошибка расчёта';c.newsPendingKey=null;}}
 }
 function drawMarks(c,ctx,X,plot){
  const points=typeof EventStudy!=='undefined'?EventStudy.points(c):[-15,0,15];
  const chosen=typeof EventStudy!=='undefined'?EventStudy.timeline(c,events):[...c.newsIds||[]].map(id=>index.get(id)).filter(Boolean);
  c.newsTimeline=chosen;c.newsClusters=[];
  // Merge in screen space per window: dense calendars never accumulate opacity or DOM nodes.
  for(const [a,b,opacity] of [[points[0],points[1],.022],[points[1],points[2],.055]]){
   const intervals=[];
   for(const event of chosen){const from=event.anchor+a*60,to=event.anchor+b*60;if(to>c.start&&from<c.end){const left=Math.max(plot.left,X(from));intervals.push([left,Math.min(plot.right,Math.max(left+1,X(to)))]);}}
   intervals.sort((a,b)=>a[0]-b[0]);const merged=[];for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+.75)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
   ctx.fillStyle=`rgba(0,0,0,${opacity})`;for(const [from,to] of merged)ctx.fillRect(from,plot.top,to-from,plot.bottom-plot.top);
  }
  c.newsClusters=PlotLOD.cluster(chosen,c.start,c.end,plot.right-plot.left);
  ctx.strokeStyle='#888';ctx.lineWidth=.7;ctx.setLineDash([3,4]);ctx.beginPath();for(const cluster of c.newsClusters){const x=X(cluster.time);ctx.moveTo(x,plot.top);ctx.lineTo(x,plot.bottom);}ctx.stroke();ctx.setLineDash([]);
 }
 function tooltip(c,time,tolerance){const grouped=(c.newsClusters||[]).filter(group=>Math.abs(group.time-time)<tolerance).flatMap(group=>group.events),near=new Map(grouped.map(event=>[event.id,event]));for(const event of c.newsTimeline||[]){if(Math.abs(event.anchor-time)<tolerance)near.set(event.id,event);}const items=[...near.values()];return (items.length>1?`<p class="news-tooltip"><small>Событий рядом: ${items.length}</small></p>`:'')+items.slice(0,3).map(e=>`<p class="news-tooltip">${safe(e.title)}<small>${safe(clock(e))}</small></p>`).join('');}
 function dispose(c){clearTimeout(c.newsTimer);c.newsController?.abort();if(typeof EventStudy!=='undefined')EventStudy.dispose(c);}
 return {init,sidebar,attach,changed,draw:drawMarks,tooltip,dispose};
})();
