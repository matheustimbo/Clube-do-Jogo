import type { Game } from './types';

/**
 * A página do jogo pede a rota de mídia quando falta algo que só o detalhe do catálogo
 * traz. A listagem da RAWG não tem descrição, então o jogo que ela gravou cai aqui.
 */
export function needsMediaEnrichment(game: Game) {
  return !game.description
    || (game.screenshot_urls?.length || 0) < 3
    || !game.genres?.length
    || !game.platforms?.length
    || !game.platform_ids?.length;
}
