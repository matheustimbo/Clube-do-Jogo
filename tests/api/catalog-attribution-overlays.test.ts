import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { jsxElements, type JsxElementInfo } from '../support/jsx-elements';

// Os termos da RAWG pedem o crédito em toda tela que mostra dados dela. O crédito do
// layout fica no rodapé da página, e um diálogo cobre a página: todo diálogo que mostra
// capa, imagem, descrição, resultados do catálogo ou plataformas credita o catálogo
// dentro dele, como no app. O nome de um jogo numa frase não conta, como no app
// (RewardCelebration fica em NOT_CATALOG no teste do mobile). O teste acha os diálogos
// pelo parser do TypeScript, então um diálogo novo entra sozinho.

/** O que abre um diálogo na web: o DialogContent do app, a galeria e o Content do Radix. */
const DIALOG_TAGS = ['DialogContent', 'ImageGalleryDialog', 'Dialog.Content', 'DialogPrimitive.Content'];
const TITLE_TAGS = ['Dialog.Title', 'DialogPrimitive.Title'];

/** Diálogos sem dado do catálogo, cada um com o motivo. A chave é `arquivo#título`. */
const WITHOUT_CATALOG_DATA: Record<string, string> = {
  'src/components/ui/dialog.tsx#{title}': 'a moldura do DialogContent; cada uso dela é conferido aqui',
  'src/components/game-gallery.tsx#Galeria de {title}': 'a moldura da galeria; cada uso dela é conferido aqui',
  'src/components/notes-chat.tsx#"anotações"': 'a galeria mostra as fotos das notas do membro',
  'src/components/participants-dialog.tsx#"Participantes"': 'só os membros que votaram ou terminaram',
  'src/components/preference-participants-dialog.tsx#"Escolhas do clube"': 'só os membros e os motivos deles',
  'src/components/vote-reason-dialog.tsx#"Por que você não jogaria?"': 'só os motivos para escolher',
  'src/components/profile-view.tsx#"Editar perfil"': 'nome e bio do membro',
  "src/app/admin/page.tsx#{nextRole === 'admin' ? 'Conceder cargo de admin?' : 'Remover cargo de admin?'}": 'o cargo de um membro',
  'src/app/jogos/page.tsx#"Filtros"': 'só os controles de filtro',
  'src/app/seus-jogos/page.tsx#"Filtros"': 'só os controles de filtro',
  'src/app/seus-jogos/page.tsx#"Remover de Meus Jogos"': 'só o nome do jogo, na confirmação',
  "src/components/goty/goty-bolao-tab.tsx#{isConfirmed ? 'Suas previsões confirmadas' : 'Revisar meu Bolão GOTY 2026'}": 'os indicados do The Game Awards que o clube cadastrou, não o catálogo',
  "src/components/goty/goty-bolao-tab.tsx#{inspectEntry ? `Palpites de ${inspectEntry.profile.name || 'Membro'}` : 'Palpites'}": 'os indicados do The Game Awards que o clube cadastrou, não o catálogo',
  'src/components/product-update-dialog.tsx#{update.title}': 'as novidades do app',
  'src/components/reward-celebration.tsx#Você recebeu uma recompensa!': 'a arte da recompensa; o jogo só aparece pelo nome, na frase do prêmio',
  'src/components/timeline.tsx#Apagar comentário?': 'a confirmação de apagar um comentário',
  'src/components/timeline.tsx#Reações': 'os membros que reagiram',
};

const files = readdirSync('src', { withFileTypes: true, recursive: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.tsx'))
  .map(entry => path.join(entry.parentPath, entry.name));

/** O texto entre a abertura e o fechamento de um elemento. */
function inner(element: JsxElementInfo) {
  return element.text.replace(/^<[^>]*>/, '').replace(/<\/[^>]*>$/, '').trim();
}

/** Cada diálogo do arquivo, com a chave `arquivo#título` pelo título que a pessoa lê nele. */
function dialogsOf(file: string) {
  const titles = jsxElements(file, TITLE_TAGS);
  const dialogs = [
    ...jsxElements(file, DIALOG_TAGS),
    ...jsxElements(file, ['div']).filter(element => element.attribute('role') === '"dialog"'),
  ];
  return dialogs.map(element => {
    const titleChild = titles.find(title => element.text.includes(title.text));
    const title = element.attribute('title') ?? (titleChild ? inner(titleChild) : element.attribute('aria-labelledby') ?? element.tag);
    return { key: `${file}#${title}`, element };
  });
}

const dialogs = files.flatMap(dialogsOf);

test('every web dialog that shows catalog data credits the catalog inside it', () => {
  const uncredited = dialogs
    .filter(({ key }) => !WITHOUT_CATALOG_DATA[key])
    .filter(({ element }) => !element.renders('CatalogAttribution'))
    .map(({ key }) => key);
  assert.deepEqual(uncredited, []);
});

test('a DialogContent or gallery credit sits in the footer, which the dialog always shows', () => {
  // No corpo, que rola, o crédito sai da área visível numa tela baixa.
  const inBody = dialogs
    .filter(({ element }) => ['DialogContent', 'ImageGalleryDialog'].includes(element.tag) && element.renders('CatalogAttribution'))
    .filter(({ element }) => !element.attribute('footer')?.includes('<CatalogAttribution'))
    .map(({ key }) => key);
  assert.deepEqual(inBody, []);
});

test('every exception still names a dialog, and each key names one dialog', () => {
  const keys = dialogs.map(({ key }) => key);
  // Uma exceção que não acha mais o diálogo dela esconderia um diálogo novo de mesmo título.
  assert.deepEqual(Object.keys(WITHOUT_CATALOG_DATA).filter(key => !keys.includes(key)), []);
  assert.deepEqual(keys.filter((key, index) => keys.indexOf(key) !== index), []);
});

test('the dialog frames render the footer they are given', () => {
  const [gallery] = jsxElements('src/components/game-gallery.tsx', ['Dialog.Content']);
  const [content] = jsxElements('src/components/ui/dialog.tsx', ['DialogPrimitive.Content']);
  assert.match(gallery.text, /\{footer\}/);
  assert.match(content.text, /\{footer\}/);
});
