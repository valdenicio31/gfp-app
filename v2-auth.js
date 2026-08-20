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
  document.querySelector('#realMembers').innerHTML=members.map(m=>`<div><span class="user-avatar">${m.photo_data?`<img src="${m.photo_data}" alt="Foto de ${m.name}">`:m.avatar_emoji||m.emoji}</span><span><b>${m.name}</b><small>${m.email} • ${m.phone||'celular pendente'}</small><small class="masked-data">CPF ${m.cpf_masked||'***.***.***-**'} • ${m.city||'endereço pendente'}</small></span><strong>${m.role==='admin'?'👑 Titular':`${m.emoji} ${m.profile_name}`}</strong></div>`).join('');
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
  const payload=getInvitePayload();if(!isValidCpf(payload.cpf)){document.querySelector('#inviteResult').textContent='🔴 CPF inválido. Confira os 11 números.';return}
  if(window.demoMode){const profile=document.querySelector('#inviteProfile').selectedOptions[0]?.textContent;document.querySelector('#inviteResult').innerHTML=`<b>🟢 ${payload.name} cadastrado na simulação</b><small>${payload.email} • ${profile} • convite válido por 7 dias</small>`;const list=document.querySelector('#realMembers');list.insertAdjacentHTML('beforeend',`<div><span class="user-avatar">${payload.photoData?`<img src="${payload.photoData}" alt="Foto">`:payload.avatarEmoji}</span><span><b>${payload.name}</b><small>${payload.email} • ${payload.phone}</small><small class="masked-data">CPF ***.***.***-${payload.cpf.slice(-2)} • ${payload.city}/${payload.state}</small></span><strong>${profile}</strong></div>`);document.querySelector('#memberCount').textContent=Number(document.querySelector('#memberCount').textContent)+1;resetInviteForm();return}
  try{const data=await request('/family/invitations',{method:'POST',headers:authHeaders(),body:JSON.stringify(payload)});document.querySelector('#inviteResult').innerHTML=`<b>🟢 Usuário pré-cadastrado; convite válido por 7 dias</b><small>Código: ${data.inviteCode}</small>`;resetInviteForm()}catch(error){document.querySelector('#inviteResult').textContent=`🔴 ${error.message}`}
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
let invitePhotoData='';
const digits=value=>value.replace(/\D/g,'');
function isValidCpf(value){const cpf=digits(value);if(cpf.length!==11||/^(\d)\1+$/.test(cpf))return false;const check=size=>{let sum=0;for(let i=0;i<size;i++)sum+=Number(cpf[i])*(size+1-i);const rest=(sum*10)%11;return (rest===10?0:rest)===Number(cpf[size])};return check(9)&&check(10)}
function getInvitePayload(){return {name:document.querySelector('#inviteName').value.trim(),cpf:digits(document.querySelector('#inviteCpf').value),email:document.querySelector('#inviteEmail').value.trim(),birthDate:document.querySelector('#inviteBirthDate').value,phone:digits(document.querySelector('#invitePhone').value),profileId:document.querySelector('#inviteProfile').value,avatarEmoji:document.querySelector('#inviteAvatar').value,photoData:invitePhotoData,cep:digits(document.querySelector('#inviteCep').value),street:document.querySelector('#inviteStreet').value.trim(),number:document.querySelector('#inviteNumber').value.trim(),complement:document.querySelector('#inviteComplement').value.trim(),district:document.querySelector('#inviteDistrict').value.trim(),city:document.querySelector('#inviteCity').value.trim(),state:document.querySelector('#inviteState').value.trim().toUpperCase()}}
function resetInviteForm(){document.querySelector('#inviteForm').reset();invitePhotoData='';document.querySelector('#avatarPreview').innerHTML='👤'}
document.querySelector('#inviteCpf').addEventListener('input',event=>{const v=digits(event.target.value).slice(0,11);event.target.value=v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')});
document.querySelector('#invitePhone').addEventListener('input',event=>{const v=digits(event.target.value).slice(0,11);event.target.value=v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2')});
const correiosLink=document.querySelector('#correiosLink');correiosLink.outerHTML='<button id="searchCepButton" type="button" style="background:#09090b;color:#fff;border:0;border-radius:9px;padding:0 12px;font-weight:900">🔎 Buscar CEP</button>';document.querySelector('#inviteCep').closest('label').insertAdjacentHTML('beforeend','<small id="cepStatus">Digite o CEP para preencher o endereço automaticamente.</small>');
async function searchCep(){const cep=digits(document.querySelector('#inviteCep').value),button=document.querySelector('#searchCepButton'),status=document.querySelector('#cepStatus');if(cep.length!==8){status.textContent='Informe os 8 números do CEP.';status.style.color='var(--red)';return}button.disabled=true;button.textContent='⏳ Buscando...';button.style.background='var(--amber)';status.textContent='Consultando endereço...';status.style.color='var(--muted)';try{const address=await request(`/address/cep/${cep}`);document.querySelector('#inviteStreet').value=address.street;document.querySelector('#inviteComplement').value=address.complement;document.querySelector('#inviteDistrict').value=address.district;document.querySelector('#inviteCity').value=address.city;document.querySelector('#inviteState').value=address.state;button.textContent='✅ Encontrado';button.style.background='var(--green)';status.textContent='Endereço preenchido. Informe o número e confira os dados.';status.style.color='#08762d';document.querySelector(address.street?'#inviteNumber':'#inviteStreet').focus()}catch(error){button.textContent='🔄 Tentar novamente';button.style.background='var(--red)';status.textContent=`${error.message}. Você pode preencher o endereço manualmente.`;status.style.color='var(--red)'}finally{button.disabled=false}}
document.querySelector('#inviteCep').addEventListener('input',event=>{const v=digits(event.target.value).slice(0,8);event.target.value=v.replace(/(\d{5})(\d)/,'$1-$2');document.querySelector('#cepStatus').textContent=v.length===8?'CEP completo. Buscando endereço...':'Digite o CEP para preencher o endereço automaticamente.';if(v.length===8)searchCep()});document.querySelector('#inviteCep').addEventListener('blur',()=>{if(digits(document.querySelector('#inviteCep').value).length===8&&!document.querySelector('#inviteStreet').value)searchCep()});document.querySelector('#searchCepButton').addEventListener('click',searchCep);
document.querySelector('#inviteAvatar').addEventListener('change',event=>{invitePhotoData='';document.querySelector('#avatarPreview').textContent=event.target.value});
document.querySelector('#invitePhoto').addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;if(file.size>150*1024){notify('🔴 Foto acima de 150 KB');event.target.value='';return}const reader=new FileReader();reader.onload=()=>{invitePhotoData=reader.result;document.querySelector('#avatarPreview').innerHTML=`<img src="${invitePhotoData}" alt="Prévia da foto">`};reader.readAsDataURL(file)});
document.querySelectorAll('#emojiGallery button').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#profileEmoji').value=button.textContent;notify(`${button.textContent} Emoji selecionado`)}));
const existingToken=sessionStorage.getItem('gfp_token');
if(existingToken) loadRealProfile(existingToken).catch(()=>sessionStorage.removeItem('gfp_token'));

