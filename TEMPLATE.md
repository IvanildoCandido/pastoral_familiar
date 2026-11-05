# Arquitetura atual

O projeto foi convertido para TypeScript com Express, React/Vite e PostgreSQL/Supabase.
As instruções atuais de desenvolvimento, validação, importação de dados e deploy estão no [README.md](README.md).

- Contratos: `shared/types.ts`.
- Validação de entrada: `backend/src/models.ts` (Zod).
- Rotas e autorização: `backend/src/app.ts`, `backend/src/auth.ts`.
- Persistência: `backend/src/db.ts` com queries parametrizadas e transações.
- Banco: `supabase/migrations/001_initial.sql`.
- Publicação: `api/index.ts` e `vercel.json`, com a raiz do repositório como Root Directory.

Não é necessário executar serviços Python ou MongoDB para usar a aplicação nova.
