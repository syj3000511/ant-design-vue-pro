import cloneDeep from 'lodash.clonedeep'

/**
 * BOM 树通用操作工具。
 *
 * 约定:每个节点形如
 *   { id, partId, partNumber, name, children?, structureVersion, rowState, ... }
 * 所有写操作返回「新的根数组」,保证 Vuex 中可被整体替换以触发响应式更新。
 */

/**
 * 深度优先查找节点。
 * @param {Array} nodes 根节点数组
 * @param {string} id 目标节点 id
 * @returns {object|null}
 */
export function findNodeById (nodes, id) {
  if (!Array.isArray(nodes)) return null
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children && node.children.length) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 查找节点的父节点(根节点返回 null)。
 */
export function findParentNode (nodes, id, parent = null) {
  if (!Array.isArray(nodes)) return null
  for (const node of nodes) {
    if (node.id === id) return parent
    if (node.children && node.children.length) {
      const found = findParentNode(node.children, id, node)
      if (found !== null) return found
    }
  }
  return null
}

/**
 * 不可变地在指定父节点下插入子节点,返回新的根数组。
 */
export function insertChild (nodes, parentId, child) {
  const next = cloneDeep(nodes)
  const parent = findNodeById(next, parentId)
  if (parent) {
    if (!Array.isArray(parent.children)) parent.children = []
    parent.children.push(child)
  }
  return next
}

/**
 * 不可变地更新某个节点的字段,返回新的根数组。
 * @param {Array} nodes
 * @param {string} id
 * @param {object} patch 要合并的字段
 */
export function updateNode (nodes, id, patch) {
  const next = cloneDeep(nodes)
  const target = findNodeById(next, id)
  if (target) {
    Object.assign(target, patch)
  }
  return next
}

/**
 * 用整个节点对象替换树中的同 id 节点(保留原 children,除非新节点带 children)。
 */
export function replaceNode (nodes, newNode) {
  const next = cloneDeep(nodes)
  const target = findNodeById(next, newNode.id)
  if (target) {
    const preservedChildren = newNode.children !== undefined ? newNode.children : target.children
    Object.keys(target).forEach(k => delete target[k])
    Object.assign(target, newNode, { children: preservedChildren })
  }
  return next
}

/**
 * 不可变地把节点标记为已删除状态(软删除,保留在树中以供比对展示)。
 */
export function markNodeDeleted (nodes, id) {
  return updateNode(nodes, id, { rowState: 'Deleted' })
}

/**
 * 不可变地物理移除节点,返回新的根数组。
 */
export function removeNode (nodes, id) {
  const next = cloneDeep(nodes)
  const remove = (arr) => {
    const idx = arr.findIndex(n => n.id === id)
    if (idx !== -1) {
      arr.splice(idx, 1)
      return true
    }
    return arr.some(n => n.children && remove(n.children))
  }
  remove(next)
  return next
}

/**
 * 收集所有「带子节点」的节点 id,用于树表默认全部展开。
 * @param {Array} nodes
 * @returns {string[]}
 */
export function collectExpandableKeys (nodes) {
  const keys = []
  const walk = (arr) => {
    if (!Array.isArray(arr)) return
    arr.forEach(n => {
      if (n.children && n.children.length) {
        keys.push(n.id)
        walk(n.children)
      }
    })
  }
  walk(nodes)
  return keys
}

/**
 * 生成一个本次会话内唯一的操作 id(operationId),用于乐观锁与撤销定位。
 * @returns {string}
 */
export function generateOperationId () {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/* ------------------------------------------------------------------ *
 * 导航 / 联动相关纯函数
 *
 * 以下函数用于导航树搜索与「点击导航节点联动两侧树表」场景,
 * 全部为不可变实现:不修改入参,需要返回新结构时基于 cloneDeep 复制。
 * ------------------------------------------------------------------ */

/**
 * 提取指定 id 节点的子树(该节点自身及其全部下级),返回深拷贝副本。
 * 不修改入参;找不到对应节点时返回 null。
 * @param {Array} nodes 根节点数组
 * @param {string} id 目标节点 id
 * @returns {object|null} 子树根节点的深拷贝,或 null
 */
export function extractSubtreeById (nodes, id) {
  const found = findNodeById(nodes, id)
  return found ? cloneDeep(found) : null
}

/**
 * 收集某节点的全部祖先 id(从根到直接父节点的顺序)。
 * 用于搜索 / 联动时展开匹配节点的各级祖先。
 * 不修改入参;节点不存在或为根节点时返回空数组。
 * @param {Array} nodes 根节点数组
 * @param {string} id 目标节点 id
 * @returns {string[]} 祖先节点 id 列表(根 → 直接父节点)
 */
export function collectAncestorIds (nodes, id) {
  const ancestors = []
  const dfs = (arr, trail) => {
    if (!Array.isArray(arr)) return false
    for (const node of arr) {
      if (node.id === id) {
        ancestors.push(...trail)
        return true
      }
      if (node.children && node.children.length) {
        if (dfs(node.children, [...trail, node.id])) return true
      }
    }
    return false
  }
  dfs(nodes, [])
  return ancestors
}

/**
 * 按关键字过滤树:对每个节点的 partNumber / name(去首尾空白后)做
 * 大小写不敏感的子串匹配;保留匹配节点的各级祖先并维持父子层级关系。
 * 关键字为空或仅由空白字符组成时返回完整树的深拷贝。
 * 不修改入参,返回新的根数组。
 * @param {Array} nodes 根节点数组
 * @param {string} keyword 搜索关键字
 * @returns {Array} 过滤后的新根数组
 */
export function filterTreeByKeyword (nodes, keyword) {
  if (!Array.isArray(nodes)) return []
  const trimmed = typeof keyword === 'string' ? keyword.trim() : ''
  if (!trimmed) return cloneDeep(nodes)
  const needle = trimmed.toLowerCase()
  const isMatch = (node) => {
    const partNumber = node.partNumber != null ? String(node.partNumber).trim().toLowerCase() : ''
    const name = node.name != null ? String(node.name).trim().toLowerCase() : ''
    return partNumber.includes(needle) || name.includes(needle)
  }
  const walk = (arr) => {
    const result = []
    arr.forEach(node => {
      const filteredChildren = node.children && node.children.length ? walk(node.children) : []
      if (isMatch(node) || filteredChildren.length) {
        const cloned = cloneDeep(node)
        if (node.children !== undefined) {
          cloned.children = filteredChildren
        }
        result.push(cloned)
      }
    })
    return result
  }
  return walk(nodes)
}

/**
 * 计算导航联动后某一侧树表应展示的子树。
 * 仅当该树表的 viewType 与导航节点的 viewType 一致时,返回以被点击节点为根的
 * 子树(包裹成可直接作为树数据的数组);类型不一致或节点在该树中不存在时,
 * 返回 null,表示「保持当前展示不变」。
 * 不修改入参。
 * @param {Array} nodes 该侧树表的根节点数组
 * @param {string} treeViewType 该侧树表的 BOM 视图类型(原结构为 sourceViewType,编辑区为 viewType)
 * @param {object} navNode 当前导航选中节点,形如 { id, viewType, ... }
 * @returns {Array|null} 过滤后的子树数组,或 null(保持不变)
 */
export function resolveLinkedTree (nodes, treeViewType, navNode) {
  if (!navNode || treeViewType !== navNode.viewType) return null
  const subtree = extractSubtreeById(nodes, navNode.id)
  if (!subtree) return null
  return [subtree]
}
