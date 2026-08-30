'use client';

import { useState } from 'react';
import { Check, UserRound } from 'lucide-react';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';

interface Mugshot {
  id: number;
  name: string;
  image_url: string;
}

export function GameMugshots({ gameId, title }: { gameId: string; title: string }) {
  const { isDemo, profile, updateProfile, notify } = useApp();
  const [updatingUrl, setUpdatingUrl] = useState<string | null>(null);
  const query = useStaleQuery<{ mugshots: Mugshot[] }>(
    `game-mugshots:${gameId}`,
    async () => {
      const response = await fetch(`/api/games/${gameId}/mugshots`);
      if (!response.ok) throw new Error('Não foi possível buscar os personagens.');
      return response.json();
    },
    !isDemo,
    { staleTime: 300_000 },
  );
  const mugshots = query.data?.mugshots || [];

  async function chooseAvatar(mugshot: Mugshot) {
    if (updatingUrl || profile?.avatar_url === mugshot.image_url) return;
    setUpdatingUrl(mugshot.image_url);
    const saved = await updateProfile({ avatar_url: mugshot.image_url });
    setUpdatingUrl(null);
    if (saved) notify(`${mugshot.name} agora representa seu perfil.`);
  }

  if (isDemo || (!query.isInitialLoading && !mugshots.length)) return null;

  return (
    <section className="game-detail-surface game-detail-mugshots overflow-hidden rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2"><UserRound className="size-4 text-zinc-400" /><h2 className="text-base font-black tracking-tight">Mugshots</h2></div>
      {query.isInitialLoading ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-white/[.06]" />)}</div> : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {mugshots.map(mugshot => {
            const selected = profile?.avatar_url === mugshot.image_url;
            const updating = updatingUrl === mugshot.image_url;
            return <article key={mugshot.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-white/8 bg-black/20">
              <img src={mugshot.image_url} alt={mugshot.name} className="size-full object-cover transition duration-300 group-hover:scale-105" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-8"><span className="block truncate text-[10px] font-extrabold text-white">{mugshot.name}</span></div>
              <button type="button" disabled={updating || selected} onClick={() => void chooseAvatar(mugshot)} aria-label={selected ? `${mugshot.name} é seu avatar atual` : `Usar ${mugshot.name} como avatar`} title={selected ? 'Avatar atual' : 'Usar como avatar'} className={`absolute right-2 top-2 grid size-8 place-items-center rounded-full border shadow-lg transition disabled:cursor-default ${selected ? 'border-emerald-300/40 bg-emerald-500 text-white' : 'border-white/15 bg-black/65 text-white hover:bg-violet-600'}`}>
                {selected ? <Check className="size-4" /> : <UserRound className={`size-4 ${updating ? 'animate-pulse' : ''}`} />}
              </button>
            </article>;
          })}
        </div>
      )}
      <p className="mt-4 text-[10px] font-medium text-zinc-500">Personagens associados a {title} pela IGDB.</p>
    </section>
  );
}
