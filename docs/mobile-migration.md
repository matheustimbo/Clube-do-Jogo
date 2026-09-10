# Migração mobile

O Next continua sendo a aplicação web e a camada de APIs. As regras que não dependem de ambiente agora vivem em packages/domain, que pode ser importado pelo Next e pelo Expo.

## Destino da prova de conceito

| Arquivo | Destino |
| --- | --- |
| src/mobile/main.tsx | Removido. O bootstrap nativo será apps/mobile/app/_layout.tsx, criado no EX02. |
| src/mobile/routes.ts | Removido. As rotas serão arquivos do Expo Router em apps/mobile/app. |
| src/mobile/navigation.tsx | Removido. A navegação nativa será responsabilidade do Expo Router. |
| src/mobile/image.tsx | Removido. O Expo usará expo-image nas telas nativas. |
| src/mobile/mobile.css | Removido. Tokens e StyleSheet nativos serão criados em apps/mobile/src/theme. |
| src/lib/navigation.tsx | Removido. Os consumidores web voltaram a importar next/link e next/navigation. |
| src/components/platform-image.tsx | Removido. O único consumidor voltou a importar next/image. |
| src/lib/mobile-cors.ts | Removido. A camada era exclusiva da casca Capacitor e não participa do fetch nativo do Expo. |
| src/proxy.ts | Removido. O Next volta ao fluxo padrão de APIs; autenticação Bearer permanece em src/lib/supabase/bearer.ts. |

O adaptador web de apiFetch mantém o fetch same-origin. O cliente nativo terá seu transporte próprio em uma fase posterior. src/lib/supabase/bearer.ts continua disponível para autenticar chamadas de API com RLS no EX02.

## Domínio compartilhado

@clube-do-jogo/domain exporta os tipos existentes, ranking, transições de progresso, datas, conversões de nota e o demo. O subpath @clube-do-jogo/domain/demo expõe demoProfiles, demoGames, demoRanking, demoProgress, demoComments e demoMonths. demoRanking recebe a fórmula como argumento opcional e nunca lê variáveis de ambiente.

src/lib/types.ts, src/lib/ranking.ts, src/lib/progress.ts, src/lib/utils.ts e src/lib/demo-data.ts permanecem como fachadas de compatibilidade para a web. ACTIVE_RANKING_FORMULA só existe na fachada web e é injetada no demo e nos cálculos dos consumidores.

## Verificação

npm run test:domain executa as regras de empate, fórmula legacy, mês seguinte, transições de progresso, virada de ano e conversões de nota. npm run test:web executa o smoke test Playwright em modo demo, sem credenciais ou escritas no Supabase.
