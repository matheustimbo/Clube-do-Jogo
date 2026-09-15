import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * O projeto assina os JWTs com ES256, então getClaims confere a assinatura contra
 * o JWKS em cache sem sair da máquina, enquanto getUser custava uma ida e volta ao
 * Supabase em toda rota. A troca tem preço: um token continua válido até expirar
 * mesmo depois de sair da conta, porque ninguém mais pergunta ao servidor. Se o
 * projeto voltar a assinar com chave simétrica, o próprio getClaims cai de novo no
 * getUser, então a checagem nunca fica frouxa por acidente.
 */
export async function authenticatedUserId(supabase: SupabaseClient, authorization: string | null): Promise<string | null> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  const { data, error } = await supabase.auth.getClaims(bearer);
  if (error || !data) return null;
  const sub = data.claims.sub;
  return typeof sub === 'string' && sub ? sub : null;
}
