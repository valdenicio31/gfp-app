const API_URL='https://gfp-familiar-api.onrender.com';
const authMessage=document.querySelector('#authMessage');
const loginForm=document.querySelector('#loginForm');
const registerForm=document.querySelector('#registerForm');

async function request(path,options={}){
  const response=await fetch(`${API_URL}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'Não foi possível concluir a operação');
  return data;
}

function setSession(token){sessionStorage.setItem('gfp_token',token)}
function authHeaders(){return {Authorization:`Bearer ${sessionStorage.getItem('gfp_token')}`}}
const money=cents=>(Number(cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
async function loadFinance(){
  const [accounts,transactions]=await Promise.all([request('/accounts',{headers:authHeaders()}),request('/transactions',{headers:authHeaders()})]);
  document.querySelector('#realAccounts').innerHTML=accounts.length?accounts.map(a=>`<div><b>${a.is_private?'🔒':'👨‍👩‍👧‍👦'} ${a.name}</b><strong>${money(a.balance_cents)}</strong></div>`).join(''):'Nenhuma conta criada.';
  document.querySelector('#transactionAccount').innerHTML='<option value="">Selecione a conta</option>'+accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  document.querySelector('#realTransactions').innerHTML=transactions.slice(0,8).map(t=>`<div><span>${t.type==='income'?'🟢':'🔴'} ${t.description}<small>${t.account_name} • ${t.occurred_on}</small></span><strong>${money(t.amount_cents)}</strong></div>`).join('');
}
async function loadRealProfile(token){
  const profile=await request('/me',{headers:{Authorization:`Bearer ${token}`}});
  document.querySelector('header small').textContent=`👨‍👩‍👧‍👦 ${profile.family_name.toUpperCase()}`;
  profiles[profile.role]={name:profile.name.split(' ')[0],permission:profiles[profile.role]?.permission||'Acesso familiar'};
  enter(profile.role);
  roleSelect.disabled=true;
  await loadFinance();
  notify(`Bem-vindo à família ${profile.family_name} 💜`);
}

document.querySelectorAll('[data-auth-tab]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-auth-tab]').forEach(item=>item.classList.toggle('active',item===button));
  const registering=button.dataset.authTab==='register';
  loginForm.classList.toggle('hidden',registering);
  registerForm.classList.toggle('hidden',!registering);
}));

loginForm.addEventListener('submit',async event=>{
  event.stopImmediatePropagation();event.preventDefault();
  authMessage.textContent='🟡 Validando acesso...';
  try{
    const data=await request('/auth/login',{method:'POST',body:JSON.stringify({email:document.querySelector('#loginEmail').value,password:document.querySelector('#loginPassword').value})});
    setSession(data.token);await loadRealProfile(data.token);
  }catch(error){authMessage.textContent=`🔴 ${error.message}`}
},true);

registerForm.addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    const data=await request('/auth/register-family',{method:'POST',body:JSON.stringify({name:document.querySelector('#registerName').value,familyName:document.querySelector('#registerFamily').value,email:document.querySelector('#registerEmail').value,password:document.querySelector('#registerPassword').value})});
    setSession(data.token);await loadRealProfile(data.token);
  }catch(error){notify(`🔴 ${error.message}`)}
});

document.querySelector('#demoButton').addEventListener('click',()=>enter('admin'));
document.querySelector('#accountForm').addEventListener('submit',async event=>{
  event.preventDefault();
  try{await request('/accounts',{method:'POST',headers:authHeaders(),body:JSON.stringify({name:document.querySelector('#accountName').value,type:document.querySelector('#accountType').value,balanceCents:Math.round(Number(document.querySelector('#accountBalance').value||0)*100),isPrivate:document.querySelector('#accountPrivate').checked})});event.target.reset();await loadFinance();notify('🟢 Conta criada com sucesso')}catch(error){notify(`🔴 ${error.message}`)}
});
document.querySelector('#transactionDate').value=new Date().toISOString().slice(0,10);
document.querySelector('#transactionForm').addEventListener('submit',async event=>{
  event.preventDefault();
  try{await request('/transactions',{method:'POST',headers:authHeaders(),body:JSON.stringify({accountId:document.querySelector('#transactionAccount').value,type:document.querySelector('#transactionType').value,description:document.querySelector('#transactionDescription').value,amountCents:Math.round(Number(document.querySelector('#transactionAmount').value)*100),occurredOn:document.querySelector('#transactionDate').value})});event.target.reset();document.querySelector('#transactionDate').value=new Date().toISOString().slice(0,10);await loadFinance();notify('🟢 Lançamento registrado')}catch(error){notify(`🔴 ${error.message}`)}
});
document.querySelector('#inviteForm').addEventListener('submit',async event=>{
  event.preventDefault();
  try{const data=await request('/family/invitations',{method:'POST',headers:authHeaders(),body:JSON.stringify({email:document.querySelector('#inviteEmail').value,role:document.querySelector('#inviteRole').value})});document.querySelector('#inviteResult').innerHTML=`<b>🟢 Convite válido por 7 dias</b><small>Código: ${data.inviteCode}</small>`;event.target.reset()}catch(error){document.querySelector('#inviteResult').textContent=`🔴 ${error.message}`}
});
const existingToken=sessionStorage.getItem('gfp_token');
if(existingToken) loadRealProfile(existingToken).catch(()=>sessionStorage.removeItem('gfp_token'));
