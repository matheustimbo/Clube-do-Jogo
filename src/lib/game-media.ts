import { gameDescription } from '@clube-do-jogo/domain';
import type { Game } from './types';

/**
 * A página do jogo pede a rota de mídia quando falta algo que só o detalhe do catálogo
 * traz. A listagem da RAWG não tem descrição, então o jogo que ela gravou cai aqui.
 * platform_ids fica de fora: plataforma sem id da IGDB conferido nunca ganha um.
 */
export function needsMediaEnrichment(game: Game) {
  return !gameDescription(game)
    || (game.screenshot_urls?.length || 0) < 3
    || !game.genres?.length
    || !game.platforms?.length;
}
