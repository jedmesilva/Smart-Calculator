# Phormula — Calculadora Inteligente

App mobile de calculadora inteligente com chat em português — o usuário descreve o cálculo em linguagem natural e recebe o resultado com fórmula, variáveis e passo a passo.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — app Expo (porta 18115)
- `pnpm --filter @workspace/api-server run dev` — API server (porta 8080)
- `pnpm install --no-frozen-lockfile` — instalar dependências
- Required env (mobile): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_DOMAIN`
- Required env (server): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`
- Railway deploy: `railway.json` na raiz configura build/start do monorepo

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo SDK 54, expo-router 6, React Native 0.81, @tanstack/react-query
- API: Express 5, OpenAI via Replit AI Integration (proxy)
- DB/Auth: Supabase (PostgreSQL + RLS + Supabase Auth)
- AI: `@workspace/integrations-openai-ai-server` → gpt-5.1
- Fonts: Inter via @expo-google-fonts/inter; Icons: Feather

## Where things live

- `artifacts/mobile/app/(tabs)/index.tsx` — tela principal (display + chat + input)
- `artifacts/mobile/components/Overlays.tsx` — CalcOverlay (com seção Verificação), HistoryOverlay, FormulasScreen
- `artifacts/mobile/lib/apiClient.ts` — tipos CalcResponse, ResultData (com proof + conversationalResponse)
- `artifacts/mobile/lib/queries.ts` — hooks React Query + helpers Supabase
- `artifacts/mobile/lib/contextBuilder.ts` — constrói contexto multi-turn para API
- `artifacts/mobile/lib/supabase.ts` — cliente Supabase (mobile, AsyncStorage)
- `artifacts/mobile/contexts/AuthContext.tsx` — Supabase session management
- `artifacts/api-server/src/routes/calculate.ts` — POST /api/calculate (delega para orchestrator)
- `artifacts/api-server/src/lib/orchestrator.ts` — pipeline 3 agentes (coordenador central)
- `artifacts/api-server/src/lib/formulaCompute.ts` — avalia expressão com mathjs
- `artifacts/api-server/src/lib/explainBuilder.ts` — monta ResultData (código puro)
- `artifacts/api-server/src/agents/types.ts` — tipos compartilhados entre agentes
- `artifacts/api-server/src/agents/calculatorAgent.ts` — Agent 2: decide estratégia (simple/complex), monta expressão MathJS, computa localmente
- `artifacts/api-server/src/agents/evaluatorAgent.ts` — Agent 3: score 0-10 + aprovação + feedback para retry
- `artifacts/api-server/src/agents/conversationalAgent.ts` — resposta em linguagem natural (pós-resultado) + guidance (fallback)
- `artifacts/api-server/src/agents/formulaValidationAgent.ts` — validação de fórmula ao criar (fluxo separado)
- `artifacts/api-server/src/lib/summaryBuilder.ts` — geração de resumo LLM da sessão (gpt-4o-mini)
- `artifacts/api-server/src/middlewares/auth.ts` — verificação JWT Supabase
- `lib/integrations-openai-ai-server/` — cliente OpenAI via Replit proxy

## Architecture decisions

- **Híbrido**: mobile fala com Supabase diretamente para CRUD; fala com API server apenas para IA
- **Auth**: Supabase JWT enviado como Bearer token para o servidor; servidor verifica via `supabase.auth.getUser(token)`
- **Pipeline de cálculo (3 agentes)**:
  - **Agent 1 (Intent)**: LLM call focado; analisa query + contexto → `{status: "ready", objective, values, contextSummary}` ou `"needs_input"` ou `"conversational"`. Embutido no orchestrator.
  - **Agent 2 (Calculator)**: `calculatorAgent.ts` — recebe `{objective, values, contextSummary, feedback?}`; decide SIMPLE (expressão única MathJS) ou COMPLEX (multi-step com `{label}` refs); computa localmente com MathJS
  - **Agent 3 (Evaluator)**: `evaluatorAgent.ts` — analisa objetivo × fórmula × resultado; score 0-10; aprovado se ≥ 7; caso contrário envia feedback ao Agent 2 para retry (máx 2 retentativas)
  - **Fase final (paralelo)**: `buildDesenvolvimento` + `runConversationalAgent` → monta `ResultData` completo
- **Orquestrador central**: `lib/orchestrator.ts` coordena os 3 agentes, loop de retry do evaluator, e propagação de erro
- **formulaValidationAgent**: fluxo separado para validar fórmulas ao criá-las (testa expressão MathJS com valores de exemplo)
- **ResultData estendido**: inclui `proof: { verified, method, detail }` + `conversationalResponse: string`
- **Chat UX**: resposta bem-sucedida → bubble de texto conversacional + card de resultado (dois itens no chat)
- **CalcOverlay**: mostra seção "Verificação" com prova reversa (verde/aprovado ou amarelo/revisar)
- **Contexto multi-turn inteligente**:
  - Mobile envia `sessionId` + `sessionSummary` (resumo LLM) + últimas 8 mensagens + `messageCount`
  - contextAgent detecta referências a contexto anterior invisível → retorna `needsHistory: true`
  - Orquestrador: se `needsHistory`, busca últimas 30 msgs no Supabase e refaz extração com histórico completo
  - Resumo LLM gerado pelo servidor (gpt-4o-mini, fire-and-forget) a cada 8 mensagens → salvo em `sessions.summary`
  - Mobile busca resumo atualizado do Supabase após cada cálculo bem-sucedido
- **Overlays absolutos** (não Modals) para transições suaves; FlatList invertida para auto-scroll do chat
- **RLS no Supabase**: políticas de acesso por `auth.uid()` em todas as tabelas; fórmulas de sistema têm `is_system=true`

## Product

- Chat em linguagem natural: descreve o cálculo, recebe resultado formatado (pt-BR)
- Detalhe de cálculo: fórmula simbólica, valores substituídos, variáveis, passo a passo
- Biblioteca de fórmulas real (13 fórmulas seeded no Supabase) com busca e filtro por categoria
- Histórico de sessões salvo no Supabase
- Modo livre ou com fórmula específica selecionada
- Auth completo: login/signup com Supabase, logout com confirmação

## User preferences

- App 100% em português brasileiro
- Design: paleta warm off-white (#F7F6F3), tipografia Inter, interface chat-first
- Sem tabs, sem header nativo — tudo via overlay system

## Stripe

- **Secrets necessários:** `STRIPE_SECRET_KEY` (sk_test_... ou sk_live_...) e `STRIPE_WEBHOOK_SECRET` (whsec_...)
- **Produtos criados via:** `scripts/node_modules/.bin/tsx scripts/seed-products.ts`
- **Webhook endpoint:** `https://$REPLIT_DEV_DOMAIN/api/stripe/webhook` — registrar no Stripe Dashboard → Developers → Webhooks
- **Events:** `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`
- **Customer Portal:** ativar em Stripe Dashboard → Settings → Billing → Customer portal
- **Fluxo:** checkout via `WebBrowser.openAuthSessionAsync` no mobile; webhook adiciona créditos e atualiza `profiles.plano`
- **Scripts:** `scripts/seed-products.ts` (cria produtos), `scripts/migrate-stripe.mjs` (adiciona colunas em profiles)
- **Colunas adicionadas em `profiles`:** `stripe_customer_id`, `stripe_subscription_id`, `plano TEXT DEFAULT 'free'`

## Gotchas

- **NUNCA trocar o banco de Supabase para Replit PostgreSQL** — `lib/db/src/index.ts` usa apenas `DATABASE_URL` (aponta para Supabase). Replit injeta vars `PGHOST/PGUSER/PGDATABASE` mas elas devem ser IGNORADAS.
- **NUNCA remover Supabase Auth** — o middleware `auth.ts` verifica JWT via `supabase.auth.getUser(token)`. A autenticação é por Bearer token, não por `x-user-id` header.
- Não usar `npx expo start` diretamente — usar restart_workflow
- Não criar app.config.ts/js — usar app.json estático
- FlatList inverted: data em ordem normal (mais antigo primeiro), `inverted=true` cuida do display
- Feather icons não tem sigma — usar `<Text>σ</Text>` como workaround
- Email confirmation DEVE estar desligado no Supabase Dashboard → Auth → Email → "Confirm email OFF"
- API_BASE no mobile: usa `EXPO_PUBLIC_API_URL` se definido, senão `https://$EXPO_PUBLIC_DOMAIN/api`

## Pointers

- Supabase project: `cgfccmlrnkvxhsrhyqkh.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` disponível como secret — use para inspecionar schema real via DATABASE_URL + pg
- Formulas com `expression` (mathjs) + `expression_meta` (solveFor, variables, resultUnit): 12/13 (Média Aritmética usa AI)
- OpenAI skill: `.local/skills/ai-integrations-openai/SKILL.md`
- Expo skill: `.local/skills/expo/SKILL.md`

## Schema real do Supabase (verificado via information_schema)

| Tabela | Colunas |
|---|---|
| `profiles` | id, full_name, avatar_url, created_at |
| `formulas` | id, user_id, name, category, description, symbolic, is_system, created_at, expression, expression_meta, is_public, llm_verdict, llm_verified_at, llm_verdict_detail |
| `saved_formulas` | id, user_id, formula_id, created_at |
| `sessions` | id, user_id, title, created_at, updated_at, summary, summary_message_count |
| `messages` | id, session_id, kind, text, result_data, created_at |
| `formula_verifications` | id, formula_id, user_id, verdict, detail, created_at |
| `formula_notes` | id, formula_id, user_id, content, created_at, updated_at |

**Atenção**: `profiles` NÃO tem `updated_at`. `formulas` NÃO tem `updated_at`. Qualquer nova coluna Drizzle deve ter correspondência real no Supabase.
