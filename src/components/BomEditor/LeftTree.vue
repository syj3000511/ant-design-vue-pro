<template>
  <div class="bom-tree-panel">
    <div class="bom-tree-panel__title">
      <span>原结构（已发布 · 只读）</span>
      <a-tag v-if="sourceViewType" color="blue">{{ sourceViewType }}</a-tag>
    </div>
    <!-- 未激活导航联动时显示引导提示 -->
    <div v-if="!navLinkActive" class="bom-tree-panel__placeholder">
      <a-empty description="请点击左侧导航树节点以查看对应结构" :image="simpleImage" />
    </div>
    <a-table
      v-else
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
    />
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { Empty } from 'ant-design-vue'
import { commonColumns, buildEllipsisColumns, showTitleWhenTruncated, SOURCE_TABLE_WIDTH } from './columns'
import { collectExpandableKeys } from './treeUtils'

export default {
  name: 'BomLeftTree',
  props: {
    dataSource: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    },
    sourceViewType: {
      type: String,
      default: ''
    }
  },
  data () {
    return {
      simpleImage: Empty.PRESENTED_IMAGE_SIMPLE,
      // 当前选中行的 id（最多 1 个，最后一次点击的行）
      selectedRowKey: null,
      // 受控展开行 key 列表（默认全部展开，导航联动时展开子树下级）
      expandedRowKeys: [],
      // 是否处于导航联动状态：true 时展示过滤后的子树，否则显示引导空状态
      navLinkActive: false
    }
  },
  computed: {
    ...mapState('bomTree', ['selectedNavNode', 'filteredSourceTreeData']),
    // 导航联动激活时使用过滤子树作为数据源，否则不显示任何数据（等待用户点击导航树节点）
    displayData () {
      return this.navLinkActive ? this.filteredSourceTreeData : this.dataSource
    },
    // 固定表格总宽，使列宽稳定、与编辑区公共列对齐，超长文本以省略号截断而非撑开列
    tableWidth () {
      return SOURCE_TABLE_WIDTH
    },
    // 数据列单行省略 + 按需 title，与编辑区树行为一致（避免文字换行导致行高不一致）
    columns () {
      return buildEllipsisColumns(commonColumns, showTitleWhenTruncated)
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
    // 整行点击选中：通过 a-table 的 customRow 绑定 click 事件
    customRow (record) {
      return {
        on: {
          click: () => this.onRowClick(record)
        }
      }
    },
    onRowClick (record) {
      // 保持最多单行选中；再次点击已选行时保持不变（始终指向最后一次点击的行）
      this.selectedRowKey = record.id
      // 选中是共享状态，提交到 Vuex（可被 Devtools 追踪），重构栏从 store 读取
      this.$store.commit('bomTree/SET_SOURCE_SELECTED', record)
      this.$emit('select', record)
    },
    rowClassName (record) {
      return record.id === this.selectedRowKey ? 'bom-row-selected' : ''
    },
    // 用户手动展开/折叠时同步受控状态，保证本树展开态独立可控
    onExpandedRowsChange (keys) {
      this.expandedRowKeys = keys
    },
    /**
     * 导航联动定位（R3.2 / R3.4 / R3.5 / R3.6 / R3.7）。
     *
     * 仅当导航节点的 viewType 与本树 sourceViewType 一致、且该节点在本树中存在
     * （store 已将其子树写入 filteredSourceTreeData）时，才展示子树、展开下级、
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
      if (navNode.viewType !== this.sourceViewType) return
      // 校验节点是否存在于本树：store 命中时会把以该节点为根的子树写入 filteredSourceTreeData
      const filtered = this.filteredSourceTreeData
      const root = Array.isArray(filtered) && filtered.length ? filtered[0] : null
      // 节点不存在（filtered 根与导航节点不一致）：保持当前展示 / 选中 / 滚动不变（R3.7）
      if (!root || root.id !== navNode.id) return
      // 命中：展示子树、展开其下级、设为选中态并滚动至可见
      this.navLinkActive = true
      this.selectedRowKey = navNode.id
      // 叶子节点 collectExpandableKeys 返回空数组，仅展示自身、不展开（R3.6）
      this.expandedRowKeys = collectExpandableKeys(filtered)
      this.$nextTick(() => {
        this.scrollRowIntoView(navNode.id)
      })
    },
    // 将指定 key 的行滚动至可见区域（R3.2 滚动至节点可见）
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
    }
  }
}
</script>

<style lang="less" scoped>
/**
 * 固定数据行行高，与编辑区树（RightTree）一致：单行文本行高，不随内容长度变化，
 * 保证左右两树同一层级行的垂直位置对齐。使用 /deep/ 穿透 a-table 内部 <td>。
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
