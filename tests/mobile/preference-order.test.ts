import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voteChoices, voteChoiceLabels } from '@clube-do-jogo/domain';
import { preferenceOptions } from '../../apps/mobile/src/components/preference-options';

test('o botão fica na mesma ordem do contador acima dele', () => {
  assert.deepEqual(preferenceOptions.map(option => option.value), voteChoices);
});

test('a ordem canônica começa pelo positivo, como o placar', () => {
  assert.deepEqual(voteChoices, ['would_play', 'would_not_play']);
  assert.equal(voteChoiceLabels.would_play, 'Jogaria');
  assert.equal(voteChoiceLabels.would_not_play, 'Não');
});
