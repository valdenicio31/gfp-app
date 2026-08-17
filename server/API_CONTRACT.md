# GFP API — contrato inicial

Base pública: `https://<api-gfp>.onrender.com/api`

| Rota | Método | Finalidade |
|---|---|---|
| `/health` | GET | Verificar se a API está disponível. |
| `/auth/register` | POST | Criar conta com e-mail e senha. |
| `/auth/login` | POST | Iniciar sessão e receber token. |
| `/auth/logout` | POST | Invalidar sessão atual. |
| `/sync` | GET | Baixar dados do usuário autenticado. |
| `/sync` | PUT | Enviar atualização de dados do usuário autenticado. |

Regras obrigatórias:

- Senhas somente em hash forte; nunca registrar senha em log.
- Token de sessão com validade definida, armazenado em hash no banco.
- Toda rota de dados exige sessão válida e filtra pelo usuário autenticado.
- O cliente usa HTTPS e só envia dados após login explícito.
