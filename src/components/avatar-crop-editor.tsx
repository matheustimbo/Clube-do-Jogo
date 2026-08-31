'use client';

import { useRef, useState } from 'react';
import { RotateCcw, UserRound, ZoomIn } from 'lucide-react';
import type { AvatarCrop } from '@/lib/types';
import { Dialog, DialogContent } from './ui/dialog';
import { avatarImageStyle, DEFAULT_AVATAR_CROP, normalizeAvatarCrop } from './ui/avatar';

export const DEFAULT_AVATAR_SELECTION_CROP: AvatarCrop = { ...DEFAULT_AVATAR_CROP, zoom: 1.1 };

export function AvatarCropEditor({ imageUrl, name, crop: initialCrop, open, saving, onOpenChange, onSave }: {
  imageUrl: string | null;
  name: string;
  crop: AvatarCrop;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (crop: AvatarCrop) => void;
}) {
  const [crop, setCrop] = useState(initialCrop);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; crop: AvatarCrop } | null>(null);

  function moveCrop(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    const preview = previewRef.current;
    if (!start || start.pointerId !== event.pointerId || !preview) return;
    const bounds = preview.getBoundingClientRect();
    setCrop(normalizeAvatarCrop({
      ...start.crop,
      x: start.crop.x - ((event.clientX - start.x) / bounds.width) * 100,
      y: start.crop.y - ((event.clientY - start.y) / bounds.height) * 100,
    }));
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Ajustar avatar" description="Arraste a imagem para enquadrar e use o zoom para aproximar.">
      {imageUrl && <div className="space-y-5 p-5">
        <div
          ref={previewRef}
          onPointerDown={event => {
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={moveCrop}
          onPointerUp={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            dragRef.current = null;
          }}
          onPointerCancel={() => { dragRef.current = null; }}
          className="relative mx-auto aspect-square w-full max-w-[17rem] touch-none overflow-hidden rounded-full border-2 border-violet-300/30 bg-black/30 shadow-[0_0_0_8px_rgba(124,58,237,.08)]"
        >
          <img draggable={false} src={imageUrl} alt={name} style={avatarImageStyle(crop)} className="size-full select-none object-cover" />
          <span className="pointer-events-none absolute inset-0 rounded-full border border-white/20" />
        </div>
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-zinc-300"><UserRound className="size-4 text-violet-300" />{name}</div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-zinc-400"><span className="inline-flex items-center gap-1.5"><ZoomIn className="size-3.5" />Zoom</span><span className="tabular-nums text-zinc-300">{crop.zoom.toFixed(2)}x</span></div>
          <input aria-label="Zoom do avatar" type="range" min="1" max="2.5" step="0.05" value={crop.zoom} onChange={event => setCrop(current => ({ ...current, zoom: Number(event.target.value) }))} className="w-full accent-violet-500" />
        </div>
        <div className="flex gap-2"><button type="button" onClick={() => setCrop(DEFAULT_AVATAR_SELECTION_CROP)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/5 px-3 text-xs font-bold text-zinc-300 transition hover:bg-white/10"><RotateCcw className="size-3.5" />Centralizar</button><button type="button" disabled={saving} onClick={() => onSave(crop)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-extrabold text-white transition hover:bg-violet-500 disabled:opacity-50"><UserRound className="size-3.5" />{saving ? 'Salvando…' : 'Usar avatar'}</button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}
