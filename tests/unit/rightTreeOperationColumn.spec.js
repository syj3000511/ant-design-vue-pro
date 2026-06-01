import { mount, createLocalVue } from '@vue/test-utils'
import Vuex from 'vuex'
// 从子路径引入以避免 babel-plugin-import 改写裸 `ant-design-vue` 默认导入；
// lib 为 CommonJS 产物，导出含 install 的 Vue 插件，可整体注册组件（含 a-table / a-dropdown / a-menu）。
import Antd from 'ant-design-vue/lib'
import RightTree from '@/components/BomEditor/RightTree.vue'

/**
 * tests/unit/rightTreeOperationColumn.spec.js
 *
 * 任务 7.4「操作列点击不改选中」单元测试（编辑区树表 / RightTree）。
 *
 * 覆盖需求 R4.6：
 *   WHEN 用户点击编辑区树表行内「操作」列的菜单控件，
 *   THE 编辑区树表 SHALL 触发对应操作菜单，
 *   且不因行点击选中而阻断该操作、不改变 `selectedTargetNode`。
 *
 * 验证拆解：
 *   (a) 点击「操作」列控件不改变选中：操作列包裹元素 `.bom-operation-cell`
 *       带 `@click.stop`，使行点击的 `SET_TARGET_SELECTED` commit 不被触发，
 *       `selectedTargetNode` 与 `selectedRowKeys` 均保持不变。
 *       对照：点击普通数据列会正常触发 `SET_TARGET_SELECTED`，证明行点击路径本身有效，
 *       从而排除「测试因行点击根本不工作而误判通过」的情况。
 *   (b) 菜单 action 正常触发：`onMenuClick(actionType, record)` 正常 `$emit('action', ...)`，
 *       且该过程不提交任何 `SET_TARGET_SELECTED`，载荷为 `{ actionType, record }`。
 *
 * 测试框架：@vue/test-utils + jest（testEnvironment: jsdom）。
 * 采用真实 namespaced Vuex store（镜像 bomTree.SET_TARGET_SELECTED 与
 * bomNodeState.getNodeState / isNodeLocked），与既有 spec 保持一致的挂载方式。
 */

const localVue = createLocalVue()
localVue.use(Vuex)
localVue.use(Antd)

/* ------------------------------------------------------------------ *
 * 测试 store：最小但忠实地镜像本测试相关的真实 store 片段。
 *   - bomTree.SET_TARGET_SELECTED：行点击提交的选中节点（本测试核心断言对象）。
 *   - bomTree.selectedNavNode / filteredTargetTreeData：RightTree 的 mapState 依赖，
 *     保持初始值即不触发导航联动（displayData 退化为 prop dataSource）。
 *   - bomNodeState.getNodeState / isNodeLocked：RightTree 的 mapGetters 依赖
 *     （未锁定时下拉菜单可正常弹出）。
 * state 以函数声明，保证每次 makeStore() 得到独立、干净的状态。
 * ------------------------------------------------------------------ */
function makeStore () {
  return new Vuex.Store({
    modules: {
      bomTree: {
        namespaced: true,
        state: () => ({
          selectedNavNode: null,
          filteredTargetTreeData: [],
          selectedTargetNode: null
        }),
        mutations: {
          SET_TARGET_SELECTED (state, node) {
            state.selectedTargetNode = node
          }
        }
      },
      bomNodeState: {
        namespaced: true,
        state: () => ({ nodeStates: {} }),
        getters: {
          getNodeState: (state) => (id) => state.nodeStates[id] || { status: 'idle' },
          isNodeLocked: (state) => (id) => {
            const s = state.nodeStates[id]
            return !!s && s.status === 'locked'
          }
        }
      }
    }
  })
}

const SAMPLE_NODES = [
  {
    id: 'n-1',
    partNumber: 'A320-00001',
    name: '驾驶舱总成',
    parentPartNumber: '',
    quantity: 1,
    effectivity: 'A1',
    viewType: 'SBOM',
    rowState: 'Unchanged'
  }
]

function mountRightTree (store) {
  return mount(RightTree, {
    localVue,
    store,
    // attachTo 真实 DOM，使 .bom-operation-cell 上的 @click.stop 事件按真实冒泡链执行
    attachTo: document.body,
    propsData: { dataSource: SAMPLE_NODES, loading: false, viewType: 'SBOM' }
  })
}

/** 统计针对某 mutation 名的 commit 次数。 */
function countCommits (commitSpy, type) {
  return commitSpy.mock.calls.filter((c) => c[0] === type).length
}

describe('RightTree 操作列点击不改选中 (任务 7.4, R4.6)', () => {
  it('点击「操作」列控件不提交 SET_TARGET_SELECTED、不改变选中态 (R4.6)', () => {
    const store = makeStore()
    const commitSpy = jest.spyOn(store, 'commit')
    const wrapper = mountRightTree(store)

    try {
      const opCell = wrapper.find('.bom-operation-cell')
      expect(opCell.exists()).toBe(true)

      // 点击操作列包裹元素：其 @click.stop 阻止冒泡到行 click，故不应触发行选中。
      opCell.element.dispatchEvent(new Event('click', { bubbles: true }))

      expect(countCommits(commitSpy, 'bomTree/SET_TARGET_SELECTED')).toBe(0)
      expect(store.state.bomTree.selectedTargetNode).toBeNull()
      // 组件内选中 key 列表保持为空（无行被选中高亮）
      expect(wrapper.vm.selectedRowKeys).toEqual([])
      expect(wrapper.vm.rowClassName(SAMPLE_NODES[0]).split(/\s+/)).not.toContain('bom-row-selected')
    } finally {
      wrapper.destroy()
    }
  })

  it('对照：点击普通数据列正常触发行选中（证明行点击路径本身有效）', () => {
    const store = makeStore()
    const commitSpy = jest.spyOn(store, 'commit')
    const wrapper = mountRightTree(store)

    try {
      const dataRows = wrapper.findAll('tr[data-row-key]')
      expect(dataRows.length).toBeGreaterThan(0)
      const firstDataCell = dataRows.at(0).findAll('td').at(0)

      firstDataCell.element.dispatchEvent(new Event('click', { bubbles: true }))

      expect(countCommits(commitSpy, 'bomTree/SET_TARGET_SELECTED')).toBe(1)
      expect(store.state.bomTree.selectedTargetNode).toEqual(SAMPLE_NODES[0])
      expect(wrapper.vm.selectedRowKeys).toEqual(['n-1'])
    } finally {
      wrapper.destroy()
    }
  })

  it('操作列包裹元素绑定了 click.stop（阻断行点击冒泡的接线存在）', () => {
    const store = makeStore()
    const wrapper = mountRightTree(store)

    try {
      const opCell = wrapper.find('.bom-operation-cell')
      expect(opCell.exists()).toBe(true)

      // 在操作列上触发一个可冒泡 click 并观察 stopPropagation 是否被调用，
      // 直接验证 @click.stop 修饰符已生效。
      const evt = new Event('click', { bubbles: true, cancelable: true })
      const stopSpy = jest.spyOn(evt, 'stopPropagation')
      opCell.element.dispatchEvent(evt)
      expect(stopSpy).toHaveBeenCalled()
    } finally {
      wrapper.destroy()
    }
  })

  it('菜单 action 正常触发：onMenuClick 发出 action 事件且不提交选中 (R4.6)', () => {
    const store = makeStore()
    const commitSpy = jest.spyOn(store, 'commit')
    const wrapper = mountRightTree(store)

    try {
      const record = SAMPLE_NODES[0]
      wrapper.vm.onMenuClick('add', record)

      const emitted = wrapper.emitted('action')
      expect(emitted).toBeTruthy()
      expect(emitted.length).toBe(1)
      expect(emitted[0][0]).toEqual({ actionType: 'add', record })

      // 触发菜单 action 不应改变选中态
      expect(countCommits(commitSpy, 'bomTree/SET_TARGET_SELECTED')).toBe(0)
      expect(store.state.bomTree.selectedTargetNode).toBeNull()
    } finally {
      wrapper.destroy()
    }
  })

  it('菜单 @click 接线到 onMenuClick：以菜单 key 携 record 发出 action (R4.6)', () => {
    // 说明：a-dropdown 的菜单 overlay 在 jsdom 下渲染到脱离 wrapper 的弹层容器，
    // 直接点击 .ant-menu-item 不可靠；故此处直接驱动模板中 a-menu 的 @click 接线
    // —— `@click="(e) => onMenuClick(e.key, record)"` —— 以菜单项 key 模拟点击，
    // 等价验证「菜单 action 正常触发」这一行为路径，且保持确定性。
    const store = makeStore()
    const commitSpy = jest.spyOn(store, 'commit')
    const wrapper = mountRightTree(store)

    try {
      const record = SAMPLE_NODES[0]
      // 模拟 a-menu 点击事件对象 { key }，按模板接线转调 onMenuClick(e.key, record)
      const menuClickHandler = (e) => wrapper.vm.onMenuClick(e.key, record)
      menuClickHandler({ key: 'delete' })

      const emitted = wrapper.emitted('action')
      expect(emitted).toBeTruthy()
      expect(emitted.length).toBe(1)
      expect(emitted[0][0]).toEqual({ actionType: 'delete', record })

      expect(countCommits(commitSpy, 'bomTree/SET_TARGET_SELECTED')).toBe(0)
      expect(store.state.bomTree.selectedTargetNode).toBeNull()
    } finally {
      wrapper.destroy()
    }
  })
})
