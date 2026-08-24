import type {
	ExtraButtonComponent,
	Setting,
	SettingDefinition,
	SettingDefinitionGroup,
	SettingDefinitionList,
	SettingDefinitionPage,
	TextComponent,
} from 'obsidian';
import type { DatabaseSync } from 'uni-kv';
import { encodeURIComponent3986 } from '@repo/shared/path';
import { setIcon } from 'obsidian';
import type { CallableOrObjectTree, SettingTree } from '@/modules/Setting';
import type { General, TogglableValue } from '@/types';
import { formatFileSize, formatTime, parseFileSize, parseTime } from '@/utils/unit-converter';

type InputType = 'number' | 'time' | 'fileSize';
type EphemeralEditableItem<T> = {
	valid: boolean;
	new: boolean;
	value: T;
};
type EphemeralEditableListSchema = {
	ephemeralEditableLists: Array<EphemeralEditableItem<General>>;
};
export type AugmentedSettingDefinitionItem<K extends string = string> =
	| SettingDefinitionGroup<K>
	| SettingDefinitionList<K>
	| (SettingDefinitionPage<K> & { labels?: Array<LabelDefinition> })
	| (SettingDefinition<K> & { labels?: Array<LabelDefinition> });
export type LabelDefinition = {
	text: string;
	tooltip: string;
	color?: string;
	textColor?: string;
};

export function s(
	parent: (self: SettingTree) => AugmentedSettingDefinitionItem,
	children?: CallableOrObjectTree,
): CallableOrObjectTree {
	return children ? Object.assign(parent, children) : (parent as never);
}

function setWarningIfNotExist(): void {
	const name = '--sync-engine-warning';
	if (activeDocument.body.style.getPropertyValue(name)) return;
	const dummy = createDiv();
	setIcon(dummy, 'triangle-alert');
	(dummy.firstElementChild as SVGSVGElement).setAttr(
		'stroke',
		getComputedStyle(activeDocument.body).getPropertyValue('--text-warning'),
	);
	activeDocument.body.style.setProperty(
		name,
		`url("data:image/svg+xml,${encodeURIComponent3986(dummy.innerHTML)}")`,
	);
}

export function reactivelyValidate<T>({
	text,
	parse,
	onSave,
	format = String,
	immediate = false,
}: {
	text: TextComponent;
	parse: (value: string) => T | undefined;
	format?: (value: T) => string;
	onSave: (value: T) => void;
	immediate?: boolean;
}) {
	setWarningIfNotExist();
	let validValue: T | undefined;
	const invalid = 'sync-engine-invalid-input';
	const handleInput = (value: string) => {
		validValue = parse(value);
		if (validValue === undefined) text.inputEl.addClass(invalid);
		else text.inputEl.removeClass(invalid);
	};
	text.onChange(handleInput).inputEl.addEventListener('blur', () => {
		if (validValue === undefined) return;
		onSave(validValue);
		text.setValue(format(validValue));
	});
	if (immediate) handleInput(text.getValue());
}

export function renderTogglableValue({
	placeholder,
	field,
	type,
	saveSettings,
	rejectZero,
	onChange,
	onToggle,
}: {
	placeholder: string;
	field: TogglableValue;
	type: InputType;
	saveSettings: () => Promise<void>;
	rejectZero?: boolean;
	onChange?: (value: number) => void;
	onToggle?: (value: boolean) => void;
}): (setting: Setting) => void {
	return (setting) => {
		setting
			.setClass('sync-engine-togglable-value')
			.addText((text) => {
				text.setPlaceholder(placeholder).setValue(formatType(field.value, type));
				reactivelyValidate<number>({
					format: (value) => formatType(value, type),
					onSave: (value) => {
						field.value = value;
						onChange?.(value);
						void saveSettings();
					},
					parse: (value) => {
						const parsedValue = parseType(value, type);
						if (
							parsedValue === undefined ||
							Number.isNaN(parsedValue) ||
							parsedValue < 0 ||
							(rejectZero && parsedValue === 0)
						)
							return;
						return parsedValue;
					},
					text,
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
	};
}

export function generateEditableList<T>({
	memoryDB,
	items,
	identifier,
	saveSettings,
	rerenderSettingTab,
	defaultValue,
	render,
	translations: { add, empty, heading },
	extraButtons,
}: {
	memoryDB: DatabaseSync<EphemeralEditableListSchema>;
	items: Array<T>;
	identifier: string;
	saveSettings: () => Promise<void>;
	rerenderSettingTab: () => void;
	defaultValue: T;
	render: (
		setting: Setting,
		item: EphemeralEditableItem<T>,
		save: () => void,
	) => void | (() => void);
	translations: { add: string; empty: string; heading?: string };
	extraButtons?: Array<
		(
			button: ExtraButtonComponent,
			list: Array<EphemeralEditableItem<T>>,
			save: () => void,
		) => void
	>;
}): SettingDefinitionList {
	const ephemeralStore = memoryDB.getStore('ephemeralEditableLists');
	const existingList = ephemeralStore.get(identifier);
	let list: Array<EphemeralEditableItem<T>>;
	if (existingList) list = existingList;
	else {
		list = items.map((value) => ({ new: false, valid: true, value }));
		ephemeralStore.set(identifier, list);
	}
	const saveEdit = () => {
		const newList = list.filter(({ valid }) => valid).map(({ value }) => value);
		if (JSON.stringify(newList) === JSON.stringify(items)) return;
		items.length = 0;
		items.push(...newList);
		void saveSettings();
	};
	return {
		addItem: {
			action: () => {
				list.push({ new: true, valid: false, value: structuredClone(defaultValue) });
				rerenderSettingTab();
			},
			name: add,
		},
		emptyState: empty,
		extraButtons: extraButtons
			? extraButtons.map((fn) => (button: ExtraButtonComponent) => fn(button, list, saveEdit))
			: undefined,
		heading,
		items: list.map((item) => ({
			name: '',
			render: (setting) => {
				setting.settingEl.addClass('sync-engine-editable-list');
				setting.settingEl.querySelector('.setting-item-control')?.addClass('w-100%!');
				return render(setting, item, saveEdit);
			},
			searchable: false,
		})),
		onDelete: (index) => {
			list.splice(index, 1);
			saveEdit();
			rerenderSettingTab();
		},
		type: 'list',
	};
}

function formatType(value: number, type: InputType): string {
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

function parseType(value: string, type: InputType): number | undefined {
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
