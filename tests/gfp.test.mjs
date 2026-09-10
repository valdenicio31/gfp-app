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
