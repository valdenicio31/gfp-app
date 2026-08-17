import {createServer} from 'node:http';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {Pool} from 'pg';

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false}});
const origin=process.env.CLIENT_ORIGIN||'*';
const hash=value=>createHash('sha256').update(value).digest('hex');
const passwordHash=password=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex')};
const validPassword=(password,stored)=>{const[salt,key]=stored.split(':');const candidate=scryptSync(password,salt,64);return timingSafeEqual(candidate,Buffer.from(key,'hex'))};
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'});res.end(JSON.stringify(data))};
const body=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>1_000_000)reject(new Error('Payload muito grande'))});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('JSON inválido'))}})});
async function userFrom(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return null;const result=await pool.query('select user_id from app_sessions where token_hash=$1 and expires_at>now()',[hash(token)]);return result.rows[0]?.user_id||null}
const emailOf=value=>String(value||'').trim().toLowerCase();

createServer(async(req,res)=>{try{
 if(req.method==='OPTIONS')return send(res,204,{});
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true});
 if(req.method==='POST'&&url.pathname==='/api/auth/register'){
   const {email,password,fullName}=await body(req);const normalized=emailOf(email);
   if(!/^\S+@\S+\.\S+$/.test(normalized)||String(password||'').length<8||!String(fullName||'').trim())return send(res,400,{error:'Informe nome, e-mail válido e senha de no mínimo 8 caracteres.'});
   const result=await pool.query('insert into app_users(email,password_hash,full_name) values($1,$2,$3) returning id,email,full_name',[normalized,passwordHash(password),String(fullName).trim()]);
   return send(res,201,{user:result.rows[0]});
 }
 if(req.method==='POST'&&url.pathname==='/api/auth/login'){
   const {email,password}=await body(req);const result=await pool.query('select id,email,full_name,password_hash from app_users where email=$1',[emailOf(email)]);const user=result.rows[0];if(!user||!validPassword(String(password||''),user.password_hash))return send(res,401,{error:'E-mail ou senha inválidos.'});
   const token=randomBytes(48).toString('base64url');await pool.query("insert into app_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '30 days')",[user.id,hash(token)]);
   return send(res,200,{token,user:{id:user.id,email:user.email,fullName:user.full_name}});
 }
 const userId=await userFrom(req);if(!userId)return send(res,401,{error:'Sessão inválida ou expirada.'});
 if(req.method==='POST'&&url.pathname==='/api/auth/logout'){await pool.query('delete from app_sessions where token_hash=$1',[hash(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''))]);return send(res,204,{})}
 if(req.method==='GET'&&url.pathname==='/api/sync'){const result=await pool.query('select data,updated_at from user_snapshots where user_id=$1',[userId]);return send(res,200,{data:result.rows[0]?.data||{},updatedAt:result.rows[0]?.updated_at||null})}
 if(req.method==='PUT'&&url.pathname==='/api/sync'){const {data}=await body(req);if(!data||typeof data!=='object'||Array.isArray(data))return send(res,400,{error:'Dados de sincronização inválidos.'});await pool.query('insert into user_snapshots(user_id,data) values($1,$2) on conflict(user_id) do update set data=excluded.data,updated_at=now()',[userId,data]);return send(res,200,{ok:true})}
 return send(res,404,{error:'Rota não encontrada.'});
}catch(error){console.error(error instanceof Error?error.message:'erro');return send(res,500,{error:'Erro interno da API.'})}}).listen(process.env.PORT||3001,()=>console.log('GFP API ativa'));
