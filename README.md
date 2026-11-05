# Pastoral Familiar — Agenda e Escalas

Aplicação em português para membros, setores, eventos, escalas com funções e confirmação de presença. Frontend React/Vite e backend Express em **TypeScript estrito**, com **PostgreSQL no Supabase**. Preparada para servir interface e `/api` no mesmo projeto da Vercel.

## Requisitos

- Node.js **24.x** e npm.
- Projeto Supabase com acesso à conexão PostgreSQL.
- Conta Vercel para publicar; repositório GitHub, GitLab ou Bitbucket para deploy pelo painel.

## Instalação e execução local

Na **raiz** deste projeto:

```bash
npm ci
cp .env.example .env
```

No `.env`, configure `DATABASE_URL` com a conexão de **Transaction pooler**, porta **6543**, obtida em **Supabase → Connect**. Substitua os placeholders e codifique caracteres especiais da senha com percent encoding. Preserve `sslmode=verify-full` para verificar o certificado TLS. A conexão fica exclusivamente no servidor; não crie uma variável `VITE_DATABASE_URL`.

Crie as tabelas e o primeiro coordenador:

```bash
npm run db:migrate
# Antes: defina ADMIN_PASSWORD no .env com uma senha forte de pelo menos 12 caracteres.
npm run db:admin
npm run dev
```

Abra **http://localhost:3000**. A API roda em `127.0.0.1:8001` e o Vite encaminha `/api` para ela. O login usa `ADMIN_USERNAME` (padrão `admin`) e a senha escolhida. **Não há usuário ou senha padrão criado automaticamente.**

Se já existem dados no MongoDB, use o procedimento de importação abaixo **antes** de rodar `db:admin`. O coordenador existente será preservado.

## Hospedar na Vercel

1. **Crie o projeto Supabase.** Guarde a senha do banco e copie a conexão em **Connect → Transaction pooler**. Escolha uma região adequada aos usuários.
2. **Prepare o banco.** No seu computador, configure `.env` e rode `npm ci` e `npm run db:migrate`. Alternativamente, cole o conteúdo de [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) no SQL Editor do Supabase e execute uma única vez. Se usar o SQL Editor, não execute também `db:migrate` no mesmo banco.
3. **Prepare o acesso.** Para instalação nova, defina `ADMIN_PASSWORD` no `.env` e execute `npm run db:admin`. Para manter os dados antigos, importe-os conforme a seção seguinte.
4. **Envie o código para seu repositório Git**, incluindo `package-lock.json`. Os arquivos `.env` e as exportações do MongoDB estão no `.gitignore` e não devem ser publicados. Se algum segredo já foi versionado anteriormente, remova-o do controle de versão e troque a credencial.
5. Na Vercel, clique em **Add New → Project** e importe o repositório. Importe o repositório completo. A configuração de build está versionada em `vercel.json`; não é necessário preencher os campos de build no painel:
   - Install Command: `npm ci --include=dev --workspaces --include-workspace-root`
   - Build Command: `npm run vercel-build`
   - Output Directory: `dist` (relativo à raiz selecionada)
6. Em **Environment Variables**, adicione `DATABASE_URL` e `APP_TZ=America/Fortaleza` para Production. Não é necessário cadastrar `ADMIN_PASSWORD` na Vercel; ela é usada somente para criar o coordenador pelo comando local. Se habilitar Preview, configure também essas variáveis, preferencialmente apontando para um banco de testes separado.
7. Clique em **Deploy**. Abra o domínio HTTPS gerado, faça login e confira setores, eventos, cadastro e confirmação de presença. `/api/` deve retornar `{"message":"Pastoral API"}`; faça login para validar também a conexão real ao banco. Links diretos como `/membros` devem carregar a interface.

Mudou alguma variável na Vercel? Faça um **Redeploy**. As migrações são executadas separadamente, nunca a cada build ou requisição. O banco permanece no Supabase e não depende dos arquivos temporários das funções Vercel.

Referências: [configuração Vercel](https://vercel.com/docs/project-configuration/vercel-json), [conexão ao Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Importar os dados atuais do MongoDB

O código novo não modifica nem apaga o MongoDB. A importação exige uma exportação do banco antigo e um **banco PostgreSQL recém-criado com a migração aplicada**. Faça backup antes de trocar o ambiente em uso. Pause alterações no aplicativo antigo durante a exportação e a troca final para evitar divergências.

Com o MongoDB Database Tools instalado, exporte as cinco coleções no ambiente que possui acesso ao banco antigo. Substitua `CONEXAO_MONGO` e `NOME_DO_BANCO` pelos valores do ambiente antigo:

```bash
mkdir -p mongo-export
mongoexport --uri='CONEXAO_MONGO' --db='NOME_DO_BANCO' --collection=sectors --jsonArray --out=mongo-export/sectors.json
mongoexport --uri='CONEXAO_MONGO' --db='NOME_DO_BANCO' --collection=users --jsonArray --out=mongo-export/users.json
mongoexport --uri='CONEXAO_MONGO' --db='NOME_DO_BANCO' --collection=events --jsonArray --out=mongo-export/events.json
mongoexport --uri='CONEXAO_MONGO' --db='NOME_DO_BANCO' --collection=rsvps --jsonArray --out=mongo-export/rsvps.json
mongoexport --uri='CONEXAO_MONGO' --db='NOME_DO_BANCO' --collection=attendance --jsonArray --out=mongo-export/attendance.json
npm run db:import -- ./mongo-export
```

A importação valida os arquivos e usa uma transação: se falhar, nada é importado. Preserva IDs, papéis, setores, eventos, respostas, presença e hashes de senha PBKDF2 compatíveis com a implementação antiga. Converte o antigo campo `sector_id` para `sector_ids` quando necessário. Sessões não são importadas; todos precisam entrar novamente. Não publique esses arquivos: contêm dados pessoais e hashes de senha.

Confira o login do coordenador existente e os dados importados antes de direcionar os usuários ao novo domínio. O importador recusa um destino que já tenha usuários e não mescla bases existentes.

## Estrutura e validação

```text
api/index.ts                    Entrada da função Vercel pela raiz
frontend/api/index.ts           Entrada da mesma API pelo workspace frontend
frontend/vercel.json            Configuração para publicação pelo workspace
backend/src/                    API Express, autenticação, validação e acesso ao PostgreSQL
backend/scripts/                Migração, criação de coordenador e importação
backend/tests/api.test.ts        Integração HTTP/SQL com PostgreSQL embarcado (PGlite)
frontend/src/                   Interface React em TypeScript
shared/types.ts                 Contratos públicos usados pelo frontend e backend
supabase/migrations/            Esquema SQL versionado
vercel.json                     Build, função e rotas da aplicação
```

```bash
npm run typecheck
npm test
npm run build
```

Os testes usam um banco PostgreSQL embarcado temporário, sem credenciais externas. Cobrem autorização por papel e setor, aprovação, privacidade, vagas, calendário, presença, estatísticas e exclusões. A validação de hospedagem exige as suas contas e a conexão real do Supabase. O workspace `tests/` mantém utilitários opcionais Playwright em TypeScript.

## Regras de acesso

- Coordenador administra membros, setores e eventos.
- Subcoordenador gerencia membros dos setores que compartilha, sem elevar papéis; pode consultar escalas e marcar presença em todos os eventos, conforme a regra existente.
- Membro responde escalas gerais ou dos próprios setores.
- Presença só pode ser registrada no dia do evento ou depois, no fuso `APP_TZ`.
- Cookies de sessão são HTTP-only, SameSite=Lax e Secure em produção. No banco, apenas o hash do token é armazenado. As permissões são consultadas a cada requisição.
- As tabelas têm RLS habilitado e nenhuma política pública. O navegador acessa somente a API, que usa a conexão PostgreSQL privada e verifica as permissões. Supabase Auth não é usado: o login existente por usuário e senha foi mantido.
- Reservas e substituição de presenças usam transações; a reserva trava o evento para respeitar vagas com requisições concorrentes.

## Build automático da Vercel

O comando `npm run vercel-build` usa o mesmo build validado localmente. O Vite gera os arquivos em `frontend/dist/`, e o build também copia essa saída para `dist/` na raiz. Ambas as raízes possuem `api/index.ts` apontando para a mesma aplicação Express e configuração `vercel.json`. O build verifica os arquivos publicados, o favicon e as entradas da API. O `vercel.json` desativa a detecção automática de framework e declara explicitamente instalação, comando, saída e rotas, para que a seleção automática do workspace frontend não determine o diretório de publicação.

O comando `vercel-build` existe tanto na raiz quanto no workspace `frontend`. Ambos usam `scripts/vercel-build.ts` para executar o build completo com o diretório de trabalho na raiz. A instalação da Vercel inclui explicitamente as dependências da raiz e do frontend.

A publicação funciona com a raiz do repositório ou com `frontend` como Root Directory. A API e suas dependências também estão declaradas no workspace para que o empacotamento da função seja feito nos dois casos.
