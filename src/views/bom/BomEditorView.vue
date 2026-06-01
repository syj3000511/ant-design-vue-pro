<template>
  <page-header-wrapper>
    <a-card :bordered="false">
      <div class="bom-view-switch">
        <span>视图类型：</span>
        <a-radio-group v-model="viewType" button-style="solid">
          <a-radio-button value="EBOM">EBOM</a-radio-button>
          <a-radio-button value="SBOM">SBOM</a-radio-button>
        </a-radio-group>
      </div>
      <bom-editor :key="viewType" :view-type="viewType" />
    </a-card>
  </page-header-wrapper>
</template>

<script>
import BomEditor from '@/components/BomEditor'

export default {
  name: 'BomEditorView',
  components: { BomEditor },
  data () {
    return {
      viewType: 'SBOM'
    }
  }
}
</script>

<style lang="less" scoped>
.bom-view-switch {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}
</style>
