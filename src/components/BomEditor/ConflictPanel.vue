<template>
  <div class="bom-side-panel">
    <!-- 变更历史区（上 ~50%，独立垂直滚动） -->
    <section class="bom-side-panel__region bom-side-panel__region--history">
      <header class="bom-side-panel__region-title">变更历史</header>
      <div class="bom-side-panel__region-body">
        <a-empty v-if="!history.length" description="暂无操作" :image="simpleImage" />
        <ul v-else class="bom-history-list">
          <li
            v-for="(op, idx) in reversedHistory"
            :key="op.operationId || idx"
            class="bom-history-item"
          >
            <div class="bom-history-item__head">
              <a-tag class="bom-history-item__type" color="blue">
                {{ op.operationType || '操作' }}
              </a-tag>
              <span class="bom-history-item__time">{{ op.time }}</span>
              <a-button
                v-if="idx === 0"
                type="link"
                size="small"
                class="bom-history-item__undo"
                :disabled="undoLoading"
                :loading="undoLoading"
                @click="$emit('undo')"
              >
                撤销
              </a-button>
            </div>
            <div class="bom-history-item__label">{{ op.label }}</div>
          </li>
        </ul>
      </div>
    </section>

    <!-- 冲突检测区（下 ~50%，独立垂直滚动） -->
    <section class="bom-side-panel__region bom-side-panel__region--conflict">
      <header class="bom-side-panel__region-title">冲突检测</header>
      <div class="bom-side-panel__region-body">
        <a-empty v-if="!conflicts.length" description="暂无冲突" :image="simpleImage" />
        <a-list v-else size="small" :data-source="conflicts">
          <a-list-item slot="renderItem" slot-scope="item">
            <a-list-item-meta :description="item.message">
              <span slot="title">
                <a-badge :status="item.resolved ? 'default' : 'error'" />
                {{ item.nodePartNumber }}
              </span>
            </a-list-item-meta>
            <a v-if="!item.resolved" slot="actions" @click="$emit('resolve', item.id)">标记已处理</a>
          </a-list-item>
        </a-list>
      </div>
    </section>
  </div>
</template>

<script>
import { Empty } from 'ant-design-vue'

export default {
  name: 'BomConflictPanel',
  props: {
    conflicts: {
      type: Array,
      default: () => []
    },
    history: {
      type: Array,
      default: () => []
    },
    // 撤销请求进行中：禁用栈顶撤销入口，防止重复提交
    undoLoading: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      simpleImage: Empty.PRESENTED_IMAGE_SIMPLE
    }
  },
  computed: {
    // 按时间倒序（LIFO）：最近一次操作位于列表顶部（index 0 即栈顶）
    reversedHistory () {
      return [...this.history].reverse()
    }
  }
}
</script>

<style lang="less" scoped>
.bom-side-panel {
  display: flex;
  flex-direction: column;
  min-height: 360px;
  overflow: hidden;
}

.bom-side-panel__region {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  // 关键：允许 flex 子项内部内容溢出时由 body 滚动，而非撑开整个面板
  min-height: 0;

  & + & {
    border-top: 1px solid #f0f0f0;
  }
}

.bom-side-panel__region-title {
  flex: 0 0 auto;
  padding: 8px 12px;
  font-weight: 600;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.bom-side-panel__region-body {
  // 各区域独立垂直滚动，互不影响
  flex: 1 1 0;
  min-height: 0;
  padding: 8px 12px;
  overflow-y: auto;
}

.bom-history-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bom-history-item {
  padding: 8px 0;

  & + & {
    border-top: 1px dashed #f0f0f0;
  }
}

.bom-history-item__head {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.bom-history-item__type {
  margin-right: 4px;
}

.bom-history-item__time {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.bom-history-item__undo {
  margin-left: auto;
  padding: 0;
  height: auto;
  line-height: 1;
}

.bom-history-item__label {
  // 长文本自动换行完整展示，无断点连续串强制换行，绝不截断或横向溢出
  white-space: normal;
  word-break: break-all;
  overflow-wrap: break-word;
  line-height: 1.5;
}
</style>
