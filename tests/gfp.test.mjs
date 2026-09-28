/* Os mesmos casos de tests/casos-gfp.js, sob `node --test`.
 *
 * Os módulos do núcleo são scripts de navegador: definem funções no escopo
 * global e se publicam em `window`. Em vez de reescrevê-los como módulos só
 * para o teste — o que faria o teste medir outra coisa que não o código que
 * roda em produção —, eles são avaliados num contexto do `vm` onde `window`
 * é o próprio contexto. É o mesmo arquivo, executado do mesmo jeito.
 *
 * Para ver o resultado no navegador, abra tests/index.html.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const daRaiz = caminho => fileURLToPath(new URL('../' + caminho, import.meta.url));

const contexto = vm.createContext({ console, TextEncoder, TextDecoder });
contexto.window = contexto;
contexto.globalThis = contexto;

for (const arquivo of ['v2-extrato.js', 'v2-fatura.js', 'v2-emprestimos-calculo.js', 'tests/casos-gfp.js']) {
  vm.runInContext(readFileSync(daRaiz(arquivo), 'utf8'), contexto, { filename: arquivo });
}

for (const [nome, executar] of contexto.CASOS_GFP) {
  test(nome, () => {
    const falhas = [];
    executar((condicao, mensagem) => { if (!condicao) falhas.push(mensagem); });
    assert.deepEqual(falhas, [], falhas.join(' · '));
  });
}

/* Versão: o número do site (versao.js), da API (package.json) e do cache do
   service worker (sw.js) precisam andar juntos. Se um ficar para trás, o
   cliente vê uma versão no rodapé e roda outra. */
test('versão é a mesma no site, na API e no service worker', () => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  vm.runInContext(readFileSync(daRaiz('versao.js'), 'utf8'), ctx, { filename: 'versao.js' });
  const site = ctx.GFP_VERSAO.numero;
  const api = JSON.parse(readFileSync(daRaiz('api/package.json'), 'utf8')).version;
  const sw = readFileSync(daRaiz('sw.js'), 'utf8').match(/const CACHE = 'gfp-([^']+)'/)?.[1];
  assert.match(site, /^\d+\.\d+\.\d+$/, 'versão fora do padrão X.Y.Z');
  assert.equal(api, site, 'api/package.json diferente do versao.js');
  assert.equal(sw, site, 'cache do sw.js diferente do versao.js');
  assert.equal(ctx.GFP_HISTORICO[0].numero, site, 'a versão atual precisa ser a primeira do histórico');
  assert.equal(ctx.GFP_HISTORICO[0].data, ctx.GFP_VERSAO.data, 'data da versão diferente da do histórico');
});
