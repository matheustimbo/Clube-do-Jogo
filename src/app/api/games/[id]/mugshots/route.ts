import { NextResponse } from 'next/server';
import { createRequestContext } from '@/lib/supabase/server';
import { catalogLookupFor, findGameByExactTitle, getGameMugshots } from '@/lib/game-catalog';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await createRequestContext();
  if (!userId) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  // '*' e não uma lista: pedir rawg_id num banco sem a migration falharia também sob a IGDB.
  const { data: game, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
  if (error || !game) return NextResponse.json({ error: 'Jogo não encontrado.' }, { status: 404 });

  try {
    const lookup = catalogLookupFor(game);
    const catalogId = lookup.by === 'id' ? lookup.id
      : lookup.by === 'title' ? (await findGameByExactTitle(lookup.title))?.id
        : undefined;
    if (!catalogId) return NextResponse.json({ mugshots: [] });
    return NextResponse.json({ mugshots: await getGameMugshots(catalogId) });
  } catch (value) {
    console.error('Erro ao buscar mugshots do jogo:', value);
    return NextResponse.json({ mugshots: [] });
  }
}
