import { cn, initials } from '@/lib/utils';
import type { AvatarCrop } from '@/lib/types';

export const DEFAULT_AVATAR_CROP: AvatarCrop = { x: 50, y: 50, zoom: 1 };

export function normalizeAvatarCrop(crop?: AvatarCrop | null): AvatarCrop {
  return {
    x: Math.max(0, Math.min(100, Number(crop?.x ?? DEFAULT_AVATAR_CROP.x))),
    y: Math.max(0, Math.min(100, Number(crop?.y ?? DEFAULT_AVATAR_CROP.y))),
    zoom: Math.max(1, Math.min(2.5, Number(crop?.zoom ?? DEFAULT_AVATAR_CROP.zoom))),
  };
}

export function avatarImageStyle(crop?: AvatarCrop | null) {
  const next = normalizeAvatarCrop(crop);
  return { objectPosition: `${next.x}% ${next.y}%`, transform: `scale(${next.zoom})`, transformOrigin: `${next.x}% ${next.y}%` };
}

export function Avatar({ src, name, crop, className }: { src?: string | null; name?: string | null; crop?: AvatarCrop | null; className?: string }) {
  return (
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 text-xs font-bold text-zinc-300', className)}>
      {src ? <img src={src} alt={name || 'Avatar'} style={avatarImageStyle(crop)} className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
