const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
 constructor(type=''){this.type=type;this.value='';this.checked=false;this.hidden=false;this.events={};this.classList={add(){}};this.html='';this.nodes={};this.lists={};this.attrs={};this.dataset={};}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
 dispatchEvent(event){event.target??=this;event.currentTarget=this;for(const fn of this.events[event.type]||[])fn(event)}
 async fire(type,extra={}){const event={type,target:this,currentTarget:this,...extra};await Promise.all((this.events[type]||[]).map(fn=>fn(event)))}
 append(node){(this.children??=[]).push(node)}setAttribute(key,value){this.attrs[key]=value}focus(){this.focused=true}setCustomValidity(text){this.validity=text}reportValidity(){}
 set innerHTML(value){this.html=value;this.nodes={};this.lists={};
  if(value.includes('<summary>'))this.nodes.summary=new Node();
  if(value.includes('class="study-content"'))this.nodes['.study-content']=new Node();
  if(value.includes('class="study-control-mount"'))this.nodes['.study-control-mount']=new Node();
  if(value.includes('class="study-copy"'))this.nodes['.study-copy']=new Node();
  if(value.includes('class="study-partition"'))this.nodes['.study-partition']=new Node();
  this.lists['.study-tabs [role=tab]']=[...value.matchAll(/role="tab"[^>]+/g)].map(match=>{const n=new Node();n.attrs['aria-selected']=match[0].match(/aria-selected="([^"]+)"/)[1];return n});
  this.lists['.study-pane']=[...value.matchAll(/class="study-pane"[^>]+/g)].map(match=>{const n=new Node();n.hidden=match[0].includes(' hidden');return n});
 }
 get innerHTML(){return this.html}querySelector(selector){return this.nodes[selector]||null}querySelectorAll(selector){return this.lists[selector]||[]}
}
(async()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id==='study-weak'?'checkbox':''));return nodes.get(id)};
 const template=fs.readFileSync(__dirname+'/index.html','utf8').split('<template id="study-settings-template">')[1].split('</template>')[0];
 get('study-settings-template').content={cloneNode(){const root=new Node(),fields=[];for(const match of template.matchAll(/id="([^"]+)"/g)){const node=new Node(match[1]==='study-weak'?'checkbox':'');node.id=match[1];fields.push(node);root.nodes['[data-field="'+match[1]+'"]']=node;}root.lists['[id]']=fields;return {querySelector(){return root}};}};
 const chart={id:'c1',newsElement:new Node(),newsIds:new Set(['n1']),assets:new Set(['BTC','ETH']),regions:new Set(['US','HK']),start:100,end:200};
 const metadata={features:{rate_cut:'Снижение'},counts:{rate_cut:{yes:14,no:23,unknown:18}},chainTypes:{auction:'Аукцион'},records:[{id:'yes',title:'Yes',anchor:900,precision:'publication',labels:{rate_cut:'yes'},newsIds:['n2'],kind:'rate'},{id:'no',anchor:1800,precision:'scheduled',labels:{rate_cut:'no'},kind:'rate'},{id:'unknown',anchor:900,precision:'publication',labels:{rate_cut:'unknown'},kind:'rate'},{id:'date',anchor:900,precision:'day',labels:{rate_cut:'yes'},kind:'rate'},{id:'intrabar',anchor:950,precision:'publication',labels:{rate_cut:'yes'},kind:'rate'}]};
 const metric={key:'return',label:'Доходность',unit:'%',deltaUnit:'п.п.',description:'Return'};
 const group=(key,before,after)=>({key,label:key==='yes'?'Да':'Нет',events:1,moments:1,usableMoments:1,seriesUsed:2,pairWindows:2,excluded:{},pairExcluded:{},metrics:{return:{before,after,delta:after-before,n:1}}});
 const selection={assets:['BTC','ETH'],regions:[{id:'US',label:'США'},{id:'HK',label:'Гонконг'}],pairs:[{id:'BTC-US',asset:'BTC',pair:'BTC-USD',exchange:'Coinbase'}]};
 const result={mode:'binary',precision:'exact',offsetStart:0,offsetEnd:15,start:0,end:1000,unknown:18,groups:[group('yes',-1,3),group('no',1,-2)],comparisons:[{label:'Разность изменений: Да − Нет',n:null,metrics:{return:7}}],warnings:['Малая выборка'],metrics:[metric],experiment:{id:'test-123',createdUtc:'2026-11-16T00:00:00Z',selection,newsTypes:['Ставки','Инфляция'],parameters:{feature:'rate_cut'},featureLabel:'Снижение ставки',weighting:'По моментам',grouping:{coins:'group',news:'family'},events:[{title:'<script>unsafe</script>'}]},partitions:[]};
 result.partitions=[{id:'base|policy',label:'Базовые × Ставки',selection:{...selection,assets:['BTC']},result:{...result,partitions:[]}}];
 const timers=new Map(),requests=[],clipboard=[];let sequence=0,deferred=false,resolveLater=[],saved=0;
 let activeChart=chart;const context={document:{getElementById:get},current:()=>activeChart,catalog:{start:0,end:2000},selectedIds:()=>['BTC-US'],charts:[chart],save:()=>saved++,draw(){},NewsDesk:{sidebar(){},changed(){}},AbortController,Blob,ClipboardItem:class{constructor(data){this.data=data}},navigator:{clipboard:{write:async items=>clipboard.push(items[0])}},Event:class{constructor(type){this.type=type}},setTimeout:(fn,ms)=>(timers.set(++sequence,{fn,ms}),sequence),clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{if(url.endsWith('/catalog'))return {ok:true,json:async()=>metadata};requests.push(JSON.parse(options.body));if(deferred)return new Promise(resolve=>resolveLater.push(resolve));return {ok:true,json:async()=>result};},console};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/date_input.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/study.js','utf8'),context);context.chart=chart;
 await vm.runInContext('EventStudy.init()',context);vm.runInContext("EventStudy.attach(chart,{study:{mode:'binary',feature:'rate_cut',scope:'year',localOnly:true}});EventStudy.sidebar(chart);",context);
 const field=id=>chart.studyControls.querySelector('[data-field="'+id+'"]');
 async function flush(){const pending=[...timers.entries()].filter(([,t])=>t.ms===260);for(const [id,timer] of pending){timers.delete(id);timer.fn();}await new Promise(resolve=>setImmediate(resolve));}
 vm.runInContext('EventStudy.changed(chart)',context);await flush();
 assert.equal(requests[0].start,0);assert.equal(requests[0].end,2000);assert.equal(requests[0].localOnly,false);assert.deepEqual(requests[0].assets,['BTC','ETH']);
 const content=chart.newsElement.querySelector('.study-content'),buttons=content.querySelectorAll('.study-tabs [role=tab]'),panes=content.querySelectorAll('.study-pane');
 assert.equal(buttons.length,3);assert.equal(panes.filter(n=>!n.hidden).length,1);assert(content.html.includes('metric-negative'));assert(content.html.includes('metric-positive'));assert(!content.html.includes('Скачать CSV'));assert(!content.html.includes('study-events'));
 await buttons[2].fire('click');assert.equal(chart.studyTab,'difference:0');assert(!panes[2].hidden&&panes[0].hidden);assert.equal(requests.length,1,'tabs do not request recalculation');
 await buttons[2].fire('keydown',{key:'Home',preventDefault(){}});assert(!panes[0].hidden&&buttons[0].focused);
 await content.querySelector('.study-copy').fire('click');assert.equal(clipboard.length,1);
 const plain=await clipboard[0].data['text/plain'].text(),rich=await clipboard[0].data['text/html'].text();
 for(const text of ['BTC, ETH','США (US)','Гонконг (HK)','Ставки; Инфляция','Базовые × Ставки','### Да','### Нет','Разность изменений','rate_cut','test-123'])assert(plain.includes(text),text);
 assert.equal((plain.match(/\| Статистика/g)||[]).length,6,'copy includes all tabs and all slices');assert.equal((rich.match(/<table>/g)||[]).length,6);assert(!rich.includes('<script>'));assert(rich.includes('&lt;script&gt;'));
 assert.equal(chart.newsElement.querySelector('summary').textContent,'Исследование событий');
 assert.deepEqual(Array.from(vm.runInContext('EventStudy.timeline(chart).map(e=>e.id)',context)),['yes','no']);
 assert.deepEqual([requests[0].t1,requests[0].t2,requests[0].t3],[-15,0,15]);
 assert(!chart.newsIds.has('n2'),'semantic markers need no checkbox mutation');
 // Real canvas marker path uses the same semantic events and three offsets.
 vm.runInContext(fs.readFileSync(__dirname+'/plot.js','utf8'),context);context.markerDesk=vm.runInContext('(function(){'+fs.readFileSync(__dirname+'/news.js','utf8')+';return NewsDesk;})()',context);
 const fills=[],ctx={fillRect(...args){fills.push(args)},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 context.ctx=ctx;context.plot={left:0,right:270,top:0,bottom:100};chart.start=0;chart.end=2700;
 vm.runInContext('markerDesk.draw(chart,ctx,t=>t/10,plot)',context);
 assert.equal(chart.newsTimeline.length,2);assert.equal(chart.newsClusters.length,2);
 assert.deepEqual(fills,[[0,0,180,100],[90,0,180,100]],'before and after windows track both events');
 field('study-t3').value=30;field('study-t3').dispatchEvent({type:'input'});fills.length=0;
 vm.runInContext('markerDesk.draw(chart,ctx,t=>t/10,plot)',context);
 assert.deepEqual(fills.at(-1),[90,0,180,100],'expanded after windows merge in pixel space');
 field('study-t3').value=15;field('study-t3').dispatchEvent({type:'input'});
 field('study-input-end').value='1970-01-01 00:10';field('study-input-end').dispatchEvent({type:'change'});assert.equal(chart.study.periodEnd,600);assert.equal(field('study-input-end').placeholder,'1970-01-01 00:10');
 field('study-group-coins').value='group';field('study-group-coins').dispatchEvent({type:'change'});await flush();assert.equal(requests.at(-1).groupByCoins,'group');assert.equal(requests.at(-1).end,600);
 field('study-precision').value='day';field('study-precision').dispatchEvent({type:'change'});assert.equal(Number(field('study-t3').value),1440);assert.equal(Number(field('study-t1').value),-1440);assert.equal(vm.runInContext('EventStudy.timeline(chart).length',context),0);assert(saved>0);
 const other={...chart,id:'c2',newsElement:new Node(),study:null,studyControls:null,newsIds:new Set()};context.other=other;vm.runInContext("EventStudy.attach(other,{study:{offsetStart:0,offsetEnd:60}});",context);activeChart=other;field('study-t3').value=2880;field('study-t3').dispatchEvent({type:'input'});assert.equal(chart.study.t3,2880);assert.equal(other.study.t3,60);assert.equal(chart.studyControls.querySelector('[data-field="study-mode"]').id,'c1-study-mode');assert.equal(other.studyControls.querySelector('[data-field="study-mode"]').id,'c2-study-mode');
 deferred=true;await flush();field('study-t3').value=4320;field('study-t3').dispatchEvent({type:'input'});await flush();assert.equal(resolveLater.length,2);
 resolveLater[1]({ok:true,json:async()=>({...result,offsetEnd:4320})});await new Promise(resolve=>setImmediate(resolve));resolveLater[0]({ok:true,json:async()=>({...result,offsetEnd:15})});await new Promise(resolve=>setImmediate(resolve));assert.equal(chart.studyResult.offsetEnd,4320);
 vm.runInContext('EventStudy.dispose(chart)',context);assert(chart.studyController.signal.aborted);
 const html=fs.readFileSync(__dirname+'/index.html','utf8');assert(!html.includes('id="study-local"'));assert(!html.includes('id="study-scope"'));assert(html.includes('<legend>t1, мин</legend>'));assert(html.includes('<legend>t2, мин</legend>'));assert(html.includes('<legend>t3, мин</legend>'));assert(!html.includes('datetime-local'));assert(!html.includes('study-mark'));assert(!html.includes('В периоде графика'));
 console.log('Passed per-chart controls/windows, unique field IDs, compact controls, date editing, saved migration, grouped requests, signed cells, tabs/keyboard, copying all tabs/slices and metadata in text/HTML, escaping, event markers, stale-response rejection and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1});
