import test from 'node:test';
import assert from 'node:assert/strict';
import {localSpeechText, localSpeechLines} from '../shared/local-speech.mjs';

test('local Chinese speech reads percentages instead of dropping the percent sign', () => {
  assert.equal(localSpeechText('100 元先涨 20%，再降 20%。', 'zh'),
    '100 元先涨 百分之二十，再降 百分之二十。');
  assert.equal(localSpeechText('１２.５ ％与0.4%。', 'zh'), '百分之十二点五与百分之零点四。');
});
test('local normalization preserves English and nonnumeric Chinese scripts', () => {
  assert.equal(localSpeechText('An increase of 20%.', 'en'), 'An increase of 20%.');
  assert.equal(localSpeechText('基数不同，变化不同。', 'zh'), '基数不同，变化不同。');
});
test('monolingual narration retains actual sentence boundaries', () => {
  assert.deepEqual(localSpeechLines('先涨到120元。再减24元！为什么？', 'zh'),
    ['先涨到120元。', '再减24元！', '为什么？']);
  assert.deepEqual(localSpeechLines('The price is 1.20 dollars. Then it falls.', 'en'),
    ['The price is 1.20 dollars.', 'Then it falls.']);
});
