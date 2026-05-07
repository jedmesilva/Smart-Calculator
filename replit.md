# Sigma — Calculadora Inteligente

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
- `artifacts/api-server/src/lib/orchestrator.ts` — coordenador central (5 fases)
- `artifacts/api-server/src/lib/formulaCompute.ts` — avalia expressão com mathjs
- `artifacts/api-server/src/lib/explainBuilder.ts` — monta ResultData (código puro)
- `artifacts/api-server/src/agents/types.ts` — tipos compartilhados entre agentes
- `artifacts/api-server/src/agents/formulaAgent.ts` — Fase 1b: busca/identifica/valida fórmula
- `artifacts/api-server/src/agents/contextAgent.ts` — Fase 1a: extrai valores genéricos da conversa
- `artifacts/api-server/src/agents/expressionAgent.ts` — Fase 2: monta expressão MathJS (retry + web search)
- `artifacts/api-server/src/agents/validationAgent.ts` — Fase 4: prova reversa + checagem de razoabilidade
- `artifacts/api-server/src/agents/conversationalAgent.ts` — Fase 5b: resposta em linguagem natural
- `artifacts/api-server/src/agents/formulaValidationAgent.ts` — validação de fórmula ao criar (fluxo separado)
- `artifacts/api-server/src/middlewares/auth.ts` — verificação JWT Supabase
- `lib/integrations-openai-ai-server/` — cliente OpenAI via Replit proxy

## Architecture decisions

- **Híbrido**: mobile fala com Supabase diretamente para CRUD; fala com API server apenas para IA
- **Auth**: Supabase JWT enviado como Bearer token para o servidor; servidor verifica via `supabase.auth.getUser(token)`
- **Pipeline de cálculo (5 fases)**:
  - Fase 1 (paralelo): `formulaAgent` (DB lookup ou LLM identifica fórmula, valida adequação) + `contextAgent` (extrai valores genéricos da conversa)
  - Fase 2: `expressionAgent` monta/valida expressão MathJS com loop de retry (máx 3 tentativas; web search via gpt-5.1 + web_search_preview como fallback)
  - Fase 3: `computeFormula` via mathjs local
  - Fase 4: `validationAgent` — prova reversa matemática + checagem de razoabilidade via LLM
  - Fase 5 (paralelo): `buildResult` (código puro) + `conversationalAgent` (resposta pt-BR em linguagem natural)
- **Orquestrador central**: `lib/orchestrator.ts` coordena todas as fases, loops de retry e propagação de erro
- **formulaAgent modo fixo**: valida se a fórmula selecionada é adequada para a query (retorna `wrong_formula` se não)
- **formulaValidationAgent**: fluxo separado para validar fórmulas ao criá-las (testa expressão MathJS com valores de exemplo)
- **ResultData estendido**: inclui `proof: { verified, method, detail }` + `conversationalResponse: string`
- **Chat UX**: resposta bem-sucedida → bubble de texto conversacional + card de resultado (dois itens no chat)
- **CalcOverlay**: mostra seção "Verificação" com prova reversa (verde/aprovado ou amarelo/revisar)
- **Contexto multi-turn**: mobile envia últimas 10 mensagens como `context[]`; contextBuilder usa `conversationalResponse` nas mensagens de contexto
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

## Gotchas

- Não usar `npx expo start` diretamente — usar restart_workflow
- Não criar app.config.ts/js — usar app.json estático
- FlatList inverted: data em ordem normal (mais antigo primeiro), `inverted=true` cuida do display
- Feather icons não tem sigma — usar `<Text>σ</Text>` como workaround
- Email confirmation DEVE estar desligado no Supabase Dashboard → Auth → Email → "Confirm email OFF"
- API_BASE no mobile: usa `EXPO_PUBLIC_API_URL` se definido, senão `https://$EXPO_PUBLIC_DOMAIN/api`

## Pointers

- Supabase tables: profiles, sessions, messages, formulas (is_system=true), saved_formulas
- Supabase project: `cgfccmlrnkvxhsrhyqkh.supabase.co`
- Formulas com `expression` (mathjs) + `expression_meta` (solveFor, variables, resultUnit): 12/13 (Média Aritmética usa AI)
- OpenAI skill: `.local/skills/ai-integrations-openai/SKILL.md`
- Expo skill: `.local/skills/expo/SKILL.md`
