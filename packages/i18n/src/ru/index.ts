import ru from './translations';
import type {
	SelectFromContext,
	ObsidianLanguageCode,
	TranslationResource,
} from '@hesprs/sync-engine-sdk';

// oxlint-disable-next-line typescript/no-extraneous-class
export default class I18nRu {
	constructor(
		ctx: SelectFromContext<{
			registerI18n: (lang: ObsidianLanguageCode, translations: TranslationResource) => void;
		}>,
	) {
		ctx.registerI18n('ru', ru);
	}
}
