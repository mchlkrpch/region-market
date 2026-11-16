const assert=require('node:assert/strict'),Plot=require('./plot.js');
const bars=Array.from({length:35040},(_,i)=>100+Math.sin(i/81)+Math.cos(i/13));
bars[17321]=900;bars[17322]=-700;bars[11000]=null;bars[11001]=null;
const original=bars.slice(),model=Plot.prepare(bars);
assert.equal(Plot.prepare(bars),model,'cached levels reused');
const windows=[[0,35040,1000],[17001,17400,80],[10997,11005,1000],[35000,36000,100],[-300,50,100]];
for(let i=0;i<60;i++){const from=(i*1777)%19000,to=from+50+(i*613)%15000;windows.push([from,to,3+(i*137)%700]);}
for(const [from,to,budget] of windows){
 const segments=Plot.sample(model,from,to,budget);
 for(const segment of segments){const vertices=Plot.vertices(segment);assert.equal(vertices[0],segment[0].first);assert.equal(vertices.at(-1),segment.at(-1).last);
  for(const b of segment){const values=bars.slice(b.first,b.last+1);assert(values.every(Number.isFinite),'no bucket crosses missing candles');assert.equal(bars[b.min],Math.min(...values));assert.equal(bars[b.max],Math.max(...values));assert(vertices.includes(b.min)&&vertices.includes(b.max),'every bucket extreme survives');}
  for(let i=1;i<vertices.length;i++)assert(vertices[i]>vertices[i-1],'chronological curve');
 }
}
const sampled=Plot.sample(model,0,bars.length,1000),vertices=sampled.flatMap(Plot.vertices);
assert(vertices.includes(17321)&&vertices.includes(17322),'adjacent positive/negative spikes survive');
assert.equal(sampled.length,2,'gap splits the curve');assert(vertices.length<2200);
assert.deepEqual(Plot.sample(model,0,20,1000).flatMap(Plot.vertices),Array.from({length:20},(_,i)=>i),'zoom in restores all samples');
assert.deepEqual(bars,original,'source values unchanged');
const candles=Array.from({length:1000},(_,i)=>[100+i,110+i,90+i,105+i]);candles[513]=null;
for(const segment of Plot.sample(Plot.prepare(candles,'candles'),0,1000,60))for(const b of segment){const values=candles.slice(b.first,b.last+1);assert(values.every(Boolean));assert.equal(candles[b.max][1],Math.max(...values.map(c=>c[1])));assert.equal(candles[b.min][2],Math.min(...values.map(c=>c[2])));}
const events=Array.from({length:4634},(_,i)=>({id:String(i),anchor:i*3600}));
const wide=Plot.cluster(events,0,366*86400,1000),near=Plot.cluster(events,0,14*86400,1000);
assert(wide.length<200,'annual markers collapse into screen-space clusters');assert(near.length>wide.length,'zooming in separates nearby markers');
assert.equal(wide.flatMap(c=>c.events).length,4634,'clustering loses no events');
for(const cluster of wide)assert.equal(cluster.time,cluster.events.reduce((sum,e)=>sum+e.anchor,0)/cluster.events.length);
assert.deepEqual(Plot.cluster(events,-1000,-500,1000),[]);
const started=performance.now();for(let i=0;i<200;i++)Plot.sample(model,i*30,bars.length-i*30,1000).flatMap(Plot.vertices);
console.log(`Passed peaks, gaps, OHLC, exact zoom, source immutability, clustering and cache checks. Annual curve: ${bars.length} → ${vertices.length} vertices; news: ${events.length} → ${wide.length} markers. 200 cached samples: ${(performance.now()-started).toFixed(1)} ms (sampling only).`);

// Check the real renderer without a browser: one paint per frame, no repeated
// backing-store resize, and price labels painted after the data inside the plot.
const fs=require('node:fs'),vm=require('node:vm'),frames=[],calls=[];
const ctx=new Proxy({},{get:(target,key)=>target[key]||((...args)=>calls.push([key,...args])),set:(target,key,value)=>(target[key]=value,true)});
let width=0,height=0,resizes=0;
const canvas={clientWidth:1000,clientHeight:600,getContext:()=>ctx,get width(){return width},set width(v){width=v;resizes++},get height(){return height},set height(v){height=v;resizes++}};
const chart={canvas,start:0,end:35040*900,data:{kind:'line',start:0,step:900},traces:[{id:'x',bars,base:100,color:'#123'}],yRange:[-800,900],scale:'price',hidden:new Set()};
const context={window:{devicePixelRatio:2,requestAnimationFrame:fn=>(frames.push(fn),frames.length)},document:{getElementById(){}},chart};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/plot.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8').replace(/\ninit\(\);\s*$/,''),context);
vm.runInContext('draw(chart);draw(chart);draw(chart);',context);assert.equal(frames.length,1);frames.shift()();assert.equal(chart.plot.left,6);assert.equal(resizes,2);assert.equal(width,2000);
const labels=calls.filter(c=>c[0]==='strokeText'),timeLabels=labels.filter(c=>c[3]===chart.plot.bottom-5),priceLabels=labels.filter(c=>c[3]!==chart.plot.bottom-5);assert(priceLabels.length>0&&timeLabels.length>0);assert(priceLabels.every(c=>c[2]===10),'values inside the plot');assert(timeLabels.every(c=>c[2]>=chart.plot.left+20&&c[2]<=chart.plot.right-20),'time labels fit inside the plot');assert.equal(chart.plot.bottom,canvas.clientHeight-6);assert.equal(calls.at(-2)[0],'fillText','labels painted over data');
vm.runInContext('draw(chart)',context);frames.shift()();assert.equal(resizes,2,'panning does not reset the canvas');
chart.disposed=true;vm.runInContext('draw(chart)',context);assert.equal(frames.length,0);
console.log('Passed frame coalescing, canvas reuse, inside overlay labels, and disposed-chart checks.');
