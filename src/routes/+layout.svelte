<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { register, init, getLocaleFromNavigator, waitLocale } from 'svelte-i18n';

	let { children } = $props();

	register('en', () => import('../i18n/en.json'));
	register('ja', () => import('../i18n/ja.json'));

	init({
		fallbackLocale: 'en',
		initialLocale: getLocaleFromNavigator(),
	});

	// waitLocale() を呼び出し、その完了を待つPromiseを作成
	const i18nReady = waitLocale();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#await i18nReady}
	<div style="
		color: white; 
		display: flex; 
		justify-content: center; 
		align-items: center; 
		height: 100vh; 
		height: 100dvh;
		width: 100vw;
		width: 100dvw;
	">
		Loading...
	</div>
{:then}
	{@render children()}
{/await}