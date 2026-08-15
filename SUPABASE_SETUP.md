# GFP — conexão com Supabase

1. Crie um projeto no Supabase e guarde a senha somente com você.
2. No **SQL Editor**, execute o arquivo `database/supabase_schema.sql` completo.
3. Em **Authentication > Providers**, habilite Email. Para o primeiro teste, a confirmação por e-mail pode ficar desabilitada temporariamente.
4. Em **Project Settings > API**, copie somente a URL do projeto e a chave `anon public`.
5. Na raiz do GFP, copie `.env.example` para `.env.local` e preencha os dois valores. Não publique esse arquivo.
6. No Render, cadastre as mesmas variáveis de ambiente e faça novo deploy.

O GFP usa políticas RLS: cada usuário autenticado só enxerga seus próprios registros.
