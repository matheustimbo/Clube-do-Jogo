import { NextResponse } from 'next/server';
import { createRequestContext } from '@/lib/supabase/server';
import { activeCatalogKey, catalogLookupFor, findGameByExactTitle, getGameById } from '@/lib/game-catalog';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await createRequestContext();
  if (!userId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: game, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
  if (error || !game) return NextResponse.json({ error: 'Jogo não encontrado.' }, { status: 404 });
  try {
    const lookup = catalogLookupFor(game);
    const metadata = lookup.by === 'id' ? await getGameById(lookup.id)
      : lookup.by === 'title' ? await findGameByExactTitle(lookup.title)
        : null;
    if (!metadata) return NextResponse.json(game);
    const key = activeCatalogKey();
    const patch = {
      [key]: game[key] ?? metadata.id,
      description: metadata.description || game.description,
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
    return NextResponse.json(game);
  }
}
