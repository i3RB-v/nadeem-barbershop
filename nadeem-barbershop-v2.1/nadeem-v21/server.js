const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
let twilio = null;
let GoogleGenAI = null;
try { twilio = require('twilio'); } catch (_) {}
try { ({ GoogleGenAI } = require('@google/genai')); } catch (_) {}
const { URL } = require('url');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) {}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const STORE = path.join(DATA, 'store.json');
const USERS = path.join(DATA, 'users.json');
const SECRET = process.env.SESSION_SECRET || 'nadeem-local-development-secret-change-this';

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function write(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2));}
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function text(res,status,body,headers={}){res.writeHead(status,headers);res.end(body);}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>200000){req.destroy();reject(new Error('Payload too large'));}});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject);});}
function hash(password,salt){return crypto.scryptSync(password,salt,32).toString('hex');}
function token(payload){const b=Buffer.from(JSON.stringify(payload)).toString('base64url');const s=crypto.createHmac('sha256',SECRET).update(b).digest('base64url');return b+'.'+s;}
function verify(t){try{const [b,s]=String(t||'').split('.');if(!b||!s)return null;const e=crypto.createHmac('sha256',SECRET).update(b).digest('base64url');if(s!==e)return null;const p=JSON.parse(Buffer.from(b,'base64url').toString('utf8'));return p.exp>Date.now()?p:null;}catch{return null;}}
function auth(req){const h=req.headers.authorization||'';return verify(h.replace(/^Bearer\s+/i,''));}
function find(a,id){return a.find(x=>x.id===id);}
function mins(t){const [h,m]=String(t).split(':').map(Number);return h*60+m;}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d));}

function escHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function normalizeWhatsAppNumber(value){
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.startsWith('00')) digits=digits.slice(2);
  if(digits.startsWith('962')) return '+'+digits;
  if(digits.startsWith('0')) return '+962'+digits.slice(1);
  if(digits.startsWith('7')) return '+962'+digits;
  return digits ? '+'+digits : '';
}

async function sendWhatsAppReminder(appointment, shop, service, barber){
  const sid=process.env.TWILIO_ACCOUNT_SID, tokenValue=process.env.TWILIO_AUTH_TOKEN;
  const from=normalizeWhatsAppNumber(process.env.TWILIO_WHATSAPP_FROM);
  const contentSid=process.env.TWILIO_WHATSAPP_CONTENT_SID;
  if(!twilio || !sid || !tokenValue || !from || !contentSid) return {sent:false,reason:'WhatsApp reminder is not configured'};
  const client=twilio(sid, tokenValue);
  const to=normalizeWhatsAppNumber(appointment.clientPhone);
  if(!to) return {sent:false,reason:'Invalid WhatsApp number'};
  const vars={
    '1': appointment.clientName,
    '2': appointment.date,
    '3': appointment.time,
    '4': barber.name_en
  };
  const message=await client.messages.create({
    from:'whatsapp:'+from,
    to:'whatsapp:'+to,
    contentSid,
    contentVariables:JSON.stringify(vars)
  });
  return {sent:true,sid:message.sid};
}

async function sendReceipt(appointment, shop, service, barber){
  const host=process.env.SMTP_HOST, port=Number(process.env.SMTP_PORT||587), user=process.env.SMTP_USER, pass=process.env.SMTP_PASS, from=process.env.EMAIL_FROM||user;
  if(!nodemailer || !host || !user || !pass || !from) return {sent:false,reason:'SMTP not configured'};
  const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass}});
  const subject=`Nadeem BarberShop — ${appointment.id}`;
  const text=[
    'Nadeem BarberShop appointment receipt',
    `Appointment ID: ${appointment.id}`,
    `Client: ${appointment.clientName}`,
    `Phone: ${appointment.clientPhone}`,
    `Branch: ${shop.name_en}`,
    `Service: ${service.name_en}`,
    `Barber: ${barber.name_en}`,
    `Date: ${appointment.date}`,
    `Time: ${appointment.time}`,
    `Total: ${service.price} JOD`,
    '',
    'Thank you for booking with Nadeem BarberShop.'
  ].join('\n');
  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f5f3;padding:30px"><div style="max-width:620px;margin:auto;background:#fff;border-radius:18px;padding:30px;border:1px solid #e5e2da"><h1 style="margin:0 0 8px;color:#171717">Nadeem BarberShop</h1><p style="color:#666">Appointment receipt</p><div style="border-top:1px solid #eee;margin:20px 0"></div><p><b>Appointment ID:</b> ${escHtml(appointment.id)}</p><p><b>Client:</b> ${escHtml(appointment.clientName)}</p><p><b>Phone:</b> ${escHtml(appointment.clientPhone)}</p><p><b>Branch:</b> ${escHtml(shop.name_en)}</p><p><b>Service:</b> ${escHtml(service.name_en)}</p><p><b>Barber:</b> ${escHtml(barber.name_en)}</p><p><b>Date:</b> ${escHtml(appointment.date)}</p><p><b>Time:</b> ${escHtml(appointment.time)}</p><p><b>Total:</b> ${escHtml(service.price)} JOD</p><div style="margin-top:24px;padding:14px 16px;background:#faf6e5;border-radius:12px">Thank you for booking with Nadeem BarberShop.</div></div></body></html>`;
  await transporter.sendMail({from,to:appointment.clientEmail,subject,text,html});
  return {sent:true};
}

async function chatbotReply(message){
  const q=String(message||'').trim();
  if(!q) return 'Please ask me something about our services, barbers, branches, opening hours, or grooming advice.';
  if(GoogleGenAI && process.env.GEMINI_API_KEY){
    try{
      const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
      const s=read(STORE);
      const businessData={shops:s.shops,services:s.services,barbers:s.barbers,hours:s.hours};
      const response=await ai.models.generateContent({
        model:process.env.GEMINI_MODEL||'gemini-3.8-flash',
        contents:q,
        config:{systemInstruction:`You are Nadeem AI, a helpful barber-shop concierge for Nadeem BarberShop in Amman, Jordan. Answer in the same language as the customer. Only use this business data and general grooming advice. Business data: ${JSON.stringify(businessData)}. Keep answers concise, friendly, and practical.`}
      });
      if(response && response.text) return response.text;
    }catch(e){ console.error('Gemini error:',e.message); }
  }
  const s=read(STORE), low=q.toLowerCase();
  if(low.includes('price')||low.includes('سعر')||low.includes('أسعار')) return s.services.map(x=>`${x.name_en}: ${x.price} JOD`).join(' | ');
  if(low.includes('hour')||low.includes('time')||low.includes('دوام')||low.includes('ساعات')) return `We are open from ${s.hours.start}:00 to ${s.hours.end===24?'12:00 AM':s.hours.end+':00'}.`;
  if(low.includes('branch')||low.includes('فرع')||low.includes('موقع')) return `We have ${s.shops.length} branches in Marj Al Hammam.`;
  if(low.includes('barber')||low.includes('حلاق')) return `Our barbers are ${s.barbers.map(x=>x.name_en).join(', ')}.`;
  return 'I can help with services, prices, barbers, branches, opening hours, or grooming advice. Ask me a question!';
}

async function processWhatsAppReminders(){
  const s=read(STORE), now=Date.now(); let changed=false;
  for(const a of s.appointments){
    if(a.status==='cancelled' || a.whatsappReminderSentAt) continue;
    const when=new Date(`${a.date}T${a.time}:00${process.env.SHOP_TZ_OFFSET||'+03:00'}`).getTime();
    const diff=when-now;
    const twoHours=2*60*60*1000;
    // Target exactly two hours before; use a 5-minute catch-up window if the server was busy/offline.
    if(diff<=twoHours && diff>=(twoHours-5*60*1000)){
      const shop=find(s.shops,a.shopId),service=find(s.services,a.serviceId),barber=find(s.barbers,a.barberId);
      if(!shop||!service||!barber) continue;
      try{
        const result=await sendWhatsAppReminder(a,shop,service,barber);
        if(result.sent){a.whatsappReminderSentAt=new Date().toISOString();a.whatsappReminderSid=result.sid;changed=true;console.log(`WhatsApp reminder sent for ${a.id}`);}
        else console.log(`WhatsApp reminder skipped for ${a.id}: ${result.reason}`);
      }catch(e){console.error(`WhatsApp reminder failed for ${a.id}:`,e.message)}
    }
  }
  if(changed) write(STORE,s);
}
setInterval(()=>processWhatsAppReminders().catch(e=>console.error('Reminder worker:',e)),30000);
processWhatsAppReminders().catch(e=>console.error('Initial reminder worker:',e));

async function api(req,res,u){
  if(req.method==='GET'&&u.pathname==='/api/health')return send(res,200,{ok:true,service:'nadeem-barbershop-api',whatsappConfigured:Boolean(twilio&&process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_WHATSAPP_FROM&&process.env.TWILIO_WHATSAPP_CONTENT_SID),chatbotConfigured:Boolean(GoogleGenAI&&process.env.GEMINI_API_KEY)});
  if(req.method==='GET'&&u.pathname==='/api/config'){const s=read(STORE);return send(res,200,{shops:s.shops,services:s.services,barbers:s.barbers,hours:s.hours});}
  if(req.method==='POST'&&u.pathname==='/api/chat'){try{const x=await body(req);return send(res,200,{reply:await chatbotReply(x.message||'')});}catch(e){return send(res,400,{error:'Unable to process chat request.'});}}
  if(req.method==='GET'&&u.pathname==='/api/appointments/slots'){
    const s=read(STORE),{date,barberId,serviceId}=Object.fromEntries(u.searchParams);
    const service=find(s.services,serviceId), barber=find(s.barbers,barberId);
    if(!validDate(date)||!service||!barber)return send(res,400,{error:'Invalid date, barber or service'});
    const dateObj=new Date(date+'T00:00:00'); if(Number.isNaN(dateObj.getTime())) return send(res,400,{error:'Invalid date.'}); const dow=dateObj.getDay(); if((barber.off_days||[]).includes(dow))return send(res,200,{slots:[]});
    const booked=s.appointments.filter(a=>a.date===date&&a.barberId===barberId&&a.status!=='cancelled');const slots=[];
    const today=new Date(); const localToday=today.toISOString().slice(0,10); const currentMinutes=today.getHours()*60+today.getMinutes()+30;
    for(let m=s.hours.start*60;m+service.duration<=s.hours.end*60;m+=30){ if(date===localToday && m<=currentMinutes) continue; const overlap=booked.some(a=>{const q=find(s.services,a.serviceId),st=mins(a.time),en=st+(q?.duration||30);return m<en&&m+service.duration>st;});if(!overlap){slots.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`)}}
    return send(res,200,{slots});
  }
  if(req.method==='POST'&&u.pathname==='/api/appointments'){
    try{
      const x=await body(req),s=read(STORE);const shop=find(s.shops,x.shopId),service=find(s.services,x.serviceId),barber=find(s.barbers,x.barberId);
      if(!shop||!service||!barber||!validDate(x.date)||!/^(\d{2}):(\d{2})$/.test(x.time)||!x.clientName?.trim()||!x.clientPhone?.trim()||!x.clientEmail?.trim())return send(res,400,{error:'Please provide valid booking details.'});
      const dateObj=new Date(x.date+'T00:00:00'); if(Number.isNaN(dateObj.getTime()))return send(res,400,{error:'Invalid date.'}); const todayStr=new Date().toISOString().slice(0,10); if(x.date<todayStr)return send(res,400,{error:'Selected date is in the past.'}); const dow=dateObj.getDay();if((barber.off_days||[]).includes(dow))return send(res,409,{error:'This barber is unavailable on the selected day.'});
      const st=mins(x.time),en=st+service.duration;if(st<s.hours.start*60||en>s.hours.end*60)return send(res,400,{error:'Selected time is outside working hours.'});
      const overlap=s.appointments.some(a=>a.date===x.date&&a.barberId===x.barberId&&a.status!=='cancelled'&&st<(mins(a.time)+(find(s.services,a.serviceId)?.duration||30))&&en>mins(a.time));
      if(overlap)return send(res,409,{error:'That time was just booked. Please choose another slot.'});
      const appointment={id:'apt_'+crypto.randomUUID(),shopId:x.shopId,serviceId:x.serviceId,barberId:x.barberId,date:x.date,time:x.time,clientName:x.clientName.trim(),clientPhone:x.clientPhone.trim(),clientEmail:x.clientEmail.trim(),status:'confirmed',createdAt:new Date().toISOString(),whatsappReminderSentAt:null};s.appointments.push(appointment);write(STORE,s);let emailSent=false;try{emailSent=(await sendReceipt(appointment,shop,service,barber)).sent}catch(e){console.error('Receipt email failed:',e.message)}return send(res,201,{appointment,emailSent});
    }catch(e){return send(res,400,{error:'Invalid JSON request.'});}
  }
  if(req.method==='POST'&&u.pathname==='/api/auth/login'){
    try{
      const x=await body(req),data=read(USERS),users=[...(data.admins||[]),...(data.barbers||[])],user=users.find(v=>v.username===x.username);
      if(!user||hash(x.password||'',user.salt)!==user.passwordHash)return send(res,401,{error:'Invalid credentials'});
      const role=user.role||'admin';
      return send(res,200,{token:token({username:user.username,role,barberId:user.barberId||null,exp:Date.now()+12*60*60*1000}),username:user.username,role,barberId:user.barberId||null});
    }catch{return send(res,400,{error:'Invalid request'});}
  }
  if(req.method==='GET'&&u.pathname==='/api/admin/appointments'){
    const session=auth(req); if(!session||session.role!=='admin')return send(res,401,{error:'Unauthorized'});
    return send(res,200,{appointments:read(STORE).appointments});
  }
  if(req.method==='GET'&&u.pathname==='/api/barber/appointments'){
    const session=auth(req); if(!session||session.role!=='barber'||!session.barberId)return send(res,401,{error:'Unauthorized'});
    const s=read(STORE); return send(res,200,{barberId:session.barberId,appointments:s.appointments.filter(a=>a.barberId===session.barberId)});
  }
  if(req.method==='PUT'&&u.pathname.startsWith('/api/admin/appointments/')){
    const session=auth(req); if(!session||session.role!=='admin')return send(res,401,{error:'Unauthorized'});
    try{
      const id=u.pathname.split('/').pop(),x=await body(req),s=read(STORE),apt=s.appointments.find(a=>a.id===id);
      const shop=find(s.shops,x.shopId),service=find(s.services,x.serviceId),barber=find(s.barbers,x.barberId);
      if(!apt||!shop||!service||!barber||!validDate(x.date)||!/^\d{2}:\d{2}$/.test(x.time)||!x.clientName?.trim()||!x.clientPhone?.trim()||!x.clientEmail?.trim())return send(res,400,{error:'Please provide valid appointment details.'});
      const dateObj=new Date(x.date+'T00:00:00'); if(Number.isNaN(dateObj.getTime()))return send(res,400,{error:'Invalid date.'}); const todayStr=new Date().toISOString().slice(0,10); if(x.date<todayStr)return send(res,400,{error:'Selected date is in the past.'}); const dow=dateObj.getDay();if((barber.off_days||[]).includes(dow))return send(res,409,{error:'This barber is unavailable on the selected day.'});
      const st=mins(x.time),en=st+service.duration;if(st<s.hours.start*60||en>s.hours.end*60)return send(res,400,{error:'Selected time is outside working hours.'});
      const overlap=s.appointments.some(a=>a.id!==id&&a.date===x.date&&a.barberId===x.barberId&&a.status!=='cancelled'&&st<(mins(a.time)+(find(s.services,a.serviceId)?.duration||30))&&en>mins(a.time));
      if(overlap)return send(res,409,{error:'That time is already booked for this barber.'});
      Object.assign(apt,{shopId:x.shopId,serviceId:x.serviceId,barberId:x.barberId,date:x.date,time:x.time,clientName:x.clientName.trim(),clientPhone:x.clientPhone.trim(),clientEmail:x.clientEmail.trim()});write(STORE,s);return send(res,200,{appointment:apt});
    }catch{return send(res,400,{error:'Invalid request'});}
  }
  if(req.method==='DELETE'&&u.pathname.startsWith('/api/admin/appointments/')){
    if(!auth(req))return send(res,401,{error:'Unauthorized'});const id=u.pathname.split('/').pop(),s=read(STORE),n=s.appointments.length;s.appointments=s.appointments.filter(a=>a.id!==id);if(s.appointments.length===n)return send(res,404,{error:'Appointment not found'});write(STORE,s);return send(res,200,{ok:true});
  }
  return send(res,404,{error:'Not found'});
}

const server=http.createServer(async(req,res)=>{
  try{const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(u.pathname.startsWith('/api/'))return await api(req,res,u);let pathname=decodeURIComponent(u.pathname);if(pathname==='/' )pathname='/index.html';const file=path.normalize(path.join(PUBLIC,pathname));if(!file.startsWith(PUBLIC))return text(res,403,'Forbidden');if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});return fs.createReadStream(file,{highWaterMark:64*1024}).on('error',()=>{if(!res.headersSent)text(res,500,'Server error')}).pipe(res);}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return fs.createReadStream(path.join(PUBLIC,'index.html')).pipe(res);}catch(e){console.error(e);return text(res,500,'Server error');}
});
server.listen(PORT,()=>console.log(`Nadeem BarberShop running at http://localhost:${PORT}`));
