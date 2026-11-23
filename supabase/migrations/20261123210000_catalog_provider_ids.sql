-- Gives games a RAWG id of its own, next to igdb_id, so the two catalogs never
-- share a numbering. Additive and idempotent: no existing column changes meaning
-- and no existing row is touched. igdb_id keeps holding IGDB ids only.

-- games is read on every page. Give up after 5s instead of queueing every reader
-- behind this ALTER while it waits for a long transaction to finish.
SET lock_timeout = '5s';

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS rawg_id INTEGER;

-- A full unique index, not a partial one. The game cache upserts with
-- ON CONFLICT (rawg_id), and Postgres only infers a partial index when the
-- ON CONFLICT clause repeats its WHERE, which PostgREST never sends. NULLs stay
-- distinct, so the IGDB rows (rawg_id NULL) never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS games_rawg_id_key ON public.games (rawg_id);

-- user_platforms.igdb_platform_id is deliberately left alone: the RAWG client
-- translates RAWG platform ids into IGDB ids before anything is stored, and
-- drops platforms it cannot translate, so that column keeps one numbering.

-- Outside a transaction (psql -f, the SQL editor) the SET above would last for the
-- whole session.
RESET lock_timeout;

NOTIFY pgrst, 'reload schema';
