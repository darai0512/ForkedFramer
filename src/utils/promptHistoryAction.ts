import { createPreferenceStore } from '../preferences';

/**
 * Ctrl+↑/↓でプロンプト履歴をナビゲートするSvelteアクション
 */
export interface PromptHistoryActionOptions {
	/** PreferenceStoreのキー (tweakUi配下) */
	storeKey: string;
	/** テキストエリアのvalue binding */
	valueBinding: { value: string };
}

const MAX_HISTORY_SIZE = 50;

export function promptHistory(node: HTMLTextAreaElement | HTMLInputElement, options?: PromptHistoryActionOptions) {
	if (!options) return { destroy: () => {} };

	const { storeKey, valueBinding } = options;
	const historyStore = createPreferenceStore<string[]>('tweakUi', storeKey, []);

	let history: string[] = [];
	let historyIndex = -1;
	let temporaryPrompt = '';

	const unsubscribe = historyStore.subscribe(value => {
		history = value;
	});

	function addToHistory(prompt: string) {
		if (!prompt.trim()) return;

		const filteredHistory = history.filter(item => item !== prompt);
		const newHistory = [prompt, ...filteredHistory];

		if (newHistory.length > MAX_HISTORY_SIZE) {
			newHistory.splice(MAX_HISTORY_SIZE);
		}

		historyStore.set(newHistory);
		historyIndex = -1;
		temporaryPrompt = '';
	}

	function handleKeyDown(event: Event) {
		const keyEvent = event as KeyboardEvent;
		if (!keyEvent.ctrlKey) return;

		if (keyEvent.key === 'ArrowUp') {
			keyEvent.preventDefault();
			navigateHistory('up');
		} else if (keyEvent.key === 'ArrowDown') {
			keyEvent.preventDefault();
			navigateHistory('down');
		}
	}

	function navigateHistory(direction: 'up' | 'down') {
		if (history.length === 0) return;

		// 初めて履歴をナビゲートする場合、現在のプロンプトを保存
		if (historyIndex === -1 && valueBinding.value.trim()) {
			temporaryPrompt = valueBinding.value;
		}

		if (direction === 'up') {
			if (historyIndex < history.length - 1) {
				historyIndex++;
				valueBinding.value = history[historyIndex];
			}
		} else {
			if (historyIndex > -1) {
				historyIndex--;
				if (historyIndex === -1) {
					valueBinding.value = temporaryPrompt;
				} else {
					valueBinding.value = history[historyIndex];
				}
			}
		}
	}

	node.addEventListener('keydown', handleKeyDown);

	// Enterキーでの送信時に履歴に追加
	function handleSubmit(event: Event) {
		const keyEvent = event as KeyboardEvent;
		if (keyEvent.key === 'Enter' && !keyEvent.shiftKey && !keyEvent.ctrlKey && !keyEvent.altKey && !keyEvent.metaKey) {
			const value = valueBinding.value.trim();
			if (value) {
				addToHistory(value);
			}
		}
	}

	node.addEventListener('keydown', handleSubmit);

	return {
		destroy() {
			node.removeEventListener('keydown', handleKeyDown);
			node.removeEventListener('keydown', handleSubmit);
			unsubscribe();
		},
		// 外部から履歴に追加できるメソッドを公開
		addToHistory
	};
}
