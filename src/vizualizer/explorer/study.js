'use strict';
const EventStudy=(()=>{
 let metadata=null,metadataError='',legacyWindow=[0,15];
 const control=(c,id)=>c.studyControls.querySelector('[data-field="'+id+'"]');
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const defaults={mode:'selected',feature:'rate_cut',chainType:'all',precision:'exact',includeWeak:false,groupByCoins:'all',groupByNews:'all'};
 const fields={mode:'study-mode',feature:'study-feature',chainType:'study-chain',precision:'study-precision',includeWeak:'study-weak',groupByCoins:'study-group-coins',groupByNews:'study-group-news'};
 const copyIcon='<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="7" y="6" width="10" height="11" rx="2"/><path d="M13 6V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>';
 const value=(n,unit='',signed=false)=>n===null||n===undefined||!Number.isFinite(n)?'—':(signed&&n>0?'+':'')+n.toLocaleString('ru-RU',{maximumFractionDigits:3})+(unit?' '+unit:'');
 const date=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
 const noun=(n,forms)=>forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
 function bounds(c){return [c.study?.periodStart??c.start,c.study?.periodEnd??c.end];}
 async function init(){
  try{const response=await fetch('/api/event-study/catalog');if(!response.ok)throw Error('Разметка событий недоступна');metadata=await response.json();}catch(error){metadataError=error.message;}
  try{const saved=JSON.parse(localStorage.getItem('crypto-news-window'));if(saved&&Number.isInteger(saved.from)&&Number.isInteger(saved.to)&&0<=saved.from&&saved.from<saved.to&&saved.to<=10080){legacyWindow=[saved.from,saved.to];}}catch{}
 }
 function bind(c){
  const field=id=>control(c,id);
  for(const [key,id] of Object.entries(fields))field(id).addEventListener('change',()=>{
   c.study[key]=field(id).type==='checkbox'?field(id).checked:field(id).value;
   if(key==='precision'&&c.study.precision==='day'&&points(c).some(t=>t%1440))setWindow(c,1440);
   c.newsElement.open=true;save();sidebar(c);draw(c);changed(c);
  });
  for(const key of ['start','end'])bindDate(c,key);
  for(const id of ['study-t1','study-t2','study-t3'])field(id).addEventListener('input',()=>{
   const raw=[1,2,3].map(i=>String(field('study-t'+i).value)),values=raw.map(Number),[t1,t2,t3]=values,error=field('news-window-error'),step=c.study.precision==='day'?1440:15;
   if(raw.some(v=>!v.trim())||values.some(t=>!Number.isInteger(t)||t%step)||!(-10080<=t1&&t1<t2&&t2<t3&&t3<=10080)){error.textContent=`−10080 ≤ t1 < t2 < t3 ≤ 10080 минут, шаг ${step} минут`;error.hidden=false;return;}
   error.hidden=true;Object.assign(c.study,{t1,t2,t3});save();sidebar(c);draw(c);changed(c);
  });
  field('study-presets').addEventListener('click',event=>{const minutes=Number(event.target.dataset.minutes);if(minutes)setWindow(c,minutes);});
 }
 function bindDate(c,key){
  const input=control(c,'study-input-'+key),field=key==='start'?'periodStart':'periodEnd';
  DateInput.bind(input,()=>c.study[field],time=>{
   const start=key==='start'?time:c.study.periodStart,end=key==='end'?time:c.study.periodEnd;
   if(start>=end)return 'Начало должно быть раньше конца';
   c.study[field]=time;c.newsElement.open=true;save();sidebar(c);draw(c);changed(c);if(typeof NewsDesk!=='undefined')NewsDesk.sidebar(c);return '';
  });
 }
 function setWindow(c,minutes){Object.assign(c.study,{t1:-minutes,t2:0,t3:minutes});control(c,'news-window-error').hidden=true;save();sidebar(c);draw(c);changed(c);}
 function points(c){return [c.study?.t1??-15,c.study?.t2??0,c.study?.t3??15];}
 function windowOf(c){return points(c).slice(1);}
 function sidebar(c){
  if(!c?.studyControls)return;
  const field=id=>control(c,id);
  for(const [key,id] of Object.entries(fields)){const node=field(id);if(node.type==='checkbox')node.checked=!!c.study[key];else node.value=c.study[key];}
  const [start,end]=bounds(c);for(const [key,time] of [['start',start],['end',end]])DateInput.refresh(field('study-input-'+key),time);
  points(c).forEach((value,i)=>{field('study-t'+(i+1)).value=value;field('study-t'+(i+1)).step=c.study.precision==='day'?1440:15;});
  field('study-feature-row').hidden=c.study.mode!=='binary';field('study-chain-row').hidden=c.study.mode!=='chains';field('study-weak-row').hidden=c.study.mode!=='chains';
  field('study-status').textContent=metadataError||(c.study.precision==='day'?'По датам · t0 условно 00:00 UTC':'Только известное время · шаг 15 минут');
  field('study-presets').innerHTML=(c.study.precision==='day'?[[1440,'1д'],[4320,'3д'],[10080,'7д']]:[[15,'15м'],[60,'1ч'],[240,'4ч'],[1440,'24ч']]).map(([minutes,label])=>`<button type="button" data-minutes="${minutes}">${label}</button>`).join('');
 }
 function matching(c){const [start,end]=bounds(c);return (metadata?.records||[]).filter(event=>event.anchor>=start&&event.anchor<end&&(c.study.mode==='binary'?['yes','no'].includes(event.labels[c.study.feature]):event.kind==='chain'&&event.confirmed&&(c.study.chainType==='all'||c.study.chainType===event.chainType)&&(c.study.includeWeak||event.confidence!=='issuer_instrument_temporal_link')));}
 function timeline(c,news=[]){
  const [start,end]=bounds(c),source=c.study?.mode&&c.study.mode!=='selected'?matching(c):news.filter(e=>c.newsIds?.has(e.id)&&e.anchor>=start&&e.anchor<end);
  return source.filter(e=>c.study?.precision==='day'||(e.precision!=='day'&&e.anchor%900===0)).map(e=>c.study?.precision==='day'?{...e,anchor:Math.floor(e.anchor/86400)*86400,precision:'day',time:''}:e);
 }
 function attach(c,config){
  const previous=config.study||{};c.study={...defaults,offsetStart:legacyWindow[0],offsetEnd:legacyWindow[1],...previous,localOnly:false};
  c.study.t1=Number.isFinite(previous.t1)?previous.t1:-(c.study.offsetEnd-c.study.offsetStart);c.study.t2=Number.isFinite(previous.t2)?previous.t2:c.study.offsetStart;c.study.t3=Number.isFinite(previous.t3)?previous.t3:c.study.offsetEnd;delete c.study.offsetStart;delete c.study.offsetEnd;
  c.study.periodStart=Number.isFinite(previous.periodStart)?previous.periodStart:previous.scope==='year'?catalog.start:c.start;
  c.study.periodEnd=Number.isFinite(previous.periodEnd)?previous.periodEnd:previous.scope==='year'?catalog.end:c.end;delete c.study.scope;
  c.newsElement.classList.add('event-study');c.newsElement.hidden=false;c.newsElement.open=false;c.newsElement.innerHTML='<summary>Исследование событий</summary><div class="study-control-mount"></div><div class="study-content" aria-live="polite"></div>';
  const fragment=document.getElementById('study-settings-template').content.cloneNode(true),root=fragment.querySelector('.study-settings');
  for(const node of root.querySelectorAll('[id]')){node.dataset.field=node.id;node.id=c.id+'-'+node.id;}
  c.studyControls=root;c.newsElement.querySelector('.study-control-mount').append(root);
  if(metadata){control(c,'study-feature').innerHTML=Object.entries(metadata.features).map(([key,label])=>{const n=metadata.counts[key];return `<option value="${key}">${safe(label)} · ${n.yes||0}/${n.no||0}/${n.unknown||0}</option>`;}).join('');control(c,'study-chain').innerHTML='<option value="all">Все типы цепочек</option>'+Object.entries(metadata.chainTypes).map(([key,label])=>`<option value="${key}">${safe(label)}</option>`).join('');}
  bind(c);sidebar(c);
 }
 function changed(c){clearTimeout(c.studyTimer);c.studyTimer=setTimeout(()=>update(c),260);}
 async function update(c){
  if(c.disposed||!c.newsElement||!c.study)return;
  const node=c.newsElement,content=node.querySelector('.study-content'),[start,end]=bounds(c),body={...c.study,localOnly:false,ids:selectedIds(c),assets:[...c.assets].sort(),regions:[...c.regions].sort(),newsIds:[...c.newsIds].sort(),start,end,offsetStart:windowOf(c)[0],offsetEnd:windowOf(c)[1]},key=JSON.stringify(body);
  if(c.study.mode==='selected'&&!body.newsIds.length){c.studyController?.abort();c.studyPending=null;c.studyLast=null;c.studyResult=null;node.hidden=false;content.textContent='';node.querySelector('summary').textContent='Исследование событий';return;}
  node.hidden=false;if(c.studyPending===key||c.studyLast===key)return;
  c.studyController?.abort();c.studyController=new AbortController();c.studyPending=key;c.studyLast=null;c.studyResult=null;
  node.querySelector('summary').textContent='Исследование событий';content.textContent='';
  try{const response=await fetch('/api/event-study',{method:'POST',headers:{'Content-Type':'application/json'},body:key,signal:c.studyController.signal}),result=await response.json();if(!response.ok)throw Error(result.error||'Не удалось рассчитать статистику');if(c.disposed||c.studyPending!==key)return;
   c.studyLast=key;c.studyPending=null;c.studyResult=result;render(c,result);
  }catch(error){if(error.name==='AbortError'||c.studyPending!==key)return;c.studyPending=null;node.querySelector('summary').textContent='Исследование событий';content.textContent=error.message;}
 }
 function parts(result){return [{id:'all',label:'Все выбранные',selection:result.experiment.selection,result},...(result.partitions||[])];}
 function views(result){return result.groups.map(group=>({key:'group:'+group.key,label:({yes:'Да',no:'Нет',selected:'Метрики',preparation:'Анонс',speculation:'Ажиотаж',outcome:'Итог'})[group.key]||group.label,group})).concat(result.comparisons.map((comparison,index)=>({key:'difference:'+index,label:result.mode==='binary'?'Разность':['Δ Итог − Анонс','Δ Ажиотаж − Анонс','Δ Итог − Ажиотаж'][index]||'Разность',comparison})));}
 function cells(n,unit,signed=false){return `<td class="${Number.isFinite(n)?n<0?'metric-negative':n>0?'metric-positive':'metric-zero':''}">${value(n,unit,signed)}</td>`;}
 function tableHtml(result,view){
  let html='<table><thead><tr><th>Статистика</th>'+(view.group?'<th>До</th><th>После</th><th>Δ</th>':'<th>Разность Δ</th>')+'</tr></thead><tbody>';
  for(const metric of result.metrics){html+=`<tr><td title="${safe(metric.description)}">${safe(metric.label)}</td>`;if(view.group){const m=view.group.metrics[metric.key];html+=cells(m.before,metric.unit)+cells(m.after,metric.unit)+cells(m.delta,metric.deltaUnit,true);}else html+=cells(view.comparison.metrics[metric.key],metric.deltaUnit,true);html+='</tr>';}
  return html+'</tbody></table>';
 }
 function coverage(result,view){return view.group?`${view.group.usableMoments} моментов · ${view.group.events} записей · ${view.group.pairWindows} пар × окон${result.unknown?' · '+result.unknown+' исходов неизвестны':''}`:view.comparison.n!==null?`${view.comparison.n} парных цепочек · ${view.comparison.pairWindows} общих пар × цепочек`:'(После − До)Да − (После − До)Нет';}
 function render(c,result){
  const node=c.newsElement,content=node.querySelector('.study-content'),entries=parts(result),part=entries.find(p=>p.id===c.studyPartition)||entries[0],data=part.result,tabs=views(data),chosen=tabs.find(v=>v.key===c.studyTab)||tabs[0],set=part.selection;
  c.studyPartition=part.id;c.studyTab=chosen?.key;
  node.querySelector('summary').textContent='Исследование событий';
  let html=`<div class="study-report-head"><span>Выбрано ${set.assets.length} ${noun(set.assets.length,['монета','монеты','монет'])} × ${set.regions.length} ${noun(set.regions.length,['страна','страны','стран'])} <small>· ${set.pairs.length} ${noun(set.pairs.length,['доступная пара','доступные пары','доступных пар'])}</small></span><button type="button" class="study-copy" title="Скопировать все таблицы и метаданные" aria-label="Скопировать отчёт">${copyIcon}</button></div>`;
  if(entries.length>1)html+='<select class="study-partition" aria-label="Группа монет и новостей отчёта">'+entries.map(entry=>`<option value="${safe(entry.id)}" ${entry.id===part.id?'selected':''}>${safe(entry.label)}</option>`).join('')+'</select>';
  html+='<div class="study-tabs" role="tablist" aria-label="Таблицы метрик">'+tabs.map((view,index)=>`<button type="button" role="tab" id="${c.id}-study-tab-${index}" aria-controls="${c.id}-study-panel-${index}" aria-selected="${view.key===chosen.key}" tabindex="${view.key===chosen.key?'0':'-1'}" data-view="${safe(view.key)}">${safe(view.label)}</button>`).join('')+'</div>';
  for(const [index,view] of tabs.entries())html+=`<div class="study-pane" role="tabpanel" id="${c.id}-study-panel-${index}" aria-labelledby="${c.id}-study-tab-${index}" ${view.key!==chosen.key?'hidden':''}><div class="study-coverage" title="${safe(data.warnings.join('\n')+'\nИсключено: '+JSON.stringify(view.group?.excluded||{}))}">${safe(coverage(data,view))}</div>${tableHtml(data,view)}</div>`;
  content.innerHTML=html;
  content.querySelector('.study-copy').addEventListener('click',event=>copy(c,event.currentTarget));
  content.querySelector('.study-partition')?.addEventListener('change',event=>{c.studyPartition=event.target.value;render(c,result);});
  const buttons=[...content.querySelectorAll('.study-tabs [role=tab]')],panes=[...content.querySelectorAll('.study-pane')];
  function select(index,focus=false){c.studyTab=tabs[index].key;buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;panes[i].hidden=i!==index;});if(focus)buttons[index].focus();}
  buttons.forEach((button,index)=>{button.addEventListener('click',()=>select(index));button.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();select(next,true);});});
 }
 function tableText(result,view){const rows=[view.group?['Статистика','До','После','Δ']:['Статистика','Разность Δ']];for(const metric of result.metrics){const m=view.group?.metrics[metric.key];rows.push(view.group?[metric.label,value(m.before,metric.unit),value(m.after,metric.unit),value(m.delta,metric.deltaUnit,true)]:[metric.label,value(view.comparison.metrics[metric.key],metric.deltaUnit,true)]);}return rows.map((row,i)=>'| '+row.map(cell=>String(cell).replace(/\|/g,'\\|')).join(' | ')+' |'+(i===0?'\n| '+row.map(()=>'---').join(' | ')+' |':'')).join('\n');}
 function reportText(result){
  const exp=result.experiment,set=exp.selection;
  const lines=['# Отчёт по реакции на события',`Эксперимент: ${exp.id} · сформирован ${exp.createdUtc}`,`Монеты (${set.assets.length}): ${set.assets.join(', ')}`,`Регионы (${set.regions.length}): ${set.regions.map(r=>r.label+' ('+r.id+')').join(', ')}`,`Период UTC: ${date(result.start)} — ${date(result.end)} (конец исключительно)`,`До: [t${(result.windows?.before?.[0]??-(result.offsetEnd-result.offsetStart))}, t${result.windows?.before?.[1]??0}) мин; После: [t${result.windows?.after?.[0]??result.offsetStart}, t${result.windows?.after?.[1]??result.offsetEnd}) мин относительно события`,`Режим: ${result.mode}; точность: ${result.precision}${exp.featureLabel?'; признак: '+exp.featureLabel:''}`,`Типы новостей: ${exp.newsTypes.join('; ')||'Нет событий'}`,`Группировка: монеты — ${exp.grouping.coins}; новости — ${exp.grouping.news}`,`Метод: ${exp.weighting}`,''];
  for(const part of parts(result)){lines.push('## '+part.label,'Монеты среза: '+part.selection.assets.join(', '));for(const view of views(part.result)){lines.push('### '+(view.group?.label||view.comparison.label),coverage(part.result,view),tableText(part.result,view),'');if(view.group)lines.push('Исключения событий: '+JSON.stringify(view.group.excluded)+'; исключения пар × окон: '+JSON.stringify(view.group.pairExcluded),'');}}
  lines.push('## Определения метрик',...result.metrics.map(m=>`${m.label}: ${m.description}`),'','## Ограничения',...[...new Set(parts(result).flatMap(part=>part.result.warnings))],'','## Все метаданные эксперимента','```json',JSON.stringify(exp,null,2),'```');return lines.join('\n');
 }
 function reportHtml(result){const exp=result.experiment,set=exp.selection;return '<html><body><h1>Отчёт по реакции на события</h1><p>'+safe(`Эксперимент ${exp.id} · ${exp.createdUtc}`)+'</p><p>'+safe('Монеты: '+set.assets.join(', '))+'</p><p>'+safe('Регионы: '+set.regions.map(r=>r.label).join(', '))+'</p><p>'+safe('Типы новостей: '+exp.newsTypes.join('; '))+'</p>'+parts(result).map(part=>'<h2>'+safe(part.label)+'</h2><p>'+safe('Монеты среза: '+part.selection.assets.join(', '))+'</p>'+views(part.result).map(view=>'<h3>'+safe(view.group?.label||view.comparison.label)+'</h3><p>'+safe(coverage(part.result,view))+'</p>'+tableHtml(part.result,view)).join('')).join('')+'<h2>Определения и ограничения</h2>'+result.metrics.map(m=>'<p>'+safe(m.label+': '+m.description)+'</p>').join('')+[...new Set(parts(result).flatMap(part=>part.result.warnings))].map(w=>'<p>'+safe(w)+'</p>').join('')+'<h2>Все метаданные эксперимента</h2><pre>'+safe(JSON.stringify(exp,null,2))+'</pre></body></html>';}
 async function copy(c,button){
  if(!c.studyResult)return;const result=c.studyResult,text=reportText(result);button.disabled=true;
  try{
   let copied=false;
   if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){try{await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([reportHtml(result)],{type:'text/html'})})]);copied=true;}catch{}}
   if(!copied&&navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;}
   if(!copied){const area=document.createElement('textarea'),focus=document.activeElement;area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();copied=document.execCommand('copy');area.remove();focus?.focus();if(!copied)throw Error('Clipboard unavailable');}
   button.innerHTML='<span aria-hidden="true">✓</span>';button.title='Скопировано: все вкладки и метаданные';button.setAttribute('aria-label','Отчёт скопирован');
  }catch{button.title='Не удалось скопировать отчёт';button.setAttribute('aria-label',button.title);}
  finally{button.disabled=false;setTimeout(()=>{button.innerHTML=copyIcon;button.title='Скопировать все таблицы и метаданные';button.setAttribute('aria-label','Скопировать отчёт');},2000);}
 }
 function dispose(c){clearTimeout(c.studyTimer);c.studyController?.abort();}
 return {init,sidebar,attach,changed,dispose,bounds,window:windowOf,points,timeline,reportText,reportHtml};
})();
