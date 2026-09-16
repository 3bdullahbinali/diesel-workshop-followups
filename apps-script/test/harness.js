// بيئة محاكية لـ Google Apps Script لاختبار workshop-api.gs قبل النشر
const crypto = require('crypto');
const fs = require('fs');

class Range {
  constructor(sheet, row, col, rows, cols){ Object.assign(this,{sheet,row,col,rows,cols}); }
  getValues(){
    const out=[];
    for(let r=0;r<this.rows;r++){
      const line=[];
      for(let c=0;c<this.cols;c++) line.push(this.sheet.cell(this.row+r, this.col+c));
      out.push(line);
    }
    return out;
  }
  getValue(){ return this.getValues()[0][0]; }
  setValues(values){
    values.forEach((line,r)=>line.forEach((v,c)=>this.sheet.set(this.row+r,this.col+c,v)));
    return this;
  }
  setValue(v){ this.sheet.set(this.row,this.col,v); return this; }
  setNumberFormat(){ return this; }
}
class Sheet {
  constructor(name,id){ this.name=name; this.id=id; this.rows=[]; this.hidden=false; }
  getName(){ return this.name; }
  getSheetId(){ return this.id; }
  hideSheet(){ this.hidden=true; }
  setFrozenRows(){}
  cell(r,c){ const row=this.rows[r-1]; const v=row?row[c-1]:''; return v===undefined?'':v; }
  set(r,c,v){ while(this.rows.length<r) this.rows.push([]); const row=this.rows[r-1]; while(row.length<c) row.push(''); row[c-1]=v; }
  getRange(r,c,rows=1,cols=1){ return new Range(this,r,c,rows,cols); }
  getDataRange(){ return new Range(this,1,1,Math.max(this.getLastRow(),1),Math.max(this.getLastColumn(),1)); }
  appendRow(values){ this.rows.push([...values]); }
  deleteRow(r){ this.rows.splice(r-1,1); }
  getLastRow(){ for(let i=this.rows.length-1;i>=0;i--) if((this.rows[i]||[]).some(v=>v!=='' && v!=null)) return i+1; return 0; }
  getLastColumn(){ return this.rows.reduce((n,row)=>Math.max(n,row.length),0); }
}
class Book {
  constructor(){ this.sheets=[]; this.tz='Etc/GMT'; }
  getSheets(){ return this.sheets; }
  getSheetByName(name){ return this.sheets.find(s=>s.name===name)||null; }
  insertSheet(name){ const s=new Sheet(name, 900000+this.sheets.length); this.sheets.push(s); return s; }
  getSpreadsheetTimeZone(){ return this.tz; }
  setSpreadsheetTimeZone(tz){ this.tz=tz; }
}
const book = new Book();
global.SpreadsheetApp = {
  openById: () => book,
  getActiveSpreadsheet: () => book
};
const pad=(n,w=2)=>String(n).padStart(w,'0');
global.Utilities = {
  DigestAlgorithm:{SHA_256:'SHA_256'},
  computeDigest:(alg,input)=>{
    const buf = Array.isArray(input)?Buffer.from(input.map(b=>b&255)):Buffer.from(String(input),'utf8');
    return [...crypto.createHash('sha256').update(buf).digest()].map(b=>b>127?b-256:b);
  },
  base64Encode:bytes=>Buffer.from(Array.isArray(bytes)?bytes.map(b=>b&255):Buffer.from(String(bytes))).toString('base64'),
  newBlob:s=>({getBytes:()=>[...Buffer.from(String(s),'utf8')].map(b=>b>127?b-256:b)}),
  getUuid:()=>crypto.randomUUID(),
  formatDate:(date,tz,fmt)=>{
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date).map(x=>[x.type,x.value]));
    return fmt.replace('dd',p.day).replace('MM',p.month).replace('yyyy',p.year).replace('HH',p.hour==='24'?'00':p.hour).replace('mm',p.minute).replace('ss',p.second);
  }
};
global.Logger = {log:()=>{}};
global.LockService = {getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
global.ContentService = {MimeType:{JSON:'json'}, createTextOutput:t=>({setMimeType(){return this;}, getContent:()=>t})};

// تحميل السكربت
const code = fs.readFileSync('/home/user/diesel-workshop-followups/apps-script/workshop-api.gs','utf8');
(0,eval)(code + '\n;globalThis.__api={setup,addUser:saveUser,resetPassword,doPost,doGet,addOperationalColumns,addLettersSheet,listUsers,renameUser,setUserActive,findUserRow,sheetByName,CONFIG,HEADERS,SOURCE_HEADERS};');
module.exports = {book, Sheet, api: globalThis.__api};
