import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentMime } from '../src/ai/attachmentTypes.ts';

test('accepts PDFs, images and text, rejects Office files', () => {
  assert.equal(attachmentMime('spec.pdf', 'application/pdf'), 'application/pdf');
  assert.equal(attachmentMime('photo.JPG'), 'image/jpeg');
  assert.equal(attachmentMime('x.jpg', 'image/jpg'), 'image/jpeg');
  assert.equal(attachmentMime('notes.md', 'application/octet-stream'), 'text/markdown');
  assert.equal(attachmentMime('data.csv', 'text/comma-separated-values'), 'text/comma-separated-values');
  assert.equal(attachmentMime('plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), null);
  assert.equal(attachmentMime('budget.xlsx'), null);
});
