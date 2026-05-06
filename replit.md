# Sigma — Calculadora Inteligente

App mobile de calculadora inteligente com interface de chat em português — o usuário descreve o cálculo em linguagem natural e recebe o resultado com fórmula, variáveis e passo a passo.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — roda o app Expo (porta dinâmica)
- `pnpm --filter @workspace/api-server run dev` — roda o API server (porta 5000)
- `pnpm run typecheck` — typecheck completo
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks e schemas do OpenAPI
- Required env: `DATABASE_URL` — Postgres connection string (se backend for usado)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (expo-router, React Native)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (não usado no primeiro build)
- Fonts: Inter (400/500/600/700) via @expo-google-fonts/inter
- Icons: @expo/vector-icons (Feather)
- State: useState local + AsyncStorage para persistência futura

## Where things live

- `artifacts/mobile/` — app Expo principal
  - `app/(tabs)/index.tsx` — tela principal (display + chat + input)
  - `components/Overlays.tsx` — CalcOverlay, HistoryOverlay, FormulasScreen
  - `constants/colors.ts` — paleta Sigma (warm off-white #F7F6F3)
- `artifacts/api-server/` — servidor Express (não usado ainda)
- `lib/api-spec/openapi.yaml` — contrato da API

## Architecture decisions

- App single-screen: sem tabs, sem header nativo — interface de chat com overlay system
- Overlays absolutos (position absolute) ao invés de Modals React Native para suavidade visual
- FlatList invertida para auto-scroll de chat sem scrollToEnd()
- Paleta monocromática quente: bg #F7F6F3 → panel #EFEFEC → surface #E8E7E3 → text #1A1A18
- Mock data no primeiro build — backend e persistência adicionados conforme necessidade

## Product

- Chat em linguagem natural: descreve o cálculo, recebe resultado formatado
- Biblioteca de fórmulas: Financeiro, Saúde, Geometria, Física, Básico
- Detalhe de cálculo: fórmula simbólica, variáveis, passo a passo numerado
- Histórico de sessões salvas
- Modo livre ou fórmula selecionada

## User preferences

- App em português brasileiro
- Design fiel ao protótipo: paleta warm off-white, tipografia monospace para fórmulas
- Interface de calculadora inteligente (chat-first, não botões numéricos)

## Gotchas

- Não usar `npx expo start` diretamente — usar restart_workflow
- Não criar app.config.ts/js — usar app.json estático
- FlatList inverted: data deve estar em ordem normal (mais antigo primeiro), inverted=true cuida do display
- Feather icons não tem símbolo sigma — usar Text "σ" como workaround

## Pointers

- Expo skill: `.local/skills/expo/SKILL.md`
- First build reference: `.local/skills/expo/references/first_build.md`
- Keyboard reference: `.local/skills/mobile-ui/references/keyboard.md`
