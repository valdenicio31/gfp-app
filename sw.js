/* Service worker do GFP Familiar.
   Regras:
   1) chamadas para a API (outro domínio) NUNCA passam pelo cache — dado financeiro
      precisa vir do servidor, senão a tela mostra saldo velho;
   2) páginas vêm da rede primeiro, com o cache só como reserva quando está sem internet;
   3) arquivos estáticos vêm do cache e são atualizados por trás. */
const CACHE = 'gfp-v2';
const ESSENCIAIS = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(nome => nome !== CACHE).map(nome => caches.delete(nome)));
    await self.clients.claim();
  })());
});

async function guardar(requisicao, resposta) {
  if (!resposta || !resposta.ok || resposta.type !== 'basic') return resposta;
  const copia = resposta.clone();
  const cache = await caches.open(CACHE);
  await cache.put(requisicao, copia);
  return resposta;
}

self.addEventListener('fetch', evento => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;
  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;            // API e terceiros: direto para a rede
  if (url.search) return;                                     // qualquer coisa com parâmetro não é estático

  // Página, script e estilo vêm da rede primeiro: assim uma publicação nova
  // aparece na hora, sem o usuário ter que forçar recarregar.
  const ehCodigo = /\.(html|js|css|webmanifest)$/i.test(url.pathname);
  const ehPagina = requisicao.mode === 'navigate' || url.pathname === '/' || ehCodigo;
  if (ehPagina) {
    evento.respondWith((async () => {
      try {
        return await guardar(requisicao, await fetch(requisicao));
      } catch {
        return (await caches.match(requisicao)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  evento.respondWith((async () => {
    const guardado = await caches.match(requisicao);
    const daRede = fetch(requisicao).then(resposta => guardar(requisicao, resposta)).catch(() => guardado);
    return guardado || daRede;
  })());
});
