import {
  insertChild,
  updateNode as updateNodeImmutable,
  replaceNode as replaceNodeImmutable,
  markNodeDeleted,
  removeNode as removeNodeImmutable,
  findNodeById,
  resolveLinkedTree
} from '@/components/BomEditor/treeUtils'

/**
 * BOM 树数据 Store（对应设计文档 stores/treeData.ts）。
 *
 * 维护：
 *  - sourceTreeData  左侧原结构（只读）
 *  - targetTreeData  右侧编辑区（可写）
 *  - activeRules     当前视图规则
 *  - operationHistory 前端记录的操作栈（用于撤销关联 operationId）
 *  - conflicts       服务端返回的未处理冲突列表
 *
 * 所有树写操作走 treeUtils 的不可变实现，整体替换 targetTreeData 触发响应式更新。
 */
const bomTree = {
  namespaced: true,
  state: {
    sourceTreeData: [],
    targetTreeData: [],
    // 已发布最新版完整 BOM 树（供最左侧导航栏展示与筛选；区别于局部的 sourceTreeData / targetTreeData）
    publishedTreeData: [],
    activeRules: null,
    selectedSourceNode: null,
    selectedTargetNode: null,
    operationHistory: [],
    conflicts: [],
    // 导航相关：当前导航选中节点、联动过滤后的两侧树数据、导航搜索关键字
    selectedNavNode: null,
    filteredSourceTreeData: [],
    filteredTargetTreeData: [],
    navSearchKeyword: ''
  },
  getters: {
    lastOperation: (state) => {
      return state.operationHistory.length
        ? state.operationHistory[state.operationHistory.length - 1]
        : null
    },
    unresolvedConflicts: (state) => state.conflicts.filter((c) => !c.resolved),
    findTarget: (state) => (id) => findNodeById(state.targetTreeData, id),
    canTransform: (state) => !!state.selectedSourceNode && !!state.selectedTargetNode
  },
  mutations: {
    SET_CONTEXT (state, { treeData, sourceTreeData, publishedTreeData, rules }) {
      state.targetTreeData = treeData || []
      state.sourceTreeData = sourceTreeData || []
      // 已发布完整树缺省回退为原结构树，兼容未提供该字段的旧上下文
      state.publishedTreeData = publishedTreeData || sourceTreeData || []
      state.activeRules = rules || null
    },
    SET_TARGET_TREE (state, tree) {
      state.targetTreeData = tree
    },
    SET_SOURCE_SELECTED (state, node) {
      state.selectedSourceNode = node
    },
    SET_TARGET_SELECTED (state, node) {
      state.selectedTargetNode = node
    },
    PUSH_OPERATION (state, op) {
      state.operationHistory.push(op)
    },
    POP_OPERATION (state) {
      state.operationHistory.pop()
    },
    SET_CONFLICTS (state, conflicts) {
      state.conflicts = conflicts
    },
    ADD_CONFLICT (state, conflict) {
      state.conflicts.push(conflict)
    },
    RESOLVE_CONFLICT (state, conflictId) {
      const c = state.conflicts.find((x) => x.id === conflictId)
      if (c) c.resolved = true
    },
    SET_NAV_SELECTED (state, node) {
      state.selectedNavNode = node
    },
    SET_FILTERED_SOURCE_TREE (state, tree) {
      state.filteredSourceTreeData = tree
    },
    SET_FILTERED_TARGET_TREE (state, tree) {
      state.filteredTargetTreeData = tree
    },
    SET_NAV_SEARCH_KEYWORD (state, keyword) {
      state.navSearchKeyword = keyword
    }
  },
  actions: {
    setContext ({ commit }, context) {
      commit('SET_CONTEXT', context)
    },
    /** 在 parentId 下插入新节点 */
    insertNode ({ commit, state }, { parentId, node }) {
      commit('SET_TARGET_TREE', insertChild(state.targetTreeData, parentId, node))
    },
    /** 合并更新节点字段 */
    patchNode ({ commit, state }, { id, patch }) {
      commit('SET_TARGET_TREE', updateNodeImmutable(state.targetTreeData, id, patch))
    },
    /** 用整个新节点替换同 id 节点 */
    replaceNode ({ commit, state }, node) {
      commit('SET_TARGET_TREE', replaceNodeImmutable(state.targetTreeData, node))
    },
    /** 软删除（标记为 Deleted 以供比对展示） */
    softDeleteNode ({ commit, state }, id) {
      commit('SET_TARGET_TREE', markNodeDeleted(state.targetTreeData, id))
    },
    /**
     * 应用一次「撤销」的逆操作，真正回退编辑区树（修复「撤销不生效」问题）。
     *
     * 之前的实现依赖服务端返回 restoredNode 再 replaceNode，但 Mock 返回的
     * restoredNode 携带的是全新随机 id，replaceNode 在树中找不到同 id 节点而静默失败，
     * 导致界面看不到任何变化。这里改为依据操作发生时记录的 undo 描述符在前端直接回退：
     *  - inserted=true（新增 / 重构产生的节点）：从树中物理移除该节点；
     *  - 否则（升版 / 修改 / 删除前已存在的节点）：用操作前的快照整体还原该节点。
     * 该逆操作是幂等的：重复应用同一 undo 得到相同结果（节点已移除再移除无副作用；
     * 用同一快照还原两次结果一致）。
     * @param {object} undo 逆操作描述符 { inserted, nodeId, snapshot }
     */
    applyUndo ({ commit, state }, undo) {
      if (!undo) return
      if (undo.inserted) {
        commit('SET_TARGET_TREE', removeNodeImmutable(state.targetTreeData, undo.nodeId))
      } else if (undo.snapshot) {
        commit('SET_TARGET_TREE', replaceNodeImmutable(state.targetTreeData, undo.snapshot))
      }
    },
    recordOperation ({ commit }, op) {
      commit('PUSH_OPERATION', op)
    },
    undoLastOperation ({ commit }) {
      commit('POP_OPERATION')
    },
    /**
     * 点击导航树节点联动两侧树表。
     * 分别用 resolveLinkedTree 计算原结构树（比较 activeRules.sourceViewType）
     * 与编辑区树（比较 activeRules.viewType）应展示的子树：
     *  - 命中（非 null）：写入对应的 filtered* 状态；
     *  - 未命中（null）：保持原 filtered* 不变。
     * 同时记录当前导航选中节点。
     * @param {object} navNode 导航选中节点 { id, viewType, ... }
     */
    selectNavNode ({ commit, state }, navNode) {
      const sourceViewType = state.activeRules ? state.activeRules.sourceViewType : ''
      const viewType = state.activeRules ? state.activeRules.viewType : ''
      const linkedSource = resolveLinkedTree(state.sourceTreeData, sourceViewType, navNode)
      if (linkedSource !== null) {
        commit('SET_FILTERED_SOURCE_TREE', linkedSource)
      }
      const linkedTarget = resolveLinkedTree(state.targetTreeData, viewType, navNode)
      if (linkedTarget !== null) {
        commit('SET_FILTERED_TARGET_TREE', linkedTarget)
      }
      commit('SET_NAV_SELECTED', navNode)
    },
    /** 保存导航搜索关键字 */
    setNavSearchKeyword ({ commit }, keyword) {
      commit('SET_NAV_SEARCH_KEYWORD', keyword)
    },
    /**
     * 清除导航联动：复位导航选中节点与两侧过滤树，
     * 使两棵树表恢复展示各自的完整结构。
     */
    clearNavSelection ({ commit }) {
      commit('SET_NAV_SELECTED', null)
      commit('SET_FILTERED_SOURCE_TREE', [])
      commit('SET_FILTERED_TARGET_TREE', [])
    }
  }
}

export default bomTree
