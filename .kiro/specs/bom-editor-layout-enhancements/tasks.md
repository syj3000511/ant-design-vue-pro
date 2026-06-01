# Implementation Plan: BOM编辑器布局增强

## Overview

本计划将设计文档拆解为一系列增量编码步骤，对现有 BOM 编辑器（`src/components/BomEditor/`）进行布局增强。实现顺序遵循「先地基、后组件、最后集成」：

1. 先扩展纯函数工具（`treeUtils.js`）与 Vuex `bomTree` 状态、并扩充 Mock 数据，使后续组件有可依赖的能力与数据。
2. 再实现 / 改造各列组件（NavigationPanel、LeftTree、RightTree、SidePanel）。
3. 最后在 `index.vue` 完成四栏布局、工具栏重构按钮、撤销联动等整体接线，确保无悬空、无未集成的代码。

技术栈固定为 Vue 2.6（Options API）、纯 JavaScript、Ant Design Vue 1.7.8、Vuex 3.6，不引入 Vue 3 / Pinia / TypeScript。共享状态统一落在 Vuex。

测试说明：项目已配置 Jest（`@vue/cli-plugin-unit-jest` + `@vue/test-utils`，`npm run test:unit`，匹配 `tests/unit/**/*.spec.js`），但尚无 `tests/unit` 目录。属性测试采用 `fast-check`（JS 生态标准 PBT 库），首次使用时需作为 devDependency 安装。带 `*` 的测试子任务为可选项。

## Tasks

- [x] 1. 扩展树工具函数（treeUtils.js）以支持导航搜索与联动过滤
  - [x] 1.1 在 `treeUtils.js` 新增纯函数
    - `extractSubtreeById(nodes, id)`：返回该节点自身及其全部下级（深拷贝），找不到返回 `null`
    - `filterTreeByKeyword(nodes, keyword)`：对 `partNumber`/`name`（去首尾空白后）做大小写不敏感子串匹配，保留匹配节点的各级祖先，维持父子层级；空/纯空白关键字返回完整树
    - `collectAncestorIds(nodes, id)`：返回某节点全部祖先 id（用于搜索/联动时展开祖先）
    - `resolveLinkedTree(nodes, treeViewType, navNode)`：当 `treeViewType === navNode.viewType` 时返回 `extractSubtreeById` 的子树，否则返回 `null`（表示「保持不变」），且节点在树中不存在时也返回 `null`
    - 全部为不可变实现（基于已有的 `lodash.clonedeep`），不修改入参
    - _Requirements: 2.1, 2.5, 2.6, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9_

  - [x] 1.2 编写「子树过滤层级保持」属性测试
    - 安装 `fast-check` devDependency，创建 `tests/unit/` 目录与 `treeUtils.spec.js`
    - **Property 3: 子树过滤层级保持** — 对任意树与任意节点，`extractSubtreeById` 结果中每个节点的父节点与过滤前一致
    - **Validates: Requirements 3.9**

  - [x] 1.3 编写「导航联动 viewType 匹配」属性测试
    - **Property 1: 导航联动 viewType 匹配** — 对任意 `navNode` 与 `treeViewType`，`resolveLinkedTree` 仅在 viewType 一致时返回子树，否则返回 `null`
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [x] 1.4 编写 `filterTreeByKeyword` 单元测试
    - 子串匹配（大小写不敏感）、祖先保留、空/纯空白恢复完整树、无匹配返回空
    - _Requirements: 2.1, 2.5, 2.6_

- [x] 2. 扩展 Vuex `bomTree` 模块的导航状态
  - [x] 2.1 新增导航相关 state / mutations / actions
    - state：`selectedNavNode`、`filteredSourceTreeData`、`filteredTargetTreeData`、`navSearchKeyword`
    - mutations：`SET_NAV_SELECTED`、`SET_FILTERED_SOURCE_TREE`、`SET_FILTERED_TARGET_TREE`、`SET_NAV_SEARCH_KEYWORD`
    - action `selectNavNode`：用 `resolveLinkedTree` 分别对 `sourceTreeData`（比较 `sourceViewType`）与 `targetTreeData`（比较 `viewType`）计算过滤树；命中则写入对应 `filtered*`，未命中保持原 `filtered*` 不变
    - action `setNavSearchKeyword`：保存关键字
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

  - [x] 2.2 编写导航 action/mutation 单元测试
    - `selectNavNode` 仅对 viewType 一致的一侧更新过滤树，不一致一侧保持不变；节点不存在时不报错
    - _Requirements: 3.1, 3.4, 3.7_

- [x] 3. 扩充 Mock BOM 数据并开启撤销成功路径（R10 / R9）
  - [x] 3.1 扩充 `src/mock/services/bom.js` 的 `buildTargetTree` / `buildSourceTree`
    - 原结构树与编辑区树各自层级深度 ≥4、节点总数 ≥100；每节点含 `partNumber`/`name`/`parentPartNumber`/`quantity`/`effectivity` 五个非空字段（根节点父件号可空）
    - 每个节点携带 `viewType`（原结构 `EBOM`，编辑区 `SBOM`/`PBOM`），供联动比较使用
    - 编辑区树至少各含一个 `rowState` 为 `Added`/`Modified`/`Deleted`/`Unchanged` 的节点；至少一个节点 `name` 长度 ≥40 字符
    - 提供包含 ≥1 条文本长度 ≥40 字符的 `operationHistory` 种子数据（时间含年月日时分）
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

  - [x] 3.2 调整 undo Mock 返回成功路径
    - 将 `/ebom/undo`、`/sbom/undo` 改为可返回 `{ success: true, restoredNode }`，以便演练 LIFO 撤销成功流程
    - _Requirements: 9.4_

- [x] 4. 检查点 - 地基层
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 新建 NavigationPanel 组件（搜索 + 导航树）
  - [x] 5.1 实现 `NavigationPanel.vue`
    - 上方内嵌搜索输入（最多 100 字符、300ms debounce、大小写不敏感），下方 `a-tree`
    - 数据来源于 store 的 source/target 树合并视图，每节点标注 `viewType`；调用 `filterTreeByKeyword` 过滤，高亮匹配文本片段，展开匹配节点祖先；提供加载态、加载失败提示与「暂无数据 / 无匹配结果」空状态
    - 清空关键字时恢复完整树并清除高亮
    - 节点点击：`emit('select', { id, viewType, subtree })` 并 `dispatch('bomTree/selectNavNode', node)`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1_

  - [x] 5.2 编写 NavigationPanel 搜索/高亮/空状态单元测试
    - debounce 过滤、匹配高亮、清空恢复完整树、无匹配空状态
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

- [x] 6. 改造 LeftTree（原结构树表）：整行点击选中 + 导航联动
  - [x] 6.1 移除 `rowSelection`，改为整行点击选中
    - 删除 radio `rowSelection`；通过 `customRow` 的 click 提交 `bomTree/SET_SOURCE_SELECTED` 并应用 `bom-row-selected` 高亮；保持最多单行选中，再次点击已选行保持不变
    - _Requirements: 4.1, 4.2, 4.4, 4.7_

  - [x] 6.2 接入导航联动（`sourceViewType === navNode.viewType`）
    - 监听 `selectedNavNode` / `filteredSourceTreeData`：类型一致时展示子树、展开下级、设为选中态并滚动至可见；类型不一致或节点不存在时保持当前展示/选中/滚动不变；叶子节点仅展示自身
    - _Requirements: 3.2, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 6.3 编写「行点击响应一致性」属性测试
    - **Property 2: 行点击响应一致性** — 对任意节点，行点击同步提交正确节点为选中且高亮收敛为单行（处理为同步、无 debounce）
    - **Validates: Requirements 4.2, 4.4**

- [x] 7. 改造 RightTree（编辑区树表）：整行点击 + 单行省略 + 导航联动
  - [x] 7.1 移除 `rowSelection`，整行点击选中且排除「操作」列
    - 删除 radio `rowSelection`；`customRow` click 提交 `bomTree/SET_TARGET_SELECTED`，点击「操作」列控件时不触发选中、不改变 `selectedTargetNode` 且菜单正常弹出；保持单行选中，再次点击已选行保持不变
    - _Requirements: 4.1, 4.3, 4.4, 4.6, 4.7_

  - [x] 7.2 数据列单行省略 + tooltip
    - 各数据列（不含操作列）`ellipsis` 单行省略、固定行高、与操作列行高一致；仅在文本被截断时通过 tooltip/title 展示完整文本
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.3 接入导航联动（`viewType === navNode.viewType`）
    - 监听 `selectedNavNode` / `filteredTargetTreeData`：逻辑同 6.2，比较字段为编辑区 `viewType`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 7.4 编写「操作列点击不改选中」单元测试
    - 点击操作菜单不改变 `selectedTargetNode`，菜单 action 正常触发
    - _Requirements: 4.6_

- [x] 8. 将 ConflictPanel 重构为上下分区 SidePanel
  - [x] 8.1 移除 `a-tabs`，改为上下分区布局
    - 变更历史区（上 ~50%）与冲突检测区（下 ~50%）始终同时可见、各自独立垂直滚动、各含空状态
    - 变更历史：按时间倒序（LIFO）、长文本自动换行完整展示（含无断点连续串强制换行）、展示操作类型标签与含年月日时分的时间
    - 撤销入口仅出现在栈顶记录；撤销进行中禁用入口；点击 `emit('undo')`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.6, 9.7, 9.8_

  - [x] 8.2 编写历史 LIFO 顺序与撤销入口门控单元测试
    - 倒序展示、仅栈顶含撤销入口、进行中禁用、无操作时无入口、空状态
    - _Requirements: 8.1, 9.1, 9.2, 9.6_

- [x] 9. 检查点 - 组件层
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. 在 index.vue 完成整体集成（布局 / 工具栏重构 / 撤销 / 接线）
  - [x] 10.1 引入 NavigationPanel 并搭建四栏布局
    - 按「导航栏 → 原结构树表 → 编辑区树表 → 侧边栏」横向排列，不换行、互不重叠，宽度不足时容器横向滚动；侧边栏切换 300ms、默认显示、隐藏时归还横向空间；两表对应公共列宽对齐（沿用 `commonColumns`），各自独立展开/折叠
    - _Requirements: 1.1, 7.6, 7.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 10.2 重构按钮移入工具栏并移除 TransformBar
    - 工具栏渲染重构按钮，`:disabled="!canTransform"`，禁用时展示缺失项引导提示，满足时可点击并携源/目标父节点发起 `onTransform`；移除模板中的 `bom-transform-bar` 并删除 `TransformBar.vue`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 10.3 接线「从变更历史撤销」（LIFO + 30s 超时）
    - 监听 SidePanel `undo` 事件 → 调用 `service().undoOperation(changeContextId, lastOperation.operationId)`，请求设 30s 超时；成功则 `replaceNode(restoredNode)` 并 `POP_OPERATION`，失败/超时显示错误提示且历史与编辑区不变；请求期间禁用入口防重复提交
    - _Requirements: 9.3, 9.4, 9.5, 9.7, 9.8_

  - [x] 10.4 编写「撤销操作幂等性」属性测试
    - **Property 4: 撤销操作幂等性** — 对任意有效撤销，应用恢复节点一次与两次得到相同的编辑区树（`replaceNode` 幂等）
    - **Validates: Requirements 9.4**

  - [x] 10.5 编写「导航点击 → 双树联动」集成测试
    - 以扩充后的 Mock 数据挂载编辑器，导航点击后类型一致两侧过滤展示对应子树，类型不一致一侧保持不变
    - _Requirements: 3.2, 3.3, 3.4_

- [x] 11. 最终检查点
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 带 `*` 的子任务为可选测试任务，可为快速 MVP 跳过；核心实现子任务不可跳过。
- 每个任务标注其覆盖的具体需求条款（细化到子条款）以保证可追溯。
- 检查点用于增量验证，确保每个阶段测试通过。
- 属性测试验证设计文档中的通用正确性属性（P1–P4），单元/集成测试验证具体示例与边界。
- 首次运行属性测试前需安装 `fast-check`（见任务 1.2）。
- 同一文件的多处改造被刻意拆分到不同任务/不同执行波次，避免并行冲突（如 `index.vue` 的 10.1→10.2→10.3、`RightTree.vue` 的 7.1→7.2→7.3、`bom.js` 的 3.1→3.2）。

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["2.1", "3.2", "1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["5.1", "6.1", "7.1", "8.1", "2.2"] },
    { "id": 3, "tasks": ["5.2", "6.2", "7.2", "8.2"] },
    { "id": 4, "tasks": ["6.3", "7.3"] },
    { "id": 5, "tasks": ["7.4", "10.1"] },
    { "id": 6, "tasks": ["10.2"] },
    { "id": 7, "tasks": ["10.3"] },
    { "id": 8, "tasks": ["10.4", "10.5"] }
  ]
}
```
