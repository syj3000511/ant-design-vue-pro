<template>
  <div class="bom-navigation-panel">
    <div class="bom-navigation-panel__title">
      <span>查询 · 已发布完整结构</span>
      <a-button
        v-if="selectedKeys.length"
        type="link"
        size="small"
        class="bom-navigation-panel__reset"
        @click="resetLinkage"
      >
        显示完整结构
      </a-button>
    </div>

    <!-- 上方：内嵌搜索输入（最多 100 字符、300ms debounce、大小写不敏感） -->
    <div class="bom-navigation-panel__search">
      <a-input-search
        v-model="inputKeyword"
        :maxLength="100"
        allow-clear
        placeholder="搜索件号 / 名称"
        @change="onKeywordChange"
        @search="onKeywordSearch"
      />
    </div>

    <!-- 下方：导航树 / 加载态 / 加载失败 / 空状态 -->
    <div class="bom-navigation-panel__body">
      <!-- 加载失败：不渲染残缺树结构 -->
      <a-alert
        v-if="loadError"
        type="error"
        show-icon
        :message="loadErrorMessage"
      />

      <!-- 加载中 -->
      <div v-else-if="loading" class="bom-navigation-panel__loading">
        <a-spin tip="加载中…" />
      </div>

      <!-- 空状态：无数据 / 无匹配结果 -->
      <a-empty
        v-else-if="isEmpty"
        :image="simpleImage"
        :description="emptyDescription"
      />

      <!-- 导航树 -->
      <a-tree
        v-else
        block-node
        :tree-data="treeData"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :auto-expand-parent="autoExpandParent"
        @expand="onExpand"
        @select="onTreeSelect"
      >
        <template slot="title" slot-scope="node">
          <span class="bom-nav-node" :title="node.title">
            <span class="bom-nav-node__pn">
              <template v-for="(seg, i) in highlightSegments(node.dataRef.partNumber)">
                <mark v-if="seg.match" :key="'pn-' + i" class="bom-nav-highlight">{{ seg.text }}</mark>
                <span v-else :key="'pn-' + i">{{ seg.text }}</span>
              </template>
            </span>
            <span class="bom-nav-node__name">
              <template v-for="(seg, i) in highlightSegments(node.dataRef.name)">
                <mark v-if="seg.match" :key="'nm-' + i" class="bom-nav-highlight">{{ seg.text }}</mark>
                <span v-else :key="'nm-' + i">{{ seg.text }}</span>
              </template>
            </span>
            <a-tag v-if="node.dataRef.viewType" class="bom-nav-node__tag">{{ node.dataRef.viewType }}</a-tag>
          </span>
        </template>
      </a-tree>
    </div>
  </div>
</template>

<script>
import { Empty } from 'ant-design-vue'
import {
  filterTreeByKeyword,
  collectExpandableKeys,
  extractSubtreeById
} from './treeUtils'

const DEBOUNCE_MS = 300
const MAX_KEYWORD_LENGTH = 100

/**
 * 导航栏（NavigationPanel）。
 *
 * 组成：上方内嵌搜索输入（查询件号 / 名称）+ 下方 a-tree 导航树。
 * 数据来源：当前视图（EBOM / SBOM）【已发布最新版的完整 BOM 树】（publishedTreeData），
 *           而非左侧「原结构」展示的局部工作集；每个节点携带其所属 viewType。
 *           （publishedTreeData 未就绪时回退到 targetTreeData / sourceTreeData 以兼容旧上下文。）
 *
 * 行为：
 *  - 搜索：最多 100 字符、300ms debounce、大小写不敏感子串匹配（件号 / 名称）；
 *          调用 filterTreeByKeyword 过滤，高亮所有匹配文本片段，展开匹配节点祖先；
 *          清空关键字时恢复完整树并清除高亮。
 *  - 状态：加载态、加载失败提示、「暂无数据 / 无匹配结果」空状态。
 *  - 点击节点：emit('select', { id, viewType, subtree }) 并 dispatch('bomTree/selectNavNode', node)。
 */
export default {
  name: 'BomNavigationPanel',
  props: {
    // 已发布最新版【完整】BOM 树（导航树首选数据源，节点携带 viewType）
    publishedTreeData: {
      type: Array,
      default: () => []
    },
    // 原结构树数据（节点携带 sourceViewType，如 EBOM）
    sourceTreeData: {
      type: Array,
      default: () => []
    },
    // 编辑区树数据（节点携带 viewType，如 SBOM / PBOM）
    targetTreeData: {
      type: Array,
      default: () => []
    },
    // 树数据加载态
    loading: {
      type: Boolean,
      default: false
    },
    // 树数据加载是否失败
    loadError: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      simpleImage: Empty.PRESENTED_IMAGE_SIMPLE,
      // 搜索输入框当前值
      inputKeyword: '',
      // 已应用（去抖后）的关键字，驱动过滤与高亮
      appliedKeyword: '',
      // 当前展开的节点 key
      expandedKeys: [],
      // 当前选中的节点 key
      selectedKeys: [],
      // 是否自动展开父节点（搜索命中时为 true）
      autoExpandParent: true,
      // debounce 定时器句柄
      debounceTimer: null
    }
  },
  computed: {
    // 防御式读取 Vuex store 中的 publishedTreeData（已发布最新版完整 BOM 树）。
    // 不使用 mapState：当组件在无 bomTree 模块的环境（如纯组件单测）中渲染时，
    // mapState 会因 this.$store.state.bomTree 不存在而抛错；此处做空值保护，返回 []。
    storePublishedTreeData () {
      const state = this.$store && this.$store.state && this.$store.state.bomTree
      return state && Array.isArray(state.publishedTreeData) ? state.publishedTreeData : []
    },
    // 导航树数据来源（按优先级）：
    //  1. publishedTreeData prop（已发布最新版完整 BOM 树，父组件由 Vuex 映射下传，首选）；
    //  2. store 中的 publishedTreeData（防御式直读，兼容 prop 响应式链路异常）；
    //  3. 兜底回退到编辑区树 / 原结构树（局部工作集），避免在 publishedTreeData 缺失时
    //     导航树完全空白——保证用户始终能看到一棵可浏览、可筛选的树。
    mergedTreeData () {
      const pick = (v) => (Array.isArray(v) ? v : [])
      const fromProp = pick(this.publishedTreeData)
      if (fromProp.length) return fromProp
      const fromStore = this.storePublishedTreeData
      if (fromStore.length) return fromStore
      const target = pick(this.targetTreeData)
      if (target.length) return target
      return pick(this.sourceTreeData)
    },
    // 按已应用关键字过滤后的树（空 / 纯空白关键字返回完整树）
    filteredTree () {
      return filterTreeByKeyword(this.mergedTreeData, this.appliedKeyword)
    },
    // 转换为 a-tree 可用的 treeData 结构（保留业务字段以供高亮）
    treeData () {
      return this.toTreeData(this.filteredTree)
    },
    // id -> 原始节点 映射，用于点击时定位完整节点与子树
    nodeMap () {
      const map = {}
      const walk = (nodes) => {
        if (!Array.isArray(nodes)) return
        nodes.forEach(node => {
          map[node.id] = node
          if (node.children && node.children.length) walk(node.children)
        })
      }
      walk(this.mergedTreeData)
      return map
    },
    hasAppliedKeyword () {
      return !!(this.appliedKeyword && this.appliedKeyword.trim())
    },
    isEmpty () {
      return !this.filteredTree.length
    },
    emptyDescription () {
      // 无任何数据 → 暂无数据；有数据但关键字无匹配 → 无匹配结果
      if (!this.mergedTreeData.length) return '暂无数据'
      return this.hasAppliedKeyword ? '无匹配结果' : '暂无数据'
    },
    loadErrorMessage () {
      return '已发布完整结构暂不可用，请重试'
    }
  },
  watch: {
    // 数据变化（如异步加载完成）时，按当前关键字重算展开节点
    mergedTreeData: {
      immediate: true,
      handler () {
        this.refreshExpandedKeys()
      }
    }
  },
  beforeDestroy () {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  },
  methods: {
    /**
     * 把合并树转换为 a-tree 的 treeData 结构。
     * 每个节点保留 partNumber / name / viewType 以供 title 插槽高亮，
     * 并声明 scopedSlots.title 使用自定义标题渲染。
     */
    toTreeData (nodes) {
      if (!Array.isArray(nodes)) return []
      return nodes.map(node => {
        const item = {
          key: node.id,
          id: node.id,
          partNumber: node.partNumber != null ? String(node.partNumber) : '',
          name: node.name != null ? String(node.name) : '',
          viewType: node.viewType || '',
          title: `${node.partNumber != null ? node.partNumber : ''} ${node.name != null ? node.name : ''}`.trim(),
          scopedSlots: { title: 'title' }
        }
        if (node.children && node.children.length) {
          item.children = this.toTreeData(node.children)
        }
        return item
      })
    },

    /**
     * 搜索输入变化：限制 100 字符并以 300ms debounce 应用关键字。
     */
    onKeywordChange (e) {
      const raw = e && e.target ? e.target.value : ''
      const value = (raw || '').slice(0, MAX_KEYWORD_LENGTH)
      if (value !== this.inputKeyword) {
        this.inputKeyword = value
      }
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.applyKeyword(value)
      }, DEBOUNCE_MS)
    },

    /**
     * 回车 / 点击搜索按钮：立即应用关键字（跳过 debounce）。
     */
    onKeywordSearch (value) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = null
      }
      this.applyKeyword((value || '').slice(0, MAX_KEYWORD_LENGTH))
    },

    /**
     * 应用关键字：更新已应用关键字、写入 Vuex、并重算展开节点。
     * 空 / 纯空白关键字等同清空：恢复完整树并清除高亮（高亮随 appliedKeyword 失效）。
     */
    applyKeyword (keyword) {
      this.appliedKeyword = keyword || ''
      this.$store.dispatch('bomTree/setNavSearchKeyword', this.appliedKeyword)
      this.refreshExpandedKeys()
    },

    /**
     * 重算展开节点：
     *  - 有关键字：展开过滤树中全部含子节点的节点（即匹配节点的各级祖先），保证匹配可见；
     *  - 无关键字：展开完整树的全部父节点（恢复完整结构展示）。
     */
    refreshExpandedKeys () {
      const tree = this.hasAppliedKeyword
        ? filterTreeByKeyword(this.mergedTreeData, this.appliedKeyword)
        : this.mergedTreeData
      this.expandedKeys = collectExpandableKeys(tree)
      this.autoExpandParent = true
    },

    onExpand (expandedKeys) {
      this.expandedKeys = expandedKeys
      // 用户手动展开 / 折叠后，关闭自动展开父节点，尊重用户操作
      this.autoExpandParent = false
    },

    /**
     * 把文本按已应用关键字切分为「匹配 / 非匹配」片段，用于高亮所有匹配处。
     * 大小写不敏感；无关键字时返回单一非匹配片段（即不高亮）。
     * @param {string} text
     * @returns {Array<{ text: string, match: boolean }>}
     */
    highlightSegments (text) {
      const str = text == null ? '' : String(text)
      const keyword = (this.appliedKeyword || '').trim()
      if (!keyword) return [{ text: str, match: false }]
      const lowerStr = str.toLowerCase()
      const lowerKw = keyword.toLowerCase()
      const segments = []
      let cursor = 0
      let found = lowerStr.indexOf(lowerKw)
      while (found !== -1) {
        if (found > cursor) {
          segments.push({ text: str.slice(cursor, found), match: false })
        }
        segments.push({ text: str.slice(found, found + lowerKw.length), match: true })
        cursor = found + lowerKw.length
        found = lowerStr.indexOf(lowerKw, cursor)
      }
      if (cursor < str.length) {
        segments.push({ text: str.slice(cursor), match: false })
      }
      return segments.length ? segments : [{ text: str, match: false }]
    },

    /**
     * a-tree 选中事件：解析被点击节点并触发联动。
     */
    onTreeSelect (selectedKeys, e) {
      let id = null
      let viewType = null
      if (e && e.node && e.node.dataRef) {
        id = e.node.dataRef.id
        viewType = e.node.dataRef.viewType
      } else if (e && e.node && e.node.eventKey) {
        id = e.node.eventKey
      } else if (selectedKeys && selectedKeys.length) {
        id = selectedKeys[selectedKeys.length - 1]
      }
      if (id == null) return
      this.handleSelect(id, viewType)
    },

    /**
     * 处理节点点击：提取完整子树，emit('select', { id, viewType, subtree })，
     * 并 dispatch('bomTree/selectNavNode', node) 写入 Vuex 共享状态以联动两侧树表。
     */
    handleSelect (id, viewType) {
      const rawNode = this.nodeMap[id] || null
      const resolvedViewType = viewType || (rawNode ? rawNode.viewType : '') || ''
      const subtree = extractSubtreeById(this.mergedTreeData, id)
      // 保持选中高亮
      this.selectedKeys = [id]
      const payload = { id, viewType: resolvedViewType, subtree }
      this.$emit('select', payload)
      this.$store.dispatch('bomTree/selectNavNode', {
        id,
        viewType: resolvedViewType,
        subtree
      })
    },

    /**
     * 复位联动：清除当前导航选中与两侧过滤树，使树表恢复展示完整结构。
     */
    resetLinkage () {
      this.selectedKeys = []
      this.$emit('reset')
      this.$store.dispatch('bomTree/clearNavSelection')
    }
  }
}
</script>

<style lang="less" scoped>
.bom-navigation-panel {
  display: flex;
  flex-direction: column;
  width: 280px;
  min-width: 240px;
  height: 100%;
  border-right: 1px solid #f0f0f0;

  &__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-weight: 600;
    border-bottom: 1px solid #f0f0f0;
  }

  &__reset {
    padding: 0;
    height: auto;
    font-weight: normal;
  }

  &__search {
    padding: 8px 12px;
  }

  &__body {
    flex: 1;
    min-height: 0;
    padding: 0 8px 8px;
    overflow: auto;
  }

  &__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 0;
  }
}

.bom-nav-node {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  &__pn {
    font-weight: 500;
  }

  &__name {
    margin-left: 6px;
    color: rgba(0, 0, 0, 0.65);
  }

  &__tag {
    margin-left: 6px;
    transform: scale(0.85);
  }
}

.bom-nav-highlight {
  padding: 0;
  color: #f50;
  background-color: #fff1b8;
}
</style>
