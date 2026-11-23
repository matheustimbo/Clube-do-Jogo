// O app gravava este texto em games.description quando o catálogo não trazia nenhum,
// e linhas antigas ainda o guardam. Ler como ausente evita uma migration de dados.
const LEGACY_PLACEHOLDER = 'Sem descrição disponível.';

/** A descrição do jogo, ou null quando não há: vazia ou o placeholder antigo. */
export function gameDescription(game: { description?: string | null }): string | null {
  const text = game.description?.trim();
  return text && text !== LEGACY_PLACEHOLDER ? text : null;
}
