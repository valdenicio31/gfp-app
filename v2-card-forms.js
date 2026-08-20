'use strict';
let currentCardScope='family';
const cardSafe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cardDate=value=>{const parts=String(value||'').slice(0,10).split('-');return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:'data pendente'};

function renderRealCards(cards,purchases,scope){
  currentCardScope=scope;
  const totalLimit=cards.reduce((sum,item)=>sum+Number(item.limit_cents||0),0);
  const totalInvoice=cards.reduce((sum,item)=>sum+Number(item.invoice_cents||0),0);
  const usage=totalLimit?totalInvoice/totalLimit*100:0;
  const state=usage>=75?['red','🔴','Risco elevado']:usage>=50?['yellow','🟡','Atenção moderada']:['green','🟢','Uso saudável'];
  document.querySelector('#cardsScopeLabel').textContent=scope==='family'?'Dados reais consolidados da família':'Dados reais dos seus cartões';
  document.querySelector('#cardsRisk').className='cards-risk '+state[0];
  document.querySelector('#cardsRisk').textContent=state[1]+' '+state[2];
  document.querySelector('#cardsKpis').innerHTML=[
    [state[1],'Fatura atual',money(totalInvoice),'Compras registradas'],
    ['🟢','Limite disponível',money(Math.max(totalLimit-totalInvoice,0)),totalLimit?Math.max(0,100-usage).toFixed(0)+'% livre':'Cadastre um cartão'],
    ['🟡','Uso do limite',usage.toFixed(1).replace('.',',')+'%','Meta recomendada: até 40%'],
    ['🔮','Compras parceladas',String(purchases.filter(item=>Number(item.installments)>1).length),'Até 48 parcelas']
  ].map((item,index)=>'<article class="card-kpi" style="--signal:'+(index===0||index===2?(usage>=75?'var(--red)':'var(--amber)'):'var(--green)')+'"><span>'+item[0]+' '+item[1]+'</span><b>'+item[2]+'</b><small>'+item[3]+'</small></article>').join('');

  const markup=cards.length?cards.map(item=>{const limit=Number(item.limit_cents||0),invoice=Number(item.invoice_cents||0),percent=limit?invoice/limit*100:0,signal=percent>=75?['red','🔴']:percent>=50?['yellow','🟡']:['green','🟢'];return '<div class="card-account" style="--signal:var(--'+signal[0]+')"><div class="card-account-head"><b>'+signal[1]+' '+cardSafe(item.name)+' •••• '+cardSafe(item.last_four)+'</b><small>'+cardSafe(item.owner_name)+'</small></div><div class="card-account-values"><span>Fatura <b>'+money(invoice)+'</b></span><span>Limite <b>'+money(limit)+'</b></span><span>Disponível <b>'+money(Math.max(limit-invoice,0))+'</b></span></div><div class="usage-track"><i style="width:'+Math.min(percent,100)+'%;--signal:var(--'+signal[0]+')"></i></div><small>'+percent.toFixed(0)+'% utilizado • fecha dia '+item.closing_day+' • vence dia '+item.due_day+'</small></div>'}).join(''):'<div class="card-alert-item green">🟢 Nenhum cartão cadastrado.</div>';
  document.querySelector('#cardList').innerHTML=markup;
  document.querySelector('#realCardList').innerHTML=markup;
  document.querySelector('#purchaseCard').innerHTML='<option value="">Selecione o cartão</option>'+cards.map(item=>'<option value="'+cardSafe(item.id)+'">'+cardSafe(item.name)+' •••• '+cardSafe(item.last_four)+'</option>').join('');
  document.querySelector('#realCardPurchases').innerHTML=purchases.length?purchases.slice(0,12).map(item=>'<div><span><b>'+cardSafe(item.description)+'</b><small>'+cardSafe(item.card_name)+' • '+cardDate(item.purchased_on)+' • '+item.installments+'x de '+money(item.installment_cents)+'</small></span><strong>'+money(item.amount_cents)+'</strong></div>').join(''):'Nenhuma compra registrada.';

  const categories={};
  purchases.forEach(item=>categories[item.category]=(categories[item.category]||0)+Number(item.amount_cents||0));
  const categoryRows=Object.entries(categories).sort((a,b)=>b[1]-a[1]),maxCategory=Math.max(1,...categoryRows.map(item=>item[1]));
  document.querySelector('#cardCategories').innerHTML=categoryRows.length?categoryRows.map(item=>'<div class="category-row"><span>🛍️</span><div><b>'+cardSafe(item[0])+'</b><div class="category-track"><i style="width:'+(item[1]/maxCategory*100)+'%"></i></div></div><strong>'+money(item[1])+'</strong></div>').join(''):'<small>Sem categorias registradas.</small>';
  document.querySelector('#cardAlerts').innerHTML=cards.length?cards.map(item=>{const percent=Number(item.limit_cents)?Number(item.invoice_cents)/Number(item.limit_cents)*100:0,alert=percent>=75?['red','🔴','Evite novas compras até o fechamento.']:percent>=50?['yellow','🟡','Acompanhe o limite antes de novas compras.']:['green','🟢','Uso dentro da faixa saudável.'];return '<div class="card-alert-item '+alert[0]+'">'+alert[1]+' <b>'+cardSafe(item.name)+' em '+percent.toFixed(0)+'%</b><br><small>'+alert[2]+'</small></div>'}).join(''):'<div class="card-alert-item green">🟢 Cadastre o primeiro cartão.</div>';

  const members={};
  purchases.forEach(item=>members[item.owner_name]=(members[item.owner_name]||0)+Number(item.installment_cents||0));
  const memberRows=Object.entries(members).sort((a,b)=>b[1]-a[1]),memberTotal=memberRows.reduce((sum,item)=>sum+item[1],0);
  document.querySelector('#memberCardUsage').innerHTML=memberRows.length?memberRows.map(item=>'<div class="member-use"><div><b>👤 '+cardSafe(item[0])+'</b><small>'+(memberTotal?item[1]/memberTotal*100:0).toFixed(0)+'% da fatura</small></div><em>'+money(item[1])+'</em></div>').join(''):'<small>Sem compras para demonstrar.</small>';

  const months={};
  purchases.forEach(item=>{const raw=String(item.purchased_on||'').slice(0,10);if(!raw)return;const start=new Date(raw+'T12:00:00'),count=Math.min(48,Number(item.installments||1));for(let i=0;i<count;i++){const date=new Date(start.getFullYear(),start.getMonth()+i,1),key=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');months[key]=(months[key]||0)+Number(item.installment_cents||0)}});
  const now=new Date(),nowKey=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const future=Object.entries(months).filter(item=>item[0]>=nowKey).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,4);
  document.querySelector('#futureInvoices').innerHTML=future.length?future.map((item,index)=>'<div class="future-row"><span>'+(index===0?'🟡':'🟢')+' '+item[0].split('-').reverse().join('/')+'</span><b>'+money(item[1])+'</b><small>projeção das parcelas</small></div>').join(''):'<small>Sem parcelas futuras.</small>';
}

async function loadCards(scope='family',role){
  currentCardScope=scope;
  const [cards,purchases]=await Promise.all([request('/cards?scope='+scope,{headers:authHeaders()}),request('/card-purchases?scope='+scope,{headers:authHeaders()})]);
  document.querySelector('#cardCreatePanel').hidden=role?!['admin','adult'].includes(role):false;
  renderRealCards(cards,purchases,scope);
}
window.loadGfpCards=loadCards;

function loadDemoCards(profile='admin'){
  document.querySelector('#cardCreatePanel').hidden=!['admin','adult'].includes(profile);
  document.querySelector('#realCardList').innerHTML=familyCards.map(item=>'<div><b>💳 '+cardSafe(item.name)+' •••• '+cardSafe(item.last)+'</b><strong>'+item.limit.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'</strong></div>').join('');
  document.querySelector('#purchaseCard').innerHTML='<option value="">Selecione o cartão</option>'+familyCards.map((item,index)=>'<option value="demo-'+index+'">'+cardSafe(item.name)+' •••• '+cardSafe(item.last)+'</option>').join('');
  document.querySelector('#realCardPurchases').innerHTML='<small>Modo demonstração: registre uma compra para atualizar a fatura simulada.</small>';
}

const baseLoadRealProfile=loadRealProfile;
loadRealProfile=async function(token){
  const result=await baseLoadRealProfile(token);
  const profile=await request('/me',{headers:{Authorization:'Bearer '+token}});
  window.currentProfileRole=profile.role;
  await loadCards(profile.role==='admin'?'family':'self',profile.role);
  return result;
};

document.querySelector('#demoButton').addEventListener('click',()=>loadDemoCards('admin'));
roleSelect.addEventListener('change',()=>{if(window.demoMode)loadDemoCards(roleSelect.value)});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{if(!window.demoMode)loadCards(button.dataset.view==='private'?'self':'family',window.currentProfileRole).catch(error=>notify('🔴 '+error.message))}));

const previewInstallments=()=>{const amount=Number(document.querySelector('#purchaseAmount').value||0),count=Math.max(1,Number(document.querySelector('#purchaseInstallments').value||1));document.querySelector('#installmentPreview').textContent=amount>0?count+'x de '+(amount/count).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' • total '+amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Informe o valor e a quantidade de parcelas.'};
document.querySelector('#purchaseDate').value=new Date().toISOString().slice(0,10);
document.querySelector('#purchaseAmount').addEventListener('input',previewInstallments);
document.querySelector('#purchaseInstallments').addEventListener('input',previewInstallments);

document.querySelector('#cardForm').addEventListener('submit',async event=>{event.preventDefault();const payload={name:document.querySelector('#cardName').value.trim(),brand:document.querySelector('#cardBrand').value,lastFour:document.querySelector('#cardLastFour').value.replace(/\D/g,''),limitCents:Math.round(Number(document.querySelector('#cardLimit').value)*100),closingDay:Number(document.querySelector('#cardClosingDay').value),dueDay:Number(document.querySelector('#cardDueDay').value)};if(window.demoMode){familyCards.push({name:payload.name,last:payload.lastFour,owner:profiles[roleSelect.value].name,limit:payload.limitCents/100,invoice:0,due:payload.dueDay,close:payload.closingDay});event.target.reset();renderCardDashboard(roleSelect.value==='admin'?'family':'private');loadDemoCards(roleSelect.value);notify('🟢 Cartão simulado cadastrado');return}try{await request('/cards',{method:'POST',headers:authHeaders(),body:JSON.stringify(payload)});event.target.reset();await loadCards(currentCardScope,window.currentProfileRole);notify('🟢 Cartão cadastrado com sucesso')}catch(error){notify('🔴 '+error.message)}});

document.querySelector('#purchaseForm').addEventListener('submit',async event=>{event.preventDefault();const payload={cardId:document.querySelector('#purchaseCard').value,description:document.querySelector('#purchaseDescription').value.trim(),category:document.querySelector('#purchaseCategory').value,amountCents:Math.round(Number(document.querySelector('#purchaseAmount').value)*100),installments:Number(document.querySelector('#purchaseInstallments').value),purchasedOn:document.querySelector('#purchaseDate').value};if(window.demoMode){const index=Number(payload.cardId.replace('demo-',''));if(!Number.isInteger(index)||!familyCards[index]){notify('🔴 Selecione um cartão');return}familyCards[index].invoice+=payload.amountCents/100/payload.installments;event.target.reset();document.querySelector('#purchaseInstallments').value=1;document.querySelector('#purchaseDate').value=new Date().toISOString().slice(0,10);previewInstallments();renderCardDashboard(roleSelect.value==='admin'?'family':'private');notify('🟢 Compra simulada registrada');return}try{await request('/card-purchases',{method:'POST',headers:authHeaders(),body:JSON.stringify(payload)});event.target.reset();document.querySelector('#purchaseInstallments').value=1;document.querySelector('#purchaseDate').value=new Date().toISOString().slice(0,10);previewInstallments();await loadCards(currentCardScope,window.currentProfileRole);notify('🟢 Compra registrada e fatura atualizada')}catch(error){notify('🔴 '+error.message)}});

const sessionToken=sessionStorage.getItem('gfp_token');
if(sessionToken)request('/me',{headers:{Authorization:'Bearer '+sessionToken}}).then(profile=>{window.currentProfileRole=profile.role;return loadCards(profile.role==='admin'?'family':'self',profile.role)}).catch(()=>{});
