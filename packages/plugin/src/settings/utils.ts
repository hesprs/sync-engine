import type { Setting, SettingDefinitionItem } from 'obsidian';
import type { CallableOrObjectTree, SettingTree } from '@/modules/Registrar';
import type { TogglableValue } from '@/types';
import { formatFileSize, formatTime, parseFileSize, parseTime } from '@/utils/unit-converter';

type InputType = 'number' | 'time' | 'fileSize';
const WARNING_INTERVAL = 2000;

export function s(
	parent: (self: SettingTree) => SettingDefinitionItem,
	children?: CallableOrObjectTree,
): CallableOrObjectTree {
	return children ? Object.assign(parent, children) : (parent as unknown as CallableOrObjectTree);
}

export function renderTogglableValue({
	placeholder,
	field,
	type,
	saveSettings,
	rejectZero,
	onChange,
	onToggle,
	invalidValue,
}: {
	placeholder: string;
	field: TogglableValue;
	type: InputType;
	saveSettings: () => Promise<void>;
	rejectZero?: boolean;
	onChange?: (value: number) => void;
	onToggle?: (value: boolean) => void;
	invalidValue: string;
}): (setting: Setting) => () => void {
	return (setting) => {
		let timeout: number | undefined;
		setting
			.setClass('sync-engine-togglable-value')
			.addText((text) => {
				text.setPlaceholder(placeholder).setValue(format(field.value, type));
				text.inputEl.addEventListener('blur', () => {
					const value = parse(text.inputEl.value, type);
					if (
						value === undefined ||
						Number.isNaN(value) ||
						value < 0 ||
						(rejectZero && value === 0)
					) {
						text.inputEl.value = format(field.value, type);
						setting.setErrorMessage(invalidValue);
						clearTimeout(timeout);
						timeout = window.setTimeout(() => {
							setting.setErrorMessage('');
						}, WARNING_INTERVAL);
						return;
					}
					if (value !== field.value) {
						field.value = value;
						onChange?.(value);
						void saveSettings();
					}
					text.inputEl.value = format(field.value, type);
				});
			})
			.addToggle((toggle) => {
				toggle.setValue(field.enabled);
				toggle.onChange((value) => {
					if (value !== field.enabled) {
						field.enabled = value;
						onToggle?.(value);
						void saveSettings();
					}
				});
			});
		return () => window.clearTimeout(timeout);
	};
}

function format(value: number, type: InputType): string {
	switch (type) {
		case 'number': {
			return value.toString();
		}
		case 'time': {
			return formatTime(value);
		}
		case 'fileSize': {
			return formatFileSize(value);
		}
	}
}

function parse(value: string, type: InputType): number | undefined {
	switch (type) {
		case 'number': {
			return Number.parseFloat(value);
		}
		case 'time': {
			return parseTime(value);
		}
		case 'fileSize': {
			return parseFileSize(value);
		}
	}
}
