const monthData={
'2026-08':{balance:12500,income:20000,expense:7500,saving:62.5,budgets:[['Moradia',3200,3200,'green'],['Alimentação',2480,2200,'yellow'],['Transporte',1350,1800,'green'],['Cartões',4300,5000,'yellow'],['Lazer',1680,1200,'red']]},
'2026-07':{balance:9200,income:17800,expense:8600,saving:51.7,budgets:[['Moradia',3200,3200,'green'],['Alimentação',2100,2200,'green'],['Transporte',1950,1800,'yellow'],['Cartões',4800,5000,'yellow'],['Lazer',980,1200,'green']]},
'2026-06':{balance:6400,income:16200,expense:9800,saving:39.5,budgets:[['Moradia',3200,3200,'green'],['Alimentação',2750,2200,'red'],['Transporte',1700,1800,'green'],['Cartões',5400,5000,'red'],['Lazer',1450,1200,'red']]}}
function renderMonth(key){const data=monthData[key];const cards=document.querySelectorAll('.kpis .card strong');cards[0].textContent=data.balance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});cards[1].textContent=data.income.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});cards[2].textContent=data.expense.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});cards[3].textContent=`${data.saving.toLocaleString('pt-BR')}%`;document.querySelector('#budgetRows').innerHTML=data.budgets.map(([n,v,m,c])=>`<div class="budget-row"><span>${n}</span><div class="track"><div class="fill ${c}" style="width:${Math.min(v/m*100,100)}%"></div></div><strong>R$ ${v.toLocaleString('pt-BR')} / ${m.toLocaleString('pt-BR')}</strong></div>`).join('')}
renderMonth('2026-08');document.querySelector('#monthSelect').addEventListener('change',event=>renderMonth(event.target.value));
const members=[['AD','Alex Demo','Administrador','R$ 5.000'],['JD','Jordan Demo','Adulto','R$ 3.500'],['DD','Dependente Demo','Dependente','R$ 500'],['CO','Convidado Demo','Somente leitura','—']];
document.querySelector('#members').innerHTML=members.map(([i,n,p,v])=>`<div class="member"><span class="pic">${i}</span><span><b>${n}</b><small>${p}</small></span><em>${v}</em></div>`).join('');

const profiles={
  admin:{name:'Alex',permission:'Acesso total e gestão da licença'},
  adult:{name:'Jordan',permission:'Lançamentos e visão familiar'},
  dependent:{name:'Dependente',permission:'Mesada, metas e visão limitada'},
  viewer:{name:'Convidado',permission:'Consulta sem alterações'}
};
const loginScreen=document.querySelector('#loginScreen');
const roleSelect=document.querySelector('#roleSelect');
const permissionLabel=document.querySelector('#permissionLabel');
const toast=document.querySelector('#toast');
function notify(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)}
function enter(profile='admin'){
  roleSelect.value=profile;
  permissionLabel.textContent=profiles[profile].permission;
  document.querySelector('header h1').textContent=`Bom dia, ${profiles[profile].name}! 👋`;
  loginScreen.classList.add('hidden');
  window.demoMode=true;loadDemoAdmin(profile);
  notify(`Perfil ${profiles[profile].name} carregado com segurança`);
}
document.querySelector('#loginForm').addEventListener('submit',event=>{event.preventDefault();enter('admin')});
document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>enter(button.dataset.profile)));
roleSelect.addEventListener('change',()=>enter(roleSelect.value));
document.querySelector('#logoutButton').addEventListener('click',()=>loginScreen.classList.remove('hidden'));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-view]').forEach(item=>item.classList.toggle('selected',item===button));
  const privateView=button.dataset.view==='private';
  document.querySelector('header p').textContent=privateView?'Somente seus dados pessoais estão visíveis nesta tela.':'Sua família está financeiramente estável, com 3 pontos de atenção.';
  notify(privateView?'🔒 Visão privada ativada':'👨‍👩‍👧‍👦 Visão familiar ativada');
  if(!window.demoMode&&typeof loadFinance==='function') loadFinance(privateView?'self':'family');
}));

function loadDemoAdmin(profile){
 const defaults=[['👑','Administrador','admin','p-admin'],['👤','Adulto','adult','p-adult'],['🧒','Dependente','dependent','p-dependent'],['👁️','Somente leitura','viewer','p-viewer']];
 document.querySelector('#profileList').innerHTML=defaults.map(([e,n,r])=>`<div class="profile-chip"><span>${e}</span><b>${n}</b><small>${r==='admin'?'Único administrador':'perfil padrão'}</small></div>`).join('');
 document.querySelector('#inviteProfile').innerHTML='<option value="">Selecione um perfil</option>'+defaults.filter(x=>x[2]!=='admin').map(([e,n,,id])=>`<option value="${id}">${e} ${n}</option>`).join('');
 const demoMembers=[['👑','Alex Demo','Administrador titular'],['👤','Jordan Demo','Adulto'],['🧒','Dependente Demo','Dependente'],['👁️','Convidado Demo','Somente leitura']];document.querySelector('#memberCount').textContent=demoMembers.length;document.querySelector('#realMembers').innerHTML=demoMembers.map(([e,n,p])=>`<div><b>${e} ${n}</b><strong>${p}</strong></div>`).join('');
 if(profile!=='admin'){document.querySelectorAll('[data-view]').forEach(b=>b.hidden=b.dataset.view==='family');document.querySelector('[data-view="private"]').click();document.querySelector('[data-module="users"]').disabled=true;document.querySelector('[data-module="profiles"]').disabled=true;}
}
document.querySelectorAll('.sidebar nav button').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.sidebar nav button').forEach(item=>item.classList.toggle('active',item===button));
  notify(`${button.textContent.trim()}: módulo preparado para a próxima etapa`);
}));
