// Jest 配置(@vue/cli-plugin-unit-jest + @vue/test-utils,Vue 2.7 + jest 27)。
//
// 注意:历史配置直接引用了裸包名 `vue-jest`,但该包在本仓库(pnpm)中从未安装,
// 导致 `npm run test:unit` 在启动阶段即报错。本仓库对应的 SFC 转换器应为
// `@vue/vue2-jest`。此处对 `.vue` 转换器做按需解析:
//   - 已安装 `@vue/vue2-jest` 时启用(供组件测试使用);
//   - 未安装时不声明该转换器,使纯 JS 测试(如属性测试)仍可正常运行。
// 这样既保证测试基础设施可用,又不强制为纯逻辑测试引入额外依赖。

const transform = {
  '.+\\.(css|styl|less|sass|scss|svg|png|jpg|ttf|woff|woff2)$': require.resolve('jest-transform-stub'),
  '^.+\\.jsx?$': require.resolve('babel-jest')
}

try {
  // 本栈(Vue 2.x)对应的 SFC 转换器
  transform['^.+\\.vue$'] = require.resolve('@vue/vue2-jest')
} catch (e) {
  // `@vue/vue2-jest` 未安装:纯 JS 测试无需 `.vue` 转换器,跳过即可。
}

module.exports = {
  testEnvironment: 'jsdom',
  moduleFileExtensions: [
    'js',
    'jsx',
    'json',
    'vue'
  ],
  transform,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testMatch: [
    '**/tests/unit/**/*.spec.(js|jsx|ts|tsx)',
    '**/__tests__/*.(js|jsx|ts|tsx)'
  ],
  testURL: 'http://localhost/'
}
