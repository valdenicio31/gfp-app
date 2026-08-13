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
async function loadFinance(scope='family'){
  const [accounts,transactions]=await Promise.all([request(`/accounts?scope=${scope}`,{headers:authHeaders()}),request(`/transactions?scope=${scope}`,{headers:authHeaders()})]);
  document.querySelector('#realAccounts').innerHTML=accounts.length?accounts.map(a=>`<div><b>${a.is_private?'🔒':'👨‍👩‍👧‍👦'} ${a.name}</b><strong>${money(a.balance_cents)}</strong></div>`).join(''):'Nenhuma conta criada.';
  document.querySelector('#transactionAccount').innerHTML='<option value="">Selecione a conta</option>'+accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  document.querySelector('#realTransactions').innerHTML=transactions.slice(0,8).map(t=>`<div><span>${t.type==='income'?'🟢':'🔴'} ${t.description}<small>${t.account_name} • ${t.occurred_on}</small></span><strong>${money(t.amount_cents)}</strong></div>`).join('');
}
async function loadFamilyAdmin(){
  const [familyProfiles,members]=await Promise.all([request('/family/profiles',{headers:authHeaders()}),request('/family/members',{headers:authHeaders()})]);
  document.querySelector('#profileList').innerHTML=familyProfiles.map(p=>`<div class="profile-chip"><span>${p.emoji}</span><b>${p.name}</b><small>${p.base_role==='admin'?'Único administrador':p.base_role}${p.is_default?' • padrão':' • personalizado'}</small></div>`).join('');
  document.querySelector('#inviteProfile').innerHTML='<option value="">Selecione um perfil</option>'+familyProfiles.filter(p=>p.base_role!=='admin').map(p=>`<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');
  document.querySelector('#memberCount').textContent=members.length;
  document.querySelector('#realMembers').innerHTML=members.map(m=>`<div><span><b>${m.emoji} ${m.name}</b><small>${m.email}</small></span><strong>${m.role==='admin'?'👑 Titular':m.profile_name}</strong></div>`).join('');
}
async function loadRealProfile(token){
  const profile=await request('/me',{headers:{Authorization:`Bearer ${token}`}});
  document.querySelector('header small').textContent=`👨‍👩‍👧‍👦 ${profile.family_name.toUpperCase()}`;
  profiles[profile.role]={name:profile.name.split(' ')[0],permission:profiles[profile.role]?.permission||'Acesso familiar'};
  window.demoMode=false;enter(profile.role);window.demoMode=false;
  roleSelect.disabled=true;
  const isAdmin=profile.role==='admin';document.querySelector('[data-view="family"]').hidden=!isAdmin;document.querySelector('[data-view="private"]').classList.toggle('selected',!isAdmin);document.querySelectorAll('[data-module="users"],[data-module="profiles"]').forEach(button=>button.disabled=!isAdmin);document.querySelectorAll('[data-open-module]').forEach(button=>button.disabled=!isAdmin);await loadFinance(isAdmin?'family':'self');if(isAdmin)await loadFamilyAdmin();
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
  if(window.demoMode){const email=document.querySelector('#inviteEmail').value,profile=document.querySelector('#inviteProfile').selectedOptions[0]?.textContent;document.querySelector('#inviteResult').innerHTML=`<b>🟢 Simulação concluída</b><small>${email} • ${profile} • convite válido por 7 dias</small>`;event.target.reset();return}
  try{const data=await request('/family/invitations',{method:'POST',headers:authHeaders(),body:JSON.stringify({email:document.querySelector('#inviteEmail').value,profileId:document.querySelector('#inviteProfile').value})});document.querySelector('#inviteResult').innerHTML=`<b>🟢 Convite válido por 7 dias</b><small>Código: ${data.inviteCode}</small>`;event.target.reset()}catch(error){document.querySelector('#inviteResult').textContent=`🔴 ${error.message}`}
});
document.querySelector('#profileForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(window.demoMode){const list=document.querySelector('#profileList'),emoji=document.querySelector('#profileEmoji').value,name=document.querySelector('#profileName').value,base=document.querySelector('#profileBase').selectedOptions[0].textContent;list.insertAdjacentHTML('beforeend',`<div class="profile-chip"><span>${emoji}</span><b>${name}</b><small>personalizado • ${base}</small></div>`);document.querySelector('#inviteProfile').insertAdjacentHTML('beforeend',`<option>${emoji} ${name}</option>`);event.target.reset();document.querySelector('#profileEmoji').value='👤';notify('🟢 Perfil simulado criado');return}
  try{await request('/family/profiles',{method:'POST',headers:authHeaders(),body:JSON.stringify({name:document.querySelector('#profileName').value,baseRole:document.querySelector('#profileBase').value,emoji:document.querySelector('#profileEmoji').value})});event.target.reset();document.querySelector('#profileEmoji').value='👤';await loadFamilyAdmin();notify('🟢 Perfil personalizado criado')}catch(error){notify(`🔴 ${error.message}`)}
});
document.querySelectorAll('[data-module]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-module]').forEach(item=>item.classList.toggle('active',item===button));
  document.querySelectorAll('.module-panel').forEach(panel=>panel.classList.toggle('active',panel.id===`module-${button.dataset.module}`));
}));
const existingToken=sessionStorage.getItem('gfp_token');
if(existingToken) loadRealProfile(existingToken).catch(()=>sessionStorage.removeItem('gfp_token'));
