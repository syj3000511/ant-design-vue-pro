import {
  getSbomTree,
  sbomRevise,
  sbomAddChild,
  sbomDelete,
  sbomTransform,
  sbomUndo
} from '@/api/bom'

/**
 * SBOM 的 BOMService 实现（SBOM 团队维护）。
 * 核心差异：支持从 EBOM 设计件重构（transform）为服务件。
 */
export class SbomService {
  async loadBOMTree (rootPartId, viewType, changeContextId) {
    const res = await getSbomTree({ rootPartId, changeContextId })
    const data = res.result || res
    return {
      treeData: data.treeData || [],
      sourceTreeData: data.sourceTreeData || [],
      // 已发布最新版完整 BOM 树（供最左侧导航栏展示）；缺省回退为编辑区树以兼容旧报文
      publishedTreeData: data.publishedTreeData || data.treeData || [],
      rules: {
        viewType: 'SBOM',
        sourceViewType: 'EBOM',
        allowedPartTypes: ['E', 'F', 'G'],
        allowedActions: ['add', 'revise', 'delete', 'transform']
      }
    }
  }

  async revisePart (params) {
    const res = await sbomRevise(params)
    return res.result || res
  }

  async addChildPart (params) {
    const res = await sbomAddChild(params)
    return res.result || res
  }

  async deleteRelationship (params) {
    const res = await sbomDelete(params)
    return res.result || res
  }

  async transformStructure (params) {
    // SBOM 特有：自动映射设计件到服务件类型
    const res = await sbomTransform({ ...params, autoMapping: true })
    return res.result || res
  }

  async undoOperation (changeContextId, operationId) {
    const res = await sbomUndo({ changeContextId, operationId })
    return res.result || res
  }

  async getActionConfig (actionType, node) {
    const partType = node.attributes && node.attributes.partType
    if (actionType === 'add') {
      if (partType === 'E') {
        return { url: '/sbom/add-service-spare', openType: 'drawer', params: { parentId: 'id' } }
      }
      if (partType === 'F') {
        return { url: '/sbom/add-service-labor', openType: 'modal', params: { parentId: 'id' } }
      }
      return { url: '/sbom/add-general-service', openType: 'drawer', params: { parentId: 'id' } }
    }
    if (actionType === 'delete') {
      // 已发布的备件删除需要走审批流页面
      if (node.status === 'Released' && partType === 'E') {
        return { url: '/sbom/delete-released-spare', openType: 'page', params: { linkId: 'id' } }
      }
      return { url: '/sbom/delete-service-relation', openType: 'modal', params: { linkId: 'id' } }
    }
    if (actionType === 'transform') {
      return { url: '/sbom/transform-preview', openType: 'modal', params: { sourceNodeId: 'id' } }
    }
    return null
  }
}

export default SbomService
