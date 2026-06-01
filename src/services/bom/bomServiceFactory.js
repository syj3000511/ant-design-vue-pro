import EbomService from './ebomService'
import SbomService from './sbomService'

/**
 * 服务工厂（装配层，编辑器核心维护）。
 *
 * 编辑器只依赖 BOMService 契约，不依赖任何具体实现。
 * 新增 BOM 类型时，只需实现一个 service 并在此注册一行，编辑器代码一行不改。
 */
const serviceRegistry = {
  EBOM: () => new EbomService(),
  SBOM: () => new SbomService()
  // 新增 PBOM 时，仅需： PBOM: () => new PbomService()
}

const instanceCache = {}

/**
 * 获取指定视图的 BOMService 实例（带缓存，避免每次操作都 new）。
 * @param {string} viewType
 * @returns {object} BOMService 实例
 */
export function getBOMService (viewType) {
  if (instanceCache[viewType]) return instanceCache[viewType]
  const factory = serviceRegistry[viewType]
  if (!factory) {
    throw new Error(`No BOMService implementation registered for view type: ${viewType}`)
  }
  const instance = factory()
  instanceCache[viewType] = instance
  return instance
}

/**
 * 动态注册实现（用于插件化扩展）。
 * @param {string} viewType
 * @param {Function} factory 返回 BOMService 实例的工厂函数
 */
export function registerBOMService (viewType, factory) {
  serviceRegistry[viewType] = factory
  delete instanceCache[viewType]
}

/**
 * 判断某视图类型是否已注册。
 * @param {string} viewType
 * @returns {boolean}
 */
export function hasBOMService (viewType) {
  return !!serviceRegistry[viewType]
}
