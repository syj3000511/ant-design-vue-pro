import { mount, createLocalVue } from '@vue/test-utils'
import Vuex from 'vuex'
// 从子路径引入以避免 babel-plugin-import 改写裸 `ant-design-vue` 默认导入；
// lib 为 CommonJS 产物，导出含 install 的 Vue 插件，可整体注册组件（含 a-table / a-tree 等）。
import Antd from 'ant-design-vue/lib'
import cloneDeep from 'lodash.clonedeep'

import BomEditor from '@/components/BomEditor/index.vue'
import NavigationPanel from '@/components/BomEditor/NavigationPanel.vue'
import LeftTree from '@/components/BomEditor/LeftTree.vue'
import RightTree from '@/components/BomEditor/RightTree.vue'
import { getBOMService } from '@/services/bom/bomServiceFactory'
// 引入「真实」bomTree 模块（含 selectNavNode action / resolveLinkedTree 联动逻辑），
// 使集成测试以接近生产的方式驱动完整数据流。
import bomTree from '@/store/modules/bomTree'

/**
 * tests/unit/navLinkageIntegration.spec.js
 *
 * 任务 10.5「导航点击 → 双树联动」集成测试。
 *
 * 以扩充后的 Mock 数据挂载完整编辑器（BomEditor / index.vue），端到端验证：
 *   NavigationPanel 节点点击
 *     → dispatch('bomTree/selectNavNode', navNode)
 *     → bomTree.selectNavNode（用 resolveLinkedTree 比较两侧 viewType）
 *     → 命中侧写入 filteredSourceTreeData / filteredTargetTreeData
 *     → LeftTree（比较 sourceViewType）/ RightTree（比较 viewType）watch selectedNavNode
 *       → navLinkActive 激活、displayData 切换为过滤子树；
 *   类型不一致一侧保持当前展示内容不变（不激活联动、渲染行不变）。
 *
 * _Requirements: 3.2, 3.3, 3.4_
 *   - 3.2：原结构树表（sourceViewType）与导航节点 viewType 一致时，过滤展示其子树并选中。
 *   - 3.3：编辑区树表（viewType）与导航节点 viewType 一致时，过滤展示其子树并选中。
 *   - 3.4：viewType 不一致的一侧，保持其当前展示内容 / 选中态不变。
 *
 * 测试框架：@vue/test-utils + jest（jsdom）。通过 jest.mock 桩掉服务工厂，
 * 使 index.vue 的 created() → loadTreeData() 以受控的 Mock 上下文加载，
 * 不依赖真实 HTTP / mockjs2，从而保证集成流确定性。
 */

// 桩掉服务工厂：getBOMService 返回受控 service，loadBOMTree 解析为 Mock 上下文。
jest.mock('@/services/bom/bomServiceFactory', () => ({
  getBOMService: jest.fn()
}))

const localVue = createLocalVue()
localVue.use(Vuex)
localVue.use(Antd)

/* ------------------------------------------------------------------ *
 * 扩充后的 Mock 树数据（viewType 标注，原结构 EBOM / 编辑区 SBOM）。
 *
 * 两棵树均为多层结构、id 互不冲突，便于断言「点击某节点 → 该侧过滤为其子树」。
 *
 * 原结构（EBOM）:
 *   E-ROOT
 *    ├─ E-A
 *    │   ├─ E-A-1
 *    │   └─ E-A-2
 *    └─ E-B
 *        └─ E-B-1
 *
 * 编辑区（SBOM）:
 *   S-ROOT
 *    ├─ S-A
 *    │   ├─ S-A-1
 *    │   └─ S-A-2
 *    └─ S-B
 *        └─ S-B-1
 * ------------------------------------------------------------------ */
const leaf = (id, partNumber, name, parentPartNumber, viewType) => ({
  id,
  partNumber,
  name,
  parentPartNumber,
  quantity: 1,
  effectivity: 'MSN001-MSN050',
  viewType,
  rowState: 'Unchanged',
  children: []
})

const buildSourceTree = () => [
  {
    ...leaf('E-ROOT', 'E-A320', 'A320 原结构根', '', 'EBOM'),
    children: [
      {
        ...leaf('E-A', 'E-A320-A', '机翼组件', 'E-A320', 'EBOM'),
        children: [
          leaf('E-A-1', 'E-A320-A1', '前缘组件', 'E-A320-A', 'EBOM'),
          leaf('E-A-2', 'E-A320-A2', '后缘组件', 'E-A320-A', 'EBOM')
        ]
      },
      {
        ...leaf('E-B', 'E-A320-B', '机身段', 'E-A320', 'EBOM'),
        children: [leaf('E-B-1', 'E-A320-B1', '蒙皮壁板', 'E-A320-B', 'EBOM')]
      }
    ]
  }
]

const buildTargetTree = () => [
  {
    ...leaf('S-ROOT', 'S-A320', 'A320 编辑区根', '', 'SBOM'),
    children: [
      {
        ...leaf('S-A', 'S-A320-A', '服务机翼组件', 'S-A320', 'SBOM'),
        children: [
          leaf('S-A-1', 'S-A320-A1', '服务前缘组件', 'S-A320-A', 'SBOM'),
          leaf('S-A-2', 'S-A320-A2', '服务后缘组件', 'S-A320-A', 'SBOM')
        ]
      },
      {
        ...leaf('S-B', 'S-A320-B', '服务机身段', 'S-A320', 'SBOM'),
        children: [leaf('S-B-1', 'S-A320-B1', '服务蒙皮壁板', 'S-A320-B', 'SBOM')]
      }
    ]
  }
]

// loadBOMTree 解析出的上下文，结构与 SbomService.loadBOMTree 返回保持一致。
const makeContext = () => ({
  treeData: buildTargetTree(),
  sourceTreeData: buildSourceTree(),
  rules: {
    viewType: 'SBOM',
    sourceViewType: 'EBOM',
    allowedActions: ['add', 'revise', 'delete', 'transform']
  }
})

/* ------------------------------------------------------------------ *
 * 测试 store：真实 bomTree 模块 + 最小 bomNodeState（镜像 RightTree 依赖的 getter）。
 * bomTree.state 以函数返回深拷贝，保证每个 store 独立、干净。
 * ------------------------------------------------------------------ */
function makeStore () {
  return new Vuex.Store({
    modules: {
      bomTree: { ...bomTree, state: () => cloneDeep(bomTree.state) },
      bomNodeState: {
        namespaced: true,
        state: () => ({ nodeStates: {} }),
        getters: {
          getNodeState: (state) => (id) => state.nodeStates[id] || { status: 'idle' },
          isNodeLocked: (state) => (id) => {
            const s = state.nodeStates[id]
            return !!s && s.status === 'locked'
          },
          hasConflict: () => false
        }
      }
    }
  })
}

/* ------------------------------------------------------------------ *
 * 挂载辅助
 * ------------------------------------------------------------------ */

/** 解析微任务 + Vue 渲染队列（等待 loadTreeData 的异步链与组件 watcher 落定）。 */
async function flushAll (wrapper) {
  await wrapper.vm.$nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await wrapper.vm.$nextTick()
}

/**
 * 把某树表「实际绑定到 a-table 的数据」（displayData 计算属性）按先序展开为 id 列表。
 *
 * 选用 displayData 而非 DOM 行（tr[data-row-key]）作为断言依据，原因：
 *  - RightTree 含 fixed:'right' 的「操作」列且开启 scroll，ant-design-vue 1.7.8 会把行
 *    渲染进多张内部表（主表 + 固定列表），导致 DOM 中 data-row-key 重复、不稳定；
 *  - a-table 在数据变化时还会异步回调 expandedRowsChange，使受控 expandedRowKeys 抖动。
 * displayData 是组件真正交给表格渲染的数据源，确定性强，直接反映「该侧展示了哪棵（子）树」。
 */
function displayIds (treeVm) {
  const ids = []
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return
    nodes.forEach((n) => {
      ids.push(n.id)
      if (n.children && n.children.length) walk(n.children)
    })
  }
  walk(treeVm.displayData)
  return ids
}

/**
 * 挂载完整 BomEditor，并以受控 Mock 上下文完成首次加载。
 * @returns {{ wrapper, store }}
 */
async function mountEditor () {
  const service = {
    loadBOMTree: jest.fn().mockResolvedValue(makeContext()),
    undoOperation: jest.fn().mockResolvedValue({ success: false })
  }
  getBOMService.mockReturnValue(service)

  const store = makeStore()
  const wrapper = mount(BomEditor, {
    localVue,
    store,
    attachTo: document.body,
    propsData: { viewType: 'SBOM', rootPartId: 'ROOT-TEST', changeContextId: 'CHG-TEST' }
  })
  await flushAll(wrapper)
  return { wrapper, store }
}

/**
 * 模拟导航树节点点击：直接调用 NavigationPanel 的 handleSelect（a-tree 节点点击所走的方法），
 * 它会 dispatch('bomTree/selectNavNode', { id, viewType, subtree }) 并 emit('select')。
 * 随后等待两侧树表的 selectedNavNode watcher 落定。
 */
async function clickNavNode (wrapper, navPanel, id, viewType) {
  navPanel.vm.handleSelect(id, viewType)
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()
}

beforeAll(() => {
  // jsdom 未实现 scrollIntoView；联动定位会调用之，提供 no-op 桩避免噪声。
  if (typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {
    window.HTMLElement.prototype.scrollIntoView = jest.fn()
  }
})

afterEach(() => {
  jest.clearAllMocks()
})

/* ================================================================== *
 * 前置：Mock 数据已挂载到编辑器
 * ================================================================== */
describe('导航点击 → 双树联动集成（任务 10.5）', () => {
  it('编辑器以 Mock 数据挂载：两侧树表渲染完整树，导航栏可见', async () => {
    const { wrapper, store } = await mountEditor()
    try {
      // store 已通过 setContext 装载两侧树与规则
      expect(store.state.bomTree.sourceTreeData[0].id).toBe('E-ROOT')
      expect(store.state.bomTree.targetTreeData[0].id).toBe('S-ROOT')
      expect(store.state.bomTree.activeRules).toEqual({
        viewType: 'SBOM',
        sourceViewType: 'EBOM',
        allowedActions: ['add', 'revise', 'delete', 'transform']
      })

      const navPanel = wrapper.findComponent(NavigationPanel)
      const leftTree = wrapper.findComponent(LeftTree)
      const rightTree = wrapper.findComponent(RightTree)
      expect(navPanel.exists()).toBe(true)

      // 初始：未联动，两侧展示完整树
      expect(leftTree.vm.navLinkActive).toBe(false)
      expect(rightTree.vm.navLinkActive).toBe(false)
      expect(displayIds(leftTree.vm)).toEqual(['E-ROOT', 'E-A', 'E-A-1', 'E-A-2', 'E-B', 'E-B-1'])
      expect(displayIds(rightTree.vm)).toEqual(['S-ROOT', 'S-A', 'S-A-1', 'S-A-2', 'S-B', 'S-B-1'])
    } finally {
      wrapper.destroy()
    }
  })

  /* ---------------------------------------------------------------- *
   * 场景 1：点击 EBOM 节点（与原结构 sourceViewType 一致）
   * → 原结构树过滤为子树（R3.2）；编辑区树（SBOM）保持不变（R3.4）
   * ---------------------------------------------------------------- */
  it('点击 EBOM 节点：原结构树过滤展示子树并选中，编辑区树保持不变 (Validates: Requirements 3.2, 3.4)', async () => {
    const { wrapper, store } = await mountEditor()
    try {
      const navPanel = wrapper.findComponent(NavigationPanel)
      const leftTree = wrapper.findComponent(LeftTree)
      const rightTree = wrapper.findComponent(RightTree)

      // 记录点击前编辑区（不一致侧）展示数据，便于断言「保持不变」
      const rightBefore = displayIds(rightTree.vm)

      await clickNavNode(wrapper, navPanel, 'E-A', 'EBOM')

      // 导航选中节点写入共享状态
      expect(store.state.bomTree.selectedNavNode.id).toBe('E-A')
      expect(store.state.bomTree.selectedNavNode.viewType).toBe('EBOM')
      // NavigationPanel 同步 emit('select')
      expect(navPanel.emitted('select')).toBeTruthy()
      expect(navPanel.emitted('select')[0][0].id).toBe('E-A')

      // 原结构侧（sourceViewType=EBOM 一致）：过滤为以 E-A 为根的子树（R3.2）
      expect(store.state.bomTree.filteredSourceTreeData).toHaveLength(1)
      expect(store.state.bomTree.filteredSourceTreeData[0].id).toBe('E-A')
      expect(store.state.bomTree.filteredSourceTreeData[0].children.map((c) => c.id)).toEqual([
        'E-A-1',
        'E-A-2'
      ])
      expect(leftTree.vm.navLinkActive).toBe(true)
      expect(leftTree.vm.displayData[0].id).toBe('E-A')
      // 选中态收敛到被点击节点（R3.2）
      expect(leftTree.vm.selectedRowKey).toBe('E-A')
      // 实际绑定到表格的数据收敛为子树（E-A 自身 + 两个下级，R3.2 / R3.5）
      expect(displayIds(leftTree.vm)).toEqual(['E-A', 'E-A-1', 'E-A-2'])

      // 编辑区侧（viewType=SBOM ≠ EBOM）：保持当前展示 / 选中不变（R3.4）
      expect(store.state.bomTree.filteredTargetTreeData).toEqual([])
      expect(rightTree.vm.navLinkActive).toBe(false)
      expect(rightTree.vm.displayData[0].id).toBe('S-ROOT')
      expect(rightTree.vm.selectedRowKeys).toEqual([])
      expect(displayIds(rightTree.vm)).toEqual(rightBefore)
    } finally {
      wrapper.destroy()
    }
  })

  /* ---------------------------------------------------------------- *
   * 场景 2：点击 SBOM 节点（与编辑区 viewType 一致）
   * → 编辑区树过滤为子树（R3.3）；原结构树（EBOM）保持不变（R3.4）
   * ---------------------------------------------------------------- */
  it('点击 SBOM 节点：编辑区树过滤展示子树并选中，原结构树保持不变 (Validates: Requirements 3.3, 3.4)', async () => {
    const { wrapper, store } = await mountEditor()
    try {
      const navPanel = wrapper.findComponent(NavigationPanel)
      const leftTree = wrapper.findComponent(LeftTree)
      const rightTree = wrapper.findComponent(RightTree)

      // 记录点击前原结构（不一致侧）展示数据，便于断言「保持不变」
      const leftBefore = displayIds(leftTree.vm)

      await clickNavNode(wrapper, navPanel, 'S-A', 'SBOM')

      expect(store.state.bomTree.selectedNavNode.id).toBe('S-A')
      expect(store.state.bomTree.selectedNavNode.viewType).toBe('SBOM')

      // 编辑区侧（viewType=SBOM 一致）：过滤为以 S-A 为根的子树（R3.3）
      expect(store.state.bomTree.filteredTargetTreeData).toHaveLength(1)
      expect(store.state.bomTree.filteredTargetTreeData[0].id).toBe('S-A')
      expect(store.state.bomTree.filteredTargetTreeData[0].children.map((c) => c.id)).toEqual([
        'S-A-1',
        'S-A-2'
      ])
      expect(rightTree.vm.navLinkActive).toBe(true)
      expect(rightTree.vm.displayData[0].id).toBe('S-A')
      expect(rightTree.vm.selectedRowKeys).toEqual(['S-A'])
      expect(displayIds(rightTree.vm)).toEqual(['S-A', 'S-A-1', 'S-A-2'])

      // 原结构侧（sourceViewType=EBOM ≠ SBOM）：保持当前展示 / 选中不变（R3.4）
      expect(store.state.bomTree.filteredSourceTreeData).toEqual([])
      expect(leftTree.vm.navLinkActive).toBe(false)
      expect(leftTree.vm.displayData[0].id).toBe('E-ROOT')
      expect(leftTree.vm.selectedRowKey).toBeNull()
      expect(displayIds(leftTree.vm)).toEqual(leftBefore)
    } finally {
      wrapper.destroy()
    }
  })

  /* ---------------------------------------------------------------- *
   * 场景 3：点击叶子 EBOM 节点 → 原结构仅展示自身、不展开下级（R3.2 / 边界）
   * ---------------------------------------------------------------- */
  it('点击叶子 EBOM 节点：原结构仅展示该节点自身，编辑区仍保持不变 (Validates: Requirements 3.2, 3.4)', async () => {
    const { wrapper, store } = await mountEditor()
    try {
      const navPanel = wrapper.findComponent(NavigationPanel)
      const leftTree = wrapper.findComponent(LeftTree)
      const rightTree = wrapper.findComponent(RightTree)

      const rightBefore = displayIds(rightTree.vm)

      await clickNavNode(wrapper, navPanel, 'E-A-1', 'EBOM')

      expect(store.state.bomTree.filteredSourceTreeData[0].id).toBe('E-A-1')
      expect(leftTree.vm.navLinkActive).toBe(true)
      // 叶子：仅展示自身，无下级（R3.6）
      expect(displayIds(leftTree.vm)).toEqual(['E-A-1'])

      // 编辑区仍保持不变
      expect(rightTree.vm.navLinkActive).toBe(false)
      expect(displayIds(rightTree.vm)).toEqual(rightBefore)
    } finally {
      wrapper.destroy()
    }
  })
})
