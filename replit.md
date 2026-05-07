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
- `artifacts/mobile/components/Overlays.tsx` — CalcOverlay, HistoryOverlay, FormulasScreen (dados reais)
- `artifacts/mobile/lib/apiClient.ts` — cliente tipado para o API server
- `artifacts/mobile/lib/queries.ts` — hooks React Query + helpers Supabase
- `artifacts/mobile/lib/supabase.ts` — cliente Supabase (mobile, AsyncStorage)
- `artifacts/mobile/contexts/AuthContext.tsx` — Supabase session management
- `artifacts/api-server/src/routes/calculate.ts` — POST /api/calculate (AI)
- `artifacts/api-server/src/middlewares/auth.ts` — verificação JWT Supabase
- `lib/integrations-openai-ai-server/` — cliente OpenAI via Replit proxy

## Architecture decisions

- **Híbrido**: mobile fala com Supabase diretamente para CRUD; fala com API server apenas para IA
- **Auth**: Supabase JWT enviado como Bearer token para o servidor; servidor verifica via `supabase.auth.getUser(token)`
- **AI**: servidor chama OpenAI (gpt-5.1) com prompt estruturado em PT-BR, retorna JSON com fórmula+passos+variáveis
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
- OpenAI skill: `.local/skills/ai-integrations-openai/SKILL.md`
- Expo skill: `.local/skills/expo/SKILL.md`
