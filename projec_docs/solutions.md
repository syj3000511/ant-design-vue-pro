# 解决方案记录

## 问题：如何确保 pnpm-lock.yaml 中的组件版本不改变？

### 解决方案
为了确保 `pnpm-lock.yaml` 的稳定性，建议采取以下措施：

1. **执行冻结安装**：
   使用 `pnpm install --frozen-lockfile`。此命令在发现 lockfile 需要更新时会报错退出，而不是自动修改文件。这是生产环境和 CI 流程的标配。

2. **锁定版本号**：
   在 `package.json` 中，将依赖项的版本前缀（如 `^` 或 `~`）去除，使用固定版本号（Exact Version）。例如将 `"ant-design-vue": "^1.7.8"` 改为 `"ant-design-vue": "1.7.8"`。

3. **配置项目属性**：
   在项目根目录的 `.npmrc` 文件中添加 `frozen-lockfile=true`，使所有安装操作默认处于冻结模式。

4. **避免风险操作**：
   - 严禁运行 `pnpm update`。
   - 慎用 `pnpm audit --fix`，因为它会尝试通过升级版本来修复漏洞。

5. **环境一致性**：
   确保团队成员使用相同大版本的 `pnpm` 客户端，避免因算法微调导致的 lockfile 结构变化。建议在 `package.json` 的 `engines` 字段中声明 `pnpm` 版本。
