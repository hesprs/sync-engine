import ObsidianMock from '@repo/shared/obsidian-mock';
import { mock } from 'bun:test';
import { DOMParser, Node } from 'linkedom';

// LinkeDOM keeps the namespace prefix in XML localName, unlike browser DOM.
class XMLParser {
	private readonly parser = new DOMParser();
	parseFromString(markup: string) {
		const document = this.parser.parseFromString(markup, 'text/xml') as unknown as Document;
		for (const element of document.querySelectorAll('*'))
			Object.defineProperty(element, 'localName', {
				value: element.localName.split(':').at(-1),
			});
		return document;
	}
}

class XMLSerializerMock {
	constructor(
		private readonly serialize = (node: { toString: () => string }) => node.toString(),
	) {}
	serializeToString(node: { toString: () => string }) {
		return this.serialize(node);
	}
}

Object.assign(globalThis, {
	DOMParser: XMLParser,
	Node,
	XMLSerializer: XMLSerializerMock,
	window: globalThis,
});
void mock.module('obsidian', () => ObsidianMock);
