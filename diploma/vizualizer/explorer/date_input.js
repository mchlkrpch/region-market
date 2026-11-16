'use strict';
// Keyboard-only UTC dates. Editing uses digit offsets, so separators never trap the caret.
const DateInput=(()=>{
 const separators={4:'-',6:'-',8:' ',10:':'},digits=value=>String(value).replace(/\D/g,'').slice(0,12);
 function format(value){const raw=digits(value);let text='';for(let i=0;i<raw.length;i++){text+=raw[i];if(separators[i+1])text+=separators[i+1];}return text;}
 function parse(value){if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value))return null;const [y,m,d,h,n]=value.match(/\d+/g).map(Number);if(y<1000||m<1||m>12||d<1||d>31||h>23||n>59)return null;const time=Date.UTC(y,m-1,d,h,n);return new Date(time).toISOString().slice(0,16).replace('T',' ')===value?time/1000:null;}
 function stamp(time){return new Date(time*1000).toISOString().slice(0,16).replace('T',' ');}
 function caret(text,count){if(!count)return 0;let i=0,n=0;while(i<text.length&&n<count){if(/\d/.test(text[i]))n++;i++;}while(i<text.length&&!/\d/.test(text[i]))i++;return i;}
 function edit(value,start,end,type,data=''){
  const raw=digits(value);let a=digits(value.slice(0,start)).length,b=digits(value.slice(0,end)).length,insert='';
  if(type.startsWith('insert'))insert=digits(data);
  else if(a===b){if(type==='deleteContentBackward')a=Math.max(0,a-1);else if(type==='deleteContentForward')b=Math.min(raw.length,b+1);}
  const text=format((raw.slice(0,a)+insert+raw.slice(b)).slice(0,12));return {text,caret:caret(text,Math.min(12,a+insert.length))};
 }
 function refresh(input,time){input.placeholder=stamp(time);input.title=input.placeholder+' UTC';if(!input._dateEditing&&input.value&&parse(input.value)!==time)input.value='';}
 function bind(input,getTime,commit){
  input.type='text';input.inputMode='numeric';input.autocomplete='off';input.spellcheck=false;input.maxLength=16;
  function apply(report=false){
   if(!input.value){input.setCustomValidity('');return;}
   const time=parse(input.value),error=time===null?'Введите дату ГГГГ-ММ-ДД ЧЧ:ММ':time===getTime()?'':commit(time)||'';
   input.setCustomValidity(error);if(error&&report)input.reportValidity();
  }
  function insert(type,data){const result=edit(input.value,input.selectionStart??input.value.length,input.selectionEnd??input.value.length,type,data);input.value=result.text;input.setSelectionRange(result.caret,result.caret);input.setCustomValidity('');if(digits(result.text).length===12)apply();}
  input.addEventListener('beforeinput',event=>{if(event.isComposing)return;if(['insertText','insertFromPaste','insertReplacementText','deleteContentBackward','deleteContentForward','deleteByCut'].includes(event.inputType)){event.preventDefault();insert(event.inputType,event.dataTransfer?.getData('text/plain')??event.data??'');}});
  input.addEventListener('paste',event=>{event.preventDefault();insert('insertFromPaste',event.clipboardData.getData('text'));});
  input.addEventListener('input',()=>{const n=digits(input.value.slice(0,input.selectionStart??input.value.length)).length;input.value=format(input.value);const pos=caret(input.value,n);input.setSelectionRange(pos,pos);input.setCustomValidity('');if(digits(input.value).length===12)apply();});
  input.addEventListener('change',()=>apply(true));input.addEventListener('focus',()=>{input._dateEditing=true;});
  input.addEventListener('blur',()=>{input._dateEditing=false;apply(true);if(!input.value)refresh(input,getTime());});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply(true);}else if(event.key==='Escape'){input.value='';input.setCustomValidity('');input.blur();}});
  refresh(input,getTime());
 }
 return {format,parse,edit,stamp,refresh,bind};
})();
if(typeof module!=='undefined')module.exports=DateInput;
