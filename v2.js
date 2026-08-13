const monthData={
'2026-08':{balance:12500,income:20000,expense:7500,saving:62.5,budgets:[['Moradia',3200,3200,'green'],['Alimentação',2480,2200,'yellow'],['Transporte',1350,1800,'green'],['Cartões',4300,5000,'yellow'],['Lazer',1680,1200,'red']]},
'2026-07':{balance:9200,income:17800,expense:8600,saving:51.7,budgets:[['Moradia',3200,3200,'green'],['Alimentação',2100,2200,'green'],['Transporte',1950,1800,'yellow'],['Cartões',4800,5000,'yellow'],['Lazer',980,1200,'green']]},
'2026-06':{balance:6400,income:16200,expense:9800,saving:39.5,budgets:[['Moradia',3200,3200,'green'],['Alimentação',2750,2200,'red'],['Transporte',1700,1800,'green'],['Cartões',5400,5000,'red'],['Lazer',1450,1200,'red']]}}
const monthLabels={'2026-06':'Junho','2026-07':'Julho','2026-08':'Agosto'};
function moneyShort(value){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value)}
function renderComparison(selectedKey){const ceiling=Math.max(...Object.values(monthData).flatMap(item=>[item.income,item.expense]));document.querySelector('#comparisonChart').innerHTML=Object.keys(monthData).sort().map(key=>{const data=monthData[key];const net=data.income-data.expense;return `<div class="month-group ${key===selectedKey?'selected':''}"><div class="bar-pair"><div class="chart-bar income" style="height:${data.income/ceiling*88}%"><b>${moneyShort(data.income)}</b></div><div class="chart-bar expense" style="height:${data.expense/ceiling*88}%"><b>${moneyShort(data.expense)}</b></div></div><div class="month-label">${monthLabels[key]}${key===selectedKey?' 🟡':''}<small>Saldo +${moneyShort(net)}</small></div></div>`}).join('')}
const bankScenarios=[{name:'Nubank',icon:'Nu',cdi:100,color:'#820ad1',product:'Caixinha simulada'},{name:'Mercado Pago',icon:'MP',cdi:105,color:'#00a8e0',product:'Saldo remunerado simulado'},{name:'PagBank',icon:'PB',cdi:110,color:'#ffbf00',product:'CDB simulado'}];
function renderInvestments(){const principal=Math.max(100,Number(document.querySelector('#investmentAmount').value)||100),months=Number(document.querySelector('#investmentMonths').value),baseCdi=.105;const results=bankScenarios.map(bank=>{const annualRate=baseCdi*bank.cdi/100,total=principal*Math.pow(1+annualRate,months/12);return {...bank,annualRate,total,gain:total-principal}}).sort((a,b)=>b.total-a.total);document.querySelector('#bankComparison').innerHTML=results.map((bank,index)=>`<article class="bank-card ${index===0?'winner':''}" style="--bank:${bank.color}">${index===0?'<span class="best-badge">🏆 Melhor cenário</span>':''}<div class="bank-head"><i>${bank.icon}</i><div><h3>${bank.name}</h3><small>${bank.product}</small></div></div><strong>${bank.cdi}% do CDI</strong><div class="bank-result"><span>Valor final</span><b>${bank.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b><small>🟢 +${bank.gain.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} bruto</small></div><div class="rate-line"><span>Taxa anual simulada</span><b>${(bank.annualRate*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</b></div></article>`).join('');const best=results[0],difference=best.total-results[results.length-1].total;document.querySelector('#investmentTip').innerHTML=`💡 <b>Incentivo GFP:</b> neste cenário, <strong>${best.name}</strong> apresenta o maior percentual do CDI e renderia <strong>${moneyShort(difference)}</strong> a mais que a menor simulação no período.`}
function renderMonth(key){const data=monthData[key];const cards=document.querySelectorAll('.kpis .card strong');cards[0].textContent=data.balance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});cards[1].textContent=data.income.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});cards[2].textContent=data.expense.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});cards[3].textContent=`${data.saving.toLocaleString('pt-BR')}%`;document.querySelector('#budgetRows').innerHTML=data.budgets.map(([n,v,m,c])=>`<div class="budget-row"><span>${n}</span><div class="track"><div class="fill ${c}" style="width:${Math.min(v/m*100,100)}%"></div></div><strong>R$ ${v.toLocaleString('pt-BR')} / ${m.toLocaleString('pt-BR')}</strong></div>`).join('');renderComparison(key)}
renderMonth('2026-08');renderInvestments();document.querySelector('#monthSelect').addEventListener('change',event=>renderMonth(event.target.value));document.querySelector('#investmentAmount').addEventListener('input',renderInvestments);document.querySelector('#investmentMonths').addEventListener('change',renderInvestments);
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
 document.querySelectorAll('[data-open-module]').forEach(button=>button.disabled=profile!=='admin');
 if(profile!=='admin'){document.querySelectorAll('[data-view]').forEach(b=>b.hidden=b.dataset.view==='family');document.querySelector('[data-view="private"]').click();document.querySelector('[data-module="users"]').disabled=true;document.querySelector('[data-module="profiles"]').disabled=true;}
}
document.querySelectorAll('.sidebar nav button:not([data-open-module])').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.sidebar nav button').forEach(item=>item.classList.toggle('active',item===button));
  notify(`${button.textContent.trim()}: módulo preparado para a próxima etapa`);
}));
function openAdminModule(module){const tab=document.querySelector(`[data-module="${module}"]`);if(!tab||tab.disabled)return;tab.click();document.querySelector('#familyAdmin').scrollIntoView({behavior:'smooth',block:'start'});notify(module==='users'?'➕ Cadastro de usuários aberto':'🛡️ Cadastro de perfis aberto')}
document.querySelectorAll('[data-open-module]').forEach(button=>button.addEventListener('click',()=>openAdminModule(button.dataset.openModule)));
