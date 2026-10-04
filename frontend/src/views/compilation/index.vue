<template>
  <section class="page" data-module="compilation">
    <header class="page-head">
      <div>
        <h2>数据整编管理</h2>
        <p class="page-desc">维护整编成果，围绕成果编号、整编年份、站点编号、整编类型做登记、筛选与状态流转；别的整编入口提交的记录会在这里联动生成待核事项。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记整编成果</button>
        <button class="btn" type="button" @click="exportRows">导出数据整编清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待核事项</span>
        <strong class="stat-value">{{ pendingCount }}</strong>
      </article>
    </div>

    <section class="review-panel">
      <header class="panel-head">
        <h3>待核事项</h3>
        <label class="panel-hint">
          <input v-model="onlyPending" type="checkbox" />
          只看待核（{{ pendingCount }} / {{ reviewItems.length }}）
        </label>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>编号</th>
            <th>来源入口</th>
            <th>记录编号</th>
            <th>站点编号</th>
            <th>采样时间</th>
            <th>事项类型</th>
            <th>说明</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in shownReviewItems" :key="item.id">
            <td>#{{ item.id }}</td>
            <td>{{ item.sourceLabel }}</td>
            <td>{{ item.记录编号 }}</td>
            <td>{{ item.站点编号 }}</td>
            <td>{{ item.采样时间 }}</td>
            <td>
              <span :class="item.reason === '旧样本沿用原值' ? 'tag warn' : 'tag info'">{{ item.reason }}</span>
            </td>
            <td>{{ item.detail }}</td>
            <td>{{ item.status }}</td>
            <td class="row-actions">
              <template v-if="item.status === '待核'">
                <button class="link" type="button" @click="resolve(item.id, '已确认')">确认</button>
                <button class="link danger" type="button" @click="resolve(item.id, '已驳回')">驳回</button>
              </template>
              <span v-else class="muted-text">{{ item.handledAt ? formatTime(item.handledAt) : '—' }}</span>
            </td>
          </tr>
          <tr v-if="!shownReviewItems.length">
            <td colspan="9" class="empty-state">暂无待核事项，其他整编入口（如泥沙监测暂存提交）会联动生成</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无数据整编数据，可先登记整编成果</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条数据整编记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  listReviewItems,
  resolveReviewItem,
  type ReviewItem,
} from '@/api/sediment-service'
import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('compilation')
const columns = ["成果编号", "整编年份", "站点编号", "整编类型", "原始记录数", "整编人", "审核人", "整编状态"]
const actions = ["开始整编", "提交审核", "驳回整编"]
const statuses = ["待整编", "整编中", "待审核", "已刊印", "已驳回"]
const stats = [{"label": "待整编年度", "value": 0}, {"label": "整编中年度", "value": 0}, {"label": "已刊印成果", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const reviewItems = ref<ReviewItem[]>([])
const onlyPending = ref(true)

const pendingCount = computed(() => reviewItems.value.filter((item) => item.status === '待核').length)
const shownReviewItems = computed(() =>
  onlyPending.value ? reviewItems.value.filter((item) => item.status === '待核') : reviewItems.value,
)

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

function reloadReviews() {
  reviewItems.value = listReviewItems()
}

function resolve(id: number, status: '已确认' | '已驳回') {
  if (!resolveReviewItem(id, status)) {
    errorMessage.value = `待核事项 #${id} 已被处理，不能重复操作`
    return
  }
  errorMessage.value = ''
  reloadReviews()
}

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '整编成果登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '数据整编列表读取失败'
  }
}

onMounted(() => {
  reload()
  reloadReviews()
})
</script>
