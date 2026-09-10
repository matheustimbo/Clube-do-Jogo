# Migração mobile

O Next continua sendo a aplicação web e a camada de APIs. O Expo em `apps/mobile` atende Android e iOS. As regras vivem em `packages/domain`, e as operações de dados em `packages/data`; ambos são usados pela web e pelo mobile.

## Executar o Expo

Instale as dependências na raiz com `npm ci`. Copie `apps/mobile/.env.example` para `apps/mobile/.env.local` e informe a URL/chave pública do Supabase e a origem HTTPS da API Next. Sem essas variáveis, o botão de demonstração permite explorar o aplicativo sem uma conta.

```sh
npm run start --workspace @clube-do-jogo/mobile
npm run android --workspace @clube-do-jogo/mobile
# Em um Mac com Xcode:
npm run ios --workspace @clube-do-jogo/mobile
```

Os comandos Android/iOS geram os projetos nativos pelo Expo. `android`, `ios`, `.expo` e `dist` são gerados e não são versionados. O lockfile único fica na raiz. O esquema de callback é `clubedojogo://auth/callback`; a URL precisa estar permitida no projeto Supabase usado pelo ambiente.

O identificador local é `com.clubedojogo.mobile.dev`. Um build EAS de produção exige `EXPO_APPLICATION_ID` explícito. As configurações de EAS não criam um projeto remoto nem publicam o aplicativo.

O Expo usa React 19.2.3, conforme o SDK 57, e a web mantém React 19.2.4. A resolução por autolinking mantém somente a cópia do mobile em cada bundle nativo. O Expo Doctor reporta essas duas instalações no disco (20/21 checks), embora a exportação inclua somente uma cópia de React por bundle; o aviso permanece visível. Esse uso segue o [autolinking do Expo](https://docs.expo.dev/modules/autolinking/#working-around-duplicates). `expo-router` também é uma dependência de desenvolvimento da raiz porque a geração de rotas tipadas do CLI precisa resolver esse pacote a partir do CLI instalado na raiz.

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

O adaptador web de apiFetch mantém o fetch same-origin. O transporte nativo em `apps/mobile/src/platform/api.ts` usa a sessão por Bearer nas rotas `/api` da origem configurada. `src/lib/supabase/bearer.ts` autentica essas chamadas; o servidor valida o usuário e o banco continua aplicando RLS.

## Domínio compartilhado

@clube-do-jogo/domain exporta os tipos existentes, ranking, transições de progresso, datas, conversões de nota e o demo. O subpath @clube-do-jogo/domain/demo expõe demoProfiles, demoGames, demoRanking, demoProgress, demoComments e demoMonths. demoRanking recebe a fórmula como argumento opcional e nunca lê variáveis de ambiente.

src/lib/types.ts, src/lib/ranking.ts, src/lib/progress.ts, src/lib/utils.ts e src/lib/demo-data.ts permanecem como fachadas de compatibilidade para a web. ACTIVE_RANKING_FORMULA só existe na fachada web e é injetada no demo e nos cálculos dos consumidores.

## Verificação

npm run test:domain executa as regras de empate, fórmula legacy, mês seguinte, transições de progresso, virada de ano e conversões de nota. npm run test:web executa o smoke test Playwright em modo demo, sem credenciais ou escritas no Supabase.

`npm run typecheck --workspace @clube-do-jogo/mobile` verifica o mobile; `npm run export --workspace @clube-do-jogo/mobile` gera os bundles Android/iOS. Os fluxos Maestro em `apps/mobile/.maestro` exercitam login, progresso e voto com o aplicativo de desenvolvimento instalado e o ambiente local preparado. As credenciais são passadas por `-e TEST_EMAIL=... -e TEST_PASSWORD=...`.

`tests/data/local-contracts.test.ts` exige opt-in e recusa URLs fora do Supabase local dedicado em `127.0.0.1:55421`. Ele valida sessão, voto, progresso, permissões por conta e privacidade de notas; sem configuração, informa os testes ignorados. Não deve ser apontado para produção.

## Estado da implementação

O aplicativo inclui sessão, jogo do mês, ranking, votos, avaliações, descoberta, biblioteca, perfis, mídia, conversas, anotações privadas e administração. Temas, recompensas e o canal de push nativo estão em integração. Os testes em builds de desenvolvimento não encerram a verificação de paridade, desempenho em release ou entrega em aparelhos físicos.

## Simulador iOS

Use o UDID dedicado e aplique a redução máxima do SimSlim antes de testar. Confira `simslim status` e `verify` no Mac que hospeda o simulador. Uma exceção precisa corresponder ao recurso necessário para o cenário.

Ao construir diretamente com `xcodebuild`, preserve a assinatura local para o simulador. O build testado com `CODE_SIGNING_ALLOWED=NO` fez a leitura de Keychain do Expo Notifications falhar com `-34018`. Recompilar com `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` corrigiu essa falha, mantendo o SimSlim com todas as categorias reduzidas. Isso não configura assinatura para distribuição.

## Assets dos temas

`node scripts/generate-mobile-audio.mjs` gera os WAVs locais a partir das frequências e envelopes usados na web. `node scripts/migrate-native-theme.mjs --check` identifica consumidores que ainda dependem de cores estáticas; sem `--check`, aplica a conversão para os hooks de paleta. Os arquivos de imagem continuam compartilhados com `public/themes`.

O áudio é opt-in. Somente o tema Fogueira Cósmica usa a trilha e os sinais. Preferências são locais e separadas por conta; a lista de temas desbloqueados vem das recompensas confirmadas pelo servidor.
