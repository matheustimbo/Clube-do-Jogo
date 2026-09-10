# Builds e updates do mobile

O Next mantém seu próprio deploy. Os builds Expo usam as APIs existentes por HTTPS e não executam migrações no banco. Um rollback mobile precisa continuar compatível com o schema e com as notas já armazenadas.

## Ambientes

| Perfil EAS | Variante | Canal | Uso |
| --- | --- | --- | --- |
| development | development | development | Development client em aparelho físico. |
| development-simulator | development | development | Development client no simulador iOS. |
| preview | preview | preview | Distribuição interna, APK no Android e assinatura ad hoc no iOS. |
| preview-simulator | preview | preview | Preview no simulador iOS. |
| production | production | production | Binário para as lojas. |

`APP_VARIANT` identifica a variante também quando não há um build EAS em execução. Preview e produção exigem `EXPO_APPLICATION_ID` e `EXPO_EAS_PROJECT_ID`. O segundo valor é o UUID do projeto EAS, usado pelo push e pela URL de updates. Defina esses valores nos ambientes EAS correspondentes antes de construir. Use identificadores diferentes quando quiser instalar variantes lado a lado. Nenhum projeto remoto ou identificador de loja foi criado por esta migração.

Configure `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE_URL` e `EXPO_PUBLIC_SITE_URL` por ambiente. Os valores `EXPO_PUBLIC_*` entram no bundle. As credenciais IGDB, service role, FCM, APNs e tokens do worker permanecem no servidor ou no serviço de build.

## Construir

Execute `npm ci` na raiz. Faça os comandos EAS a partir de `apps/mobile`. O lockfile inclui o monorepo inteiro.

```sh
eas build --profile preview --platform android
eas build --profile preview-simulator --platform ios
eas build --profile production --platform all
```

Esses comandos iniciam builds remotos e precisam de projeto, assinatura e autorização de distribuição configurados. Os perfis de preview não equivalem a uma publicação nas lojas. A numeração EAS é remota; a versão local inicial de desenvolvimento é 1.

Para medir o bundle embarcado sem serviços EAS, mantenha `APP_VARIANT=development` e compile em modo release. Isso desliga updates remotos, preserva `com.clubedojogo.mobile.dev` e permite usar o ambiente Supabase local de teste.

```sh
APP_VARIANT=development npx expo run:android --variant release
APP_VARIANT=development npx expo run:ios --configuration Release
```

Escolha explicitamente o aparelho dedicado quando o CLI solicitar. No Mac remoto, confirme host e UDID, aplique a redução máxima do SimSlim e confira `status` e `verify`. Preserve a assinatura local do simulador. O build direto por Xcode com assinatura desativada falhou no Keychain do Expo Notifications; consulte `mobile-migration.md`.

Os diretórios `android` e `ios` são gerados por CNG. Antes de regenerá-los, confira se existem mudanças nativas manuais e preserve-as. Use checkout isolado para trocar a variante. Um diretório nativo antigo pode manter o identificador anterior mesmo após editar `app.config.ts`.

## Compatibilidade e rollback

`runtimeVersion` usa a política `fingerprint`. Alterações que afetam o runtime nativo exigem um novo binário. Publique somente updates com runtime compatível e com os valores de ambiente da variante selecionada. O perfil EAS de build não fornece automaticamente suas variáveis `env` ao comando de update. Configure `APP_VARIANT` também no ambiente EAS usado pelo update. A separação entre runtime e JavaScript segue a [documentação de compatibilidade do Expo](https://docs.expo.dev/eas-update/runtime-versions/).

Depois de confirmar os identificadores e completar a revisão do candidato, publique primeiro no canal preview. O procedimento de rollback usa `eas update:rollback`, que permite selecionar um update anterior ou o bundle embarcado. Teste reabertura, sessão, preferências e notas depois da reversão. Uma reversão de JavaScript não remove migrações nem desfaz dados. O comando e as duas modalidades estão na [documentação de rollback do Expo](https://docs.expo.dev/eas-update/rollbacks/).

## Evidência necessária para distribuir

Registre commit, hash do binário, runtime, versão do sistema, aparelho, ambiente e fixture em cada execução. Guarde os resultados de unit, live e perf separadamente. A compilação e a exportação Hermes não comprovam instalação, entrega push ou desempenho.

Ainda precisam de execução e evidência a instalação em Android/iPhone físicos, push APNs/FCM, update e rollback no canal preview, rejeição de runtime incompatível, leitura de tela e os limites de desempenho em release. Não existe binário mobile de produção anterior para provar retrocompatibilidade neste primeiro lançamento.

Antes da submissão, confirme os metadados e requisitos vigentes de privacidade e distribuição das lojas. Esta migração não envia aplicativos, configura credenciais de loja nem altera produção.
