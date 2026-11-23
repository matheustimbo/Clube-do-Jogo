import { connection, NextResponse } from 'next/server';
import { activeCatalogAttribution } from '@/lib/game-catalog';

// Web e app perguntam aqui quem creditar. O provider vem da env do deploy, então
// a resposta é lida no pedido e nunca congelada no build.
export async function GET() {
  await connection();
  return NextResponse.json({ attribution: activeCatalogAttribution() });
}
