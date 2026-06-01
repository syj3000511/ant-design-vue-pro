/**
 * BOM SPI 契约（平台方定义）。
 *
 * 本项目为纯 JS，无 TypeScript。原设计文档中的 interface 在此以 JSDoc typedef
 * 表达，作为「文档级契约」：所有 BOMService 实现都应遵守同样的方法签名与返回结构。
 * 运行期不强制，约束来自约定 + 单元测试。
 */

/**
 * @typedef {'EBOM'|'PBOM'|'SBOM'} BomViewType
 */

/**
 * @typedef {'Added'|'Modified'|'Deleted'|'Unchanged'} RowState
 */

/**
 * @typedef {Object} BOMTreeNode
 * @property {string} id              节点唯一标识（occurrence/link 维度）
 * @property {string} partId          物料 id
 * @property {string} [occurrenceId]
 * @property {string} [traceId]       溯源标识（重构时建立的源-目标关系）
 * @property {string} partNumber      件号
 * @property {string} name            名称
 * @property {string} [parentPartNumber] 父件号
 * @property {string} version         版本
 * @property {number} quantity        单装数量
 * @property {string} [effectivity]   架次有效性
 * @property {BomViewType} bomType
 * @property {string} status          业务状态（如 Released / Working）
 * @property {string} updateTime      乐观锁基准时间
 * @property {string} [structureVersion] 父子集合版本（子项变更时校验）
 * @property {RowState} rowState      比对展示用的行状态
 * @property {BOMTreeNode[]} [children]
 * @property {Object.<string, *>} attributes 扩展属性（含 partType 等）
 */

/**
 * @typedef {Object} BOMViewRules
 * @property {BomViewType} viewType
 * @property {BomViewType} [sourceViewType]
 * @property {string[]} allowedPartTypes
 * @property {Array<'add'|'revise'|'delete'|'update'|'transform'>} allowedActions
 */

/**
 * @typedef {Object} BOMContext
 * @property {BOMTreeNode[]} treeData        右侧编辑区树
 * @property {BOMTreeNode[]} [sourceTreeData] 左侧原结构树
 * @property {BOMViewRules} rules
 */

/**
 * @typedef {Object} ActionConfig
 * @property {string} url
 * @property {'modal'|'drawer'|'page'} openType
 * @property {Object.<string,string>} [params]
 */

/**
 * BOMService 方法契约（仅文档）：
 *  loadBOMTree(rootPartId, viewType, changeContextId?) => Promise<BOMContext>
 *  revisePart(params)        => Promise<{ success, newNode, newUpdateTime }>
 *  addChildPart(params)      => Promise<{ success, newNode, newParentStructureVersion }>
 *  deleteRelationship(params)=> Promise<{ success, deletedLinkId, newParentStructureVersion }>
 *  transformStructure(params)=> Promise<{ success, newNode, newParentStructureVersion }>
 *  undoOperation(ctxId, opId)=> Promise<{ success, restoredNode? }>
 *  getActionConfig?(actionType, node) => Promise<ActionConfig|null>
 */

export const ROW_STATE = {
  ADDED: 'Added',
  MODIFIED: 'Modified',
  DELETED: 'Deleted',
  UNCHANGED: 'Unchanged'
}

export const ACTION_TYPES = ['add', 'revise', 'delete', 'update', 'transform']

/**
 * 生成前端侧的操作 id（用于撤销关联）。后端可忽略并以自身记录为准。
 * @returns {string}
 */
export function generateOperationId () {
  return 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}
