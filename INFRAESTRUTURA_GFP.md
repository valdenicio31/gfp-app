# Infraestrutura GFP Familiar

## Componentes

- `gfp-app`: interface estática existente.
- `gfp-familiar-api`: API Node.js isolada.
- `gfp-postgres`: PostgreSQL exclusivo do projeto.

## Segurança

- Segregação de todas as consultas por `family_id`.
- Senhas com bcrypt, custo 12.
- Tokens JWT com expiração de 8 horas.
- Rate limit nas rotas de autenticação.
- CORS restrito à interface oficial.
- Segredos somente em variáveis do Render.
- Perfis: administrador, adulto, dependente e somente leitura.

## Implantação

1. Criar PostgreSQL exclusivo no Render.
2. Executar `api/sql/001_initial.sql`.
3. Criar Web Service a partir da branch `gfp-familiar-v2`.
4. Root Directory: `api`.
5. Build Command: `npm ci`.
6. Start Command: `npm start`.
7. Configurar `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS` e `NODE_ENV=production`.
