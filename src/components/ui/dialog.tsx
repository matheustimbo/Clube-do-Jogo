'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Cabeçalho e rodapé ficam sempre à vista; o meio rola quando o diálogo não cabe na tela.
 * O rodapé é onde vai o que não pode sumir, como o crédito do catálogo.
 */
export function DialogContent({ children, className, title, description, footer }: {
  children: React.ReactNode;
  className?: string;
  title: string;
  description?: string;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay animated-overlay fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" />
      <DialogPrimitive.Content className={cn('app-dialog animated-modal fixed left-1/2 top-1/2 z-[81] flex max-h-[min(88dvh,760px)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 shadow-2xl outline-none', className)}>
        <div className="app-dialog-header flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-extrabold text-zinc-50">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="mt-0.5 text-xs text-zinc-400">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close aria-label="Fechar" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-50 active:scale-95">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
