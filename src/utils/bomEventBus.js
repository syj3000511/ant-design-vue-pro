import Vue from 'vue'

/**
 * BOM 编辑器一次性通知事件总线。
 *
 * 仅用于「没有持久值、不需要追踪」的一次性通知。
 * 组件间的共享状态（选中节点、树数据、节点状态、冲突列表）一律走 Vuex，
 * 以便通过 Vue Devtools 完整追踪。选中事件已迁移到 Vuex（见 bomTree 模块），
 * 不再经过事件总线。
 *
 * Vue 2 中惯用做法是用一个空的 Vue 实例充当事件总线，提供 on / off / emit 能力。
 * 项目未引入 mitt，无需新增依赖。
 *
 * 保留事件：
 *  - 'tree:reload'         {}                  请求重新加载树
 *  - 'operation:conflict'  { nodeId, message } 写操作冲突的一次性提示
 */
export const BOM_EVENTS = {
  TREE_RELOAD: 'tree:reload',
  CONFLICT_TOAST: 'operation:conflict'
}

export const bomEventBus = new Vue()

export default bomEventBus
