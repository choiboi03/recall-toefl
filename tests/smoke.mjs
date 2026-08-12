import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = (await readFile(new URL('../index.html', import.meta.url), 'utf8'))
  .replace(/<script src="app\.js[^\"]*"><\/script>/, '');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://recall.test/', runScripts: 'dangerously' });

dom.window.scrollTo = () => {};
dom.window.eval(app);
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const { document, localStorage } = dom.window;
const click = selector => document.querySelector(selector).click();

function addCard(type, prompt, answer, note) {
  click('[data-view="add"]');
  document.querySelector(`input[name="type"][value="${type}"]`).click();
  document.querySelector('#promptInput').value = prompt;
  document.querySelector('#answerInput').value = answer;
  document.querySelector('#noteInput').value = note;
  document.querySelector('#tagInput').value = 'reading, science';
  document.querySelector('#cardForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}

addCard('word', 'ubiquitous', '어디에나 존재하는', 'Smartphones have become ubiquitous.');
addCard('sentence', 'The results are subject to change.', '결과는 변경될 수 있다.', 'be subject to: ~의 영향을 받다');
addCard('mistake', 'Why did the population decline?', 'Food resources became scarce.', '원인과 결과의 연결을 놓침');

let saved = JSON.parse(localStorage.getItem('recall-toefl-v1'));
assert.equal(saved.cards.length, 3, 'all three card types should be saved');
assert.equal(document.querySelector('#dueCount').textContent, '3', 'all new cards should be due today');

click('#startStudy');
assert.equal(document.querySelector('#studyPrompt').textContent, 'ubiquitous');
assert.equal(document.querySelector('#answerReveal').hidden, true, 'answer should start hidden');
assert.equal(document.querySelector('#ratingPanel').hidden, true, 'ratings should start hidden');
assert.equal(document.querySelector('#studyTag').textContent, '', 'tags should not reveal a hint before SHOW');
click('#showAnswer');
assert.equal(document.querySelector('#answerReveal').hidden, false, 'SHOW should reveal the answer');
assert.equal(document.querySelector('#showAnswer').hidden, true, 'SHOW button should disappear after reveal');
assert.equal(document.querySelector('#ratingPanel').hidden, false, 'SHOW should reveal the ratings');
assert.equal(document.querySelector('#studyNote').textContent, 'Smartphones have become ubiquitous.');
click('[data-rating="master"]');

assert.equal(document.querySelector('#studyType').textContent, 'SENTENCE');
assert.equal(document.querySelector('#studyPrompt').textContent, 'The results are subject to change.');
assert.equal(document.querySelector('#answerReveal').hidden, true, 'sentence details should start hidden');
click('#showAnswer');
assert.equal(document.querySelector('#studyAnswerLabel').textContent, 'INTERPRETATION');
click('[data-rating="master"]');

assert.equal(document.querySelector('#studyType').textContent, 'MISTAKE');
assert.equal(document.querySelector('#studyPrompt').textContent, 'Why did the population decline?');
assert.equal(document.querySelector('#answerReveal').hidden, true, 'mistake details should start hidden');
click('#showAnswer');
assert.equal(document.querySelector('#studyAnswerLabel').textContent, 'CORRECT ANSWER');
click('[data-rating="master"]');

saved = JSON.parse(localStorage.getItem('recall-toefl-v1'));
assert.ok(saved.cards.every(card => card.repetitions === 1), 'MASTER should count as a successful recall');
assert.ok(saved.cards.every(card => card.interval === 1), 'first successful interval should be one day');
assert.ok(saved.cards.every(card => card.ease === 2.6), 'MASTER should increase the ease factor');
assert.equal(saved.history.length, 3, 'all review events should be recorded');

console.log('Smoke test passed: WORD/SENTENCE/MISTAKE → prompt only → SHOW → MASTER → persist.');
