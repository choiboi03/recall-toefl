import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = (await readFile(new URL('../index.html', import.meta.url), 'utf8'))
  .replace('<script src="app.js"></script>', '');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://recall.test/', runScripts: 'dangerously' });

dom.window.scrollTo = () => {};
dom.window.eval(app);
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

const { document, localStorage } = dom.window;
const click = selector => document.querySelector(selector).click();

click('[data-view="add"]');
document.querySelector('#promptInput').value = 'ubiquitous';
document.querySelector('#answerInput').value = '어디에나 존재하는';
document.querySelector('#noteInput').value = 'Smartphones have become ubiquitous.';
document.querySelector('#tagInput').value = 'reading, science';
document.querySelector('#cardForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

let saved = JSON.parse(localStorage.getItem('recall-toefl-v1'));
assert.equal(saved.cards.length, 1, 'a new card should be saved');
assert.equal(document.querySelector('#dueCount').textContent, '1', 'a new card should be due today');

click('#startStudy');
assert.equal(document.querySelector('#studyPrompt').textContent, 'ubiquitous');
click('#studyCard');
assert.equal(document.querySelector('.answer-face').hidden, false, 'answer should be revealed');
click('[data-rating="master"]');

saved = JSON.parse(localStorage.getItem('recall-toefl-v1'));
assert.equal(saved.cards[0].repetitions, 1, 'MASTER should count as a successful recall');
assert.equal(saved.cards[0].interval, 1, 'first successful interval should be one day');
assert.equal(saved.cards[0].ease, 2.6, 'MASTER should increase the ease factor');
assert.equal(saved.history.length, 1, 'a review event should be recorded');

console.log('Smoke test passed: create → study → reveal → MASTER → persist.');
