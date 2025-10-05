import { createPreferenceStore } from '../preferences';

/**
 * Ctrl+↑/↓でプロンプト履歴をナビゲートするSvelteアクション
 */
export interface PromptHistoryActionOptions {
	/** PreferenceStoreのキー (tweakUi配下) */
	storeKey: string;
	/** テキストエリアのvalue binding */
	valueBinding: { value: string };
	/** 送信トリガー（値が変わると履歴に追加される） */
	submitTrigger?: number;
}

const MAX_HISTORY_SIZE = 50;

export function promptHistory(node: HTMLTextAreaElement | HTMLInputElement, options?: PromptHistoryActionOptions) {
	if (!options) {
		return {
			destroy: () => {},
			addToHistory: () => {}
		};
	}

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

	let lastSubmitTrigger = options.submitTrigger;

	return {
		update(newOptions?: PromptHistoryActionOptions) {
			if (!newOptions) return;

			// submitTriggerが変わったら履歴に追加
			if (newOptions.submitTrigger !== lastSubmitTrigger) {
				lastSubmitTrigger = newOptions.submitTrigger;
				if (newOptions.valueBinding.value.trim()) {
					addToHistory(newOptions.valueBinding.value);
				}
			}
		},
		destroy() {
			node.removeEventListener('keydown', handleKeyDown);
			unsubscribe();
		},
		// 外部から履歴に追加できるメソッドを公開
		addToHistory
	};
}
