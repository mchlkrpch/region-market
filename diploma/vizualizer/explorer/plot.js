'use strict';
// Display-only levels of detail. Original bars remain the source for tooltips/statistics.
const PlotLOD=(()=>{
 const cache=new WeakMap(),leaf=16;
 const valid=(bar,kind)=>kind==='line'?Number.isFinite(bar):Array.isArray(bar)&&bar.length===4&&bar.every(Number.isFinite);
 function prepare(bars,kind='line'){
  const previous=cache.get(bars);if(previous?.kind===kind)return previous;
  const model={bars,kind,runs:[]},low=i=>kind==='line'?bars[i]:bars[i][2],high=i=>kind==='line'?bars[i]:bars[i][1];
  for(let i=0;i<bars.length;){if(!valid(bars[i],kind)){i++;continue;}const start=i;while(i<bars.length&&valid(bars[i],kind))i++;
   const run={start,end:i,levels:[]},length=i-start;
   if(length>=leaf){let size=leaf,count=Math.ceil(length/size),mins=new Int32Array(count),maxs=new Int32Array(count);
    for(let b=0;b<count;b++){let min=start+b*size,max=min;for(let j=min+1;j<Math.min(i,start+(b+1)*size);j++){if(low(j)<low(min))min=j;if(high(j)>high(max))max=j;}mins[b]=min;maxs[b]=max;}
    run.levels.push({size,mins,maxs});
    while(count>1){const oldMin=mins,oldMax=maxs;count=Math.ceil(count/2);size*=2;mins=new Int32Array(count);maxs=new Int32Array(count);for(let b=0;b<count;b++){const a=2*b,next=a+1;mins[b]=next<oldMin.length&&low(oldMin[next])<low(oldMin[a])?oldMin[next]:oldMin[a];maxs[b]=next<oldMax.length&&high(oldMax[next])>high(oldMax[a])?oldMax[next]:oldMax[a];}run.levels.push({size,mins,maxs});}
   }model.runs.push(run);
  }cache.set(bars,model);return model;
 }
 function extrema(model,run,start,end){
  const {bars,kind}=model,low=i=>kind==='line'?bars[i]:bars[i][2],high=i=>kind==='line'?bars[i]:bars[i][1];let min=start,max=start;
  for(let i=start;i<end;){let level=Math.min(run.levels.length-1,Math.floor(Math.log2((end-i)/leaf)));while(level>=0&&(i-run.start)%run.levels[level].size)level--;
   if(level>=0){const bucket=run.levels[level],index=(i-run.start)/bucket.size,a=bucket.mins[index],b=bucket.maxs[index];if(low(a)<low(min))min=a;if(high(b)>high(max))max=b;i+=bucket.size;}
   else{if(low(i)<low(min))min=i;if(high(i)>high(max))max=i;i++;}
  }return {first:start,last:end-1,min,max};
 }
 function sample(model,from,to,budget){
  from=Math.max(0,Math.floor(from));to=Math.min(model.bars.length,Math.ceil(to));if(to<=from)return [];
  const block=2**Math.max(0,Math.ceil(Math.log2((to-from)/Math.max(1,budget)))),result=[];
  for(const run of model.runs){if(run.end<=from)continue;if(run.start>=to)break;const start=Math.max(from,run.start),end=Math.min(to,run.end),buckets=[];
   for(let i=start;i<end;){const next=Math.min(end,run.start+(Math.floor((i-run.start)/block)+1)*block);buckets.push(extrema(model,run,i,next));i=next;}result.push(buckets);
  }return result;
 }
 function cluster(events,start,end,pixels){
  const secondsPerPixel=(end-start)/Math.max(1,pixels),spacing=Math.min(12,Math.max(4,4+Math.log2(Math.max(1,secondsPerPixel/900)))),width=2**Math.ceil(Math.log2(secondsPerPixel*spacing)),bins=new Map();
  for(const event of events){if(event.anchor<start||event.anchor>=end)continue;const key=Math.floor(event.anchor/width);let bin=bins.get(key);if(!bin){bin={time:0,events:[]};bins.set(key,bin);}bin.time+=event.anchor;bin.events.push(event);}
  return [...bins.values()].map(bin=>({...bin,time:bin.time/bin.events.length})).sort((a,b)=>a.time-b.time);
 }
 function vertices(buckets){const indices=[];for(let n=0;n<buckets.length;n++){const b=buckets[n],points=[b.min,b.max];if(n===0)points.push(b.first);if(n===buckets.length-1)points.push(b.last);for(const i of [...new Set(points)].sort((a,b)=>a-b))if(indices.at(-1)!==i)indices.push(i);}return indices;}
 return {prepare,sample,vertices,cluster};
})();
if(typeof module!=='undefined')module.exports=PlotLOD;
