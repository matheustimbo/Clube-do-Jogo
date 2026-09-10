# Administração do jogo do clube por card

## Sub-features

- Definir um jogo como o jogo do ciclo atual direto do próprio cartão, sem passar por um painel separado.
- Encerrar o ciclo atual e definir o jogo escolhido para o próximo mês.
- Ver a confirmação da decisão e desfazê-la (`Desfazer`) logo em seguida.
- Refazer uma decisão desfeita dentro da janela de 5 minutos, ou continuar desfazendo ciclos anteriores.
- Ver o custo exato do desfazer antes de confirmar (comentários, votos, posições de ranking, progresso, anotações, recompensas do ciclo removido).

## How to get to it (user POV)

No web, essa ação só aparece para administrador (`isAdmin`). Em `Ranking`, cada cartão tem um ícone de coroa no canto (`Definir <jogo> como jogo do clube`); no detalhe de um jogo (`Todos os jogos` → cartão), o mesmo diálogo aparece como botão `Gerenciar jogo do clube`. Escolha `Definir/Trocar Jogo de <mês>` ou `Definir <jogo> para <próximo mês>`, confirme, e depois use `Desfazer` no próprio diálogo se precisar reverter.

## Driving it with Playwright

Não há subcomando dedicado; dirija manualmente com uma sessão demo de administrador. Use `aria-label="Definir <jogo> como jogo do clube"` no cartão de `Ranking` ou o botão `Gerenciar jogo do clube` no detalhe (`src/components/club-game-admin-dialog.tsx`). Siga as fases pelo `title` do diálogo: `Definir jogo do clube` → `Confirmar decisão` → `Decisão aplicada`; para desfazer, `Desfazer esta decisão?` → `Decisão desfeita`. Assinale pelo texto de efeito visível em cada fase, nunca por mutação de estado.

## Driving it with Maestro

Nenhum fluxo mobile exercita a ação por cartão hoje: o hook `useClubGameAdminAction` (`apps/mobile/src/features/admin/ClubGameAdminAction.tsx`) existe e reaproveita a mesma folha de mudança (`ClubGameChangeSheet`), mas não está conectado a nenhuma tela ou cartão no momento desta leva. A cobertura mobile existente para essa decisão passa pelo seletor central em Configurações:

```sh
maestro --device <UDID> test apps/mobile/.maestro/admin-cycle.yaml
maestro --device <UDID> test apps/mobile/.maestro/admin-undo.yaml
maestro --device <UDID> test apps/mobile/.maestro/admin-picker-cancel.yaml
```

## Gotchas

- A troca do jogo do ciclo atual apaga os comentários do ciclo; a troca para o próximo mês não apaga nada do ciclo atual.
- `Desfazer` abre uma pré-visualização com contagens exatas (`comments`, `votes`, `ranking_rows`, `progress_snapshots`, `note_snapshots`, `reward_grants`) antes de remover qualquer coisa; não pule essa tela ao provar o fluxo.
- A janela de `Refazer` é 5 minutos e uma nova definição manual cancela a possibilidade de refazer.
- Este recurso só é visível para `isAdmin`; uma sessão sem esse papel não deve nem ver o ícone de coroa ou o botão.
- O hook mobile por cartão não tem cobertura Maestro própria porque não está conectado a nenhuma tela; não afirme paridade mobile-web para esta ação até que ele seja ligado a um cartão e um yaml novo o exercite.
