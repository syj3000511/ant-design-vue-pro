<template>
  <div class="bom-tree-panel">
    <div class="bom-tree-panel__title">
      <span>编辑区（当前变更上下文 · 可编辑）</span>
      <a-tag v-if="viewType" color="green">{{ viewType }}</a-tag>
    </div>
    <a-table
      ref="table"
      :columns="columns"
      :dataSource="displayData"
      :customRow="customRow"
      :rowClassName="rowClassName"
      :expandedRowKeys="expandedRowKeys"
      :pagination="false"
      :loading="loading"
      :scroll="{ y: 480, x: tableWidth }"
      rowKey="id"
      size="small"
      @expandedRowsChange="onExpandedRowsChange"
    >
      <span slot="operation" slot-scope="text, record" class="bom-operation-cell" @click.stop>
        <a-dropdown :trigger="['click']" :disabled="isNodeLocked(record.id)">
          <a-button
            type="link"
            size="small"
            :loading="getNodeState(record.id).status === 'locked'"
          >
            {{ operationLabel(record) }} <a-icon v-if="getNodeState(record.id).status !== 'locked'" type="down" />
          </a-button>
          <a-menu slot="overlay" @click="(e) => onMenuClick(e.key, record)">
            <a-menu-item v-if="canAct('add')" key="add">
              <a-icon type="plus" />新增下级
            </a-menu-item>
            <a-menu-item v-if="canAct('revise')" key="revise">
              <a-icon type="vertical-align-top" />升版
            </a-menu-item>
            <a-menu-item v-if="canAct('update')" key="update">
              <a-icon type="edit" />修改属性
            </a-menu-item>
            <a-menu-divider v-if="canAct('delete')" />
            <a-menu-item v-if="canAct('delete')" key="delete" class="bom-menu-danger">
              <a-icon type="delete" />删除
            </a-menu-item>
          </a-menu>
        </a-dropdown>
      </span>
    </a-table>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import { Empty } from 'ant-design-vue'
import { targetColumns, buildEllipsisColumns, showTitleWhenTruncated, TARGET_TABLE_WIDTH } from './columns'
import { collectExpandableKeys } from './treeUtils'

export default {
  name: 'BomRightTree',
  props: {
    dataSource: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    },
    viewType: {
      type: String,
      default: ''
    },
    allowedActions: {
      type: Array,
      default: () => ['add', 'revise', 'delete', 'update']
    }
  },
  data () {
    return {
      simpleImage: Empty.PRESENTED_IMAGE_SIMPLE,
      // 当前选中行 key 列表（最多 1 个，最后一次点击的行）
      selectedRowKeys: [],
      // 受控展开行 key 列表（默认全部展开，导航联动时展开子树下级）
      expandedRowKeys: [],
      // 是否处于导航联动状态：true 时展示过滤后的子树，否则显示引导空状态
      navLinkActive: false
    }
  },
  computed: {
    ...mapGetters('bomNodeState', ['getNodeState', 'isNodeLocked']),
    ...mapState('bomTree', ['selectedNavNode', 'filteredTargetTreeData']),
    // 导航联动激活时使用过滤子树作为数据源，否则不显示任何数据（等待用户点击导航树节点）
    displayData () {
      return this.navLinkActive ? this.filteredTargetTreeData : this.dataSource
    },
    // 固定表格总宽 = 各列宽之和，使列宽稳定、超长文本以省略号截断而非撑开列（R6.2）。
    tableWidth () {
      return TARGET_TABLE_WIDTH
    },
    // 编辑区树表专用列：各数据列（不含「操作」列）单行省略 + 按需 title（R6）。
    // 复用 columns.js 的 buildEllipsisColumns，避免与 LeftTree 的逻辑重复并保持两树一致。
    columns () {
      return buildEllipsisColumns(targetColumns, this.showTitleWhenTruncated)
    }
  },
  watch: {
    // 完整树数据变化时（且未处于导航联动），同步展开全部可展开节点（沿用原 defaultExpandAllRows 行为）
    dataSource: {
      handler () {
        if (!this.navLinkActive) {
          this.expandedRowKeys = collectExpandableKeys(this.dataSource)
        }
      },
      immediate: true
    },
    // 监听导航选中节点变化，处理导航联动定位
    selectedNavNode: {
      handler () {
        this.handleNavLink()
      }
    }
  },
  methods: {
    canAct (action) {
      return this.allowedActions.indexOf(action) !== -1
    },
    // R6.5 / R6.6：仅当单元格文本被省略号截断时，才以原生 title 展示完整文本。
    // 复用 columns.js 中的纯函数实现，保持与 LeftTree 行为一致。
    showTitleWhenTruncated (event, fullText) {
      showTitleWhenTruncated(event, fullText)
    },
    operationLabel (record) {
      return this.getNodeState(record.id).status === 'locked' ? '处理中' : '操作'
    },
    // 整行点击选中（移除 radio rowSelection）。
    // 「操作」列控件通过模板上的 @click.stop 阻止冒泡，因此点击菜单不会触发此处的行选中。
    customRow (record) {
      return {
        on: {
          click: () => this.onRowClick(record)
        }
      }
    },
    onRowClick (record) {
      // 最多保留单行选中（最后一次点击的行）；再次点击已选行保持不变。
      this.selectedRowKeys = [record.id]
      // 选中是共享状态，提交到 Vuex（可被 Devtools 追踪），重构按钮从 store 读取
      this.$store.commit('bomTree/SET_TARGET_SELECTED', record)
      this.$emit('select', record)
    },
    onMenuClick (actionType, record) {
      this.$emit('action', { actionType, record })
    },
    // 用户手动展开/折叠时同步受控状态，保证本树展开态独立可控
    onExpandedRowsChange (keys) {
      this.expandedRowKeys = keys
    },
    /**
     * 导航联动定位（R3.3 / R3.4 / R3.5 / R3.6 / R3.7）。
     *
     * 仅当导航节点的 viewType 与本（编辑区）树 viewType 一致、且该节点在本树中存在
     * （store 已将其子树写入 filteredTargetTreeData）时，才展示子树、展开下级、
     * 设为选中态并滚动至可见；否则保持当前展示 / 选中 / 滚动位置不变，不抛异常。
     */
    handleNavLink () {
      const navNode = this.selectedNavNode
      // 无导航选中（或被清除）：退出联动，恢复展示完整树
      if (!navNode) {
        this.navLinkActive = false
        this.expandedRowKeys = collectExpandableKeys(this.dataSource)
        return
      }
      // 类型不一致：保持当前展示 / 选中 / 滚动不变（R3.4）
      if (navNode.viewType !== this.viewType) return
      // 校验节点是否存在于本树：store 命中时会把以该节点为根的子树写入 filteredTargetTreeData
      const filtered = this.filteredTargetTreeData
      const root = Array.isArray(filtered) && filtered.length ? filtered[0] : null
      // 节点不存在（filtered 根与导航节点不一致）：保持当前展示 / 选中 / 滚动不变（R3.7）
      if (!root || root.id !== navNode.id) return
      // 命中：展示子树、展开其下级、设为选中态并滚动至可见
      this.navLinkActive = true
      this.selectedRowKeys = [navNode.id]
      // 叶子节点 collectExpandableKeys 返回空数组，仅展示自身、不展开（R3.6）
      this.expandedRowKeys = collectExpandableKeys(filtered)
      this.$nextTick(() => {
        this.scrollRowIntoView(navNode.id)
      })
    },
    // 将指定 key 的行滚动至可见区域（R3.3 滚动至节点可见）
    scrollRowIntoView (key) {
      if (!this.$el || typeof this.$el.querySelectorAll !== 'function') return
      const target = String(key)
      const rows = this.$el.querySelectorAll('tr[data-row-key]')
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].getAttribute('data-row-key') === target) {
          if (typeof rows[i].scrollIntoView === 'function') {
            rows[i].scrollIntoView({ block: 'nearest' })
          }
          break
        }
      }
    },
    rowClassName (record) {
      const classes = []
      if (record.rowState === 'Added') classes.push('bom-node-state-added')
      else if (record.rowState === 'Modified') classes.push('bom-node-state-modified')
      else if (record.rowState === 'Deleted') classes.push('bom-node-state-deleted')
      if (this.selectedRowKeys.indexOf(record.id) !== -1) classes.push('bom-row-selected')
      return classes.join(' ')
    }
  }
}
</script>

<style lang="less" scoped>
.bom-menu-danger {
  color: #d93025;
}

/**
 * 固定数据行行高（R6.3 / R6.4）。
 */
.bom-tree-panel /deep/ .ant-table-tbody > tr > td {
  height: 39px;
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: 1.5;
  vertical-align: middle;
}

.bom-tree-panel__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 480px;
  color: rgba(0, 0, 0, 0.45);
}
</style>
