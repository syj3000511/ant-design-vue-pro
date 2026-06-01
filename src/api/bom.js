import request from '@/utils/request'

// BOM 编辑器与比对相关接口
// 响应拦截器已返回 response.data，因此 await request(...) 直接拿到解析后的报文体
const api = {
  ebomTree: '/ebom/tree',
  ebomRevise: '/ebom/revise',
  ebomAddChild: '/ebom/add-child',
  ebomDelete: '/ebom/delete',
  ebomTransform: '/ebom/transform',
  ebomUndo: '/ebom/undo',
  sbomTree: '/sbom/tree',
  sbomRevise: '/sbom/revise',
  sbomAddChild: '/sbom/add-child',
  sbomDelete: '/sbom/delete',
  sbomTransform: '/sbom/transform',
  sbomUndo: '/sbom/undo'
}

export default api

// ---------------- EBOM ----------------

// 加载 EBOM 树（含原结构 sourceTreeData 与编辑区 treeData）
export function getEbomTree (parameter) {
  return request({
    url: api.ebomTree,
    method: 'get',
    params: parameter
  })
}

// EBOM 升版
export function ebomRevise (parameter) {
  return request({
    url: api.ebomRevise,
    method: 'post',
    data: parameter
  })
}

// EBOM 新增下级
export function ebomAddChild (parameter) {
  return request({
    url: api.ebomAddChild,
    method: 'post',
    data: parameter
  })
}

// EBOM 删除关系
export function ebomDelete (parameter) {
  return request({
    url: api.ebomDelete,
    method: 'post',
    data: parameter
  })
}

// EBOM 结构重构（EBOM 不支持，保留占位）
export function ebomTransform (parameter) {
  return request({
    url: api.ebomTransform,
    method: 'post',
    data: parameter
  })
}

// EBOM 服务端单步撤销
export function ebomUndo (parameter) {
  return request({
    url: api.ebomUndo,
    method: 'post',
    data: parameter
  })
}

// ---------------- SBOM ----------------

// 加载 SBOM 树（含原结构 sourceTreeData 与编辑区 treeData）
export function getSbomTree (parameter) {
  return request({
    url: api.sbomTree,
    method: 'get',
    params: parameter
  })
}

// SBOM 升版
export function sbomRevise (parameter) {
  return request({
    url: api.sbomRevise,
    method: 'post',
    data: parameter
  })
}

// SBOM 新增下级
export function sbomAddChild (parameter) {
  return request({
    url: api.sbomAddChild,
    method: 'post',
    data: parameter
  })
}

// SBOM 删除关系
export function sbomDelete (parameter) {
  return request({
    url: api.sbomDelete,
    method: 'post',
    data: parameter
  })
}

// SBOM 结构重构（设计件 → 服务件转换）
export function sbomTransform (parameter) {
  return request({
    url: api.sbomTransform,
    method: 'post',
    data: parameter
  })
}

// SBOM 服务端单步撤销
export function sbomUndo (parameter) {
  return request({
    url: api.sbomUndo,
    method: 'post',
    data: parameter
  })
}
