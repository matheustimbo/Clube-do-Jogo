---
name: verify-clube-do-jogo
description: Execute verificações reproduzíveis do Clube do Jogo em Next demo e prepare condução controlada de Expo Android/iOS. Use quando precisar iniciar um ambiente isolado, diagnosticar sua posse, dirigir uma feature com Playwright ou Maestro, coletar evidências auditáveis e limpar somente os processos próprios.
---

# Verify Clube do Jogo

Use esta skill a partir da raiz do checkout. Ela usa a pasta fonte `.agents/skills/verify-clube-do-jogo`; Claude Code encontra a mesma fonte pelo symlink `.claude/skills/verify-clube-do-jogo`. Os helpers de processos usam /proc e o comando ss e rodam em Linux/WSL. Uma porta ocupada sem PID inspecionável faz a verificação falhar. Os comandos iOS são executados remotamente no Mac indicado. O padrão web usa somente uma das portas dedicadas `3102` e `3103`, modo demo e nenhuma credencial Supabase. Nunca aponte o modo local autenticado para produção.

## Run contract

Cada execução recebe um `RUN_ID` e grava o manifesto, log, snapshots, screenshots, resultado e hashes em `evidence/verify-clube-do-jogo/<RUN_ID>/`. O estado operacional fica em `state/verify-clube-do-jogo/<RUN_ID>/`. Essas pastas são artefatos ignorados; os caminhos são derivados do `RUN_ID`, os diretórios canônicos não podem ser symlinks e a evidência só aceita artefatos que preservem o worktree, porta, modo e SHA do manifesto. Launch, drive e evidence registram um snapshot limpo do checkout antes e depois da condução. A limpeza encerra apenas o grupo de processos registrado no manifesto e preserva a evidência.

Use uma porta 3102 ou 3103 que não esteja em uso por outro agente:

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo launch --port 3102
```

Passe `RUN_ID=<id>` ou `--run-id <id>` aos comandos seguintes. Sem isso, o helper seleciona o manifesto mais recente. Não use `pkill`, `killall`, limpeza ampla de diretórios ou comandos que alterem simuladores compartilhados.

## Launch

`launch` inicia `npm run dev -- --hostname 127.0.0.1 --port <port>` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` vazios e `NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE=false`. O processo recebe uma allowlist de ambiente demo sem segredos herdados do shell. Ele é separado em seu próprio grupo; o helper exige checkout limpo antes e depois de iniciar, espera cwd, PGID, boot ID e instante de criação válidos antes de publicar o manifesto, e a rota `/jogo-do-mes` precisa responder antes do comando terminar.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo launch --port 3102
```

Se a inicialização falhar, execute `cleanup --run-id <id>` antes de tentar novamente e preserve o log da tentativa.

## Doctor

`doctor` verifica a identidade do processo pelo boot do host e instante de criação, além de confirmar que o PID ainda existe, que seu cwd pertence a este checkout, que o PGID e a árvore podem ser inspecionados, que a porta responde, que o HTML identifica Clube do Jogo e que a porta não foi tomada por processo externo. O doctor conhece o modo demo pelo manifesto de launch e não simula uma sessão autenticada.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo doctor --run-id <id>
```

O Expo Doctor atual deste monorepo tem 20/21 verificações aprovadas. A verificação restante reporta versões React/ReactDOM diferentes entre web e mobile; isso é um aviso documentado. Bundles nativos já foram inspecionados para confirmar uma única cópia de React. Não transforme esse aviso em `PASS`.

## Drive

O helper Playwright dirige ações de usuário por papéis e texto visível, sem mutação via `page.evaluate`. A prova incluída navega para Ranking, escolhe `Não` para Cocoon, seleciona `Não consigo rodar`, confirma, abre as escolhas negativas do cartão e verifica o motivo visível `Não consigo rodar`.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo drive ranking --run-id <id>
```

O fluxo gera `before-action.png`, `after-vote.png`, snapshots ARIA antes/depois e `drive-result.json`. Após cada captura, o resultado registra assinatura PNG, dimensões, bytes e SHA-256 da imagem, além de bytes e SHA-256 do snapshot ARIA. Console errors, page errors e requests falhas entram no resultado e qualquer item reprova o drive. O helper também exige checkout limpo antes e depois da condução. Se uma tentativa falhar, limpe o run antes de corrigir ou repetir.

## Evidence

`evidence` exige o manifesto, log, snapshots, screenshots e resultado com `status: passed`, checkout limpo antes e depois e as três coleções de erros de runtime vazias. Ele recalcula a assinatura PNG, dimensões, bytes e SHA-256 das imagens, compara as capturas com os metadados registrados pelo drive, recalcula os hashes dos snapshots ARIA e calcula SHA-256 de cada arquivo retido. Antes de escrever o relatório, confirma que o SHA atual é o SHA do launch, que o manifesto na pasta de evidência é igual ao manifesto de estado e que doctor/drive/cleanup têm o mesmo run, worktree, porta, URL e modo. Logs e snapshots de texto são redigidos antes de serem retidos.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo evidence --run-id <id>
```

Uma evidência válida inclui o comando executado, a feature, a URL, o efeito observável, os arquivos e seus hashes. Relatórios devem separar `unit`, `live` e `perf`; qualquer cenário que não tenha sido executado deve aparecer como `not-run` com motivo.

## Cleanup

`cleanup` compara a identidade do processo salvo, seu cwd e seu PGID, inspeciona todos os membros do grupo e a posse da porta antes de sinalizar. Ele nunca sinaliza um grupo com processo externo e só retorna sucesso depois de confirmar que os descendentes e a porta desapareceram; o relatório registra os PIDs restantes quando a limpeza falha. O manifesto, o log e todos os arquivos em `evidence` continuam disponíveis para revisão.

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo cleanup --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo evidence --run-id <id>
```

Não faça logout global, não encerre Metro, Next ou simuladores de outra sessão e não remova evidências para obter uma execução limpa.

## Helpers

Os helpers são executáveis e não dependem de `jq`:

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo launch --port 3102
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo doctor --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo drive ranking --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo evidence --run-id <id>
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo cleanup --run-id <id>
```

O contrato de execução tem regressões automatizadas em `node --test .agents/skills/verify-clube-do-jogo/tests/run-contract.test.mjs`. Elas verificam seleção explícita de run, caminhos/SHA/identidade de artefatos, checkout limpo com arquivos rastreados e não rastreados, runtime errors, integridade PNG/ARIA, diretórios canônicos sem symlink, allowlist demo e redaction, portas dedicadas, recusa de identidade diferente e encerramento de descendente órfão.

`check` executa a validação estrutural da skill e `status` imprime o manifesto sem tocar no app:

```sh
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo check
./.agents/skills/verify-clube-do-jogo/scripts/verify-clube-do-jogo status --run-id <id>
```

## Mobile launch and drive

O fluxo mobile usa um dev client já instalado e o Metro em foreground. A partir da raiz, o comando esperado é:

```sh
npm run start --workspace @clube-do-jogo/mobile
```

O app precisa estar em foreground para receber o deep link `clubedojogo://auth/callback`; iniciar o dev client sem um Metro acessível deixa a tela sem bundle. Use um dispositivo dedicado e não conduza o mesmo simulador ou emulador em duas sessões.

Android documentado, com a atribuição separada para que o shell não expanda uma variável vazia:

```sh
export EXPO_ANDROID_SERIAL=emulator-5580
maestro --device "$EXPO_ANDROID_SERIAL" test apps/mobile/.maestro/club.yaml
```

Antes de validar uma sessão live, use um emulador dedicado, confirme a versão do checkout e confira os túneis que levam ao Metro, ao Supabase local e à API Next:

```sh
export EXPO_ANDROID_SERIAL=emulator-5580
adb -s "$EXPO_ANDROID_SERIAL" reverse tcp:8081 tcp:8081
adb -s "$EXPO_ANDROID_SERIAL" reverse tcp:55421 tcp:55421
adb -s "$EXPO_ANDROID_SERIAL" reverse tcp:3101 tcp:3101
adb -s "$EXPO_ANDROID_SERIAL" reverse --list
adb -s "$EXPO_ANDROID_SERIAL" forward --list
git rev-parse HEAD
npx expo config apps/mobile --type public --json
find apps/mobile/dist -type f -print0 | xargs -0 shasum -a 256
```

O resultado precisa mostrar explicitamente os reverses `8081`, `55421` e `3101`, o SHA do checkout e o manifesto público do app antes de abrir o fluxo. Se `apps/mobile/dist` não existir, o hash do bundle é `not-run`; não valide uma instalação antiga como se fosse o bundle novo. Em macOS, use `shasum -a 256` no lugar de `sha256sum`. Não execute esses comandos no emulador compartilhado do root durante esta criação.

Se o botão flutuante de ferramentas Expo interceptar um toque, desative a preferência somente no app usado pelo teste e restaure-a no cleanup. Não mude uma preferência global do emulador e não mate o Metro do root. A execução mobile desta criação está `not-run`, pois os processos e dispositivos ativos são do root.

iOS documentado no host `macbook-2`, UDID `DED8DC40-0E4D-4B56-9A9B-7B55F189B049`. Defina o checkout real no Mac antes de executar; o `cd` remoto é parte da receita:

```sh
export EXPO_IOS_WORKTREE=/Users/matheustimbopereira/Developer/clube-do-jogo-expo
ssh macbook-2 "cd '$EXPO_IOS_WORKTREE' && export PATH='/opt/homebrew/bin:/Users/matheustimbopereira/.maestro/bin:\$PATH' && maestro --help | grep -E -- '--device|--udid' && maestro --device 'DED8DC40-0E4D-4B56-9A9B-7B55F189B049' test apps/mobile/.maestro/club.yaml"
```

Antes de qualquer execução iOS, o operador deve consultar `simslim --help` e `simslim profiles`, aplicar `simslim on <UDID>` com a redução máxima, conferir `status` e `verify`, e reaplicar a redução máxima ao final. O recibo deste dispositivo mostrou 170/170 daemons gerenciados desativados; mantenha o perfil máximo e não adicione exceções sem uma necessidade comprovada do teste. Só use `simslim doctor --requires` depois de consultar a ajuda dessa versão e informar um recurso válido que o teste realmente exige; uma condução básica de rede não exige daemon extra e deve registrar `not-required` em vez de chamar `doctor --requires` sem argumento. As abas Maestro aceitam a acessibilidade dinâmica, por exemplo `Ranking(, tab, 2 of 5)?` com `index: 0`; não substitua essa forma por um texto fixo.

Os fluxos disponíveis são `apps/mobile/.maestro/login.yaml`, `club.yaml`, `history.yaml` e `auth-link-recovery.yaml`. Depois de incluir módulo nativo, como `react-native-webview`, rode `npx expo prebuild --no-install` e gere um development client novo no checkout dedicado antes do Maestro; não reutilize um binário antigo. A sessão real usa apenas o Supabase local `http://127.0.0.1:55421`, projeto `clube-expo-local`, com contas de fixture e RLS; rejeite qualquer host diferente e nunca use dados de produção. O demo continua sendo a opção para navegação sem credenciais.

## Unit, live, and performance

Unit checks são determinísticos e podem rodar isoladamente:

```sh
npm run test:domain
npm run test:data
npm run test:api
```

O smoke web dedicado desta skill é a prova live demo em 3102. O `npm run test:web` padrão usa a configuração compartilhada da raiz e sua porta própria; execute-o somente em checkout e processos isolados. Testes live autenticados devem usar o Supabase local dedicado e fixtures, com host validado antes de criar o client.

Build e export produzem artefatos de pré-requisito em uma sessão própria; sozinhos não aprovam performance ou release:

```sh
npm run build
npm run export --workspace @clube-do-jogo/mobile
```

As lanes de performance e release estão `not-run` nesta criação para não tocar Metro, simuladores ou processos do root. Não use um build ou export isolado, nem o resultado demo, para declarar RLS, auth real, performance, release ou compatibilidade nativa.

Consulte `features/README.md` para os mapas de feature e invoque `/maintain-verification-skill` quando a superfície, os seletores ou os dispositivos mudarem.
