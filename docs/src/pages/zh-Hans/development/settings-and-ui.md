# 设置与界面

Sync Engine 的设置使用 Obsidian 的设置定义。模块可以在不拥有插件设置页的情况下贡献嵌套分组、页面、列表、控件和自定义渲染的设置。本页也介绍模块 UI 使用的翻译和迁移辅助。

## 嵌套设置注册

用 `registerSetting()` 注册一棵设置树。每棵树描述设置页的一个分支。顶层 `priority` 决定哪棵设置先合并；`apply` 内的数字键在每一层排序条目，并告诉 Sync Engine 分支应合并到哪里。

```ts
type SettingEntry = {
  priority: number;
  apply: CallableOrObjectTree;
};

ctx.registerSetting(entry: SettingEntry): () => boolean;
```

### 可扩展的设置树

传给 `apply` 的值是一个嵌套对象。每个数字键指向另一个嵌套对象，或一个返回单个 Obsidian 设置定义的回调：

```ts
type CallableOrObjectTree =
  { [order: number]: CallableOrObjectTree } | ((self: SettingTree) => SettingDefinitionItem);
```

Sync Engine 从最小的数字键到最大的键遍历这个对象，把回调渲染为 Obsidian 设置。数字键不是设置名称、持久化的设置键或数值控件的值。它们只提供同级顺序，并标识扩展插入的分支。它们不需要连续：

```ts
{
  1000: /* first item */,
  3000: /* second item */, // 2000 is not required
}
```

当注册在同一层级包含相同的键时，Sync Engine 合并它们的子项。这是这个 API 的关键能力：模块可以扩展一个已有的嵌套分组，而不用替换这个分组或拥有设置页。合并后，原有的父回调仍然负责渲染所有子项。

例如，核心设置可以在 `1000` 注册一个 Features 分组：

```ts
{
  1000: settingEntry(
    (self) => ({
      heading: 'Features',
      items: Object.values(self).map((node) => node(node)),
      type: 'group',
    }),
    {
      1000: settingEntry(() => ({ name: 'Realtime sync', control: { key: 'realtime', type: 'toggle' } })),
    },
  ),
}
```

加密模块通过返回一棵带相同路径键和新的子键的树来扩展该分组：

```ts
{
  1000: {
    6037: settingEntry(() => ({
      name: 'Encryption',
      render: (setting) => {
        // Add encryption password and toggle controls here.
      },
    })),
  },
}
```

合并后，原有的 `1000` 分组回调看到两个子项：

```text
1000  Features (group)
├── 1000  Realtime sync
└── 6037  Encryption
```

第一个 `1000` 标识分组。子级的 `1000` 和 `6037` 键为分组内的设置排序。模块注册的 `priority` 控制它的根树何时与其他注册合并；它与树内的数字键无关。

同时定义父项和子项时，使用 SDK 的 `settingEntry()` 辅助函数。它把子树挂到父回调上。父项在所有扩展合并完成后接收完整的节点：

```ts
import { settingEntry } from '@hesprs/sync-engine-sdk';
import type { CallableOrObjectTree, Context } from '@hesprs/sync-engine-sdk';
import type { SettingGroupItem } from 'obsidian';

export default function mySettings(
  ctx: Context,
  settings: { enabled: boolean },
): CallableOrObjectTree {
  return {
    2000: settingEntry(
      (self) => ({
        heading: ctx.translate('mySettings'),
        items: Object.values(self).map((node) => node(node) as SettingGroupItem),
        type: 'group',
      }),
      {
        1000: settingEntry(() => ({
          control: { key: 'enabled', type: 'toggle' },
          name: ctx.translate('enabled'),
        })),
      },
    ),
  };
}
```

这个示例产出一个包含 **Enabled** 开关的 **My settings** 分组：

```text
2000  My settings (group)
└── 1000  Enabled (toggle)
```

两个键属于不同的层级，所以互不冲突。如果另一个模块在同一分组节点下 `2000` 处添加一个子项，合并后的分组按此顺序包含两个子项：

```text
2000  My settings (group)
├── 1000  Enabled
└── 2000  Another setting
```

在模块启动时注册返回的树，在卸载时移除：

```ts
const removeSettings = ctx.registerSetting({
  apply: mySettings(ctx, this.moduleSettings),
  priority: 1355,
});
this.cleanup.push(removeSettings);
```

`group` 用于一个标题及其子项，`page` 用于独立的设置页面，`list` 用于可编辑的重复条目，普通设置定义使用 `control` 或 `render`。父回调必须把子回调转换成 Obsidian 期望的 `items`，如上文 `Object.values(self).map((node) => node(node))` 所示。

核心设置区块使用这些优先级：

| 区块     | 优先级 | 内容                                                       |
| -------- | -----: | ---------------------------------------------------------- |
| 顶部配置 |    `0` | 后端、模块管理、自动更新、同步策略、冲突解决器。           |
| 功能     | `1000` | 实时、启动、定时、聚焦同步；实时同步快速模式；非对称存储。 |
| 控制项   | `2000` | 文件大小、请求并发、请求间隔上限。                         |
| 其他     | `3000` | 自定义请求头、移动端通知、离线行为、任务和删除确认。       |
| 开发     | `4000` | 记录清理、日志导出和模块源页面。                           |

模块贡献的设置在模块加载时加入，模块卸载时移除。两个事件之后设置页都会刷新。

## 设置标签

Obsidian 的设置定义不包含标签。Sync Engine 给普通设置和页面定义附加一个 `labels` 属性，然后把每个标签渲染为设置名称旁边的彩色徽章。每个标签有文本和工具提示，可选 `color` 和 `textColor` 值：

```ts
import type { LabelDefinition } from '@hesprs/sync-engine-sdk';

const labels: Array<LabelDefinition> = [
  { text: 'Match', tooltip: 'This setting must be kept the same on all devices.' },
];
```

把标签加到树回调返回的设置定义上：

```ts
const matchLabel = ctx.matchLabel();

return settingEntry(() => ({
  control: { key: 'baseDirectory', type: 'text' },
  labels: [matchLabel],
  name: 'Base directory',
}));
```

模块通常直接使用 context 里现成的标签工厂，让文本、颜色和翻译与核心设置一致：

```ts
const { matchLabel, speedLabel } = ctx;

return settingEntry(() => ({
  labels: [matchLabel(), speedLabel()],
  name: 'Chunk size',
  render: (setting) => {
    // Render the setting control here.
  },
}));
```

Sync Engine 当前提供这些标签：

| 标签      | 含义                               |
| --------- | ---------------------------------- |
| **Match** | 该设置在所有设备上应保持相同的值。 |
| **Speed** | 正确的配置可以提升同步速度。       |

设置需要模块专属的解释时，使用自定义 `LabelDefinition`。标签只描述设置；它们不改变设置的值、校验或同步行为。

## 响应式输入校验

`reactivelyValidate()` 给设置的文本输入附加实时校验。它每次变更都解析值，用警告样式标记无效输入，并只在输入失去焦点时保存解析后的值：

```ts
import { reactivelyValidate } from '@hesprs/sync-engine-sdk';

setting.addText((text) => {
  text.setValue(settings.name);
  reactivelyValidate<string>({
    onSave: (value) => {
      settings.name = value;
      void saveSettings();
    },
    parse: (value) => value.trim(),
    text,
  });
});
```

`parse` 可以返回任何类型。返回 `undefined` 表示输入无效，例如 `parse: (value) => Number.parseFloat(value) || undefined` 会拒绝非数字输入。`format`（默认 `String`）在保存时重新显示解析后的值，`immediate: true` 在装配时先校验一次初始值。

## 可编辑列表

`generateEditableList()` 为可重复编辑的条目生成 Obsidian 的 `list` 设置定义，例如模块源或自定义请求头。草稿编辑保存在一个临时存储里，因此能在设置页重渲染后保留，只有有效条目会在保存时写回设置：

```ts
import { generateEditableList } from '@hesprs/sync-engine-sdk';

{
  1000: () =>
    generateEditableList({
      defaultValue: '',
      identifier: 'tags',
      items: settings.tags,
      memoryDB: ctx.memoryDB,
      render: (setting, item, save) => {
        setting.addText((text) => {
          text.setValue(item.value);
          text.inputEl.addEventListener('blur', () => {
            item.value = text.getValue().trim();
            item.valid = item.value !== '';
            save();
          });
        });
      },
      rerenderSettingTab: ctx.rerenderSettingTab,
      saveSettings,
      translations: {
        add: translate('addTag'),
        empty: translate('noTagConfigured'),
      },
    }),
}
```

它的工作方式：

- `items` 是存储在设置中的活动数组。`identifier` 在 `memoryDB` 的临时存储中作为草稿列表的键，传入 `ctx.memoryDB`。草稿能在设置页重渲染后保留，但保存之前不会持久化。
- `render` 绘制一个草稿条目 `{ value, valid, new }`，修改 `value` 和 `valid`，并调用提供的 `save` 回调。`new` 标志可以用来聚焦新添加的条目，`reactivelyValidate()`（上文）在这里也很合适。
- `save` 把所有有效条目写回 `items` 并调用 `saveSettings()`，但只在结果列表真正发生变化时执行。
- 添加按钮追加一个 `defaultValue` 的克隆，并通过 `rerenderSettingTab` 重渲染。删除条目会把它从草稿列表移除、保存并重渲染。
- `translations` 提供添加按钮的文本和空状态文本，`heading` 可选地为列表命名，`extraButtons` 添加接收草稿列表和 `save` 回调的自定义按钮。

## 国际化

Sync Engine 合并所有已加载模块的翻译资源。用 `registerI18n()` 注册资源，并使用 context 中带类型的 `translate()` 函数。

```ts
import type { ObsidianLanguageCode, Translate, TranslationResource } from '@hesprs/sync-engine-sdk';

const messages = {
  connected: (backend: string) => `Connected to ${backend}.`,
  files: ({ failed, succeeded }: { failed: number; succeeded: number }) =>
    createFragment((frag) => {
      frag.createEl('p', { text: 'Files synchronized:' });
      const list = frag.createEl('ul');
      list.createEl('li', { text: `${succeeded} succeeded` });
      if (failed) list.createEl('li', { text: `${failed} failed` });
    }),
} satisfies TranslationResource;

const language: ObsidianLanguageCode = 'en';
ctx.registerI18n(language, messages);

const translate: Translate<typeof messages> = ctx.translate;
const label = translate('connected', 'WebDAV');
const summary = translate('files', { succeeded: 3, failed: 0 });
```

普通字符串原样返回。片段（snippet）资源以函数提供值：函数接收带类型的参数并返回最终字符串。富内容用 fragment 资源：函数接收带类型的参数并返回 `DocumentFragment`。用 `createFragment()`（Obsidian 全局）和 `createEl()`、`createDiv()`、`appendText()` 等 DOM 辅助函数构建 fragment。语言需要复数形式时，在 snippet 和 fragment 里使用 `Intl.PluralRules`。

`ObsidianLanguageCode`、`Fragment`、`Snippet`、`TranslationResource` 和 `Translate` 都是 SDK 导出。核心完整的英文资源表见 [Sync Engine core English translations](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/en.ts)。

先注册翻译，再注册使用它们的设置或其他 UI。`registerI18n()` 返回 `void`，所以不能加入清理回调数组。

## 感知迁移的开关

更改一个开关可能导致已有记录或远端文件与新设置不兼容时，使用 `setNeedMigration()`。当变更需要手动迁移时，这个辅助函数会打开确认对话框。

```ts
import { setNeedMigration } from '@hesprs/sync-engine-sdk';

setNeedMigration(ctx, {
  toggle,
  needMigration: (value) => recordStoreExists(),
  content: (value) => (value ? 'Encryption will be enabled.' : 'Encryption will be disabled.'),
  apply: async (value) => {
    settings.enabled = value;
    await ctx.saveSettings();
  },
});
```

`needMigration` 接收提议的布尔值，可以返回布尔值或 promise。返回 `true` 时，开关被回退并打开确认对话框；确认后执行 `apply` 更改设置，取消则保留旧值。Sync Engine 不自己执行迁移，对话框指向说明如何手动迁移的文档。`needMigration` 返回 `false` 时，`apply` 立即执行。省略 `needMigration` 时默认需要确认。

`content` 提供对话框顶部显示的说明。两个回调都可以是异步的。

对话框是内部 UI 组件；`setNeedMigration()` 是公开的 SDK 辅助函数。
