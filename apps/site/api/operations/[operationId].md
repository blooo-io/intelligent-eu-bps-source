---
aside: false
outline: false
title: Operation
---

<script setup lang="ts">
import { useData } from "vitepress";

const { params } = useData();
const operationId = params.value.operationId as string;
</script>

<OAOperation :operationId="operationId" />
