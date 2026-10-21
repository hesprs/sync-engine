<script setup lang="ts">
import modules from '@/modules.json';
import { useData } from 'vitepress';

const translations: Record<string, string> = { 'en-US': 'Download' };
const download = translations[useData().lang.value];
</script>

<template>
	<div class="module-grid">
		<article v-for="module in modules" :key="module.main" class="module-card s-card concave">
			<div class="module-card__heading">
				<h2>{{ module.name }}</h2>
				<span class="module-card__version">v{{ module.version }}</span>
			</div>
			<p>{{ module.description }}</p>
			<a :href="module.main">{{ download }}</a>
		</article>
	</div>
</template>

<style scoped>
.module-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
	gap: 1.25rem;
	margin: 2rem 0;
}

.module-card {
	display: flex;
	flex-direction: column;
	min-width: 0;
	padding: 1.25rem;
}

.module-card__heading {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.module-card h2 {
	margin: 0;
	font-size: 1.25rem;
	line-height: 1.3;
}

.module-card__version {
	flex: 0 0 auto;
	font-size: 0.875rem;
	color: var(--vp-c-text-2);
}

.module-card p {
	flex: 1;
	margin: 1rem 0 1.25rem;
	color: var(--vp-c-text-2);
	line-height: 1.7rem;
}

.module-card a {
	margin-left: auto;
	width: fit-content;
	font-weight: 600;
}
</style>
