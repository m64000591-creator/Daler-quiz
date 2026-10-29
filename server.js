// Daler quiz serveri — tashqi xizmatsiz.
// Natijalar xotirada (va faylda) saqlanadi. Server qayta ishga tushsa, reytingni
// saytni ochib turgan brauzerlar avtomatik qayta tiklab beradi (/api/restore).
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,ADMIN_KEY=process.env.ADMIN_KEY||'admin123';
const DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'results.json');
const T_PTS=5,W_PTS=5,NQ=15,NW=8,BASE=NQ*T_PTS+NW*W_PTS,MAXT=1200;
let rows=[],clearedAt=0;
try{fs.mkdirSync(DIR,{recursive:true});const d=JSON.parse(fs.readFileSync(FILE,'utf8'));rows=d.rows||d;clearedAt=d.clearedAt||0}catch(e){}
const save=()=>{try{fs.writeFileSync(FILE,JSON.stringify({rows,clearedAt}))}catch(e){}};
const send=(res,code,obj,h)=>{res.writeHead(code,Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},h||{}));res.end(JSON.stringify(obj))};
const body=(req,max,cb)=>{let b='',dead=false;req.on('data',d=>{b+=d;if(b.length>max){dead=true;req.destroy()}});req.on('end',()=>{if(!dead)cb(b)})};

// bitta natijani tekshirib, qatorga aylantiradi (ball serverda qayta hisoblanadi)
function mkRow(j,ts){
  const name=String(j.name||'').trim().slice(0,40),cid=String(j.cid||j.id||'').slice(0,60);
  if(name.length<3||!cid)return null;
  const t=Math.min(NQ,Math.max(0,j.test|0)),w=Math.min(NW,Math.max(0,j.cw|0)),sec=Math.min(36000,Math.max(0,j.sec|0));
  const base=t*T_PTS+w*W_PTS,total=Math.round((base+10*(base/BASE)*Math.max(0,1-sec/MAXT))*100)/100;
  return {cid,name,test:t,cw:w,base,sec,total,ts};
}

http.createServer((req,res)=>{
 const url=req.url.split('?')[0];
 if(url==='/api/results'){
  if(req.method==='GET')return send(res,200,rows.map(({cid,...r})=>({id:cid,...r})),{'X-Cleared':String(clearedAt)});
  if(req.method==='DELETE'){if(req.headers['x-admin-key']!==ADMIN_KEY)return send(res,403,{});rows=[];clearedAt=Date.now();save();return send(res,200,{})}
  if(req.method==='POST')return body(req,5000,b=>{
    let j;try{j=JSON.parse(b)}catch(e){return send(res,400,{})}
    const r=mkRow(j,Date.now());if(!r)return send(res,400,{});
    if(rows.some(x=>x.cid===r.cid))return send(res,409,{error:'already'});
    rows.push(r);save();send(res,200,{total:r.total});
  });
  return send(res,405,{});
 }
 // Server qayta ishga tushganda yo‘qolgan natijalarni brauzerlar qaytaradi
 if(url==='/api/restore'&&req.method==='POST')return body(req,200000,b=>{
  let j;try{j=JSON.parse(b)}catch(e){return send(res,400,{})}
  let added=0;const now=Date.now();
  (Array.isArray(j.rows)?j.rows.slice(0,300):[]).forEach(x=>{
    const ts=Math.min(now,Number(x.ts)||now);
    if(ts<=clearedAt)return;                       // tozalashdan oldingi natijalar qaytmaydi
    const r=mkRow(x,ts);if(!r||rows.some(y=>y.cid===r.cid))return;
    rows.push(r);added++;
  });
  if(added)save();send(res,200,{added});
 });
 fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{
  if(e){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});return res.end('index.html topilmadi (server.js bilan bir papkada bo‘lishi kerak)')}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(d)});
}).listen(PORT,()=>console.log('Sayt: http://localhost:'+PORT+' | natijalar:',rows.length));
