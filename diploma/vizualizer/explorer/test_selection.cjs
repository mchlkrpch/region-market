const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.events={};this.value='';this.open=false;this.style={};this.classList={toggle(){}};}
 append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}addEventListener(type,fn){this.events[type]=fn}setAttribute(){}
 set innerHTML(text){this.html=text;this.children=[];if(text.includes('<input')){const input=new Node('input');input.checked=text.includes('checked');this.children.push(input)}}
 get innerHTML(){return this.html}walk(){return this.children.flatMap(node=>[node,...node.walk()])}
 querySelector(selector){return this.walk().find(node=>selector==='input'&&node.tag==='input')||null}
 querySelectorAll(selector){return this.walk().filter(node=>selector==='details[open]'&&node.tag==='details'&&node.open)}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
const assets=[{symbol:'BTC',group:'base',groupLabel:'Базовые',regions:['US','AE','HK']},{symbol:'ETH',group:'base',groupLabel:'Базовые',regions:['US','AE']},{symbol:'AAVE',group:'credit',groupLabel:'Кредитование',regions:['US']},{symbol:'HSK',group:'l2',groupLabel:'L2',regions:['HK']}];
const chart={id:'test',assets:new Set(['BTC','ETH','AAVE']),regions:new Set(['US'])};
const catalog={assets,regions:{US:'США',AE:'ОАЭ',HK:'Гонконг'},series:assets.flatMap(a=>a.regions.map(region=>({id:a.symbol+'-'+region,asset:a.symbol,region}))),marketSets:[{id:'us_ae_25',label:'США / ОАЭ',regions:['US','AE'],plannedCount:25,availableCount:2},{id:'cn_hk_26',label:'Китай / Гонконг',regions:['HK'],plannedCount:26,availableCount:2}]};
const context={document:{getElementById:get,createElement:tag=>new Node(tag)},window:{},console,chart,testCatalog:catalog};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8').replace(/\ninit\(\);\s*$/,''),context);
vm.runInContext("catalog=testCatalog;charts=[chart];activeId='test';load=function(){};save=function(){};sidebar();",context);
const evaluate=code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));
assert.deepEqual(evaluate('eligibleAssets(chart).map(a=>a.symbol)'),['BTC','ETH','AAVE']);
assert.equal(get('coins-tree').open,false);assert.equal(get('regions-tree').open,false);assert.equal(get('groups').querySelectorAll('details[open]').length,0,'selected groups stay initially collapsed');assert.equal(get('regions').querySelectorAll('details[open]').length,0);
const branch=get('regions').children.find(node=>node.dataset.marketSet==='us_ae_25');branch.open=true;const checkbox=branch.children[0].querySelector('input');checkbox.checked=true;checkbox.events.change();
assert.deepEqual(evaluate('[...chart.regions]'),['US','AE']);assert.deepEqual(evaluate('[...chart.assets]'),['BTC','ETH'],'unavailable selected coin removed');assert.deepEqual(evaluate('eligibleAssets(chart).map(a=>a.symbol)'),['BTC','ETH']);assert.equal(get('regions').querySelectorAll('details[open]').length,1,'manual disclosure retained');
assert(!get('groups').walk().some(node=>node.html?.includes('AAVE')),'unavailable coin hidden, not just disabled');
vm.runInContext("chart.regions=new Set(['HK']);selectionChanged(chart);",context);assert.deepEqual(evaluate('eligibleAssets(chart).map(a=>a.symbol)'),['BTC','HSK']);assert.deepEqual(evaluate('[...chart.assets]'),['BTC']);
vm.runInContext("chart.regions=new Set(['US','AE','HK']);selectionChanged(chart);",context);assert.deepEqual(evaluate('eligibleAssets(chart).map(a=>a.symbol)'),['BTC'],'intersection across all selected markets');
vm.runInContext('chart.regions.clear();selectionChanged(chart);',context);assert.deepEqual(evaluate('eligibleAssets(chart)'),[]);assert.equal(chart.assets.size,0);assert(get('all-coins').disabled);
const html=fs.readFileSync(__dirname+'/index.html','utf8'),sidebar=html.split('<aside')[1].split('</aside>')[0];
assert(html.indexOf('id="tab-regions"')<html.indexOf('id="tab-news"')&&html.indexOf('id="tab-news"')<html.indexOf('id="tab-coins"'));
assert(!sidebar.includes('study-controls'));for(const id of ['coins-tree','news-tree','regions-tree'])assert(new RegExp('<details id="'+id+'"[^>]*>').test(html)&&!new RegExp('<details id="'+id+'"[^>]* open').test(html));
console.log('Passed region/coin intersection, hierarchy checkboxes, selection pruning, hidden unavailable assets, retained manual disclosures, initially collapsed trees/groups, empty region selection, reordered tabs and study controls outside sidebar.');
