'use strict';
const assert=require('node:assert/strict'),DateInput=require('./date_input.js');
const {format,parse,edit}=DateInput;
let value='',pos=0;
for(const digit of '202511271100'){const result=edit(value,pos,pos,'insertText',digit);value=result.text;pos=result.caret;}
assert.equal(value,'2025-11-27 11:00');assert.equal(pos,16);assert.equal(parse(value),Date.UTC(2025,10,27,11)/1000);
for(let i=0;i<12;i++){const result=edit(value,pos,pos,'deleteContentBackward');value=result.text;pos=result.caret;}
assert.equal(value,'');assert.equal(pos,0);
assert.deepEqual(edit('2025-11-27 11:00',5,5,'deleteContentBackward'),{text:'2021-12-71 10:0',caret:3});
assert.equal(edit('2025-11-27 11:00',0,16,'insertFromPaste','202602281234').text,'2026-02-28 12:34');
assert.equal(edit('2025-11-27 11:00',5,7,'insertText','12').text,'2025-12-27 11:00');
assert.equal(format('2025-11-27T11:00'),'2025-11-27 11:00');
for(const invalid of ['2025-02-29 12:00','2026-04-31 12:00','2025-00-15 12:00','2025-11-27 24:00','2025-11-27 12:60','2025-11-27','2025-11-27T11:00'])assert.equal(parse(invalid),null,invalid);
assert.notEqual(parse('2024-02-29 12:00'),null);
const events={},input={value:'',selectionStart:0,selectionEnd:0,addEventListener(type,fn){events[type]=fn},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},setCustomValidity(message){this.error=message},reportValidity(){this.reported=true}};
let current=parse('2025-11-27 11:00'),commits=0;
DateInput.bind(input,()=>current,time=>{if(time>=parse('2026-01-01 00:00'))return 'Поздняя дата';current=time;commits++;return ''});
assert.equal(input.placeholder,'2025-11-27 11:00');assert.equal(input.value,'');
events.focus();for(const digit of '202512250715')events.beforeinput({inputType:'insertText',data:digit,preventDefault(){}});
assert.equal(input.value,'2025-12-25 07:15');assert.equal(current,parse(input.value));assert.equal(commits,1);
events.change();assert.equal(commits,1,'same complete date commits once');
input.value='2026-02-31 00:00';events.change();assert(input.error);assert.equal(commits,1);
input.value='2026-02-01 00:00';events.change();assert.equal(input.error,'Поздняя дата');assert.equal(commits,1);
input.value='';events.blur();assert.equal(input.placeholder,'2025-12-25 07:15');assert.equal(input.error,'');
input.value='2025-12';events.focus();DateInput.refresh(input,parse('2025-12-28 00:00'));assert.equal(input.value,'2025-12','refresh preserves partial typing');
console.log('Passed continuous digit input, separator crossing/deletion, paste, selection replacement, strict UTC dates, placeholders, immediate commit and invalid/partial input.');
