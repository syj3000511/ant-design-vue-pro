import { mount, createLocalVue } from '@vue/test-utils'
import Vuex from 'vuex'
// 从子路径引入以避免 babel-plugin-import 改写裸 `ant-design-vue` 默认导入；
// lib 为 CommonJS 产物，导出含 install 的 Vue 插件，可整体注册组件（含 a-table）。
import Antd from 'ant-design-vue/lib'
import RightTree from '@/components/BomEditor/RightTree.vue'
import { commonColumns, targetColumns } from '@/components/BomEditor/columns'

/**
 * tests/unit/rightTreeEllipsis.spec.js
 *
 * 任务 7.2「数据列单行省略 + tooltip（编辑区树表 / RightTree）」单元测试。
 *
 * 覆盖需求：
 *   - R6.1：各数据列（不含「操作」列）单元格文本单行展示、不换行。
 *   - R6.2：超出列宽以省略号截断（white-space:nowrap + overflow:hidden +
 *           text-overflow:ellipsis 组合）。
 *   - R6.4：「操作」列不应用单行省略（其下拉菜单需正常展示）。
 *   - R6.5：单元格文本被截断时（scrollWidth > clientWidth）以原生 title 展示完整文本。
 *   - R6.6：单元格文本未被截断时不展示完整文本提示（移除 title）。
 *   - 共享列约束：不得污染被 LeftTree 共用的 `commonColumns` / `targetColumns`。
 *
 * 测试框架：@vue/test-utils + jest（testEnvironment: jsdom）。
 * 说明：jsdom 不进行真实布局，scrollWidth/clientWidth 默认均为 0，因此对
 *       `showTitleWhenTruncated` 的截断判断通过构造带 scrollWidth/clientWidth 的
 *       元素显式驱动。
 */

const localVue = createLocalVue()
localVue.use(Vuex)
localVue.use(Antd)

function makeStore () {
  return new Vuex.Store({
    modules: {
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
      },
      bomTree: {
        namespaced: true,
        state: () => ({ selectedTargetNode: null }),
        mutations: {
          SET_TARGET_SELECTED (state, node) {
            state.selectedTargetNode = node
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
    name: '驾驶舱总成（用于验证单行省略的较长名称字段文本内容）',
    parentPartNumber: '',
    quantity: 1,
    effectivity: 'A1',
    viewType: 'SBOM',
    rowState: 'Unchanged'
  }
]

function mountRightTree () {
  return mount(RightTree, {
    localVue,
    store: makeStore(),
    propsData: { dataSource: SAMPLE_NODES, loading: false, viewType: 'SBOM' }
  })
}

/**
 * 构造一个带可控 scrollWidth / clientWidth 的伪 <td>，以驱动截断判断。
 */
function fakeCell (scrollWidth, clientWidth) {
  const attrs = {}
  return {
    scrollWidth,
    clientWidth,
    setAttribute (k, v) {
      attrs[k] = v
    },
    removeAttribute (k) {
      delete attrs[k]
    },
    getAttribute (k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null
    }
  }
}

describe('RightTree 数据列单行省略 (任务 7.2)', () => {
  it('数据列均配置 customCell，应用单行省略样式 (R6.1/R6.2)', () => {
    const wrapper = mountRightTree()
    try {
      const cols = wrapper.vm.columns
      const dataCols = cols.filter((c) => c.key !== 'operation')
      expect(dataCols.length).toBeGreaterThan(0)

      dataCols.forEach((col) => {
        expect(typeof col.customCell).toBe('function')
        const cellProps = col.customCell(SAMPLE_NODES[0])
        expect(cellProps.style.whiteSpace).toBe('nowrap')
        expect(cellProps.style.overflow).toBe('hidden')
        expect(cellProps.style.textOverflow).toBe('ellipsis')
        expect(typeof cellProps.on.mouseenter).toBe('function')
      })
    } finally {
      wrapper.destroy()
    }
  })

  it('「操作」列不应用单行省略 / customCell (R6.4)', () => {
    const wrapper = mountRightTree()
    try {
      const opCol = wrapper.vm.columns.find((c) => c.key === 'operation')
      expect(opCol).toBeTruthy()
      expect(opCol.customCell).toBeUndefined()
    } finally {
      wrapper.destroy()
    }
  })

  it('文本被截断时设置原生 title 为完整文本 (R6.5)', () => {
    const wrapper = mountRightTree()
    try {
      const cell = fakeCell(300, 160) // scrollWidth > clientWidth => 截断
      wrapper.vm.showTitleWhenTruncated({ currentTarget: cell }, SAMPLE_NODES[0].name)
      expect(cell.getAttribute('title')).toBe(SAMPLE_NODES[0].name)
    } finally {
      wrapper.destroy()
    }
  })

  it('文本未被截断时不设置 title (R6.6)', () => {
    const wrapper = mountRightTree()
    try {
      const cell = fakeCell(120, 160) // scrollWidth <= clientWidth => 未截断
      // 预置一个残留 title，验证未截断时会被清除
      cell.setAttribute('title', '残留')
      wrapper.vm.showTitleWhenTruncated({ currentTarget: cell }, 'A1')
      expect(cell.getAttribute('title')).toBeNull()
    } finally {
      wrapper.destroy()
    }
  })

  it('mouseenter 通过 customCell 透传完整文本并按截断与否设置 title (R6.5/R6.6)', () => {
    const wrapper = mountRightTree()
    try {
      const nameCol = wrapper.vm.columns.find((c) => c.dataIndex === 'name')
      const handler = nameCol.customCell(SAMPLE_NODES[0]).on.mouseenter

      const truncated = fakeCell(300, 160)
      handler({ currentTarget: truncated })
      expect(truncated.getAttribute('title')).toBe(SAMPLE_NODES[0].name)

      const fits = fakeCell(100, 160)
      handler({ currentTarget: fits })
      expect(fits.getAttribute('title')).toBeNull()
    } finally {
      wrapper.destroy()
    }
  })

  it('不污染共享的 commonColumns / targetColumns（避免影响 LeftTree）', () => {
    const wrapper = mountRightTree()
    try {
      // 共享列定义不应被追加 customCell
      commonColumns.forEach((col) => {
        expect(col.customCell).toBeUndefined()
      })
      targetColumns.forEach((col) => {
        expect(col.customCell).toBeUndefined()
      })
      // 组件 columns 是新对象，与共享数组元素不是同一引用
      const partNumberShared = commonColumns.find((c) => c.dataIndex === 'partNumber')
      const partNumberLocal = wrapper.vm.columns.find((c) => c.dataIndex === 'partNumber')
      expect(partNumberLocal).not.toBe(partNumberShared)
    } finally {
      wrapper.destroy()
    }
  })
})
