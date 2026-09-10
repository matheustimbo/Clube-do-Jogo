# Login e histórico

## Sub-features

- Entrar e criar conta com Supabase.
- Receber callback PKCE em `clubedojogo://auth/callback`.
- Restaurar sessão após foreground do app.
- Consultar ciclos anteriores em modo somente leitura.
- Rejeitar links de recuperação expirados sem corromper a sessão.

## How to get to it (user POV)

No web, use o callback permitido pelo ambiente e depois entre em `Ranking`. No Expo, abra o dev client com Metro foreground, faça login e aguarde o jogo do mês. No seletor de ciclo, escolha um mês anterior e confirme que progresso e voto aparecem como históricos e desabilitados. Para um link inválido, confirme a mensagem de expiração e retorne à sessão.

## Driving it with Maestro

```sh
maestro --device emulator-5580 test apps/mobile/.maestro/login.yaml
maestro --device emulator-5580 test apps/mobile/.maestro/history.yaml
maestro --device emulator-5580 test apps/mobile/.maestro/auth-link-recovery.yaml
```

No iOS, preserve seletores de aba como `Jogo do mês(, tab, 1 of 5)?` e `Ranking(, tab, 2 of 5)?`, com `index: 0`. Passe `-e TEST_EMAIL=... -e TEST_PASSWORD=...` somente com fixtures do Supabase local dedicado. A execução mobile desta criação é `not-run` por ownership do root.

## Gotchas

- A URL do callback precisa ser `clubedojogo://auth/callback` e o dev client precisa estar foreground com Metro alcançável.
- Testes reais aceitam exclusivamente `http://127.0.0.1:55421` e o projeto `clube-expo-local`; qualquer URL pública é erro.
- Não faça logout global nem reutilize o simulador ou emulador que outra sessão está dirigindo.
- iOS pode inserir `, tab, n of 5` no texto; use a regex documentada.
- Expo Doctor 20/21 com a divergência React conhecida é aviso, não aprovação completa.
