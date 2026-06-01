import {
  getEbomTree,
  ebomRevise,
  ebomAddChild,
  ebomDelete,
  ebomUndo
} from '@/api/bom'

/**
 * EBOM 的 BOMService 实现（EBOM 团队维护）。
 *
 * 注意：本项目响应拦截器已 `return response.data`，因此每个 api 调用
 * 拿到的就是后端报文体 { code, result, ... }，统一从 `result` 取业务数据。
 */
export class EbomService {
  async loadBOMTree (rootPartId, viewType, changeContextId) {
    const res = await getEbomTree({ rootPartId, changeContextId })
    const data = res.result || res
    return {
      treeData: data.treeData || [],
      sourceTreeData: data.sourceTreeData || [],
      // 已发布最新版完整 BOM 树（供最左侧导航栏展示）；缺省回退为原结构树以兼容旧报文
      publishedTreeData: data.publishedTreeData || data.sourceTreeData || [],
      rules: {
        viewType: 'EBOM',
        sourceViewType: 'EBOM',
        allowedPartTypes: ['A', 'B', 'C'],
        allowedActions: ['add', 'revise', 'delete', 'update']
      }
    }
  }

  async revisePart (params) {
    const res = await ebomRevise(params)
    return res.result || res
  }

  async addChildPart (params) {
    const res = await ebomAddChild(params)
    return res.result || res
  }

  async deleteRelationship (params) {
    const res = await ebomDelete(params)
    return res.result || res
  }

  async transformStructure () {
    // EBOM 原结构亦为 EBOM，重构属同视图复制，本视图不支持
    throw new Error('EBOM does not support transform operation')
  }

  async undoOperation (changeContextId, operationId) {
    const res = await ebomUndo({ changeContextId, operationId })
    return res.result || res
  }

  /**
   * EBOM 的新增按物料类型分流到不同表单页面。
   * @param {string} actionType
   * @param {import('./types').BOMTreeNode} node
   * @returns {Promise<import('./types').ActionConfig|null>}
   */
  async getActionConfig (actionType, node) {
    const partType = node.attributes && node.attributes.partType
    if (actionType === 'add') {
      if (partType === 'A') {
        return { url: '/ebom/core-part-apply', openType: 'page', params: { parentPartId: 'partId' } }
      }
      if (partType === 'B') {
        return { url: '/ebom/add-standard-part', openType: 'modal', params: { parentId: 'id' } }
      }
      return { url: '/ebom/add-general-part', openType: 'drawer', params: { parentId: 'id' } }
    }
    if (actionType === 'delete') {
      return { url: '/ebom/delete-relation', openType: 'modal', params: { linkId: 'id' } }
    }
    return null
  }
}

export default EbomService
