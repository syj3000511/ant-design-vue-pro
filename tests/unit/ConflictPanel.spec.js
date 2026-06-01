import { mount, createLocalVue } from '@vue/test-utils'
import { Empty, Tag, Button, List, Badge } from 'ant-design-vue'
import ConflictPanel from '@/components/BomEditor/ConflictPanel.vue'

/**
 * tests/unit/ConflictPanel.spec.js
 *
 * SidePanel(由 ConflictPanel.vue 重构而来)变更历史区的示例单元测试。
 *
 * 覆盖:
 *  - 变更历史按时间倒序(LIFO)展示,最近一次操作位于顶部       _Requirements: 8.1, 9.1
 *  - 撤销入口仅出现在栈顶(最近一次)记录上,其余记录无入口      _Requirements: 9.2
 *  - 撤销进行中(undoLoading)时禁用栈顶撤销入口防止重复提交     _Requirements: 9.6
 *  - 无任何操作历史时不提供撤销入口,并展示空状态               _Requirements: 9.6
 *  - 变更历史 / 冲突检测两区在各自数据为空时均展示空状态        _Requirements: 8.1
 *  - 点击栈顶撤销入口对外 emit `undo` 事件
 *
 * 说明:使用 @vue/test-utils `mount` + 真实 Ant Design Vue 组件,
 *      以便栈顶 `a-button` 的禁用态与点击事件具备真实行为。
 *
 * _Requirements: 8.1, 9.1, 9.2, 9.6_
 */

// 全部用例共用同一个注册了 Ant Design Vue 组件的 localVue。
// 仅注册 ConflictPanel 实际用到的组件(a-empty / a-tag / a-button / a-list / a-badge)。
const localVue = createLocalVue()
localVue.use(Empty)
localVue.use(Tag)
localVue.use(Button)
localVue.use(List)
localVue.use(Badge)

const HISTORY_REGION = '.bom-side-panel__region--history'
const CONFLICT_REGION = '.bom-side-panel__region--conflict'
const HISTORY_ITEM = '.bom-history-item'
const HISTORY_LABEL = '.bom-history-item__label'
const UNDO_ENTRY = '.bom-history-item__undo'

/**
 * 构造一份按时间正序(最旧 → 最新)排列的操作历史。
 * reversedHistory 计算属性会将其倒序,使最新位于列表顶部。
 */
function buildHistory () {
  return [
    { operationId: 'OP-1', operationType: '新增', time: '2024/01/15 14:20', label: '最旧:新增下级 A320-20001' },
    { operationId: 'OP-2', operationType: '修改', time: '2024/01/15 14:25', label: '中间:修改属性 quantity' },
    { operationId: 'OP-3', operationType: '删除', time: '2024/01/15 14:30', label: '最新:删除节点 A320-30001' }
  ]
}

function buildConflicts () {
  return [
    { id: 'C-1', nodePartNumber: 'A320-40001', message: '件号冲突', resolved: false }
  ]
}

/**
 * 统一挂载助手。
 * @param {object} props ConflictPanel props 覆盖
 */
function mountPanel (props = {}) {
  return mount(ConflictPanel, {
    localVue,
    propsData: {
      history: [],
      conflicts: [],
      undoLoading: false,
      ...props
    }
  })
}

describe('ConflictPanel (SidePanel) - 变更历史 LIFO 顺序与撤销入口门控', () => {
  /* ---------------------------------------------------------------- *
   * 倒序(LIFO)展示
   * _Requirements: 8.1, 9.1
   * ---------------------------------------------------------------- */
  it('按时间倒序展示历史记录,最近一次操作位于列表顶部 (Validates: Requirements 9.1)', () => {
    const history = buildHistory()
    const wrapper = mountPanel({ history })

    const labels = wrapper.findAll(HISTORY_LABEL).wrappers.map(w => w.text())

    // 渲染顺序应为输入的倒序:最新(OP-3) → 中间(OP-2) → 最旧(OP-1)
    expect(labels).toEqual([
      '最新:删除节点 A320-30001',
      '中间:修改属性 quantity',
      '最旧:新增下级 A320-20001'
    ])
  })

  it('渲染的历史条目数量与输入历史长度一致 (Validates: Requirements 8.1)', () => {
    const history = buildHistory()
    const wrapper = mountPanel({ history })

    expect(wrapper.findAll(HISTORY_ITEM)).toHaveLength(history.length)
  })

  /* ---------------------------------------------------------------- *
   * 撤销入口仅出现在栈顶记录
   * _Requirements: 9.2
   * ---------------------------------------------------------------- */
  it('撤销入口仅出现在栈顶(最近一次)记录上 (Validates: Requirements 9.2)', () => {
    const wrapper = mountPanel({ history: buildHistory() })

    const undoEntries = wrapper.findAll(UNDO_ENTRY)
    // 恰好一个撤销入口
    expect(undoEntries).toHaveLength(1)

    // 该撤销入口位于第一个(栈顶)历史条目内,而非其他条目
    const items = wrapper.findAll(HISTORY_ITEM)
    expect(items.at(0).find(UNDO_ENTRY).exists()).toBe(true)
    expect(items.at(1).find(UNDO_ENTRY).exists()).toBe(false)
    expect(items.at(2).find(UNDO_ENTRY).exists()).toBe(false)
  })

  it('栈顶记录即为最近一次操作(与倒序后的首条对应) (Validates: Requirements 9.1, 9.2)', () => {
    const wrapper = mountPanel({ history: buildHistory() })

    const topItem = wrapper.findAll(HISTORY_ITEM).at(0)
    expect(topItem.find(HISTORY_LABEL).text()).toBe('最新:删除节点 A320-30001')
    expect(topItem.find(UNDO_ENTRY).exists()).toBe(true)
  })

  /* ---------------------------------------------------------------- *
   * 撤销进行中禁用入口
   * _Requirements: 9.6
   * ---------------------------------------------------------------- */
  it('undoLoading=true 时栈顶撤销入口被禁用 (Validates: Requirements 9.6)', () => {
    const wrapper = mountPanel({ history: buildHistory(), undoLoading: true })

    const undoButton = wrapper.find(UNDO_ENTRY)
    expect(undoButton.exists()).toBe(true)
    // a-button 渲染为原生 <button>,禁用时带 disabled 属性
    expect(undoButton.attributes('disabled')).toBeDefined()
  })

  it('undoLoading=true 时点击撤销入口不触发 undo 事件 (Validates: Requirements 9.6)', async () => {
    const wrapper = mountPanel({ history: buildHistory(), undoLoading: true })

    await wrapper.find(UNDO_ENTRY).trigger('click')

    expect(wrapper.emitted('undo')).toBeFalsy()
  })

  it('undoLoading=false 时栈顶撤销入口可用(未禁用) (Validates: Requirements 9.6)', () => {
    const wrapper = mountPanel({ history: buildHistory(), undoLoading: false })

    expect(wrapper.find(UNDO_ENTRY).attributes('disabled')).toBeUndefined()
  })

  /* ---------------------------------------------------------------- *
   * 无操作历史时无入口 + 空状态
   * _Requirements: 8.1, 9.6
   * ---------------------------------------------------------------- */
  it('历史为空时不提供任何撤销入口 (Validates: Requirements 9.6)', () => {
    const wrapper = mountPanel({ history: [] })

    expect(wrapper.findAll(UNDO_ENTRY)).toHaveLength(0)
    expect(wrapper.findAll(HISTORY_ITEM)).toHaveLength(0)
  })

  it('历史为空时变更历史区展示空状态提示 (Validates: Requirements 8.1)', () => {
    const wrapper = mountPanel({ history: [] })

    const historyRegion = wrapper.find(HISTORY_REGION)
    expect(historyRegion.find('.ant-empty').exists()).toBe(true)
    expect(historyRegion.text()).toContain('暂无操作')
  })

  it('冲突为空时冲突检测区展示空状态提示 (Validates: Requirements 8.1)', () => {
    const wrapper = mountPanel({ conflicts: [] })

    const conflictRegion = wrapper.find(CONFLICT_REGION)
    expect(conflictRegion.find('.ant-empty').exists()).toBe(true)
    expect(conflictRegion.text()).toContain('暂无冲突')
  })

  it('历史与冲突均为空时,两区各自展示独立空状态 (Validates: Requirements 8.1)', () => {
    const wrapper = mountPanel({ history: [], conflicts: [] })

    // 两个区域同时可见且各含一个空状态
    expect(wrapper.find(HISTORY_REGION).find('.ant-empty').exists()).toBe(true)
    expect(wrapper.find(CONFLICT_REGION).find('.ant-empty').exists()).toBe(true)
    expect(wrapper.findAll('.ant-empty')).toHaveLength(2)
  })

  it('有历史时变更历史区不展示空状态,而是渲染历史列表 (Validates: Requirements 8.1)', () => {
    const wrapper = mountPanel({ history: buildHistory() })

    const historyRegion = wrapper.find(HISTORY_REGION)
    expect(historyRegion.find('.ant-empty').exists()).toBe(false)
    expect(historyRegion.find('.bom-history-list').exists()).toBe(true)
  })

  /* ---------------------------------------------------------------- *
   * 点击栈顶撤销入口 emit undo
   * ---------------------------------------------------------------- */
  it('点击栈顶撤销入口对外 emit `undo` 事件', async () => {
    const wrapper = mountPanel({ history: buildHistory(), undoLoading: false })

    await wrapper.find(UNDO_ENTRY).trigger('click')

    expect(wrapper.emitted('undo')).toBeTruthy()
    expect(wrapper.emitted('undo')).toHaveLength(1)
  })

  it('点击栈顶撤销入口不附带 payload(无参数 emit)', async () => {
    const wrapper = mountPanel({ history: buildHistory(), undoLoading: false })

    await wrapper.find(UNDO_ENTRY).trigger('click')

    expect(wrapper.emitted('undo')[0]).toEqual([])
  })

  /* ---------------------------------------------------------------- *
   * 同时展示历史与冲突(非空场景)
   * ---------------------------------------------------------------- */
  it('历史与冲突均非空时,两区同时渲染各自内容', () => {
    const wrapper = mountPanel({ history: buildHistory(), conflicts: buildConflicts() })

    expect(wrapper.find(HISTORY_REGION).find('.bom-history-list').exists()).toBe(true)
    expect(wrapper.find(CONFLICT_REGION).find('.ant-list').exists()).toBe(true)
    expect(wrapper.findAll('.ant-empty')).toHaveLength(0)
  })
})
