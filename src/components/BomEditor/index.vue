<template>
  <div class="bom-editor">
    <!-- 顶部工具栏 -->
    <div class="bom-editor__toolbar">
      <a-space>
        <a-button icon="reload" :loading="loading" @click="loadTreeData">重新加载</a-button>
        <a-button icon="undo" :loading="undoLoading" @click="handleUndo">撤销</a-button>
        <a-tooltip :title="transformHint">
          <a-button
            type="primary"
            icon="swap"
            :disabled="!canTransform"
            :loading="transformLoading"
            @click="onTransform({ source: selectedSourceNode, target: selectedTargetNode })"
          >
            重构
          </a-button>
        </a-tooltip>
        <span v-if="!canTransform" class="bom-editor__transform-hint">{{ transformHint }}</span>
      </a-space>
      <a-space>
        <a-tag color="blue">原结构：{{ sourceViewType || '-' }}</a-tag>
        <a-tag color="green">编辑区：{{ viewType }}</a-tag>
        <a-button
          icon="profile"
          :type="sidebarVisible ? 'primary' : 'default'"
          @click="sidebarVisible = !sidebarVisible"
        >
          侧边栏
        </a-button>
      </a-space>
    </div>

    <!-- 颜色图例：置于编辑区上方的独立条，不进入任一树表内部，避免影响两表行对齐 -->
    <div class="bom-legend bom-legend--bar">
      <span class="bom-legend__label">图例：</span>
      <span class="bom-legend__item">
        <i class="bom-legend__swatch bom-legend__swatch--unchanged"></i>未变更
      </span>
      <span class="bom-legend__item">
        <i class="bom-legend__swatch bom-legend__swatch--added"></i>新增
      </span>
      <span class="bom-legend__item">
        <i class="bom-legend__swatch bom-legend__swatch--modified"></i>修改 / 升版
      </span>
      <span class="bom-legend__item">
        <i class="bom-legend__swatch bom-legend__swatch--deleted"></i>删除
      </span>
      <span class="bom-legend__item">
        <i class="bom-legend__swatch bom-legend__swatch--selected"></i>当前选中
      </span>
    </div>

    <!-- 四栏比对区：导航栏 → 原结构树表 → 编辑区树表 → 侧边栏 -->
    <div class="bom-comparison-container">
      <bom-navigation-panel
        :published-tree-data="publishedTreeData"
        :source-tree-data="sourceTreeData"
        :target-tree-data="targetTreeData"
        :loading="loading"
        :load-error="loadError"
      />
      <bom-left-tree
        :data-source="sourceTreeData"
        :loading="loading"
        :source-view-type="sourceViewType"
      />
      <bom-right-tree
        :data-source="targetTreeData"
        :loading="loading"
        :view-type="viewType"
        :allowed-actions="allowedActions"
        @action="onNodeAction"
      />
      <!-- 侧边栏外层包裹：负责 300ms 显隐过渡，隐藏时归还横向空间（R7.6 / R7.8） -->
      <div
        class="bom-sidebar-wrapper"
        :class="{ 'bom-sidebar-wrapper--hidden': !sidebarVisible }"
      >
        <bom-conflict-panel
          :conflicts="conflicts"
          :history="operationHistory"
          :undo-loading="undoLoading"
          @resolve="onResolveConflict"
          @undo="handleUndo"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import { message, Modal } from 'ant-design-vue'
import cloneDeep from 'lodash.clonedeep'
import LeftTree from './LeftTree'
import RightTree from './RightTree'
import ConflictPanel from './ConflictPanel'
import NavigationPanel from './NavigationPanel'
import { generateOperationId } from './treeUtils'
import { getBOMService } from '@/services/bom/bomServiceFactory'

// 撤销请求超时时间（毫秒）：服务端单步撤销最长等待 30s（R9.3）
const UNDO_TIMEOUT_MS = 30000

/**
 * 格式化为「YYYY/MM/DD HH:mm:ss」：变更历史时间需含年月日时分（R8.5）。
 * @param {Date} d
 * @returns {string}
 */
function formatDateTime (d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default {
  name: 'BomEditor',
  components: {
    'bom-left-tree': LeftTree,
    'bom-right-tree': RightTree,
    'bom-conflict-panel': ConflictPanel,
    'bom-navigation-panel': NavigationPanel
  },
  props: {
    // 视图类型：EBOM / SBOM / ...
    viewType: {
      type: String,
      default: 'SBOM'
    },
    rootPartId: {
      type: String,
      default: 'ROOT-0001'
    },
    changeContextId: {
      type: String,
      default: 'CHG-DEMO-0001'
    }
  },
  data () {
    return {
      loading: false,
      undoLoading: false,
      transformLoading: false,
      sidebarVisible: true,
      // 导航树数据加载是否失败（用于导航栏加载失败提示）
      loadError: false
    }
  },
  computed: {
    ...mapState('bomTree', [
      'sourceTreeData',
      'targetTreeData',
      'publishedTreeData',
      'activeRules',
      'operationHistory',
      'conflicts',
      'selectedSourceNode',
      'selectedTargetNode'
    ]),
    ...mapGetters('bomTree', ['lastOperation', 'canTransform']),
    sourceViewType () {
      return this.activeRules ? this.activeRules.sourceViewType : ''
    },
    allowedActions () {
      return this.activeRules ? this.activeRules.allowedActions : ['add', 'revise', 'delete', 'update']
    },
    // 重构按钮禁用时的引导提示：指明当前缺失的源节点 / 目标父节点（R5.7）
    transformHint () {
      if (!this.selectedSourceNode && !this.selectedTargetNode) {
        return '请在原结构树选中源节点，并在编辑区树选中目标父节点'
      }
      if (!this.selectedSourceNode) {
        return '请在原结构树选中要重构的源节点'
      }
      if (!this.selectedTargetNode) {
        return '请在编辑区树选中目标父节点'
      }
      return `将「${this.selectedSourceNode.partNumber}」重构到「${this.selectedTargetNode.partNumber}」下`
    },
    hasPendingWrite () {
      return this.loading || this.undoLoading || this.transformLoading
    }
  },
  created () {
    this.loadTreeData()
  },
  mounted () {
    window.addEventListener('beforeunload', this.onBeforeUnload)
  },
  beforeDestroy () {
    window.removeEventListener('beforeunload', this.onBeforeUnload)
  },
  methods: {
    service () {
      return getBOMService(this.viewType)
    },

    async loadTreeData () {
      this.loading = true
      this.loadError = false
      try {
        const context = await this.service().loadBOMTree(this.rootPartId, this.viewType, this.changeContextId)
        this.$store.dispatch('bomTree/setContext', context)
      } catch (error) {
        this.loadError = true
        console.error('[BomEditor] loadBOMTree error:', error)
        message.error(error.message || '加载失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 写操作统一入口：加锁 → 调用服务 → 成功解锁 / 失败按类型处理（设计文档 7.2）。
     */
    async executeWriteOperation (nodeId, operation) {
      const store = this.$store
      if (store.getters['bomNodeState/isNodeLocked'](nodeId)) {
        message.warning('节点正在处理中，请稍候')
        return null
      }
      await store.dispatch('bomNodeState/lockNode', { nodeId, operation: 'write' })
      try {
        const result = await operation()
        await store.dispatch('bomNodeState/clearNodeState', nodeId)
        return result
      } catch (error) {
        const status = error.response && error.response.status
        if (status === 409) {
          await store.dispatch('bomNodeState/markConflict', { nodeId })
          message.error('并发冲突：数据已被修改，请刷新')
        } else {
          await store.dispatch('bomNodeState/markError', { nodeId, message: error.message })
          message.error(error.message || '操作失败')
        }
        throw error
      }
    },

    onNodeAction ({ actionType, record }) {
      switch (actionType) {
        case 'add':
          this.handleAddChild(record)
          break
        case 'revise':
          this.handleRevise(record)
          break
        case 'delete':
          this.handleDelete(record)
          break
        case 'update':
          this.handleUpdate(record)
          break
        default:
          break
      }
    },

    async handleAddChild (parentNode) {
      await this.executeWriteOperation(parentNode.id, async () => {
        const result = await this.service().addChildPart({
          changeContextId: this.changeContextId,
          operationId: generateOperationId(),
          parentId: parentNode.id,
          parentPartId: parentNode.partId,
          parentStructureVersion: parentNode.structureVersion || '',
          partNumber: '',
          quantity: 1
        })
        await this.$store.dispatch('bomTree/insertNode', { parentId: parentNode.id, node: result.newNode })
        this.$store.commit('bomTree/PUSH_OPERATION', this.buildOp({
          type: '新增',
          label: `在「${parentNode.partNumber}」下新增下级零件「${result.newNode.partNumber}」`,
          result,
          undo: { inserted: true, nodeId: result.newNode.id }
        }))
        message.success('新增成功')
      }).catch(() => {})
    },

    async handleRevise (node) {
      // 记录操作前快照，供撤销时整体还原（深拷贝避免后续被引用修改）
      const snapshot = cloneDeep(node)
      await this.executeWriteOperation(node.id, async () => {
        const result = await this.service().revisePart({
          changeContextId: this.changeContextId,
          operationId: generateOperationId(),
          nodeId: node.id,
          partId: node.partId,
          baseUpdateTime: node.updateTime
        })
        await this.$store.dispatch('bomTree/replaceNode', result.newNode)
        this.$store.commit('bomTree/PUSH_OPERATION', this.buildOp({
          type: '升版',
          label: `将零件「${node.partNumber}」升版`,
          result,
          undo: { inserted: false, nodeId: node.id, snapshot }
        }))
        message.success('升版成功')
      }).catch(() => {})
    },

    handleDelete (node) {
      const snapshot = cloneDeep(node)
      Modal.confirm({
        title: '确认删除',
        content: `确认删除「${node.partNumber}」？`,
        onOk: async () => {
          await this.executeWriteOperation(node.id, async () => {
            await this.service().deleteRelationship({
              changeContextId: this.changeContextId,
              operationId: generateOperationId(),
              linkId: node.id,
              parentId: node.parentId || '',
              baseUpdateTime: node.updateTime,
              parentStructureVersion: ''
            })
            await this.$store.dispatch('bomTree/softDeleteNode', node.id)
            this.$store.commit('bomTree/PUSH_OPERATION', this.buildOp({
              type: '删除',
              label: `删除零件「${node.partNumber}」`,
              undo: { inserted: false, nodeId: node.id, snapshot }
            }))
            message.success('删除成功')
          }).catch(() => {})
        }
      })
    },

    async handleUpdate (node) {
      const snapshot = cloneDeep(node)
      await this.executeWriteOperation(node.id, async () => {
        await this.$store.dispatch('bomTree/patchNode', { id: node.id, patch: { rowState: 'Modified' } })
        this.$store.commit('bomTree/PUSH_OPERATION', this.buildOp({
          type: '修改',
          label: `修改零件「${node.partNumber}」的属性`,
          undo: { inserted: false, nodeId: node.id, snapshot }
        }))
        message.success('修改成功')
      }).catch(() => {})
    },

    async onTransform ({ source, target }) {
      if (!source || !target) return
      this.transformLoading = true
      try {
        const result = await this.service().transformStructure({
          changeContextId: this.changeContextId,
          operationId: generateOperationId(),
          sourceNodeId: source.id,
          // 携带源节点件号 / 名称，使重构到编辑区后保持与原 EBOM 一致（不改名）
          sourcePartNumber: source.partNumber,
          sourceName: source.name,
          targetParentId: target.id,
          targetParentPartNumber: target.partNumber,
          targetParentStructureVersion: target.structureVersion || ''
        })
        await this.$store.dispatch('bomTree/insertNode', { parentId: target.id, node: result.newNode })
        this.$store.commit('bomTree/PUSH_OPERATION', this.buildOp({
          type: '重构',
          label: `将「${source.partNumber} ${source.name}」重构到「${target.partNumber}」下`,
          result,
          undo: { inserted: true, nodeId: result.newNode.id }
        }))
        message.success('重构成功')
      } catch (error) {
        message.error(error.message || '重构失败')
      } finally {
        this.transformLoading = false
      }
    },

    /**
     * 从变更历史「最近优先」撤销（LIFO）。
     *
     * 同时服务于工具栏「撤销」按钮与侧边栏变更历史栈顶撤销入口（SidePanel `@undo`）。
     *  - 取 operationHistory 栈顶（lastOperation）作为撤销目标；无则提示并返回。
     *  - 请求进行中（undoLoading）期间禁止重入，防止重复提交（R9.7）。
     *  - 对 undoOperation 请求设 30s 超时（R9.3）：用 Promise.race 在超时未返回时拒绝。
     *  - 成功（success && restoredNode）：replaceNode 更新编辑区 + POP_OPERATION 移除栈顶（R9.4）。
     *  - 失败 / 超时：仅提示错误原因，operationHistory 与编辑区树均不变（R9.5），不弹栈。
     *  - 无论成功 / 失败 / 超时，请求结束后均重新启用入口（R9.8）。
     */
    async handleUndo () {
      // 请求进行中：禁止重入（R9.7），防止工具栏按钮与历史入口重复提交
      if (this.undoLoading) {
        return
      }
      const last = this.lastOperation
      if (!last) {
        message.info('没有可撤销的操作')
        return
      }
      this.undoLoading = true
      try {
        const result = await this.withUndoTimeout(
          this.service().undoOperation(this.changeContextId, last.operationId)
        )
        if (result && result.success) {
          // 服务端确认可撤销后，在前端按操作记录的逆操作描述符真正回退编辑区树。
          // （不再依赖服务端返回的 restoredNode——其在 Mock 下携带全新 id 而无法定位，
          //  导致此前「撤销不生效」。改用操作前快照 / 物理移除可靠还原。）
          await this.$store.dispatch('bomTree/applyUndo', last.undo)
          this.$store.dispatch('bomTree/undoLastOperation')
          message.success('撤销成功')
        } else {
          // 失败：保持 operationHistory 与编辑区树不变，不弹栈（R9.5）
          message.error('撤销失败，该操作已被后续变更依赖')
        }
      } catch (error) {
        // 失败或 30s 超时：保持历史与编辑区不变，仅提示原因（R9.5）
        message.error((error && error.message) || '撤销失败')
      } finally {
        // 请求结束（成功 / 失败 / 超时）重新启用撤销入口（R9.8）
        this.undoLoading = false
      }
    },

    /**
     * 为撤销请求附加 30s 超时（R9.3）。
     * 底层 undoOperation 不接受超时参数，故用 Promise.race 包裹：
     * 超时后拒绝以触发失败分支（编辑区与历史保持不变）。
     * @param {Promise} promise undoOperation 返回的 Promise
     * @returns {Promise}
     */
    withUndoTimeout (promise) {
      let timer = null
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('撤销请求超时，请稍后重试'))
        }, UNDO_TIMEOUT_MS)
      })
      return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer)
      })
    },

    onResolveConflict (conflictId) {
      this.$store.commit('bomTree/RESOLVE_CONFLICT', conflictId)
    },

    buildOp ({ type, label, result, undo }) {
      const res = result || {}
      return {
        operationId: res.operationId || generateOperationId(),
        operationType: type,
        label,
        time: formatDateTime(new Date()),
        undo: undo || null
      }
    },

    onBeforeUnload (e) {
      if (this.$store.getters['bomNodeState/hasConflict'] || this.hasPendingWrite) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
  }
}
</script>

<style lang="less" scoped>
.bom-editor {
  padding: 12px;
  background: #fff;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__transform-hint {
    color: rgba(0, 0, 0, 0.45);
    font-size: 12px;
  }
}
</style>
