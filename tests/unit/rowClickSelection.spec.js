import { mount, createLocalVue } from '@vue/test-utils'
import Vuex from 'vuex'
// 从子路径引入以避免 babel-plugin-import 改写裸 `ant-design-vue` 默认导入；
// lib 为 CommonJS 产物，导出含 install 的 Vue 插件，可整体注册组件（含 a-table）。
import Antd from 'ant-design-vue/lib'
import fc from 'fast-check'
import LeftTree from '@/components/BomEditor/LeftTree.vue'
import RightTree from '@/components/BomEditor/RightTree.vue'

/**
 * tests/unit/rowClickSelection.spec.js
 *
 * 设计文档 Property 2「行点击响应一致性」属性测试（任务 6.3）。
 *
 * **Property 2: 行点击响应一致性**
 *   对任意节点，行点击同步提交「正确节点」为选中，且高亮收敛为单行
 *   （处理为同步、无 debounce）。
 *
 * **Validates: Requirements 4.2, 4.4**
 *   - 4.2：点击原结构树表某行 → 将该行节点提交为 Vuex `selectedSourceNode`，
 *          并对该行应用选中高亮样式（`bom-row-selected`）。
 *   - 4.4：单次行点击处理完成后，两表各自最多保留 1 行处于选中高亮状态
 *          （即最后一次点击的行）。
 *
 * 说明（与任务注记一致）：
 *   行点击选中为「同步、无 debounce」处理，因此本测试不去验证 <100ms 的字面计时，
 *   而是断言：
 *     (a) 调用行点击处理后「同步」就发生了对应的 Vuex commit（无定时器、无 await）；
 *     (b) commit 携带的节点恰为被点击节点本身（引用一致）；
 *     (c) 任意点击序列结束后，`rowClassName` 仅对最后一次点击的行返回选中高亮，
 *         其余行均不带选中高亮（高亮收敛为单行）。
 *
 * 测试框架：@vue/test-utils + jest + fast-check。
 * 通过真实 Vuex store（mirror 真实 bomTree / bomNodeState 模块的相关 mutation /
 * getter）驱动 namespaced 的 mapState / mapGetters，使组件以接近生产的方式运行。
 */

const localVue = createLocalVue()
localVue.use(Vuex)
localVue.use(Antd)

/* ------------------------------------------------------------------ *
 * 测试 store
 *
 * 以最小但忠实的 namespaced 模块镜像真实 store 中本测试相关的部分：
 *   - bomTree.SET_SOURCE_SELECTED / SET_TARGET_SELECTED：行点击提交的选中节点；
 *   - bomTree.selectedNavNode / filteredSourceTreeData：LeftTree 的 mapState 依赖
 *     （保持为初始值即不触发导航联动，displayData 退化为 prop dataSource）；
 *   - bomNodeState.getNodeState / isNodeLocked：RightTree 的 mapGetters 依赖。
 * state 以函数形式声明，保证每次 makeStore() 得到独立、干净的状态。
 * ------------------------------------------------------------------ */
function makeStore () {
  return new Vuex.Store({
    modules: {
      bomTree: {
        namespaced: true,
        state: () => ({
          selectedNavNode: null,
          filteredSourceTreeData: [],
          filteredTargetTreeData: [],
          selectedSourceNode: null,
          selectedTargetNode: null
        }),
        mutations: {
          SET_SOURCE_SELECTED (state, node) {
            state.selectedSourceNode = node
          },
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

/* ------------------------------------------------------------------ *
 * 生成器
 * ------------------------------------------------------------------ */

/**
 * 任意「扁平节点数组」生成器：每个节点带稳定唯一 id（按下标分配，
 * 避免随机内容碰撞），以及随机的业务字段。节点对象引用稳定，便于断言
 * 「提交的节点恰为被点击节点本身」。
 */
const nodesArb = fc
  .array(
    fc.record({
      partNumber: fc.string(),
      name: fc.string(),
      quantity: fc.integer({ min: 1, max: 999 }),
      effectivity: fc.string()
    }),
    { minLength: 1, maxLength: 6 }
  )
  .map((arr) =>
    arr.map((content, i) => ({
      id: `row-${i}`,
      parentPartNumber: i === 0 ? '' : `row-${i - 1}`,
      viewType: 'EBOM',
      ...content
    }))
  )

/**
 * 在任意节点数组之上，叠加一个「任意非空点击序列」（以下标方式引用节点，
 * 允许重复点击同一行，以覆盖 R4.7「再次点击已选行保持不变」）。
 */
const scenarioArb = nodesArb.chain((nodes) =>
  fc.record({
    nodes: fc.constant(nodes),
    clickIndexes: fc.array(fc.nat({ max: nodes.length - 1 }), {
      minLength: 1,
      maxLength: 10
    })
  })
)

/* ------------------------------------------------------------------ *
 * 断言辅助
 * ------------------------------------------------------------------ */

/**
 * 统计在给定节点集合上，`rowClassName` 判定为「选中高亮」的行数，
 * 并返回被高亮的行 id 列表。兼容 LeftTree（返回纯 'bom-row-selected' / ''）
 * 与 RightTree（可能叠加 rowState 等其他类）的实现。
 */
function collectHighlighted (vm, nodes) {
  const highlighted = []
  nodes.forEach((n) => {
    const cls = vm.rowClassName(n) || ''
    if (cls.split(/\s+/).indexOf('bom-row-selected') !== -1) {
      highlighted.push(n.id)
    }
  })
  return highlighted
}

/* ================================================================== *
 * Property 2（原结构树表 / LeftTree）
 * Validates: Requirements 4.2, 4.4
 * ================================================================== */
describe('Property 2: 行点击响应一致性 - 原结构树表 (LeftTree)', () => {
  it('任意点击序列：每次点击同步提交被点击节点为选中，且高亮收敛为单行 (Validates: Requirements 4.2, 4.4)', () => {
    fc.assert(
      fc.property(scenarioArb, ({ nodes, clickIndexes }) => {
        const store = makeStore()
        const commitSpy = jest.spyOn(store, 'commit')
        const wrapper = mount(LeftTree, {
          localVue,
          store,
          propsData: { dataSource: nodes, loading: false, sourceViewType: 'EBOM' }
        })

        try {
          let lastClicked = null

          clickIndexes.forEach((idx) => {
            const record = nodes[idx]
            const before = commitSpy.mock.calls.length

            // 调用 a-table customRow 实际绑定的 click 处理（与表格行点击同一路径）。
            // 该调用为同步执行，无 debounce / 无 setTimeout / 无 await。
            wrapper.vm.customRow(record).on.click()

            // (a) 同步提交：调用返回后立即（同一 tick 内）已发生且仅发生 1 次 commit
            const after = commitSpy.mock.calls.length
            expect(after).toBe(before + 1)

            // (b) 提交的是「正确节点」：mutation 名正确，载荷恰为被点击节点本身
            const lastCall = commitSpy.mock.calls[after - 1]
            expect(lastCall[0]).toBe('bomTree/SET_SOURCE_SELECTED')
            expect(lastCall[1]).toBe(record)

            lastClicked = record
          })

          // (c) 高亮收敛为单行：仅最后一次点击的行被判定为选中高亮
          const highlighted = collectHighlighted(wrapper.vm, nodes)
          expect(highlighted).toEqual([lastClicked.id])
          // LeftTree 选中行 className 恰为 'bom-row-selected'，未选中行为空串
          expect(wrapper.vm.rowClassName(lastClicked)).toBe('bom-row-selected')

          // store 中的共享选中态也收敛到最后一次点击的节点
          expect(store.state.bomTree.selectedSourceNode).toBe(lastClicked)
        } finally {
          wrapper.destroy()
        }
      }),
      { numRuns: 60 }
    )
  })
})

/* ================================================================== *
 * Property 2（编辑区树表 / RightTree）
 * Validates: Requirements 4.4（单行收敛同样适用于编辑区树表）
 * ================================================================== */
describe('Property 2: 行点击响应一致性 - 编辑区树表 (RightTree)', () => {
  it('任意点击序列：每次点击同步提交被点击节点为选中，且高亮收敛为单行 (Validates: Requirements 4.4)', () => {
    fc.assert(
      fc.property(scenarioArb, ({ nodes, clickIndexes }) => {
        const store = makeStore()
        const commitSpy = jest.spyOn(store, 'commit')
        const wrapper = mount(RightTree, {
          localVue,
          store,
          propsData: { dataSource: nodes, loading: false, viewType: 'SBOM' }
        })

        try {
          let lastClicked = null

          clickIndexes.forEach((idx) => {
            const record = nodes[idx]
            const before = commitSpy.mock.calls.length

            wrapper.vm.customRow(record).on.click()

            // (a) 同步提交
            const after = commitSpy.mock.calls.length
            expect(after).toBe(before + 1)

            // (b) 提交正确节点为 selectedTargetNode
            const lastCall = commitSpy.mock.calls[after - 1]
            expect(lastCall[0]).toBe('bomTree/SET_TARGET_SELECTED')
            expect(lastCall[1]).toBe(record)

            lastClicked = record
          })

          // (c) 高亮收敛为单行
          const highlighted = collectHighlighted(wrapper.vm, nodes)
          expect(highlighted).toEqual([lastClicked.id])

          expect(store.state.bomTree.selectedTargetNode).toBe(lastClicked)
        } finally {
          wrapper.destroy()
        }
      }),
      { numRuns: 60 }
    )
  })
})
