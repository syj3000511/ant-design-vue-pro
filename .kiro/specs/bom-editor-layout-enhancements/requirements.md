# Requirements Document

## Introduction

本特性是对现有 BOM 编辑器（`src/components/BomEditor/`）的增强，而非全新功能。现有编辑器采用「左右独立双树」布局：左侧为「原结构」只读树表（`LeftTree.vue`），右侧为「编辑区」可编辑树表（`RightTree.vue`），两侧通过 `a-table` 的 `rowSelection`（radio 单选框）选中节点，选中状态写入 Vuex（`bomTree.selectedSourceNode` / `bomTree.selectedTargetNode`）；底部为「重构」按钮（`TransformBar.vue`）；右侧侧边栏 `ConflictPanel.vue` 使用 `a-tabs` 在「冲突提示」与「变更历史」两个 Tab 间切换，撤销由顶部工具栏的「撤销」按钮调用服务端单步撤销（`undoOperation`）。

本次增强目标是优化整体布局与交互可用性，使其更适合「超长 BOM 树」的浏览、查询与联动操作。改造范围包括：在最左侧新增导航栏列（搜索 + 导航树）、导航树节点点击联动两侧树表、将选中交互从 radio 改为整行点击、将「重构」按钮移至顶部工具栏、编辑区文字单行省略号显示、侧边栏改为上下分区（变更历史在上 / 冲突检测在下）、变更历史换行完整展示并支持按「最近优先」从列表撤销，以及扩充 Mock 数据以撑开页面用于演示。

### 技术栈约束

- 前端：Vue 2.6（Options API）、JavaScript（不使用 TypeScript）、Ant Design Vue 1.7.8、Vuex 3.6。
- 不引入 Vue 3、Pinia、TypeScript 或任何新的状态管理 / UI 框架。
- 需被多个组件读取的共享状态统一落在 Vuex（可被 Vue Devtools 追踪），一次性通知仍走事件总线。

### 关于「类型一致」的待澄清说明（重要）

需求点 2 中「原结构树表和编辑区树表的类型与被点击导航节点的类型一致」存在歧义，「类型」可能指：

- **（A）BOM 视图类型 `viewType`**：原结构树表对应 `sourceViewType`（如 EBOM），编辑区树表对应 `viewType`（如 SBOM），导航节点携带其所属 `viewType`。
- **（B）节点零件类型 `partType`**：取自节点 `attributes.partType`（如 EBOM 的 `A/B/C`、SBOM 的 `E/F/G`）。

本文档以**解释 A（BOM 视图类型 `viewType`）为默认假设**进行需求描述，并在需求 3 中以验收标准显式标注该假设。最终以哪个字段作为「类型」比较依据，需在设计阶段确认（见文末「假设与待确认问题」）。

## Glossary

- **BOM编辑器（BomEditor）**：承载导航栏、原结构树表、编辑区树表、工具栏与侧边栏的整体容器组件（`src/components/BomEditor/index.vue`）。
- **导航栏（NavigationPanel）**：本次新增的最左侧独立列，由上方的导航搜索区与下方的导航树组成。
- **导航搜索框（NavigationSearch）**：导航栏上方的查询输入区，用于按关键字过滤导航树节点。
- **导航树（NavigationTree）**：导航栏下方以树状图展示 BOM 结构的组件，供用户点击节点进行联动定位。
- **原结构树表（SourceTree）**：左侧已发布、只读的 BOM 树表（现 `LeftTree.vue`），其 BOM 视图类型记为 `sourceViewType`。
- **编辑区树表（EditTree）**：右侧当前变更上下文、可编辑的 BOM 树表（现 `RightTree.vue`），其 BOM 视图类型记为 `viewType`。
- **工具栏（Toolbar）**：BOM编辑器顶部的操作条，现含「重新加载」「撤销」「侧边栏」等按钮。
- **重构按钮（TransformButton）**：触发跨视图结构重构的按钮（现位于 `TransformBar.vue`，处于双树下方）。
- **侧边栏（SidePanel）**：右侧信息面板（现 `ConflictPanel.vue`），含变更历史与冲突检测两部分。
- **变更历史（ChangeHistory）**：记录本次会话写操作的列表，数据源为 Vuex `bomTree.operationHistory`。
- **冲突检测面板（ConflictPanel）**：展示服务端返回的未处理冲突列表，数据源为 Vuex `bomTree.conflicts`。
- **撤销操作（UndoOperation）**：调用服务端单步回退接口（`undoOperation`）以撤销最近一次写操作的能力。
- **Mock数据服务（MockDataService）**：为演示与布局撑开提供的、数据量较大的模拟 BOM 数据来源。
- **viewType**：BOM 视图类型标识，取值如 `EBOM`、`SBOM`、`PBOM`。
- **partType**：节点零件类型标识，取自节点 `attributes.partType`。
- **节点子树（NodeSubtree）**：某节点自身及其全部下级子节点构成的集合。

## Requirements

### Requirement 1: 最左侧新增导航栏列（搜索 + 导航树）

**User Story:** 作为 BOM 编辑人员，我希望在最左侧有一个独立的导航栏列（上方搜索、下方导航树），以便在超长 BOM 结构中快速查询并定位节点。

#### Acceptance Criteria

1. THE BOM编辑器 SHALL 在原结构树表左侧渲染一个始终可见的独立导航栏列，使整体布局按从左到右顺序排列为「导航栏 → 原结构树表 → 编辑区树表 → 侧边栏」四栏，且相邻栏之间互不重叠。
2. THE 导航栏 SHALL 在上方区域渲染导航搜索框（单行文本输入，最多接受 100 个字符），在下方区域渲染导航树。
3. WHEN BOM编辑器完成树数据加载，THE 导航树 SHALL 以树状结构展示该 BOM 的层级节点。
4. WHEN 用户点击导航树节点的展开/折叠控件，THE 导航树 SHALL 相应展开或折叠该节点的直接子节点。
5. IF 导航树无可展示的节点数据，THEN THE 导航树 SHALL 展示空状态提示（如「暂无数据」）。
6. WHILE 导航树数据处于加载中，THE 导航栏 SHALL 展示加载态指示。
7. IF 导航树数据加载失败，THEN THE 导航栏 SHALL 展示加载失败提示以指示数据未能加载，且不渲染残缺的树结构。
8. THE 导航树 SHALL 以 `publishedTreeData`（已发布最新版完整 BOM 树）作为唯一首选数据来源，该数据集与左侧「原结构树表」展示的局部工作集（`sourceTreeData`）是两个独立的数据集，导航树不得将局部工作集作为等价替代展示。
9. IF `publishedTreeData` 不可用（为空数组或未从服务端返回），THEN THE 导航栏 SHALL 展示明确的加载失败提示（如「已发布完整结构暂不可用，请重试」），且不静默回退到 `sourceTreeData` 或 `targetTreeData`（局部工作集），以避免用户将局部树误认为完整已发布结构。
10. THE 导航栏标题 SHALL 显示「查询 · 已发布完整结构」，与左侧「原结构」树表的标题在文字上明显不同，使用户能够直观区分「完整已发布结构（导航栏）」与「局部工作集（原结构树表）」两个不同的数据视图。

### Requirement 2: 导航树搜索与高亮

**User Story:** 作为 BOM 编辑人员，我希望在导航搜索框输入关键字时导航树能过滤并高亮匹配节点，以便在长树中快速找到目标。

#### Acceptance Criteria

1. WHEN 用户在导航搜索框输入关键字并停止输入达 300 毫秒，THE 导航树 SHALL 在 1 秒内展示件号或名称（去除首尾空白后）以子串方式包含该关键字的节点，并展开其各级祖先节点以保证匹配节点可见。
2. WHEN 导航树展示匹配结果，THE 导航树 SHALL 对匹配节点件号与名称中所有与关键字一致的文本片段进行高亮显示。
3. WHEN 用户清空导航搜索框，THE 导航树 SHALL 在 1 秒内恢复展示完整的 BOM 树，并清除全部高亮。
4. IF 关键字（去除首尾空白后）在导航树中无任何匹配节点，THEN THE 导航树 SHALL 展示「无匹配结果」的空状态提示，并保留用户已输入的关键字。
5. THE 导航搜索框 SHALL 对关键字进行大小写不敏感的子串匹配。
6. IF 用户输入的关键字为空或仅由空白字符组成，THEN THE 导航树 SHALL 等同于清空处理，恢复展示完整的 BOM 树。
7. THE 导航搜索框 SHALL 将关键字最大长度限制为 100 个字符。

### Requirement 3: 点击导航树节点联动定位两侧树表

**User Story:** 作为 BOM 编辑人员，我希望点击导航树节点后，类型一致的原结构树表与编辑区树表能定位并展示该节点及其下级子树，以便在两侧快速对照同一子结构。

#### Acceptance Criteria

1. WHEN 用户点击导航树上的某个节点，THE 导航树 SHALL 将该节点的唯一标识与 `viewType` 设置为当前导航选中节点，并提交到 Vuex 共享状态（供原结构树表与编辑区树表读取）。
2. WHERE 原结构树表的 `viewType`（即 `sourceViewType`）与被点击导航节点的 `viewType` 一致，WHEN 用户点击导航树节点，THE 原结构树表 SHALL 过滤展示该被点击节点对应的节点子树（该节点自身及其全部下级子节点），将该节点设为选中态，并滚动至该节点可见区域。
3. WHERE 编辑区树表的 `viewType` 与被点击导航节点的 `viewType` 一致，WHEN 用户点击导航树节点，THE 编辑区树表 SHALL 过滤展示该被点击节点对应的节点子树（该节点自身及其全部下级子节点），将该节点设为选中态，并滚动至该节点可见区域。
4. WHERE 某一侧树表的 `viewType` 与被点击导航节点的 `viewType` 不一致，WHEN 用户点击导航树节点，THE 对应树表 SHALL 保持其当前展示内容、选中态与滚动位置均不变。
5. WHEN 某一侧类型一致的树表因导航联动被定位到节点子树，THE 对应树表 SHALL 展开该子树以使其下级节点可见。
6. WHERE 被点击导航节点在某一侧类型一致的树表中为叶子节点，WHEN 用户点击该节点，THE 对应树表 SHALL 仅展示该节点自身且不展开任何下级。
7. IF 被点击导航节点在某一侧类型一致的树表中不存在对应节点，THEN THE 对应树表 SHALL 保持当前展示内容、选中态与滚动位置不变，且不抛出异常或错误提示。
8. WHEN 用户点击导航树节点，THE 联动响应 SHALL 在 1 秒内完成对类型一致树表的子树定位展示。
9. THE 导航联动产生的子树过滤 SHALL 保持原节点间的父子层级关系不变（过滤结果中任一节点的父节点在过滤前后保持一致）。
10. （假设标注）THE BOM编辑器 SHALL 以 `viewType`（BOM 视图类型）作为「类型一致」的默认比较依据；若设计阶段确认应改为 `partType`（节点零件类型），则按确认结果调整比较字段。

### Requirement 4: 整行点击选中（移除 radio 单选框）

**User Story:** 作为 BOM 编辑人员，我希望直接点击表格行即可选中节点，而不必点击 radio 单选框，以便减少操作步骤。

#### Acceptance Criteria

1. THE BOM编辑器 SHALL 移除原结构树表与编辑区树表中 `a-table` 的 radio 类型 `rowSelection`，使两张表均不再渲染单选框列。
2. WHEN 用户点击原结构树表的某一行，THE 原结构树表 SHALL 在 100 毫秒内将该行对应节点提交为 Vuex 中的 `selectedSourceNode`，并对该行应用与未选中行在视觉上可明显区分的选中高亮样式。
3. WHEN 用户点击编辑区树表某一行的非「操作」列区域，THE 编辑区树表 SHALL 在 100 毫秒内将该行对应节点提交为 Vuex 中的 `selectedTargetNode`，并对该行应用与未选中行在视觉上可明显区分的选中高亮样式。
4. WHEN 单次行点击处理完成，THE 原结构树表与编辑区树表 SHALL 各自最多保留 1 行处于选中高亮状态（即最后一次点击的行）。
5. WHILE 多次点击间隔小于 100 毫秒且仍在按顺序逐次处理中，THE 原结构树表与编辑区树表 MAY 临时呈现多行高亮，并 SHALL 在最后一次点击处理完成后 100 毫秒内收敛为单行高亮。
6. WHEN 用户点击编辑区树表行内「操作」列的菜单控件，THE 编辑区树表 SHALL 触发对应操作菜单，且不因行点击选中而阻断该操作、不改变 `selectedTargetNode`。
7. WHEN 用户再次点击当前已选中的行，THE 对应树表 SHALL 保持该行的选中态不变。

### Requirement 5: 将「重构」按钮移至顶部工具栏

**User Story:** 作为 BOM 编辑人员，由于 BOM 树很长，我希望「重构」按钮固定在上方工具栏，而不在树表下方，以便无需滚动到底部即可发起重构。

#### Acceptance Criteria

1. THE BOM编辑器 SHALL 在顶部工具栏渲染重构按钮，使其无需滚动页面即始终可见。
2. THE BOM编辑器 SHALL 移除双树下方的独立重构操作栏，使树表下方不再渲染任何重构入口。
3. WHILE 不满足 `canTransform`（即原结构树表未选中源节点，或编辑区树表未选中目标父节点），THE 重构按钮 SHALL 处于禁用状态且不响应点击。
4. WHILE 满足 `canTransform`（即原结构树表已选中源节点且编辑区树表已选中目标父节点），THE 重构按钮 SHALL 处于可点击状态。
5. WHEN 原结构树表或编辑区树表的选中状态发生变化，THE 重构按钮 SHALL 据此重新计算并更新其启用/禁用状态。
6. WHEN 用户在重构按钮处于可点击状态时点击它，THE BOM编辑器 SHALL 携带已选中的源节点与目标父节点发起重构请求。
7. WHILE 重构按钮处于禁用状态，THE 工具栏 SHALL 展示指明当前缺失项（缺少源节点或缺少目标父节点）的引导提示文案。

### Requirement 6: 编辑区文字单行省略显示

**User Story:** 作为 BOM 编辑人员，我希望编辑区单元格文字不换行，以便操作按钮与前方内容保持相同行高、视觉整齐。

#### Acceptance Criteria

1. THE 编辑区树表 SHALL 将各数据列（不含「操作」列控件）的单元格文本以单行展示，不允许换行。
2. WHEN 单元格文本渲染宽度超出其列宽，THE 编辑区树表 SHALL 在文本末尾以省略号（`…`）截断超出部分，且不产生单元格内横向滚动条。
3. THE 编辑区树表 SHALL 使每一数据行的行高等于单行文本行高，且不随单元格内容长度或是否被省略号截断而变化。
4. THE 编辑区树表 SHALL 使同一行内各数据单元格与「操作」列控件保持一致的行高。
5. WHERE 某单元格文本被省略号截断，WHEN 用户悬停在该单元格上，THE 编辑区树表 SHALL 通过提示（如 tooltip 或原生 title）展示该单元格未经截断的完整文本。
6. WHERE 某单元格文本未被省略号截断，THE 编辑区树表 SHALL 不为该单元格展示完整文本提示。

### Requirement 7: 侧边栏改为上下分区布局（变更历史在上 / 冲突检测在下）

**User Story:** 作为 BOM 编辑人员，我希望侧边栏将变更历史放在上方、冲突检测放在下方，以同时看到两者，而不必在 Tab 间切换。

#### Acceptance Criteria

1. WHILE 侧边栏处于显示状态，THE 侧边栏 SHALL 以垂直堆叠方式同时展示变更历史与冲突检测两个区域，二者始终同时可见且互不遮挡，取代现有的 `a-tabs` 切换布局。
2. THE 侧边栏 SHALL 将变更历史置于上方区域，默认占据侧边栏约 50% 高度。
3. THE 侧边栏 SHALL 将冲突检测面板置于下方区域，默认占据侧边栏约 50% 高度。
4. IF 变更历史无任何记录，THEN THE 变更历史 SHALL 在其区域内展示空状态提示，并保持该区域可见、不折叠。
5. IF 冲突检测面板无任何未处理冲突，THEN THE 冲突检测面板 SHALL 在其区域内展示空状态提示，并保持该区域可见、不折叠。
6. WHEN 用户在工具栏切换侧边栏的显示状态，THE BOM编辑器 SHALL 在 300 毫秒内同步显示或隐藏整个侧边栏；隐藏时其横向空间归还主编辑区。
7. WHILE 某一区域内容高度超出其分配高度，THE 对应区域 SHALL 提供独立的垂直滚动，且不影响另一区域的展示。
8. WHEN BOM编辑器初始加载完成，THE 侧边栏 SHALL 默认处于显示状态。

### Requirement 8: 变更历史换行完整展示

**User Story:** 作为 BOM 编辑人员，我希望变更历史中的较长文本能换行完整展示，而不被截断，以便看清每条变更的完整说明。

#### Acceptance Criteria

1. THE 变更历史 SHALL 将每条记录的文本完整展示，使其全部字符可见，不以省略号或裁剪方式截断任何内容。
2. WHEN 单条变更记录文本的渲染宽度超出其展示区域的可用宽度，THE 变更历史 SHALL 通过自动换行将超出部分折行至下一行，直至该记录全部字符可见（以全部字符可见为满足条件，而非仅触发换行动作）。
3. IF 单条变更记录包含超出可用宽度且无自然断行点的连续字符串，THEN THE 变更历史 SHALL 在字符间强制换行以保证全部字符可见，且不产生横向滚动溢出或内容裁剪。
4. THE 变更历史 SHALL 为每条记录展示其操作类型标签。
5. THE 变更历史 SHALL 为每条记录展示其发生时间，且时间值包含年、月、日及时、分。

### Requirement 9: 从变更历史按「最近优先」撤销

**User Story:** 作为 BOM 编辑人员，我希望能从变更历史列表触发撤销，且按最近发生的操作优先撤销，以便安全地逐步回退最新改动。

#### Acceptance Criteria

1. THE 变更历史 SHALL 按操作发生时间倒序展示操作记录，使最近一次操作位于列表顶部。
2. WHERE 某条历史记录为 `operationHistory` 中最近一次（栈顶）操作，THE 变更历史 SHALL 仅在该记录上提供撤销触发入口，而不在其他历史记录上提供该入口。
3. WHEN 用户从变更历史触发撤销，THE BOM编辑器 SHALL 调用服务端单步撤销接口（`undoOperation`），传入 `changeContextId` 与最近一次操作的 `operationId`，并对该请求设置不超过 30 秒的超时时间。
4. WHEN 服务端在超时时间内撤销成功并返回恢复后的节点，THE BOM编辑器 SHALL 用恢复后的节点更新编辑区树表，并从 `operationHistory` 移除该最近一次操作（后进先出 / LIFO）。
5. IF 服务端返回撤销失败（如该操作已被后续变更依赖），或在 30 秒超时时间内未返回有效响应，THEN THE BOM编辑器 SHALL 展示指明失败原因的错误提示，且保持 `operationHistory` 与编辑区树表均不变。
6. IF `operationHistory` 中当前无任何可撤销的操作，THEN THE 变更历史 SHALL 不提供撤销触发入口。
7. WHILE 一次撤销请求处于进行中，THE 变更历史 SHALL 禁用撤销触发入口以防止重复提交。
8. WHEN 一次撤销请求结束（无论成功、失败或超时），THE 变更历史 SHALL 重新启用撤销触发入口。

### Requirement 10: 扩充 Mock 数据以撑开页面

**User Story:** 作为演示与联调人员，我希望提供数据量较大的 Mock BOM 数据，以便展示超长树的滚动、查询、联动等场景并撑开页面布局。

#### Acceptance Criteria

1. THE Mock数据服务 SHALL 为原结构树表与编辑区树表各自提供层级深度不少于 4 层、节点总数各不少于 100 个的 BOM 树数据。
2. THE Mock数据服务 SHALL 同时提供原结构树表（`sourceTreeData`）与编辑区树表（`treeData`）两份树数据。
3. THE Mock数据服务提供的每个节点 SHALL 包含件号（`partNumber`）、名称（`name`）、父件号（`parentPartNumber`）、单装数量（`quantity`）、架次有效性（`effectivity`）五个字段，其中父件号对根节点可为空、对非根节点均为非空值，其余字段均为非空值。
4. THE Mock数据服务提供的编辑区树表数据 SHALL 至少各包含一个行状态（`rowState`）为 `Added`、`Modified`、`Deleted`、`Unchanged` 的节点，以展示四种比对样式。
5. WHILE 树表的数据行数超出其固定高度可视区域所能容纳的行数，THE 原结构树表与编辑区树表 SHALL 在保持表头固定的前提下提供垂直滚动，使全部数据行均可通过滚动访问。
6. THE Mock数据服务 SHALL 使编辑区树表中至少一个节点的「名称」字段文本长度不少于 40 个字符，以使其渲染宽度超过名称列列宽并触发需求 6 的单行省略（`…`）展示。
7. THE Mock数据服务 SHALL 提供至少一条文本长度不少于 40 个字符的变更历史记录（`operationHistory`），以触发并验证需求 8 的变更历史自动换行完整展示。
8. THE Mock数据服务 SHALL 确保 `publishedTreeData` 的节点总数比 `sourceTreeData` 多至少 10 个节点，以直观体现「完整已发布结构（导航栏）」与「局部工作集（原结构树表）」之间的数据差异，使演示时两者的区别一目了然。

### Requirement 11: 整体布局协调与可用性增强（受控范围）

**User Story:** 作为 BOM 编辑人员，我希望多栏布局整体协调、各区域宽高合理，以便页面易于操作和理解。

#### Acceptance Criteria

1. THE BOM编辑器 SHALL 使导航栏、原结构树表、编辑区树表、侧边栏按从左到右固定顺序在同一行内横向排列，各栏宽度之和不超过容器可用宽度，且相邻栏之间互不重叠、互不遮挡。
2. THE 原结构树表与编辑区树表 SHALL 对每一对应的公共列采用相等列宽（沿用 `columns.js` 的 `commonColumns`），使两表对应列的左右边界对齐。
3. WHILE 任一树表数据处于加载中，THE 对应树表 SHALL 展示加载态指示；WHEN 该树表数据加载完成，THE 对应树表 SHALL 移除该加载态指示。
4. WHEN 用户在某一棵树上展开或折叠节点，THE 另一棵树的展开/折叠状态 SHALL 保持不变。
5. WHEN 浏览器视口宽度变化，THE BOM编辑器 SHALL 保持各栏的排列顺序与相对位置不变，使各栏内容在其分配区域内以滚动方式访问，且不发生挤压、遮挡或溢出破坏整体布局。
6. IF 浏览器视口宽度小于各栏组合所需的最小总宽度，THEN THE BOM编辑器 SHALL 由容器提供横向滚动，并保持各栏互不重叠。

## 假设与待确认问题（Assumptions & Open Questions）

1. **「类型一致」的比较字段（需求 3）**：默认以 BOM 视图类型 `viewType`（EBOM/SBOM/PBOM）作为比较依据；备选为节点零件类型 `partType`（`attributes.partType`）。需设计阶段确认。
2. **导航树的数据来源**：假设导航树的数据来源于已加载的 BOM 上下文（`sourceTreeData` 与 / 或 `treeData`），且每个导航节点携带其 `viewType` 以支持需求 3 的类型匹配。具体取自哪一侧或为合并视图，需设计阶段确认。
3. **联动「展示子树」的实现方式**：「展示该被点击节点（含其级以下子节点）」假设为在对应树表中定位 + 过滤展示该子树（保留层级），而非新开弹窗或新页面。若期望为「滚动定位并高亮」而不过滤，需设计阶段确认。
4. **撤销的导航联动状态**：撤销成功后是否需要同步刷新导航树与当前导航选中节点，需设计阶段确认（默认不强制刷新导航选中）。
5. **Mock 数据接入方式**：假设通过现有 `services/bom/*` 或前端 mock 层提供，不改动既有 HTTP 接口约定（响应拦截器已 `return response.data`，业务数据从 `result` 取）。具体接入点需设计阶段确认。
