import type { TextComponent } from 'obsidian';
import { Notice } from 'obsidian';

export default function handleInput<T, K extends string>({
	text,
	saveSettings,
	processValue,
	stringify = String,
	key,
	settings,
	invalidValue,
}: {
	text: TextComponent;
	saveSettings: () => Promise<void>;
	processValue: (value: string) => T | false;
	key: K;
	settings: NoInfer<Record<K, T>>;
	stringify?: (value: T) => string;
	invalidValue: string;
}) {
	text.inputEl.addEventListener('blur', () => {
		const value = processValue(text.getValue());
		if (value === false) new Notice(invalidValue);
		else if (settings[key] !== value) {
			settings[key] = value;
			void saveSettings();
		}
		text.setValue(stringify(settings[key]));
	});
}
