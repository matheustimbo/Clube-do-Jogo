import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsxElements } from '../support/jsx-elements';

// Os termos da RAWG pedem o crédito em toda tela que mostra dados dela. O crédito do
// layout fica no rodapé da página, e um diálogo cobre a página: todo diálogo que mostra
// capa, nome ou imagem do catálogo credita o catálogo dentro dele, como no app.
const OVERLAYS: Array<{ file: string; tag: string; attribute: [name: string, value: string] }> = [
  { file: 'src/components/quick-voting-deck.tsx', tag: 'div', attribute: ['role', '"dialog"'] },
  { file: 'src/app/ranking/page.tsx', tag: 'DialogContent', attribute: ['title', '"Adicionar jogo à votação"'] },
  { file: 'src/app/seus-jogos/page.tsx', tag: 'DialogContent', attribute: ['title', '"Adicionar a Meus Jogos"'] },
  { file: 'src/components/goty/goty-game-picker-dialog.tsx', tag: 'DialogContent', attribute: ['description', '{subtitle}'] },
  { file: 'src/components/avatar-crop-editor.tsx', tag: 'DialogContent', attribute: ['title', '"Ajustar avatar"'] },
  // A galeria também mostra as fotos das notas; quem abre com imagens do catálogo passa o crédito.
  { file: 'src/components/game-gallery.tsx', tag: 'ImageGalleryDialog', attribute: ['title', '{title}'] },
  { file: 'src/components/game-mugshots.tsx', tag: 'ImageGalleryDialog', attribute: ['title', '{`Mugshots de ${title}`}'] },
];

test('every web dialog that shows catalog data credits the catalog inside it', () => {
  const uncredited = OVERLAYS.filter(({ file, tag, attribute: [name, value] }) => {
    const matches = jsxElements(file, [tag]).filter(element => element.attribute(name) === value);
    assert.equal(matches.length, 1, `${file}: esperava um <${tag} ${name}=${value}>`);
    return !matches[0].renders('CatalogAttribution');
  }).map(({ file, attribute }) => `${file}#${attribute[1]}`);
  assert.deepEqual(uncredited, []);
});

test('the gallery renders the footer it is given over the images', () => {
  const [content] = jsxElements('src/components/game-gallery.tsx', ['Dialog.Content']);
  assert.ok(content, 'a galeria não tem Dialog.Content');
  assert.match(content.text, /\{footer\}/);
});
