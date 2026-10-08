/* Cobrança: configuração e conferência da conexão com o Asaas, sem rede. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { configuracaoDaCobranca, testarConexao, registrarCobranca } from '../api/src/cobranca.js';

const SANDBOX = 'https://api-sandbox.asaas.com/v3';
const CHAVE = '$aact_hmlg_exemplo-que-nao-e-chave-de-verdade';
const responder = (status, dados = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => dados });

test('sem chave: não configurada, e nenhuma chamada é feita', async () => {
  let chamou = false;
  const r = await testarConexao({ env: {}, buscar: async () => { chamou = true; } });
  assert.equal(r.configurada, false);
  assert.equal(r.conexao, 'nao_configurada');
  assert.equal(chamou, false);
});

test('sem endereço informado vale o ambiente de testes', () => {
  const c = configuracaoDaCobranca({ ASAAS_API_KEY: CHAVE });
  assert.equal(c.ambiente, 'sandbox');
  assert.equal(c.url, SANDBOX);
  assert.equal(c.problema, null);
});

test('chave de testes com endereço de produção é barrada antes de chamar', async () => {
  let chamou = false;
  const r = await testarConexao({ env: { ASAAS_API_KEY: CHAVE, ASAAS_API_URL: 'https://api.asaas.com/v3' }, buscar: async () => { chamou = true; } });
  assert.equal(r.conexao, 'falhou');
  assert.match(r.motivo, /testes.*produção/);
  assert.equal(chamou, false);
});

test('chave fora do formato é apontada', () => {
  assert.match(configuracaoDaCobranca({ ASAAS_API_KEY: 'abc', ASAAS_API_URL: SANDBOX }).problema, /formato/);
});

test('conexão aceita: manda a chave no cabeçalho certo e não devolve dados da conta', async () => {
  let pedido;
  const buscar = async (url, opcoes) => { pedido = { url, opcoes }; return { status: 200, ok: true, json: async () => ({ companyName: 'Empresa', cpfCnpj: '00000000000000' }) }; };
  const r = await testarConexao({ env: { ASAAS_API_KEY: CHAVE, ASAAS_API_URL: `${SANDBOX}/` }, buscar });
  assert.deepEqual(r, { configurada: true, ambiente: 'sandbox', conexao: 'ok', motivo: null });
  assert.equal(pedido.url, `${SANDBOX}/myAccount/commercialInfo/`);
  assert.equal(pedido.opcoes.headers.access_token, CHAVE);
  assert.ok(pedido.opcoes.headers['User-Agent']);
  assert.ok(!JSON.stringify(r).includes('aact'), 'a resposta nunca traz a chave');
});

test('chave recusada pelo Asaas vira motivo legível', async () => {
  const r = await testarConexao({ env: { ASAAS_API_KEY: CHAVE }, buscar: responder(401, { errors: [{ code: 'invalid_access_token' }] }) });
  assert.equal(r.conexao, 'falhou');
  assert.match(r.motivo, /recusou a chave/);
});

test('Asaas fora do ar não derruba a rota', async () => {
  const r = await testarConexao({ env: { ASAAS_API_KEY: CHAVE }, buscar: async () => { throw new Error('rede'); } });
  assert.equal(r.conexao, 'falhou');
  assert.match(r.motivo, /Não foi possível falar/);
});

test('rota: exige login e guarda o resultado por um minuto', async () => {
  const rotas = {};
  let chamadas = 0, relogio = 0;
  const requireAuth = () => {};
  registrarCobranca({ get: (caminho, ...h) => { rotas[caminho] = h; } },
    { requireAuth, env: { ASAAS_API_KEY: CHAVE }, buscar: async () => { chamadas += 1; return { status: 200, ok: true, json: async () => ({}) }; }, agora: () => relogio });
  const [guarda, rota] = rotas['/billing/status'];
  assert.equal(guarda, requireAuth);
  const pedir = async () => { let corpo; await rota({}, { json: j => { corpo = j; } }); return corpo; };
  assert.equal((await pedir()).cobranca.conexao, 'ok');
  await pedir();
  assert.equal(chamadas, 1, 'a segunda pergunta usa o resultado guardado');
  relogio = 61000;
  await pedir();
  assert.equal(chamadas, 2);
});
