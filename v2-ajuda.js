/* Manual de operação do GFP Familiar, dentro do próprio sistema.
   O conteúdo fica neste arquivo em forma de dados: cada seção tem título, texto,
   passos, dicas e a imagem da tela. Assim dá para procurar, imprimir e crescer
   sem mexer no desenho da tela. */

const MANUAL = [
  {
    id: 'comecar', titulo: 'Como começar', emoji: '🚀',
    resumo: 'Do primeiro acesso ao primeiro lançamento, na ordem que dá menos trabalho.',
    imagem: 'ajuda/entrar.webp', legenda: 'A tela de entrada: quem já tem conta usa "Entrar"; quem está começando usa "Criar família".',
    passos: [
      'Na tela de entrada, escolha <b>Criar família</b> e informe seu nome, o nome da família, seu e-mail e uma senha de pelo menos 10 caracteres.',
      'Quem cria a família entra como <b>administrador</b>: só esse perfil cadastra usuários e define permissões.',
      'Vá em <b>Cadastros</b> e cadastre suas contas — a conta do banco, a poupança, o dinheiro da carteira. Nada funciona sem pelo menos uma conta, porque todo lançamento precisa dizer de onde o dinheiro saiu ou entrou.',
      'Vá em <b>Lançamentos → Importar extrato</b> e jogue o arquivo que você baixa do banco. Em segundos você tem meses de histórico já classificado.',
      'Cadastre no <b>Calendário</b> as contas que se repetem (aluguel, escola, internet) e no <b>Metas</b> os limites de gasto do mês.',
      'Volte para a <b>Central</b>: os painéis já estarão cheios com os seus números.'
    ],
    dicas: [
      'A ordem importa: contas → extrato → agenda → metas. Fazer nessa sequência evita retrabalho.',
      'Quer só olhar antes de se cadastrar? O botão <b>Conhecer demonstração</b> abre o sistema com dados de exemplo. Nada do que você fizer nesse modo é gravado.'
    ]
  },
  {
    id: 'central', titulo: 'Central: o painel da família', emoji: '🏠',
    resumo: 'A primeira tela. Tudo aqui é calculado dos seus lançamentos — não existe número fixo.',
    imagem: 'ajuda/central.webp', legenda: 'A Central mostra saldo, o que entrou e saiu no mês, e a comparação com o mês anterior.',
    passos: [
      'Os cinco cartões do topo são o resumo: <b>saldo somando as contas</b>, <b>entrou no mês</b>, <b>saiu no mês</b>, <b>sobrou (ou faltou)</b> e <b>contas a pagar em aberto</b>.',
      'A seta ▲▼ compara com o mês anterior. Ela fica verde quando a variação é boa para aquele número: receita subindo é verde, despesa subindo é vermelho.',
      'O gráfico <b>Entrou x saiu</b> mostra os doze meses até o mês escolhido, e mais abaixo o mesmo comparativo ano a ano.',
      '<b>Para onde foi o dinheiro</b> quebra as despesas por categoria; <b>Quem mais recebeu</b> quebra por fornecedor.',
      'Use ◀ ▶ para navegar entre os meses e <b>Hoje</b> para voltar ao mês corrente. O botão <b>Atualizar</b> recarrega na hora.'
    ],
    dicas: [
      'Cada vez que você abre a Central ela busca os números do servidor. Lançou algo agora? Volte para a Central e já aparece.',
      'O saldo das contas é sempre o saldo de <b>hoje</b>, mesmo quando você está olhando um mês passado — é o dinheiro que existe agora.'
    ]
  },
  {
    id: 'alertas', titulo: 'Alertas: o que pede atenção', emoji: '🔔',
    resumo: 'O sistema não inventa aviso: cada alerta aponta para um número que existe.',
    imagem: 'ajuda/central-alertas.webp', legenda: 'Clique em qualquer alerta e o sistema abre a tela onde você resolve aquilo.',
    passos: [
      '🔴 <b>Conta venceu e não foi baixada</b> — tem vencimento na agenda com data passada e ninguém deu baixa.',
      '🔴 <b>Conta está negativa</b> — o saldo de alguma conta ficou abaixo de zero.',
      '🔴 <b>Categoria passou do limite</b> — o gasto do mês naquela categoria ultrapassou o que você planejou em Metas.',
      '🟡 <b>Conta vence nos próximos dias</b> — vencimento nos próximos cinco dias.',
      '🟡 <b>Meta vence em breve</b> — a meta tem prazo em menos de 60 dias e ainda não chegou a 80%.',
      '🟡 <b>Saídas passaram as entradas</b> — o mês fechou (ou está fechando) no vermelho.',
      '🟢 Sem nenhum desses, o painel diz que está tudo em dia.'
    ],
    dicas: ['O número no sininho, no alto da tela, é a contagem desses alertas. Zerou o sininho, zerou a pendência.']
  },
  {
    id: 'cadastros', titulo: 'Cadastros: contas, bancos, fornecedores e categorias', emoji: '🗂️',
    resumo: 'Quatro abas. Tudo é livre: você cria, renomeia e apaga o que quiser.',
    imagem: 'ajuda/cadastros.webp', legenda: 'A aba Contas mostra banco, agência, número e o saldo de cada conta.',
    passos: [
      '<b>Contas</b> — cada conta bancária, poupança, investimento ou o dinheiro em espécie. Pode vincular banco, agência e número da conta.',
      '<b>Bancos e agências</b> — cadastre o banco (com o código, tipo 341 para Itaú) e as agências dentro dele.',
      '<b>Fornecedores e clientes</b> — quem você paga e quem te paga. É aqui que a classificação automática do extrato vai buscar.',
      '<b>Categorias</b> — o sistema já vem com sete prontas, e você cria quantas quiser, com emoji e cor.'
    ],
    dicas: [
      'Renomear uma categoria <b>corrige todos os lançamentos antigos</b> junto. Não precisa sair arrumando um por um.',
      'O sistema não deixa apagar uma conta que tem lançamento, nem uma categoria em uso, sem avisar — é proteção contra perder histórico.'
    ]
  },
  {
    id: 'fornecedores', titulo: 'Fornecedores: ensinando o sistema', emoji: '🏪',
    resumo: 'O campo mais importante do cadastro de fornecedor são os termos de reconhecimento.',
    imagem: 'ajuda/cadastros-parceiros.webp', legenda: 'Cada fornecedor tem categoria e termos — é assim que o extrato se classifica sozinho.',
    passos: [
      'Cadastre o fornecedor com o <b>nome</b> como você quer vê-lo nos relatórios ("Supermercado Extra").',
      'Escolha a <b>categoria</b> dele. Todo lançamento desse fornecedor vai nascer nessa categoria.',
      'Em <b>termos de reconhecimento</b>, coloque os pedaços de texto que aparecem no extrato, separados por ponto e vírgula: <code>extra;superm extra;extra hiper</code>.',
      'Se você tem o CNPJ, cadastre também — muito extrato traz o CNPJ na descrição, e o reconhecimento por CNPJ é o mais certeiro.'
    ],
    dicas: [
      'Não precisa acertar de primeira. Na importação, quando o sistema não reconhecer, ele pergunta — e o que você responder fica gravado para as próximas.',
      'Termo mais específico ganha do mais genérico. Se você tem "extra" e "extra farma", uma linha com "extra farma" vai para o segundo.'
    ]
  },
  {
    id: 'lancamentos', titulo: 'Lançamentos: a tela do dia a dia', emoji: '🧾',
    resumo: 'Todo dinheiro que entra e sai. Filtro por coluna igual ao do Excel.',
    imagem: 'ajuda/lancamentos.webp', legenda: 'Cada linha é um lançamento. O rodapé soma o que está na tela.',
    passos: [
      '<b>Novo lançamento</b> abre o formulário: data, tipo (entrada ou saída), conta, descrição, categoria, fornecedor e valor.',
      'O ✏️ de cada linha altera o lançamento. Ao salvar, o saldo da conta é recalculado — inclusive se você mudou a conta ou o valor.',
      'Marque as caixinhas à esquerda para selecionar linhas. Uma barra roxa aparece com o total selecionado e o botão de excluir em lote.',
      '<b>Excluir</b> tem três caminhos: os marcados, um período inteiro (com resumo antes de confirmar) ou linha por linha.',
      '<b>Exportar CSV</b> baixa exatamente o que está na tela, com os filtros aplicados.'
    ],
    dicas: [
      'O rodapé sempre soma <b>o que está filtrado</b>, não o mês todo. É a forma mais rápida de responder "quanto gastei com isso?".',
      'Toda exclusão pede confirmação e mostra o efeito no saldo antes de acontecer.'
    ]
  },
  {
    id: 'filtros', titulo: 'Filtro por coluna, igual ao Excel', emoji: '🔎',
    resumo: 'Clique no título da coluna e escolha os valores com caixinhas.',
    imagem: 'ajuda/filtro-coluna.webp', legenda: 'A lista traz os valores daquela coluna e quantas linhas tem de cada um.',
    passos: [
      'Clique no <b>título da coluna</b> (Data, Descrição, Conta, Categoria, Valor).',
      'Abre a lista com os valores existentes e a contagem de cada um. Marque um, alguns ou use <b>(Selecionar tudo)</b>.',
      'A coluna Data vem agrupada por ano e mês, então você filtra "Agosto" sem digitar data nenhuma.',
      'Confirme em <b>OK</b>. As etiquetas roxas no topo mostram os filtros ativos; o × de cada uma remove aquele filtro.',
      'Pode empilhar filtros de colunas diferentes — eles se somam.'
    ],
    dicas: ['Com mais de um filtro ativo aparece o botão <b>Limpar todos os filtros</b>, que zera tudo de uma vez.']
  },
  {
    id: 'importar', titulo: 'Importar o extrato do banco', emoji: '📥',
    resumo: 'Arraste o arquivo do banco e o sistema faz o resto — inclusive a classificação.',
    imagem: 'ajuda/importar.webp', legenda: 'Aceita OFX e CSV. Arraste o arquivo ou clique para escolher.',
    passos: [
      'Em Lançamentos, clique em <b>Importar extrato</b>.',
      'Baixe no seu banco o extrato em <b>OFX</b> (o melhor formato) ou <b>CSV</b>. Funciona com Nubank, Itaú, Bradesco, Banco do Brasil, Caixa, Inter, Santander e outros.',
      'Arraste o arquivo para a área indicada e escolha a <b>conta</b> que corresponde àquele extrato.',
      'O sistema mostra a prévia: cada linha com data, descrição, valor, e a <b>categoria e o fornecedor que ele descobriu</b>.',
      'Onde ele não tiver certeza, aparece um aviso para você ensinar. Você responde uma vez e ele aplica em todas as linhas parecidas.',
      'Confirme. Pronto: os lançamentos entram e o saldo se ajusta.'
    ],
    dicas: [
      '<b>Pode importar o mesmo arquivo duas vezes sem medo.</b> O sistema reconhece o que já entrou e não duplica nada.',
      'Importou e depois cadastrou um fornecedor novo? Use <b>Classificar pendentes</b> em Lançamentos para aplicar o cadastro novo nos lançamentos que ficaram sem categoria.',
      'Se o extrato vier com data no formato estranho, o sistema tenta os dois jeitos (dia/mês e mês/dia) e usa o que faz sentido.'
    ]
  },
  {
    id: 'calendario', titulo: 'Calendário: o mês na sua frente', emoji: '📅',
    resumo: 'Tudo que vence, tudo que entra, e um clique para virar lançamento.',
    imagem: 'ajuda/calendario-grade.webp', legenda: 'Vermelho é a pagar, verde é a receber, riscado é o que já foi baixado.',
    passos: [
      'Cada dia mostra o que acontece nele: contas previstas, fatura de cartão, prazo de meta e a contagem de lançamentos.',
      'Vermelho cheio quer dizer que <b>venceu e ninguém pagou</b>. Riscado quer dizer que já foi baixado.',
      'Clique em qualquer dia e abre o detalhe, com o botão de pagar ou receber ao lado de cada previsão.',
      'Abaixo da grade, <b>Vencimentos em aberto neste mês</b> lista tudo em ordem de data, com o botão para dar baixa.',
      'Use ◀ ▶ para andar nos meses e <b>Hoje</b> para voltar.'
    ],
    dicas: ['Um aviso vermelho no topo conta quantas contas venceram sem baixa, para você não descobrir isso pelo juro do banco.']
  },
  {
    id: 'previstas', titulo: 'Contas previstas e recorrência', emoji: '🔁',
    resumo: 'Cadastre uma vez a conta que se repete e ela aparece sozinha todo mês.',
    imagem: 'ajuda/conta-prevista.webp', legenda: 'Uma regra: o que é, quanto é, de qual conta sai e de quanto em quanto tempo repete.',
    passos: [
      'No Calendário, clique em <b>Nova conta prevista</b>.',
      'Escolha o <b>tipo</b>: a pagar (aluguel, escola) ou a receber (salário, aluguel que você recebe).',
      'Informe descrição, valor, categoria, fornecedor e de qual conta o dinheiro sai.',
      'Escolha a <b>repetição</b>: todo mês (e o dia), toda semana (e o dia da semana), uma vez por ano (mês e dia) ou só uma vez.',
      'Se a conta tem fim — a escola acaba em dezembro —, preencha <b>até quando</b>. Depois dessa data ela para de aparecer.'
    ],
    dicas: [
      'Vencimento no dia 31? Em fevereiro ele cai automaticamente no dia 28 (ou 29). Você não precisa fazer nada.',
      'O valor cadastrado é o <b>previsto</b>. Na hora de pagar você pode corrigir para o valor real — a conta de luz nunca vem igual.'
    ]
  },
  {
    id: 'pagar', titulo: 'Pagar com um clique', emoji: '✅',
    resumo: 'A previsão vira lançamento de verdade, com categoria e fornecedor já preenchidos.',
    imagem: 'ajuda/pagar.webp', legenda: 'Confira valor, data e conta. O lançamento nasce com a categoria da previsão.',
    passos: [
      'Clique em <b>Paguei</b> (ou <b>Recebi</b>) no vencimento, na grade do dia ou na lista de vencimentos em aberto.',
      'Confira o <b>valor de verdade</b>, a <b>data em que pagou</b> e a <b>conta</b> de onde saiu.',
      'Confirme. O lançamento é criado, o saldo da conta se mexe, e o vencimento fica marcado como baixado.',
      'Errou? Abra o dia, clique em <b>Desfazer</b>: o lançamento é apagado, o saldo volta ao que era e o vencimento fica em aberto de novo.'
    ],
    dicas: [
      'O mesmo vencimento não pode ser pago duas vezes — o sistema barra.',
      'Baixar o mês de agosto não interfere em setembro. Cada vencimento é independente.'
    ]
  },
  {
    id: 'metas', titulo: 'Metas da família', emoji: '🎯',
    resumo: 'Guardar dinheiro por objetivo, com histórico de quem depositou e quando.',
    imagem: 'ajuda/metas.webp', legenda: 'Cada meta tem barra de progresso, quanto falta e os botões de movimentar.',
    passos: [
      'Em <b>Nova meta</b>, dê um nome ao objetivo, quanto quer juntar, o prazo (opcional) e um ícone.',
      '<b>Depositar</b> soma dinheiro na meta e grava quem fez, quando e a observação.',
      '<b>Retirar</b> tira dinheiro. O sistema não deixa retirar mais do que existe na meta.',
      '<b>Movimentos</b> abre o histórico completo daquela meta.',
      'Quando o valor guardado chega no objetivo, a meta fica verde com "Meta alcançada 🎉".'
    ],
    dicas: ['Metas são um controle de intenção, separado do saldo da conta. Elas não movem dinheiro entre contas.']
  },
  {
    id: 'orcamento', titulo: 'Orçamento do mês', emoji: '📊',
    resumo: 'Quanto pode gastar em cada categoria — comparado com o que você já gastou.',
    imagem: 'ajuda/orcamento.webp', legenda: 'Verde até 75%, amarelo de 75% a 99%, vermelho quando passa de 100%.',
    passos: [
      'Em <b>Definir limite</b>, escolha a categoria e quanto a família pode gastar nela naquele mês.',
      'A barra ao lado compara o limite com <b>o que já saiu nos seus lançamentos</b> — você não digita o realizado, ele vem sozinho.',
      'Use ◀ ▶ para definir ou revisar os limites de outros meses.',
      'O ✏️ altera o limite; a 🗑️ tira a categoria do orçamento daquele mês.'
    ],
    dicas: [
      'O limite vale para um mês só. Cada mês tem os seus, e você pode ajustar conforme a vida muda.',
      'Categoria estourando o limite gera alerta vermelho na Central automaticamente.'
    ]
  },
  {
    id: 'reserva', titulo: 'Reserva de emergência', emoji: '🛟',
    resumo: 'O colchão da família para o imprevisto.',
    imagem: 'ajuda/reserva.webp', legenda: 'Alvo, aporte mensal, e em quantos meses você chega lá nesse ritmo.',
    passos: [
      'Em <b>Criar reserva</b>, informe quanto a família quer ter guardado e quanto pretende aportar por mês.',
      'Deposite e retire pelos botões do cartão, do mesmo jeito das metas.',
      'O sistema calcula sozinho quantos meses faltam para chegar no alvo, no ritmo que você planejou.'
    ],
    dicas: ['A recomendação mais comum é juntar de três a seis meses da despesa da família. Some as saídas de um mês na Central e multiplique.']
  },
  {
    id: 'cartoes', titulo: 'Cartões de crédito', emoji: '💳',
    resumo: 'Limite, fatura e o que cada membro da família comprou.',
    imagem: 'ajuda/cartoes.webp', legenda: 'O painel mostra o limite comprometido, a fatura do mês e a participação de cada membro.',
    passos: [
      'Em <b>Cartões</b>, cadastre nome, bandeira, últimos quatro dígitos, limite, dia de fechamento e dia de vencimento.',
      'Registre as compras com valor, categoria e número de parcelas. O sistema divide as parcelas na fatura.',
      'O painel mostra o quanto do limite está comprometido e a participação de cada membro na fatura.',
      'O vencimento do cartão aparece automaticamente no Calendário.'
    ],
    dicas: ['Cada adulto vê e lança no próprio cartão; o administrador vê os cartões de toda a família.']
  },
  {
    id: 'usuarios', titulo: 'Usuários e perfis', emoji: '👥',
    resumo: 'Quatro níveis de acesso, para cada um ver só o que deve ver.',
    imagem: 'ajuda/usuarios.webp', legenda: 'O administrador cadastra o familiar e escolhe o perfil; a senha quem cria é o próprio familiar.',
    passos: [
      '<b>Administrador</b> — vê tudo da família, cadastra usuários, define perfis e cuida da licença. Só existe um.',
      '<b>Adulto</b> — lança, importa, cadastra e cria metas. Vê as contas da família que não estão marcadas como privadas.',
      '<b>Dependente</b> — lança os próprios gastos e vê só o que é dele. Bom para filho adolescente.',
      '<b>Somente leitura</b> — olha, não mexe.',
      'Em <b>Cadastrar usuário</b>, o administrador preenche os dados e escolhe o perfil. O familiar recebe o convite e cria a própria senha.'
    ],
    dicas: ['Conta marcada como <b>privada</b> só aparece para quem é dono dela — nem o administrador vê.']
  },
  {
    id: 'celular', titulo: 'Instalar no celular', emoji: '📱',
    resumo: 'O GFP funciona como aplicativo no seu telefone, sem passar por loja.',
    imagem: 'ajuda/celular.webp', legenda: 'A mesma tela, ajustada para o telefone.',
    passos: [
      '<b>Android (Chrome)</b> — abra o site, toque no menu ⋮ e escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.',
      '<b>iPhone (Safari)</b> — abra o site, toque no botão de compartilhar e escolha <b>Adicionar à Tela de Início</b>.',
      'O ícone aparece junto dos outros aplicativos e abre em tela cheia, sem a barra do navegador.'
    ],
    dicas: ['Instalado ou no navegador, é o mesmo sistema e os mesmos dados. Dá para começar no computador e continuar no celular.']
  },
  {
    id: 'seguranca', titulo: 'Segurança e privacidade', emoji: '🔒',
    resumo: 'Como os dados da sua família ficam guardados.',
    passos: [
      'Cada família só vê os próprios dados. Não existe forma de um usuário alcançar dados de outra família.',
      'A senha nunca é guardada em texto — o que fica salvo é um resumo criptográfico que não volta atrás.',
      'A sessão expira depois de 8 horas, pedindo login de novo.',
      'Esqueceu a senha? Use <b>Primeiro acesso</b> / recuperação na tela de entrada: chega um link no seu e-mail, válido por tempo limitado.',
      'Toda comunicação entre o seu navegador e o servidor é criptografada (HTTPS).'
    ],
    dicas: ['Use uma senha que você não usa em outro lugar. Como aqui tem informação financeira, vale o cuidado extra.']
  },
  {
    id: 'problemas', titulo: 'Quando algo dá errado', emoji: '🛠️',
    resumo: 'Os tropeços mais comuns e o que fazer.',
    passos: [
      '<b>A primeira tela demora para carregar</b> — o servidor hiberna quando fica sem uso e leva até um minuto para acordar. Da segunda vez em diante é rápido.',
      '<b>A tela parece antiga depois de uma atualização</b> — segure <kbd>Ctrl</kbd> e aperte <kbd>F5</kbd> (no Mac, <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>).',
      '<b>Aparece um aviso vermelho "não consegui carregar"</b> — clique em <b>Tentar de novo</b>. Se insistir, é sinal de internet instável ou servidor acordando.',
      '<b>A importação recusou o arquivo</b> — confirme que é OFX ou CSV de extrato. Alguns bancos entregam PDF, que não serve; procure a opção de exportar em OFX.',
      '<b>Um lançamento veio sem categoria</b> — cadastre o fornecedor em Cadastros e use <b>Classificar pendentes</b>.',
      '<b>O saldo não bate com o banco</b> — confira se importou o extrato inteiro do período e se não lançou nada duas vezes na mão. O filtro por coluna ajuda a achar duplicidade.'
    ],
    dicas: ['Nada do que você faz aqui é irreversível sem aviso. Toda exclusão mostra antes o que vai apagar e o efeito no saldo.']
  }
];

const aju = { atual: MANUAL[0].id, busca: '' };

function secoesFiltradas() {
  const termo = aju.busca.trim().toLowerCase();
  if (!termo) return MANUAL;
  const contem = texto => String(texto || '').toLowerCase().includes(termo);
  return MANUAL.filter(secao =>
    contem(secao.titulo) || contem(secao.resumo) ||
    (secao.passos || []).some(contem) || (secao.dicas || []).some(contem));
}

function desenharAjuda() {
  const alvo = document.querySelector('#telaAjuda');
  if (!alvo) return;
  const lista = secoesFiltradas();
  if (lista.length && !lista.some(s => s.id === aju.atual)) aju.atual = lista[0].id;
  const secao = MANUAL.find(s => s.id === aju.atual) || MANUAL[0];

  alvo.innerHTML = `
    <div class="lanc-head">
      <small>AJUDA</small>
      <h2>Manual de operação</h2>
      <p>Como usar cada tela do GFP Familiar, passo a passo, com dicas de quem já tropeçou antes.</p>
    </div>

    <div class="aju-corpo">
      <aside class="aju-indice">
        <label class="aju-busca">${svg('lupa', 'ico-s')}
          <input id="ajuBusca" placeholder="Procurar no manual" value="${seguro(aju.busca)}" autocomplete="off">
        </label>
        ${lista.length
          ? `<nav>${lista.map(item => `
              <button class="${item.id === secao.id ? 'ativa' : ''}" data-secao="${item.id}">
                <i>${item.emoji}</i><span>${seguro(item.titulo)}</span></button>`).join('')}</nav>`
          : '<p class="aju-nada">Nada encontrado. Tente outra palavra.</p>'}
        <div class="aju-rodape">
          <b>Precisa de gente?</b>
          <span>Escreva para <a href="mailto:contato@viaiasolucoes.com">contato@viaiasolucoes.com</a> — respondemos em até 1 dia útil.</span>
        </div>
      </aside>

      <article class="aju-texto">
        <header><i>${secao.emoji}</i><div><h3>${seguro(secao.titulo)}</h3><p>${seguro(secao.resumo)}</p></div></header>

        ${secao.imagem ? `<figure class="aju-figura">
          <img src="${secao.imagem}" alt="Tela: ${seguro(secao.titulo)}" loading="lazy">
          ${secao.legenda ? `<figcaption>${seguro(secao.legenda)}</figcaption>` : ''}
        </figure>` : ''}

        <ol class="aju-passos">${(secao.passos || []).map(passo => `<li><span>${passo}</span></li>`).join('')}</ol>

        ${(secao.dicas || []).length ? `<div class="aju-dicas">
          ${secao.dicas.map(dica => `<div class="aju-dica"><i>💡</i><span>${dica}</span></div>`).join('')}
        </div>` : ''}

        <div class="aju-navega">
          ${anterior(secao) ? `<button data-secao="${anterior(secao).id}">← ${seguro(anterior(secao).titulo)}</button>` : '<span></span>'}
          ${proxima(secao) ? `<button class="frente" data-secao="${proxima(secao).id}">${seguro(proxima(secao).titulo)} →</button>` : '<span></span>'}
        </div>
      </article>
    </div>`;

  ligarEventosAjuda();
}

const indiceDe = secao => MANUAL.findIndex(s => s.id === secao.id);
const anterior = secao => MANUAL[indiceDe(secao) - 1] || null;
const proxima = secao => MANUAL[indiceDe(secao) + 1] || null;

function ligarEventosAjuda() {
  const tela = document.querySelector('#telaAjuda');
  tela.querySelectorAll('[data-secao]').forEach(botao => botao.addEventListener('click', () => {
    aju.atual = botao.dataset.secao;
    desenharAjuda();
    document.querySelector('#telaAjuda .aju-texto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const busca = tela.querySelector('#ajuBusca');
  if (busca) {
    busca.addEventListener('input', () => {
      aju.busca = busca.value;
      desenharAjuda();
      const campo = document.querySelector('#ajuBusca');
      if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
    });
  }
}

function abrirTelaAjuda() {
  document.body.classList.remove('tela-lancamentos', 'tela-cadastros', 'tela-metas', 'tela-calendario', 'tela-central');
  document.body.classList.add('tela-ajuda');
  document.querySelectorAll('.sidebar nav button').forEach(botao =>
    botao.classList.toggle('active', botao.dataset.tela === 'ajuda'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  desenharAjuda();
}
function fecharTelaAjuda() { document.body.classList.remove('tela-ajuda'); }
window.abrirTelaAjuda = abrirTelaAjuda;
window.abrirAjudaEm = id => { if (MANUAL.some(s => s.id === id)) aju.atual = id; abrirTelaAjuda(); };

document.querySelector('[data-tela="ajuda"]')?.addEventListener('click', abrirTelaAjuda);
document.querySelectorAll('.sidebar nav button:not([data-tela="ajuda"])').forEach(botao =>
  botao.addEventListener('click', fecharTelaAjuda));
