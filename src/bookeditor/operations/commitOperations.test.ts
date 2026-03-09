import { afterEach, describe, expect, it } from 'vitest';
import { newBook, commitBook } from '../../lib/book/book';
import { FocusKeeper } from '../../lib/layeredCanvas/tools/focusKeeper';
import { mainBook } from '../workspaceStore';
import { commit, delayedCommiter, undoBookState } from './commitOperations';

describe('undoBookState', () => {
  afterEach(() => {
    delayedCommiter.cancel();
    mainBook.set(null);
  });

  it('does not skip the latest committed state when a delayed commit is pending', () => {
    const book = newBook('test-book', 'initial-', 'standard', null);
    mainBook.set(book);

    book.pages[0].frameWidth = 10;
    commitBook(book, null);

    book.pages[0].frameWidth = 20;
    commit('bubble');

    undoBookState(new FocusKeeper());

    expect(book.pages[0].frameWidth).toBe(10);
    expect(book.history.cursor).toBe(2);
  });
});
