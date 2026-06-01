import { Modal } from 'ant-design-vue'

/**
 * BOM 节点交互分发器。
 *
 * 职责：根据 service 返回的 ActionConfig，决定操作以何种形式（page/drawer/modal）打开，
 * 并从节点上解析出跳转/表单参数。编辑器组件无需感知各视图的差异化交互。
 *
 * @param {object} bomService 当前视图的 BOMService 实例
 * @param {object} router vue-router 实例（this.$router）
 */
export class BomActionDispatcher {
  constructor (bomService, router) {
    this.bomService = bomService
    this.router = router
  }

  /**
   * 分发一个动作。
   * @param {'add'|'delete'|'revise'|'transform'} actionType
   * @param {object} node 目标节点
   * @param {object} activeRules 当前视图规则
   * @param {Function} onConfirm (formData) => Promise<void> 用户确认后的回调
   */
  async dispatch (actionType, node, activeRules, onConfirm) {
    const config = await this.resolveConfig(actionType, node)
    if (!config) {
      // 无差异化配置：走简单二次确认
      Modal.confirm({
        title: `确认执行「${actionType}」操作？`,
        onOk: () => onConfirm({})
      })
      return
    }

    const params = this.resolveParams(config, node)

    switch (config.openType) {
      case 'page':
        this.router.push({ path: config.url, query: params })
        break
      case 'drawer':
        await this.openDrawer(config.url, params, onConfirm)
        break
      case 'modal':
      default:
        await this.openModal(config.url, params, onConfirm)
        break
    }
  }

  async resolveConfig (actionType, node) {
    if (this.bomService && typeof this.bomService.getActionConfig === 'function') {
      try {
        const dynamic = await this.bomService.getActionConfig(actionType, node)
        if (dynamic) return dynamic
      } catch (e) {
        // 动态配置失败时降级为 null（走默认确认）
        return null
      }
    }
    return null
  }

  /**
   * 把 config.params 中声明的「字段路径」解析为节点上的实际值。
   * 支持：直接字段名（如 'id'）、attributes.xxx、以及字面量回退。
   */
  resolveParams (config, node) {
    if (!config.params) return { nodeId: node.id }
    const result = {}
    Object.keys(config.params).forEach((key) => {
      const path = config.params[key]
      if (Object.prototype.hasOwnProperty.call(node, path)) {
        result[key] = node[path]
      } else if (path.indexOf('attributes.') === 0) {
        result[key] = node.attributes ? node.attributes[path.slice('attributes.'.length)] : undefined
      } else {
        result[key] = path
      }
    })
    return result
  }

  openModal (url, params, onConfirm) {
    return new Promise((resolve) => {
      Modal.confirm({
        title: '操作确认',
        content: `打开表单：${url}`,
        onOk: async () => {
          await onConfirm(params)
          resolve()
        },
        onCancel: () => resolve()
      })
    })
  }

  openDrawer (url, params, onConfirm) {
    // 抽屉形式需配合具体业务表单组件。此处与 modal 行为一致，留作扩展点。
    return this.openModal(url, params, onConfirm)
  }
}

export default BomActionDispatcher
