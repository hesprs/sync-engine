import mergeOriginal from '@/utils/merge';
import { test, expect } from 'bun:test';
import type { MergeParams } from '@/utils/merge';

function merge(params: MergeParams): string {
	return mergeOriginal(params, {
		conflictAEnd: '</a>',
		conflictAStart: '<a>',
		conflictBEnd: '</b>',
		conflictBStart: '<b>',
		deletionEnd: '</del>',
		deletionStart: '<del>',
	});
}

// --- Content identical ---
test('local and remote identical content succeeds and is marked identical', () => {
	const params: MergeParams = {
		a: 'line1\nline2\nline3',
		b: 'line1\nline2\nline3',
		o: 'line1\nline2',
	};
	expect(merge(params)).toBe('line1\nline2\nline3');
});

// --- Simple merge cases ---
test('local additions merge when remote is unchanged', () => {
	const params: MergeParams = { a: 'a\nb\nc', b: 'a\nb', o: 'a\nb' };
	expect(merge(params)).toBe('a\nb\nc');
});

test('remote deletions merge when local is unchanged', () => {
	const params: MergeParams = { a: 'a\nb\nc', b: 'a\nc', o: 'a\nb\nc' };
	expect(merge(params)).toBe('a\nc');
});

test('local edits merge when remote is unchanged', () => {
	const params: MergeParams = { a: 'hello universe', b: 'hello world', o: 'hello world' };
	expect(merge(params)).toBe('hello universe');
});

test('non-overlapping concurrent edits merge', () => {
	const params: MergeParams = {
		a: 'line1-local\nline2\nline3\nline4',
		b: 'line1\nline2\nline3\nline4-remote',
		o: 'line1\nline2\nline3\nline4',
	};
	expect(merge(params)).toBe('line1-local\nline2\nline3\nline4-remote');
});

test('local edits at start merge', () => {
	const params: MergeParams = {
		a: 'new first line\noriginal line',
		b: 'original line',
		o: 'original line',
	};
	expect(merge(params)).toBe('new first line\noriginal line');
});

test('remote edits at end merge', () => {
	const params: MergeParams = {
		a: 'original line',
		b: 'original line\nnew last line',
		o: 'original line',
	};
	expect(merge(params)).toBe('original line\nnew last line');
});

test('conflicting edits show conflict', () => {
	const params: MergeParams = {
		a: 'common_prefix\nshared_line_local_version\ncommon_suffix', // Local made a change
		b: 'common_prefix\nshared_line_remote_version\ncommon_suffix', // Remote also made a change
		o: 'common_prefix\nshared_line_base\ncommon_suffix',
	};
	expect(merge(params)).toBe(
		'common_prefix\nshared_line_<a>local</a><b>remote</b>_version\ncommon_suffix',
	);
});

test('conflicting edits can still merge', () => {
	const params: MergeParams = {
		a: '第一行\n本地修改了共同祖先\n第三行\n本地新增行', // 本地修改并添加
		b: '第一行\n共同祖先被修改了\n第三行', // 远程仅修改
		o: '第一行\n共同祖先\n第三行',
	};
	expect(merge(params)).toBe('第一行\n本地修改了共同祖先被修改了\n第三行\n本地新增行');
});

test('concurrent sentence edits merge', () => {
	const params: MergeParams = {
		a: 'The fluffy cat sat on the mat.', // User A adds "fluffy"
		b: 'The cat sat on the rug.', // User B changes "mat" to "rug"
		o: 'The cat sat on the mat.',
	};
	expect(merge(params)).toBe('The fluffy cat sat on the rug.');
});

test('edits at both ends of same line merge', () => {
	const params: MergeParams = {
		a: 'NEW_PREFIX This is a shared line of text.', // User A adds a prefix
		b: 'This is a shared line of text. NEW_SUFFIX', // User B adds a suffix
		o: 'This is a shared line of text.',
	};
	expect(merge(params)).toBe('NEW_PREFIX This is a shared line of text. NEW_SUFFIX');
});

test('complex interleaved edits merge', () => {
	const params: MergeParams = {
		a: 'Urgent Report for Q1: Sales are significantly up by 10%.',
		b: 'Report for Q1: Revenue is up by 10%, not sales.',
		o: 'Report for Q1: Sales are up by 10%.',
	};
	expect(merge(params)).toBe(
		'Urgent Report for Q1: Revenue is significantly up by 10%, not sales.',
	);
});

test('long text with non-overlapping edits merge', () => {
	const params: MergeParams = {
		a: `A new introductory sentence has been added locally.
This is the first sentence of a long paragraph that serves as a base for testing.
It contains multiple lines and ideas to simulate a real-world text block.
The middle section of this paragraph will remain untouched by direct edits from either local or remote.
However, changes will occur at the beginning and at the very end of this paragraph.
This setup helps verify if DMP can handle non-overlapping changes in a larger text body.`,
		b: `This is the first sentence of a long paragraph that serves as a base for testing.
It contains multiple lines and ideas to simulate a real-world text block.
The middle section of this paragraph will remain untouched by direct edits from either local or remote.
However, changes will occur at the beginning and at the very end of this paragraph.
This setup helps verify if DMP can handle non-overlapping changes in a larger text body.
And a concluding sentence has been added remotely.`,
		o: `This is the first sentence of a long paragraph that serves as a base for testing.
It contains multiple lines and ideas to simulate a real-world text block.
The middle section of this paragraph will remain untouched by direct edits from either local or remote.
However, changes will occur at the beginning and at the very end of this paragraph.
This setup helps verify if DMP can handle non-overlapping changes in a larger text body.`,
	};
	expect(merge(params)).toBe(
		`A new introductory sentence has been added locally.
This is the first sentence of a long paragraph that serves as a base for testing.
It contains multiple lines and ideas to simulate a real-world text block.
The middle section of this paragraph will remain untouched by direct edits from either local or remote.
However, changes will occur at the beginning and at the very end of this paragraph.
This setup helps verify if DMP can handle non-overlapping changes in a larger text body.
And a concluding sentence has been added remotely.`,
	);
});

test('different paragraphs edited independently merge', () => {
	const params: MergeParams = {
		a: `Paragraph one, with local modifications.
It has a few lines, and this is a local addition.

Paragraph two, also in its initial state.
This one also has some content.`,
		b: `Paragraph one, initial state.
It has a few lines.

Paragraph two, with remote changes applied.
This one also has some content, and this is a remote addition.`,
		o: `Paragraph one, initial state.
It has a few lines.

Paragraph two, also in its initial state.
This one also has some content.`,
	};
	expect(merge(params)).toBe(
		`Paragraph one, with local modifications.
It has a few lines, and this is a local addition.

Paragraph two, with remote changes applied.
This one also has some content, and this is a remote addition.`,
	);
});

test('large conflicting edits shows many conflicts', () => {
	const params: MergeParams = {
		a: `The project's primary goal is to revolutionize user interaction.
We will achieve this by completely overhauling the UI and boosting speed.
The timeline for this critical phase is two months.`,
		b: `The project's main objective is to improve customer satisfaction.
We will achieve this by simplifying the navigation and ensuring stability.
The deadline for this phase is strictly four months.`,
		o: `The project's primary goal is to enhance user experience.
We will achieve this by redesigning the interface and optimizing performance.
The timeline for this phase is three months.`,
	};
	expect(merge(params)).toBe(
		`The project's main objective is to <a>revolutionize user interaction</a><b>improve customer satisfaction</b>.
We will achieve this by <a>completely overhauling</a><b>simplifying</b> the <a>UI</a><b>navigation</b> and <a>boosting speed</a><b>ensuring stability</b>.
The deadline for this critical phase is <a>two</a><b>strictly four</b> months.`,
	);
});

test('paragraph conflict shows merge conflicts', () => {
	const params: MergeParams = {
		a: `Paragraph A: Initial content for the first section, with local additions.
It discusses introductory concepts and some new insights.

Paragraph B: Core ideas are presented here, but locally rephrased for clarity.
This section is absolutely vital for comprehension.

Paragraph C: Concluding remarks and future work.
This summarizes the document.`,
		b: `Paragraph A: Initial content for the first section.
It discusses introductory concepts, expanded with remote details.

Paragraph B: Core concepts are detailed in this part.
This section is fundamentally important for understanding.

Paragraph C: Concluding remarks and future work, with an added action item.
This summarizes the document and suggests next steps.`,
		o: `Paragraph A: Initial content for the first section.
It discusses introductory concepts.

Paragraph B: Core ideas are presented here.
This section is crucial for understanding.

Paragraph C: Concluding remarks and future work.
This summarizes the document.`,
	};
	expect(merge(params))
		.toBe(`Paragraph A: Initial content for the first section, with local additions.
It discusses introductory concepts and some new insights, expanded with remote details.

Paragraph B: Core concepts are detailed in this part, but locally rephrased for clarity.
This section is <a>absolutely vital</a><b>fundamentally important</b> for comprehension.

Paragraph C: Concluding remarks and future work, with an added action item.
This summarizes the document and suggests next steps.`);
});

test('long Chinese text with non-overlapping edits merge', () => {
	const params: MergeParams = {
		a: `本地新增了一个引言句。
这是一段用于测试的长中文段落的第一句话。
它包含多行内容和若干观点，旨在模拟真实的文本块。
该段落的中间部分将保持不变，本地和远程均不直接编辑。
然而，段落的开头和末尾会发生更改。
此设置有助于验证DMP是否能处理较长文本主体中的非重叠更改。`,
		b: `这是一段用于测试的长中文段落的第一句话。
它包含多行内容和若干观点，旨在模拟真实的文本块。
该段落的中间部分将保持不变，本地和远程均不直接编辑。
然而，段落的开头和末尾会发生更改。
此设置有助于验证DMP是否能处理较长文本主体中的非重叠更改。
并且远程添加了一个总结句。`,
		o: `这是一段用于测试的长中文段落的第一句话。
它包含多行内容和若干观点，旨在模拟真实的文本块。
该段落的中间部分将保持不变，本地和远程均不直接编辑。
然而，段落的开头和末尾会发生更改。
此设置有助于验证DMP是否能处理较长文本主体中的非重叠更改。`,
	};
	expect(merge(params)).toBe(
		`本地新增了一个引言句。
这是一段用于测试的长中文段落的第一句话。
它包含多行内容和若干观点，旨在模拟真实的文本块。
该段落的中间部分将保持不变，本地和远程均不直接编辑。
然而，段落的开头和末尾会发生更改。
此设置有助于验证DMP是否能处理较长文本主体中的非重叠更改。
并且远程添加了一个总结句。`,
	);
});

test('different Chinese paragraphs edited independently merge', () => {
	const params: MergeParams = {
		a: `段落一，经过本地修改。
它有几行文字，这是本地新增的内容。

段落二，同样处于初始状态。
这一个也有一些内容。`,
		b: `段落一，初始状态。
它有几行文字。

段落二，已应用远程更改。
这一个也有一些内容，这是远程新增的内容。`,
		o: `段落一，初始状态。
它有几行文字。

段落二，同样处于初始状态。
这一个也有一些内容。`,
	};
	expect(merge(params)).toBe(
		`段落一，经过本地修改。
它有几行文字，这是本地新增的内容。

段落二，已应用远程更改。
这一个也有一些内容，这是远程新增的内容。`,
	);
});

test('large Chinese conflicting edits merge', () => {
	const params: MergeParams = {
		a: `项目的主要目标是革新用户交互。
我们将通过彻底改造用户界面并提升速度来实现。
这个关键阶段的时间表为两个月。`,
		b: `项目的主要目的是提高客户满意度。
我们将通过简化导航和确保稳定性来实现。
此阶段的截止日期严格限定为四个月。`,
		o: `项目的主要目标是提升用户体验。
我们将通过重新设计界面和优化性能来实现这一目标。
此阶段的时间表为三个月。`,
	};
	expect(merge(params)).toBe(`项目的主要目的是<a>革新用户交互</a><b>提高客户满意度</b>。
我们将通过<a>彻底改造用户界面并提升速度</a><b>简化导航和确保稳定性</b>来实现。
这个关键阶段的截止日期严格限定为<a>两</a><b>四</b>个月。`);
});

test('Chinese paragraph conflict fails overall merge', () => {
	const params: MergeParams = {
		a: `段落甲：第一部分的初始内容，附带本地增补。
它讨论了介绍性的概念和一些新的见解。

段落乙：核心思想在此呈现，但本地为了清晰重新表述。
这部分对于理解绝对关键。

段落丙：结论和未来工作。
这总结了文档。`,
		b: `段落甲：第一部分的初始内容。
它讨论了介绍性的概念，并用远程细节进行了扩展。

段落乙：核心概念在这一部分有详细说明。
这部分对于理解具有根本的重要性。

段落丙：结论和未来工作，并增加了一个行动项。
这总结了文档并建议了后续步骤。`,
		o: `段落甲：第一部分的初始内容。
它讨论了介绍性的概念。

段落乙：核心思想在此呈现。
这部分对于理解至关重要。

段落丙：结论和未来工作。
这总结了文档。`,
	};
	const result = merge(params);
	expect(result).toBe(`段落甲：第一部分的初始内容，附带本地增补。
它讨论了介绍性的概念和一些新的见解，并用远程细节进行了扩展。

段落乙：核心概念在这一部分有详细说明，但本地为了清晰重新表述。
这部分对于理解<a>绝对关键</a><b>具有根本的重要性</b>。

段落丙：结论和未来工作，并增加了一个行动项。
这总结了文档并建议了后续步骤。`);
});

// --- Markdown-specific test cases ---
test('markdown non-conflicting edits merge', () => {
	const params: MergeParams = {
		a: `# Section Title

This is the original paragraph content. It discusses important concepts.

- Item 1
- Item 2`,
		b: `# Section Title

This is the modified paragraph content by remote. It elaborates on the important concepts with new details.`,
		o: `# Section Title

This is the original paragraph content. It discusses important concepts.`,
	};
	expect(merge(params)).toBe(
		`# Section Title

This is the modified paragraph content by remote. It elaborates on the important concepts with new details.

- Item 1
- Item 2`,
	);
});

test('markdown list item edits merge', () => {
	const params: MergeParams = {
		a: `- First item: locally modified text.
- Second item: original text.
- Third item: original text.`,
		b: `- First item: original text.
- Second item: remotely modified text.
- Third item: original text.`,
		o: `- First item: original text.
- Second item: original text.
- Third item: original text.`,
	};
	expect(merge(params)).toBe(
		`- First item: locally modified text.
- Second item: remotely modified text.
- Third item: original text.`,
	);
});

test('markdown heading conflict merges', () => {
	const params: MergeParams = {
		a: `## Locally Updated Subheading`,
		b: `## Remotely Revised Subheading`,
		o: `## Original Subheading`,
	};
	const result = merge(params);
	expect(result).toBe('## <a>Locally Updated</a><b>Remotely Revised</b> Subheading');
});

test('large markdown knowledge-base fragment with non-overlapping edits merge', () => {
	const params: MergeParams = {
		a: `# Main Topic: System Architecture

## Introduction
This document outlines the system architecture. Key components include the API, database, and frontend.

## Components
- **API Server:** Handles all client requests and business logic.
  - Built with Node.js and Express.
- **Database:** Stores persistent data.
  - Uses PostgreSQL.
- **Frontend:** User interface.
  - Developed with React.
- **Caching Layer:** (New) Improves performance.
  - Uses Redis.

### Data Flow
Data flows from Frontend -> API Server -> Database.`,
		b: `# Main Topic: System Architecture

## Introduction
This document provides a comprehensive overview of the system architecture. Key components include the API, database, and frontend, working in concert.

## Components
- **API Server:** Handles all client requests.
  - Built with Node.js.
- **Database:** Stores persistent data.
  - Uses PostgreSQL.
- **Frontend:** User interface for interaction.
  - Developed with React and Redux for state management.

### Data Flow
Data flows from Frontend -> API Server -> Database.`,
		o: `# Main Topic: System Architecture

## Introduction
This document outlines the system architecture. Key components include the API, database, and frontend.

## Components
- **API Server:** Handles all client requests.
  - Built with Node.js.
- **Database:** Stores persistent data.
  - Uses PostgreSQL.
- **Frontend:** User interface.
  - Developed with React.

### Data Flow
Data flows from Frontend -> API Server -> Database.`,
	};
	expect(merge(params)).toBe(
		`# Main Topic: System Architecture

## Introduction
This document provides a comprehensive overview of the system architecture. Key components include the API, database, and frontend, working in concert.

## Components
- **API Server:** Handles all client requests and business logic.
  - Built with Node.js and Express.
- **Database:** Stores persistent data.
  - Uses PostgreSQL.
- **Frontend:** User interface for interaction.
  - Developed with React and Redux for state management.
- **Caching Layer:** (New) Improves performance.
  - Uses Redis.

### Data Flow
Data flows from Frontend -> API Server -> Database.`,
	);
});

test('large markdown knowledge-base fragment with conflicting edits merge', () => {
	const params: MergeParams = {
		a: `# Project Alpha: Guidelines

## Setup Instructions
1. Clone the repository from the new URL.
2. Run \`yarn install\`.
3. Run \`yarn dev\`.

## Coding Standards
- Use Prettier for formatting.
- Write unit tests for all new features.
- All functions must have JSDoc comments.`,
		b: `# Project Alpha: Guidelines

## Setup Instructions
1. Ensure you have Docker installed.
2. Run \`docker-compose up\`.

## Coding Standards
- Use ESLint and Prettier for formatting and linting.
- Write unit tests for all new features.`,
		o: `# Project Alpha: Guidelines

## Setup Instructions
1. Clone the repository.
2. Run \`npm install\`.
3. Run \`npm start\`.

## Coding Standards
- Use Prettier for formatting.
- Write unit tests for all new features.`,
	};
	const result = merge(params);
	expect(result).toBe(`# Project Alpha: Guidelines

## Setup Instructions
1. Ensure you have Docker installedfrom the new URL.
2. Run \`<a>yarn install</a><b>docker-compose up</b>\`.

<del>3. Run \`yarn dev\`.</del>

## Coding Standards
- Use ESLint and Prettier for formatting and linting.
- Write unit tests for all new features.
- All functions must have JSDoc comments.`);
});

test('Chinese markdown non-conflicting edits merge', () => {
	const params: MergeParams = {
		a: `# 章节标题

这是原始的段落内容。它讨论了重要的概念。

- 项目点 1
- 项目点 2`,
		b: `# 章节标题

这是由远程修改的段落内容。它用新的细节阐述了重要的概念。`,
		o: `# 章节标题

这是原始的段落内容。它讨论了重要的概念。`,
	};
	expect(merge(params)).toBe(
		`# 章节标题

这是由远程修改的段落内容。它用新的细节阐述了重要的概念。

- 项目点 1
- 项目点 2`,
	);
});

test('large Chinese markdown knowledge-base fragment with non-overlapping edits merge', () => {
	const params: MergeParams = {
		a: `# 主题：系统架构

## 引言
本文档概述了系统架构。关键组件包括API、数据库和前端。

## 组件详情
- **API服务器：** 处理所有客户端请求及业务逻辑。
  - 使用Node.js和Express构建。
- **数据库：** 存储持久化数据。
  - 使用PostgreSQL。
- **前端：** 用户界面。
  - 使用React开发。
- **缓存层：** (新增) 提升性能。
  - 使用Redis。`,
		b: `# 主题：系统架构

## 引言
本文档对系统架构进行了全面概述。关键组件包括API、数据库和前端，它们协同工作。

## 组件详情
- **API服务器：** 处理所有客户端请求。
  - 使用Node.js构建。
- **数据库：** 存储持久化数据。
  - 使用PostgreSQL。
- **前端：** 用于交互的用户界面。
  - 使用React和Redux进行状态管理。`,
		o: `# 主题：系统架构

## 引言
本文档概述了系统架构。关键组件包括API、数据库和前端。

## 组件详情
- **API服务器：** 处理所有客户端请求。
  - 使用Node.js构建。
- **数据库：** 存储持久化数据。
  - 使用PostgreSQL。
- **前端：** 用户界面。
  - 使用React开发。`,
	};
	expect(merge(params)).toBe(
		`# 主题：系统架构

## 引言
本文档对系统架构进行了全面概述。关键组件包括API、数据库和前端，它们协同工作。

## 组件详情
- **API服务器：** 处理所有客户端请求及业务逻辑。
  - 使用Node.js和Express构建。
- **数据库：** 存储持久化数据。
  - 使用PostgreSQL。
- **前端：** 用于交互的用户界面。
  - 使用React和Redux进行状态管理。
- **缓存层：** (新增) 提升性能。
  - 使用Redis。`,
	);
});

test('large Chinese markdown knowledge-base fragment with conflicting edits merge', () => {
	const params: MergeParams = {
		a: `# 项目甲：开发指南

## 环境设置
1. 从新的URL克隆代码仓库。
2. 运行 \`yarn install\`。
3. 运行 \`yarn dev\`。

##编码规范
- 使用 Prettier 进行格式化。
- 为所有新功能编写单元测试。
- 所有函数必须有 JSDoc 注释。`,
		b: `# 项目甲：开发指南

## 环境设置
1. 确保已安装 Docker。
2. 运行 \`docker-compose up\`。

##编码规范
- 使用 ESLint 和 Prettier 进行格式化和代码检查。
- 为所有新功能编写单元测试。`,
		o: `# 项目甲：开发指南

## 环境设置
1. 克隆代码仓库。
2. 运行 \`npm install\`。
3. 运行 \`npm start\`。

##编码规范
- 使用 Prettier 进行格式化。
- 为所有新功能编写单元测试。`,
	};
	expect(merge(params)).toBe(`# 项目甲：开发指南

## 环境设置
1. 从新的URL确保已安装 Docker。
2. 运行 \`<a>yarn install</a><b>docker-compose up</b>\`。

<del>3. 运行 \`yarn dev\`。</del>

##编码规范
- 使用 ESLint 和 Prettier 进行格式化和代码检查。
- 为所有新功能编写单元测试。
- 所有函数必须有 JSDoc 注释。`);
});

test('local inserts large text in the middle while remote makes a small tail edit', () => {
	const params: MergeParams = {
		a: `# 原始标题

这是文档的初始段落。
它包含了一些基本信息。

## 本地新增章节

这是本地插入的一大段新内容。
它可能包含多个段落，详细阐述某个主题。
例如，这里可以有列表：
- 列表项A
- 列表项B

甚至可以有更复杂的 Markdown 结构。

这是文档的结束部分。`,
		b: `# 原始标题

这是文档的初始段落。
它包含了一些基本信息。

这是文档的结束部分。远程在这里添加了一句总结性的话。`,
		o: `# 原始标题

这是文档的初始段落。
它包含了一些基本信息。

这是文档的结束部分。`,
	};
	expect(merge(params)).toBe(
		`# 原始标题

这是文档的初始段落。
它包含了一些基本信息。

## 本地新增章节

这是本地插入的一大段新内容。
它可能包含多个段落，详细阐述某个主题。
例如，这里可以有列表：
- 列表项A
- 列表项B

甚至可以有更复杂的 Markdown 结构。

这是文档的结束部分。远程在这里添加了一句总结性的话。`,
	);
});

test('local and remote insert large non-overlapping markdown blocks', () => {
	const params: MergeParams = {
		a: `# 文档标题

## 章节一：引言

这是引言内容。

### 本地新增：引言的补充说明

这部分是本地在引言章节中新增的详细内容。
它可以很长，包含多个要点。
- 要点1
- 要点2

## 章节二：核心概念

这是核心概念的阐述。

## 章节三：结论

这是结论部分。`,
		b: `# 文档标题

## 章节一：引言

这是引言内容。

## 章节二：核心概念

这是核心概念的阐述。

### 远程新增：核心概念的案例分析

这部分是远程在核心概念章节中新增的案例。
它可以包含代码示例：
\`\`\`
function example() {
  console.log("Hello from remote");
}
\`\`\`
以及对案例的详细解释。

## 章节三：结论

这是结论部分。`,
		o: `# 文档标题

## 章节一：引言

这是引言内容。

## 章节二：核心概念

这是核心概念的阐述。

## 章节三：结论

这是结论部分。`,
	};
	expect(merge(params)).toBe(
		`# 文档标题

## 章节一：引言

这是引言内容。

### 本地新增：引言的补充说明

这部分是本地在引言章节中新增的详细内容。
它可以很长，包含多个要点。
- 要点1
- 要点2

## 章节二：核心概念

这是核心概念的阐述。

### 远程新增：核心概念的案例分析

这部分是远程在核心概念章节中新增的案例。
它可以包含代码示例：
\`\`\`
function example() {
  console.log("Hello from remote");
}
\`\`\`
以及对案例的详细解释。

## 章节三：结论

这是结论部分。`,
	);
});

test('local long paragraph and remote note at another location merge', () => {
	const longParagraph = `这是一个极长的段落，模拟用户在 Obsidian 中撰写或粘贴大量文本的场景。这个段落需要足够长，以测试合并算法在处理大块文本时的性能和准确性。它可以包含各种类型的文本，例如详细的解释、复杂的思考过程、或者从其他地方引用的长篇内容。为了达到“极长”的目的，我会在这里重复一些句子，或者添加一些无意义的填充文本。这仅仅是为了增加段落的字符数和行数。在实际应用中，这样的段落通常会包含有价值的信息，但对于测试来说，长度是关键。我们希望确保即使用户进行了如此大规模的单次编辑，合并过程依然能够正确处理，并且不会丢失任何信息，也不会引入错误。这个段落将继续延伸，以确保它确实很长。重复的文本有助于快速增加长度，同时保持一定的可读性（尽管内容上可能没有新增信息）。这个段落现在应该已经足够长了，可以有效地测试我们想要验证的场景。再加几句确保长度。这真的是一个很长的段落，对吧？我们还在继续写，确保它足够长。最后几句了，这个段落的长度应该可以满足测试需求了。`;
	const params: MergeParams = {
		a: `# 原始文档

第一段内容。

${longParagraph}

第二段内容，这里将保持不变。

最后一段。`,
		b: `# 原始文档 (远程修改了标题)

第一段内容。

第二段内容，这里将保持不变。

最后一段。 (远程添加了注释)`,
		o: `# 原始文档

第一段内容。

第二段内容，这里将保持不变。

最后一段。`,
	};
	expect(merge(params)).toBe(
		`# 原始文档 (远程修改了标题)

第一段内容。

${longParagraph}

第二段内容，这里将保持不变。

最后一段。 (远程添加了注释)`,
	);
});

test('local large insertion and remote unrelated deletion merge', () => {
	const params: MergeParams = {
		a: `# 初始文档结构

## 第一节：引言

这是引言部分的文字。

### 本地新增：引言的扩展

这里是本地在引言部分新增的大段内容。
它详细地扩展了引言中的观点。
可以包含多个小节和列表。
- 扩展点1
- 扩展点2

## 第二节：待删除内容

这部分内容将在远程版本中被删除。
它包含几行文字，用于测试删除操作。

## 第三节：核心论述

这是核心论述部分。`,
		b: `# 初始文档结构

## 第一节：引言

这是引言部分的文字。

## 第三节：核心论述

这是核心论述部分。 (远程在此处可能有一些微小调整)`,
		o: `# 初始文档结构

## 第一节：引言

这是引言部分的文字。

## 第二节：待删除内容

这部分内容将在远程版本中被删除。
它包含几行文字，用于测试删除操作。

## 第三节：核心论述

这是核心论述部分。`,
	};
	expect(merge(params)).toBe(
		`# 初始文档结构

## 第一节：引言

这是引言部分的文字。

### 本地新增：引言的扩展

这里是本地在引言部分新增的大段内容。
它详细地扩展了引言中的观点。
可以包含多个小节和列表。
- 扩展点1
- 扩展点2

## 第三节：核心论述

这是核心论述部分。 (远程在此处可能有一些微小调整)`,
	);
});

test('nearby large inserts at same location merge', () => {
	const params: MergeParams = {
		a: `# 会议纪要

## 议题一：项目进展

主持人总结了上周的工作。

### 本地补充：关于A模块的详细讨论

张三详细介绍了A模块的技术实现细节，遇到的问题以及解决方案。
李四补充了A模块与B模块的集成方案。
王五提出了关于A模块性能优化的建议。
（此处省略数百字详细讨论记录）

## 议题二：后续计划`,
		b: `# 会议纪要

## 议题一：项目进展

主持人总结了上周的工作。

### 远程补充：关于用户反馈的整理

赵六整理了上周收集到的用户反馈，主要集中在C功能和D功能的体验问题。
钱七分析了反馈产生的原因，并提出了初步的改进方向。
（此处省略数百字用户反馈详情及分析）

## 议题二：后续计划`,
		o: `# 会议纪要

## 议题一：项目进展

主持人总结了上周的工作。

## 议题二：后续计划`,
	};
	expect(merge(params)).toBe(`# 会议纪要

## 议题一：项目进展

主持人总结了上周的工作。

### 本地补充：关于A模块的详细讨论

张三详细介绍了A模块的技术实现细节，遇到的问题以及解决方案。
李四补充了A模块与B模块的集成方案。
王五提出了关于A模块性能优化的建议。
（此处省略数百字详细讨论记录）

### 远程补充：关于用户反馈的整理

赵六整理了上周收集到的用户反馈，主要集中在C功能和D功能的体验问题。
钱七分析了反馈产生的原因，并提出了初步的改进方向。
（此处省略数百字用户反馈详情及分析）

## 议题二：后续计划`);
});

// --- Content edge cases ---
test('concatenate completely different changes', () => {
	const params: MergeParams = { a: 'local', b: 'remote', o: '' };
	expect(merge(params)).toBe(`localremote`);
});

test('empty base with identical local and remote content succeeds', () => {
	const params: MergeParams = { a: 'same content', b: 'same content', o: '' };
	// Local and remote are identical, so this is identical content.
	expect(merge(params)).toBe(`same content`);
});

test('empty local content fails when base and remote still have content', () => {
	const params: MergeParams = {
		a: '', // Local deleted everything
		b: 'some base content\nshared line\nremote additions', // Remote kept base and added
		o: 'some base content\nshared line',
	};
	expect(merge(params)).toBe('remote additions');
});

test('all-empty content succeeds and is identical', () => {
	const params: MergeParams = { a: '', b: '', o: '' };
	expect(merge(params)).toBe('');
});
