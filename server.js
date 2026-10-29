// Daler quiz serveri
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,ADMIN_KEY=process.env.ADMIN_KEY||'admin123';
const DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'results.json');
const T_PTS=5,W_PTS=5,NQ=15,NW=8,BASE=NQ*T_PTS+NW*W_PTS,MAXT=1200;
fs.mkdirSync(DIR,{recursive:true});
let rows=[];try{rows=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}
const save=()=>fs.writeFileSync(FILE,JSON.stringify(rows));
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
http.createServer((req,res)=>{
 const url=req.url.split('?')[0];
 if(url==='/api/results'){
  if(req.method==='GET')return send(res,200,rows.map(({cid,...r})=>({id:cid,...r})));
  if(req.method==='DELETE'){if(req.headers['x-admin-key']!==ADMIN_KEY)return send(res,403,{});rows=[];save();return send(res,200,{})}
  if(req.method==='POST'){let b='';req.on('data',d=>{b+=d;if(b.length>5000)req.destroy()});req.on('end',()=>{try{
    const j=JSON.parse(b);const name=String(j.name||'').trim().slice(0,40),cid=String(j.cid||'').slice(0,60);
    const t=Math.min(NQ,Math.max(0,j.test|0)),w=Math.min(NW,Math.max(0,j.cw|0)),sec=Math.min(36000,Math.max(0,j.sec|0));
    if(name.length<3||!cid)return send(res,400,{});
    if(rows.some(r=>r.cid===cid))return send(res,409,{error:'already'});
    const base=t*T_PTS+w*W_PTS,total=Math.round((base+10*(base/BASE)*Math.max(0,1-sec/MAXT))*100)/100;
    rows.push({cid,name,test:t,cw:w,base,sec,total,ts:Date.now()});save();send(res,200,{total})}catch(e){send(res,400,{})}});return}
  return send(res,405,{});
 }
 fs.readFile(path.join(__dirname,'public','index.html'),(e,d)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(d)});
}).listen(PORT,()=>console.log('Sayt: http://localhost:'+PORT));
