import Vue from 'vue'

/**
 * 节点操作状态机（替代命令式锁管理）。
 *
 * 对应设计文档第 5 节。每个编辑区节点维护一个状态：
 *   idle      空闲，可操作
 *   locked    正在执行写操作，禁用交互
 *   conflict  并发冲突，需要用户处理
 *   error     操作失败，显示错误信息
 *
 * 以 namespaced Vuex module 实现，键为 nodeId。
 * 用 Vue.set/Vue.delete 保证对象属性的响应式。
 */

const LOCK_TIMEOUT_MS = 15000

const bomNodeState = {
  namespaced: true,
  state: {
    // { [nodeId]: { status, operation?, message?, since? } }
    nodeStates: {},
    // { [nodeId]: timerId } 内部用，避免重复计时
    _timers: {}
  },
  getters: {
    getNodeState: (state) => (nodeId) => {
      return state.nodeStates[nodeId] || { status: 'idle' }
    },
    isNodeLocked: (state) => (nodeId) => {
      const s = state.nodeStates[nodeId]
      return !!s && s.status === 'locked'
    },
    hasConflict: (state) => {
      return Object.keys(state.nodeStates).some(
        (id) => state.nodeStates[id].status === 'conflict'
      )
    }
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
    setNodeState ({ commit }, { nodeId, value }) {
      commit('SET_NODE_STATE', { nodeId, value })
    },
    clearNodeState ({ commit }, nodeId) {
      commit('CLEAR_TIMER', nodeId)
      commit('CLEAR_NODE_STATE', nodeId)
    },
    /**
     * 加锁并启动超时保护。超时后若仍处于 locked，则自动转为 error。
     */
    lockNode ({ commit, state }, { nodeId, operation }) {
      commit('CLEAR_TIMER', nodeId)
      commit('SET_NODE_STATE', {
        nodeId,
        value: { status: 'locked', operation: operation || 'write', since: Date.now() }
      })
      const timerId = setTimeout(() => {
        const cur = state.nodeStates[nodeId]
        if (cur && cur.status === 'locked') {
          commit('SET_NODE_STATE', {
            nodeId,
            value: { status: 'error', message: '操作超时，请重试' }
          })
        }
        commit('CLEAR_TIMER', nodeId)
      }, LOCK_TIMEOUT_MS)
      commit('SET_TIMER', { nodeId, timerId })
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
      commit('SET_NODE_STATE', {
        nodeId,
        value: { status: 'error', message: message || '操作失败' }
      })
    }
  }
}

export default bomNodeState
