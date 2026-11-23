import { NextResponse } from 'next/server';
import { gameDescription } from '@clube-do-jogo/domain';
import { createRequestContext } from '@/lib/supabase/server';
import { activeCatalogKey, CatalogSchemaError, catalogLookupFor, findGameByTitle, getGameById } from '@/lib/game-catalog';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await createRequestContext();
  if (!userId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: game, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
  if (error || !game) return NextResponse.json({ error: 'Jogo não encontrado.' }, { status: 404 });
  try {
    const lookup = catalogLookupFor(game);
    // A busca por título devolve o jogo da listagem, que na RAWG vem sem descrição.
    const catalogId = lookup.by === 'id' ? lookup.id
      : lookup.by === 'title' ? (await findGameByTitle(lookup))?.id
        : undefined;
    const metadata = catalogId ? await getGameById(catalogId) : null;
    if (!metadata) return NextResponse.json(game);
    const key = activeCatalogKey();
    const patch = {
      [key]: game[key] ?? metadata.id,
      description: metadata.description || gameDescription(game),
      image_url: metadata.image_url || game.image_url,
      screenshot_urls: metadata.screenshot_urls,
      // Catálogo sem trailer (a RAWG não tem YouTube) não apaga o que já estava gravado.
      trailer_url: metadata.trailer_url ?? game.trailer_url,
      genres: metadata.genres,
      platforms: metadata.platforms,
      platform_ids: metadata.platform_ids,
      average_rating: metadata.average_rating ?? game.average_rating,
      release_year: metadata.release_year ?? game.release_year,
      duration_hours: metadata.duration_hours || game.duration_hours,
    };
    const { data: updated, error: updateError } = await supabase.from('games').update(patch).eq('id', id).select().single();
    if (updateError) throw updateError;
    return NextResponse.json(updated);
  } catch (value) {
    console.error('Erro ao enriquecer mídia do jogo:', value);
    // O banco sem a coluna do catálogo ativo é erro de deploy, não um jogo sem mídia.
    if (value instanceof CatalogSchemaError) return NextResponse.json({ error: value.message }, { status: 500 });
    return NextResponse.json(game);
  }
}
