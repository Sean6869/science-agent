import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';

function validateZip(buffer){
 if(buffer.length>1024*1024||buffer.length<4||buffer.readUInt32LE(0)!==0x04034b50)throw new Error('请上传不超过1MB的 .xlsx 文件');
 let size=0,entries=0;
 for(let i=0;i+46<=buffer.length;i++)if(buffer.readUInt32LE(i)===0x02014b50){size+=buffer.readUInt32LE(i+24);entries++;if(size>16*1024*1024||entries>1000)throw new Error('Excel内容过大，请使用提供的学生模板');}
 if(!entries)throw new Error('Excel文件格式无效');
}
function text(cell){const value=cell.value;if(value===null||value===undefined)return '';if(typeof value==='string'||typeof value==='number')return String(value).trim();throw new Error(`单元格 ${cell.address} 请填写文字或数字，不支持公式`);}
export async function parseStudentsWorkbook(data){
 if(typeof data!=='string'||!data.length||data.length>1400000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new Error('文件内容无效');
 const buffer=Buffer.from(data,'base64');validateZip(buffer);
 const book=new ExcelJS.Workbook();try{await book.xlsx.load(buffer);}catch{throw new Error('无法读取Excel文件，请使用 .xlsx 模板');}
 const sheet=book.worksheets[0];if(!sheet||sheet.rowCount>201||sheet.columnCount>20)throw new Error('每次最多导入200名学生');
 const headers=new Map();sheet.getRow(1).eachCell(cell=>headers.set(text(cell),cell.col));
 if(['姓名','性别','年龄','班级'].some(h=>!headers.has(h)))throw new Error('模板首行需要包含：姓名、性别、年龄、班级');
 const rows=[];
 for(let index=2;index<=sheet.rowCount;index++){
  const row=sheet.getRow(index),name=text(row.getCell(headers.get('姓名'))),gender=text(row.getCell(headers.get('性别')))||'未填写',age=text(row.getCell(headers.get('年龄'))),className=text(row.getCell(headers.get('班级')));
  if(row.cellCount>4&&/示例|例子/.test(text(row.getCell(5))))throw new Error('请删除模板中的示例行后再上传');
  if(!name&&gender==='未填写'&&!age&&!className)continue;
  if(!name||name.length>80)throw new Error(`第${index}行姓名不能为空，且不超过80字`);
  if(!['男','女','未填写'].includes(gender))throw new Error(`第${index}行性别请填写男或女`);
  if(age&&(!/^\d{1,3}$/.test(age)||Number(age)<1||Number(age)>120))throw new Error(`第${index}行年龄须为1–120的整数`);
  if(!className||className.length>80)throw new Error(`第${index}行请填写班级（不超过80字）`);
  rows.push({name,gender,age:age?Number(age):null,className});
 }
 if(!rows.length)throw new Error('模板中还没有学生，请在第二行开始填写');
 return {rows,fingerprint:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}
export async function workbookBuffer(columns,rows,title='学生账号'){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(title);book.creator='小科';
 sheet.columns=columns.map(([header,key,width=20])=>({header,key,width}));
 for(const row of rows)sheet.addRow(Object.fromEntries(columns.map(([,key])=>[key,row[key]??''])));
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF376DDB'}};sheet.getRow(1).height=26;
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:columns.length}};
 sheet.eachRow((row,index)=>{if(index>1){row.height=Math.min(409,23*Math.max(1,...columns.map(([,key,width=20],i)=>String(row.getCell(i+1).value??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length*1.7/width)),0))));row.alignment={vertical:'middle',wrapText:true};}});
 for(const key of ['username','password'])if(columns.some(c=>c[1]===key))sheet.getColumn(key).numFmt='@';
 return Buffer.from(await book.xlsx.writeBuffer());
}
