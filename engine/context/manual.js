'use strict';
function csvRows(text){
  if(typeof text!=='string'||text.length>90_000)throw new Error('invalid or oversized CSV');const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<=text.length;i++){const c=text[i]??'\n';if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('unterminated CSV quote');return rows;
}
function parseManualPayload(body){
  if(body?.format==='csv'){const rows=csvRows(body.data),headers=rows.shift()?.map(x=>x.trim());if(!headers?.length)throw new Error('CSV header required');return rows.slice(0,100).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]?.trim()||null])));}
  if(Array.isArray(body?.events)){if(body.events.length>100)throw new Error('maximum 100 events');return body.events;}
  return [body];
}
module.exports={csvRows,parseManualPayload};
