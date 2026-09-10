# Feature maps

Estes mapas descrevem caminhos que um membro consegue reconhecer na interface e a condução correspondente. Cada mapa separa subfeatures, caminho do ponto de vista do usuário, harness e armadilhas conhecidas.

| Feature | Web | Mobile | Fluxo principal |
| --- | --- | --- | --- |
| [Ranking e voto](./club-ranking.md) | `/jogo-do-mes` → `Ranking` | `club.yaml` | Registrar preferência e motivo |
| [Descoberta e biblioteca](./discovery-library.md) | `Todos os jogos` → `Meus Jogos` | `club.yaml` | Buscar, filtrar e guardar |
| [Perfil e mídia](./profile-media.md) | `Perfil` → detalhe do jogo | `club.yaml` | Ver identidade e mídia |
| [Login e histórico](./auth-history.md) | `/auth/callback` → `Ranking` | `login.yaml`, `history.yaml`, `auth-link-recovery.yaml` | Entrar e consultar ciclo |

Para uma condução repetível, use o helper da skill e os comandos Maestro descritos nos mapas. A execução precisa declarar fixture, commit, device, evidências e qualquer `not-run`.
