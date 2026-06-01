# BOM 编辑器与比对方案设计

一个基于 Vue 2 + Vuex + Ant Design Vue 的 BOM 编辑与比对组件。通过服务注册机制接入 EBOM、PBOM、SBOM 等不同视图的具体实现，提供左右独立双树的比对展示，以及基于选中节点的结构重构。

---

## 1. 方案概述

### 1.1 目标与范围

- **目标**：提供统一的 BOM 编辑与比对工作台，支持跨 BOM 类型的结构重构，具备防并发冲突和按视图定制交互的能力。
- **包含**：BOM 结构编辑（增、删、改、升版）、跨视图选中重构、左右双树独立比对展示、单步写库防并发、按视图分发的动态表单。
- **不包含**：正式 BOM 的生效、作废、发布。这些由外层变更流程（Flowable 7.2）控制，组件只在当前变更上下文中编辑。

### 1.2 核心决策

1. **左右独立双树**：左侧为已发布的原结构（只读），右侧为当前变更上下文的编辑区（可读写）。两棵树独立加载、独立渲染，通过相同的列宽配置实现视觉对齐，不构建并集树。
2. **单步实时写库**：每次操作实时落盘到当前变更上下文，携带 `baseUpdateTime` 做乐观锁校验，防止多人同时修改同一节点造成数据覆盖。
3. **服务端单步撤销**：本地撤销在并发场景下不可靠。撤销请求服务端接口，由服务端根据操作历史执行单步回退，前端等待响应后更新本地树。
4. **选中加按钮重构**：不采用拖拽。用户在左侧选中源节点、右侧选中目标父节点，点击"重构"按钮完成跨视图复制。

### 1.3 技术栈

- **前端**：Vue 2.6（Options API）、JavaScript、Ant Design Vue 1.7.8、Vuex 3.6
- **后端**：Java 17、Spring Boot 3.5、MySQL

> 说明：本方案完全基于现有工程的技术栈，不引入 Vue 3、Pinia、TypeScript 等新依赖。状态管理统一使用 Vuex，组件间的共享状态全部落在 Vuex 中，以保证可通过 Vue Devtools 完整追踪。

---

## 2. 整体布局

编辑器采用三栏式布局：

```
+----------------------------------+----------------------------------+------------------+
|        左侧：原结构树表           |        右侧：编辑区树表           |    侧边栏        |
|        （已发布 BOM，只读）        |        （当前变更，可编辑）       |   （默认收起）    |
+----------------------------------+----------------------------------+------------------+
| - 树形表格展示已发布结构          | - 树形表格展示编辑中结构          | - 变更历史       |
| - 节点可选中（单选）              | - 操作菜单：增、删、改、升版      | - 冲突提示列表   |
| - 选中后高亮，作为重构源          | - 节点可选中（单选）              |                  |
|                                  | - 选中后作为重构目标父节点        |                  |
+----------------------------------+----------------------------------+------------------+
|                                  |         [ 重构 ] 按钮             |                  |
+----------------------------------+----------------------------------+------------------+
```

### 2.1 原结构树表（左侧）

- 数据源：已发布的正式 BOM 数据，不含变更上下文。
- 只读：不展示操作菜单，仅支持展开、折叠和节点选中。
- 选中逻辑：单选。选中后提交到 Vuex 的 `selectedSourceNode`，并在行上高亮。

### 2.2 编辑区树表（右侧）

- 数据源：当前变更上下文中的编辑中 BOM 数据。
- 可编辑：操作列下拉菜单提供增、删、改、升版操作。
- 选中逻辑：单选。选中后提交到 Vuex 的 `selectedTargetNode`，并在行上高亮。

### 2.3 重构操作

1. 用户在左侧选中源节点，右侧选中目标父节点。
2. 点击工具栏的"重构"按钮。
3. 前端校验：两侧都必须有选中节点。
4. 调用服务端 `transformStructure` 接口，传入源节点 ID、目标父节点 ID、变更上下文 ID。
5. 服务端完成类型映射、溯源关系建立，返回新节点数据。
6. 前端将新节点插入右侧树对应位置，标记为新增状态。

---

## 3. 双树渲染与对齐

### 3.1 左右独立 Table 方案

使用两个独立的 Ant Design Vue `a-table`，外层用 Flex 容器包裹。左树为只读，右树带操作列。

```vue
<template>
  <div class="bom-comparison-container">
    <!-- 左侧：原结构，只读 -->
    <bom-left-tree
      :data-source="sourceTreeData"
      :loading="loading"
      :source-view-type="sourceViewType"
    />

    <!-- 右侧：编辑区，可编辑 -->
    <bom-right-tree
      :data-source="targetTreeData"
      :loading="loading"
      :view-type="viewType"
      :allowed-actions="allowedActions"
      @action="onNodeAction"
    />
  </div>
</template>
```

### 3.2 列定义

两侧共用相同的列宽配置，确保视觉对齐。列定义集中在 `columns.js`：

```javascript
// src/components/BomEditor/columns.js
export const commonColumns = [
  { title: '件号', dataIndex: 'partNumber', key: 'partNumber', width: 160 },
  { title: '名称', dataIndex: 'name', key: 'name', width: 200 },
  { title: '父件号', dataIndex: 'parentPartNumber', key: 'parentPartNumber', width: 150 },
  { title: '单装数量', dataIndex: 'quantity', key: 'quantity', width: 90 },
  { title: '架次有效性', dataIndex: 'effectivity', key: 'effectivity', width: 130 }
]

// 右侧在公共列基础上追加「操作」列（通过 scopedSlots 渲染下拉菜单）
export const targetColumns = [
  ...commonColumns,
  {
    title: '操作',
    key: 'operation',
    width: 100,
    fixed: 'right',
    scopedSlots: { customRender: 'operation' }
  }
]
```

- 两侧表格使用相同列宽，通过固定 `width` 保证对齐。
- 左右两侧的展开、折叠状态各自独立管理。两侧数据源不同，结构可能存在差异（新增、删除、重构），强制同步展开会导致对应关系混乱。

---

## 4. 节点状态与视觉规范

### 4.1 状态定义

编辑区节点的"变更状态"用于比对展示，记录在节点的 `rowState` 字段上：

| 状态 | 含义 | 视觉表现 |
|---|---|---|
| `Added` | 本次变更新增 | 淡绿底色，左侧绿色指示条 |
| `Modified` | 本次变更修改（含升版） | 淡黄底色，左侧黄色指示条 |
| `Deleted` | 本次变更删除 | 淡红底色，文字中划线，透明度 60% |
| `Unchanged` | 未变更 | 无特殊样式 |

### 4.2 行样式

通过 `a-table` 的 `rowClassName` 按 `rowState` 返回对应类名（见 `RightTree.vue`）：

```javascript
rowClassName (record) {
  const classes = []
  if (record.rowState === 'Added') classes.push('bom-node-state-added')
  else if (record.rowState === 'Modified') classes.push('bom-node-state-modified')
  else if (record.rowState === 'Deleted') classes.push('bom-node-state-deleted')
  if (this.selectedRowKeys.indexOf(record.id) !== -1) classes.push('bom-row-selected')
  return classes.join(' ')
}
```

### 4.3 CSS 样式

样式集中在一个 less 文件中，挂在全局或组件层均可：

```less
.bom-node-state-added > td {
  background-color: #e6f4ea;
  box-shadow: inset 4px 0 0 0 #1b7a43;
}

.bom-node-state-modified > td {
  background-color: #fef7e0;
  box-shadow: inset 4px 0 0 0 #f9a825;
}

.bom-node-state-deleted > td {
  color: #c5221f;
  text-decoration: line-through;
  background-color: #fce8e6;
  box-shadow: inset 4px 0 0 0 #d93025;
  opacity: 0.6;
}

.bom-row-selected > td {
  background-color: #e6f7ff;
}
```

---

## 5. 节点操作状态机（Vuex 模块）

节点的"操作状态"（是否正在写库、是否冲突）与上节的"变更状态"是两件事。操作状态用一个独立的 Vuex 模块管理，替代在组件里手写的锁标志位。这样状态变化都经过 mutation，可在 Vue Devtools 中追踪。

### 5.1 状态定义

每个编辑区节点维护一个操作状态：

| status | 含义 |
|---|---|
| `idle` | 空闲，可操作 |
| `locked` | 正在执行写操作，禁用交互 |
| `conflict` | 并发冲突，需要用户处理 |
| `error` | 操作失败，显示错误信息 |

状态对象结构：`{ status, operation?, message?, since? }`。

### 5.2 状态机 Store（`store/modules/bomNodeState.js`）

模块以 `nodeId` 为键保存每个节点的状态，并内置加锁超时保护（15 秒）。Vue 2 中对象新增属性需用 `Vue.set` / `Vue.delete` 保证响应式。

```javascript
import Vue from 'vue'

const LOCK_TIMEOUT_MS = 15000

const bomNodeState = {
  namespaced: true,
  state: {
    nodeStates: {}, // { [nodeId]: { status, operation?, message?, since? } }
    _timers: {}     // { [nodeId]: timerId } 内部用
  },
  getters: {
    getNodeState: (state) => (nodeId) => state.nodeStates[nodeId] || { status: 'idle' },
    isNodeLocked: (state) => (nodeId) => {
      const s = state.nodeStates[nodeId]
      return !!s && s.status === 'locked'
    },
    hasConflict: (state) => Object.keys(state.nodeStates).some(
      (id) => state.nodeStates[id].status === 'conflict'
    )
  },
  mutations: {
    SET_NODE_STATE (state, { nodeId, value }) {
      Vue.set(state.nodeStates, nodeId, value)
    },
    CLEAR_NODE_STATE (state, nodeId) {
      Vue.delete(state.nodeStates, nodeId)
    },
    SET_TIMER (state, { nodeId, timerId }) {
      Vue.set(state._timers, nodeId, timerId)
    },
    CLEAR_TIMER (state, nodeId) {
      if (state._timers[nodeId]) {
        clearTimeout(state._timers[nodeId])
        Vue.delete(state._timers, nodeId)
      }
    }
  },
  actions: {
    lockNode ({ commit, state }, { nodeId, operation }) {
      commit('CLEAR_TIMER', nodeId)
      commit('SET_NODE_STATE', {
        nodeId,
        value: { status: 'locked', operation: operation || 'write', since: Date.now() }
      })
      const timerId = setTimeout(() => {
        const cur = state.nodeStates[nodeId]
        if (cur && cur.status === 'locked') {
          commit('SET_NODE_STATE', { nodeId, value: { status: 'error', message: '操作超时，请重试' } })
        }
        commit('CLEAR_TIMER', nodeId)
      }, LOCK_TIMEOUT_MS)
      commit('SET_TIMER', { nodeId, timerId })
    },
    clearNodeState ({ commit }, nodeId) {
      commit('CLEAR_TIMER', nodeId)
      commit('CLEAR_NODE_STATE', nodeId)
    },
    markConflict ({ commit }, { nodeId, message }) {
      commit('CLEAR_TIMER', nodeId)
      commit('SET_NODE_STATE', {
        nodeId,
        value: { status: 'conflict', message: message || '当前数据已被他人修改，请刷新后重试' }
      })
    },
    markError ({ commit }, { nodeId, message }) {
      commit('CLEAR_TIMER', nodeId)
      commit('SET_NODE_STATE', { nodeId, value: { status: 'error', message: message || '操作失败' } })
    }
  }
}

export default bomNodeState
```

### 5.3 在组件中使用

右树通过 `mapGetters` 读取节点状态，按状态禁用菜单、显示 loading：

```vue
<a-dropdown :trigger="['click']" :disabled="isNodeLocked(record.id)">
  <a-button type="link" size="small" :loading="getNodeState(record.id).status === 'locked'">
    {{ getNodeState(record.id).status === 'locked' ? '处理中' : '操作' }}
  </a-button>
  <!-- ...菜单项... -->
</a-dropdown>
```

```javascript
import { mapGetters } from 'vuex'

computed: {
  ...mapGetters('bomNodeState', ['getNodeState', 'isNodeLocked'])
}
```

---

## 6. 树数据与选中状态（Vuex 模块）

树数据、选中节点、操作历史、冲突列表统一放在 `store/modules/bomTree.js` 模块中。**特别说明选中状态的处理**：左树选中源节点、右树选中目标父节点，都是需要被多个组件读取的共享状态（重构栏要读、工具栏按钮要读），属于状态而非一次性事件，因此放进 Vuex，而不是用事件总线广播。这样每次选中都会在 Devtools 中留下一条 mutation 记录，便于排查"为什么重构按钮没亮"这类问题。

### 6.1 模块结构（`store/modules/bomTree.js`）

```javascript
import {
  insertChild,
  updateNode as updateNodeImmutable,
  replaceNode as replaceNodeImmutable,
  markNodeDeleted,
  findNodeById
} from '@/components/BomEditor/treeUtils'

const bomTree = {
  namespaced: true,
  state: {
    sourceTreeData: [],      // 左侧原结构（只读）
    targetTreeData: [],      // 右侧编辑区（可写）
    activeRules: null,       // 当前视图规则
    selectedSourceNode: null, // 左树选中（重构源）
    selectedTargetNode: null, // 右树选中（重构目标父节点）
    operationHistory: [],    // 操作栈，用于关联撤销的 operationId
    conflicts: []            // 服务端返回的未处理冲突
  },
  getters: {
    lastOperation: (state) => state.operationHistory.length
      ? state.operationHistory[state.operationHistory.length - 1]
      : null,
    unresolvedConflicts: (state) => state.conflicts.filter((c) => !c.resolved),
    findTarget: (state) => (id) => findNodeById(state.targetTreeData, id),
    canTransform: (state) => !!state.selectedSourceNode && !!state.selectedTargetNode
  },
  mutations: {
    SET_CONTEXT (state, { treeData, sourceTreeData, rules }) {
      state.targetTreeData = treeData || []
      state.sourceTreeData = sourceTreeData || []
      state.activeRules = rules || null
    },
    SET_TARGET_TREE (state, tree) { state.targetTreeData = tree },
    SET_SOURCE_SELECTED (state, node) { state.selectedSourceNode = node },
    SET_TARGET_SELECTED (state, node) { state.selectedTargetNode = node },
    PUSH_OPERATION (state, op) { state.operationHistory.push(op) },
    POP_OPERATION (state) { state.operationHistory.pop() },
    SET_CONFLICTS (state, conflicts) { state.conflicts = conflicts },
    ADD_CONFLICT (state, conflict) { state.conflicts.push(conflict) },
    RESOLVE_CONFLICT (state, conflictId) {
      const c = state.conflicts.find((x) => x.id === conflictId)
      if (c) c.resolved = true
    }
  },
  actions: {
    setContext ({ commit }, context) { commit('SET_CONTEXT', context) },
    insertNode ({ commit, state }, { parentId, node }) {
      commit('SET_TARGET_TREE', insertChild(state.targetTreeData, parentId, node))
    },
    patchNode ({ commit, state }, { id, patch }) {
      commit('SET_TARGET_TREE', updateNodeImmutable(state.targetTreeData, id, patch))
    },
    replaceNode ({ commit, state }, node) {
      commit('SET_TARGET_TREE', replaceNodeImmutable(state.targetTreeData, node))
    },
    softDeleteNode ({ commit, state }, id) {
      commit('SET_TARGET_TREE', markNodeDeleted(state.targetTreeData, id))
    },
    recordOperation ({ commit }, op) { commit('PUSH_OPERATION', op) },
    undoLastOperation ({ commit }) { commit('POP_OPERATION') }
  }
}

export default bomTree
```

### 6.2 树操作工具（`treeUtils.js`）

所有树的增删改都通过纯函数完成，返回一棵新的根数组，再整体替换 `targetTreeData` 触发响应式更新。纯函数不依赖 Vue、不产生副作用，便于单元测试。核心函数：

- `findNodeById(nodes, id)` 深度优先查找节点
- `findParentNode(nodes, id)` 查找父节点
- `insertChild(nodes, parentId, child)` 在指定父节点下插入子节点
- `updateNode(nodes, id, patch)` 合并更新节点字段
- `replaceNode(nodes, newNode)` 用整个节点替换同 id 节点
- `markNodeDeleted(nodes, id)` 软删除（标记 `rowState = 'Deleted'`）
- `removeNode(nodes, id)` 物理移除节点
- `collectExpandableKeys(nodes)` 收集可展开节点 id
- `generateOperationId()` 生成会话内唯一的操作 id

### 6.3 选中通信：从事件总线改为 Vuex

原实现中左右树的选中通过事件总线 `bomEventBus.$emit('selection:source-changed', ...)` 广播，重构栏 `$on` 订阅。该方式的问题是事件不经过 Vuex，**Vue Devtools 无法追踪**，且选中值散落在各组件的 data 中，难以保证一致。

改造后，选中直接提交到 Vuex：

```javascript
// LeftTree.vue
onSelectChange (selectedRowKeys, selectedRows) {
  this.selectedRowKeys = selectedRowKeys
  this.$store.commit('bomTree/SET_SOURCE_SELECTED', selectedRows[0] || null)
}

// RightTree.vue
onSelectChange (selectedRowKeys, selectedRows) {
  this.selectedRowKeys = selectedRowKeys
  this.$store.commit('bomTree/SET_TARGET_SELECTED', selectedRows[0] || null)
}
```

重构栏不再订阅事件，改为从 Vuex 读取：

```javascript
import { mapState, mapGetters } from 'vuex'

computed: {
  ...mapState('bomTree', ['selectedSourceNode', 'selectedTargetNode']),
  ...mapGetters('bomTree', ['canTransform'])
}
```

### 6.4 状态归属总结

明确每类信息的归属，避免重复存储：

| 信息 | 归属 | 是否进 Devtools |
|---|---|---|
| 左右树数据 | `bomTree.targetTreeData / sourceTreeData` | 是 |
| 左右树选中节点 | `bomTree.selectedSourceNode / selectedTargetNode` | 是 |
| 节点操作状态（锁、冲突） | `bomNodeState.nodeStates` | 是 |
| 操作历史、冲突列表 | `bomTree.operationHistory / conflicts` | 是 |
| 行展开状态、当前页 loading | 组件局部 data | 否（纯 UI，无需共享） |
| 一次性通知（请求重载、弹提示） | 事件总线 | 否（无持久值） |

原则：**有持久值、需被多个组件读取的，放 Vuex；只是一次性通知、不保留值的，才用事件总线。**

---

## 7. 实时写库与并发控制

### 7.1 乐观锁原理

BOM 编辑是协同场景，多人可能同时修改同一棵树。每次写操作携带该节点最后读取时的 `baseUpdateTime`，后端写库前检查：

- 数据库中的 `updateTime` 与传入的 `baseUpdateTime` 一致：允许写入，并更新 `updateTime`。
- 不一致：返回 409 Conflict，说明该节点已被他人修改。

涉及父节点子项集合变更的操作（新增下级、删除、调序），额外携带 `parentStructureVersion` 校验父节点的子项集合版本。

### 7.2 写操作统一入口

所有写操作通过一个统一的辅助方法执行：加锁、调用服务、成功解锁、失败按类型处理。这段逻辑可放在编辑器入口组件的 methods 中，或抽成一个 mixin。

```javascript
import { message } from 'ant-design-vue'

// methods 内
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
}
```

### 7.3 防刷新

页面存在未完成的写请求时，通过 `beforeunload` 事件拦截浏览器关闭和刷新，提示用户有未完成的操作。

```javascript
// 入口组件
mounted () {
  window.addEventListener('beforeunload', this.onBeforeUnload)
},
beforeDestroy () {
  window.removeEventListener('beforeunload', this.onBeforeUnload)
},
methods: {
  onBeforeUnload (e) {
    if (this.$store.getters['bomNodeState/hasConflict'] || this.hasPendingWrite) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
}
```

---

## 8. 服务接入机制（按视图分发）

### 8.1 设计目标

EBOM、PBOM、SBOM 的接口地址、参数、交互各不相同。编辑器核心不应写满 `if (viewType === 'EBOM')` 之类的判断。做法是：定义一组统一的服务方法约定，每种 BOM 类型提供一个实现，编辑器只按视图类型取对应实现来调用。新增一种 BOM 类型时，只需新增一个实现文件并注册一行，编辑器代码不改。

### 8.2 服务方法约定

每个 BOM 服务实现以下方法（JavaScript 中以约定形式描述，不强制接口语法）：

| 方法 | 说明 |
|---|---|
| `loadBOMTree(rootPartId, viewType, changeContextId)` | 加载树，返回 `{ treeData, sourceTreeData, rules }` |
| `revisePart(params)` | 升版 |
| `addChildPart(params)` | 新增下级 |
| `deleteRelationship(params)` | 删除关系 |
| `transformStructure(params)` | 结构重构（部分视图不支持，抛错） |
| `undoOperation(changeContextId, operationId)` | 服务端单步撤销 |
| `getActionConfig(actionType, node)` | 返回该操作对应的表单页面配置（可选） |

`rules` 字段描述视图规则：

```javascript
{
  viewType: 'SBOM',
  sourceViewType: 'EBOM',        // 左树原结构的视图类型
  allowedPartTypes: ['E', 'F', 'G'],
  allowedActions: ['add', 'revise', 'delete', 'transform']
}
```

### 8.3 实现示例（`services/bom/ebomService.js`）

> 注意：本项目响应拦截器已 `return response.data`，因此 api 调用拿到的是后端报文体 `{ code, result, ... }`，统一从 `result` 取业务数据。

```javascript
import { getEbomTree, ebomRevise, ebomAddChild, ebomDelete, ebomUndo } from '@/api/bom'

export class EbomService {
  async loadBOMTree (rootPartId, viewType, changeContextId) {
    const res = await getEbomTree({ rootPartId, changeContextId })
    const data = res.result || res
    return {
      treeData: data.treeData || [],
      sourceTreeData: data.sourceTreeData || [],
      rules: {
        viewType: 'EBOM',
        sourceViewType: 'EBOM',
        allowedPartTypes: ['A', 'B', 'C'],
        allowedActions: ['add', 'revise', 'delete', 'update']
      }
    }
  }

  async revisePart (params) { const res = await ebomRevise(params); return res.result || res }
  async addChildPart (params) { const res = await ebomAddChild(params); return res.result || res }
  async deleteRelationship (params) { const res = await ebomDelete(params); return res.result || res }

  async transformStructure () {
    // EBOM 原结构亦为 EBOM，重构属同视图复制，本视图不支持
    throw new Error('EBOM does not support transform operation')
  }

  async undoOperation (changeContextId, operationId) {
    const res = await ebomUndo({ changeContextId, operationId })
    return res.result || res
  }

  async getActionConfig (actionType, node) {
    const partType = node.attributes && node.attributes.partType
    if (actionType === 'add') {
      if (partType === 'A') return { url: '/ebom/core-part-apply', openType: 'page', params: { parentPartId: 'partId' } }
      if (partType === 'B') return { url: '/ebom/add-standard-part', openType: 'modal', params: { parentId: 'id' } }
      return { url: '/ebom/add-general-part', openType: 'drawer', params: { parentId: 'id' } }
    }
    if (actionType === 'delete') {
      return { url: '/ebom/delete-relation', openType: 'modal', params: { linkId: 'id' } }
    }
    return null
  }
}

export default EbomService
```

SBOM 实现（`services/bom/sbomService.js`）结构相同，差异在于 `sourceViewType` 为 `'EBOM'`、`allowedActions` 含 `transform`，且 `transformStructure` 真正调用 `/sbom/transform`（自动映射设计件到服务件）。

### 8.4 服务注册（`services/bom/bomServiceFactory.js`）

```javascript
import EbomService from './ebomService'
import SbomService from './sbomService'

const serviceRegistry = {
  EBOM: () => new EbomService(),
  SBOM: () => new SbomService()
  // 新增 PBOM 时，仅需： PBOM: () => new PbomService()
}

const instanceCache = {}

export function getBOMService (viewType) {
  if (instanceCache[viewType]) return instanceCache[viewType]
  const factory = serviceRegistry[viewType]
  if (!factory) throw new Error(`No BOMService implementation registered for view type: ${viewType}`)
  const instance = factory()
  instanceCache[viewType] = instance
  return instance
}

export function registerBOMService (viewType, factory) {
  serviceRegistry[viewType] = factory
  delete instanceCache[viewType]
}

export function hasBOMService (viewType) {
  return !!serviceRegistry[viewType]
}
```

### 8.5 在编辑器中使用

```javascript
import { getBOMService } from '@/services/bom/bomServiceFactory'

// 入口组件 methods
async loadTreeData () {
  const service = getBOMService(this.viewType)
  const context = await service.loadBOMTree(this.rootPartId, this.viewType, this.changeContextId)
  this.$store.dispatch('bomTree/setContext', context)
}

async handleAddChild (parentNode, formData) {
  const service = getBOMService(this.viewType)
  await this.executeWriteOperation(parentNode.id, async () => {
    const result = await service.addChildPart({
      changeContextId: this.changeContextId,
      operationId: generateOperationId(),
      parentId: parentNode.id,
      parentPartId: parentNode.partId,
      parentStructureVersion: parentNode.structureVersion || '',
      partNumber: formData.partNumber,
      quantity: formData.quantity,
      attributes: formData
    })
    await this.$store.dispatch('bomTree/insertNode', { parentId: parentNode.id, node: result.newNode })
  })
}
```

### 8.6 扩展性体现

**新增 PBOM 类型**：

1. 新建 `services/bom/pbomService.js`，实现上述方法。
2. 在 `bomServiceFactory.js` 注册：`PBOM: () => new PbomService()`。
3. 完成，编辑器核心代码一行不改。

**EBOM 新增逻辑变更**：只改 `ebomService.js` 的 `getActionConfig`，不影响 SBOM。

---

## 9. 动态交互分发

不同操作（新增、删除、升版、重构）可能打开不同形态的表单：弹窗（modal）、抽屉（drawer）或独立页面（page）。由 `getActionConfig` 返回配置，前端按 `openType` 分发。

### 9.1 配置结构

```javascript
{
  url: '/ebom/add-standard-part', // 表单页面路由或标识
  openType: 'modal',              // 'modal' | 'drawer' | 'page'
  params: { parentId: 'id' }      // 参数映射：键为表单入参名，值为从节点取值的字段路径
}
```

`params` 的值是从节点对象取值的字段路径：`'id'` 取 `node.id`，`'attributes.partType'` 取 `node.attributes.partType`，其他字符串按字面量传入。

### 9.2 分发逻辑

```javascript
async dispatchAction (actionType, node) {
  const service = getBOMService(this.viewType)
  const config = service.getActionConfig
    ? await service.getActionConfig(actionType, node).catch(() => null)
    : null

  // 无配置：默认走二次确认
  if (!config) {
    this.$confirm({ title: `确认执行 ${actionType}？`, onOk: () => this.confirmAction(actionType, node, {}) })
    return
  }

  const params = this.resolveParams(config, node)
  switch (config.openType) {
    case 'page':
      this.$router.push({ path: config.url, query: params })
      break
    case 'drawer':
      this.openDrawer(config.url, params)
      break
    case 'modal':
    default:
      this.openModal(config.url, params)
      break
  }
},

resolveParams (config, node) {
  if (!config.params) return { nodeId: node.id }
  const result = {}
  Object.keys(config.params).forEach((key) => {
    const path = config.params[key]
    if (path in node) result[key] = node[path]
    else if (path.indexOf('attributes.') === 0) result[key] = node.attributes && node.attributes[path.slice(11)]
    else result[key] = path
  })
  return result
}
```

---

## 10. 撤销机制

本地撤销在并发场景下不可靠，撤销请求服务端单步回退。

### 10.1 流程

1. 用户点击"撤销"。
2. 前端显示 Loading，锁定操作区域。
3. 调用 `undoOperation`，传入 `changeContextId` 和最近一次操作的 `operationId`。
4. 服务端根据操作历史执行单步回退，返回恢复后的节点。
5. 前端更新本地树，弹出操作栈顶记录，清除 Loading。
6. 若服务端返回冲突（该操作已被后续操作依赖），提示无法撤销。

```javascript
async handleUndo () {
  const lastOperation = this.$store.getters['bomTree/lastOperation']
  if (!lastOperation) { this.$message.info('没有可撤销的操作'); return }

  this.undoLoading = true
  try {
    const service = getBOMService(this.viewType)
    const result = await service.undoOperation(this.changeContextId, lastOperation.operationId)
    if (result.success && result.restoredNode) {
      await this.$store.dispatch('bomTree/replaceNode', result.restoredNode)
      await this.$store.dispatch('bomTree/undoLastOperation')
      this.$message.success('撤销成功')
    } else {
      this.$message.error('撤销失败，该操作已被后续变更依赖')
    }
  } catch (error) {
    this.$message.error(error.message || '撤销失败')
  } finally {
    this.undoLoading = false
  }
}
```

---

## 11. 冲突检测与展示

冲突由服务端在写操作后检查并返回，前端被动接收展示。右侧边栏的"冲突提示"列表展示当前未处理的冲突。

冲突项结构：

```javascript
{
  id: '',              // 冲突唯一标识
  nodeId: '',          // 关联节点
  nodePartNumber: '',  // 展示用件号
  message: '',         // 冲突说明
  resolved: false      // 是否已处理
}
```

冲突列表存于 `bomTree.conflicts`，通过 `ADD_CONFLICT` / `RESOLVE_CONFLICT` 维护，由 `ConflictPanel.vue` 渲染。

---

## 12. 事件总线的保留用途

引入 Vuex 管理共享状态后，事件总线仅保留给真正的一次性通知——这类信号没有持久值、不需要追踪、用 Vuex 反而繁琐。

Vue 2 中事件总线用一个空 Vue 实例实现（项目未引入 mitt，无需新增依赖）：

```javascript
// src/utils/bomEventBus.js
import Vue from 'vue'

export const BOM_EVENTS = {
  TREE_RELOAD: 'tree:reload',        // 请求重新加载树
  CONFLICT_TOAST: 'operation:conflict' // 冲突弹一次性提示
}

export const bomEventBus = new Vue()
export default bomEventBus
```

> 选中事件（`selection:source-changed` / `selection:target-changed`）已从事件总线移除，改由 Vuex 管理（见第 6.3 节）。

需要注意：若后续升级到 Vue 3，`$on / $off / $once` 已被移除，事件总线需改用 `mitt` 等外部库。届时仅这一处需要调整，共享状态部分（Vuex）不受影响。

---

## 13. 安全性与异常处理

### 13.1 后端安全边界

- 前端限制仅作交互呈现，不作为安全依据。
- 后端必须校验用户的数据权限。
- 后端必须对 `allowedPartTypes`、`allowedActions` 做最终拦截，防止接口被绕过。

### 13.2 异常处理

| 异常 | 前端处理 |
|---|---|
| 409 Conflict | 提示"数据已被修改，请刷新"，节点进入 conflict 状态 |
| 400 Bad Request | 展示字段级错误提示，保持编辑状态 |
| 网络超时 | 15 秒后节点状态机自动转为 error 解锁 |
| 撤销失败 | 提示具体原因（如后续操作依赖） |

---

## 14. 文件结构

```
src/
├── components/
│   └── BomEditor/
│       ├── index.vue                 # 入口：布局容器、写操作编排
│       ├── LeftTree.vue              # 左侧原结构树表（只读）
│       ├── RightTree.vue             # 右侧编辑区树表（可编辑）
│       ├── TransformBar.vue          # 重构操作栏
│       ├── ConflictPanel.vue         # 冲突列表与变更历史面板
│       ├── columns.js                # 双树列定义
│       └── treeUtils.js              # 树操作纯函数（无副作用，便于单测）
├── store/
│   └── modules/
│       ├── bomTree.js                # 树数据 + 选中 + 操作历史 + 冲突
│       └── bomNodeState.js           # 节点操作状态机（锁、冲突、超时）
├── services/
│   └── bom/
│       ├── ebomService.js            # EBOM 实现（EBOM 团队维护）
│       ├── sbomService.js            # SBOM 实现（SBOM 团队维护）
│       └── bomServiceFactory.js      # 服务注册与获取
├── api/
│   └── bom.js                        # EBOM / SBOM HTTP 接口定义
└── utils/
    └── bomEventBus.js                # 一次性通知事件总线（不存共享状态）
```

> 与 Vue 3 / Pinia 方案的差异：状态管理用 Vuex 模块（`store/modules/`）而非 Pinia store；服务实现用普通 JS class 而非 TypeScript interface，方法约定以 JSDoc 描述；事件总线用空 Vue 实例而非 mitt。整体不引入任何新依赖，与现有工程一致。

---

## 15. 落地清单

现状盘点（已存在的实现）：

- `store/modules/bomTree.js`、`store/modules/bomNodeState.js`：两个 Vuex 模块已就绪，并已在 `store/index.js` 注册。
- `services/bom/`：EBOM / SBOM 服务实现与服务工厂已就绪。
- `components/BomEditor/`：`LeftTree.vue`、`RightTree.vue`、`TransformBar.vue`、`ConflictPanel.vue`、`columns.js`、`treeUtils.js` 已就绪。
- `api/bom.js`：接口定义已就绪。

待补齐：

1. **选中通信迁移到 Vuex**：`LeftTree.vue`、`RightTree.vue` 的选中改为 `commit('bomTree/SET_SOURCE_SELECTED' / 'SET_TARGET_SELECTED')`；`TransformBar.vue` 改为从 Vuex 读取选中并用 `canTransform` getter。（见第 6.3 节）
2. **入口组件 `index.vue`**：尚未创建，需承载布局、`loadTreeData`、`executeWriteOperation`、动作分发、撤销、`beforeunload` 拦截等编排逻辑。
3. **事件总线瘦身**：`bomEventBus.js` 移除选中事件常量，仅保留 `TREE_RELOAD`、`CONFLICT_TOAST`。
```
