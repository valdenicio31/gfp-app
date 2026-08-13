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
async function loadRealProfile(token){
  const profile=await request('/me',{headers:{Authorization:`Bearer ${token}`}});
  document.querySelector('header small').textContent=`👨‍👩‍👧‍👦 ${profile.family_name.toUpperCase()}`;
  profiles[profile.role]={name:profile.name.split(' ')[0],permission:profiles[profile.role]?.permission||'Acesso familiar'};
  enter(profile.role);
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
const existingToken=sessionStorage.getItem('gfp_token');
if(existingToken) loadRealProfile(existingToken).catch(()=>sessionStorage.removeItem('gfp_token'));
