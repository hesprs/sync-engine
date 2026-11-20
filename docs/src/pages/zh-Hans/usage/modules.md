<script setup lang="ts">
import ModuleCards from '@/components/ModuleCards.vue';
</script>

# 模块

下面列出了当前所有可用的模块，推荐在插件的模块管理界面中下载。你也可以在这里直接下载 JavaScript 二进制文件。

官方模块源是 `https://sync.consensia.cc/modules.json`。如果你的设备无法访问这个模块源（通常是因为严格的防火墙），可以尝试添加 `https://raw.githubusercontent.com/hesprs/sync-engine/refs/heads/gh-pages/modules-alternative.json`（并删除原来的模块源）。这是官方的备用源，托管在 GitHub 的域名下。

<ModuleCards />
