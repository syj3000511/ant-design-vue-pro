import { mount, createLocalVue } from '@vue/test-utils'
// 从子路径引入以避免 babel-plugin-import 改写裸 `ant-design-vue` 默认导入；
// lib 为 CommonJS 产物，导出含 install 的 Vue 插件，可整体注册组件。
import Antd from 'ant-design-vue/lib'
import NavigationPanel from '@/components/BomEditor/NavigationPanel.vue'

/**
 * tests/unit/NavigationPanel.spec.js
 *
 * 导航栏（NavigationPanel）搜索 / 高亮 / 空状态组件单元测试。
 *
 * 覆盖（任务 5.2）：
 *  - debounce 过滤：输入关键字仅在停止输入达 300ms 后才应用过滤（Requirements 2.1）
 *  - 匹配高亮：匹配片段被 <mark class="bom-nav-highlight"> 包裹（Requirements 2.2）
 *  - 清空恢复：清空 / 纯空白关键字恢复完整树并清除高亮（Requirements 2.3, 2.6）
 *  - 无匹配空状态：展示「无匹配结果」并保留已输入关键字（Requirements 2.4）
 *  - 无数据空状态：展示「暂无数据」（Requirements 2.6 / R1.5）
 *
 * 测试框架：@vue/test-utils + jest（fake timers 验证 300ms debounce）。
 */

const localVue = createLocalVue()
localVue.use(Antd)

/* ------------------------------------------------------------------ *
 * 测试辅助
 * ------------------------------------------------------------------ */

/**
 * 构造一棵稳定的原结构样例树（携带 viewType: EBOM）：
 *
 * e-root (A320-000 / 飞机主结构)
 *  ├─ e-1   (A320-100 / 驾驶舱)
 *  │   └─ e-1-1 (A320-110 / 仪表盘)
 *  └─ e-2   (A320-200 / 机翼)
 *      └─ e-2-1 (A320-210 / 副翼)
 */
const buildSourceTree = () => [
  {
    id: 'e-root',
    partNumber: 'A320-000',
    name: '飞机主结构',
    viewType: 'EBOM',
    children: [
      {
        id: 'e-1',
        partNumber: 'A320-100',
        name: '驾驶舱',
        viewType: 'EBOM',
        children: [
          { id: 'e-1-1', partNumber: 'A320-110', name: '仪表盘', viewType: 'EBOM', children: [] }
        ]
      },
      {
        id: 'e-2',
        partNumber: 'A320-200',
        name: '机翼',
        viewType: 'EBOM',
        children: [
          { id: 'e-2-1', partNumber: 'A320-210', name: '副翼', viewType: 'EBOM', children: [] }
        ]
      }
    ]
  }
]

/**
 * 创建一个带 dispatch jest.fn 的 mock $store，
 * 用于断言组件的 Vuex 派发（setNavSearchKeyword / selectNavNode）。
 */
function createMockStore () {
  return { dispatch: jest.fn() }
}

/**
 * 挂载 NavigationPanel。
 * @param {object} props 覆盖的 props
 * @param {object} [store] 可选自定义 mock store
 */
function mountPanel (props = {}, store) {
  const $store = store || createMockStore()
  const wrapper = mount(NavigationPanel, {
    localVue,
    propsData: {
      sourceTreeData: [],
      targetTreeData: [],
      loading: false,
      loadError: false,
      ...props
    },
    mocks: { $store }
  })
  return { wrapper, $store }
}

/**
 * 模拟用户在搜索框输入：直接在 a-input-search 上触发 change 事件，
 * 等价于 ant-design-vue Search 组件在原生输入时向父组件 emit('change', e)。
 */
function typeKeyword (wrapper, value) {
  const search = wrapper.findComponent({ name: 'AInputSearch' })
  search.vm.$emit('change', { target: { value } })
}

/**
 * 收集森林中全部节点 id（排序后返回，便于稳定断言）。
 */
function collectIds (nodes) {
  const ids = []
  const walk = (arr) => {
    if (!Array.isArray(arr)) return
    arr.forEach(n => {
      ids.push(n.id)
      if (n.children && n.children.length) walk(n.children)
    })
  }
  walk(nodes || [])
  return ids.sort()
}

const FULL_TREE_IDS = ['e-1', 'e-1-1', 'e-2', 'e-2-1', 'e-root']

/* ------------------------------------------------------------------ *
 * debounce 过滤（Requirements 2.1）
 * ------------------------------------------------------------------ */
describe('NavigationPanel - debounce 过滤', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('输入关键字仅在停止输入达 300ms 后才应用过滤 (Validates: Requirements 2.1)', async () => {
    const { wrapper, $store } = mountPanel({ sourceTreeData: buildSourceTree() })

    // 输入「驾驶」（仅命中 e-1，剪掉 e-2 分支）
    typeKeyword(wrapper, '驾驶')

    // 300ms 之前：关键字尚未应用，过滤树仍为完整树，未派发 setNavSearchKeyword
    expect(wrapper.vm.appliedKeyword).toBe('')
    expect(collectIds(wrapper.vm.filteredTree)).toEqual(FULL_TREE_IDS)
    expect($store.dispatch).not.toHaveBeenCalledWith('bomTree/setNavSearchKeyword', expect.anything())

    // 推进到 299ms：仍未应用
    jest.advanceTimersByTime(299)
    expect(wrapper.vm.appliedKeyword).toBe('')

    // 跨过 300ms：应用过滤
    jest.advanceTimersByTime(1)
    expect(wrapper.vm.appliedKeyword).toBe('驾驶')
    expect(collectIds(wrapper.vm.filteredTree)).toEqual(['e-1', 'e-root'])
    expect($store.dispatch).toHaveBeenCalledWith('bomTree/setNavSearchKeyword', '驾驶')
  })

  it('连续输入会重置计时，只按最后一次输入在 300ms 后应用 (Validates: Requirements 2.1)', () => {
    const { wrapper } = mountPanel({ sourceTreeData: buildSourceTree() })

    typeKeyword(wrapper, '驾驶')
    jest.advanceTimersByTime(200)
    // 200ms 时再次输入：计时重置
    typeKeyword(wrapper, '机翼')
    jest.advanceTimersByTime(200)
    // 距最后一次输入仅 200ms：尚未应用
    expect(wrapper.vm.appliedKeyword).toBe('')

    // 再推进 100ms（最后一次输入后满 300ms）：应用最后的关键字
    jest.advanceTimersByTime(100)
    expect(wrapper.vm.appliedKeyword).toBe('机翼')
    expect(collectIds(wrapper.vm.filteredTree)).toEqual(['e-2', 'e-root'])
  })
})

/* ------------------------------------------------------------------ *
 * 匹配高亮（Requirements 2.2）
 * ------------------------------------------------------------------ */
describe('NavigationPanel - 匹配高亮', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('匹配文本片段被 <mark class="bom-nav-highlight"> 包裹 (Validates: Requirements 2.2)', async () => {
    const { wrapper } = mountPanel({ sourceTreeData: buildSourceTree() })

    // 应用前：无任何高亮
    expect(wrapper.findAll('mark.bom-nav-highlight').length).toBe(0)

    typeKeyword(wrapper, '驾驶')
    jest.advanceTimersByTime(300)
    await wrapper.vm.$nextTick()

    const marks = wrapper.findAll('mark.bom-nav-highlight')
    expect(marks.length).toBeGreaterThan(0)
    // 至少有一个高亮片段文本恰为关键字「驾驶」
    expect(marks.wrappers.some(m => m.text() === '驾驶')).toBe(true)
  })

  it('highlightSegments 将匹配片段标记为 match，大小写不敏感 (Validates: Requirements 2.2)', () => {
    const { wrapper } = mountPanel({ sourceTreeData: buildSourceTree() })
    typeKeyword(wrapper, 'a320')
    jest.advanceTimersByTime(300)

    // 'A320-100' 在关键字 'a320'（大小写不敏感）下应拆分为：匹配 'A320' + 非匹配 '-100'
    const segments = wrapper.vm.highlightSegments('A320-100')
    expect(segments[0]).toEqual({ text: 'A320', match: true })
    expect(segments.some(s => s.match && s.text === 'A320')).toBe(true)
    expect(segments.map(s => s.text).join('')).toBe('A320-100')
  })
})

/* ------------------------------------------------------------------ *
 * 清空恢复完整树并清除高亮（Requirements 2.3, 2.6）
 * ------------------------------------------------------------------ */
describe('NavigationPanel - 清空 / 纯空白恢复完整树', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('清空关键字后恢复完整树并清除全部高亮 (Validates: Requirements 2.3)', async () => {
    const { wrapper } = mountPanel({ sourceTreeData: buildSourceTree() })

    // 先过滤
    typeKeyword(wrapper, '驾驶')
    jest.advanceTimersByTime(300)
    await wrapper.vm.$nextTick()
    expect(collectIds(wrapper.vm.filteredTree)).toEqual(['e-1', 'e-root'])
    expect(wrapper.findAll('mark.bom-nav-highlight').length).toBeGreaterThan(0)

    // 清空
    typeKeyword(wrapper, '')
    jest.advanceTimersByTime(300)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.appliedKeyword).toBe('')
    expect(collectIds(wrapper.vm.filteredTree)).toEqual(FULL_TREE_IDS)
    expect(wrapper.findAll('mark.bom-nav-highlight').length).toBe(0)
  })

  it('纯空白关键字等同清空，恢复完整树且不高亮 (Validates: Requirements 2.6)', async () => {
    const { wrapper } = mountPanel({ sourceTreeData: buildSourceTree() })

    typeKeyword(wrapper, '   \t ')
    jest.advanceTimersByTime(300)
    await wrapper.vm.$nextTick()

    // hasAppliedKeyword 视纯空白为无关键字
    expect(wrapper.vm.hasAppliedKeyword).toBe(false)
    expect(collectIds(wrapper.vm.filteredTree)).toEqual(FULL_TREE_IDS)
    expect(wrapper.findAll('mark.bom-nav-highlight').length).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * 无匹配空状态（Requirements 2.4）
 * ------------------------------------------------------------------ */
describe('NavigationPanel - 无匹配空状态', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('无匹配时展示「无匹配结果」空状态并保留已输入关键字 (Validates: Requirements 2.4)', async () => {
    const { wrapper } = mountPanel({ sourceTreeData: buildSourceTree() })

    typeKeyword(wrapper, 'ZZZ-不存在')
    jest.advanceTimersByTime(300)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.isEmpty).toBe(true)
    expect(wrapper.vm.emptyDescription).toBe('无匹配结果')

    const empty = wrapper.find('.ant-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('无匹配结果')

    // 关键字被保留（输入值与已应用关键字均保持）
    expect(wrapper.vm.inputKeyword).toBe('ZZZ-不存在')
    expect(wrapper.vm.appliedKeyword).toBe('ZZZ-不存在')

    // 无匹配时不渲染高亮
    expect(wrapper.findAll('mark.bom-nav-highlight').length).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * 无数据空状态（Requirements 2.6 / R1.5）
 * ------------------------------------------------------------------ */
describe('NavigationPanel - 无数据空状态', () => {
  it('无任何树数据时展示「暂无数据」空状态', () => {
    const { wrapper } = mountPanel({ sourceTreeData: [], targetTreeData: [] })

    expect(wrapper.vm.isEmpty).toBe(true)
    expect(wrapper.vm.emptyDescription).toBe('暂无数据')

    const empty = wrapper.find('.ant-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('暂无数据')
  })
})
