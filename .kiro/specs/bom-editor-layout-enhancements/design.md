# BOM编辑器布局增强 - 设计文档

本文档描述对现有 BOM 编辑器（`src/components/BomEditor/`）的布局增强设计。目标是在最左侧新增导航栏、优化选中交互、移动重构按钮位置、改进侧边栏布局并增强撤销功能。

---

## Overview

### 设计背景

现有 BOM 编辑器采用「左右独立双树」布局，包含以下组件：
- `index.vue`：主容器，含工具栏、双树、TransformBar、侧边栏
- `LeftTree.vue`：原结构只读树表，使用 radio 类型 rowSelection
- `RightTree.vue`：编辑区可编辑树表，使用 radio 类型 rowSelection
- `TransformBar.vue`：位于双树下方，包含重构按钮
- `ConflictPanel.vue`：右侧侧边栏，使用 a-tabs 切换「冲突提示」与「变更历史」
- `columns.js`：公共列定义与右侧操作列定义
- Vuex `bomTree` 模块：管理树数据、选中状态、操作历史、冲突列表

### 用户确认

- **「类型一致」比较字段**：使用 BOM 视图类型 `viewType`（EBOM/SBOM/PBOM）作为比较依据
- **导航树节点**：携带其所属 `viewType`，联动时与 `sourceViewType`（原结构）和 `viewType`（编辑区）分别比较

---

## Architecture

### 整体布局结构

改造后的 BOM 编辑器采用四栏横向布局：

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  导航栏     │  原结构树表  │  编辑区树表  │   侧边栏    │
│  Navigation │  SourceTree │  EditTree   │  SidePanel  │
│   Panel     │   (Left)    │   (Right)   │             │
│             │             │             │ ┌─────────┐ │
│ ┌─────────┐ │  已发布     │  当前变更    │ │变更历史 │ │
│ │ 搜索框  │ │  只读       │  可编辑      │ │ (上50%) │ │
│ ├─────────┤ │             │             │ ├─────────┤ │
│ │        │ │             │             │ │冲突检测 │ │
│ │ 导航树 │ │             │             │ │ (下50%) │ │
│ │        │ │             │             │ └─────────┘ │
│ └─────────┘ │             │             │             │
│ 工具栏按钮   │             │             │             │
│ ┌─────────┐ │             │             │             │
│ │重构按钮 │ │             │             │             │
│ └─────────┘ │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**关键约束**：
- 四栏按固定顺序横向排列，不换行
- 相邻栏之间互不重叠
- 当视口宽度不足时，由容器提供横向滚动，各栏保持互不重叠
- 各栏宽度之和不超过容器可用宽度

### 组件清单与职责

| 组件 | 文件路径 | 职责 | 变更说明 |
|------|----------|------|----------|
| `BomEditor` (index.vue) | `src/components/BomEditor/index.vue` | 主容器，事件协调，数据加载 | 移除 TransformBar，添加 NavigationPanel，调整侧边栏布局 |
| `NavigationPanel` | 新建 `src/components/BomEditor/NavigationPanel.vue` | 导航搜索框 + 导航树，支持搜索过滤与节点点击联动 | 新增组件 |
| `NavigationSearch` | 内嵌于 NavigationPanel | 搜索输入，300ms debounce，大小写不敏感子串匹配 | 内嵌组件 |
| `NavigationTree` | 内嵌于 NavigationPanel | 树状展示 BOM 结构，支持展开/折叠，点击联动 | 内嵌组件 |
| `LeftTree` (SourceTree) | `src/components/BomEditor/LeftTree.vue` | 原结构只读树表 | 移除 rowSelection，改用行点击选中 |
| `RightTree` (EditTree) | `src/components/BomEditor/RightTree.vue` | 编辑区可编辑树表 | 移除 rowSelection，改用行点击选中，文字单行省略 |
| `SidePanel` | 重构 `src/components/BomEditor/ConflictPanel.vue` | 变更历史 + 冲突检测双区展示 | 移除 a-tabs，改为上下分区布局 |
| `ChangeHistory` | 内嵌于 SidePanel | 展示操作历史，支持 LIFO 撤销 | 内嵌组件 |
| `ConflictList` | 内嵌于 SidePanel | 展示未处理冲突 | 内嵌组件 |
| 工具栏按钮 | `index.vue` 内 | 重新加载、撤销、侧边栏切换 | 添加 TransformButton |

---

## Components and Interfaces

### NavigationPanel

```
┌─────────────────────────────┐
│  搜索框 (NavigationSearch)  │  ← 300ms debounce, 100 字符限制
├─────────────────────────────┤
│                             │
│  导航树 (NavigationTree)    │  ← 点击节点触发联动
│                             │
│  - 展开/折叠                │
│  - 搜索高亮                 │
│  - 空状态处理               │
│                             │
└─────────────────────────────┘
```

**数据来源策略**：
- 导航树以 `publishedTreeData`（已发布最新版完整 BOM 树）作为**唯一首选数据来源**，该数据集与左侧「原结构树表」展示的局部工作集（`sourceTreeData`）是两个独立的数据集。
- 若 `publishedTreeData` 为空数组或未从服务端返回，则触发 `loadError` 状态，展示「已发布完整结构暂不可用，请重试」提示，**不静默回退到 `sourceTreeData` 或 `targetTreeData`**，以避免用户将局部树误认为完整已发布结构。

**Props**：
- `publishedTreeData`: 已发布最新版完整 BOM 树（导航树唯一首选数据来源）
- `sourceTreeData`: 原结构树数据（局部工作集，仅供父组件传递上下文，导航树不作为回退来源）
- `targetTreeData`: 编辑区树数据（局部工作集，仅供父组件传递上下文，导航树不作为回退来源）

**Events**：
- `@select`: 点击节点时触发，返回 `{ id, viewType, subtree }`

### LeftTree (修改)

**变更**：
- 移除 `rowSelection` 配置
- 添加 `@click` 监听行点击
- 排除「操作」列区域的点击事件

**Props**：保持不变

**Events**：
- `@select`: 行点击时触发，返回选中节点

### RightTree (修改)

**变更**：
- 移除 `rowSelection` 配置
- 添加 `@click` 监听行点击
- 排除「操作」列区域的点击事件
- 文字单行省略样式

**Props**：保持不变

**Events**：
- `@select`: 行点击时触发
- `@action`: 操作菜单点击

### SidePanel (重构)

```
┌─────────────────────────────┐
│      变更历史 (上 50%)       │  ← 独立滚动，换行完整展示
│  ┌─────────────────────────┐│
│  │ [撤销] 新增下级 14:30   ││  ← 仅栈顶提供撤销
│  │       修改属性 14:25    ││
│  │       删除 14:20        ││
│  └─────────────────────────┘│
├─────────────────────────────┤
│      冲突检测 (下 50%)       │  ← 独立滚动
│  ┌─────────────────────────┐│
│  │ [标记已处理] 零件号 XXX ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

**Props**：
- `conflicts`: 冲突列表
- `history`: 操作历史（从 operationHistory 取）

**Events**：
- `@resolve`: 点击「标记已处理」时触发

### 工具栏按钮 (index.vue 内)

```
┌──────────────────────────────────────────────────────┐
│ [重新加载] [撤销] [重构按钮]    侧边栏    │EBOM│SBOM│
└──────────────────────────────────────────────────────┘
```

**TransformButton 逻辑**：
- `:disabled="!canTransform"`
- 显示引导提示文案

### 数据流设计

#### 1. 导航树点击 → 两侧树表联动（R3）

```
用户点击导航树节点
       │
       ▼
NavigationPanel 设置 selectedNavNode = { id, viewType, subtree }
       │
       ├──► commit('bomTree/SET_NAV_SELECTED', node)
       │
       ▼
LeftTree / RightTree 监听 navSelectedNode 变化
       │
       ├──► if (sourceViewType === navNode.viewType)
       │         过滤展示 navNode.subtree
       │         设置选中态
       │         滚动至节点可见
       │
       └──► if (viewType === navNode.viewType)
                 过滤展示 navNode.subtree
                 设置选中态
                 滚动至节点可见
```

**关键逻辑**：
- 导航节点携带 `viewType`（EBOM/SBOM/PBOM）
- 左侧原结构树表比较 `sourceViewType === navNode.viewType`
- 右侧编辑区树表比较 `viewType === navNode.viewType`
- 不一致时保持当前展示内容不变
- 子树过滤保持原层级关系

#### 2. 行点击选中（R4）

```
用户点击表格行（非操作列）
       │
       ▼
a-table 触发 @click 或 rowClassName 钩子
       │
       ├──► LeftTree: commit('bomTree/SET_SOURCE_SELECTED', node)
       │
       └──► RightTree: commit('bomTree/SET_TARGET_SELECTED', node)
                │
                ▼
          100ms 内应用选中高亮样式
          （移除 radio 渲染）
```

**关键逻辑**：
- 移除 `a-table` 的 `rowSelection` 配置
- 使用 `@click` 监听行点击，排除「操作」列区域
- 多次点击间隔 < 100ms 时临时多行高亮，最终收敛为单行

#### 3. 重构按钮移至工具栏（R5）

```
TransformButton (在 index.vue 工具栏内)
       │
       ├──► 监听 canTransform 计算属性
       │         canTransform = selectedSourceNode && selectedTargetNode
       │
       ├──► 禁用状态显示引导提示
       │
       └──► 点击时调用 onTransform({ source, target })
                    │
                    ▼
              发起 transformStructure 服务请求
```

**关键逻辑**：
- 移除 `TransformBar.vue` 组件
- 按钮在工具栏固定显示
- `canTransform` 状态驱动启用/禁用
- 禁用时展示缺失项提示（缺少源节点/目标父节点）

#### 4. 侧边栏上下分区（R7）

```
SidePanel (重构 ConflictPanel.vue)
       │
       ├──► 变更历史区域 (上 50%)
       │         数据源: operationHistory
       │         独立滚动
       │
       └──► 冲突检测区域 (下 50%)
                 数据源: conflicts
                 独立滚动
```

**关键逻辑**：
- 移除 `a-tabs` 组件
- 两个区域始终同时可见
- 各自独立垂直滚动
- 默认显示，300ms 切换动画

#### 5. 从变更历史撤销（R9）

```
ChangeHistory (SidePanel 内嵌组件)
       │
       ├──► 显示 reversedHistory (LIFO 顺序)
       │
       ├──► 仅栈顶记录提供撤销入口
       │
       └──► 用户点击撤销
                │
                ▼
          调用 undoOperation(changeContextId, lastOperationId)
          超时: 30s
                │
                ├──► 成功: 更新编辑区树表，POP_OPERATION
                │
                └──► 失败: 显示错误提示，保持不变
```

**关键逻辑**：
- 栈顶提供撤销入口，其他记录禁用
- 30s 超时限制
- 请求进行中禁用撤销入口，防止重复提交

#### 6. 导航搜索（R2）

```
NavigationSearch 输入关键字
       │
       ▼
300ms debounce 后执行过滤
       │
       ▼
1s 内展示匹配结果
       │
       ├──► 过滤条件: 大小写不敏感子串匹配
       │         件号 或 名称 包含关键字
       │
       ├──► 高亮匹配文本片段
       │
       └──► 展开所有祖先节点保证可见
                │
                ▼
          无匹配时显示空状态提示
```

**关键约束**：
- 关键字最大 100 字符
- 300ms debounce
- 1s 内响应
- 清空时恢复完整树，清除高亮

### 样式设计

#### 单行省略显示（R6）

编辑区树表单元格样式：

```css
/* 单行省略 */
.cell-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;  /* 固定行高 */
}

/* tooltip 完整显示 */
.ant-tooltip {
  word-break: break-all;
}
```

#### 选中高亮样式

```css
.bom-row-selected {
  background-color: #e6f7ff;
}
```

#### 侧边栏分区样式

```css
.side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.history-region {
  flex: 1;  /* 50% */
  overflow-y: auto;
}

.conflict-region {
  flex: 1;  /* 50% */
  overflow-y: auto;
}
```

---

## Data Models

### Vuex 状态扩展

在 `src/store/modules/bomTree.js` 中新增或确认以下状态：

```javascript
// 导航相关
selectedNavNode: null,        // 当前导航选中的节点 { id, viewType, subtree }
filteredSourceTreeData: [],   // 导航联动过滤后的原结构数据
filteredTargetTreeData: [],   // 导航联动过滤后的编辑区数据
navSearchKeyword: '',         // 导航搜索关键字

// 侧边栏
sidebarVisible: true,         // 侧边栏显示状态（可由 index.vue 本地状态管理）

// 撤销状态
undoLoading: false,           // 撤销进行中状态（防止重复提交）
```

### 导航树节点结构

导航树节点携带以下字段用于联动：

```javascript
{
  id: 'node-unique-id',
  partNumber: 'PART-001',
  name: '零件名称',
  viewType: 'EBOM',           // 用于与 sourceViewType 比较
  // 或 'SBOM', 'PBOM'
  children: [],
  // ... 其他业务字段
}
```

### Mock 数据结构

为满足 R10 要求，Mock 数据应包含：

> **R10 AC 8 约束**：`publishedTreeData` 的节点总数必须比 `sourceTreeData` 多**至少 10 个节点**，以直观体现「完整已发布结构（导航栏）」与「局部工作集（原结构树表）」之间的数据差异。实现方式：在 `buildPublishedTree` 生成的核心结构基础上，额外嫁接若干「仅存在于已发布完整结构」的专有分支节点（见 `buildPublishedOnly`），使导航树节点总数明显多于 `sourceTreeData`。

```javascript
// 原结构树 (sourceTreeData)
{
  id: 'EBOM-ROOT',
  partNumber: 'A320-00001',
  name: 'A320 飞机主结构',
  viewType: 'EBOM',
  parentPartNumber: '',
  quantity: 1,
  effectivity: 'A1',
  rowState: 'Unchanged',
  children: [
    // 层级深度 ≥4，节点总数 ≥100
    // 包含 Added, Modified, Deleted, Unchanged 四种状态
    {
      id: 'EBOM-001',
      partNumber: 'A320-10001',
      name: '驾驶舱（长名称用于测试省略显示效果）', // ≥40 字符
      viewType: 'EBOM',
      parentPartNumber: 'A320-00001',
      quantity: 1,
      effectivity: 'A1',
      rowState: 'Modified',
      children: []
    }
    // ... 更多节点
  ]
}

// 编辑区树 (targetTreeData) 类似结构，viewType 为 'SBOM' 或 'PBOM'

// 变更历史 (operationHistory)
{
  operationId: 'OP-001',
  label: '新增下级 - A320-20001',
  time: '2024/01/15 14:30:25' // 包含年月日时分
}
// 至少一条记录名称 ≥40 字符
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 导航联动 viewType 匹配

*For any* 导航节点及其 viewType，联动过滤后的树表应仅显示与该 viewType 匹配的节点

**Validates: Requirements 3**

### Property 2: 行点击响应一致性

*For any* 表格行点击事件，应在 100ms 内更新选中状态并应用高亮样式

**Validates: Requirements 4**

### Property 3: 子树过滤层级保持

*For any* 导航节点过滤操作，过滤后的子树应保持原有的父子层级关系

**Validates: Requirements 3**

### Property 4: 撤销操作幂等性

*For any* 有效的撤销操作，执行一次与执行两次应产生相同的结果

**Validates: Requirements 9**

---

## Error Handling

### R3 联动边界情况

| 场景 | 处理 |
|------|------|
| 导航节点在类型一致树表中不存在 | 保持当前展示内容、选中态、滚动位置不变，不抛异常 |
| 导航节点为叶子节点 | 仅展示该节点自身，不展开下级 |
| 导航节点为根节点 | 展示完整树 |

### R4 选中边界情况

| 场景 | 处理 |
|------|------|
| 点击操作列菜单控件 | 触发菜单，不触发选中 |
| 再次点击已选中行 | 保持选中态不变 |
| 快速连续点击 < 100ms | 临时多行高亮，最终收敛 |

### R9 撤销边界情况

| 场景 | 处理 |
|------|------|
| 无可撤销操作 | 不显示撤销入口 |
| 撤销超时 30s | 显示超时错误提示，保持不变 |
| 撤销失败（被依赖） | 显示失败原因，保持不变 |
| 撤销进行中 | 禁用撤销入口，防止重复提交 |

---

## Testing Strategy

### 单元测试 (EXAMPLE)

| 测试项 | 测试类型 | 说明 |
|--------|----------|------|
| 导航搜索过滤逻辑 | EXAMPLE | 关键字匹配、高亮、空结果 |
| 行点击选中状态 | EXAMPLE | 选中、取消选中、切换 |
| TransformButton 启用/禁用 | EXAMPLE | canTransform 状态判断 |
| 侧边栏分区布局 | EXAMPLE | 50%/50% 高度分配 |
| 变更历史 LIFO 顺序 | EXAMPLE | 倒序展示，仅栈顶可撤销 |

### 属性测试 (PROPERTY)

| 测试项 | 测试类型 | 说明 |
|--------|----------|------|
| 导航联动 viewType 匹配 | PROPERTY | 任意 viewType 组合，过滤结果正确 |
| 行点击响应时间 | PROPERTY | 任意节点，100ms 内响应 |
| 子树过滤层级保持 | PROPERTY | 任意节点，父子关系不变 |

### 集成测试 (INTEGRATION)

| 测试项 | 测试类型 | 说明 |
|--------|----------|------|
| 导航树点击 → 双树联动 | INTEGRATION | 完整数据流，1-3 示例 |
| 撤销操作成功 | INTEGRATION | 服务端调用，数据更新 |
| Mock 数据加载 | INTEGRATION | ≥4 层 ≥100 节点 |

---

## 待确认问题

本文档基于以下假设编写，如与实际需求不符需调整：

1. **导航树数据来源**：~~假设取自 `sourceTreeData` 与 `targetTreeData` 的合并视图~~ → **已确认**：导航树数据来源为 `publishedTreeData`（已发布最新版完整 BOM 树），与左侧「原结构」局部工作集（`sourceTreeData` / `targetTreeData`）是两个独立的数据集，导航树不得将局部工作集作为等价替代或回退来源。
2. **联动展示方式**：采用过滤展示子树（保留层级），而非仅滚动定位
3. **撤销后导航状态**：默认不强制刷新导航选中节点
4. **Mock 数据接入点**：通过现有服务层或前端 mock 层提供

---

## 实施优先级

| 优先级 | 需求 | 预计工作量 |
|--------|------|------------|
| P0 | R4 整行点击选中 | 低 |
| P0 | R5 重构按钮移至工具栏 | 低 |
| P1 | R1 导航栏新增 | 中 |
| P1 | R2 导航搜索与高亮 | 中 |
| P1 | R3 导航联动 | 中 |
| P1 | R7 侧边栏分区 | 低 |
| P1 | R8 变更历史换行 | 低 |
| P2 | R9 从历史撤销 | 中 |
| P2 | R10 Mock 数据扩充 | 中 |
| P2 | R11 整体布局协调 | 低 |
| P2 | R6 单行省略显示 | 低 |