import bomTree from '@/store/modules/bomTree'

/**
 * tests/unit/bomTree.spec.js
 *
 * Vuex `bomTree` 模块导航相关 mutation / action 的示例单元测试。
 *
 * 覆盖:
 *  - 导航 mutations:SET_NAV_SELECTED / SET_FILTERED_SOURCE_TREE /
 *    SET_FILTERED_TARGET_TREE / SET_NAV_SEARCH_KEYWORD 正确写入 state。
 *  - action `selectNavNode`:仅对 viewType 一致的一侧更新过滤树,
 *    不一致一侧保持不变;节点不存在时不报错且保持不变;始终记录导航选中节点。
 *  - action `setNavSearchKeyword`:保存关键字。
 *
 * _Requirements: 3.1, 3.4, 3.7_
 */

/* ------------------------------------------------------------------ *
 * 测试辅助
 * ------------------------------------------------------------------ */

/**
 * 构造一份全新的 bomTree state(避免测试间共享同一对象引用)。
 * @param {object} overrides 覆盖字段
 */
function createState (overrides = {}) {
  return {
    sourceTreeData: [],
    targetTreeData: [],
    activeRules: null,
    selectedSourceNode: null,
    selectedTargetNode: null,
    operationHistory: [],
    conflicts: [],
    selectedNavNode: null,
    filteredSourceTreeData: [],
    filteredTargetTreeData: [],
    navSearchKeyword: '',
    ...overrides
  }
}

/**
 * 构造一个会把真实模块 mutation 应用到给定 state 上的 commit,
 * 使 action 可以端到端运行(action + mutation 协作),同时记录调用序列。
 * @param {object} state 目标 state
 */
function createCommit (state) {
  const calls = []
  const commit = (type, payload) => {
    calls.push({ type, payload })
    const mutation = bomTree.mutations[type]
    if (!mutation) throw new Error(`Unknown mutation: ${type}`)
    mutation(state, payload)
  }
  commit.calls = calls
  return commit
}

// 原结构树(EBOM):root → e-1 → e-1-1
const buildSourceTree = () => [
  {
    id: 'e-root',
    partNumber: 'E-000',
    name: '原结构根',
    viewType: 'EBOM',
    children: [
      {
        id: 'e-1',
        partNumber: 'E-100',
        name: '原结构子件',
        viewType: 'EBOM',
        children: [
          { id: 'e-1-1', partNumber: 'E-110', name: '原结构孙件', viewType: 'EBOM', children: [] }
        ]
      }
    ]
  }
]

// 编辑区树(SBOM):root → s-1
const buildTargetTree = () => [
  {
    id: 's-root',
    partNumber: 'S-000',
    name: '编辑区根',
    viewType: 'SBOM',
    children: [
      { id: 's-1', partNumber: 'S-100', name: '编辑区子件', viewType: 'SBOM', children: [] }
    ]
  }
]

/* ------------------------------------------------------------------ *
 * 导航 mutations
 * ------------------------------------------------------------------ */
describe('bomTree mutations - 导航相关', () => {
  it('SET_NAV_SELECTED 写入当前导航选中节点', () => {
    const state = createState()
    const node = { id: 'e-1', viewType: 'EBOM' }
    bomTree.mutations.SET_NAV_SELECTED(state, node)
    expect(state.selectedNavNode).toBe(node)
  })

  it('SET_FILTERED_SOURCE_TREE 写入过滤后的原结构树', () => {
    const state = createState()
    const tree = buildSourceTree()
    bomTree.mutations.SET_FILTERED_SOURCE_TREE(state, tree)
    expect(state.filteredSourceTreeData).toBe(tree)
  })

  it('SET_FILTERED_TARGET_TREE 写入过滤后的编辑区树', () => {
    const state = createState()
    const tree = buildTargetTree()
    bomTree.mutations.SET_FILTERED_TARGET_TREE(state, tree)
    expect(state.filteredTargetTreeData).toBe(tree)
  })

  it('SET_NAV_SEARCH_KEYWORD 保存导航搜索关键字', () => {
    const state = createState()
    bomTree.mutations.SET_NAV_SEARCH_KEYWORD(state, '关键字')
    expect(state.navSearchKeyword).toBe('关键字')
  })
})

/* ------------------------------------------------------------------ *
 * action: selectNavNode
 * _Requirements: 3.1, 3.4, 3.7_
 * ------------------------------------------------------------------ */
describe('bomTree action - selectNavNode', () => {
  // 哨兵值:用于断言「不一致一侧保持不变」(引用与内容均未改变)
  const SOURCE_SENTINEL = [{ id: 'prev-source', viewType: 'EBOM', children: [] }]
  const TARGET_SENTINEL = [{ id: 'prev-target', viewType: 'SBOM', children: [] }]

  function setup (overrides = {}) {
    const state = createState({
      sourceTreeData: buildSourceTree(),
      targetTreeData: buildTargetTree(),
      activeRules: { sourceViewType: 'EBOM', viewType: 'SBOM' },
      filteredSourceTreeData: SOURCE_SENTINEL,
      filteredTargetTreeData: TARGET_SENTINEL,
      ...overrides
    })
    const commit = createCommit(state)
    return { state, commit }
  }

  it('viewType 仅与原结构一致时,只更新原结构过滤树,编辑区保持不变 (Validates: Requirements 3.4)', () => {
    const { state, commit } = setup()
    const navNode = { id: 'e-1', viewType: 'EBOM' }

    bomTree.actions.selectNavNode({ commit, state }, navNode)

    // 原结构侧:更新为以 e-1 为根的子树
    expect(state.filteredSourceTreeData).toHaveLength(1)
    expect(state.filteredSourceTreeData[0].id).toBe('e-1')
    expect(state.filteredSourceTreeData[0].children[0].id).toBe('e-1-1')

    // 编辑区侧:viewType 不一致(SBOM ≠ EBOM),保持原值引用不变
    expect(state.filteredTargetTreeData).toBe(TARGET_SENTINEL)
    expect(
      commit.calls.some((c) => c.type === 'SET_FILTERED_TARGET_TREE')
    ).toBe(false)
  })

  it('viewType 仅与编辑区一致时,只更新编辑区过滤树,原结构保持不变 (Validates: Requirements 3.4)', () => {
    const { state, commit } = setup()
    const navNode = { id: 's-1', viewType: 'SBOM' }

    bomTree.actions.selectNavNode({ commit, state }, navNode)

    // 编辑区侧:更新为以 s-1 为根的子树
    expect(state.filteredTargetTreeData).toHaveLength(1)
    expect(state.filteredTargetTreeData[0].id).toBe('s-1')

    // 原结构侧:viewType 不一致(EBOM ≠ SBOM),保持原值引用不变
    expect(state.filteredSourceTreeData).toBe(SOURCE_SENTINEL)
    expect(
      commit.calls.some((c) => c.type === 'SET_FILTERED_SOURCE_TREE')
    ).toBe(false)
  })

  it('两侧 viewType 均一致时,两侧过滤树都更新', () => {
    // 原结构与编辑区视图类型相同的极端场景:两侧都应被定位
    const { state, commit } = setup({
      activeRules: { sourceViewType: 'EBOM', viewType: 'EBOM' },
      // 编辑区也使用 EBOM 节点以便命中
      targetTreeData: buildSourceTree(),
      filteredTargetTreeData: TARGET_SENTINEL
    })
    const navNode = { id: 'e-1', viewType: 'EBOM' }

    bomTree.actions.selectNavNode({ commit, state }, navNode)

    expect(state.filteredSourceTreeData[0].id).toBe('e-1')
    expect(state.filteredTargetTreeData[0].id).toBe('e-1')
  })

  it('两侧 viewType 均不一致时,两侧均保持不变', () => {
    const { state, commit } = setup()
    const navNode = { id: 'e-1', viewType: 'PBOM' }

    bomTree.actions.selectNavNode({ commit, state }, navNode)

    expect(state.filteredSourceTreeData).toBe(SOURCE_SENTINEL)
    expect(state.filteredTargetTreeData).toBe(TARGET_SENTINEL)
    expect(commit.calls.some((c) => c.type === 'SET_FILTERED_SOURCE_TREE')).toBe(false)
    expect(commit.calls.some((c) => c.type === 'SET_FILTERED_TARGET_TREE')).toBe(false)
  })

  it('viewType 一致但节点在该侧树中不存在时,不报错且该侧保持不变 (Validates: Requirements 3.7)', () => {
    const { state, commit } = setup()
    const navNode = { id: 'not-in-source', viewType: 'EBOM' }

    expect(() => {
      bomTree.actions.selectNavNode({ commit, state }, navNode)
    }).not.toThrow()

    // 类型一致但节点不存在:原结构侧保持不变
    expect(state.filteredSourceTreeData).toBe(SOURCE_SENTINEL)
    // 编辑区侧类型不一致,亦保持不变
    expect(state.filteredTargetTreeData).toBe(TARGET_SENTINEL)
    expect(commit.calls.some((c) => c.type === 'SET_FILTERED_SOURCE_TREE')).toBe(false)
    expect(commit.calls.some((c) => c.type === 'SET_FILTERED_TARGET_TREE')).toBe(false)
  })

  it('始终提交 SET_NAV_SELECTED 记录当前导航选中节点 (Validates: Requirements 3.1)', () => {
    const { state, commit } = setup()
    const navNode = { id: 'e-1', viewType: 'EBOM' }

    bomTree.actions.selectNavNode({ commit, state }, navNode)

    expect(state.selectedNavNode).toBe(navNode)
    expect(commit.calls.some((c) => c.type === 'SET_NAV_SELECTED' && c.payload === navNode)).toBe(true)
  })

  it('节点不存在或类型不一致时,仍记录导航选中节点 (Validates: Requirements 3.1, 3.7)', () => {
    const { state, commit } = setup()
    const navNode = { id: 'missing', viewType: 'PBOM' }

    bomTree.actions.selectNavNode({ commit, state }, navNode)

    expect(state.selectedNavNode).toBe(navNode)
  })

  it('activeRules 为空时不报错,且两侧保持不变', () => {
    const { state, commit } = setup({ activeRules: null })
    const navNode = { id: 'e-1', viewType: 'EBOM' }

    expect(() => {
      bomTree.actions.selectNavNode({ commit, state }, navNode)
    }).not.toThrow()

    expect(state.filteredSourceTreeData).toBe(SOURCE_SENTINEL)
    expect(state.filteredTargetTreeData).toBe(TARGET_SENTINEL)
    expect(state.selectedNavNode).toBe(navNode)
  })

  it('不修改入参 sourceTreeData / targetTreeData', () => {
    const { state, commit } = setup()
    const sourceBefore = JSON.stringify(state.sourceTreeData)
    const targetBefore = JSON.stringify(state.targetTreeData)

    bomTree.actions.selectNavNode({ commit, state }, { id: 'e-1', viewType: 'EBOM' })

    expect(JSON.stringify(state.sourceTreeData)).toBe(sourceBefore)
    expect(JSON.stringify(state.targetTreeData)).toBe(targetBefore)
  })
})

/* ------------------------------------------------------------------ *
 * action: setNavSearchKeyword
 * ------------------------------------------------------------------ */
describe('bomTree action - setNavSearchKeyword', () => {
  it('保存导航搜索关键字到 state', () => {
    const state = createState()
    const commit = createCommit(state)

    bomTree.actions.setNavSearchKeyword({ commit }, '驾驶舱')

    expect(state.navSearchKeyword).toBe('驾驶舱')
    expect(commit.calls.some((c) => c.type === 'SET_NAV_SEARCH_KEYWORD' && c.payload === '驾驶舱')).toBe(true)
  })
})
