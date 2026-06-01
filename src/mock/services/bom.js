import Mock from 'mockjs2'
import { builder, getBody } from '../util'
import { findNodeById } from '@/components/BomEditor/treeUtils'

/**
 * BOM 编辑器与比对 Mock 服务。
 * 提供 EBOM / SBOM 的树加载、升版、新增、删除、重构、撤销接口的模拟实现，
 * 返回结构与 services/bom 中各 service 期望的 { result: { ... } } 保持一致。
 */

let seq = 1000
const nextId = (prefix) => `${prefix}-${++seq}`
const now = () => new Date().toISOString()

// 每个视图类型对应的零件类型集合（与 services/bom 中 allowedPartTypes 对齐）
const PART_TYPE_MAP = {
  EBOM: ['A', 'B', 'C'],
  SBOM: ['E', 'F', 'G'],
  PBOM: ['H', 'I', 'J']
}

// 演示用零件名称词库（按层级区分，贴近航空 BOM 语义）
const NAME_POOL = {
  1: ['机身段', '机翼组件', '尾翼组件', '起落架系统', '动力装置', '航电系统'],
  2: ['前缘组件', '后缘组件', '主梁结构', '蒙皮壁板', '肋板组件', '接头组件'],
  3: ['连接件', '紧固件组', '密封件', '支架组件', '作动器', '传感器', '线束', '导管']
}

// 用于触发需求 6「单行省略」与需求 8「换行完整展示」的超长名称（长度 ≥ 40 字符）
const LONG_NAME = '左侧机翼前缘缝翼作动器组件总成含液压作动筒电气线束与位置反馈传感器的超长零件名称用于验证单行省略显示效果'

/**
 * 构造一棵层级深度 ≥ 4、节点总数 ≥ 100 的 BOM 树。
 * 每层子节点数为 [5, 4, 4]，即 1 + 5 + 20 + 80 = 106 个节点、共 4 层。
 * 每个节点均包含 partNumber / name / parentPartNumber / quantity / effectivity 五个非空字段
 * （根节点的 parentPartNumber 为空），并携带 viewType 以支持导航联动的类型比较。
 *
 * @param {object} opt
 * @param {string} opt.idPrefix       节点 id / partId 前缀（保证同一响应内 id 唯一）
 * @param {string} opt.viewType       该树的 BOM 视图类型（EBOM / SBOM / PBOM）
 * @param {string} opt.rootPartNumber 根节点件号
 * @param {string} opt.rootName       根节点名称
 * @param {boolean} opt.editable      是否为编辑区树（决定 rowState 是否多样、是否注入超长名称）
 * @returns {Array} 单根树数组
 */
const buildBomTree = ({ idPrefix, viewType, rootPartNumber, rootName, editable }) => {
  const ts = now()
  const partTypes = PART_TYPE_MAP[viewType] || PART_TYPE_MAP.EBOM
  const childrenPerLevel = [5, 4, 3, 2]
  let counter = 0
  let longNameInjected = false

  const buildSubtree = (level, parentPartNumber) => {
    counter += 1
    const seqNo = counter
    const isRoot = level === 0
    const partNumber = isRoot
      ? rootPartNumber
      : `${rootPartNumber}-${String(seqNo).padStart(3, '0')}`

    // 名称：根用 rootName；其余从对应层级词库取并附序号，保证唯一且非空
    let name
    if (isRoot) {
      name = rootName
    } else {
      const pool = NAME_POOL[level] || NAME_POOL[3]
      name = `${pool[seqNo % pool.length]}-${String(seqNo).padStart(3, '0')}`
    }
    // 编辑区树注入一个超长名称节点（≥ 40 字符），用于省略 / 换行验证
    if (editable && !longNameInjected && level === 2) {
      name = LONG_NAME
      longNameInjected = true
    }

    // 初始统一为「已发布、未变更」：编辑区与原结构树均无比对颜色。
    // 颜色仅由用户后续的新增 / 修改 / 删除 / 重构等写操作动态产生（见各写操作 mock）。
    const node = {
      id: `${idPrefix}-${seqNo}`,
      partId: `${idPrefix}-P-${seqNo}`,
      partNumber,
      name,
      parentPartNumber: isRoot ? '' : parentPartNumber,
      quantity: isRoot ? 1 : (seqNo % 6) + 1,
      effectivity: 'MSN001-MSN050',
      viewType,
      bomType: viewType,
      status: 'Released',
      version: 'A.1',
      updateTime: ts,
      structureVersion: `${idPrefix}-sv-${seqNo}`,
      rowState: 'Unchanged',
      attributes: { partType: partTypes[seqNo % partTypes.length] },
      children: []
    }

    const childCount = childrenPerLevel[level] || 0
    for (let i = 0; i < childCount; i++) {
      node.children.push(buildSubtree(level + 1, partNumber))
    }
    return node
  }

  return [buildSubtree(0, '')]
}

// 构造一棵演示用的编辑区树（右侧，可编辑）：深度 ≥ 4、节点 ≥ 100，含四种 rowState 与超长名称
const buildTargetTree = (viewType) => buildBomTree({
  idPrefix: viewType === 'SBOM' ? 'TS' : 'TE',
  viewType,
  rootPartNumber: viewType === 'SBOM' ? 'S-A320-ASSY' : 'E-A320-ASSY',
  rootName: 'A320 总装结构（编辑区）',
  editable: true
})

// 构造左侧原结构树（已发布、只读）：视图类型为 EBOM，全部节点 rowState 为 Unchanged
const buildSourceTree = (sourceViewType) => buildBomTree({
  idPrefix: 'SRC',
  viewType: sourceViewType,
  rootPartNumber: 'E-A320-ASSY',
  rootName: 'A320 总装结构（原结构）',
  editable: false
})

/**
 * 构造一颗「已发布最新版完整 BOM 树」，供最左侧导航栏（NavigationPanel）展示。
 *
 * 与「原结构（局部）」的关键区别：
 *  - 原结构树（sourceTreeData）/ 编辑区树（treeData）是【当前变更上下文下的局部工作集】，
 *    仅包含与本次变更相关的那一部分结构；
 *  - 导航树需要展示该视图（EBOM 或 SBOM）【已发布的完整结构】，便于在整棵长树中
 *    查询、筛选与联动定位。
 *
 * 实现要点：
 *  1. 先复用 buildBomTree 生成与编辑区树【完全相同 id】的核心结构（同前缀、同形状 →
 *     DFS 计数顺序一致 → id 一一对应），从而点击导航节点时可按 id 联动定位到编辑区树
 *     （见 R3 联动按 id 匹配）。
 *  2. 再在根节点下嫁接若干「仅存在于已发布完整结构、不在局部工作集」的额外分支，
 *     使导航树明显比局部原结构更完整，直观体现「完整 vs 局部」。
 *
 * @param {string} viewType EBOM / SBOM
 * @returns {Array} 单根完整树数组
 */
const buildPublishedTree = (viewType) => {
  const idPrefix = viewType === 'SBOM' ? 'TS' : 'TE'
  const partTypes = PART_TYPE_MAP[viewType] || PART_TYPE_MAP.EBOM
  const ts = now()
  // 核心结构：与 buildTargetTree 同前缀、同形状 → 生成完全一致的 id，保证导航联动可定位
  const tree = buildBomTree({
    idPrefix,
    viewType,
    rootPartNumber: viewType === 'SBOM' ? 'S-A320-ASSY' : 'E-A320-ASSY',
    rootName: `A320 总装结构（${viewType} 已发布完整结构）`,
    editable: false
  })
  const root = tree[0]

  // 额外「已发布专有」分支：仅在完整结构中存在、不在局部工作集中（id 独立命名空间，避免与核心冲突）
  let pubSeq = 0
  const buildPublishedOnly = (level, parentPartNumber, childrenPerLevel) => {
    pubSeq += 1
    const seqNo = pubSeq
    const partNumber = `${root.partNumber}-PUB-${String(seqNo).padStart(3, '0')}`
    const pool = NAME_POOL[level] || NAME_POOL[3]
    const node = {
      id: `PUB-${viewType}-${seqNo}`,
      partId: `PUB-${viewType}-P-${seqNo}`,
      partNumber,
      name: `[已发布] ${pool[seqNo % pool.length]}-${String(seqNo).padStart(3, '0')}`,
      parentPartNumber,
      quantity: (seqNo % 5) + 1,
      effectivity: 'MSN001-MSN080',
      viewType,
      bomType: viewType,
      status: 'Released',
      version: 'A.1',
      updateTime: ts,
      structureVersion: `PUB-${viewType}-sv-${seqNo}`,
      rowState: 'Unchanged',
      attributes: { partType: partTypes[seqNo % partTypes.length] },
      children: []
    }
    const childCount = childrenPerLevel[level] || 0
    for (let i = 0; i < childCount; i++) {
      node.children.push(buildPublishedOnly(level + 1, partNumber, childrenPerLevel))
    }
    return node
  }

  // 在根下嫁接 3 个已发布专有顶级分支（每个再带 [3,2,2] 子层），明显扩充完整度
  for (let i = 0; i < 3; i++) {
    root.children.push(buildPublishedOnly(1, root.partNumber, [0, 3, 2, 2]))
  }
  return tree
}
/**
 * makeNewNode：构造一个「新增」节点（rowState=Added）。
 * 用于新增下级 / 重构等会真正产生新节点的写操作。
 * @param {string} viewType
 * @param {string} partNumber
 * @param {string} parentPartNumber
 * @param {string} [name]
 */
const makeNewNode = (viewType, partNumber, parentPartNumber, name) => ({
  id: nextId('N'),
  partId: nextId('P'),
  partNumber: partNumber || nextId('NEW'),
  name: name || '新增节点',
  parentPartNumber: parentPartNumber || '',
  quantity: 1,
  effectivity: 'MSN001-MSN050',
  viewType,
  bomType: viewType,
  status: 'InWork',
  version: 'A.1',
  updateTime: now(),
  structureVersion: nextId('sv'),
  rowState: 'Added',
  attributes: { partType: 'C' },
  children: []
})

// ---------------- EBOM ----------------
// 初始仅返回树数据：编辑区保持已发布状态（无颜色、无变更历史），
// 颜色与历史均由用户后续的新增 / 升版 / 修改 / 删除 / 重构操作动态产生。
Mock.mock(/\/ebom\/tree/, 'get', () => builder({
  treeData: buildTargetTree('EBOM'),
  sourceTreeData: buildSourceTree('EBOM'),
  // 已发布最新版完整 BOM 树，供最左侧导航栏展示与筛选
  publishedTreeData: buildPublishedTree('EBOM')
}))

Mock.mock(/\/ebom\/add-child/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({
    success: true,
    newNode: makeNewNode('EBOM', body.partNumber, ''),
    newParentStructureVersion: nextId('sv'),
    operationId: body.operationId
  })
})

Mock.mock(/\/ebom\/revise/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({
    success: true,
    newNode: { ...makeNewNode('EBOM', 'REVISED', ''), id: body.nodeId, rowState: 'Modified', version: 'A.2' },
    newUpdateTime: now(),
    operationId: body.operationId
  })
})

Mock.mock(/\/ebom\/delete/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({ success: true, deletedLinkId: body.linkId, newParentStructureVersion: nextId('sv'), operationId: body.operationId })
})

Mock.mock(/\/ebom\/undo/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({
    success: true,
    restoredNode: {
      ...makeNewNode('EBOM', 'RESTORED', ''),
      id: body.nodeId || nextId('N'),
      name: '撤销恢复节点',
      status: 'Released',
      version: 'A.1',
      rowState: 'Unchanged'
    },
    operationId: body.operationId
  })
})

// ---------------- SBOM ----------------
// 初始仅返回树数据：编辑区保持已发布状态（无颜色、无变更历史）。
Mock.mock(/\/sbom\/tree/, 'get', () => builder({
  treeData: buildTargetTree('SBOM'),
  sourceTreeData: buildSourceTree('EBOM'),
  // 已发布最新版完整 SBOM 树，供最左侧导航栏展示与筛选
  publishedTreeData: buildPublishedTree('SBOM')
}))

Mock.mock(/\/sbom\/add-child/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({
    success: true,
    newNode: makeNewNode('SBOM', body.partNumber, ''),
    newParentStructureVersion: nextId('sv'),
    operationId: body.operationId
  })
})

Mock.mock(/\/sbom\/revise/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({
    success: true,
    newNode: { ...makeNewNode('SBOM', 'REVISED', ''), id: body.nodeId, rowState: 'Modified', version: 'A.2' },
    newUpdateTime: now(),
    operationId: body.operationId
  })
})

Mock.mock(/\/sbom\/delete/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({ success: true, deletedLinkId: body.linkId, newParentStructureVersion: nextId('sv'), operationId: body.operationId })
})

const convertSubtreeToTarget = (node, parentPartNumber, targetViewType) => {
  const ts = now()
  const partTypes = PART_TYPE_MAP[targetViewType] || PART_TYPE_MAP.EBOM
  const seqNo = ++seq
  
  const targetNode = {
    id: `N-${seqNo}`,
    partId: `P-${seqNo}`,
    partNumber: node.partNumber,
    name: node.name,
    parentPartNumber: parentPartNumber || '',
    quantity: node.quantity || 1,
    effectivity: node.effectivity || 'MSN001-MSN050',
    viewType: targetViewType,
    bomType: targetViewType,
    status: 'InWork',
    version: 'A.1',
    updateTime: ts,
    structureVersion: `sv-${seqNo}`,
    rowState: 'Added',
    attributes: { partType: partTypes[seqNo % partTypes.length] },
    children: []
  }
  
  if (Array.isArray(node.children)) {
    targetNode.children = node.children.map(child => 
      convertSubtreeToTarget(child, node.partNumber, targetViewType)
    )
  }
  
  return targetNode
}

Mock.mock(/\/sbom\/transform/, 'post', (options) => {
  const body = getBody(options) || {}
  
  // 1. 获取原结构树并查找到源节点
  const srcTree = buildSourceTree('EBOM')
  const sourceNode = findNodeById(srcTree, body.sourceNodeId)
  
  // 2. 递归克隆并转换整个子树
  let newNode
  if (sourceNode) {
    newNode = convertSubtreeToTarget(sourceNode, body.targetParentPartNumber, 'SBOM')
  } else {
    // 降级防崩
    newNode = {
      ...makeNewNode('SBOM', body.sourcePartNumber, body.targetParentPartNumber),
      name: body.sourceName || '重构节点',
      rowState: 'Added'
    }
  }

  return builder({
    success: true,
    newNode,
    newParentStructureVersion: nextId('sv'),
    operationId: body.operationId
  })
})

Mock.mock(/\/sbom\/undo/, 'post', (options) => {
  const body = getBody(options) || {}
  return builder({
    success: true,
    restoredNode: {
      ...makeNewNode('SBOM', 'RESTORED', ''),
      id: body.nodeId || nextId('N'),
      name: '撤销恢复节点',
      status: 'Released',
      version: 'A.1',
      rowState: 'Unchanged'
    },
    operationId: body.operationId
  })
})
