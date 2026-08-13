const budgets=[['Moradia',3200,3200,'green'],['Alimentação',2480,2200,'yellow'],['Transporte',1350,1800,'green'],['Cartões',4300,5000,'yellow'],['Lazer',1680,1200,'red']];
document.querySelector('#budgetRows').innerHTML=budgets.map(([n,v,m,c])=>`<div class="budget-row"><span>${n}</span><div class="track"><div class="fill ${c}" style="width:${Math.min(v/m*100,100)}%"></div></div><strong>R$ ${v.toLocaleString('pt-BR')} / ${m.toLocaleString('pt-BR')}</strong></div>`).join('');
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
}));
document.querySelectorAll('.sidebar nav button').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.sidebar nav button').forEach(item=>item.classList.toggle('active',item===button));
  notify(`${button.textContent.trim()}: módulo preparado para a próxima etapa`);
}));
