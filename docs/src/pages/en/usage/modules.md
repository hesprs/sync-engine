<script setup lang="ts">
import ModuleCards from '@/components/ModuleCards.vue';
</script>

# Modules

Below shows all currently available modules, the recommended way is to download them in the plugin module management UI. You can also download the JavaScript binaries here.

The official module source is `https://sync.consensia.cc/modules.json`. If your machine fails to fetch this module source (often due to aggressive firewall), you can try adding `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json` (and delete the original one) to your module sources. This source is the official alternative using GitHub's domain.

<ModuleCards />
