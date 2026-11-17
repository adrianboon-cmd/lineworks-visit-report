const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const DOMAIN = process.env.KINTONE_DOMAIN;
const CUSTOMER_APP_ID = process.env.KINTONE_CUSTOMER_APP_ID || "1349";
const CUSTOMER_TOKEN = process.env.KINTONE_CUSTOMER_API_TOKEN;
const CONTACT_APP_ID = process.env.KINTONE_CONTACT_APP_ID || "1371";
const CONTACT_TOKEN = process.env.KINTONE_CONTACT_API_TOKEN;
const VISIT_APP_ID = process.env.KINTONE_VISIT_APP_ID || "1350";
const VISIT_TOKEN = process.env.KINTONE_VISIT_API_TOKEN;
const WOFF_ID = process.env.LINEWORKS_WOFF_ID;
const LINEWORKS_WOFF_URL =
  process.env.LINEWORKS_WOFF_URL ||
  "https://woff.worksmobile.com/woff/dFobmZpVEKmp7ywVb5oFOw";
const LINEWORKS_BOT_ID = process.env.LINEWORKS_BOT_ID;
const LINEWORKS_CLIENT_ID = process.env.LINEWORKS_CLIENT_ID;
const LINEWORKS_CLIENT_SECRET = process.env.LINEWORKS_CLIENT_SECRET;
const LINEWORKS_SERVICE_ACCOUNT = process.env.LINEWORKS_SERVICE_ACCOUNT;
const LINEWORKS_PRIVATE_KEY = process.env.LINEWORKS_PRIVATE_KEY;
const LINEWORKS_TENANT_ID = process.env.LINEWORKS_TENANT_ID;
const RICHMENU_SETUP_KEY = process.env.RICHMENU_SETUP_KEY;

const AVAILABLE_MODES = ["visit", "customer", "contact", "history"];
const CUSTOMER_STATUSES = ["潛在客戶", "洽談中", "既有客戶", "停止追蹤"];
const INDUSTRY_CODES = {製造業:"MFG",零售業:"RTL",金融業:"FIN",服務業:"SVC",醫療生技業:"BIO",社團法人:"NPO",物流業:"LOG",建築營造業:"CON",國營事業:"SOE",政教機關:"GOV",資訊業:"IT"};
const LW_API = "https://www.worksapis.com/v1.0";
const LW_TOKEN = "https://auth.worksmobile.com/oauth2/v2.0/token";

function json(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data,null,2));}
function text(res,status,data){res.writeHead(status,{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"});res.end(data);}
function norm(v){return String(v||"").trim();}
function esc(v){return String(v).replace(/\\/g,"\\\\").replace(/"/g,'\\"');}
function tokens(...v){return v.filter(Boolean).join(",");}
function body(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>s+=c);req.on("end",()=>resolve(s));req.on("error",reject);});}
function validate(){const x={KINTONE_DOMAIN:DOMAIN,KINTONE_CUSTOMER_API_TOKEN:CUSTOMER_TOKEN,KINTONE_CONTACT_API_TOKEN:CONTACT_TOKEN,KINTONE_VISIT_API_TOKEN:VISIT_TOKEN,LINEWORKS_WOFF_ID:WOFF_ID};const m=Object.entries(x).filter(([,v])=>!v).map(([k])=>k);if(m.length)throw new Error(`缺少 Environment Variable：${m.join("、")}`);}

async function parse(r,msg){const t=await r.text();let d={};try{d=t?JSON.parse(t):{};}catch{d={message:t||msg};}if(!r.ok){const e=new Error(d.error_description||d.message||d.code||msg);e.statusCode=r.status;e.details=d;throw e;}return d;}
async function kapi({token,method,apiPath,queryParams,body:payload}){validate();let u=`${DOMAIN}${apiPath}`;if(queryParams)u+=`?${queryParams.toString()}`;const o={method,headers:{"X-Cybozu-API-Token":token}};if(payload){o.headers["Content-Type"]="application/json";o.body=JSON.stringify(payload);}return parse(await fetch(u,o),"Kintone API 執行失敗");}

function customer(r){return{recordId:r.$id?.value||"",company_id:r.company_id?.value||"",company_name:r.company_name?.value||"",company_phone:r.company_phone?.value||"",company_address:r.company_address?.value||"",industry:r.industry?.value||"",search_keywords:r.search_keywords?.value||"",customer_status:r.customer_status?.value||"",company_note:r.company_note?.value||""};}
function contact(r){return{recordId:r.$id?.value||"",contact_id:r.contact_id?.value||"",company_id:r.company_id?.value||"",company_name:r.company_name?.value||"",industry:r.industry?.value||"",contact_name:r.contact_name?.value||"",department:r.department?.value||"",job_title:r.job_title?.value||"",email:r.email?.value||"",mobile:r.mobile?.value||"",phone:r.phone?.value||"",extension:r.extension?.value||"",contact_note:r.contact_note?.value||""};}
function visit(r){return{recordId:r.$id?.value||"",company_id:r.company_id?.value||"",company_name:r.company_name?.value||"",contact_id:r.contact_id?.value||"",contact_name:r.contact_name?.value||"",department:r.department?.value||"",job_title:r.job_title?.value||"",visit_date:r.visit_date?.value||"",visit_type:r.visit_type?.value||"",visit_content:r.visit_content?.value||"",next_step:r.next_step?.value||"",next_followup_date:r.next_followup_date?.value||"",sales_stage:r.sales_stage?.value||""};}

async function searchCustomers(q){const s=esc(q),p=new URLSearchParams({app:CUSTOMER_APP_ID,query:`(company_name like "${s}" or search_keywords like "${s}") order by company_name asc limit 20`});const d=await kapi({token:CUSTOMER_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});return(d.records||[]).map(customer);}
async function findCustomer(id){const p=new URLSearchParams({app:CUSTOMER_APP_ID,query:`company_id = "${esc(id)}" limit 1`}),d=await kapi({token:CUSTOMER_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});return d.records?.length?customer(d.records[0]):null;}
async function contactsByCompany(id){const p=new URLSearchParams({app:CONTACT_APP_ID,query:`company_id = "${esc(id)}" order by contact_id asc limit 100`}),d=await kapi({token:CONTACT_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});return(d.records||[]).map(contact);}
async function searchContacts(q){const s=esc(q),p=new URLSearchParams({app:CONTACT_APP_ID,query:`(contact_name like "${s}" or company_name like "${s}" or department like "${s}" or job_title like "${s}" or email like "${s}" or mobile like "${s}") order by company_name asc, contact_name asc limit 100`}),d=await kapi({token:CONTACT_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});return(d.records||[]).map(contact);}
async function findContact(id){const p=new URLSearchParams({app:CONTACT_APP_ID,query:`contact_id = "${esc(id)}" limit 1`}),d=await kapi({token:CONTACT_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});return d.records?.length?contact(d.records[0]):null;}
async function visitsByCompany(id){const p=new URLSearchParams({app:VISIT_APP_ID,query:`company_id = "${esc(id)}" order by visit_date desc, $id desc limit 100`}),d=await kapi({token:VISIT_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});return(d.records||[]).map(visit);}

async function nextContactId(c){const code=INDUSTRY_CODES[c.industry];if(!code)throw new Error(`尚未設定產業代碼：${c.industry}`);const pre=`${code}-${c.company_id}-`,p=new URLSearchParams({app:CONTACT_APP_ID,query:`contact_id like "${esc(pre)}" order by contact_id desc limit 100`}),d=await kapi({token:CONTACT_TOKEN,method:"GET",apiPath:"/k/v1/records.json",queryParams:p});let n=0;(d.records||[]).forEach(r=>{const x=norm(r.contact_id?.value);if(x.startsWith(pre)){const v=Number(x.slice(pre.length));if(Number.isInteger(v)&&v>n)n=v;}});return`${pre}${String(n+1).padStart(3,"0")}`;}

// ---------- LINE WORKS ID Token -> kintone User email mapping ----------
async function verifyLineWorksIdToken(idToken){
  if(!LINEWORKS_TENANT_ID)throw new Error("缺少 LINEWORKS_TENANT_ID");
  if(!LINEWORKS_CLIENT_ID)throw new Error("缺少 LINEWORKS_CLIENT_ID");
  if(!idToken)throw new Error("缺少 LINE WORKS ID Token");
  const decoded=jwt.decode(idToken,{complete:true});
  if(!decoded?.header?.kid)throw new Error("LINE WORKS ID Token 格式不正確");
  const configUrl=`https://auth.worksmobile.com/${encodeURIComponent(LINEWORKS_TENANT_ID)}/.well-known/openid-configuration`;
  const config=await parse(await fetch(configUrl),"無法取得 LINE WORKS OIDC 設定");
  const jwks=await parse(await fetch(config.jwks_uri),"無法取得 LINE WORKS 公開金鑰");
  const jwk=(jwks.keys||[]).find(k=>k.kid===decoded.header.kid);
  if(!jwk)throw new Error("找不到 LINE WORKS ID Token 對應公開金鑰");
  const key=crypto.createPublicKey({key:jwk,format:"jwk"});
  const claims=jwt.verify(idToken,key,{algorithms:["RS256"],audience:LINEWORKS_CLIENT_ID,issuer:config.issuer});
  if(!claims.email)throw new Error("LINE WORKS ID Token 沒有 Email，請確認 WOFF/API App 已啟用 email scope");
  return{userId:claims.sub,email:String(claims.email).toLowerCase(),name:claims.name||claims.email,locale:claims.locale||""};
}

async function getAllKintoneUsers(){
  const all=[];let offset=0;const size=100;
  while(true){const p=new URLSearchParams({offset:String(offset),size:String(size)});const d=await kapi({token:CUSTOMER_TOKEN,method:"GET",apiPath:"/v1/users.json",queryParams:p});const users=d.users||[];all.push(...users);if(users.length<size)break;offset+=size;if(offset>10000)throw new Error("Kintone User 數量異常");}
  return all;
}
async function mapKintoneUserByEmail(email){const users=await getAllKintoneUsers();const e=String(email).toLowerCase();const matches=users.filter(u=>String(u.email||"").toLowerCase()===e);if(matches.length===0)throw new Error(`Kintone 找不到相同 Email 的使用者：${email}`);if(matches.length>1)throw new Error(`Kintone 有多個相同 Email 使用者：${email}`);const u=matches[0];return{code:u.code,name:u.name,email:u.email,id:u.id};}
async function verifiedIdentityFromRequest(req){const h=norm(req.headers.authorization);if(!h.startsWith("Bearer "))throw new Error("尚未完成 LINE WORKS 身分驗證");const lineworks=await verifyLineWorksIdToken(h.slice(7));const kintone=await mapKintoneUserByEmail(lineworks.email);return{lineworks,kintone};}

async function createCustomer(d,identity){return kapi({token:CUSTOMER_TOKEN,method:"POST",apiPath:"/k/v1/record.json",body:{app:CUSTOMER_APP_ID,record:{company_id:{value:d.company_id},company_name:{value:d.company_name},company_phone:{value:d.company_phone||""},company_address:{value:d.company_address||""},industry:{value:d.industry},search_keywords:{value:d.search_keywords||""},customer_status:{value:d.customer_status},company_note:{value:d.company_note||""},created_by_user:{value:[{code:identity.kintone.code}]}}}});}
async function createContact(c,d,identity){let last;for(let i=0;i<3;i++){const id=await nextContactId(c);try{await kapi({token:tokens(CONTACT_TOKEN,CUSTOMER_TOKEN),method:"POST",apiPath:"/k/v1/record.json",body:{app:CONTACT_APP_ID,record:{contact_id:{value:id},company_id:{value:c.company_id,lookup:true},contact_name:{value:d.contact_name},department:{value:d.department||""},job_title:{value:d.job_title||""},email:{value:d.email||""},mobile:{value:d.mobile||""},phone:{value:d.phone||c.company_phone||""},extension:{value:d.extension||""},contact_note:{value:d.contact_note||""},created_by_user:{value:[{code:identity.kintone.code}]}}}});return await findContact(id);}catch(e){last=e;if(!(e.statusCode===400&&JSON.stringify(e.details||{}).includes("contact_id")))throw e;}}throw last;}
async function createVisit(c,p,d,identity){const r={company_id:{value:c.company_id,lookup:true},contact_id:{value:p.contact_id,lookup:true},visit_date:{value:d.visit_date},visit_type:{value:d.visit_type},visit_content:{value:d.visit_content},next_step:{value:d.next_step},reporter:{value:[{code:identity.kintone.code}]}};if(d.next_followup_date)r.next_followup_date={value:d.next_followup_date};if(d.sales_stage)r.sales_stage={value:d.sales_stage};return kapi({token:tokens(VISIT_TOKEN,CUSTOMER_TOKEN,CONTACT_TOKEN),method:"POST",apiPath:"/k/v1/record.json",body:{app:VISIT_APP_ID,record:r}});}

function nc(v){const s=v&&typeof v==="object"?v:{};return{company_id:norm(s.company_id),company_name:norm(s.company_name),company_phone:norm(s.company_phone),company_address:norm(s.company_address),industry:norm(s.industry),search_keywords:norm(s.search_keywords),customer_status:norm(s.customer_status),company_note:norm(s.company_note)};}
function np(v){const s=v&&typeof v==="object"?v:{};return{contact_id:norm(s.contact_id),contact_name:norm(s.contact_name),department:norm(s.department),job_title:norm(s.job_title),email:norm(s.email),mobile:norm(s.mobile),phone:norm(s.phone),extension:norm(s.extension),contact_note:norm(s.contact_note)};}
function nv(v){const s=v&&typeof v==="object"?v:{};return{visit_date:norm(s.visit_date),visit_type:norm(s.visit_type),visit_content:norm(s.visit_content),next_step:norm(s.next_step),next_followup_date:norm(s.next_followup_date),sales_stage:norm(s.sales_stage)};}

// ---------- Existing Rich Menu helpers ----------
function privateKey(){return String(LINEWORKS_PRIVATE_KEY||"").trim().replace(/^['"]|['"]$/g,"").replace(/\\n/g,"\n");}
function validateRich(){const x={LINEWORKS_BOT_ID,LINEWORKS_CLIENT_ID,LINEWORKS_CLIENT_SECRET,LINEWORKS_SERVICE_ACCOUNT,LINEWORKS_PRIVATE_KEY,RICHMENU_SETUP_KEY};const m=Object.entries(x).filter(([,v])=>!v).map(([k])=>k);if(m.length)throw new Error(`Rich Menu 缺少：${m.join("、")}`);}
async function lwToken(){validateRich();const now=Math.floor(Date.now()/1000),assertion=jwt.sign({iss:LINEWORKS_CLIENT_ID,sub:LINEWORKS_SERVICE_ACCOUNT,iat:now,exp:now+3600},privateKey(),{algorithm:"RS256"}),f=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",client_id:LINEWORKS_CLIENT_ID,client_secret:LINEWORKS_CLIENT_SECRET,assertion,scope:"bot,bot.message"});const d=await parse(await fetch(LW_TOKEN,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:f}),"LINE WORKS Token 失敗");return d.access_token;}
async function lw(token,method,payloadPath,payload){return parse(await fetch(`${LW_API}${payloadPath}`,{method,headers:{Authorization:`Bearer ${token}`,...(payload?{"Content-Type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),"LINE WORKS API 失敗");}
async function uploadMenuImage(token,filePath){const fileName=path.basename(filePath),a=await lw(token,"POST",`/bots/${LINEWORKS_BOT_ID}/attachments`,{fileName}),f=new FormData(),buf=fs.readFileSync(filePath);f.append("resourceName",fileName);f.append("Filedata",new Blob([buf],{type:"image/png"}),fileName);await parse(await fetch(a.uploadUrl,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:f}),"Rich Menu 圖片上傳失敗");return a.fileId;}
function menuAreas() {
  const woffUrl =
    LINEWORKS_WOFF_URL.replace(/\/$/, "");

  return [
    [0, 0, "拜訪紀錄回報", "visit"],
    [1250, 0, "客戶查詢", "customer"],
    [0, 843, "聯絡人查詢", "contact"],
    [1250, 843, "拜訪紀錄", "history"]
  ].map(([x, y, label, mode]) => ({
    bounds: {
      x,
      y,
      width: 1250,
      height: 843
    },
    action: {
      type: "uri",
      label,
      uri:
        `${woffUrl}?mode=${mode}`
    }
  }));
}
async function setupMenu(base){const token=await lwToken(),dir=path.join(__dirname,"richmenu"),zh=await uploadMenuImage(token,path.join(dir,"richmenu-zh.png")),en=await uploadMenuImage(token,path.join(dir,"richmenu-en.png")),jp=await uploadMenuImage(token,path.join(dir,"richmenu-jp.png")),m=await lw(token,"POST",`/bots/${LINEWORKS_BOT_ID}/richmenus`,{richmenuName:`CRM ${new Date().toISOString()}`,size:{width:2500,height:1686},areas:menuAreas()});await lw(token,"POST",`/bots/${LINEWORKS_BOT_ID}/richmenus/${m.richmenuId}/image`,{fileId:zh,i18nFileIds:[{language:"zh_TW",fileId:zh},{language:"en_US",fileId:en},{language:"ja_JP",fileId:jp}]});await lw(token,"POST",`/bots/${LINEWORKS_BOT_ID}/richmenus/${m.richmenuId}/set-default`);return m.richmenuId;}

const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
if(req.method==="GET"&&u.pathname==="/"){const h=fs.readFileSync(path.join(__dirname,"visit-form.html"),"utf8");res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});return res.end(h);}
if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{status:"ok",apps:{customer:CUSTOMER_APP_ID,contact:CONTACT_APP_ID,visit:VISIT_APP_ID},modes:{available:AVAILABLE_MODES},identity:{tenantConfigured:Boolean(LINEWORKS_TENANT_ID),clientConfigured:Boolean(LINEWORKS_CLIENT_ID),fields:{customer:"created_by_user",contact:"created_by_user",visit:"reporter"}}});
if(req.method==="GET"&&u.pathname==="/api/config")return json(res,200,{success:true,woffId:WOFF_ID,mode:AVAILABLE_MODES.includes(norm(u.searchParams.get("mode")))?norm(u.searchParams.get("mode")):"visit",availableModes:AVAILABLE_MODES});
if(req.method==="POST"&&u.pathname==="/api/auth/verify"){const identity=await verifiedIdentityFromRequest(req);return json(res,200,{success:true,verified:true,user:{lineworksUserId:identity.lineworks.userId,email:identity.lineworks.email,name:identity.lineworks.name,locale:identity.lineworks.locale,kintoneUserCode:identity.kintone.code,kintoneUserName:identity.kintone.name}});}
if(req.method==="POST"&&u.pathname==="/admin/richmenu/setup"){validateRich();if(req.headers["x-richmenu-setup-key"]!==RICHMENU_SETUP_KEY)return json(res,401,{success:false,message:"Setup Key 不正確"});const base=process.env.RENDER_EXTERNAL_URL||`https://${req.headers.host}`;const id=await setupMenu(base);return json(res,200,{success:true,richmenuId:id});}
if(req.method==="GET"&&u.pathname==="/api/customers"){const q=norm(u.searchParams.get("keyword"));if(q.length<2)return json(res,400,{success:false,message:"請至少輸入 2 個字"});const a=await searchCustomers(q);return json(res,200,{success:true,found:!!a.length,count:a.length,customers:a});}
if(req.method==="GET"&&u.pathname==="/api/customer-detail"){const c=await findCustomer(norm(u.searchParams.get("companyId")));if(!c)return json(res,404,{success:false,message:"找不到客戶資料"});const a=await contactsByCompany(c.company_id);return json(res,200,{success:true,customer:c,contactCount:a.length,contacts:a});}
if(req.method==="GET"&&u.pathname==="/api/contacts"){const c=await findCustomer(norm(u.searchParams.get("companyId")));if(!c)return json(res,404,{success:false,message:"找不到客戶資料"});const a=await contactsByCompany(c.company_id);return json(res,200,{success:true,customer:c,found:!!a.length,count:a.length,contacts:a});}
if(req.method==="GET"&&u.pathname==="/api/contact-search"){const q=norm(u.searchParams.get("keyword"));if(q.length<2)return json(res,400,{success:false,message:"請至少輸入 2 個字"});const a=await searchContacts(q);return json(res,200,{success:true,found:!!a.length,count:a.length,contacts:a});}
if(req.method==="GET"&&u.pathname==="/api/visits"){const c=await findCustomer(norm(u.searchParams.get("companyId")));if(!c)return json(res,404,{success:false,message:"找不到客戶資料"});const a=await visitsByCompany(c.company_id);return json(res,200,{success:true,customer:c,found:!!a.length,count:a.length,visits:a});}
if(req.method==="POST"&&u.pathname==="/api/visit"){const identity=await verifiedIdentityFromRequest(req);let d;try{d=JSON.parse(await body(req));}catch{return json(res,400,{success:false,message:"資料格式錯誤"});}const cm=norm(d.customerMode),pm=norm(d.contactMode),cd=nc(d.customer),pd=np(d.contact),vd=nv(d.visit);if(!["existing","new"].includes(cm)||!["existing","new"].includes(pm))return json(res,400,{success:false,message:"客戶或聯絡人模式錯誤"});if(!vd.visit_date||!vd.visit_type||!vd.visit_content||!vd.next_step)return json(res,400,{success:false,message:"請完成拜訪必填欄位"});let c,cCreated=false;if(cm==="existing"){c=await findCustomer(cd.company_id);if(!c)return json(res,404,{success:false,message:"找不到客戶"});}else{if(!cd.company_id||!cd.company_name||!cd.industry||!CUSTOMER_STATUSES.includes(cd.customer_status))return json(res,400,{success:false,message:"新客戶資料不完整"});if(await findCustomer(cd.company_id))return json(res,409,{success:false,message:"統一編號已存在"});await createCustomer(cd,identity);cCreated=true;c=await findCustomer(cd.company_id);}let p,pCreated=false;if(pm==="existing"){p=await findContact(pd.contact_id);if(!p||p.company_id!==c.company_id)return json(res,400,{success:false,message:"聯絡人不正確"});}else{if(!pd.contact_name)return json(res,400,{success:false,message:"請輸入聯絡人姓名"});p=await createContact(c,pd,identity);pCreated=true;}const vr=await createVisit(c,p,vd,identity);return json(res,200,{success:true,message:"拜訪紀錄建立成功",customerCreated:cCreated,contactCreated:pCreated,customer:c,contact:p,reporter:{code:identity.kintone.code,name:identity.kintone.name,email:identity.lineworks.email},visitRecordId:vr.id,revision:vr.revision});}
return text(res,404,"Not Found");}catch(e){console.error(e);return json(res,e.statusCode||500,{success:false,message:e.message,details:e.details||null});}});
server.listen(process.env.PORT||3000,()=>console.log(`Server running on port ${process.env.PORT||3000}`));
