/**
 * O que a tela mostra no lugar de uma descrição que não há. O app também gravava este
 * texto em games.description quando o catálogo não trazia nenhum, e linhas antigas ainda
 * o guardam; ler como ausente evita uma migration de dados.
 */
export const NO_DESCRIPTION_TEXT = 'Sem descrição disponível.';

/** A descrição do jogo, ou null quando não há: vazia ou o placeholder antigo. */
export function gameDescription(game: { description?: string | null }): string | null {
  const text = game.description?.trim();
  return text && text !== NO_DESCRIPTION_TEXT ? text : null;
}
