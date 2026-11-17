const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT=path.join(__dirname,'../../site'), OUT=process.argv[2]||'/tmp', REF='rninutwcfcfgqznvfpib';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';if(p.startsWith('/angebot/'))p='/angebot.html';const f=path.join(ROOT,p);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}const ext=path.extname(f);r.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css'}[ext]||'application/octet-stream'});fs.createReadStream(f).pipe(r)}).listen(8765);
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const COACH=uid(1),LENA=uid(2),JONAS=uid(3),NEW=uid(4);const M=[uid(101),uid(102),uid(103)];
const now=new Date();const d=n=>{const x=new Date(now);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const T={
 profiles:[{id:COACH,email:'info@saschpak.de',full_name:'Sascha',role:'coach',package_total:0,course_access:true,started_at:d(-60),invited:true,created_at:'2026-09-01T10:00:00Z'},
  {id:LENA,email:'lena@test.de',full_name:'Lena Kraus',role:'student',package_total:6,course_access:true,started_at:d(-36),invited:true,created_at:'2026-10-03T10:00:00Z'},
  {id:JONAS,email:'jonas@test.de',full_name:'Jonas Weber',role:'student',package_total:2,course_access:true,started_at:d(-50),invited:true,created_at:'2026-09-20T10:00:00Z'},
  {id:NEW,email:'fremd@test.de',full_name:'Fremd',role:'student',package_total:0,course_access:false,started_at:d(-1),invited:false,created_at:'2026-11-07T10:00:00Z'}],
 invites:[{email:'mira@test.de',full_name:'Mira',package_total:10,course_access:true,created_at:'2026-11-06T10:00:00Z'}],
 modules:[{id:M[0],position:1,title:'Grundlagen Rig',drip_type:'now',drip_value:null,created_at:'2026-01-01T00:00:00Z'},{id:M[1],position:2,title:'Click & Cues',drip_type:'sessions',drip_value:2,created_at:'2026-01-01T00:00:00Z'},{id:M[2],position:3,title:'Showtag',drip_type:'manual',drip_value:null,created_at:'2026-01-01T00:00:00Z'}],
 lessons:[{id:uid(201),module_id:M[0],position:1,title:'Was gehört in ein Rig?',duration_seconds:492,points:['Laptop, Interface','Kanäle'],video_id:null,created_at:'2026-01-01T00:00:00Z'},
  {id:uid(202),module_id:M[0],position:2,title:'Interface & Kanäle',duration_seconds:700,points:[],video_id:'abc',created_at:'2026-01-01T00:00:00Z'},
  {id:uid(203),module_id:M[1],position:1,title:'Click-Track bauen',duration_seconds:524,points:['Sounds'],video_id:null,created_at:'2026-01-01T00:00:00Z'},
  {id:uid(204),module_id:M[2],position:1,title:'Soundcheck',duration_seconds:614,points:[],video_id:null,created_at:'2026-01-01T00:00:00Z'}],
 lesson_files:[{id:uid(301),lesson_id:uid(201),file_name:'Kanalliste.pdf',storage_path:uid(201)+'/1-Kanalliste.pdf',created_at:'2026-01-01T00:00:00Z'}],
 lesson_progress:[{user_id:LENA,lesson_id:uid(201),completed_at:'2026-10-10T00:00:00Z'},{user_id:JONAS,lesson_id:uid(201),completed_at:'2026-10-10T00:00:00Z'},{user_id:JONAS,lesson_id:uid(202),completed_at:'2026-10-10T00:00:00Z'},{user_id:JONAS,lesson_id:uid(203),completed_at:'2026-10-10T00:00:00Z'}],
 module_unlocks:[],
 sessions:[{id:uid(401),user_id:LENA,held_on:d(-8),topic:'Cues und In-Ear',notes:'Cues sitzen.\nClick lauter.',created_at:'2026-10-31T00:00:00Z'},{id:uid(402),user_id:JONAS,held_on:d(-30),topic:'Rig-Check',notes:'',created_at:'2026-10-01T00:00:00Z'},{id:uid(403),user_id:JONAS,held_on:d(-25),topic:'Click',notes:'',created_at:'2026-10-05T00:00:00Z'}],
 session_tasks:[{id:uid(501),session_id:uid(401),position:0,body:'Cue Bridge neu aufnehmen',done:false},{id:uid(502),session_id:uid(401),position:1,body:'Click-Ausgang anlegen',done:true}],
 slots:[],
 bookings:[{id:uid(601),user_id:LENA,starts_at:new Date(Date.now()+3*864e5).toISOString(),topic:'Setlist',status:'booked',external_id:null,created_at:'2026-11-01T00:00:00Z'}],
 questions:[{id:uid(701),user_id:JONAS,lesson_id:uid(203),body:'Timecode und MIDI gleichzeitig?',answer:null,answered_at:null,created_at:'2026-11-07T10:00:00Z'}],
 waitlist:[{id:uid(1001),email:'w1@test.de',full_name:'Wanda Eins',note:'Keys in Band',token:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',early_bird:false,status:'waiting',confirmed_at:'2026-11-01T11:00:00Z',created_at:'2026-11-01T10:00:00Z'},{id:uid(1002),email:'w2@test.de',full_name:'Willi Zwei',note:'',token:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',status:'waiting',created_at:'2026-11-02T10:00:00Z'}],
 offers:[],
 offer_views:[],
 news:[{id:uid(801),title:'Neue Lektion online',body:'Text zur News',published_at:'2026-11-06T10:00:00Z'}]
};
const log=[];
function filt(rows,params){for(const [k,v] of params){if(['select','order','limit','offset','columns','on_conflict'].includes(k))continue;const m=/^eq\.(.*)$/.exec(v);if(m)rows=rows.filter(r=>String(r[k])===m[1]);}return rows}
function withEmbeds(t,rows,sel){if(t==='sessions'&&/session_tasks/.test(sel||''))return rows.map(s=>({...s,session_tasks:T.session_tasks.filter(x=>x.session_id===s.id)}));return rows}
let n=900;
async function handle(route,role){const req=route.request();const u=new URL(req.url());const m=u.pathname.match(/\/rest\/v1\/(.+)$/);
 if(u.pathname.startsWith('/storage/')){log.push('STORAGE '+req.method()+' '+u.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({signedURL:'/object/sign/x?token=1',Key:'x'})})}
 if(u.pathname.startsWith('/auth/')){log.push('AUTH '+u.pathname);return route.fulfill({status:200,contentType:'application/json',body:'{}'})}
 if(!m)return route.fulfill({status:404,body:''});const t=m[1];const params=[...u.searchParams];const meth=req.method();
 const me=role;
 if(t.startsWith('rpc/')){const b=JSON.parse(req.postData()||'{}');log.push('RPC '+t+' '+JSON.stringify(b));
 const W=T.waitlist,place=w=>W.filter(x=>x.status==='waiting'&&x.created_at<=w.created_at).length;const J=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
 if(t==='rpc/waitlist_stats')return J({waiting:W.filter(x=>x.status==='waiting').length,invited:W.filter(x=>x.status==='invited').length,early_bird_slots:3,early_bird_left:Math.max(0,3-W.filter(x=>x.early_bird).length)});
 if(t==='rpc/waitlist_status'){const w=W.find(x=>x.token===b.p_token);return J(w?{name:w.full_name,status:w.status,early_bird:!!w.early_bird,confirmed:!!w.confirmed_at,reach:w.reach||'',position:w.status==='waiting'?place(w):null}:null)}
 if(t==='rpc/offer_get'){const o=T.offers.find(x=>x.token===b.p_token||x.slug===b.p_token);if(!o)return J(null);if(!me){if(!o.viewed_at)o.viewed_at=new Date().toISOString();T.offer_views.push({id:T.offer_views.length+1,offer_id:o.id,at:new Date().toISOString(),device:b.p_device||''});}const today=new Date().toISOString().slice(0,10);return J({name:o.name,note:o.note,plan:o.plan||[],full_price:o.full_price||0,full_was:o.full_was||0,full_label:o.full_label||'',single_price:o.single_price||0,valid_until:o.valid_until||null,status:o.status||'offen',expired:!!(o.valid_until&&o.valid_until<today),created_at:o.created_at})}
 if(t==='rpc/offer_answer'){const o=T.offers.find(x=>x.token===b.p_token||x.slug===b.p_token);if(!o)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Angebot nicht gefunden'})});if((o.status||'offen')!=='offen')return J({status:o.status,already:true});o.status=b.p_choice;o.pay_mode=b.p_pay||'';o.answered_at=new Date().toISOString();return J({status:o.status,pay_mode:o.pay_mode,already:false})}
 if(t==='rpc/waitlist_set_reach'){const w=W.find(x=>x.token===b.p_token&&x.status==='waiting');if(w)w.reach=(b.p_reach||'').trim().slice(0,80);return J(!!w)}
 if(t==='rpc/waitlist_confirm'){const w=W.find(x=>x.token===b.p_token&&x.status!=='removed');if(!w)return J(null);w.confirmed_at=w.confirmed_at||new Date().toISOString();return J({name:w.full_name,status:w.status,position:w.status==='waiting'?place(w):null})}
 if(t==='rpc/waitlist_unsubscribe'){const w=W.find(x=>x.token===b.p_token&&x.status==='waiting');if(w)w.status='removed';return J(!!w)}
 if(t==='rpc/slot_book'){const x=(T.slots||[]).find(y=>y.id===b.p_slot);if(!x||x.booking_id)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Diese Zeit wurde gerade schon gebucht.'})});const id=uid(n++);T.bookings.push({id,user_id:me,starts_at:x.starts_at,topic:b.p_topic||'',status:'booked',minutes:x.minutes,created_at:new Date().toISOString()});x.booking_id=id;return J({id,starts_at:x.starts_at})}
 if(t==='rpc/booking_cancel'){const k=T.bookings.find(y=>y.id===b.p_booking&&y.user_id===me);if(!k||new Date(k.starts_at)-Date.now()<864e5)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Weniger als 24 Stunden vorher kannst du nicht mehr selbst absagen.'})});k.status='canceled';(T.slots||[]).forEach(y=>{if(y.booking_id===k.id)y.booking_id=null});return J(true)}
 if(t==='rpc/lesson_video_url'){const l=T.lessons.find(x=>x.id===b.p_lesson);return J(l&&l.video_id?'https://iframe.mediadelivery.net/embed/811527/'+l.video_id+'?token=abc&expires=1':null)}
 if(t==='rpc/mail_ready')return J(process.env.NOKEY?false:true);
 if(t==='rpc/mail_log_status')return J([{id:1,created_at:'2026-11-09T10:00:00Z',kind:'bestaetigung',to_email:'w1@test.de',subject:'x',status:'gesendet',status_code:200},{id:2,created_at:'2026-11-09T10:00:00Z',kind:'coach_info',to_email:'info@saschpak.de',subject:'x',status:'gesendet',status_code:422,error:'{"message":"bad from"}'},{id:3,created_at:'2026-11-08T10:00:00Z',kind:'bestaetigung',to_email:'w2@test.de',subject:'x',status:'kein_schluessel'}]);
 if(t==='rpc/waitlist_send_invite')return J(1);if(t==='rpc/invite_send_mail')return J(1);
 if(t==='rpc/waitlist_resend_confirmation')return J(1);
 if(t==='rpc/waitlist_resend_confirmations')return J(W.filter(x=>x.status==='waiting'&&!x.confirmed_at).length);
 if(t==='rpc/waitlist_broadcast')return J(W.filter(x=>x.status==='waiting'&&(!b.p_only_confirmed||x.confirmed_at)).length);
 if(t==='rpc/join_waitlist'){const e=b.p_email.toLowerCase().trim();const ex=W.find(x=>x.email===e);if(ex)return J({already:true,status:ex.status,position:ex.status==='waiting'?place(ex):null});
   const w={id:uid(n++),email:e,full_name:b.p_name,note:b.p_note,token:'cccccccc-cccc-cccc-cccc-'+String(n).padStart(12,'0'),status:'waiting',early_bird:false,created_at:new Date().toISOString()};W.push(w);return J({already:false,status:'waiting',token:w.token,early_bird:w.early_bird,position:place(w)})}const tk=T.session_tasks.find(x=>x.id===b.p_task);if(tk)tk.done=b.p_done;return route.fulfill({status:204,body:''})}
 if(!T[t])return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({message:'relation does not exist'})});
 // crude RLS for student
 const vis=rows=>{if(me===COACH)return rows;if(['profiles'].includes(t))return rows.filter(r=>r.id===me);if(['lesson_progress','module_unlocks','sessions','bookings','questions'].includes(t))return rows.filter(r=>r.user_id===me);if(t==='session_tasks')return rows.filter(x=>T.sessions.some(s=>s.id===x.session_id&&s.user_id===me));if(t==='invites'||t==='waitlist')return [];return rows};
 if(meth==='GET'){let rows=withEmbeds(t,filt(vis(T[t]),params),u.searchParams.get('select'));const single=(req.headers()['accept']||'').includes('vnd.pgrst.object');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?(rows[0]||null):rows)})}
 const body=req.postData()?JSON.parse(req.postData()):null;log.push(meth+' '+t+' '+u.search+' '+(body?JSON.stringify(body).slice(0,160):''));
 if(meth==='POST'){const arr=Array.isArray(body)?body:[body];const out=arr.map(r=>({id:uid(n++),created_at:new Date().toISOString(),...r}));if(t==='news')out.forEach(o=>o.published_at=o.published_at||new Date().toISOString());if(t==='lessons')out.forEach(o=>{o.points=o.points||[]});if(t==='offers')out.forEach(o=>{o.slug=o.slug||((o.name||'angebot').toLowerCase().split(' ')[0]+'-ab2cd');o.token=o.token||'dddddddd-dddd-dddd-dddd-'+String(n++).padStart(12,'0');o.status=o.status||'offen'});T[t].push(...out);
   const single=(req.headers()['accept']||'').includes('vnd.pgrst.object');return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(single?out[0]:out)})}
 if(meth==='POST'&&false){}
 if(meth==='PATCH'){filt(T[t],params).forEach(r=>Object.assign(r,body));return route.fulfill({status:204,body:''})}
 if(meth==='DELETE'){const del=new Set(filt(T[t],params));T[t]=T[t].filter(r=>!del.has(r));if(t==='profiles')for(const k of ['sessions','questions','lesson_progress','bookings','module_unlocks'])T[k]=T[k].filter(r=>!del.has(T.profiles.find(p=>p.id===r.user_id))&&T.profiles.some(p=>p.id===r.user_id));
   return route.fulfill({status:204,body:''})}
 return route.fulfill({status:405,body:''})}
function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url')}
async function page(browser,role,email,vp){const ctx=await browser.newContext({viewport:vp||{width:1280,height:900},colorScheme:process.env.DARK?'dark':'light'});
 const sess={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:role,email,role:'authenticated',exp:Math.floor(Date.now()/1000)+86400,aud:'authenticated'})+'.sig',refresh_token:'r',token_type:'bearer',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,user:{id:role,email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}};
 if(role)await ctx.addInitScript(([k,v])=>{try{localStorage.setItem(k,v)}catch(e){}},['sb-'+REF+'-auth-token',JSON.stringify(sess)]);
 await ctx.route('https://'+REF+'.supabase.co/**',r=>handle(r,role));await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://iframe.mediadelivery.net/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<body style="margin:0;background:#222;color:#fff;display:grid;place-items:center;height:100vh;font:20px sans-serif">Bunny-Player (Test)</body>'}));await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
 const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGEERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});return p}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
module.exports={chromium,srv,page,T,log,uid,COACH,LENA,JONAS,NEW,M,OUT,wait};
