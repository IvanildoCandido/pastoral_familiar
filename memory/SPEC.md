# Pastoral — Agenda & Escalas (SPEC)

App em pt-BR para coordenar uma pastoral paroquial: membros, setores, agenda de eventos, escalas com funções e presença.

## Papéis
- **coordenador**: tudo — cria/edita/exclui eventos (com funções), setores e membros (qualquer papel/setores); aprova/recusa pedidos; marca presença.
- **subcoordenador**: vê e gerencia membros que compartilham algum setor com ele (cria membros "membro" nos seus setores; edita setores do membro só dentro dos seus; aprova/recusa pendentes dos seus setores). Vê quem vai/não vai/não respondeu e marca presença em TODOS os eventos. Não cria eventos.
- **membro**: agenda (lista + calendário), setores, responde "Vou ajudar" (escolhendo a função, se houver) / "Não vou".

## Login
- Usuário + senha; cookie httpOnly `pastoral_session` (30 dias). `/api/auth/login|logout|me|signup`.
- Auto-cadastro `/solicitar-acesso` (pode escolher vários setores) → `status=pending` até aprovação.
- Instalação: `npm run db:migrate` e `npm run db:admin` criam esquema e coordenador com senha definida pelo operador. A importação converte `sector_id` → `sector_ids`.
- `last_seen_at` atualizado a cada requisição autenticada (throttle de 2 min) e no login.

## Dados (PostgreSQL / Supabase)
- users {id, username, password_hash, name, phone, notes, role, sector_ids[], status, created_at, last_seen_at}
- sessions {token_hash, user_id, expires_at} — validade conferida na API
- sectors {id, name, description}
- events {id, title, description, date, time, location, sector_id|null, escala_open, slots|null, roles[{id,name,slots|null}], created_by, created_at}
- rsvps {id, event_id, user_id, response going|not_going, role_id|null, created_at}
- attendance {id, event_id, user_id, event_date, marked_by, marked_at} — só presentes; PUT substitui o conjunto.

## Regras
- Eventos de setor: só membros com aquele setor (e coordenadores) respondem.
- Com funções: "going" exige role_id; vagas por função (409 quando cheia). Sem funções: slots geral.
- Presença: só líderes, só quando date <= hoje (APP_TZ, padrão America/Fortaleza). "Serviu" = presença confirmada.
- EventOut para líderes inclui declined, pending (elegíveis sem resposta, só se escala aberta), attendance; membros recebem listas vazias e telefones nulos.
- Members list: served_count, last_served, last_seen_at; GET /members/{id}/history.
- GET /events?month=YYYY-MM para o calendário mensal.
- WhatsApp: frontend monta a mensagem da escala (lib/whatsapp.ts), copia e abre wa.me/?text=.

## Páginas
/login, /solicitar-acesso, / (Agenda: lista/calendário), /membros (coord/sub), /setores

## Dados atuais (o usuário já usa o app!)
Setores reais do usuário: Pós Matrimonial, Pré Matrimonial, Casos especiais, ADM, Sem Setor (NÃO apagar).
Eventos exemplo: Missa da Comunidade (funções Leitura 2/Acolhida 3/Canto 2), Ensaio do Coral, Entrega de Cestas Básicas, Reunião Geral, Missa de Abertura do Ano Pastoral (passado, com presença). Evento do usuário: Reunião Pastoral Familiar (não alterar).
