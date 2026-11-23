import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// Os termos da RAWG pedem o crédito em toda tela que mostra dados dela. Este teste lê
// o código do app: cada arquivo que toca dado de jogo precisa estar classificado abaixo,
// e cada superfície (tela, sheet, modal de tela cheia) precisa renderizar o crédito.
const MOBILE = path.join(process.cwd(), 'apps/mobile');

/** Telas, sheets e modais que mostram capa, nome, descrição, imagens ou plataformas do catálogo. */
const SURFACES = [
  'app/(app)/(tabs)/jogo-do-mes.tsx',
  'app/(app)/(tabs)/jogos.tsx',
  'app/(app)/(tabs)/perfil.tsx',
  'app/(app)/(tabs)/ranking.tsx',
  'app/(app)/(tabs)/seus-jogos.tsx',
  'app/(app)/jogos/[id].tsx',
  'app/(app)/perfil/[id].tsx',
  'src/components/AddGameToLibrarySheet.tsx',
  'src/components/AddGameToVoteSheet.tsx',
  'src/features/admin/AdminClubPanel.tsx',
  'src/features/admin/ClubGameChangeSheet.tsx',
  'src/features/profile/AvatarCropEditor.tsx',
  'src/features/profile/PlatformPicker.tsx',
  'src/features/voting/VotingDeckGate.tsx',
];

/** Peças que só aparecem dentro de uma superfície, que dá o crédito por elas. */
const PARTS: Record<string, string> = {
  'src/components/GameListRow.tsx': 'GameListRow',
  'src/features/media/MugshotsGrid.tsx': 'MugshotsGrid',
  'src/features/media/ScreenshotsCarousel.tsx': 'ScreenshotsCarousel',
};

/** Tocam um marcador abaixo, mas não mostram dado do catálogo. */
const NOT_CATALOG: Record<string, string> = {
  'src/features/notes/PrivateNotes.tsx': 'a galeria mostra as fotos das notas do membro',
  'src/features/rewards/ReceivedRewards.tsx': 'image_url é a arte da recompensa',
  'src/features/rewards/RewardCelebration.tsx': 'image_url é a arte da recompensa',
};

// O TrailerModal fica de fora de propósito: mostra só o vídeo do YouTube, e a RAWG não
// tem trailer (src/lib/rawg.ts grava trailer_url null).
// Imagem do catálogo também chega por prop em camelCase (imageUrl, coverUrl).
const CATALOG_DATA = /gameCoverUrl\(|<GameListRow|<PlatformRow|useSearchPlatforms|useUserPlatforms|useDiscovery|useAdminGameOptions|useGameMedia|useGameMugshots|useGameOfMonth|useGame\(|useLibrary|useProfile\(|screenshot_urls|<MugshotsGrid|<ScreenshotsCarousel|<ImageGalleryModal|\.image_url|\b\w*(?:[iI]mage|[cC]over|[sS]creenshot)(?:Url|Uri)s?\b/;

/**
 * Sheets e modais de superfície que não mostram nenhum dado do catálogo. Um sheet cobre
 * a tela, então o crédito do rodapé dela não aparece: todo outro sheet ou modal de uma
 * superfície credita o catálogo dentro dele. A chave é `arquivo#title`.
 */
const OVERLAYS_WITHOUT_CATALOG_DATA: Record<string, string> = {
  'app/(app)/(tabs)/jogos.tsx#"Filtros"': 'só os controles de filtro',
  'app/(app)/(tabs)/seus-jogos.tsx#"Ordenar"': 'só as opções de ordem',
  'app/(app)/(tabs)/seus-jogos.tsx#"Filtros"': 'só os controles de filtro',
};

function sources(dir: string): string[] {
  return readdirSync(path.join(MOBILE, dir), { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.tsx'))
    .map(entry => path.relative(MOBILE, path.join(entry.parentPath, entry.name)));
}

const files = [...sources('app'), ...sources('src')];
const read = (file: string) => readFileSync(path.join(MOBILE, file), 'utf8');

test('every file that touches game data is classified', () => {
  const known = new Set([...SURFACES, ...Object.keys(PARTS), ...Object.keys(NOT_CATALOG)]);
  const unclassified = files.filter(file => CATALOG_DATA.test(read(file)) && !known.has(file));
  assert.deepEqual(unclassified, [], 'classifique cada arquivo novo em SURFACES, PARTS ou NOT_CATALOG');
});

test('every surface that shows catalog data credits the catalog', () => {
  const uncredited = SURFACES.filter(file => !read(file).includes('<CatalogAttribution'));
  assert.deepEqual(uncredited, []);
});

/** Cada <Sheet> e <Modal> do arquivo: a chave `arquivo#title` e o JSX até o fechamento dele. */
function overlays(file: string) {
  const source = read(file);
  return [...source.matchAll(/<(Sheet|Modal)\b/g)].map(match => {
    const start = match.index;
    const close = source.indexOf(`</${match[1]}>`, start);
    assert.ok(close > start, `${file}: <${match[1]}> sem fechamento`);
    const opening = source.slice(start, source.indexOf('>', start) + 1);
    const title = opening.match(/\btitle=("[^"]*"|\{[^}]*\})/)?.[1] ?? match[1];
    return { key: `${file}#${title}`, body: source.slice(start, close) };
  });
}

test('every sheet and modal of a surface credits the catalog inside it', () => {
  const found = SURFACES.flatMap(overlays);
  const uncredited = found
    .filter(overlay => !OVERLAYS_WITHOUT_CATALOG_DATA[overlay.key])
    .filter(overlay => !overlay.body.includes('<CatalogAttribution'))
    .map(overlay => overlay.key);
  assert.deepEqual(uncredited, []);
  // Uma exceção que não acha mais o sheet dela esconderia um sheet novo de mesmo título.
  const keys = new Set(found.map(overlay => overlay.key));
  assert.deepEqual(Object.keys(OVERLAYS_WITHOUT_CATALOG_DATA).filter(key => !keys.has(key)), []);
});

test('every part is rendered only inside a credited surface', () => {
  for (const [file, component] of Object.entries(PARTS)) {
    const parents = files.filter(other => other !== file && read(other).includes(`<${component}`));
    assert.ok(parents.length > 0, `${component} não é renderizado em lugar nenhum`);
    assert.deepEqual(parents.filter(parent => !SURFACES.includes(parent)), [], `${component} aparece fora de uma superfície com crédito`);
  }
});

test('the full-screen gallery of a game carries the credit over the images', () => {
  assert.ok(read('src/features/media/ImageGalleryModal.tsx').includes('{footer}'), 'a galeria não renderiza o rodapé');
  assert.ok(read('app/(app)/jogos/[id].tsx').includes('footer={<CatalogAttribution />}'), 'a galeria do jogo abre sem o crédito');
});
